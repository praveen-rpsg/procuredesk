import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { addDaysToDateOnly } from "../../../common/utils/date-only.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import { CatalogService } from "../../catalog/application/catalog.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import { CaseAssignmentPolicy } from "../domain/case-assignment.policy.js";
import { CaseChronologyPolicy } from "../domain/case-chronology.policy.js";
import { CaseDelayPolicy } from "../domain/case-delay.policy.js";
import { CaseStagePolicy } from "../domain/case-stage.policy.js";
import { CaseVisibilityPolicy } from "../domain/case-visibility.policy.js";
import type {
  CaseDelay,
  CaseFinancials,
  CaseMilestones,
  ProcurementCaseAggregate,
} from "../domain/case-aggregate.js";
import {
  ProcurementCaseRepository,
  type CaseListFilters,
} from "../infrastructure/procurement-case.repository.js";

type CaseListCursor = {
  id: string;
  timestamp: string;
};

export type CreateCaseCommand = {
  budgetTypeId?: string | null;
  cpcInvolved?: boolean | null;
  departmentId?: string | null;
  entityId: string;
  financials: CaseFinancials;
  natureOfWorkId?: string | null;
  ownerUserId?: string | null;
  prDescription?: string | null;
  prId: string;
  prReceiptDate?: string | null;
  prReceivingMediumId?: string | null;
  prRemarks?: string | null;
  prSchemeNo?: string | null;
  priorityCase?: boolean;
  tenderTypeId?: string | null;
  tentativeCompletionDate?: string | null;
};

export type UpdateCaseCommand = {
  financials?: CaseFinancials;
  prDescription?: string | null;
  prRemarks?: string | null;
  prSchemeNo?: string | null;
  priorityCase?: boolean;
  tenderName?: string | null;
  tenderNo?: string | null;
  tentativeCompletionDate?: string | null;
  tmRemarks?: string | null;
};

@Injectable()
export class ProcurementCaseService {
  constructor(
    private readonly repository: ProcurementCaseRepository,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly catalog: CatalogService,
  ) {}

