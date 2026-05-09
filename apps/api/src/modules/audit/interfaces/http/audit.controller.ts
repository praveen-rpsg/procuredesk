import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { stripUndefined } from "../../../../common/utils/strip-undefined.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { AuditQueryService } from "../../application/audit-query.service.js";
import { AuditListQuerySchema, type AuditListQuery } from "./audit.schemas.js";

@Controller("audit")
@UseGuards(AuthGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get("events")
  @RequirePermissions("audit.read")
  listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AuditListQuerySchema)) query: AuditListQuery,
  ) {
    return this.audit.listEvents(user, stripUndefined(query));
  }

  @Get("filter-metadata")
  @RequirePermissions("audit.read")
  getFilterMetadata(@CurrentUser() user: AuthenticatedUser) {
    return this.audit.getFilterMetadata(user);
  }

  @Get("events/:eventId")
  @RequirePermissions("audit.read")
  getEvent(@CurrentUser() user: AuthenticatedUser, @Param("eventId", ParseUUIDPipe) eventId: string) {
    return this.audit.getEvent(user, eventId);
  }
}
