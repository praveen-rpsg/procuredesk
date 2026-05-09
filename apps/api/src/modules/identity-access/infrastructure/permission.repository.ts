import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type PermissionListItem = {
  code: string;
  name: string;
  description: string | null;
};

@Injectable()
export class PermissionRepository {
  constructor(private readonly db: DatabaseService) {}

  async listPermissions(): Promise<PermissionListItem[]> {
    const result = await this.db.query<
      QueryResultRow & { code: string; name: string; description: string | null }
    >(
      `
        select code, name, description
        from iam.permissions
        order by code asc
      `,
    );

    return result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
    }));
  }

  async countKnownPermissions(permissionCodes: string[]): Promise<number> {
    if (permissionCodes.length === 0) return 0;
    const result = await this.db.one<QueryResultRow & { count: string }>(
      `
        select count(*)::text as count
        from iam.permissions
        where code = any($1::citext[])
      `,
      [permissionCodes],
    );
    return Number(result?.count ?? 0);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const result = await this.db.query<QueryResultRow & { code: string }>(
      `
        select distinct p.code
        from iam.user_roles ur
        join iam.role_permissions rp on rp.role_id = ur.role_id
        join iam.permissions p on p.code = rp.permission_code
        where ur.user_id = $1
        order by p.code
      `,
      [userId],
    );

    return result.rows.map((row) => row.code);
  }

  async getUserEntityScopes(userId: string): Promise<string[]> {
    const result = await this.db.query<QueryResultRow & { entity_id: string }>(
      `
        select entity_id
        from iam.user_entity_scopes
        where user_id = $1
        order by entity_id
      `,
      [userId],
    );

    return result.rows.map((row) => row.entity_id);
  }
}
