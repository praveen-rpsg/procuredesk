import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type AuditEventRecord = {
  action: string;
  actorFullName: string | null;
  actorUsername: string | null;
  actorUserId: string | null;
  details: Record<string, unknown>;
  id: string;
  ipAddress: string | null;
  occurredAt: string;
  requestId: string;
  summary: string;
  targetId: string | null;
  targetType: string;
  userAgent: string | null;
};

export type AuditFilterMetadataRecord = {
  actions: string[];
  targetTypes: string[];
};

@Injectable()
export class AuditRepository {
  constructor(private readonly db: DatabaseService) {}

  async listEvents(input: {
    action?: string;
    actorUserId?: string;
    limit: number;
    offset: number;
    q?: string;
    targetId?: string;
    targetType?: string;
    tenantId: string;
  }): Promise<AuditEventRecord[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["ae.tenant_id = $1"];
    if (input.action) {
      values.push(input.action);
      where.push(`ae.action = $${values.length}`);
    }
    if (input.actorUserId) {
      values.push(input.actorUserId);
      where.push(`ae.actor_user_id = $${values.length}`);
    }
    if (input.targetType) {
      values.push(input.targetType);
      where.push(`ae.target_type = $${values.length}`);
    }
    if (input.targetId) {
      values.push(input.targetId);
      where.push(`ae.target_id = $${values.length}`);
    }
    if (input.q) {
      values.push(`%${input.q}%`);
      where.push(`
        (
          ae.summary ilike $${values.length}
          or ae.action::text ilike $${values.length}
          or ae.target_type::text ilike $${values.length}
          or u.username ilike $${values.length}
          or u.full_name ilike $${values.length}
        )
      `);
    }
    values.push(input.limit);
    const limitPosition = values.length;
    values.push(input.offset);
    const offsetPosition = values.length;

    const result = await this.db.query<QueryResultRow & AuditEventRow>(
      `
        select
          ae.id,
          ae.actor_user_id,
          u.username as actor_username,
          u.full_name as actor_full_name,
          ae.action,
          ae.target_type,
          ae.target_id,
          ae.summary,
          ae.details,
          ae.ip_address::text as ip_address,
          ae.user_agent,
          ae.occurred_at
        from ops.audit_events ae
        left join iam.users u on u.id = ae.actor_user_id
        where ${where.join(" and ")}
        order by ae.occurred_at desc
        limit $${limitPosition}
        offset $${offsetPosition}
      `,
      values,
    );
    return result.rows.map((row) => this.mapEvent(row));
  }

  async getEvent(tenantId: string, eventId: string): Promise<AuditEventRecord | null> {
    const row = await this.db.one<QueryResultRow & AuditEventRow>(
      `
        select
          ae.id,
          ae.actor_user_id,
          u.username as actor_username,
          u.full_name as actor_full_name,
          ae.action,
          ae.target_type,
          ae.target_id,
          ae.summary,
          ae.details,
          ae.ip_address::text as ip_address,
          ae.user_agent,
          ae.occurred_at
        from ops.audit_events ae
        left join iam.users u on u.id = ae.actor_user_id
        where ae.tenant_id = $1
          and ae.id = $2
      `,
      [tenantId, eventId],
    );
    return row ? this.mapEvent(row) : null;
  }

  async getFilterMetadata(tenantId: string): Promise<AuditFilterMetadataRecord> {
    const actions = await this.db.query<QueryResultRow & { action: string }>(
      `
        select distinct action::text as action
        from ops.audit_events
        where tenant_id = $1
        order by action
      `,
      [tenantId],
    );
    const targetTypes = await this.db.query<QueryResultRow & { target_type: string }>(
      `
        select distinct target_type::text as target_type
        from ops.audit_events
        where tenant_id = $1
        order by target_type
      `,
      [tenantId],
    );
    return {
      actions: actions.rows.map((row) => row.action),
      targetTypes: targetTypes.rows.map((row) => row.target_type),
    };
  }

  private mapEvent(row: AuditEventRow): AuditEventRecord {
    const details = row.details ?? {};
    return {
      action: row.action,
      actorFullName: row.actor_full_name,
      actorUsername: row.actor_username,
      actorUserId: row.actor_user_id,
      details,
      id: row.id,
      ipAddress: row.ip_address,
      occurredAt: row.occurred_at.toISOString(),
      requestId: typeof details.requestId === "string" ? details.requestId : row.id,
      summary: row.summary,
      targetId: row.target_id,
      targetType: row.target_type,
      userAgent: row.user_agent,
    };
  }
}

type AuditEventRow = {
  action: string;
  actor_full_name: string | null;
  actor_username: string | null;
  actor_user_id: string | null;
  details: Record<string, unknown> | null;
  id: string;
  ip_address: string | null;
  occurred_at: Date;
  summary: string;
  target_id: string | null;
  target_type: string;
  user_agent: string | null;
};
