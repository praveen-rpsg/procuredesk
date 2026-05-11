import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../domain/authenticated-user.js";
import { PermissionRepository } from "../infrastructure/permission.repository.js";
import { RoleRepository } from "../infrastructure/role.repository.js";

@Injectable()
export class AdminRolesService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionRepository,
    private readonly audit: AuditWriterService,
  ) {}

  listRoles(actor: AuthenticatedUser) {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return this.roles.listRoles(actor.tenantId);
  }

  listPermissions() {
    return this.permissions.listPermissions();
  }

  async createRole(
    actor: AuthenticatedUser,
    input: { code: string; description: string | null | undefined; name: string; permissionCodes: string[] },
  ) {
    const tenantId = this.requireTenant(actor);
    const permissionCodes = this.normalizePermissionCodes(input.permissionCodes);
    await this.assertPermissionsExist(permissionCodes);
    const result = await this.roles.createTenantRole({
      code: input.code,
      description: input.description?.trim() || null,
      name: input.name,
      permissionCodes,
      tenantId,
    });
    await this.audit.write({
      action: "role.create",
      actorUserId: actor.id,
      details: { code: input.code, permissionCodes },
      summary: `${actor.username} created role ${input.name}`,
      targetId: result.id,
      targetType: "Role",
      tenantId,
    });
    return result;
  }

  async updateRole(
    actor: AuthenticatedUser,
    input: { description: string | null | undefined; name: string; permissionCodes: string[]; roleId: string },
  ) {
    const tenantId = this.requireTenant(actor);
    const role = await this.roles.findRoleForTenant(input.roleId, tenantId);
    if (!role) throw new NotFoundException("Role not found.");
    const permissionCodes = this.normalizePermissionCodes(input.permissionCodes);
    await this.assertPermissionsExist(permissionCodes);
    const beforePermissionCodes = role.permissionCodes;
    const saved = await this.roles.updateRoleForTenant({
      description: input.description?.trim() || null,
      name: input.name,
      permissionCodes,
      roleId: input.roleId,
      tenantId,
    });
    if (!saved) throw new NotFoundException("Role not found.");
    await this.audit.write({
      action: "role.update",
      actorUserId: actor.id,
      details: {
        afterPermissionCodes: permissionCodes,
        beforePermissionCodes,
        code: role.code,
      },
      summary: `${actor.username} updated role ${input.name}`,
      targetId: input.roleId,
      targetType: "Role",
      tenantId,
    });
  }

  async deleteRole(actor: AuthenticatedUser, roleId: string) {
    const tenantId = this.requireTenant(actor);
    const role = await this.roles.findRoleForTenant(roleId, tenantId);
    if (!role) throw new NotFoundException("Role not found.");
    if (role.isSystemRole) {
      throw new ForbiddenException("System roles cannot be deleted.");
    }
    if (role.userCount > 0) {
      throw new ConflictException("Remove this role from users before deleting it.");
    }
    const deleted = await this.roles.deleteTenantRole({ roleId, tenantId });
    if (!deleted) throw new ConflictException("Role could not be deleted.");
    await this.audit.write({
      action: "role.delete",
      actorUserId: actor.id,
      details: { code: role.code, permissionCodes: role.permissionCodes },
      summary: `${actor.username} deleted role ${role.name}`,
      targetId: roleId,
      targetType: "Role",
      tenantId,
    });
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }

  private normalizePermissionCodes(permissionCodes: string[]) {
    return Array.from(new Set(permissionCodes.map((code) => code.trim()).filter(Boolean)));
  }

  private async assertPermissionsExist(permissionCodes: string[]) {
    const knownCount = await this.permissions.countKnownPermissions(permissionCodes);
    if (knownCount !== permissionCodes.length) {
      throw new BadRequestException("One or more permissions are invalid.");
    }
  }
}
