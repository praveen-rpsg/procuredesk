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
import { PlanningService } from "../../application/planning.service.js";
import {
  CreateRcPoPlanRequestSchema,
  CreateTenderPlanRequestSchema,
  ExpiryQuerySchema,
  PlanningListQuerySchema,
  UpdateRcPoPlanRequestSchema,
  UpdateTenderPlanRequestSchema,
  type CreateRcPoPlanRequest,
  type CreateTenderPlanRequest,
  type ExpiryQuery,
  type PlanningListQuery,
  type UpdateRcPoPlanRequest,
  type UpdateTenderPlanRequest,
} from "./planning.schemas.js";

@Controller("planning")
@UseGuards(AuthGuard, PermissionGuard)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get("tender-plans")
  @RequirePermissions("planning.manage")
  listTenderPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PlanningListQuerySchema))
    query: PlanningListQuery,
  ) {
    return this.planning.listTenderPlans(user, stripUndefined(query));
  }

  @Post("tender-plans")
  @RequirePermissions("planning.manage")
  createTenderPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTenderPlanRequestSchema))
    body: CreateTenderPlanRequest,
  ) {
    return this.planning.createTenderPlan(user, stripUndefined(body));
  }

  @Patch("tender-plans/:planId")
  @RequirePermissions("planning.manage")
  updateTenderPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body(new ZodValidationPipe(UpdateTenderPlanRequestSchema))
    body: UpdateTenderPlanRequest,
  ) {
    return this.planning.updateTenderPlan(
      user,
      stripUndefined({ ...body, planId }),
    );
  }

  @Delete("tender-plans/:planId")
  @RequirePermissions("planning.manage")
  deleteTenderPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param("planId", ParseUUIDPipe) planId: string,
  ) {
    return this.planning.deleteTenderPlan(user, planId);
  }

  @Get("rc-po-plans")
  @RequirePermissions("planning.manage")
  listRcPoPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PlanningListQuerySchema))
    query: PlanningListQuery,
  ) {
    return this.planning.listRcPoPlans(user, stripUndefined(query));
  }

  @Post("rc-po-plans")
  @RequirePermissions("planning.manage")
  createRcPoPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateRcPoPlanRequestSchema))
    body: CreateRcPoPlanRequest,
  ) {
    return this.planning.createRcPoPlan(user, stripUndefined(body));
  }

  @Patch("rc-po-plans/:planId")
  @RequirePermissions("planning.manage")
  updateRcPoPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body(new ZodValidationPipe(UpdateRcPoPlanRequestSchema))
    body: UpdateRcPoPlanRequest,
  ) {
    return this.planning.updateRcPoPlan(
      user,
      stripUndefined({ ...body, planId }),
    );
  }

  @Get("rc-po-expiry")
  @RequirePermissions("planning.manage")
  listExpiryRows(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ExpiryQuerySchema)) query: ExpiryQuery,
  ) {
    return this.planning.listExpiryRows(user, stripUndefined(query));
  }
}
