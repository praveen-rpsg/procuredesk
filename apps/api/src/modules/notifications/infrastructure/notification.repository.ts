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
  attemptCount: number;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  notificationType: string;
  providerMessageId: string | null;
  recipientEmail: string;
  sentAt: string | null;
  status: string;
  subject: string;
};

export type NotificationJobDetail = NotificationJobListItem & {
  attachments: NotificationAttachmentListItem[];
  attempts: NotificationDeliveryAttemptListItem[];
  htmlBody: string | null;
  payloadJson: Record<string, unknown>;
  textBody: string | null;
};

export type NotificationAttachmentListItem = {
  attachmentKind: string;
  contentType: string;
  errorMessage: string | null;
  fileName: string;
  fileSizeBytes: number | null;
  id: string;
  status: string;
};

export type NotificationTemplateListItem = {
  category: string;
  code: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  notificationType: string;
  publishedVersionId: string | null;
  rendererKey: string | null;
  subjectTemplate: string | null;
  updatedAt: string;
  versionNumber: number | null;
};

export type NotificationTemplateDetail = NotificationTemplateListItem & {
  preheaderTemplate: string | null;
  samplePayload: Record<string, unknown>;
};

export type NotificationTemplateVersionListItem = {
  changeNote: string | null;
  id: string;
  preheaderTemplate: string | null;
  publishedAt: string | null;
  rendererKey: string;
  samplePayload: Record<string, unknown>;
  status: string;
  subjectTemplate: string;
  versionNumber: number;
};

export type NotificationScheduleListItem = {
  cadence: string;
  dayOfMonth: number | null;
  description: string | null;
  id: string;
  intervalDays: number | null;
  isEnabled: boolean;
  lastErrorMessage: string | null;
  lastRunAt: string | null;
  lastStatus: string;
  name: string;
  nextRunAt: string | null;
  notificationType: string;
  recipientMode: string;
  runTime: string | null;
  scheduleKey: string;
  thresholdDays: number | null;
  timezone: string;
  updatedAt: string;
};

export type NotificationDeliveryAttemptListItem = {
  attemptNumber: number;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  id: string;
  provider: string;
  providerRequestId: string | null;
  startedAt: string;
  status: string;
};

export type NotificationPreferenceListItem = {
  channel: string;
  entityCode: string | null;
  entityId: string | null;
  entityName: string | null;
  frequency: string;
  id: string;
  isEnabled: boolean;
  isMandatory: boolean;
  notificationType: string;
  updatedAt: string;
  userEmail: string;
  userFullName: string;
  userId: string;
};

export type NotificationAuditTimelineItem = {
  action: string;
  actorFullName: string | null;
  actorUserId: string | null;
  details: Record<string, unknown>;
  id: string;
  occurredAt: string;
  summary: string;
  targetId: string | null;
  targetType: string;
};

