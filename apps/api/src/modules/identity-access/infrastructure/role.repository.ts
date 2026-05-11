import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type RoleListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  permissionCodes: string[];
  userCount: number;
};

export type RolePermissionInput = {
  permissionCodes: string[];
  roleId: string;
  tenantId: string;
};

@Injectable()
export class RoleRepository {
  constructor(private readonly db: DatabaseService) {}

  async listRoles(tenantId: string): Promise<RoleListItem[]> {
    const result = await this.db.query<
      QueryResultRow & {
        id: string;
        code: string;
        name: string;
        description: string | null;
        is_system_role: boolean;
        permission_codes: string[] | null;
        user_count: number;
      }
    >(
      `
        select r.id, r.code, r.name, r.description, r.is_system_role
        , coalesce(
            array_agg(distinct rp.permission_code::text) filter (where rp.permission_code is not null),
            array[]::text[]
          ) as permission_codes
        , count(distinct ur.user_id)::int as user_count
        from iam.roles r
        left join iam.role_permissions rp on rp.role_id = r.id
        left join iam.user_roles ur on ur.role_id = r.id
        where r.deleted_at is null
          and (r.tenant_id = $1 or r.tenant_id is null)
        group by r.id, r.code, r.name, r.description, r.is_system_role
        order by r.is_system_role desc, r.name asc
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isSystemRole: row.is_system_role,
      permissionCodes: row.permission_codes ?? [],
      userCount: Number(row.user_count ?? 0),
    }));
  }

  async findRoleForTenant(roleId: string, tenantId: string): Promise<RoleListItem | null> {
    const result = await this.db.one<
      QueryResultRow & {
        id: string;
        code: string;
        name: string;
        description: string | null;
        is_system_role: boolean;
        permission_codes: string[] | null;
        user_count: number;
      }
    >(
      `
        select
          r.id,
          r.code,
          r.name,
          r.description,
          r.is_system_role,
          coalesce(
            array_agg(distinct rp.permission_code::text) filter (where rp.permission_code is not null),
            array[]::text[]
          ) as permission_codes,
          count(distinct ur.user_id)::int as user_count
        from iam.roles r
        left join iam.role_permissions rp on rp.role_id = r.id
        left join iam.user_roles ur on ur.role_id = r.id
        where r.id = $1
          and r.deleted_at is null
          and (r.tenant_id = $2 or r.tenant_id is null)
        group by r.id
      `,
      [roleId, tenantId],
    );

    if (!result) return null;
    return {
      code: result.code,
      description: result.description,
      id: result.id,
      isSystemRole: result.is_system_role,
      name: result.name,
      permissionCodes: result.permission_codes ?? [],
      userCount: Number(result.user_count ?? 0),
    };
  }

  async createTenantRole(input: {
    code: string;
    description: string | null;
    name: string;
    permissionCodes: string[];
    tenantId: string;
  }): Promise<{ id: string }> {
    return this.db.transaction(async (client) => {
      const result = await this.db.one<QueryResultRow & { id: string }>(
        `
          insert into iam.roles (tenant_id, code, name, description, is_system_role)
          values ($1, $2, $3, $4, false)
          returning id
        `,
        [input.tenantId, input.code, input.name, input.description],
        client,
      );
      await this.replaceRolePermissions(
        { permissionCodes: input.permissionCodes, roleId: result?.id ?? "", tenantId: input.tenantId },
        client,
      );
      return { id: result?.id ?? "" };
    });
  }

  async updateRoleForTenant(input: {
    description: string | null;
    name: string;
    permissionCodes: string[];
    roleId: string;
    tenantId: string;
  }): Promise<boolean> {
    return this.db.transaction(async (client) => {
      const result = await this.db.query(
        `
          update iam.roles
          set name = $3,
              description = $4,
              updated_at = now()
          where id = $1
            and (tenant_id = $2 or tenant_id is null)
            and deleted_at is null
        `,
        [input.roleId, input.tenantId, input.name, input.description],
        client,
      );
      if ((result.rowCount ?? 0) === 0) return false;
      await this.replaceRolePermissions(input, client);
      return true;
    });
  }

  async deleteTenantRole(input: { roleId: string; tenantId: string }): Promise<boolean> {
    const result = await this.db.query(
      `
        update iam.roles
        set deleted_at = now(), updated_at = now()
        where id = $1
          and tenant_id = $2
          and is_system_role = false
          and deleted_at is null
          and not exists (
            select 1 from iam.user_roles ur where ur.role_id = iam.roles.id
          )
      `,
      [input.roleId, input.tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async replaceRolePermissions(
    input: RolePermissionInput,
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        delete from iam.role_permissions
        where role_id = $1
      `,
      [input.roleId],
      client,
    );

    if (input.permissionCodes.length === 0) return;

    await this.db.query(
      `
        insert into iam.role_permissions (role_id, permission_code)
        select $1, p.code
        from iam.permissions p
        where p.code = any($2::citext[])
        on conflict do nothing
      `,
      [input.roleId, input.permissionCodes],
      client,
    );
  }

