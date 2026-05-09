import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { OrganizationService } from "../../application/organization.service.js";
import {
  CreateDepartmentRequestSchema,
  CreateEntityRequestSchema,
  UpdateDepartmentRequestSchema,
  UpdateEntityRequestSchema,
  type CreateDepartmentRequest,
  type CreateEntityRequest,
  type UpdateDepartmentRequest,
  type UpdateEntityRequest,
} from "./organization.schemas.js";

@Controller()
@UseGuards(AuthGuard, PermissionGuard)
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get("entities")
  @RequirePermissions("entity.read")
  listEntities(@CurrentUser() user: AuthenticatedUser) {
    return this.organization.listEntities(user);
  }

  @Post("admin/entities")
  @RequirePermissions("entity.manage")
  createEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEntityRequestSchema)) body: CreateEntityRequest,
  ) {
    return this.organization.createEntity(user, body);
  }

  @Patch("admin/entities/:entityId")
  @RequirePermissions("entity.manage")
  updateEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("entityId", ParseUUIDPipe) entityId: string,
    @Body(new ZodValidationPipe(UpdateEntityRequestSchema)) body: UpdateEntityRequest,
  ) {
    return this.organization.updateEntity(user, { entityId, ...body });
  }

  @Delete("admin/entities/:entityId")
  @RequirePermissions("entity.manage")
  deleteEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("entityId", ParseUUIDPipe) entityId: string,
  ) {
    return this.organization.deleteEntity(user, entityId);
  }

  @Get("entities/:entityId/departments")
  @RequirePermissions("entity.read")
  listDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Param("entityId", ParseUUIDPipe) entityId: string,
  ) {
    return this.organization.listDepartments(user, entityId);
  }

  @Post("admin/entities/:entityId/departments")
  @RequirePermissions("entity.manage")
  createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("entityId", ParseUUIDPipe) entityId: string,
    @Body(new ZodValidationPipe(CreateDepartmentRequestSchema))
    body: CreateDepartmentRequest,
  ) {
    return this.organization.createDepartment(user, { entityId, name: body.name });
  }

  @Patch("admin/departments/:departmentId")
  @RequirePermissions("entity.manage")
  updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("departmentId", ParseUUIDPipe) departmentId: string,
    @Body(new ZodValidationPipe(UpdateDepartmentRequestSchema))
    body: UpdateDepartmentRequest,
  ) {
    return this.organization.updateDepartment(user, { departmentId, ...body });
  }

  @Delete("admin/departments/:departmentId")
  @RequirePermissions("entity.manage")
  deleteDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("departmentId", ParseUUIDPipe) departmentId: string,
  ) {
    return this.organization.deleteDepartment(user, departmentId);
  }
}
