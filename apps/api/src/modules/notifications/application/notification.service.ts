import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import { MicrosoftGraphEmailAdapter } from "../infrastructure/microsoft-graph-email.adapter.js";
import { NotificationRepository } from "../infrastructure/notification.repository.js";
import { buildNotificationJobEmail, buildTemplatePreviewEmail } from "./email-templates.js";

const SYSTEM_ONLY_NOTIFICATION_TYPES = [
  "password_changed",
  "password_reset",
  "user_welcome",
] as const;

const MANDATORY_NOTIFICATION_TYPES = [
  "password_changed",
  "password_reset",
  "security_alert",
  "user_welcome",
] as const;

const EMAIL_CAPABILITIES = [
  { category: "Account", label: "New User Setup", notificationType: "user_welcome" },
  { category: "Security", label: "Forgot Password", notificationType: "password_reset" },
  { category: "Security", label: "Password Changed", notificationType: "password_changed" },
  { category: "Operations", label: "Manager Daily Snapshot", notificationType: "manager_daily_snapshot" },
  { category: "Operations", label: "Delayed Case Reminder", notificationType: "delayed_case_alert" },
  { category: "Operations", label: "Off Track Case Reminder", notificationType: "off_track_case_alert" },
  { category: "Planning", label: "RC/PO Expiry Reminder", notificationType: "rc_po_expiry" },
  { category: "Operations", label: "Monthly Pending Tender Report", notificationType: "entity_monthly_digest" },
  { category: "Operations", label: "Pending Tender Update Alert", notificationType: "stale_tender" },
  { category: "Exports", label: "Export Ready", notificationType: "export_ready" },
  { category: "Imports", label: "Import Completed", notificationType: "import_completed" },
  { category: "Imports", label: "Import Failed", notificationType: "import_failed" },
  { category: "Security", label: "Security Alert", notificationType: "security_alert" },
] as const;