  async createCase(actor: AuthenticatedUser, command: CreateCaseCommand) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "case.create");

    const ownerUserId = command.ownerUserId ?? actor.id;
    await this.catalog.assertProcurementCaseSelections({
      budgetTypeId: command.budgetTypeId ?? null,
      natureOfWorkId: command.natureOfWorkId ?? null,
      prReceivingMediumId: command.prReceivingMediumId ?? null,
      tenderTypeId: command.tenderTypeId ?? null,
      tenantId,
    });
    const tentativeCompletionDate =
      command.tentativeCompletionDate ??
      (await this.deriveTentativeCompletionDate({
        prReceiptDate: command.prReceiptDate ?? null,
        tenderTypeId: command.tenderTypeId ?? null,
        tenantId,
      }));
    await this.assertOwnerAssignmentAllowed(actor, command.entityId, ownerUserId);

    const milestones: CaseMilestones = {};
    const stagePolicy = new CaseStagePolicy();
    const status = stagePolicy.deriveStatus(milestones);
    const stageCode = stagePolicy.deriveActualStageCode(milestones);
    const desiredStageCode = stagePolicy.deriveDesiredStageCode({
      prReceiptDate: command.prReceiptDate ?? null,
      status,
      tentativeCompletionDate,
    });

    return this.db.transaction(async () => {
      const result = await this.repository.createCase({
        actorUserId: actor.id,
        budgetTypeId: command.budgetTypeId ?? null,
        cpcInvolved: command.cpcInvolved ?? null,
        departmentId: command.departmentId ?? null,
        desiredStageCode,
        entityId: command.entityId,
        financials: command.financials,
        isDelayed: stagePolicy.isDelayed(stageCode, desiredStageCode),
        natureOfWorkId: command.natureOfWorkId ?? null,
        ownerUserId,
        prDescription: command.prDescription ?? null,
        prId: command.prId,
        prReceiptDate: command.prReceiptDate ?? null,
        prReceivingMediumId: command.prReceivingMediumId ?? null,
        prRemarks: command.prRemarks ?? null,
        prSchemeNo: command.prSchemeNo ?? null,
        priorityCase: command.priorityCase ?? false,
        stageCode,
        status,
        tenantId,
        tenderTypeId: command.tenderTypeId ?? null,
        tentativeCompletionDate,
      });

      await this.audit.write({
        action: "case.create",
        actorUserId: actor.id,
        details: { prId: command.prId },
        summary: `Created procurement case ${command.prId}`,
        targetId: result.id,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(tenantId, result.id, "procurement_case.created", {
        actorUserId: actor.id,
        entityId: command.entityId,
        ownerUserId,
        prId: command.prId,
        stageCode,
        status,
      });

      return result;
    });
  }

  async listCases(
    actor: AuthenticatedUser,
    filters: CaseListFilters & { cursor?: string; limit?: number },
  ) {
    const tenantId = this.requireTenant(actor);
    const scope = new CaseVisibilityPolicy().listScope(actor);
    return this.repository.listCases({
      cursor: this.parseListCursor(filters.cursor),
      filters,
      limit: Math.min(filters.limit ?? 25, 100),
      scope: { ...scope, actorUserId: actor.id },
      tenantId,
    });
  }

  async listDeletedCases(
    actor: AuthenticatedUser,
    filters: Pick<CaseListFilters, "q" | "status"> & { cursor?: string; limit?: number },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "case.restore");
    return this.repository.listDeletedCases({
      cursor: this.parseListCursor(filters.cursor),
      filters,
      limit: Math.min(filters.limit ?? 25, 100),
      tenantId,
    });
  }

  async getCase(actor: AuthenticatedUser, caseId: string) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.repository.getCase(tenantId, caseId);
    if (!kase) {
      throw new NotFoundException("Case not found.");
    }
    if (!new CaseVisibilityPolicy().canReadCase(actor, kase)) {
      throw new ForbiddenException("Case access denied.");
    }
    return this.presentCaseForActor(actor, kase);
  }

  async updateCase(actor: AuthenticatedUser, caseId: string, command: UpdateCaseCommand) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanUpdate(actor, caseId);
    const kase = command.tentativeCompletionDate !== undefined ? await this.getCase(actor, caseId) : null;
    const targetUpdate = kase
      ? this.buildTentativeCompletionUpdate(actor, kase, command.tentativeCompletionDate ?? null)
      : {};
    await this.db.transaction(async () => {
      await this.repository.updateCase({
        caseId,
        tenantId,
        updatedBy: actor.id,
        ...targetUpdate,
        ...command,
      });
      await this.audit.write({
        action: "case.update",
        actorUserId: actor.id,
        summary: "Updated procurement case",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(tenantId, caseId, "procurement_case.updated", {
        actorUserId: actor.id,
        changedFields: Object.keys(command),
      });
    });
  }

  async assignOwner(actor: AuthenticatedUser, caseId: string, ownerUserId: string) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.getCase(actor, caseId);
    this.assertCanUpdateEntityManagedFields(actor, kase.entityId);
    await this.assertOwnerAssignmentAllowed(actor, kase.entityId, ownerUserId);
    await this.db.transaction(async () => {
      await this.repository.updateAssignment({
        caseId,
        ownerUserId,
        tenantId,
        updatedBy: actor.id,
      });
      await this.audit.write({
        action: "case.assign",
        actorUserId: actor.id,
        details: { ownerUserId },
        summary: "Assigned procurement case owner",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(tenantId, caseId, "procurement_case.owner_assigned", {
        actorUserId: actor.id,
        ownerUserId,
      });
    });
  }

  async updateMilestones(actor: AuthenticatedUser, caseId: string, milestones: CaseMilestones) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanUpdate(actor, caseId);
    const kase = await this.getCase(actor, caseId);
    const chronologyErrors = new CaseChronologyPolicy().validate({
      estimateBenchmark: kase.financials.estimateBenchmark ?? null,
      milestones,
      prReceiptDate: kase.prReceiptDate,
    });
    if (chronologyErrors.length) {
      throw new BadRequestException({ message: "Chronology validation failed.", chronologyErrors });
    }

    const stagePolicy = new CaseStagePolicy();
    const status = stagePolicy.deriveStatus(milestones);
    const stageCode = stagePolicy.deriveActualStageCode(milestones);
    const desiredStageCode = stagePolicy.deriveDesiredStageCode({
      prReceiptDate: kase.prReceiptDate,
      status,
      tentativeCompletionDate: kase.tentativeCompletionDate,
    });

    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [
      {
        eventType: "procurement_case.milestones_updated",
        payload: { actorUserId: actor.id, stageCode, status },
      },
    ];
    if (kase.status !== "completed" && status === "completed") {
      events.push({
        eventType: "procurement_case.completed",
        payload: { actorUserId: actor.id, completedStageCode: stageCode },
      });
    }
    if (!kase.isDelayed && stagePolicy.isDelayed(stageCode, desiredStageCode)) {
      events.push({
        eventType: "procurement_case.delayed",
        payload: { actorUserId: actor.id, desiredStageCode, stageCode },
      });
    }
    await this.db.transaction(async () => {
      await this.repository.updateMilestones({
        caseId,
        desiredStageCode,
        isDelayed: stagePolicy.isDelayed(stageCode, desiredStageCode),
        milestones,
        stageCode,
        status,
        tenantId,
        updatedBy: actor.id,
      });

      await this.audit.write({
        action: "case.milestones.update",
        actorUserId: actor.id,
        details: { stageCode, status },
        summary: "Updated procurement case milestones",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.outbox.writeMany(
        events.map((event) => ({
          aggregateId: caseId,
          aggregateType: "procurement_case",
          eventType: event.eventType,
          payload: event.payload,
          tenantId,
        })),
      );
    });
  }

  async updateDelay(actor: AuthenticatedUser, caseId: string, delay: CaseDelay) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.getCase(actor, caseId);
    if (
      actor.isPlatformSuperAdmin ||
      actor.permissions.includes("case.update.all") ||
      (actor.permissions.includes("case.delay.manage.entity") &&
        actor.entityIds.includes(kase.entityId))
    ) {
      // allowed
    } else {
      throw new ForbiddenException("Delay update denied.");
    }

    const errors = new CaseDelayPolicy().validate(delay);
    if (errors.length) {
      throw new BadRequestException({ message: "Delay validation failed.", errors });
    }

    await this.db.transaction(async () => {
      await this.repository.updateDelay({ caseId, delay, tenantId, updatedBy: actor.id });
      await this.audit.write({
        action: "case.delay.update",
        actorUserId: actor.id,
        summary: "Updated procurement case delay information",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(tenantId, caseId, "procurement_case.delay_updated", {
        actorUserId: actor.id,
        delayExternalDays: delay.delayExternalDays ?? null,
      });
    });
  }

  async deleteCase(actor: AuthenticatedUser, caseId: string, deleteReason?: string | null) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "case.delete");
    await this.db.transaction(async () => {
      await this.repository.softDelete({
        caseId,
        deletedBy: actor.id,
        deleteReason: deleteReason ?? null,
        tenantId,
      });
      await this.audit.write({
        action: "case.delete",
        actorUserId: actor.id,
        summary: "Deleted procurement case",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(tenantId, caseId, "procurement_case.deleted", {
        actorUserId: actor.id,
        deleteReason: deleteReason ?? null,
      });
    });
  }

  async restoreCase(actor: AuthenticatedUser, caseId: string): Promise<void> {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "case.restore");
    await this.db.transaction(async () => {
      const restoreResult = await this.repository.restore({
        caseId,
        tenantId,
        updatedBy: actor.id,
      });
      if (restoreResult === "not_found") {
        throw new NotFoundException("Deleted case not found.");
      }
      if (restoreResult === "already_active") {
        throw new ConflictException("Case is already active.");
      }
      if (restoreResult === "duplicate_active_case") {
        throw new ConflictException(
          "Cannot restore this case because another active case already uses the same Case ID.",
        );
      }
      await this.audit.write({
        action: "case.restore",
        actorUserId: actor.id,
        summary: "Restored procurement case",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(tenantId, caseId, "procurement_case.restored", {
        actorUserId: actor.id,
      });
    });
  }

  async summary(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    const scope = new CaseVisibilityPolicy().listScope(actor);
    return this.repository.summary(tenantId, { ...scope, actorUserId: actor.id });
  }

  private async assertCanUpdate(actor: AuthenticatedUser, caseId: string) {
    const kase = await this.getCase(actor, caseId);
    if (actor.isPlatformSuperAdmin || actor.permissions.includes("case.update.all")) return;
    if (actor.permissions.includes("case.update.entity") && actor.entityIds.includes(kase.entityId)) {
      return;
    }
    if (actor.permissions.includes("case.update.assigned") && kase.ownerUserId === actor.id) {
      return;
    }
    throw new ForbiddenException("Case update denied.");
  }

  private buildTentativeCompletionUpdate(
    actor: AuthenticatedUser,
    kase: Awaited<ReturnType<ProcurementCaseService["getCase"]>>,
    tentativeCompletionDate: string | null,
  ) {
    this.assertCanUpdateEntityManagedFields(actor, kase.entityId);
    const stagePolicy = new CaseStagePolicy();
    const desiredStageCode = stagePolicy.deriveDesiredStageCode({
      prReceiptDate: kase.prReceiptDate,
      status: kase.status,
      tentativeCompletionDate,
    });
    return {
      desiredStageCode,
      isDelayed: stagePolicy.isDelayed(kase.stageCode, desiredStageCode),
      tentativeCompletionDate,
    };
  }

  private assertCanUpdateEntityManagedFields(actor: AuthenticatedUser, entityId: string) {
    if (actor.isPlatformSuperAdmin || actor.permissions.includes("case.update.all")) return;
    if (actor.permissions.includes("case.update.entity") && actor.entityIds.includes(entityId)) {
      return;
    }
    throw new ForbiddenException(
      "Only entity-level users for this entity can update Tender Owner or Tentative Completion Date.",
    );
  }

  private async assertOwnerAssignmentAllowed(
    actor: AuthenticatedUser,
    entityId: string,
    ownerUserId: string,
  ) {
    const tenantId = this.requireTenant(actor);
    const ownerEntityIds = await this.repository.getCaseOwnerEntityScopes(ownerUserId, tenantId);
    const allowed = new CaseAssignmentPolicy().canAssignOwner({
      actorEntityIds: actor.entityIds,
      actorIsPlatformSuperAdmin: actor.isPlatformSuperAdmin,
      actorPermissions: actor.permissions,
      ownerEntityIds,
      targetEntityId: entityId,
    });
    if (!allowed) {
      throw new ForbiddenException("Owner must be an active user mapped to the same entity.");
    }
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.isPlatformSuperAdmin && !actor.permissions.includes(permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private canManageDelay(actor: AuthenticatedUser, kase: { entityId: string }) {
    return (
      actor.isPlatformSuperAdmin ||
      actor.permissions.includes("case.update.all") ||
      (actor.permissions.includes("case.delay.manage.entity") &&
        actor.entityIds.includes(kase.entityId))
    );
  }

  private presentCaseForActor(
    actor: AuthenticatedUser,
    kase: ProcurementCaseAggregate,
  ): ProcurementCaseAggregate {
    if (this.canManageDelay(actor, kase)) return kase;
    return {
      ...kase,
      delay: {
        delayExternalDays: null,
        delayReason: null,
      },
    };
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }

  private async deriveTentativeCompletionDate(input: {
    prReceiptDate: string | null;
    tenderTypeId: string | null;
    tenantId: string;
  }): Promise<string | null> {
    if (!input.prReceiptDate || !input.tenderTypeId) {
      return null;
    }
    const completionDays = await this.catalog.getTenderTypeCompletionDays({
      tenantId: input.tenantId,
      tenderTypeId: input.tenderTypeId,
    });
    if (completionDays === null) {
      return null;
    }
    return addDaysToDateString(input.prReceiptDate, completionDays);
  }

  private parseListCursor(cursor?: string): CaseListCursor | undefined {
    if (!cursor) return undefined;
    const [timestamp, id, extra] = cursor.split("|");
    if (
      extra != null ||
      !timestamp ||
      !id ||
      Number.isNaN(Date.parse(timestamp)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new BadRequestException("Invalid list cursor.");
    }
    return { id, timestamp: new Date(timestamp).toISOString() };
  }

  private async emitCaseEvent(
    tenantId: string,
    caseId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    await this.outbox.write({
      aggregateId: caseId,
      aggregateType: "procurement_case",
      eventType,
      payload,
      tenantId,
    });
  }
}

function addDaysToDateString(dateString: string, days: number): string {
  return addDaysToDateOnly(dateString, days);
}
