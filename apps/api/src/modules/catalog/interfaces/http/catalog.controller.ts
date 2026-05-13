import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { CatalogService } from "../../application/catalog.service.js";
import {
  CreateReferenceValueRequestSchema,
  CreateReferenceCategoryRequestSchema,
  CreateTenderTypeRequestSchema,
  UpdateReferenceCategoryRequestSchema,
  UpdateReferenceValueRequestSchema,
  UpdateTenderTypeRequestSchema,
  UpdateTenderTypeRuleRequestSchema,
  type CreateReferenceCategoryRequest,
  type CreateReferenceValueRequest,
  type UpdateReferenceCategoryRequest,
  type CreateTenderTypeRequest,
  type UpdateReferenceValueRequest,
  type UpdateTenderTypeRequest,
  type UpdateTenderTypeRuleRequest,
} from "./catalog.schemas.js";

@Controller()
@UseGuards(AuthGuard, PermissionGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("catalog")
  @RequirePermissions("catalog.read")
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.catalog.getCatalog(user);
  }

  @Get("catalog/tender-types")
  @RequirePermissions("catalog.read")
  async getTenderTypes(@CurrentUser() user: AuthenticatedUser) {
    const snapshot = await this.catalog.getCatalog(user);
    return snapshot.tenderTypes;
  }

  @Post("admin/catalog/reference-values")
  @RequirePermissions("admin.console.access", "catalog.manage")
  createReferenceValue(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateReferenceValueRequestSchema))
    body: CreateReferenceValueRequest,
  ) {
    return this.catalog.createReferenceValue(user, body);
  }

  @Post("admin/catalog/reference-categories")
  @RequirePermissions("admin.console.access", "catalog.manage")
  createReferenceCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateReferenceCategoryRequestSchema))
    body: CreateReferenceCategoryRequest,
  ) {
    return this.catalog.createReferenceCategory(user, body);
  }

  @Patch("admin/catalog/reference-categories/:categoryId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  updateReferenceCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("categoryId", ParseUUIDPipe) categoryId: string,
    @Body(new ZodValidationPipe(UpdateReferenceCategoryRequestSchema))
    body: UpdateReferenceCategoryRequest,
  ) {
    return this.catalog.updateReferenceCategory(user, { categoryId, ...body });
  }

  @Delete("admin/catalog/reference-categories/:categoryId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  deleteReferenceCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("categoryId", ParseUUIDPipe) categoryId: string,
  ) {
    return this.catalog.deleteReferenceCategory(user, categoryId);
  }

  @Patch("admin/catalog/reference-values/:referenceValueId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  updateReferenceValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param("referenceValueId", ParseUUIDPipe) referenceValueId: string,
    @Body(new ZodValidationPipe(UpdateReferenceValueRequestSchema))
    body: UpdateReferenceValueRequest,
  ) {
    return this.catalog.updateReferenceValue(user, {
      referenceValueId,
      ...body,
    });
  }

  @Delete("admin/catalog/reference-values/:referenceValueId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  deleteReferenceValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param("referenceValueId", ParseUUIDPipe) referenceValueId: string,
  ) {
    return this.catalog.deleteReferenceValue(user, referenceValueId);
  }

  @Post("admin/catalog/tender-types")
  @RequirePermissions("admin.console.access", "catalog.manage")
  createTenderType(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTenderTypeRequestSchema))
    body: CreateTenderTypeRequest,
  ) {
    return this.catalog.createTenderType(user, body);
  }

  @Patch("admin/catalog/tender-types/:tenderTypeId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  updateTenderType(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderTypeId", ParseUUIDPipe) tenderTypeId: string,
    @Body(new ZodValidationPipe(UpdateTenderTypeRequestSchema))
    body: UpdateTenderTypeRequest,
  ) {
    return this.catalog.updateTenderType(user, { tenderTypeId, ...body });
  }

  @Delete("admin/catalog/tender-types/:tenderTypeId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  deleteTenderType(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderTypeId", ParseUUIDPipe) tenderTypeId: string,
  ) {
    return this.catalog.deleteTenderType(user, tenderTypeId);
  }

  @Patch("admin/catalog/tender-type-rules/:ruleId")
  @RequirePermissions("admin.console.access", "catalog.manage")
  updateTenderTypeRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Body(new ZodValidationPipe(UpdateTenderTypeRuleRequestSchema))
    body: UpdateTenderTypeRuleRequest,
  ) {
    return this.catalog.updateTenderTypeRule(user, { ruleId, ...body });
  }

  @Patch("admin/catalog/tender-types/:tenderTypeId/completion-rule")
  @RequirePermissions("admin.console.access", "catalog.manage")
  upsertTenderTypeRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderTypeId", ParseUUIDPipe) tenderTypeId: string,
    @Body(new ZodValidationPipe(UpdateTenderTypeRuleRequestSchema))
    body: UpdateTenderTypeRuleRequest,
  ) {
    return this.catalog.upsertTenderTypeRule(user, { tenderTypeId, ...body });
  }
}