export type NotificationSettings = {
  support: {
    email: string;
    name: string;
    phone?: string | undefined;
  };
  updatedAt: string;
  welcomeManualEnabled: boolean;
  welcomeManualTitle: string;
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly db: DatabaseService) {}

  async getSettings(tenantId: string): Promise<NotificationSettings> {
    await this.ensureNotificationSettings(tenantId);
    const row = await this.db.one<QueryResultRow & NotificationSettingsRow>(
      `
        select
          support_name, support_email::text as support_email, support_phone,
          welcome_manual_enabled, welcome_manual_title, updated_at
        from ops.notification_settings
        where tenant_id = $1
        limit 1
      `,
      [tenantId],
    );
    if (!row) throw new Error("Failed to load notification settings.");
    return this.mapSettings(row);
  }

  async updateSettings(input: {
    actorUserId: string;
    supportEmail: string;
    supportName: string;
    supportPhone?: string | null | undefined;
    tenantId: string;
    welcomeManualEnabled: boolean;
    welcomeManualTitle?: string | null | undefined;
  }): Promise<NotificationSettings> {
    const row = await this.db.one<QueryResultRow & NotificationSettingsRow>(
      `
        insert into ops.notification_settings (
          tenant_id, support_name, support_email, support_phone,
          welcome_manual_enabled, welcome_manual_title, created_by, updated_by
        )
        values ($1, $2, $3, nullif($4, ''), $5, $6, $7, $7)
        on conflict (tenant_id) do update
        set support_name = excluded.support_name,
            support_email = excluded.support_email,
            support_phone = excluded.support_phone,
            welcome_manual_enabled = excluded.welcome_manual_enabled,
            welcome_manual_title = excluded.welcome_manual_title,
            updated_at = now(),
            updated_by = excluded.updated_by
        returning
          support_name, support_email::text as support_email, support_phone,
          welcome_manual_enabled, welcome_manual_title, updated_at
      `,
      [
        input.tenantId,
        input.supportName,
        input.supportEmail,
        input.supportPhone?.trim() ?? null,
        input.welcomeManualEnabled,
        input.welcomeManualTitle?.trim() || "ProcureDesk User Manual",
        input.actorUserId,
      ],
    );
    if (!row) throw new Error("Failed to save notification settings.");
    return this.mapSettings(row);
  }

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
          ($1, 'user_welcome', true, 'manual', null, 'explicit', 'Set up your ProcureDesk account'),
          ($1, 'password_reset', true, 'manual', null, 'explicit', 'Reset your ProcureDesk password'),
          ($1, 'password_changed', true, 'manual', null, 'explicit', 'Your ProcureDesk password was changed'),
          ($1, 'delayed_case_alert', true, 'daily', null, 'owner_or_entity', 'Delayed procurement case'),
          ($1, 'off_track_case_alert', true, 'daily', null, 'owner_or_entity', 'Off-track procurement case'),
          ($1, 'stale_tender', true, 'weekly', 14, 'owner_or_entity', 'No recent update reminder'),
          ($1, 'entity_monthly_digest', true, 'monthly', null, 'entity_admin', 'Monthly procurement digest'),
          ($1, 'manager_daily_snapshot', true, 'daily', null, 'entity_admin', 'Daily procurement snapshot'),
          ($1, 'rc_po_expiry', true, 'weekly', 90, 'entity_admin', 'RC/PO expiry alert'),
          ($1, 'export_ready', true, 'manual', null, 'explicit', 'Export ready'),
          ($1, 'import_completed', true, 'manual', null, 'explicit', 'Import completed'),
          ($1, 'import_failed', true, 'manual', null, 'explicit', 'Import failed'),
          ($1, 'security_alert', true, 'manual', null, 'explicit', 'Security alert')
        on conflict do nothing
      `,
      [tenantId],
    );
  }

  private async ensureNotificationSettings(tenantId: string): Promise<void> {
    await this.db.query(
      `
        insert into ops.notification_settings (tenant_id)
        values ($1)
        on conflict (tenant_id) do nothing
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

  async isRuleEnabled(tenantId: string, notificationType: string): Promise<boolean> {
    await this.ensureDefaultRules(tenantId);
    const row = await this.db.one<QueryResultRow & { is_enabled: boolean }>(
      `
        select is_enabled
        from ops.notification_rules
        where tenant_id = $1
          and notification_type = $2
          and deleted_at is null
        limit 1
      `,
      [tenantId, notificationType],
    );
    return row?.is_enabled ?? true;
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
    idempotencyKey?: string | null | undefined;
    notificationEventId?: string | null | undefined;
    notificationType: string;
    payloadJson?: Record<string, unknown> | undefined;
    recipientEmail: string;
    recipientUserId?: string | null;
    scheduleId?: string | null | undefined;
    subject: string;
    templateId?: string | null | undefined;
    templateVersionId?: string | null | undefined;
    tenantId: string;
    textBody?: string | null;
    htmlBody?: string | null;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into ops.notification_jobs (
          tenant_id, notification_type, recipient_user_id, recipient_email,
          subject, text_body, html_body, template_id, template_version_id,
          notification_event_id, schedule_id, payload_json, idempotency_key
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        input.templateId ?? null,
        input.templateVersionId ?? null,
        input.notificationEventId ?? null,
        input.scheduleId ?? null,
        JSON.stringify(input.payloadJson ?? {}),
        input.idempotencyKey ?? null,
      ],
    );
    if (!row) throw new Error("Failed to create notification job.");
    return { id: row.id };
  }

  async listTemplates(tenantId: string): Promise<NotificationTemplateListItem[]> {
    const result = await this.db.query<QueryResultRow & NotificationTemplateRow>(
      `
        select
          t.id,
          t.notification_type,
          t.code,
          t.name,
          t.description,
          t.category,
          t.is_active,
          t.updated_at,
          v.id as published_version_id,
          v.version_number,
          v.renderer_key,
          v.subject_template
        from ops.notification_templates t
        left join lateral (
          select id, version_number, renderer_key, subject_template
          from ops.notification_template_versions
          where tenant_id = t.tenant_id
            and template_id = t.id
            and status = 'published'
          order by version_number desc
          limit 1
        ) v on true
        where t.tenant_id = $1
          and t.deleted_at is null
        order by t.category asc, t.name asc
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapTemplate(row));
  }

  async getTemplate(input: {
    templateId: string;
    tenantId: string;
  }): Promise<NotificationTemplateDetail | null> {
    const row = await this.db.one<QueryResultRow & NotificationTemplateDetailRow>(
      `
        select
          t.id,
          t.notification_type,
          t.code,
          t.name,
          t.description,
          t.category,
          t.is_active,
          t.updated_at,
          v.id as published_version_id,
          v.version_number,
          v.renderer_key,
          v.subject_template,
          v.preheader_template,
          v.sample_payload
        from ops.notification_templates t
        left join lateral (
          select id, version_number, renderer_key, subject_template, preheader_template, sample_payload
          from ops.notification_template_versions
          where tenant_id = t.tenant_id
            and template_id = t.id
            and status = 'published'
          order by version_number desc
          limit 1
        ) v on true
        where t.tenant_id = $1
          and t.id = $2
          and t.deleted_at is null
        limit 1
      `,
      [input.tenantId, input.templateId],
    );
    return row ? this.mapTemplateDetail(row) : null;
  }

  async listTemplateVersions(input: {
    templateId: string;
    tenantId: string;
  }): Promise<NotificationTemplateVersionListItem[]> {
    const result = await this.db.query<QueryResultRow & NotificationTemplateVersionRow>(
      `
        select
          id, version_number, status, renderer_key, subject_template,
          preheader_template, sample_payload, change_note, published_at
        from ops.notification_template_versions
        where tenant_id = $1
          and template_id = $2
        order by version_number desc
      `,
      [input.tenantId, input.templateId],
    );
    return result.rows.map((row) => this.mapTemplateVersion(row));
  }

  async findPublishedTemplateByType(input: {
    notificationType: string;
    tenantId: string;
  }): Promise<NotificationTemplateDetail | null> {
    const row = await this.db.one<QueryResultRow & NotificationTemplateDetailRow>(
      `
        select
          t.id,
          t.notification_type,
          t.code,
          t.name,
          t.description,
          t.category,
          t.is_active,
          t.updated_at,
          v.id as published_version_id,
          v.version_number,
          v.renderer_key,
          v.subject_template,
          v.preheader_template,
          v.sample_payload
        from ops.notification_templates t
        join lateral (
          select id, version_number, renderer_key, subject_template, preheader_template, sample_payload
          from ops.notification_template_versions
          where tenant_id = t.tenant_id
            and template_id = t.id
            and status = 'published'
          order by version_number desc
          limit 1
        ) v on true
        where t.tenant_id = $1
          and t.notification_type = $2
          and t.deleted_at is null
          and t.is_active = true
        limit 1
      `,
      [input.tenantId, input.notificationType],
    );
    return row ? this.mapTemplateDetail(row) : null;
  }

  async listSchedules(tenantId: string): Promise<NotificationScheduleListItem[]> {
    const result = await this.db.query<QueryResultRow & NotificationScheduleRow>(
      `
        select
          id, schedule_key, notification_type, name, description, is_enabled,
          cadence, interval_days, day_of_month, run_time::text as run_time,
          timezone, threshold_days, recipient_mode, last_run_at, next_run_at,
          last_status, last_error_message, updated_at
        from ops.notification_schedules
        where tenant_id = $1
          and deleted_at is null
        order by is_enabled desc, cadence asc, run_time asc nulls last, name asc
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapSchedule(row));
  }

  async getSchedule(input: {
    scheduleId: string;
    tenantId: string;
  }): Promise<NotificationScheduleListItem | null> {
    const row = await this.db.one<QueryResultRow & NotificationScheduleRow>(
      `
        select
          id, schedule_key, notification_type, name, description, is_enabled,
          cadence, interval_days, day_of_month, run_time::text as run_time,
          timezone, threshold_days, recipient_mode, last_run_at, next_run_at,
          last_status, last_error_message, updated_at
        from ops.notification_schedules
        where tenant_id = $1
          and id = $2
          and deleted_at is null
        limit 1
      `,
      [input.tenantId, input.scheduleId],
    );
    return row ? this.mapSchedule(row) : null;
  }

  async updateSchedule(input: {
    actorUserId: string;
    dayOfMonth?: number | null | undefined;
    intervalDays?: number | null | undefined;
    isEnabled?: boolean | undefined;
    runTime?: string | null | undefined;
    scheduleId: string;
    tenantId: string;
    thresholdDays?: number | null | undefined;
  }): Promise<NotificationScheduleListItem | null> {
    const row = await this.db.one<QueryResultRow & NotificationScheduleRow>(
      `
        update ops.notification_schedules
        set is_enabled = coalesce($3, is_enabled),
            interval_days = coalesce($4, interval_days),
            day_of_month = coalesce($5, day_of_month),
            run_time = coalesce($6::time, run_time),
            threshold_days = coalesce($7, threshold_days),
            updated_at = now(),
            updated_by = $8
        where tenant_id = $1
          and id = $2
          and deleted_at is null
        returning
          id, schedule_key, notification_type, name, description, is_enabled,
          cadence, interval_days, day_of_month, run_time::text as run_time,
          timezone, threshold_days, recipient_mode, last_run_at, next_run_at,
          last_status, last_error_message, updated_at
      `,
      [
        input.tenantId,
        input.scheduleId,
        input.isEnabled ?? null,
        input.intervalDays ?? null,
        input.dayOfMonth ?? null,
        input.runTime ?? null,
        input.thresholdDays ?? null,
        input.actorUserId,
      ],
    );
    return row ? this.mapSchedule(row) : null;
  }

  async queueScheduleRunNow(input: {
    actorUserId: string;
    scheduleId: string;
    tenantId: string;
  }): Promise<NotificationScheduleListItem | null> {
    const row = await this.db.one<QueryResultRow & NotificationScheduleRow>(
      `
        update ops.notification_schedules
        set next_run_at = now(),
            last_error_message = null,
            updated_at = now(),
            updated_by = $3
        where tenant_id = $1
          and id = $2
          and deleted_at is null
          and is_enabled = true
        returning
          id, schedule_key, notification_type, name, description, is_enabled,
          cadence, interval_days, day_of_month, run_time::text as run_time,
          timezone, threshold_days, recipient_mode, last_run_at, next_run_at,
          last_status, last_error_message, updated_at
      `,
      [input.tenantId, input.scheduleId, input.actorUserId],
    );
    return row ? this.mapSchedule(row) : null;
  }

  async listDeliveryAttempts(input: {
    jobId: string;
    tenantId: string;
  }): Promise<NotificationDeliveryAttemptListItem[]> {
    const result = await this.db.query<QueryResultRow & NotificationDeliveryAttemptRow>(
      `
        select
          id, attempt_number, status, provider, provider_request_id,
          error_message, started_at, completed_at, duration_ms
        from ops.notification_delivery_attempts
        where tenant_id = $1
          and notification_job_id = $2
        order by attempt_number desc
      `,
      [input.tenantId, input.jobId],
    );
    return result.rows.map((row) => this.mapDeliveryAttempt(row));
  }

  async getJobDetail(input: {
    jobId: string;
    tenantId: string;
  }): Promise<NotificationJobDetail | null> {
    const row = await this.db.one<QueryResultRow & NotificationJobDetailRow>(
      `
        select
          id, notification_type, recipient_email, subject, status,
          error_message, attempt_count, provider_message_id, created_at, sent_at,
          text_body, html_body, payload_json
        from ops.notification_jobs
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [input.tenantId, input.jobId],
    );
    if (!row) return null;
    const [attempts, attachments] = await Promise.all([
      this.listDeliveryAttempts(input),
      this.listJobAttachments(input),
    ]);
    return {
      ...this.mapJob(row),
      attachments,
      attempts,
      htmlBody: row.html_body,
      payloadJson: isRecord(row.payload_json) ? row.payload_json : {},
      textBody: row.text_body,
    };
  }

  async listJobAttachments(input: {
    jobId: string;
    tenantId: string;
  }): Promise<NotificationAttachmentListItem[]> {
    const result = await this.db.query<QueryResultRow & NotificationAttachmentRow>(
      `
        select
          id, attachment_kind, file_name, content_type, file_size_bytes,
          status, error_message
        from ops.email_attachments
        where tenant_id = $1
          and notification_job_id = $2
        order by created_at asc
      `,
      [input.tenantId, input.jobId],
    );
    return result.rows.map((row) => ({
      attachmentKind: row.attachment_kind,
      contentType: row.content_type,
      errorMessage: row.error_message,
      fileName: row.file_name,
      fileSizeBytes: row.file_size_bytes === null ? null : Number(row.file_size_bytes),
      id: row.id,
      status: row.status,
    }));
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
          error_message, attempt_count, provider_message_id, created_at, sent_at
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
            sent_at = null,
            max_attempts = greatest(max_attempts, attempt_count + 1),
            next_retry_at = null,
            updated_at = now()
        where tenant_id = $1
          and id = $2
          and status in ('failed', 'cancelled', 'dead_letter')
        returning id
      `,
      [input.tenantId, input.jobId],
    );
    return row ? { id: row.id } : null;
  }

  async cloneJobForResend(input: {
    actorUserId: string;
    jobId: string;
    tenantId: string;
  }): Promise<{ id: string } | null> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into ops.notification_jobs (
          tenant_id, notification_type, recipient_user_id, recipient_email,
          subject, text_body, html_body, template_id, template_version_id,
          payload_json, priority, max_attempts, target_type, target_id,
          correlation_id
        )
        select
          tenant_id, notification_type, recipient_user_id, recipient_email,
          subject, text_body, html_body, template_id, template_version_id,
          payload_json, priority, max_attempts, target_type, target_id,
          'resend:' || id::text || ':' || $3::text
        from ops.notification_jobs
        where tenant_id = $1
          and id = $2
          and status in ('sent', 'failed', 'cancelled', 'dead_letter')
        returning id
      `,
      [input.tenantId, input.jobId, input.actorUserId],
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

  async listPreferences(input: {
    notificationType?: string | undefined;
    tenantId: string;
    userId?: string | undefined;
  }): Promise<NotificationPreferenceListItem[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["p.tenant_id = $1", "p.deleted_at is null"];
    if (input.notificationType) {
      values.push(input.notificationType);
      where.push(`p.notification_type = $${values.length}`);
    }
    if (input.userId) {
      values.push(input.userId);
      where.push(`p.user_id = $${values.length}`);
    }
    const result = await this.db.query<QueryResultRow & NotificationPreferenceRow>(
      `
        select
          p.id, p.user_id, u.email as user_email, u.full_name as user_full_name,
          p.entity_id, e.code as entity_code, e.name as entity_name,
          p.notification_type, p.channel, p.is_enabled, p.frequency,
          p.is_mandatory, p.updated_at
        from ops.notification_preferences p
        join iam.users u on u.id = p.user_id and u.tenant_id = p.tenant_id
        left join org.entities e on e.id = p.entity_id and e.tenant_id = p.tenant_id
        where ${where.join(" and ")}
        order by u.full_name asc, p.notification_type asc, e.name asc nulls first
        limit 500
      `,
      values,
    );
    return result.rows.map((row) => this.mapPreference(row));
  }

  async upsertPreference(input: {
    actorUserId: string;
    channel: string;
    entityId?: string | null | undefined;
    frequency: string;
    isEnabled: boolean;
    isMandatory: boolean;
    notificationType: string;
    tenantId: string;
    userId: string;
  }): Promise<NotificationPreferenceListItem> {
    const row = await this.db.one<QueryResultRow & NotificationPreferenceRow>(
      `
        insert into ops.notification_preferences (
          tenant_id, user_id, entity_id, notification_type, channel,
          is_enabled, frequency, is_mandatory, created_by, updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        on conflict (tenant_id, user_id, notification_type, channel)
          where entity_id is null and deleted_at is null
        do update
        set is_enabled = excluded.is_enabled,
            frequency = excluded.frequency,
            is_mandatory = excluded.is_mandatory,
            updated_at = now(),
            updated_by = excluded.updated_by
        returning id
      `,
      [
        input.tenantId,
        input.userId,
        input.entityId ?? null,
        input.notificationType,
        input.channel,
        input.isEnabled,
        input.frequency,
        input.isMandatory,
        input.actorUserId,
      ],
    );
    if (!row) throw new Error("Failed to save notification preference.");
    const preference = await this.getPreferenceById({ id: row.id, tenantId: input.tenantId });
    if (!preference) throw new Error("Failed to load saved notification preference.");
    return preference;
  }

  async listAuditTimeline(input: {
    limit: number;
    q?: string | undefined;
    targetId?: string | undefined;
    targetType?: string | undefined;
    tenantId: string;
  }): Promise<NotificationAuditTimelineItem[]> {
    const allowedTargetTypes = [
      "email_attachment",
      "notification_event",
      "notification_job",
      "notification_preference",
      "notification_rule",
      "notification_schedule",
      "notification_settings",
      "notification_template",
    ];
    const values: unknown[] = [input.tenantId, allowedTargetTypes];
    const where = ["ae.tenant_id = $1", "ae.target_type = any($2::citext[])"];
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
          or u.full_name ilike $${values.length}
          or u.email ilike $${values.length}
        )
      `);
    }
    values.push(input.limit);
    const result = await this.db.query<QueryResultRow & NotificationAuditTimelineRow>(
      `
        select
          ae.id, ae.actor_user_id, u.full_name as actor_full_name,
          ae.action, ae.target_type, ae.target_id, ae.summary,
          ae.details, ae.occurred_at
        from ops.audit_events ae
        left join iam.users u on u.id = ae.actor_user_id and u.tenant_id = ae.tenant_id
        where ${where.join(" and ")}
        order by ae.occurred_at desc
        limit $${values.length}
      `,
      values,
    );
    return result.rows.map((row) => this.mapAuditTimeline(row));
  }

  private async getPreferenceById(input: {
    id: string;
    tenantId: string;
  }): Promise<NotificationPreferenceListItem | null> {
    const row = await this.db.one<QueryResultRow & NotificationPreferenceRow>(
      `
        select
          p.id, p.user_id, u.email as user_email, u.full_name as user_full_name,
          p.entity_id, e.code as entity_code, e.name as entity_name,
          p.notification_type, p.channel, p.is_enabled, p.frequency,
          p.is_mandatory, p.updated_at
        from ops.notification_preferences p
        join iam.users u on u.id = p.user_id and u.tenant_id = p.tenant_id
        left join org.entities e on e.id = p.entity_id and e.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and p.id = $2
          and p.deleted_at is null
        limit 1
      `,
      [input.tenantId, input.id],
    );
    return row ? this.mapPreference(row) : null;
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
      attemptCount: row.attempt_count,
      createdAt: row.created_at.toISOString(),
      errorMessage: row.error_message,
      id: row.id,
      notificationType: row.notification_type,
      providerMessageId: row.provider_message_id,
      recipientEmail: row.recipient_email,
      sentAt: row.sent_at?.toISOString() ?? null,
      status: row.status,
      subject: row.subject,
    };
  }

  private mapTemplate(row: NotificationTemplateRow): NotificationTemplateListItem {
    return {
      category: row.category,
      code: row.code,
      description: row.description,
      id: row.id,
      isActive: row.is_active,
      name: row.name,
      notificationType: row.notification_type,
      publishedVersionId: row.published_version_id,
      rendererKey: row.renderer_key,
      subjectTemplate: row.subject_template,
      updatedAt: row.updated_at.toISOString(),
      versionNumber: row.version_number,
    };
  }

  private mapTemplateDetail(row: NotificationTemplateDetailRow): NotificationTemplateDetail {
    return {
      ...this.mapTemplate(row),
      preheaderTemplate: row.preheader_template,
      samplePayload: isRecord(row.sample_payload) ? row.sample_payload : {},
    };
  }

  private mapTemplateVersion(row: NotificationTemplateVersionRow): NotificationTemplateVersionListItem {
    return {
      changeNote: row.change_note,
      id: row.id,
      preheaderTemplate: row.preheader_template,
      publishedAt: row.published_at?.toISOString() ?? null,
      rendererKey: row.renderer_key,
      samplePayload: isRecord(row.sample_payload) ? row.sample_payload : {},
      status: row.status,
      subjectTemplate: row.subject_template,
      versionNumber: row.version_number,
    };
  }

  private mapSchedule(row: NotificationScheduleRow): NotificationScheduleListItem {
    return {
      cadence: row.cadence,
      dayOfMonth: row.day_of_month,
      description: row.description,
      id: row.id,
      intervalDays: row.interval_days,
      isEnabled: row.is_enabled,
      lastErrorMessage: row.last_error_message,
      lastRunAt: row.last_run_at?.toISOString() ?? null,
      lastStatus: row.last_status,
      name: row.name,
      nextRunAt: row.next_run_at?.toISOString() ?? null,
      notificationType: row.notification_type,
      recipientMode: row.recipient_mode,
      runTime: row.run_time,
      scheduleKey: row.schedule_key,
      thresholdDays: row.threshold_days,
      timezone: row.timezone,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapDeliveryAttempt(row: NotificationDeliveryAttemptRow): NotificationDeliveryAttemptListItem {
    return {
      attemptNumber: row.attempt_number,
      completedAt: row.completed_at?.toISOString() ?? null,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      id: row.id,
      provider: row.provider,
      providerRequestId: row.provider_request_id,
      startedAt: row.started_at.toISOString(),
      status: row.status,
    };
  }

  private mapPreference(row: NotificationPreferenceRow): NotificationPreferenceListItem {
    return {
      channel: row.channel,
      entityCode: row.entity_code,
      entityId: row.entity_id,
      entityName: row.entity_name,
      frequency: row.frequency,
      id: row.id,
      isEnabled: row.is_enabled,
      isMandatory: row.is_mandatory,
      notificationType: row.notification_type,
      updatedAt: row.updated_at.toISOString(),
      userEmail: row.user_email,
      userFullName: row.user_full_name,
      userId: row.user_id,
    };
  }

  private mapAuditTimeline(row: NotificationAuditTimelineRow): NotificationAuditTimelineItem {
    return {
      action: row.action,
      actorFullName: row.actor_full_name,
      actorUserId: row.actor_user_id,
      details: isRecord(row.details) ? row.details : {},
      id: row.id,
      occurredAt: row.occurred_at.toISOString(),
      summary: row.summary,
      targetId: row.target_id,
      targetType: row.target_type,
    };
  }

  private mapSettings(row: NotificationSettingsRow): NotificationSettings {
    return {
      support: {
        email: row.support_email,
        name: row.support_name,
        phone: row.support_phone ?? undefined,
      },
      updatedAt: row.updated_at.toISOString(),
      welcomeManualEnabled: row.welcome_manual_enabled,
      welcomeManualTitle: row.welcome_manual_title,
    };
  }
}

type NotificationSettingsRow = {
  support_email: string;
  support_name: string;
  support_phone: string | null;
  updated_at: Date;
  welcome_manual_enabled: boolean;
  welcome_manual_title: string;
};

type NotificationJobRow = {
  attempt_count: number;
  created_at: Date;
  error_message: string | null;
  id: string;
  notification_type: string;
  provider_message_id: string | null;
  recipient_email: string;
  sent_at: Date | null;
  status: string;
  subject: string;
};

type NotificationJobDetailRow = NotificationJobRow & {
  html_body: string | null;
  payload_json: unknown;
  text_body: string | null;
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

type NotificationTemplateRow = {
  category: string;
  code: string;
  description: string | null;
  id: string;
  is_active: boolean;
  name: string;
  notification_type: string;
  published_version_id: string | null;
  renderer_key: string | null;
  subject_template: string | null;
  updated_at: Date;
  version_number: number | null;
};

type NotificationTemplateDetailRow = NotificationTemplateRow & {
  preheader_template: string | null;
  sample_payload: unknown;
};

type NotificationTemplateVersionRow = {
  change_note: string | null;
  id: string;
  preheader_template: string | null;
  published_at: Date | null;
  renderer_key: string;
  sample_payload: unknown;
  status: string;
  subject_template: string;
  version_number: number;
};

type NotificationScheduleRow = {
  cadence: string;
  day_of_month: number | null;
  description: string | null;
  id: string;
  interval_days: number | null;
  is_enabled: boolean;
  last_error_message: string | null;
  last_run_at: Date | null;
  last_status: string;
  name: string;
  next_run_at: Date | null;
  notification_type: string;
  recipient_mode: string;
  run_time: string | null;
  schedule_key: string;
  threshold_days: number | null;
  timezone: string;
  updated_at: Date;
};

type NotificationDeliveryAttemptRow = {
  attempt_number: number;
  completed_at: Date | null;
  duration_ms: number | null;
  error_message: string | null;
  id: string;
  provider: string;
  provider_request_id: string | null;
  started_at: Date;
  status: string;
};

type NotificationAttachmentRow = {
  attachment_kind: string;
  content_type: string;
  error_message: string | null;
  file_name: string;
  file_size_bytes: string | number | null;
  id: string;
  status: string;
};

type NotificationPreferenceRow = {
  channel: string;
  entity_code: string | null;
  entity_id: string | null;
  entity_name: string | null;
  frequency: string;
  id: string;
  is_enabled: boolean;
  is_mandatory: boolean;
  notification_type: string;
  updated_at: Date;
  user_email: string;
  user_full_name: string;
  user_id: string;
};

type NotificationAuditTimelineRow = {
  action: string;
  actor_full_name: string | null;
  actor_user_id: string | null;
  details: unknown;
  id: string;
  occurred_at: Date;
  summary: string;
  target_id: string | null;
  target_type: string;
};

type PreviewRow = {
  entity_id: string | null;
  recipient_email: string | null;
  subject: string;
  summary: string;
  target_id: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
