import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";

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

  listUsers(actor: AuthenticatedUser): Promise<UserListItem[]> {
    const tenantId = this.requireTenant(actor);
    return this.users.listTenantUsers(tenantId);
  }

  listAssignableOwners(
    actor: AuthenticatedUser,
    entityId: string,
  ): Promise<AssignableOwnerListItem[]> {
    const tenantId = this.requireTenant(actor);
    return this.users.listAssignableOwners({ entityId, tenantId });
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
    },
  ): Promise<{ id: string }> {
    const tenantId = this.requireTenant(actor);
    const requestedStatus = input.status ?? "pending_password_setup";
    const password = input.password?.trim() ?? "";
    await this.assertRoleAssignmentAllowed(tenantId, input.roleIds ?? [], input.entityIds ?? []);

    if (requestedStatus === "active" && !password) {
      throw new BadRequestException("Password is required when creating an active user.");
    }

    let passwordHash: string | null = null;
    if (password) {
      const policy = await this.passwordPolicies.findByTenantId(tenantId);
      const errors = this.passwords.validateAgainstPolicy(password, policy);
      if (errors.length) {
        throw new BadRequestException(`Password does not satisfy policy: ${errors.join(" ")}`);
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
    input: { email: string; fullName: string; userId: string; username: string },
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
    input: { userId: string; status: "active" | "inactive" | "locked" | "pending_password_setup" },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.assertNotRemovingLastTenantAdminByStatus(tenantId, input.userId, input.status);
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

  async replaceRoles(
    actor: AuthenticatedUser,
    input: { userId: string; roleIds: string[] },
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    const before = await this.users.findTenantUserAccess({ tenantId, userId: input.userId });
    await this.assertRoleAssignmentAllowed(tenantId, input.roleIds, before?.entityIds ?? []);
    await this.assertNotRemovingLastTenantAdminByRoles(tenantId, input.userId, input.roleIds);
    await this.roles.replaceUserRoles({
      tenantId,
      userId: input.userId,
      roleIds: input.roleIds,
      assignedBy: actor.id,
    });
    const afterCodes = await this.roles.listRoleCodesByIds({ roleIds: input.roleIds, tenantId });
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
    const before = await this.users.findTenantUserAccess({ tenantId, userId: input.userId });
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
      throw new BadRequestException("Tenant-scoped operation requires a tenant.");
    }
    if (actor.isPlatformSuperAdmin && !actor.tenantId) {
      throw new ForbiddenException("Select a tenant context before managing tenant users.");
    }
    return actor.tenantId;
  }

  private async assertRoleAssignmentAllowed(tenantId: string, roleIds: string[], entityIds: string[]) {
    const uniqueRoleIds = Array.from(new Set(roleIds));
    if (uniqueRoleIds.length === 0) {
      throw new BadRequestException("At least one role is required.");
    }
    const validCount = await this.roles.countValidAssignableRoles({ roleIds: uniqueRoleIds, tenantId });
    if (validCount !== uniqueRoleIds.length) {
      throw new BadRequestException("One or more roles are invalid or cannot be assigned.");
    }
    const selectedRoles = await this.roles.listRolesByIds({ roleIds: uniqueRoleIds, tenantId });
    if (selectedRoles.some(roleNeedsEntityScope) && entityIds.length === 0) {
      throw new BadRequestException("Select at least one entity for entity-scoped roles.");
    }
  }

  private async assertNotRemovingLastTenantAdminByStatus(
    tenantId: string,
    userId: string,
    nextStatus: string,
  ) {
    if (nextStatus === "active") return;
    const user = await this.users.findTenantUserAccess({ tenantId, userId });
    if (!user || user.status !== "active" || !user.roleCodes.includes("tenant_admin")) return;
    const activeAdminCount = await this.users.countActiveTenantAdmins(tenantId);
    if (activeAdminCount <= 1) {
      throw new BadRequestException("At least one active tenant administrator is required.");
    }
  }

  private async assertNotRemovingLastTenantAdminByRoles(
    tenantId: string,
    userId: string,
    nextRoleIds: string[],
  ) {
    const user = await this.users.findTenantUserAccess({ tenantId, userId });
    if (!user || user.status !== "active" || !user.roleCodes.includes("tenant_admin")) return;
    const nextRoleCodes = await this.roles.listRoleCodesByIds({ roleIds: nextRoleIds, tenantId });
    if (nextRoleCodes.includes("tenant_admin")) return;
    const activeAdminCount = await this.users.countActiveTenantAdmins(tenantId);
    if (activeAdminCount <= 1) {
      throw new BadRequestException("At least one active tenant administrator is required.");
    }
  }
}

function roleNeedsEntityScope(role: { permissionCodes: string[] }) {
  return role.permissionCodes.some((permission) =>
    [
      "case.create",
      "case.delay.manage.entity",
      "case.read.entity",
      "case.update.entity",
      "planning.manage",
    ].includes(permission),
  );
}