@Injectable()
export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly graph: MicrosoftGraphEmailAdapter,
    private readonly config: ConfigService,
  ) {}

  preview(
    actor: AuthenticatedUser,
    type:
      | "delayed_case_alert"
      | "entity_monthly_digest"
      | "manager_daily_snapshot"
      | "off_track_case_alert"
      | "rc_po_expiry"
      | "stale_tender",
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    if (type === "stale_tender")
      return this.repository.staleTenderPreview(tenantId);
    if (type === "entity_monthly_digest")
      return this.repository.monthlyDigestPreview(tenantId);
    if (type === "manager_daily_snapshot")
      return this.repository.managerDailySnapshotPreview(tenantId);
    if (type === "delayed_case_alert")
      return this.repository.delayedCasePreview(tenantId);
    if (type === "off_track_case_alert")
      return this.repository.offTrackCasePreview(tenantId);
    return this.repository.rcPoExpiryPreview(tenantId);
  }

  listJobs(
    actor: AuthenticatedUser,
    input: {
      limit?: number | undefined;
      notificationType?: string | undefined;
      status?: string | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.listJobs({
      limit: input.limit ?? 50,
      notificationType: input.notificationType,
      status: input.status,
      tenantId,
    });
  }

  listRules(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.listRules(tenantId);
  }

  getSettings(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.getSettings(tenantId);
  }

  async updateSettings(
    actor: AuthenticatedUser,
    input: {
      supportEmail: string;
      supportName: string;
      supportPhone?: string | null | undefined;
      welcomeManualEnabled: boolean;
      welcomeManualTitle?: string | null | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const settings = await this.repository.updateSettings({
      ...input,
      actorUserId: actor.id,
      tenantId,
    });
    await this.audit.write({
      action: "notification_settings.update",
      actorUserId: actor.id,
      details: {
        supportEmail: settings.support.email,
        supportName: settings.support.name,
        supportPhone: settings.support.phone ?? null,
        welcomeManualEnabled: settings.welcomeManualEnabled,
        welcomeManualTitle: settings.welcomeManualTitle,
      },
      summary: "Updated notification support and attachment settings",
      targetId: tenantId,
      targetType: "notification_settings",
      tenantId,
    });
    return settings;
  }

  listTemplates(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.listTemplates(tenantId);
  }

  async getTemplate(actor: AuthenticatedUser, templateId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const template = await this.repository.getTemplate({ templateId, tenantId });
    if (!template) {
      throw new BadRequestException("Notification template was not found.");
    }
    return template;
  }

  async listTemplateVersions(actor: AuthenticatedUser, templateId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const template = await this.repository.getTemplate({ templateId, tenantId });
    if (!template) {
      throw new BadRequestException("Notification template was not found.");
    }
    return this.repository.listTemplateVersions({ templateId, tenantId });
  }

  async previewTemplate(actor: AuthenticatedUser, templateId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const template = await this.repository.getTemplate({ templateId, tenantId });
    if (!template) {
      throw new BadRequestException("Notification template was not found.");
    }
    if (!template.rendererKey) {
      throw new BadRequestException("Notification template has no published renderer.");
    }
    const settings = await this.repository.getSettings(tenantId);
    return buildTemplatePreviewEmail({
      appUrl: this.config.get<string>("APP_URL", "http://localhost:5175"),
      notificationType: template.notificationType,
      rendererKey: template.rendererKey,
      samplePayload: template.samplePayload,
      subject: template.subjectTemplate,
      support: settings.support,
    });
  }

  async testSendTemplate(
    actor: AuthenticatedUser,
    templateId: string,
    input: {
      recipientEmail: string;
      samplePayload?: Record<string, unknown> | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    this.graph.assertConfigured();
    const template = await this.repository.getTemplate({ templateId, tenantId });
    if (!template) {
      throw new BadRequestException("Notification template was not found.");
    }
    if (!template.rendererKey) {
      throw new BadRequestException("Notification template has no published renderer.");
    }
    const enabled = await this.repository.isRuleEnabled(tenantId, template.notificationType);
    if (!enabled) {
      throw new BadRequestException("Notification rule is disabled. Enable it before test sending this email.");
    }
    const payload = input.samplePayload ?? template.samplePayload;
    const settings = await this.repository.getSettings(tenantId);
    const email = buildTemplatePreviewEmail({
      appUrl: this.config.get<string>("APP_URL", "http://localhost:5175"),
      notificationType: template.notificationType,
      rendererKey: template.rendererKey,
      samplePayload: payload,
      subject: template.subjectTemplate,
      support: settings.support,
    });
    return this.db.transaction(async () => {
      const job = await this.repository.createNotificationJob({
        htmlBody: email.htmlBody,
        notificationType: template.notificationType,
        payloadJson: {
          ...payload,
          testSend: true,
        },
        recipientEmail: input.recipientEmail,
        subject: `[Test] ${email.subject}`,
        templateId: template.id,
        templateVersionId: template.publishedVersionId,
        tenantId,
        textBody: email.textBody,
      });
      await this.outbox.write({
        aggregateId: job.id,
        aggregateType: "notification_job",
        eventType: "notification_job.created",
        payload: {
          actorUserId: actor.id,
          notificationType: template.notificationType,
          testSend: true,
        },
        tenantId,
      });
      await this.audit.write({
        action: "notification_template.test_send",
        actorUserId: actor.id,
        details: {
          recipientEmail: input.recipientEmail,
          templateId,
        },
        summary: "Queued notification template test email",
        targetId: job.id,
        targetType: "notification_job",
        tenantId,
      });
      return job;
    });
  }

  listSchedules(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.listSchedules(tenantId);
  }

  async previewSchedule(actor: AuthenticatedUser, scheduleId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const schedule = await this.repository.getSchedule({ scheduleId, tenantId });
    if (!schedule) {
      throw new BadRequestException("Notification schedule was not found.");
    }
    const previewType = this.previewTypeForSchedule(schedule.notificationType);
    if (!previewType) {
      return [];
    }
    return this.preview(actor, previewType);
  }

  async updateSchedule(
    actor: AuthenticatedUser,
    input: {
      dayOfMonth?: number | null | undefined;
      intervalDays?: number | null | undefined;
      isEnabled?: boolean | undefined;
      runTime?: string | null | undefined;
      scheduleId: string;
      thresholdDays?: number | null | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const schedule = await this.repository.updateSchedule({
      ...input,
      actorUserId: actor.id,
      tenantId,
    });
    if (!schedule) {
      throw new BadRequestException("Notification schedule was not found.");
    }
    await this.audit.write({
      action: "notification_schedule.update",
      actorUserId: actor.id,
      details: {
        dayOfMonth: schedule.dayOfMonth,
        intervalDays: schedule.intervalDays,
        isEnabled: schedule.isEnabled,
        runTime: schedule.runTime,
        thresholdDays: schedule.thresholdDays,
      },
      summary: "Updated notification schedule",
      targetId: schedule.id,
      targetType: "notification_schedule",
      tenantId,
    });
    return schedule;
  }

  async runScheduleNow(actor: AuthenticatedUser, scheduleId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const schedule = await this.repository.queueScheduleRunNow({
      actorUserId: actor.id,
      scheduleId,
      tenantId,
    });
    if (!schedule) {
      throw new BadRequestException("Only enabled notification schedules can be queued for immediate execution.");
    }
    await this.audit.write({
      action: "notification_schedule.run_now",
      actorUserId: actor.id,
      details: {
        notificationType: schedule.notificationType,
        scheduleKey: schedule.scheduleKey,
      },
      summary: "Queued notification schedule for immediate execution",
      targetId: schedule.id,
      targetType: "notification_schedule",
      tenantId,
    });
    return schedule;
  }

  listDeliveryAttempts(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.listDeliveryAttempts({ jobId, tenantId });
  }

  async getJob(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const job = await this.repository.getJobDetail({ jobId, tenantId });
    if (!job) {
      throw new BadRequestException("Notification job was not found.");
    }
    return job;
  }

  listPreferences(
    actor: AuthenticatedUser,
    input: {
      notificationType?: string | undefined;
      userId?: string | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.repository.listPreferences({
      notificationType: input.notificationType,
      tenantId,
      userId: input.userId,
    });
  }

  listAuditTimeline(
    actor: AuthenticatedUser,
    input: {
      limit?: number | undefined;
      q?: string | undefined;
      targetId?: string | undefined;
      targetType?: string | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    this.requirePermission(actor, "audit.read");
    return this.repository.listAuditTimeline({
      limit: Math.min(input.limit ?? 50, 100),
      q: input.q,
      targetId: input.targetId,
      targetType: input.targetType,
      tenantId,
    });
  }

  async upsertPreference(
    actor: AuthenticatedUser,
    input: {
      channel: "email";
      frequency: "daily" | "default" | "disabled" | "immediate" | "monthly" | "weekly";
      isEnabled: boolean;
      notificationType: string;
      userId: string;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const isMandatory = this.isMandatory(input.notificationType);
    if (isMandatory && (!input.isEnabled || input.frequency === "disabled")) {
      throw new BadRequestException("Mandatory account and security notifications cannot be disabled.");
    }
    const preference = await this.repository.upsertPreference({
      actorUserId: actor.id,
      channel: input.channel,
      frequency: input.frequency,
      isEnabled: input.frequency === "disabled" ? false : input.isEnabled,
      isMandatory,
      notificationType: input.notificationType,
      tenantId,
      userId: input.userId,
    });
    await this.audit.write({
      action: "notification_preference.update",
      actorUserId: actor.id,
      details: {
        channel: preference.channel,
        frequency: preference.frequency,
        isEnabled: preference.isEnabled,
        isMandatory: preference.isMandatory,
        notificationType: preference.notificationType,
        userId: preference.userId,
      },
      summary: "Updated notification preference",
      targetId: preference.id,
      targetType: "notification_preference",
      tenantId,
    });
    return preference;
  }

  async status(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const graphConfigured = this.graph.isConfigured();
    const rules = await this.repository.listRules(tenantId);
    const ruleByType = new Map(rules.map((rule) => [rule.notificationType, rule]));
    return {
      deliveryMode: graphConfigured ? "microsoft_graph" : "stub",
      emailTypes: EMAIL_CAPABILITIES.map((capability) => {
        const rule = ruleByType.get(capability.notificationType);
        const enabledByRule = rule?.isEnabled !== false;
        return {
          blockingReason: !graphConfigured
            ? "Microsoft Graph is not configured."
            : !enabledByRule
              ? "Notification rule is disabled."
              : null,
          canSend: graphConfigured && enabledByRule,
          category: capability.category,
          enabledByRule,
          label: capability.label,
          notificationType: capability.notificationType,
          ruleGated: true,
        };
      }),
      graphConfigured,
    };
  }

  async updateRule(
    actor: AuthenticatedUser,
    input: {
      cadence: "daily" | "manual" | "monthly" | "weekly";
      isEnabled: boolean;
      notificationType:
        | "export_ready"
        | "import_completed"
        | "import_failed"
        | "password_changed"
        | "password_reset"
        | "security_alert"
        | "user_welcome"
        | "delayed_case_alert"
        | "entity_monthly_digest"
        | "manager_daily_snapshot"
        | "off_track_case_alert"
        | "rc_po_expiry"
        | "stale_tender";
      recipientMode:
        | "entity_admin"
        | "entity_admin_and_group_viewer"
        | "explicit"
        | "group_viewer"
        | "owner"
        | "owner_or_entity";
      subjectTemplate?: string | null;
      thresholdDays?: number | null;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    return this.db.transaction(async () => {
      const rule = await this.repository.upsertRule({
        ...input,
        actorUserId: actor.id,
        tenantId,
      });
      await this.audit.write({
        action: "notification_rule.update",
        actorUserId: actor.id,
        details: {
          cadence: rule.cadence,
          isEnabled: rule.isEnabled,
          notificationType: rule.notificationType,
          recipientMode: rule.recipientMode,
          thresholdDays: rule.thresholdDays,
        },
        summary: "Updated notification rule",
        targetId: rule.id,
        targetType: "notification_rule",
        tenantId,
      });
      return rule;
    });
  }

  async createJob(
    actor: AuthenticatedUser,
    input: {
      notificationType: string;
      recipientEmail: string;
      subject: string;
      textBody?: string | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    if (this.isSystemOnly(input.notificationType)) {
      throw new BadRequestException("This transactional email is sent only by its system workflow.");
    }
    this.graph.assertConfigured();
    const enabled = await this.repository.isRuleEnabled(tenantId, input.notificationType);
    if (!enabled) {
      throw new BadRequestException("Notification template is disabled. Enable it before sending this email.");
    }
    return this.db.transaction(async () => {
      const result = await this.repository.createNotificationJob({
        ...input,
        ...buildNotificationJobEmail({
          actorEmail: actor.email,
          appUrl: this.config.get<string>("APP_URL", "http://localhost:5175"),
          notificationType: input.notificationType,
          subject: input.subject,
          textBody: input.textBody,
        }),
        tenantId,
      });
      await this.outbox.write({
        aggregateId: result.id,
        aggregateType: "notification_job",
        eventType: "notification_job.created",
        payload: {
          actorUserId: actor.id,
          notificationType: input.notificationType,
        },
        tenantId,
      });
      await this.audit.write({
        action: "notification_job.create",
        actorUserId: actor.id,
        summary: "Created notification job",
        targetId: result.id,
        targetType: "notification_job",
        tenantId,
      });
      return result;
    });
  }

  async retryJob(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    this.graph.assertConfigured();
    return this.db.transaction(async () => {
      const result = await this.repository.markJobQueuedForRetry({
        jobId,
        tenantId,
      });
      if (!result) {
        throw new BadRequestException("Only failed or cancelled notification jobs can be retried.");
      }
      await this.outbox.write({
        aggregateId: result.id,
        aggregateType: "notification_job",
        eventType: "notification_job.created",
        payload: {
          actorUserId: actor.id,
          retry: true,
        },
        tenantId,
      });
      await this.audit.write({
        action: "notification_job.retry",
        actorUserId: actor.id,
        summary: "Retried notification job",
        targetId: result.id,
        targetType: "notification_job",
        tenantId,
      });
      return result;
    });
  }

  async resendJob(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    this.graph.assertConfigured();
    return this.db.transaction(async () => {
      const result = await this.repository.cloneJobForResend({
        actorUserId: actor.id,
        jobId,
        tenantId,
      });
      if (!result) {
        throw new BadRequestException("Only sent, failed, cancelled, or dead-letter notification jobs can be resent.");
      }
      await this.outbox.write({
        aggregateId: result.id,
        aggregateType: "notification_job",
        eventType: "notification_job.created",
        payload: {
          actorUserId: actor.id,
          originalJobId: jobId,
          resend: true,
        },
        tenantId,
      });
      await this.audit.write({
        action: "notification_job.resend",
        actorUserId: actor.id,
        details: { originalJobId: jobId },
        summary: "Resent notification job",
        targetId: result.id,
        targetType: "notification_job",
        tenantId,
      });
      return result;
    });
  }


  async cancelJob(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const result = await this.repository.cancelQueuedJob({ jobId, tenantId });
    if (!result) {
      throw new BadRequestException("Only queued or failed notification jobs can be cancelled.");
    }
    await this.audit.write({
      action: "notification_job.cancel",
      actorUserId: actor.id,
      summary: "Cancelled notification job",
      targetId: result.id,
      targetType: "notification_job",
      tenantId,
    });
    return result;
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!hasExpandedPermission(actor, permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }

  private isSystemOnly(notificationType: string): boolean {
    return SYSTEM_ONLY_NOTIFICATION_TYPES.includes(
      notificationType as (typeof SYSTEM_ONLY_NOTIFICATION_TYPES)[number],
    );
  }

  private isMandatory(notificationType: string): boolean {
    return MANDATORY_NOTIFICATION_TYPES.includes(
      notificationType as (typeof MANDATORY_NOTIFICATION_TYPES)[number],
    );
  }

  private previewTypeForSchedule(notificationType: string):
    | "delayed_case_alert"
    | "entity_monthly_digest"
    | "manager_daily_snapshot"
    | "off_track_case_alert"
    | "rc_po_expiry"
    | "stale_tender"
    | null {
    if (
      notificationType === "delayed_case_alert" ||
      notificationType === "entity_monthly_digest" ||
      notificationType === "manager_daily_snapshot" ||
      notificationType === "off_track_case_alert" ||
      notificationType === "rc_po_expiry" ||
      notificationType === "stale_tender"
    ) {
      return notificationType;
    }
    return null;
  }
}
