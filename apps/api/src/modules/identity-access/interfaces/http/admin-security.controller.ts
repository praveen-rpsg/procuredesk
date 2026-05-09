import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AdminSecurityService } from "../../application/admin-security.service.js";
import { AuthGuard } from "../../application/auth.guard.js";
import { PermissionGuard } from "../../application/permission.guard.js";
import type { AuthenticatedUser } from "../../domain/authenticated-user.js";
import {
  PasswordPolicyRequestSchema,
  SetUserPasswordRequestSchema,
  type PasswordPolicyRequest,
  type SetUserPasswordRequest,
} from "./admin-security.schemas.js";

@Controller("admin/security")
@UseGuards(AuthGuard, PermissionGuard)
export class AdminSecurityController {
  constructor(private readonly adminSecurity: AdminSecurityService) {}

  @Get("password-policy")
  @RequirePermissions("user.manage")
  getPasswordPolicy(@CurrentUser() user: AuthenticatedUser) {
    return this.adminSecurity.getPasswordPolicy(user);
  }

  @Put("password-policy")
  @RequirePermissions("user.manage")
  updatePasswordPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(PasswordPolicyRequestSchema)) body: PasswordPolicyRequest,
  ) {
    return this.adminSecurity.updatePasswordPolicy(user, body);
  }

  @Put("users/:userId/password")
  @RequirePermissions("user.manage")
  setUserPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(SetUserPasswordRequestSchema)) body: SetUserPasswordRequest,
  ) {
    return this.adminSecurity.setUserPassword(user, { userId, password: body.password });
  }
}
