import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type LoginUserRecord = {
  id: string;
  tenantId: string | null;
  tenantCode: string | null;
  email: string;
  username: string;
  fullName: string;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  status: string;
  isPlatformSuperAdmin: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
};

export type UserListItem = {
  id: string;
  tenantId: string | null;
  email: string;
  username: string;
  fullName: string;
  status: string;
  isPlatformSuperAdmin: boolean;
  entityCodes: string[];
  entityIds: string[];
  entityNames: string[];
  roleCodes: string[];
  roleIds: string[];
  roleNames: string[];
  createdAt: string;
};

export type AssignableOwnerListItem = {
  email: string;
  fullName: string;
  id: string;
  username: string;
};

type LoginUserRow = QueryResultRow & {
  id: string;
  tenant_id: string | null;
  tenant_code: string | null;
  email: string;
  username: string;
  full_name: string;
  password_hash: string | null;
  password_changed_at: Date | null;
  status: string;
  is_platform_super_admin: boolean;
  failed_login_count: number;
  locked_until: Date | null;
};

@Injectable()
export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  async findForLogin(
    usernameOrEmail: string,
    tenantCode?: string,
  ): Promise<LoginUserRecord | null> {
    const row = await this.db.one<LoginUserRow>(
      `
        select
          u.id,
          u.tenant_id,
          t.code as tenant_code,
          u.email,
          u.username,
          u.full_name,
          u.password_hash,
          u.password_changed_at,
          u.status,
          u.is_platform_super_admin,
          u.failed_login_count,
          u.locked_until
        from iam.users u
        left join iam.tenants t on t.id = u.tenant_id
        where u.deleted_at is null
          and (
            (
              $2::text is not null
              and lower(t.code::text) = lower($2::text)
              and (lower(u.email::text) = lower($1::text) or lower(u.username::text) = lower($1::text))
            )
            or (
              $2::text is null
              and u.is_platform_super_admin = true
              and lower(u.email::text) = lower($1::text)
            )
          )
        limit 1
      `,
      [usernameOrEmail.toLowerCase(), tenantCode?.toLowerCase() ?? null],
    );

    return row ? this.mapLoginUser(row) : null;
  }

  async listTenantUsers(tenantId: string): Promise<UserListItem[]> {
    const result = await this.db.query<
      QueryResultRow & {
        id: string;
        tenant_id: string | null;
        email: string;
        username: string;
        full_name: string;
        status: string;
        is_platform_super_admin: boolean;
        entity_codes: string[];
        entity_ids: string[];
        entity_names: string[];
        role_codes: string[];
        role_ids: string[];
        role_names: string[];
        created_at: Date;
      }
    >(
      `
        select
          u.id,
          u.tenant_id,
          u.email,
          u.username,
          u.full_name,
          u.status,
          u.is_platform_super_admin,
          u.created_at,
          coalesce(array_remove(array_agg(distinct r.id), null), array[]::uuid[]) as role_ids,
          coalesce(array_remove(array_agg(distinct r.code::text), null), array[]::text[]) as role_codes,
          coalesce(array_remove(array_agg(distinct r.name), null), array[]::text[]) as role_names,
          coalesce(array_remove(array_agg(distinct e.id), null), array[]::uuid[]) as entity_ids,
          coalesce(array_remove(array_agg(distinct e.code::text), null), array[]::text[]) as entity_codes,
          coalesce(array_remove(array_agg(distinct e.name), null), array[]::text[]) as entity_names
        from iam.users u
        left join iam.user_roles ur on ur.user_id = u.id
        left join iam.roles r on r.id = ur.role_id and r.deleted_at is null
        left join iam.user_entity_scopes ues on ues.user_id = u.id
        left join org.entities e on e.id = ues.entity_id and e.deleted_at is null
        where u.tenant_id = $1
          and u.deleted_at is null
        group by u.id
        order by u.full_name asc
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      username: row.username,
      fullName: row.full_name,
      status: row.status,
      isPlatformSuperAdmin: row.is_platform_super_admin,
      entityCodes: row.entity_codes,
      entityIds: row.entity_ids,
      entityNames: row.entity_names,
      roleCodes: row.role_codes,
      roleIds: row.role_ids,
      roleNames: row.role_names,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async countActiveTenantAdmins(tenantId: string): Promise<number> {
    const result = await this.db.one<QueryResultRow & { count: string }>(
      `
        select count(distinct u.id)::text as count
        from iam.users u
        join iam.user_roles ur on ur.user_id = u.id
        join iam.roles r on r.id = ur.role_id
        where u.tenant_id = $1
          and u.deleted_at is null
          and u.status = 'active'
          and r.deleted_at is null
          and r.code = 'tenant_admin'
      `,
      [tenantId],
    );
    return Number(result?.count ?? 0);
  }

  async findTenantUserAccess(input: { tenantId: string; userId: string }): Promise<UserListItem | null> {
    const users = await this.listTenantUsers(input.tenantId);
    return users.find((user) => user.id === input.userId) ?? null;
  }

  async updateTenantUserProfile(
    input: {
      email: string;
      fullName: string;
      tenantId: string;
      updatedBy: string;
      userId: string;
      username: string;
    },
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        update iam.users
        set email = $3,
            username = $4,
            full_name = $5,
            updated_at = now(),
            updated_by = $6
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [
        input.userId,
        input.tenantId,
        input.email.toLowerCase(),
        input.username.toLowerCase(),
        input.fullName,
        input.updatedBy,
      ],
      client,
    );
  }

  async listAssignableOwners(input: {
    entityId: string;
    tenantId: string;
  }): Promise<AssignableOwnerListItem[]> {
    const result = await this.db.query<
      QueryResultRow & {
        email: string;
        full_name: string;
        id: string;
        username: string;
      }
    >(
      `
        select distinct u.id, u.email, u.username, u.full_name
        from iam.users u
        join iam.user_entity_scopes ues on ues.user_id = u.id
        join org.entities e on e.id = ues.entity_id
        where u.tenant_id = $1
          and u.status = 'active'
          and u.deleted_at is null
          and ues.entity_id = $2
          and e.tenant_id = $1
          and e.deleted_at is null
        order by u.full_name asc
      `,
      [input.tenantId, input.entityId],
    );

    return result.rows.map((row) => ({
      email: row.email,
      fullName: row.full_name,
      id: row.id,
      username: row.username,
    }));
  }

  async createPendingTenantUser(
    input: {
      tenantId: string;
      email: string;
      username: string;
      fullName: string;
      createdBy: string;
    },
    client?: PoolClient,
  ): Promise<string> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into iam.users (
          tenant_id, email, username, full_name, status, created_by, updated_by
        )
        values ($1, $2, $3, $4, 'pending_password_setup', $5, $5)
        returning id
      `,
      [
        input.tenantId,
        input.email.toLowerCase(),
        input.username.toLowerCase(),
        input.fullName,
        input.createdBy,
      ],
      client,
    );

    if (!row) {
      throw new Error("Failed to create user.");
    }
    return row.id;
  }

  async updateUserStatus(
    input: { userId: string; tenantId: string; status: string; updatedBy: string },
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        update iam.users
        set status = $3,
            updated_at = now(),
            updated_by = $4
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [input.userId, input.tenantId, input.status, input.updatedBy],
      client,
    );
  }

  async listPasswordHashes(input: {
    historyCount: number;
    tenantId: string;
    userId: string;
  }): Promise<string[]> {
    const result = await this.db.query<QueryResultRow & { password_hash: string }>(
      `
        select password_hash
        from (
          select password_hash, now() as created_at
          from iam.users
          where id = $1
            and tenant_id = $2
            and password_hash is not null
            and deleted_at is null
          union all
          select ph.password_hash, ph.created_at
          from iam.password_history ph
          join iam.users u on u.id = ph.user_id
          where u.id = $1
            and u.tenant_id = $2
            and u.deleted_at is null
          order by created_at desc
          limit $3
        ) hashes
      `,
      [input.userId, input.tenantId, Math.max(input.historyCount + 1, 1)],
    );
    return result.rows.map((row) => row.password_hash);
  }

  async setPassword(
    input: { passwordHash: string; tenantId: string; updatedBy: string; userId: string },
    client?: PoolClient,
  ): Promise<boolean> {
    const result = await this.db.query(
      `
        with current_user_password as (
          select password_hash
          from iam.users
          where id = $1
            and tenant_id = $2
            and deleted_at is null
          for update
        ),
        history_insert as (
          insert into iam.password_history (user_id, password_hash)
          select $1, password_hash
          from current_user_password
          where password_hash is not null
          returning 1
        )
        update iam.users
        set password_hash = $3,
            status = 'active',
            failed_login_count = 0,
            locked_until = null,
            password_changed_at = now(),
            updated_at = now(),
            updated_by = $4
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [input.userId, input.tenantId, input.passwordHash, input.updatedBy],
      client,
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordFailedLogin(userId: string, attemptsBeforeLock: number, lockoutMinutes: number) {
    await this.db.query(
      `
        update iam.users
        set failed_login_count = failed_login_count + 1,
            locked_until = case
              when failed_login_count + 1 >= $2 then now() + ($3::text || ' minutes')::interval
              else locked_until
            end,
            status = case
              when failed_login_count + 1 >= $2 then 'locked'
              else status
            end
        where id = $1
      `,
      [userId, attemptsBeforeLock, lockoutMinutes],
    );
  }

  async resetLoginState(userId: string): Promise<void> {
    await this.db.query(
      `
        update iam.users
        set failed_login_count = 0,
            locked_until = null,
            status = case when status = 'locked' then 'active' else status end,
            last_login_at = now()
        where id = $1
      `,
      [userId],
    );
  }

  async replaceEntityScopes(
    input: { userId: string; tenantId: string; entityIds: string[]; assignedBy: string },
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        delete from iam.user_entity_scopes
        where user_id = $1
      `,
      [input.userId],
      client,
    );

    for (const entityId of input.entityIds) {
      await this.db.query(
        `
          insert into iam.user_entity_scopes (user_id, entity_id, assigned_by)
          select $1, e.id, $3
          from org.entities e
          where e.id = $2
            and e.tenant_id = $4
            and e.deleted_at is null
          on conflict do nothing
        `,
        [input.userId, entityId, input.assignedBy, input.tenantId],
        client,
      );
    }
  }

  private mapLoginUser(row: LoginUserRow): LoginUserRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tenantCode: row.tenant_code,
      email: row.email,
      username: row.username,
      fullName: row.full_name,
      passwordHash: row.password_hash,
      passwordChangedAt: row.password_changed_at,
      status: row.status,
      isPlatformSuperAdmin: row.is_platform_super_admin,
      failedLoginCount: row.failed_login_count,
      lockedUntil: row.locked_until,
    };
  }
}
