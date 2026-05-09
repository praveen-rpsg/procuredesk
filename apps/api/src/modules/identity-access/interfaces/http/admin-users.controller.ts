import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AdminUsersService } from "../../application/admin-users.service.js";
import { AuthGuard } from "../../application/auth.guard.js";
import { PermissionGuard } from "../../application/permission.guard.js";
import type { AuthenticatedUser } from "../../domain/authenticated-user.js";
import {
  AssignableOwnersQuerySchema,
  CreateUserRequestSchema,
  ReplaceUserEntityScopesRequestSchema,
  ReplaceUserRolesRequestSchema,
  UpdateUserProfileRequestSchema,
  UpdateUserStatusRequestSchema,
  type AssignableOwnersQuery,
  type CreateUserRequest,
  type ReplaceUserEntityScopesRequest,
  type ReplaceUserRolesRequest,
  type UpdateUserProfileRequest,
  type UpdateUserStatusRequest,
} from "./admin-user.schemas.js";

@Controller("admin/users")
@UseGuards(AuthGuard, PermissionGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @RequirePermissions("user.read")
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.adminUsers.listUsers(user);
  }

  @Get("assignable-owners")
  @RequirePermissions("case.create")
  listAssignableOwners(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AssignableOwnersQuerySchema))
    query: AssignableOwnersQuery,
  ) {
    return this.adminUsers.listAssignableOwners(user, query.entityId);
  }

  @Post()
  @RequirePermissions("user.manage")
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateUserRequestSchema)) body: CreateUserRequest,
  ) {
    return this.adminUsers.createPendingUser(user, body);
  }

  @Patch(":userId")
  @RequirePermissions("user.manage")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(UpdateUserProfileRequestSchema))
    body: UpdateUserProfileRequest,
  ) {
    return this.adminUsers.updateProfile(user, { userId, ...body });
  }

  @Patch(":userId/status")
  @RequirePermissions("user.manage")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(UpdateUserStatusRequestSchema))
    body: UpdateUserStatusRequest,
  ) {
    return this.adminUsers.updateStatus(user, { userId, status: body.status });
  }

  @Put(":userId/roles")
  @RequirePermissions("role.manage")
  replaceRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(ReplaceUserRolesRequestSchema))
    body: ReplaceUserRolesRequest,
  ) {
    return this.adminUsers.replaceRoles(user, { userId, roleIds: body.roleIds });
  }

  @Put(":userId/entity-scopes")
  @RequirePermissions("user.manage")
  replaceEntityScopes(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(ReplaceUserEntityScopesRequestSchema))
    body: ReplaceUserEntityScopesRequest,
  ) {
    return this.adminUsers.replaceEntityScopes(user, {
      userId,
      entityIds: body.entityIds,
    });
  }
}
