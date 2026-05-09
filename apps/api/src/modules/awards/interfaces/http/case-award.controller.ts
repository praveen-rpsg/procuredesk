import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { stripUndefined } from "../../../../common/utils/strip-undefined.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { CaseAwardService } from "../../application/case-award.service.js";
import {
  CreateAwardRequestSchema,
  UpdateAwardRequestSchema,
  type CreateAwardRequest,
  type UpdateAwardRequest,
} from "./case-award.schemas.js";

@Controller("cases/:caseId/awards")
@UseGuards(AuthGuard, PermissionGuard)
export class CaseAwardController {
  constructor(private readonly awards: CaseAwardService) {}

  @Get()
  @RequirePermissions("case.read.assigned")
  listAwards(@CurrentUser() user: AuthenticatedUser, @Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.awards.listAwards(user, caseId);
  }

  @Post()
  @RequirePermissions("award.manage")
  createAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body(new ZodValidationPipe(CreateAwardRequestSchema)) body: CreateAwardRequest,
  ) {
    return this.awards.createAward(user, stripUndefined({ ...body, caseId }));
  }

  @Patch(":awardId")
  @RequirePermissions("award.manage")
  updateAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Param("awardId", ParseUUIDPipe) awardId: string,
    @Body(new ZodValidationPipe(UpdateAwardRequestSchema)) body: UpdateAwardRequest,
  ) {
    return this.awards.updateAward(user, stripUndefined({ ...body, awardId, caseId }));
  }

  @Delete(":awardId")
  @RequirePermissions("award.manage")
  deleteAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Param("awardId", ParseUUIDPipe) awardId: string,
  ) {
    return this.awards.deleteAward(user, caseId, awardId);
  }
}
