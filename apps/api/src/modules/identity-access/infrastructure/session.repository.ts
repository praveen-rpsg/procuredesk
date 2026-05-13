import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";
import type { AuthenticatedUser } from "../domain/authenticated-user.js";

@Injectable()
export class SessionRepository {
  constructor(private readonly db: DatabaseService) {}

  async createSession(input: {
    userId: string;
    tenantId: string | null;
    sessionHash: string;
    expiresAt: Date;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<void> {
    await this.db.query(
      `
        insert into iam.sessions (
          user_id, tenant_id, session_hash, expires_at, ip_address, user_agent
        )
        values ($1, $2, $3, $4, nullif($5, '')::inet, $6)
      `,
      [
        input.userId,
        input.tenantId,
        input.sessionHash,
        input.expiresAt,
        input.ipAddress ?? "",
        input.userAgent ?? null,
      ],
    );
  }

  async revokeSession(sessionHash: string): Promise<void> {
    await this.db.query(
      `
        update iam.sessions
        set revoked_at = now()
        where session_hash = $1
          and revoked_at is null
      `,
      [sessionHash],
    );
  }

  async findAuthenticatedUser(sessionHash: string): Promise<AuthenticatedUser | null> {
    const row = await this.db.one<
      QueryResultRow & {
        id: string;
        tenant_id: string | null;
        email: string;
        username: string;
        full_name: string;
        access_level: "ENTITY" | "GROUP" | "USER";
        is_platform_super_admin: boolean;
        permissions: string[] | null;
        entity_ids: string[] | null;
      }
    >(
      `
        select
          u.id,
          u.tenant_id,
          u.email,
          u.username,
          u.full_name,
          u.access_level,
          u.is_platform_super_admin,
          coalesce(
            array_agg(distinct p.code::text) filter (where p.code is not null),
            array[]::text[]
          ) as permissions,
          coalesce(
            array_agg(distinct ues.entity_id::text) filter (where ues.entity_id is not null),
            array[]::text[]
          ) as entity_ids
        from iam.sessions s
        join iam.users u on u.id = s.user_id
        left join iam.user_roles ur on ur.user_id = u.id
        left join iam.role_permissions rp on rp.role_id = ur.role_id
        left join iam.permissions p on p.code = rp.permission_code
        left join iam.user_entity_scopes ues on ues.user_id = u.id
        where s.session_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
          and u.deleted_at is null
          and u.status = 'active'
        group by u.id
      `,
      [sessionHash],
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      username: row.username,
      fullName: row.full_name,
      accessLevel: row.access_level,
      isPlatformSuperAdmin: row.is_platform_super_admin,
      permissions: row.permissions ?? [],
      entityIds: row.entity_ids ?? [],
    };
  }
}
