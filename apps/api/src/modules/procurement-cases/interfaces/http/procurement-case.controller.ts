import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { stripUndefined } from "../../../../common/utils/strip-undefined.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { ProcurementCaseService } from "../../application/procurement-case.service.js";
import {
  AssignOwnerRequestSchema,
  CaseCleanupExecuteRequestSchema,
  CaseCleanupPreviewRequestSchema,
  CaseMilestonesSchema,
  CreateCaseRequestSchema,
  DeleteCaseRequestSchema,
  ListCasesQuerySchema,
  UpdateCaseRequestSchema,
  UpdateDelayRequestSchema,
  type AssignOwnerRequest,
  type CaseCleanupExecuteRequest,
  type CaseCleanupPreviewRequest,
  type CreateCaseRequest,
  type DeleteCaseRequest,
  type ListCasesQuery,
  type UpdateCaseRequest,
  type UpdateDelayRequest,
  type UpdateMilestonesRequest,
} from "./procurement-case.schemas.js";

@Controller()
@UseGuards(AuthGuard, PermissionGuard)
export class ProcurementCaseController {
  constructor(private readonly cases: ProcurementCaseService) {}

  @Get("dashboard/summary")
  @RequirePermissions("case.read.assigned")
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.cases.summary(user);
  }

  @Get("cases")
  @RequirePermissions("case.read.assigned")
  listCases(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListCasesQuerySchema)) query: ListCasesQuery,
  ) {
    return this.cases.listCases(user, stripUndefined(query));
  }

  @Get("admin/cases/deleted")
  @RequirePermissions("case.restore")
  listDeletedCases(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListCasesQuerySchema)) query: ListCasesQuery,
  ) {
    return this.cases.listDeletedCases(user, stripUndefined(query));
  }

  @Post("admin/cases/cleanup-preview")
  @RequirePermissions("admin.console.access", "case.delete")
  previewCaseCleanup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CaseCleanupPreviewRequestSchema)) body: CaseCleanupPreviewRequest,
  ) {
    return this.cases.previewCaseCleanup(user, stripUndefined(body));
  }

  @Get("admin/cases/cleanup-import-jobs")
  @RequirePermissions("admin.console.access", "case.delete")
  listCaseCleanupImportJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.cases.listCaseCleanupImportJobs(user);
  }

  @Post("admin/cases/cleanup-options")
  @RequirePermissions("admin.console.access", "case.delete")
  listCaseCleanupOwnerOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CaseCleanupPreviewRequestSchema)) body: CaseCleanupPreviewRequest,
  ) {
    return this.cases.listCaseCleanupOwnerOptions(user, stripUndefined(body));
  }

  @Post("admin/cases/cleanup-execute")
  @RequirePermissions("admin.console.access", "case.delete")
  executeCaseCleanup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CaseCleanupExecuteRequestSchema)) body: CaseCleanupExecuteRequest,
  ) {
    return this.cases.executeCaseCleanup(user, body);
  }

  @Post("cases")
  @RequirePermissions("case.create")
  createCase(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateCaseRequestSchema)) body: CreateCaseRequest,
  ) {
    return this.cases.createCase(user, stripUndefined(body));
  }

  @Get("cases/:caseId")
  @RequirePermissions("case.read.assigned")
  getCase(@CurrentUser() user: AuthenticatedUser, @Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.cases.getCase(user, caseId);
  }

  @Patch("cases/:caseId")
  @RequirePermissions("case.update.assigned")
  updateCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body(new ZodValidationPipe(UpdateCaseRequestSchema)) body: UpdateCaseRequest,
  ) {
    return this.cases.updateCase(user, caseId, stripUndefined(body));
  }

  @Patch("cases/:caseId/assignment")
  @RequirePermissions("case.update.assigned")
  assignOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body(new ZodValidationPipe(AssignOwnerRequestSchema)) body: AssignOwnerRequest,
  ) {
    return this.cases.assignOwner(user, caseId, body.ownerUserId);
  }

  @Patch("cases/:caseId/milestones")
  @RequirePermissions("case.update.assigned")
  updateMilestones(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body(new ZodValidationPipe(CaseMilestonesSchema)) body: UpdateMilestonesRequest,
  ) {
    return this.cases.updateMilestones(user, caseId, stripUndefined(body));
  }

  @Patch("cases/:caseId/delay")
  @RequirePermissions("case.delay.manage.all")
  updateDelay(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body(new ZodValidationPipe(UpdateDelayRequestSchema)) body: UpdateDelayRequest,
  ) {
    return this.cases.updateDelay(user, caseId, stripUndefined(body));
  }

  @Delete("cases/:caseId")
  @RequirePermissions("case.delete")
  deleteCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body(new ZodValidationPipe(DeleteCaseRequestSchema)) body: DeleteCaseRequest,
  ) {
    return this.cases.deleteCase(user, caseId, body.deleteReason);
  }

  @Post("cases/:caseId/restore")
  @RequirePermissions("case.restore")
  restoreCase(@CurrentUser() user: AuthenticatedUser, @Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.cases.restoreCase(user, caseId);
  }
}
