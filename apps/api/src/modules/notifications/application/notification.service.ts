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
    type: "entity_monthly_digest" | "rc_po_expiry" | "stale_tender",
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    if (type === "stale_tender")
      return this.repository.staleTenderPreview(tenantId);
    if (type === "entity_monthly_digest")
      return this.repository.monthlyDigestPreview(tenantId);
    return this.repository.rcPoExpiryPreview(tenantId);
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
        | "entity_monthly_digest"
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
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "notification.manage");
    this.graph.assertConfigured();
    return this.db.transaction(async () => {
      const result = await this.repository.createNotificationJob({
        ...input,
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
