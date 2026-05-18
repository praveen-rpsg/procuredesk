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
import { buildNotificationJobEmail } from "./email-templates.js";

const SYSTEM_ONLY_NOTIFICATION_TYPES = [
  "password_changed",
  "password_reset",
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
  { category: "Operations", label: "Entity Monthly Digest", notificationType: "entity_monthly_digest" },
  { category: "Operations", label: "No Recent Update Reminder", notificationType: "stale_tender" },
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
      recipientMode: "entity_admin" | "explicit" | "owner" | "owner_or_entity";
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
}
