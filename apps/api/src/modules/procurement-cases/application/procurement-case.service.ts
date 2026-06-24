import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import {
  addDaysToDateOnly,
  todayDateOnlyString,
} from "../../../common/utils/date-only.js";
import { DatabaseService } from "../../../database/database.service.js";
import type { EnvConfig } from "../../../config/env.schema.js";
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
  type CaseCleanupCandidate,
  type CaseListFilters,
} from "../infrastructure/procurement-case.repository.js";

type CaseListCursor = {
  id: string;
  timestamp: string;
};

export type CreateCaseCommand = {
  budgetTypeId?: string | null;
  contractType?: "PO" | "RC" | null;
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
  budgetTypeId?: string | null;
  contractType?: "PO" | "RC" | null;
  cpcInvolved?: boolean | null;
  departmentId?: string | null;
  entityId?: string;
  financials?: CaseFinancials;
  natureOfWorkId?: string | null;
  prDescription?: string | null;
  prReceiptDate?: string | null;
  prRemarks?: string | null;
  prSchemeNo?: string | null;
  priorityCase?: boolean;
  tenderName?: string | null;
  tenderNo?: string | null;
  tenderTypeId?: string | null;
  tentativeCompletionDate?: string | null;
  tmRemarks?: string | null;
};

export type CaseCleanupPreviewCommand = {
  caseIds?: string[];
  importJobId?: string;
  mode: "case_ids" | "import_job" | "pr_ids";
  ownerUserId?: string;
  prIds?: string[];
};

export type CaseCleanupExecuteCommand = {
  confirmationText: string;
  previewToken: string;
  reason: string;
};

type CaseCleanupPreviewToken = {
  actorUserId: string;
  cases: Array<{ id: string; updatedAt: string }>;
  criteria: CaseCleanupPreviewCommand;
  expiresAt: string;
  safeCount: number;
  tenantId: string;
};

type CleanupRisk = "blocked" | "safe" | "warning";

@Injectable()
export class ProcurementCaseService {
  constructor(
    private readonly repository: ProcurementCaseRepository,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly catalog: CatalogService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async createCase(actor: AuthenticatedUser, command: CreateCaseCommand) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "case.create");
    this.assertPrReceiptDateNotFuture(command.prReceiptDate ?? null);

    const ownerUserId = command.ownerUserId ?? actor.id;
    await this.catalog.assertProcurementCaseSelections({
      budgetTypeId: command.budgetTypeId ?? null,
      natureOfWorkId: command.natureOfWorkId ?? null,
      prReceivingMediumId: command.prReceivingMediumId ?? null,
      tenderTypeId: command.tenderTypeId ?? null,
      tenantId,
    });
    const requestedTentativeCompletionDate =
      command.tentativeCompletionDate ?? null;
    const derivedTentativeCompletionDate =
      await this.deriveTentativeCompletionDate({
        prReceiptDate: command.prReceiptDate ?? null,
        tenderTypeId: command.tenderTypeId ?? null,
        tenantId,
      });
    const canOverrideTentativeCompletionDate =
      this.canUpdateEntityManagedFields(actor, command.entityId);
    if (
      !canOverrideTentativeCompletionDate &&
      derivedTentativeCompletionDate &&
      requestedTentativeCompletionDate &&
      requestedTentativeCompletionDate !== derivedTentativeCompletionDate
    ) {
      throw new ForbiddenException(
        "Tentative Completion Date is auto-calculated for tender owners.",
      );
    }
    const tentativeCompletionDate = canOverrideTentativeCompletionDate
      ? (requestedTentativeCompletionDate ?? derivedTentativeCompletionDate)
      : (derivedTentativeCompletionDate ?? requestedTentativeCompletionDate);
    await this.assertOwnerAssignmentAllowed(
      actor,
      command.entityId,
      ownerUserId,
    );

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
        contractType: command.contractType ?? null,
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
      await this.emitCaseEvent(
        tenantId,
        result.id,
        "procurement_case.created",
        {
          actorUserId: actor.id,
          entityId: command.entityId,
          ownerUserId,
          prId: command.prId,
          stageCode,
          status,
        },
      );

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
    filters: Pick<CaseListFilters, "q" | "status"> & {
      cursor?: string;
      limit?: number;
    },
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

