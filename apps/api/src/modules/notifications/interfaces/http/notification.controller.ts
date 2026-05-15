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
  NotificationJobsQuerySchema,
  NotificationPreviewQuerySchema,
  NotificationRuleTypeSchema,
  NotificationTypeSchema,
  UpdateNotificationRuleRequestSchema,
  type CreateNotificationJobRequest,
  type NotificationJobsQuery,
  type NotificationPreviewQuery,
  type NotificationRuleType,
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

  @Post("jobs/:jobId/cancel")
  @RequirePermissions("notification.manage")
  cancelJob(@CurrentUser() user: AuthenticatedUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.notifications.cancelJob(user, jobId);
  }
}
