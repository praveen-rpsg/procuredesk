import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type NotificationPreviewRow = {
  entityId: string | null;
  recipientEmail: string | null;
  subject: string;
  summary: string;
  targetId: string | null;
};

export type NotificationRule = {
  cadence: string;
  id: string;
  isEnabled: boolean;
  notificationType: string;
  recipientMode: string;
  subjectTemplate: string | null;
  thresholdDays: number | null;
  updatedAt: string;
};

export type NotificationJobListItem = {
  createdAt: string;
  errorMessage: string | null;
  id: string;
  notificationType: string;
  recipientEmail: string;
  sentAt: string | null;
  status: string;
  subject: string;
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly db: DatabaseService) {}

  async listRules(tenantId: string): Promise<NotificationRule[]> {
    await this.ensureDefaultRules(tenantId);
    const result = await this.db.query<QueryResultRow & NotificationRuleRow>(
      `
        select
          id, notification_type, is_enabled, cadence, threshold_days,
          recipient_mode, subject_template, updated_at
        from ops.notification_rules
        where tenant_id = $1
          and deleted_at is null
        order by notification_type asc
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapRule(row));
  }

  private async ensureDefaultRules(tenantId: string): Promise<void> {
    await this.db.query(
      `
        insert into ops.notification_rules (
          tenant_id, notification_type, is_enabled, cadence,
          threshold_days, recipient_mode, subject_template
        )
        values
          ($1, 'delayed_case_alert', true, 'daily', null, 'owner_or_entity', 'Delayed procurement case'),
          ($1, 'off_track_case_alert', true, 'daily', null, 'owner_or_entity', 'Off-track procurement case'),
          ($1, 'stale_tender', true, 'weekly', 14, 'owner_or_entity', 'No recent update reminder'),
          ($1, 'entity_monthly_digest', true, 'monthly', null, 'entity_admin', 'Monthly procurement digest'),
          ($1, 'manager_daily_snapshot', true, 'daily', null, 'entity_admin', 'Daily procurement snapshot'),
          ($1, 'rc_po_expiry', true, 'weekly', 90, 'entity_admin', 'RC/PO expiry alert')
        on conflict do nothing
      `,
      [tenantId],
    );
  }

  async upsertRule(input: {
    actorUserId: string;
    cadence: string;
    isEnabled: boolean;
    notificationType: string;
    recipientMode: string;
    subjectTemplate?: string | null;
    tenantId: string;
    thresholdDays?: number | null;
  }): Promise<NotificationRule> {
    const row = await this.db.one<QueryResultRow & NotificationRuleRow>(
      `
        insert into ops.notification_rules (
          tenant_id, notification_type, is_enabled, cadence, threshold_days,
          recipient_mode, subject_template, created_by, updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        on conflict (tenant_id, notification_type) where deleted_at is null do update
        set is_enabled = excluded.is_enabled,
            cadence = excluded.cadence,
            threshold_days = excluded.threshold_days,
            recipient_mode = excluded.recipient_mode,
            subject_template = excluded.subject_template,
            updated_at = now(),
            updated_by = excluded.updated_by
        returning
          id, notification_type, is_enabled, cadence, threshold_days,
          recipient_mode, subject_template, updated_at
      `,
      [
        input.tenantId,
        input.notificationType,
        input.isEnabled,
        input.cadence,
        input.thresholdDays ?? null,
        input.recipientMode,
        input.subjectTemplate ?? null,
        input.actorUserId,
      ],
    );
    if (!row) throw new Error("Failed to save notification rule.");
    return this.mapRule(row);
  }

  async staleTenderPreview(tenantId: string): Promise<NotificationPreviewRow[]> {
    const result = await this.db.query<QueryResultRow & PreviewRow>(
      `
        select
          c.id as target_id,
          c.entity_id,
          u.email as recipient_email,
          'Stale procurement case: ' || c.pr_id as subject,
          coalesce(c.tender_name, c.pr_description, c.pr_id) as summary
        from procurement.cases c
        left join iam.users u on u.id = c.owner_user_id
        where c.tenant_id = $1
          and c.deleted_at is null
          and c.status = 'running'
          and c.updated_at < now() - interval '14 days'
        order by c.updated_at asc
        limit 100
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapPreview(row));
  }

  async delayedCasePreview(tenantId: string): Promise<NotificationPreviewRow[]> {
    const result = await this.db.query<QueryResultRow & PreviewRow>(
      `
        select
          c.id as target_id,
          c.entity_id,
          u.email as recipient_email,
          'Delayed procurement case: ' || c.pr_id as subject,
          coalesce(c.tender_name, c.pr_description, c.pr_id) as summary
        from procurement.cases c
        left join iam.users u on u.id = c.owner_user_id
        where c.tenant_id = $1
          and c.deleted_at is null
          and c.status = 'running'
          and c.tentative_completion_date is not null
          and c.tentative_completion_date < current_date
        order by c.tentative_completion_date asc
        limit 100
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapPreview(row));
  }

  async offTrackCasePreview(tenantId: string): Promise<NotificationPreviewRow[]> {
    const result = await this.db.query<QueryResultRow & PreviewRow>(
      `
        select
          c.id as target_id,
          c.entity_id,
          u.email as recipient_email,
          'Off-track procurement case: ' || c.pr_id as subject,
          coalesce(c.tender_name, c.pr_description, c.pr_id) ||
            ' - current stage is behind the normative stage' as summary
        from procurement.cases c
        left join iam.users u on u.id = c.owner_user_id
        where c.tenant_id = $1
          and c.deleted_at is null
          and c.status = 'running'
          and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
          and c.desired_stage_code is not null
          and c.stage_code < c.desired_stage_code
        order by c.updated_at asc
        limit 100
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapPreview(row));
  }

  async monthlyDigestPreview(tenantId: string): Promise<NotificationPreviewRow[]> {
    const result = await this.db.query<QueryResultRow & PreviewRow>(
      `
        select
          e.id as target_id,
          e.id as entity_id,
          null::citext as recipient_email,
          'Monthly procurement digest: ' || e.code as subject,
          count(c.id)::text || ' active running cases' as summary
        from org.entities e
        left join procurement.cases c
          on c.entity_id = e.id
         and c.deleted_at is null
         and c.status = 'running'
        where e.tenant_id = $1
          and e.deleted_at is null
        group by e.id, e.code
        order by e.code asc
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapPreview(row));
  }

  async rcPoExpiryPreview(tenantId: string): Promise<NotificationPreviewRow[]> {
    const result = await this.db.query<QueryResultRow & PreviewRow>(
      `
        select
          coalesce(case_id, rc_po_plan_id, id) as target_id,
          entity_id,
          null::citext as recipient_email,
          'RC/PO expiring on ' || rc_po_validity_date::text as subject,
          coalesce(tender_description, awarded_vendors, 'RC/PO contract') as summary
        from reporting.contract_expiry_facts
        where tenant_id = $1
          and tender_floated_or_not_required = false
          and rc_po_validity_date <= current_date + interval '90 days'
        order by rc_po_validity_date asc
        limit 100
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapPreview(row));
  }

  async managerDailySnapshotPreview(tenantId: string): Promise<NotificationPreviewRow[]> {
    const result = await this.db.query<QueryResultRow & PreviewRow>(
      `
        select
          u.id as target_id,
          null::uuid as entity_id,
          u.email as recipient_email,
          'Daily procurement snapshot' as subject,
          count(c.id)::text || ' running case(s) across assigned entities' as summary
        from iam.users u
        join iam.user_entity_scopes scope
          on scope.user_id = u.id
        left join procurement.cases c
          on c.entity_id = scope.entity_id
         and c.tenant_id = u.tenant_id
         and c.deleted_at is null
         and c.status = 'running'
        where u.tenant_id = $1
          and u.deleted_at is null
          and u.status = 'active'
          and u.access_level in ('ENTITY', 'GROUP')
        group by u.id, u.email
        order by u.email asc
        limit 100
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapPreview(row));
  }

  async createNotificationJob(input: {
    notificationType: string;
    recipientEmail: string;
    recipientUserId?: string | null;
    subject: string;
    tenantId: string;
    textBody?: string | null;
    htmlBody?: string | null;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into ops.notification_jobs (
          tenant_id, notification_type, recipient_user_id, recipient_email, subject, text_body, html_body
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [
        input.tenantId,
        input.notificationType,
        input.recipientUserId ?? null,
        input.recipientEmail,
        input.subject,
        input.textBody ?? null,
        input.htmlBody ?? null,
      ],
    );
    if (!row) throw new Error("Failed to create notification job.");
    return { id: row.id };
  }

  async listJobs(input: {
    limit: number;
    notificationType?: string | undefined;
    status?: string | undefined;
    tenantId: string;
  }): Promise<NotificationJobListItem[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["tenant_id = $1"];
    if (input.status) {
      values.push(input.status);
      where.push(`status = $${values.length}`);
    }
    if (input.notificationType) {
      values.push(input.notificationType);
      where.push(`notification_type = $${values.length}`);
    }
    values.push(input.limit);
    const result = await this.db.query<QueryResultRow & NotificationJobRow>(
      `
        select
          id, notification_type, recipient_email, subject, status,
          error_message, created_at, sent_at
        from ops.notification_jobs
        where ${where.join(" and ")}
        order by created_at desc
        limit $${values.length}
      `,
      values,
    );
    return result.rows.map((row) => this.mapJob(row));
  }

  async markJobQueuedForRetry(input: {
    jobId: string;
    tenantId: string;
  }): Promise<{ id: string } | null> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        update ops.notification_jobs
        set status = 'queued',
            error_message = null,
            sent_at = null
        where tenant_id = $1
          and id = $2
          and status in ('failed', 'cancelled')
        returning id
      `,
      [input.tenantId, input.jobId],
    );
    return row ? { id: row.id } : null;
  }

  async cancelQueuedJob(input: {
    jobId: string;
    tenantId: string;
  }): Promise<{ id: string } | null> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        update ops.notification_jobs
        set status = 'cancelled',
            error_message = null
        where tenant_id = $1
          and id = $2
          and status in ('queued', 'failed')
        returning id
      `,
      [input.tenantId, input.jobId],
    );
    return row ? { id: row.id } : null;
  }

  private mapPreview(row: PreviewRow): NotificationPreviewRow {
    return {
      entityId: row.entity_id,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      summary: row.summary,
      targetId: row.target_id,
    };
  }

  private mapRule(row: NotificationRuleRow): NotificationRule {
    return {
      cadence: row.cadence,
      id: row.id,
      isEnabled: row.is_enabled,
      notificationType: row.notification_type,
      recipientMode: row.recipient_mode,
      subjectTemplate: row.subject_template,
      thresholdDays: row.threshold_days,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapJob(row: NotificationJobRow): NotificationJobListItem {
    return {
      createdAt: row.created_at.toISOString(),
      errorMessage: row.error_message,
      id: row.id,
      notificationType: row.notification_type,
      recipientEmail: row.recipient_email,
      sentAt: row.sent_at?.toISOString() ?? null,
      status: row.status,
      subject: row.subject,
    };
  }
}

type NotificationJobRow = {
  created_at: Date;
  error_message: string | null;
  id: string;
  notification_type: string;
  recipient_email: string;
  sent_at: Date | null;
  status: string;
  subject: string;
};

type NotificationRuleRow = {
  cadence: string;
  id: string;
  is_enabled: boolean;
  notification_type: string;
  recipient_mode: string;
  subject_template: string | null;
  threshold_days: number | null;
  updated_at: Date;
};

type PreviewRow = {
  entity_id: string | null;
  recipient_email: string | null;
  subject: string;
  summary: string;
  target_id: string | null;
};