  async previewCaseCleanup(actor: AuthenticatedUser, command: CaseCleanupPreviewCommand) {
    const tenantId = this.requireTenant(actor);
    this.requireAdminCleanupPermission(actor);
    const criteria = this.normalizeCleanupCriteria(command);
    const candidates = await this.repository.listCleanupCandidates({
      ...criteria,
      tenantId,
    });
    const rows = candidates.map((candidate) => this.classifyCleanupCandidate(criteria, candidate));
    const safeRows = rows.filter((row) => row.risk === "safe");
    const token = this.signCleanupPreview({
      actorUserId: actor.id,
      cases: safeRows.map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
      criteria,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      safeCount: safeRows.length,
      tenantId,
    });
    return {
      blockedCount: rows.filter((row) => row.risk === "blocked").length,
      expiresAt: this.verifyCleanupPreview(token).expiresAt,
      previewToken: token,
      rows,
      safeCount: safeRows.length,
      totalCount: rows.length,
      warningCount: rows.filter((row) => row.risk === "warning").length,
    };
  }

  async listCaseCleanupImportJobs(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requireAdminCleanupPermission(actor);
    return this.repository.listCleanupImportJobs(tenantId);
  }

  async listCaseCleanupOwnerOptions(actor: AuthenticatedUser, command: CaseCleanupPreviewCommand) {
    const tenantId = this.requireTenant(actor);
    this.requireAdminCleanupPermission(actor);
    const { ownerUserId: _ownerUserId, ...criteriaInput } = command;
    const criteria = this.normalizeCleanupCriteria(criteriaInput);
    const owners = await this.repository.listCleanupOwnerOptions({
      ...criteria,
      tenantId,
    });
    return owners;
  }

