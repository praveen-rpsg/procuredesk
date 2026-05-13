import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import { ProcurementCaseService } from "../../procurement-cases/application/procurement-case.service.js";
import type { ProcurementCaseAggregate } from "../../procurement-cases/domain/case-aggregate.js";
import { AwardDatePolicy } from "../domain/award-date.policy.js";
import { CaseAwardRepository, type CreateAwardInput, type UpdateAwardInput } from "../infrastructure/case-award.repository.js";

export type CreateAwardCommand = Omit<CreateAwardInput, "actorUserId" | "tenantId">;
export type UpdateAwardCommand = Omit<UpdateAwardInput, "actorUserId" | "tenantId">;

@Injectable()
export class CaseAwardService {
  constructor(
    private readonly repository: CaseAwardRepository,
    private readonly cases: ProcurementCaseService,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async listAwards(actor: AuthenticatedUser, caseId: string) {
    const tenantId = this.requireTenant(actor);
    await this.cases.getCase(actor, caseId);
    return this.repository.listAwards(tenantId, caseId);
  }

  async createAward(actor: AuthenticatedUser, command: CreateAwardCommand) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.cases.getCase(actor, command.caseId);
    this.assertCanManageAwards(actor, kase);
    this.validateDates(command);

    return this.db.transaction(async () => {
      const result = await this.repository.createAward({
        ...command,
        actorUserId: actor.id,
        tenantId,
      });

      await this.audit.write({
        action: "award.create",
        actorUserId: actor.id,
        details: {
          awardId: result.id,
          rollup: result.rollup,
          vendorName: command.vendorName,
        },
        summary: "Created case award",
        targetId: command.caseId,
        targetType: "procurement_case",
        tenantId,
      });
      await this.emitAwardEvent(tenantId, command.caseId, "case_award.created", {
        actorUserId: actor.id,
        awardId: result.id,
        rollup: result.rollup,
      });

      return result;
    });
  }

  async updateAward(actor: AuthenticatedUser, command: UpdateAwardCommand) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.cases.getCase(actor, command.caseId);
    this.assertCanManageAwards(actor, kase);
    this.validateDates(command);

    try {
      await this.db.transaction(async () => {
        const result = await this.repository.updateAward({
          ...command,
          actorUserId: actor.id,
          tenantId,
        });
        await this.audit.write({
          action: "award.update",
          actorUserId: actor.id,
          details: { awardId: command.awardId, rollup: result.rollup },
          summary: "Updated case award",
          targetId: command.caseId,
          targetType: "procurement_case",
          tenantId,
        });
        await this.emitAwardEvent(tenantId, command.caseId, "case_award.updated", {
          actorUserId: actor.id,
          awardId: command.awardId,
          rollup: result.rollup,
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Award not found.") {
        throw new NotFoundException("Award not found.");
      }
      if (error instanceof Error && error.message === "Award date invalid.") {
        throw new BadRequestException({
          errors: ["PO validity date cannot be before PO award date."],
          message: "Award validation failed.",
        });
      }
      throw error;
    }
  }

  async deleteAward(actor: AuthenticatedUser, caseId: string, awardId: string) {
    const tenantId = this.requireTenant(actor);
    const kase = await this.cases.getCase(actor, caseId);
    this.assertCanManageAwards(actor, kase);

    try {
      await this.db.transaction(async () => {
        const result = await this.repository.deleteAward({
          actorUserId: actor.id,
          awardId,
          caseId,
          tenantId,
        });
        await this.audit.write({
          action: "award.delete",
          actorUserId: actor.id,
          details: { awardId, rollup: result.rollup },
          summary: "Deleted case award",
          targetId: caseId,
          targetType: "procurement_case",
          tenantId,
        });
        await this.emitAwardEvent(tenantId, caseId, "case_award.deleted", {
          actorUserId: actor.id,
          awardId,
          rollup: result.rollup,
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Award not found.") {
        throw new NotFoundException("Award not found.");
      }
      throw error;
    }
  }

  private assertCanManageAwards(actor: AuthenticatedUser, kase: ProcurementCaseAggregate) {
    if (!hasExpandedPermission(actor, "award.manage")) {
      throw new ForbiddenException("Award management permission is required.");
    }
    if (kase.status !== "completed") {
      throw new BadRequestException("Awards can be managed only for completed cases.");
    }
    if (actor.isPlatformSuperAdmin) return;
    if (actor.accessLevel === "GROUP" && hasExpandedPermission(actor, "case.update.all")) return;
    if (
      actor.accessLevel === "ENTITY" &&
      hasExpandedPermission(actor, "case.update.entity") &&
      actor.entityIds.includes(kase.entityId)
    ) {
      return;
    }
    if (hasExpandedPermission(actor, "case.update.assigned") && kase.ownerUserId === actor.id) {
      return;
    }
    throw new ForbiddenException("Award management is not allowed for this case.");
  }

  private validateDates(input: { poAwardDate?: string | null; poValidityDate?: string | null }) {
    const errors = new AwardDatePolicy().validate(input);
    if (errors.length) {
      throw new BadRequestException({ message: "Award validation failed.", errors });
    }
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }

  private async emitAwardEvent(
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
