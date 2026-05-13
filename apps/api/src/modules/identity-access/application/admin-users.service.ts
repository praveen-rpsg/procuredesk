import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../domain/authenticated-user.js";
import { PasswordPolicyRepository } from "../infrastructure/password-policy.repository.js";
import { RoleRepository } from "../infrastructure/role.repository.js";
import {
  UserRepository,
  type AssignableOwnerListItem,
  type UserListItem,
} from "../infrastructure/user.repository.js";
import { PasswordService } from "./password.service.js";

const ADMINISTRATION_ROLE_CODES = ["administration_manager", "tenant_admin"];
const GROUP_ACCESS_ROLE_CODES = [
  "administration_manager",
  "group_manager",
  "platform_super_admin",
  "group_viewer",
  "report_viewer",
  "tenant_admin",
];
const TENANT_WIDE_PERMISSION_CODES = [
  "admin.console.access",
  "case.delay.manage.all",
  "case.read.all",
  "case.update.all",
  "role.manage",
  "system.config.manage",
  "tenant.manage",
  "user.manage",
  "user.read.all",
];
const ENTITY_SCOPED_PERMISSION_CODES = [
  "case.delay.manage.entity",
  "case.read.entity",
  "case.update.entity",
  "planning.manage",
  "user.read.entity",
];

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly passwordPolicies: PasswordPolicyRepository,
    private readonly passwords: PasswordService,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditWriterService,
  ) {}

  async listUsers(actor: AuthenticatedUser): Promise<UserListItem[]> {
    const tenantId = this.requireTenant(actor);
    const users = await this.users.listTenantUsers(tenantId);
    if (
      actor.isPlatformSuperAdmin ||
      hasExpandedPermission(actor, "user.read.all") ||
      (hasExpandedPermission(actor, "admin.console.access") &&
        hasExpandedPermission(actor, "user.read"))
    ) {
      return users;
    }
    if (!hasExpandedPermission(actor, "user.read.entity")) {
      return [];
    }
    const actorEntityIds = new Set(actor.entityIds);
    return users.filter((user) =>
      user.entityIds.some((entityId) => actorEntityIds.has(entityId)),
    );
  }

  listAssignableOwners(
    actor: AuthenticatedUser,
    entityId: string,
  ): Promise<AssignableOwnerListItem[]> {
    const tenantId = this.requireTenant(actor);
    const canChooseAcrossOwners =
      actor.isPlatformSuperAdmin ||
      actor.accessLevel === "GROUP" ||
      hasExpandedPermission(actor, "case.update.all") ||
      (actor.accessLevel === "ENTITY" && actor.entityIds.includes(entityId));
    if (!canChooseAcrossOwners && !actor.entityIds.includes(entityId)) {
      throw new ForbiddenException("Entity access denied.");
    }
    return this.users.listAssignableOwners({
      entityId,
      tenantId,
      userIds: canChooseAcrossOwners ? undefined : [actor.id],
    });
  }

  async createPendingUser(
    actor: AuthenticatedUser,
    input: {
      email: string;
      entityIds?: string[] | undefined;
      fullName: string;
      password?: string | undefined;
      roleIds?: string[] | undefined;
      status?: "active" | "inactive" | "pending_password_setup" | undefined;
      username: string;
      accessLevel: "ENTITY" | "GROUP" | "USER";
    },
  ): Promise<{ id: string }> {
    const tenantId = this.requireTenant(actor);
    const requestedStatus = input.status ?? "pending_password_setup";
    const password = input.password?.trim() ?? "";
    this.assertAccessLevelAllowed(input.accessLevel, input.entityIds ?? []);
    await this.assertRoleAssignmentAllowed(
      tenantId,
      input.roleIds ?? [],
      input.entityIds ?? [],
      input.accessLevel,
    );

    if (requestedStatus === "active" && !password) {
      throw new BadRequestException(
        "Password is required when creating an active user.",
      );
    }

    let passwordHash: string | null = null;
    if (password) {
      const policy = await this.passwordPolicies.findByTenantId(tenantId);
      const errors = this.passwords.validateAgainstPolicy(password, policy);
      if (errors.length) {
        throw new BadRequestException(
          `Password does not satisfy policy: ${errors.join(" ")}`,
        );
      }
      passwordHash = await this.passwords.hash(password);
    }

    const id = await this.db.transaction(async (client) => {
      const userId = await this.users.createPendingTenantUser(
        {
          tenantId,
          email: input.email,
          username: input.username,
          fullName: input.fullName,
          accessLevel: input.accessLevel,
          createdBy: actor.id,
        },
        client,
      );
      await this.roles.replaceUserRoles(
        {
          tenantId,
          userId,
          roleIds: input.roleIds ?? [],
          assignedBy: actor.id,
        },
        client,
      );
      await this.users.replaceEntityScopes(
        {
          tenantId,
          userId,
          entityIds: input.entityIds ?? [],
          assignedBy: actor.id,
        },
        client,
      );
      if (passwordHash) {
        await this.users.setPassword(
          {
            passwordHash,
            tenantId,
            updatedBy: actor.id,
            userId,
          },
          client,
        );
      }
      if (requestedStatus !== "active") {
        await this.users.updateUserStatus(
          {
            tenantId,
            userId,
            status: requestedStatus,
            updatedBy: actor.id,
          },
          client,
        );
      }
      return userId;
    });
    await this.audit.write({
      action: "user.create",
      actorUserId: actor.id,
      details: {
        email: input.email,
        entityIds: input.entityIds ?? [],
        accessLevel: input.accessLevel,
        roleIds: input.roleIds ?? [],
        status: requestedStatus,
        username: input.username,
      },
      summary: `${actor.username} created user ${input.username}`,
      targetId: id,
      targetType: "User",
      tenantId,
    });
    return { id };
  }

  async updateProfile(
    actor: AuthenticatedUser,
    input: {
      email: string;
      fullName: string;
      userId: string;
      username: string;
    },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.users.updateTenantUserProfile({
      tenantId,
      email: input.email,
      fullName: input.fullName,
      updatedBy: actor.id,
      userId: input.userId,
      username: input.username,
    });
  }

  async updateStatus(
    actor: AuthenticatedUser,
    input: {
      userId: string;
      status: "active" | "inactive" | "locked" | "pending_password_setup";
    },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.assertNotRemovingLastTenantAdminByStatus(
      tenantId,
      input.userId,
      input.status,
    );
    await this.users.updateUserStatus({
      tenantId,
      userId: input.userId,
      status: input.status,
      updatedBy: actor.id,
    });
    await this.audit.write({
      action: "user.status.update",
      actorUserId: actor.id,
      details: { status: input.status },
      summary: `${actor.username} changed user status`,
      targetId: input.userId,
      targetType: "User",
      tenantId,
    });
  }

  async updateAccessLevel(
    actor: AuthenticatedUser,
    input: { accessLevel: "ENTITY" | "GROUP" | "USER"; userId: string },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    const before = await this.users.findTenantUserAccess({
      tenantId,
      userId: input.userId,
    });
    this.assertAccessLevelAllowed(input.accessLevel, before?.entityIds ?? []);
    await this.assertRoleAssignmentAllowed(
      tenantId,
      before?.roleIds ?? [],
      before?.entityIds ?? [],
      input.accessLevel,
    );
    await this.users.updateUserAccessLevel({
      tenantId,
      userId: input.userId,
      accessLevel: input.accessLevel,
      updatedBy: actor.id,
    });
    await this.audit.write({
      action: "user.access_level.update",
      actorUserId: actor.id,
      details: {
        afterAccessLevel: input.accessLevel,
        beforeAccessLevel: before?.accessLevel ?? null,
      },
      summary: `${actor.username} changed user access level`,
      targetId: input.userId,
      targetType: "User",
      tenantId,
    });
  }

  async replaceRoles(
    actor: AuthenticatedUser,
    input: { userId: string; roleIds: string[] },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "user.manage");
    this.requirePermission(actor, "role.manage");
    const before = await this.users.findTenantUserAccess({
      tenantId,
      userId: input.userId,
    });
    await this.assertRoleAssignmentAllowed(
      tenantId,
      input.roleIds,
      before?.entityIds ?? [],
      before?.accessLevel ?? "USER",
    );
    await this.assertNotRemovingLastTenantAdminByRoles(
      tenantId,
      input.userId,
      input.roleIds,
    );
    await this.roles.replaceUserRoles({
      tenantId,
      userId: input.userId,
      roleIds: input.roleIds,
      assignedBy: actor.id,
    });
    const afterCodes = await this.roles.listRoleCodesByIds({
      roleIds: input.roleIds,
      tenantId,
    });
    await this.audit.write({
      action: "user.roles.replace",
      actorUserId: actor.id,
      details: {
        afterRoleCodes: afterCodes,
        beforeRoleCodes: before?.roleCodes ?? [],
        roleIds: input.roleIds,
      },
      summary: `${actor.username} updated user roles`,
      targetId: input.userId,
      targetType: "User",
      tenantId,
    });
  }

  async replaceEntityScopes(
    actor: AuthenticatedUser,
    input: { userId: string; entityIds: string[] },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    const before = await this.users.findTenantUserAccess({
      tenantId,
      userId: input.userId,
    });
    this.assertAccessLevelAllowed(
      before?.accessLevel ?? "USER",
      input.entityIds,
    );
    await this.assertRoleAssignmentAllowed(
      tenantId,
      before?.roleIds ?? [],
      input.entityIds,
      before?.accessLevel ?? "USER",
    );
    await this.db.transaction(async (client) => {
      await this.users.replaceEntityScopes(
        {
          tenantId,
          userId: input.userId,
          entityIds: input.entityIds,
          assignedBy: actor.id,
        },
        client,
      );
    });
    await this.audit.write({
      action: "user.entity_scopes.replace",
      actorUserId: actor.id,
      details: {
        afterEntityIds: input.entityIds,
        beforeEntityIds: before?.entityIds ?? [],
      },
      summary: `${actor.username} updated user entity scope`,
      targetId: input.userId,
      targetType: "User",
      tenantId,
    });
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException(
        "Tenant-scoped operation requires a tenant.",
      );
    }
    if (actor.isPlatformSuperAdmin && !actor.tenantId) {
      throw new ForbiddenException(
        "Select a tenant context before managing tenant users.",
      );
    }
    return actor.tenantId;
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!hasExpandedPermission(actor, permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private async assertRoleAssignmentAllowed(
    tenantId: string,
    roleIds: string[],
    entityIds: string[],
    accessLevel: "ENTITY" | "GROUP" | "USER",
  ) {
    const uniqueRoleIds = Array.from(new Set(roleIds));
    if (uniqueRoleIds.length === 0) {
      throw new BadRequestException("At least one role is required.");
    }
    const validCount = await this.roles.countValidAssignableRoles({
      roleIds: uniqueRoleIds,
      tenantId,
    });
    if (validCount !== uniqueRoleIds.length) {
      throw new BadRequestException(
        "One or more roles are invalid or cannot be assigned.",
      );
    }
    const selectedRoles = await this.roles.listRolesByIds({
      roleIds: uniqueRoleIds,
      tenantId,
    });
    if (selectedRoles.some(roleNeedsEntityScope) && entityIds.length === 0) {
      throw new BadRequestException(
        "Select at least one entity for entity-scoped roles.",
      );
    }
    const requiredAccessLevels = Array.from(
      new Set(selectedRoles.map(requiredAccessLevelForRole).filter(Boolean)),
    );
    if (requiredAccessLevels.length > 1) {
      throw new BadRequestException(
        "Selected roles require different access levels.",
      );
    }
    const requiredAccessLevel = requiredAccessLevels[0];
    if (requiredAccessLevel && requiredAccessLevel !== accessLevel) {
      throw new BadRequestException(
        `${requiredAccessLevel} access is required for the selected roles.`,
      );
    }
  }

  private assertAccessLevelAllowed(
    accessLevel: "ENTITY" | "GROUP" | "USER",
    entityIds: string[],
  ) {
    if (accessLevel === "ENTITY" && entityIds.length === 0) {
      throw new BadRequestException(
        "Select at least one mapped entity for ENTITY access.",
      );
    }
  }

  private async assertNotRemovingLastTenantAdminByStatus(
    tenantId: string,
    userId: string,
    nextStatus: string,
  ) {
    if (nextStatus === "active") return;
    const user = await this.users.findTenantUserAccess({ tenantId, userId });
    if (
      !user ||
      user.status !== "active" ||
      !hasAdministrationRole(user.roleCodes)
    ) {
      return;
    }
    const activeAdminCount = await this.users.countActiveTenantAdmins(tenantId);
    if (activeAdminCount <= 1) {
      throw new BadRequestException(
        "At least one active tenant administrator is required.",
      );
    }
  }

  private async assertNotRemovingLastTenantAdminByRoles(
    tenantId: string,
    userId: string,
    nextRoleIds: string[],
  ) {
    const user = await this.users.findTenantUserAccess({ tenantId, userId });
    if (
      !user ||
      user.status !== "active" ||
      !hasAdministrationRole(user.roleCodes)
    ) {
      return;
    }
    const nextRoleCodes = await this.roles.listRoleCodesByIds({
      roleIds: nextRoleIds,
      tenantId,
    });
    if (hasAdministrationRole(nextRoleCodes)) return;
    const activeAdminCount = await this.users.countActiveTenantAdmins(tenantId);
    if (activeAdminCount <= 1) {
      throw new BadRequestException(
        "At least one active tenant administrator is required.",
      );
    }
  }
}

