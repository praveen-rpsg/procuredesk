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
import { AdminRolesService } from "../../application/admin-roles.service.js";
import { AuthGuard } from "../../application/auth.guard.js";
import { PermissionGuard } from "../../application/permission.guard.js";
import type { AuthenticatedUser } from "../../domain/authenticated-user.js";
import {
  CreateRoleRequestSchema,
  UpdateRoleRequestSchema,
  type CreateRoleRequest,
  type UpdateRoleRequest,
} from "./admin-role.schemas.js";

@Controller("admin")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("admin.console.access")
export class AdminRolesController {
  constructor(private readonly adminRoles: AdminRolesService) {}

  @Get("roles")
  @RequirePermissions("role.manage")
  listRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.adminRoles.listRoles(user);
  }

  @Get("permissions")
  @RequirePermissions("permission.read")
  listPermissions() {
    return this.adminRoles.listPermissions();
  }

  @Post("roles")
  @RequirePermissions("role.manage")
  createRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateRoleRequestSchema))
    body: CreateRoleRequest,
  ) {
    return this.adminRoles.createRole(user, {
      code: body.code,
      description: body.description,
      name: body.name,
      permissionCodes: body.permissionCodes,
    });
  }

  @Patch("roles/:roleId")
  @RequirePermissions("role.manage")
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Body(new ZodValidationPipe(UpdateRoleRequestSchema))
    body: UpdateRoleRequest,
  ) {
    return this.adminRoles.updateRole(user, {
      description: body.description,
      name: body.name,
      permissionCodes: body.permissionCodes,
      roleId,
    });
  }

  @Delete("roles/:roleId")
  @RequirePermissions("role.manage")
  deleteRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("roleId", ParseUUIDPipe) roleId: string,
  ) {
    return this.adminRoles.deleteRole(user, roleId);
  }
}
