import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import { MicrosoftGraphEmailAdapter } from "../infrastructure/microsoft-graph-email.adapter.js";
import { NotificationRepository } from "../infrastructure/notification.repository.js";

@Injectable()
export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly graph: MicrosoftGraphEmailAdapter,
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

  status(actor: AuthenticatedUser) {
    this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    const graphConfigured = this.graph.isConfigured();
    return {
      deliveryMode: graphConfigured ? "microsoft_graph" : "stub",
      graphConfigured,
    };
  }

  async updateRule(
    actor: AuthenticatedUser,
    input: {
      cadence: "daily" | "manual" | "monthly" | "weekly";
      isEnabled: boolean;
      notificationType:
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
    this.graph.assertConfigured();
    return this.db.transaction(async () => {
      const result = await this.repository.createNotificationJob({
        ...input,
        textBody:
          input.textBody ??
          `${input.subject}\n\nNotification type: ${input.notificationType}`,
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
}
