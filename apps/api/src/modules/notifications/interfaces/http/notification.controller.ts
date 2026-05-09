import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";

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
  NotificationPreviewQuerySchema,
  NotificationTypeSchema,
  UpdateNotificationRuleRequestSchema,
  type CreateNotificationJobRequest,
  type NotificationPreviewQuery,
  type NotificationType,
  type UpdateNotificationRuleRequest,
} from "./notification.schemas.js";

@Controller("notifications")
@UseGuards(AuthGuard, PermissionGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get("rules")
  @RequirePermissions("notification.manage")
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listRules(user);
  }

  @Put("rules/:notificationType")
  @RequirePermissions("notification.manage")
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationType", new ZodValidationPipe(NotificationTypeSchema)) notificationType: NotificationType,
    @Body(new ZodValidationPipe(UpdateNotificationRuleRequestSchema)) body: UpdateNotificationRuleRequest,
  ) {
    return this.notifications.updateRule(user, stripUndefined({ ...body, notificationType }));
  }

  @Get("preview")
  @RequirePermissions("notification.manage")
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationPreviewQuerySchema)) query: NotificationPreviewQuery,
  ) {
    return this.notifications.preview(user, query.type);
  }

  @Post("jobs")
  @RequirePermissions("notification.manage")
  createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateNotificationJobRequestSchema)) body: CreateNotificationJobRequest,
  ) {
    return this.notifications.createJob(user, body);
  }
}