function roleNeedsEntityScope(role: { permissionCodes: string[] }) {
  if (
    role.permissionCodes.some((permission) =>
      TENANT_WIDE_PERMISSION_CODES.includes(permission),
    )
  ) {
    return false;
  }
  return role.permissionCodes.some((permission) =>
    [...ENTITY_SCOPED_PERMISSION_CODES, "case.create"].includes(permission),
  );
}

function requiredAccessLevelForRole(role: {
  code: string;
  permissionCodes: string[];
}): "ENTITY" | "GROUP" | "USER" | null {
  if (GROUP_ACCESS_ROLE_CODES.includes(role.code)) {
    return "GROUP";
  }
  if (role.code === "entity_manager") {
    return "ENTITY";
  }
  if (role.code === "tender_owner") {
    return "USER";
  }
  if (
    role.permissionCodes.some((permission) =>
      TENANT_WIDE_PERMISSION_CODES.includes(permission),
    )
  ) {
    return "GROUP";
  }
  if (
    role.permissionCodes.some((permission) =>
      ENTITY_SCOPED_PERMISSION_CODES.includes(permission),
    )
  ) {
    return "ENTITY";
  }
  if (
    role.permissionCodes.some((permission) =>
      ["case.create", "case.read.assigned", "case.update.assigned"].includes(
        permission,
      ),
    )
  ) {
    return "USER";
  }
  return null;
}

function hasAdministrationRole(roleCodes: string[]) {
  return roleCodes.some((code) => ADMINISTRATION_ROLE_CODES.includes(code));
}