  async countValidAssignableRoles(input: { roleIds: string[]; tenantId: string }): Promise<number> {
    if (input.roleIds.length === 0) return 0;
    const result = await this.db.one<QueryResultRow & { count: string }>(
      `
        select count(*)::text as count
        from iam.roles
        where id = any($1::uuid[])
          and deleted_at is null
          and code <> 'platform_super_admin'
          and (tenant_id = $2 or tenant_id is null)
      `,
      [input.roleIds, input.tenantId],
    );
    return Number(result?.count ?? 0);
  }

  async listRoleCodesByIds(input: { roleIds: string[]; tenantId: string }): Promise<string[]> {
    if (input.roleIds.length === 0) return [];
    const result = await this.db.query<QueryResultRow & { code: string }>(
      `
        select distinct code::text
        from iam.roles
        where id = any($1::uuid[])
          and deleted_at is null
          and (tenant_id = $2 or tenant_id is null)
        order by code
      `,
      [input.roleIds, input.tenantId],
    );
    return result.rows.map((row) => row.code);
  }

  async listRolesByIds(input: { roleIds: string[]; tenantId: string }): Promise<RoleListItem[]> {
    if (input.roleIds.length === 0) return [];
    const result = await this.db.query<
      QueryResultRow & {
        id: string;
        code: string;
        name: string;
        description: string | null;
        is_system_role: boolean;
        permission_codes: string[] | null;
        user_count: number;
      }
    >(
      `
        select
          r.id,
          r.code,
          r.name,
          r.description,
          r.is_system_role,
          coalesce(
            array_agg(distinct rp.permission_code::text) filter (where rp.permission_code is not null),
            array[]::text[]
          ) as permission_codes,
          count(distinct ur.user_id)::int as user_count
        from iam.roles r
        left join iam.role_permissions rp on rp.role_id = r.id
        left join iam.user_roles ur on ur.role_id = r.id
        where r.id = any($1::uuid[])
          and r.deleted_at is null
          and r.code <> 'platform_super_admin'
          and (r.tenant_id = $2 or r.tenant_id is null)
        group by r.id
        order by r.name
      `,
      [input.roleIds, input.tenantId],
    );
    return result.rows.map((row) => ({
      code: row.code,
      description: row.description,
      id: row.id,
      isSystemRole: row.is_system_role,
      name: row.name,
      permissionCodes: row.permission_codes ?? [],
      userCount: Number(row.user_count ?? 0),
    }));
  }

  async replaceUserRoles(
    input: { userId: string; tenantId: string; roleIds: string[]; assignedBy: string },
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        delete from iam.user_roles
        where user_id = $1
      `,
      [input.userId],
      client,
    );

    for (const roleId of input.roleIds) {
      await this.db.query(
        `
          insert into iam.user_roles (user_id, role_id, assigned_by)
          select $1, r.id, $3
          from iam.roles r
          where r.id = $2
            and r.deleted_at is null
            and (r.tenant_id = $4 or r.tenant_id is null)
          on conflict do nothing
        `,
        [input.userId, roleId, input.assignedBy, input.tenantId],
        client,
      );
    }
  }
}
