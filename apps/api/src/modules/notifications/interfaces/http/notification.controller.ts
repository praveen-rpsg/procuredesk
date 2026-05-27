import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { NotificationService } from "../../application/notification.service.js";
import {
  CreateNotificationJobRequestSchema,
  NotificationAuditTimelineQuerySchema,
  NotificationJobsQuerySchema,
  NotificationPreferencesQuerySchema,
  NotificationPreviewQuerySchema,
  NotificationRuleTypeSchema,
  UpdateNotificationSettingsRequestSchema,
  TestSendNotificationTemplateRequestSchema,
  NotificationTypeSchema,
  UpsertNotificationPreferenceRequestSchema,
  UpdateNotificationScheduleRequestSchema,
  UpdateNotificationRuleRequestSchema,
  type CreateNotificationJobRequest,
  type NotificationAuditTimelineQuery,
  type NotificationJobsQuery,
  type NotificationPreferencesQuery,
  type NotificationPreviewQuery,
  type NotificationRuleType,
  type TestSendNotificationTemplateRequest,
  type UpdateNotificationSettingsRequest,
  type UpsertNotificationPreferenceRequest,
  type UpdateNotificationScheduleRequest,
  type UpdateNotificationRuleRequest,
} from "./notification.schemas.js";

@Controller("notifications")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("admin.console.access")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get("rules")
  @RequirePermissions("notification.manage")
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listRules(user);
  }

  @Get("status")
  @RequirePermissions("notification.manage")
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.status(user);
  }

  @Get("settings")
  @RequirePermissions("notification.manage")
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getSettings(user);
  }

  @Put("settings")
  @RequirePermissions("notification.manage")
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateNotificationSettingsRequestSchema))
    body: UpdateNotificationSettingsRequest,
  ) {
    return this.notifications.updateSettings(user, body);
  }

  @Get("templates")
  @RequirePermissions("notification.manage")
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listTemplates(user);
  }

  @Get("templates/:templateId")
  @RequirePermissions("notification.manage")
  getTemplate(@CurrentUser() user: AuthenticatedUser, @Param("templateId", ParseUUIDPipe) templateId: string) {
    return this.notifications.getTemplate(user, templateId);
  }

  @Get("templates/:templateId/versions")
  @RequirePermissions("notification.manage")
  listTemplateVersions(@CurrentUser() user: AuthenticatedUser, @Param("templateId", ParseUUIDPipe) templateId: string) {
    return this.notifications.listTemplateVersions(user, templateId);
  }

  @Get("templates/:templateId/preview")
  @RequirePermissions("notification.manage")
  previewTemplate(@CurrentUser() user: AuthenticatedUser, @Param("templateId", ParseUUIDPipe) templateId: string) {
    return this.notifications.previewTemplate(user, templateId);
  }

  @Post("templates/:templateId/test-send")
  @RequirePermissions("notification.manage")
  testSendTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body(new ZodValidationPipe(TestSendNotificationTemplateRequestSchema))
    body: TestSendNotificationTemplateRequest,
  ) {
    return this.notifications.testSendTemplate(user, templateId, body);
  }

  @Get("schedules")
  @RequirePermissions("notification.manage")
  listSchedules(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listSchedules(user);
  }

  @Get("schedules/:scheduleId/dry-run")
  @RequirePermissions("notification.manage")
  previewSchedule(@CurrentUser() user: AuthenticatedUser, @Param("scheduleId", ParseUUIDPipe) scheduleId: string) {
    return this.notifications.previewSchedule(user, scheduleId);
  }

  @Put("schedules/:scheduleId")
  @RequirePermissions("notification.manage")
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("scheduleId", ParseUUIDPipe) scheduleId: string,
    @Body(new ZodValidationPipe(UpdateNotificationScheduleRequestSchema))
    body: UpdateNotificationScheduleRequest,
  ) {
    return this.notifications.updateSchedule(user, stripUndefined({ ...body, scheduleId }));
  }

  @Post("schedules/:scheduleId/run-now")
  @RequirePermissions("notification.manage")
  runScheduleNow(@CurrentUser() user: AuthenticatedUser, @Param("scheduleId", ParseUUIDPipe) scheduleId: string) {
    return this.notifications.runScheduleNow(user, scheduleId);
  }

  @Put("rules/:notificationType")
  @RequirePermissions("notification.manage")
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationType", new ZodValidationPipe(NotificationRuleTypeSchema))
    notificationType: NotificationRuleType,
    @Body(new ZodValidationPipe(UpdateNotificationRuleRequestSchema))
    body: UpdateNotificationRuleRequest,
  ) {
    return this.notifications.updateRule(
      user,
      stripUndefined({ ...body, notificationType }),
    );
  }

  @Get("jobs")
  @RequirePermissions("notification.manage")
  listJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationJobsQuerySchema))
    query: NotificationJobsQuery,
  ) {
    return this.notifications.listJobs(user, stripUndefined(query));
  }

  @Get("audit-timeline")
  @RequirePermissions("notification.manage", "audit.read")
  listAuditTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationAuditTimelineQuerySchema))
    query: NotificationAuditTimelineQuery,
  ) {
    return this.notifications.listAuditTimeline(user, stripUndefined(query));
  }

  @Get("jobs/:jobId")
  @RequirePermissions("notification.manage")
  getJob(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.notifications.getJob(user, jobId);
  }

  @Get("jobs/:jobId/attempts")
  @RequirePermissions("notification.manage")
  listDeliveryAttempts(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.notifications.listDeliveryAttempts(user, jobId);
  }

  @Get("preferences")
  @RequirePermissions("notification.manage")
  listPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationPreferencesQuerySchema))
    query: NotificationPreferencesQuery,
  ) {
    return this.notifications.listPreferences(user, stripUndefined(query));
  }

  @Put("preferences")
  @RequirePermissions("notification.manage")
  upsertPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpsertNotificationPreferenceRequestSchema))
    body: UpsertNotificationPreferenceRequest,
  ) {
    return this.notifications.upsertPreference(user, body);
  }

  @Get("preview")
  @RequirePermissions("notification.manage")
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationPreviewQuerySchema))
    query: NotificationPreviewQuery,
  ) {
    return this.notifications.preview(user, query.type);
  }

  @Post("jobs")
  @RequirePermissions("notification.manage")
  createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateNotificationJobRequestSchema))
    body: CreateNotificationJobRequest,
  ) {
    return this.notifications.createJob(user, body);
  }

  @Post("jobs/:jobId/retry")
  @RequirePermissions("notification.manage")
  retryJob(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.notifications.retryJob(user, jobId);
  }

  @Post("jobs/:jobId/resend")
  @RequirePermissions("notification.manage")
  resendJob(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.notifications.resendJob(user, jobId);
  }

  @Post("jobs/:jobId/cancel")
  @RequirePermissions("notification.manage")
  cancelJob(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.notifications.cancelJob(user, jobId);
  }
}