  async executeCaseCleanup(actor: AuthenticatedUser, command: CaseCleanupExecuteCommand) {
    const tenantId = this.requireTenant(actor);
    this.requireAdminCleanupPermission(actor);
    const preview = this.verifyCleanupPreview(command.previewToken);
    if (preview.tenantId !== tenantId || preview.actorUserId !== actor.id) {
      throw new ForbiddenException("Cleanup preview does not belong to this session.");
    }
    if (new Date(preview.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException("Cleanup preview expired. Run preview again.");
    }
    if (!preview.cases.length) {
      throw new BadRequestException("Cleanup preview has no safe cases to delete.");
    }
    const expectedConfirmation = `DELETE ${preview.safeCount} CASES`;
    if (command.confirmationText !== expectedConfirmation) {
      throw new BadRequestException(`Type ${expectedConfirmation} to confirm cleanup.`);
    }

    const deletedCases = await this.db.transaction(async () => {
      const deleted = await this.repository.softDeleteCasesByPreview({
        cases: preview.cases,
        deletedBy: actor.id,
        deleteReason: command.reason,
        tenantId,
      });
      if (deleted.length === 0) {
        throw new BadRequestException(
          "No cases were deleted. Run preview again because the selected cases may have changed.",
        );
      }
      await this.audit.write({
        action: "case.bulk_cleanup",
        actorUserId: actor.id,
        details: {
          criteria: preview.criteria,
          deletedCount: deleted.length,
          requestedSafeCount: preview.safeCount,
          skippedCount: preview.safeCount - deleted.length,
        },
        summary: `Soft deleted ${deleted.length} cases through admin cleanup`,
        targetId: null,
        targetType: "bulk_case_cleanup",
        tenantId,
      });
      await this.outbox.writeMany(
        deleted.map((kase) => ({
          aggregateId: kase.id,
          aggregateType: "procurement_case",
          eventType: "procurement_case.deleted",
          payload: {
            actorUserId: actor.id,
            bulkCleanup: true,
            deleteReason: command.reason,
          },
          tenantId,
        })),
      );
      return deleted;
    });

    return {
      deletedCount: deletedCases.length,
      deletedCaseIds: deletedCases.map((kase) => kase.id),
      requestedSafeCount: preview.safeCount,
      skippedCount: preview.safeCount - deletedCases.length,
    };
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

  async updateCase(
    actor: AuthenticatedUser,
    caseId: string,
    command: UpdateCaseCommand,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanUpdate(actor, caseId);
    const kase =
      command.prReceiptDate !== undefined ||
      command.tentativeCompletionDate !== undefined
        ? await this.getCase(actor, caseId)
        : null;
    const targetUpdate = kase
      ? this.buildScheduleUpdate(actor, kase, {
          prReceiptDate: command.prReceiptDate,
          tentativeCompletionDate: command.tentativeCompletionDate,
        })
      : {};
    if (
      command.budgetTypeId !== undefined ||
      command.natureOfWorkId !== undefined ||
      command.tenderTypeId !== undefined
    ) {
      await this.catalog.assertProcurementCaseSelections({
        budgetTypeId: command.budgetTypeId ?? null,
        natureOfWorkId: command.natureOfWorkId ?? null,
        prReceivingMediumId: null,
        tenderTypeId: command.tenderTypeId ?? null,
        tenantId,
      });
    }
    if (command.prReceiptDate !== undefined) {
      this.assertPrReceiptDateNotFuture(command.prReceiptDate ?? null);
    }
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

  async assignOwner(
    actor: AuthenticatedUser,
    caseId: string,
    ownerUserId: string,
  ) {
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
      await this.emitCaseEvent(
        tenantId,
        caseId,
        "procurement_case.owner_assigned",
        {
          actorUserId: actor.id,
          ownerUserId,
        },
      );
    });
  }

  async updateMilestones(
    actor: AuthenticatedUser,
    caseId: string,
    milestones: CaseMilestones,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanUpdate(actor, caseId);
    const kase = await this.getCase(actor, caseId);
    const normalizedMilestones = this.normalizeMilestonesForTenderType(
      kase,
      milestones,
    );
    const chronologyErrors = new CaseChronologyPolicy().validate({
      estimateBenchmark: kase.financials.estimateBenchmark ?? null,
      milestones: normalizedMilestones,
      prReceiptDate: kase.prReceiptDate,
    });
    if (chronologyErrors.length) {
      throw new BadRequestException({
        message: "Chronology validation failed.",
        chronologyErrors,
      });
    }

    const stagePolicy = new CaseStagePolicy();
    const status = stagePolicy.deriveStatus(normalizedMilestones);
    const stageCode = stagePolicy.deriveActualStageCode(normalizedMilestones);
    const desiredStageCode = stagePolicy.deriveDesiredStageCode({
      prReceiptDate: kase.prReceiptDate,
      status,
      tentativeCompletionDate: kase.tentativeCompletionDate,
    });

    const events: Array<{
      eventType: string;
      payload: Record<string, unknown>;
    }> = [
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
        milestones: normalizedMilestones,
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

  async updateDelay(
    actor: AuthenticatedUser,
    caseId: string,
    delay: CaseDelay,
  ) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.getCase(actor, caseId);
    if (!this.canManageDelay(actor, kase)) {
      throw new ForbiddenException("Delay update denied.");
    }

    const errors = new CaseDelayPolicy().validate(delay);
    if (errors.length) {
      throw new BadRequestException({
        message: "Delay validation failed.",
        errors,
      });
    }

    await this.db.transaction(async () => {
      await this.repository.updateDelay({
        caseId,
        delay,
        tenantId,
        updatedBy: actor.id,
      });
      await this.audit.write({
        action: "case.delay.update",
        actorUserId: actor.id,
        summary: "Updated procurement case delay information",
        targetId: caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitCaseEvent(
        tenantId,
        caseId,
        "procurement_case.delay_updated",
        {
          actorUserId: actor.id,
          delayExternalDays: delay.delayExternalDays ?? null,
        },
      );
    });
  }

  async deleteCase(
    actor: AuthenticatedUser,
    caseId: string,
    deleteReason?: string | null,
  ) {
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
    return this.repository.summary(tenantId, {
      ...scope,
      actorUserId: actor.id,
    });
  }

  private async assertCanUpdate(actor: AuthenticatedUser, caseId: string) {
    const kase = await this.getCase(actor, caseId);
    if (
      actor.isPlatformSuperAdmin ||
      hasExpandedPermission(actor, "case.update.all")
    )
      return;
    if (
      hasExpandedPermission(actor, "case.update.entity") &&
      actor.entityIds.includes(kase.entityId)
    ) {
      return;
    }
    if (
      hasExpandedPermission(actor, "case.update.assigned") &&
      kase.ownerUserId === actor.id
    ) {
      return;
    }
    throw new ForbiddenException("Case update denied.");
  }

  private buildScheduleUpdate(
    actor: AuthenticatedUser,
    kase: Awaited<ReturnType<ProcurementCaseService["getCase"]>>,
    input: {
      prReceiptDate?: string | null | undefined;
      tentativeCompletionDate?: string | null | undefined;
    },
  ) {
    if (input.tentativeCompletionDate !== undefined) {
      this.assertCanUpdateEntityManagedFields(actor, kase.entityId);
    }
    const prReceiptDate =
      input.prReceiptDate !== undefined ? input.prReceiptDate : kase.prReceiptDate;
    const tentativeCompletionDate =
      input.tentativeCompletionDate !== undefined
        ? input.tentativeCompletionDate
        : kase.tentativeCompletionDate;
    const stagePolicy = new CaseStagePolicy();
    const desiredStageCode = stagePolicy.deriveDesiredStageCode({
      prReceiptDate,
      status: kase.status,
      tentativeCompletionDate,
    });
    return {
      desiredStageCode,
      isDelayed: stagePolicy.isDelayed(kase.stageCode, desiredStageCode),
      tentativeCompletionDate,
    };
  }

  private assertCanUpdateEntityManagedFields(
    actor: AuthenticatedUser,
    entityId: string,
  ) {
    if (this.canUpdateEntityManagedFields(actor, entityId)) {
      return;
    }
    throw new ForbiddenException(
      "Only group-level case managers or entity-level users for this entity can update Tender Owner or Tentative Completion Date.",
    );
  }

  private canUpdateEntityManagedFields(
    actor: AuthenticatedUser,
    entityId: string,
  ): boolean {
    if (actor.isPlatformSuperAdmin) return true;
    if (
      actor.accessLevel === "GROUP" &&
      hasExpandedPermission(actor, "case.update.all")
    )
      return true;
    return (
      actor.accessLevel === "ENTITY" &&
      hasExpandedPermission(actor, "case.update.entity") &&
      actor.entityIds.includes(entityId)
    );
  }

  private async assertOwnerAssignmentAllowed(
    actor: AuthenticatedUser,
    entityId: string,
    ownerUserId: string,
  ) {
    const tenantId = this.requireTenant(actor);
    const owner = await this.repository.getCaseOwnerAssignmentProfile(
      ownerUserId,
      tenantId,
    );
    if (!owner) {
      throw new ForbiddenException("Owner must be an active tenant user.");
    }
    const allowed = new CaseAssignmentPolicy().canAssignOwner({
      actorAccessLevel: actor.accessLevel,
      actorEntityIds: actor.entityIds,
      actorIsPlatformSuperAdmin: actor.isPlatformSuperAdmin,
      actorPermissions: actor.permissions,
      actorUserId: actor.id,
      ownerAccessLevel: owner.accessLevel,
      ownerEntityIds: owner.entityIds,
      ownerUserId: owner.userId,
      targetEntityId: entityId,
    });
    if (!allowed) {
      throw new ForbiddenException(
        "Owner assignment is not allowed for this entity.",
      );
    }
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!hasExpandedPermission(actor, permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private requireAdminCleanupPermission(actor: AuthenticatedUser) {
    this.requirePermission(actor, "case.delete");
    this.requirePermission(actor, "admin.console.access");
  }

  private normalizeCleanupCriteria(command: CaseCleanupPreviewCommand): CaseCleanupPreviewCommand {
    if (command.mode === "import_job") {
      if (!command.importJobId) {
        throw new BadRequestException("Import job is required for cleanup preview.");
      }
      return {
        importJobId: command.importJobId,
        mode: "import_job",
        ...(command.ownerUserId ? { ownerUserId: command.ownerUserId } : {}),
      };
    }
    if (command.mode === "case_ids") {
      const caseIds = [...new Set((command.caseIds ?? []).map((item) => item.trim()).filter(Boolean))];
      if (!caseIds.length) {
        throw new BadRequestException("At least one Case ID is required.");
      }
      return {
        caseIds,
        mode: "case_ids",
        ...(command.ownerUserId ? { ownerUserId: command.ownerUserId } : {}),
      };
    }
    const prIds = [...new Set((command.prIds ?? []).map((item) => item.trim()).filter(Boolean))];
    if (!prIds.length) {
      throw new BadRequestException("At least one PR/Scheme No. is required.");
    }
    return {
      mode: "pr_ids",
      ...(command.ownerUserId ? { ownerUserId: command.ownerUserId } : {}),
      prIds,
    };
  }

  private classifyCleanupCandidate(
    criteria: CaseCleanupPreviewCommand,
    candidate: CaseCleanupCandidate,
  ) {
    const reasons: string[] = [];
    let risk: CleanupRisk = "safe";
    if (criteria.mode === "import_job") {
      if (candidate.importType !== "tender_cases") {
        reasons.push("Import job is not a tender case import.");
        risk = "blocked";
      }
      if (candidate.importJobStatus !== "committed") {
        reasons.push("Import job is not committed.");
        risk = "blocked";
      }
      if (candidate.importAction !== "create") {
        reasons.push("Import row updated an existing case and needs manual review.");
        risk = "blocked";
      }
      if (
        candidate.importCommittedAt &&
        new Date(candidate.updatedAt).getTime() > new Date(candidate.importCommittedAt).getTime()
      ) {
        reasons.push("Case changed after import commit.");
        if (risk !== "blocked") risk = "warning";
      }
    }
    if (candidate.awardCount > 0) {
      reasons.push("Case has award records.");
      if (risk !== "blocked") risk = "warning";
    }
    if (candidate.delayCount > 0) {
      reasons.push("Case has delay records.");
      if (risk !== "blocked") risk = "warning";
    }
    return {
      ...candidate,
      reasons,
      risk,
    };
  }

  private signCleanupPreview(payload: CaseCleanupPreviewToken): string {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = this.cleanupSignature(body);
    return `${body}.${signature}`;
  }

  private verifyCleanupPreview(token: string): CaseCleanupPreviewToken {
    const [body, signature] = token.split(".");
    if (!body || !signature) {
      throw new BadRequestException("Cleanup preview token is invalid.");
    }
    const expected = this.cleanupSignature(body);
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new BadRequestException("Cleanup preview token is invalid.");
    }
    try {
      const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CaseCleanupPreviewToken;
      if (!parsed.tenantId || !parsed.actorUserId || !Array.isArray(parsed.cases)) {
        throw new Error("Invalid token payload.");
      }
      return parsed;
    } catch {
      throw new BadRequestException("Cleanup preview token is invalid.");
    }
  }

  private cleanupSignature(body: string): string {
    return createHmac("sha256", this.config.getOrThrow("SESSION_SECRET"))
      .update(body)
      .digest("base64url");
  }

  private canManageDelay(actor: AuthenticatedUser, _kase: { entityId: string }) {
    return actor.isPlatformSuperAdmin;
  }

  private canViewDelay(actor: AuthenticatedUser) {
    return actor.isPlatformSuperAdmin;
  }

  private presentCaseForActor(
    actor: AuthenticatedUser,
    kase: ProcurementCaseAggregate,
  ): ProcurementCaseAggregate {
    if (this.canViewDelay(actor)) return kase;
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

  private assertPrReceiptDateNotFuture(prReceiptDate: string | null) {
    if (prReceiptDate && prReceiptDate > todayDateOnlyString()) {
      throw new BadRequestException({
        errors: ["PR Receipt Date cannot be in the future."],
        message: "Case validation failed.",
      });
    }
  }

  private normalizeMilestonesForTenderType(
    kase: ProcurementCaseAggregate,
    milestones: CaseMilestones,
  ): CaseMilestones {
    if (requiresBidTimelineFields(kase.tenderTypeName)) return milestones;
    if (!kase.prReceiptDate) {
      throw new BadRequestException(
        "PR Receipt Date is required for this tender type timeline normalization.",
      );
    }
    return {
      ...milestones,
      bidReceiptDate: kase.prReceiptDate,
      biddersParticipated: 0,
      commercialEvaluationDate: kase.prReceiptDate,
      nitApprovalDate: kase.prReceiptDate,
      nitInitiationDate: kase.prReceiptDate,
      nitPublishDate: kase.prReceiptDate,
      qualifiedBidders: 0,
      technicalEvaluationDate: kase.prReceiptDate,
    };
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
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
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

function requiresBidTimelineFields(
  tenderTypeName: string | null | undefined,
): boolean {
  const normalized = tenderTypeName?.trim().toLowerCase();
  return (
    normalized === "open" ||
    normalized === "limited" ||
    normalized === "single party"
  );
}
