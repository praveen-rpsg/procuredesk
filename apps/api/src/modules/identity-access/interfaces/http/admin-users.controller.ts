import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

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
  ReplaceUserAccessAssignmentRequestSchema,
  ReplaceUserEntityScopesRequestSchema,
  ReplaceUserRolesRequestSchema,
  UpdateUserAccessLevelRequestSchema,
  UpdateUserProfileRequestSchema,
  UpdateUserStatusRequestSchema,
  type AssignableOwnersQuery,
  type CreateUserRequest,
  type ReplaceUserAccessAssignmentRequest,
  type ReplaceUserEntityScopesRequest,
  type ReplaceUserRolesRequest,
  type UpdateUserAccessLevelRequest,
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
  @RequirePermissions("case.read.assigned")
  listAssignableOwners(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AssignableOwnersQuerySchema))
    query: AssignableOwnersQuery,
  ) {
    return this.adminUsers.listAssignableOwners(user, query.entityId);
  }

  @Post()
  @RequirePermissions("admin.console.access", "user.manage")
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateUserRequestSchema))
    body: CreateUserRequest,
  ) {
    return this.adminUsers.createPendingUser(user, body);
  }

  @Patch(":userId")
  @RequirePermissions("admin.console.access", "user.manage")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(UpdateUserProfileRequestSchema))
    body: UpdateUserProfileRequest,
  ) {
    return this.adminUsers.updateProfile(user, { userId, ...body });
  }

  @Patch(":userId/status")
  @RequirePermissions("admin.console.access", "user.manage")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(UpdateUserStatusRequestSchema))
    body: UpdateUserStatusRequest,
  ) {
    return this.adminUsers.updateStatus(user, { userId, status: body.status });
  }

  @Patch(":userId/access-level")
  @RequirePermissions("admin.console.access", "user.manage")
  updateAccessLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(UpdateUserAccessLevelRequestSchema))
    body: UpdateUserAccessLevelRequest,
  ) {
    return this.adminUsers.updateAccessLevel(user, {
      userId,
      accessLevel: body.accessLevel,
    });
  }

  @Put(":userId/roles")
  @RequirePermissions("admin.console.access", "user.manage", "role.manage")
  replaceRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(ReplaceUserRolesRequestSchema))
    body: ReplaceUserRolesRequest,
  ) {
    return this.adminUsers.replaceRoles(user, {
      userId,
      roleIds: body.roleIds,
    });
  }

  @Put(":userId/access-assignment")
  @RequirePermissions("admin.console.access", "user.manage", "role.manage")
  replaceAccessAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(ReplaceUserAccessAssignmentRequestSchema))
    body: ReplaceUserAccessAssignmentRequest,
  ) {
    return this.adminUsers.replaceAccessAssignment(user, {
      userId,
      accessLevel: body.accessLevel,
      entityIds: body.entityIds,
      roleIds: body.roleIds,
    });
  }

  @Put(":userId/entity-scopes")
  @RequirePermissions("admin.console.access", "user.manage")
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
