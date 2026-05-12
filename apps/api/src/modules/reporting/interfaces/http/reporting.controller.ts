import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { stripUndefined } from "../../../../common/utils/strip-undefined.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { ReportingService } from "../../application/reporting.service.js";
import {
  CreateExportJobRequestSchema,
  CreateSavedViewRequestSchema,
  ReportQuerySchema,
  SavedViewsQuerySchema,
  type CreateExportJobRequest,
  type CreateSavedViewRequest,
  type ReportQuery,
  type SavedViewsQuery,
} from "./reporting.schemas.js";

@Controller("reports")
@UseGuards(AuthGuard, PermissionGuard)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Post("projections/refresh")
  @RequirePermissions("report.read")
  refreshProjections(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.refreshProjections(user);
  }

  @Get("analytics")
  @RequirePermissions("report.read")
  analytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.analytics(user, stripUndefined(query));
  }

  @Get("tender-details")
  @RequirePermissions("report.read")
  tenderDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.tenderDetails(user, stripUndefined(query));
  }

  @Get("running")
  @RequirePermissions("report.read")
  running(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.running(user, stripUndefined(query));
  }

  @Get("completed")
  @RequirePermissions("report.read")
  completed(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.completed(user, stripUndefined(query));
  }

  @Get("vendor-awards")
  @RequirePermissions("report.read")
  vendorAwards(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.vendorAwards(user, stripUndefined(query));
  }

  @Get("stage-time")
  @RequirePermissions("report.read")
  stageTime(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.stageTime(user, stripUndefined(query));
  }

  @Get("rc-po-expiry")
  @RequirePermissions("report.read")
  rcPoExpiry(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery,
  ) {
    return this.reporting.rcPoExpiry(user, stripUndefined(query));
  }

  @Get("filter-metadata")
  @RequirePermissions("report.read")
  filterMetadata(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.filterMetadata(user);
  }

  @Get("saved-views")
  @RequirePermissions("report.read")
  savedViews(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(SavedViewsQuerySchema)) query: SavedViewsQuery,
  ) {
    return this.reporting.listSavedViews(user, query.reportCode);
  }

  @Post("saved-views")
  @RequirePermissions("report.read")
  createSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateSavedViewRequestSchema)) body: CreateSavedViewRequest,
  ) {
    return this.reporting.createSavedView(user, body);
  }

  @Post("export-jobs")
  @RequirePermissions("report.export")
  createExportJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateExportJobRequestSchema)) body: CreateExportJobRequest,
  ) {
    return this.reporting.createExportJob(user, body);
  }

  @Get("export-jobs")
  @RequirePermissions("report.export")
  listExportJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.reporting.listExportJobs(user);
  }

  @Get("export-jobs/:jobId")
  @RequirePermissions("report.export")
  getExportJob(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.reporting.getExportJob(user, jobId);
  }

  @Get("export-jobs/:jobId/download")
  @RequirePermissions("report.export")
  getExportDownload(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.reporting.getExportDownload(user, jobId);
  }
}
