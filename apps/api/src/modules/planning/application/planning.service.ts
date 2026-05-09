import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import { PlanningDatePolicy } from "../domain/planning-date.policy.js";
import {
  PlanningRepository,
  type ExpiryFilters,
  type ListPlanningFilters,
  type RcPoPlanInput,
  type TenderPlanInput,
  type UpdateRcPoPlanInput,
  type UpdateTenderPlanInput,
} from "../infrastructure/planning.repository.js";

@Injectable()
export class PlanningService {
  constructor(
    private readonly repository: PlanningRepository,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  listTenderPlans(actor: AuthenticatedUser, filters: ListPlanningFilters) {
    const tenantId = this.requireTenant(actor);
    return this.repository.listTenderPlans({
      filters: this.limitFilters(filters),
      scope: this.scope(actor),
      tenantId,
    });
  }

  async createTenderPlan(actor: AuthenticatedUser, input: TenderPlanInput) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "planning.manage");
    this.assertEntityWriteAllowed(actor, input.entityId);
    return this.db.transaction(async () => {
      const result = await this.repository.createTenderPlan({
        ...input,
        actorUserId: actor.id,
        tenantId,
      });
      await this.audit.write({
        action: "planning.tender_plan.create",
        actorUserId: actor.id,
        summary: "Created tender plan case",
        targetId: result.id,
        targetType: "tender_plan_case",
        tenantId,
      });
      await this.emitPlanningEvent(tenantId, result.id, "tender_plan.created", {
        actorUserId: actor.id,
        entityId: input.entityId,
      });
      return result;
    });
  }

  async updateTenderPlan(actor: AuthenticatedUser, input: Omit<UpdateTenderPlanInput, "actorUserId" | "tenantId">) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "planning.manage");
    if (input.entityId) this.assertEntityWriteAllowed(actor, input.entityId);
    await this.db.transaction(async () => {
      await this.repository.updateTenderPlan({
        ...input,
        actorUserId: actor.id,
        tenantId,
      });
      await this.audit.write({
        action: "planning.tender_plan.update",
        actorUserId: actor.id,
        summary: "Updated tender plan case",
        targetId: input.planId,
        targetType: "tender_plan_case",
        tenantId,
      });
    });
  }

  listRcPoPlans(actor: AuthenticatedUser, filters: ListPlanningFilters) {
    const tenantId = this.requireTenant(actor);
    return this.repository.listRcPoPlans({
      filters: this.limitFilters(filters),
      scope: this.scope(actor),
      tenantId,
    });
  }

  async createRcPoPlan(actor: AuthenticatedUser, input: RcPoPlanInput) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "planning.manage");
    this.assertEntityWriteAllowed(actor, input.entityId);
    this.validateRcPoDates(input);
    return this.db.transaction(async () => {
      const result = await this.repository.createRcPoPlan({
        ...input,
        actorUserId: actor.id,
        tenantId,
      });
      await this.audit.write({
        action: "planning.rc_po_plan.create",
        actorUserId: actor.id,
        summary: "Created RC/PO plan",
        targetId: result.id,
        targetType: "rc_po_plan",
        tenantId,
      });
      await this.emitPlanningEvent(tenantId, result.id, "rc_po_plan.created", {
        actorUserId: actor.id,
        entityId: input.entityId,
      });
      return result;
    });
  }

  async updateRcPoPlan(actor: AuthenticatedUser, input: Omit<UpdateRcPoPlanInput, "actorUserId" | "tenantId">) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "planning.manage");
    if (input.entityId) this.assertEntityWriteAllowed(actor, input.entityId);
    this.validateRcPoDates(input);
    try {
      await this.db.transaction(async () => {
        await this.repository.updateRcPoPlan({
          ...input,
          actorUserId: actor.id,
          tenantId,
        });
        await this.audit.write({
          action: "planning.rc_po_plan.update",
          actorUserId: actor.id,
          summary: "Updated RC/PO plan",
          targetId: input.planId,
          targetType: "rc_po_plan",
          tenantId,
        });
        await this.emitPlanningEvent(tenantId, input.planId, "rc_po_plan.updated", {
          actorUserId: actor.id,
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "RC/PO plan date invalid.") {
        throw new BadRequestException({
          errors: ["RC/PO validity date cannot be before RC/PO award date."],
          message: "Planning validation failed.",
        });
      }
      throw error;
    }
  }

  listExpiryRows(actor: AuthenticatedUser, filters: ExpiryFilters) {
    const tenantId = this.requireTenant(actor);
    if (
      !actor.isPlatformSuperAdmin &&
      !actor.permissions.includes("report.read") &&
      !actor.permissions.includes("planning.manage")
    ) {
      throw new ForbiddenException("Missing expiry read permission.");
    }
    return this.repository.listExpiryRows({
      filters: { ...this.limitFilters(filters), days: filters.days ?? 120 },
      scope: this.scope(actor),
      tenantId,
    });
  }

  private scope(actor: AuthenticatedUser) {
    if (actor.isPlatformSuperAdmin || actor.permissions.includes("case.read.all")) {
      return { actorUserId: actor.id, assignedOnly: false, entityIds: [], tenantWide: true };
    }
    if (actor.permissions.includes("case.read.entity") || actor.permissions.includes("planning.manage")) {
      return {
        actorUserId: actor.id,
        assignedOnly: false,
        entityIds: actor.entityIds,
        tenantWide: false,
      };
    }
    return { actorUserId: actor.id, assignedOnly: true, entityIds: [], tenantWide: false };
  }

  private limitFilters(filters: ListPlanningFilters): ListPlanningFilters {
    return {
      ...filters,
      limit: Math.min(filters.limit ?? 25, 100),
    };
  }

  private assertEntityWriteAllowed(actor: AuthenticatedUser, entityId: string) {
    if (actor.isPlatformSuperAdmin || actor.permissions.includes("case.update.all")) return;
    if (!actor.entityIds.includes(entityId)) {
      throw new ForbiddenException("Planning changes are restricted to mapped entities.");
    }
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.isPlatformSuperAdmin && !actor.permissions.includes(permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }

  private validateRcPoDates(input: {
    rcPoAwardDate?: string | null;
    rcPoValidityDate?: string | null;
  }) {
    const errors = new PlanningDatePolicy().validateRcPoDates(input);
    if (errors.length) {
      throw new BadRequestException({ errors, message: "Planning validation failed." });
    }
  }

  private async emitPlanningEvent(
    tenantId: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    await this.outbox.write({
      aggregateId,
      aggregateType: "planning",
      eventType,
      payload,
      tenantId,
    });
  }
}
