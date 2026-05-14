import { Body, Controller, Get, Patch, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply } from "fastify";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import type { AuthenticatedRequest } from "../../../../common/auth/authenticated-request.js";
import { createCsrfToken } from "../../../../common/security/csrf.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuditWriterService } from "../../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../../domain/authenticated-user.js";
import { AuthGuard } from "../../application/auth.guard.js";
import { AuthService } from "../../application/auth.service.js";
import {
  ChangeOwnPasswordRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  ResetPasswordRequestSchema,
  UpdateOwnProfileRequestSchema,
  type ChangeOwnPasswordRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type ResetPasswordRequest,
  type UpdateOwnProfileRequest,
} from "./auth.schemas.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditWriterService,
    private readonly config: ConfigService,
  ) {}

  @Post("login")
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const result = await this.auth.login({
      tenantCode: body.tenantCode,
      usernameOrEmail: body.usernameOrEmail,
      password: body.password,
      ipAddress: request.ip,
      userAgent: this.singleHeader(request.headers["user-agent"]),
    });
    await this.audit.write({
      action: "LOGIN",
      actorUserId: result.user.id,
      details: { tenantCode: body.tenantCode ?? null },
      ipAddress: request.ip,
      summary: `${result.user.username} logged in`,
      targetId: result.user.id,
      targetType: "User",
      tenantId: result.user.tenantId,
      userAgent: this.singleHeader(request.headers["user-agent"]) ?? null,
    });

    response.setCookie(this.cookieName, result.sessionToken, {
      expires: result.expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
    });
    response.setCookie(this.csrfCookieName, createCsrfToken(this.config.getOrThrow<string>("CSRF_SECRET")), {
      expires: result.expiresAt,
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
    });

    return {
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @Post("forgot-password")
  forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.forgotPassword({
      email: body.email,
      tenantCode: body.tenantCode,
      ipAddress: request.ip,
      userAgent: this.singleHeader(request.headers["user-agent"]),
    });
  }

  @Post("reset-password")
  resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema)) body: ResetPasswordRequest,
  ) {
    return this.auth.resetPassword(body);
  }

  @Post("logout")
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const token = request.cookies?.[this.cookieName];
    await this.auth.logout(token);
    response.clearCookie(this.cookieName, { path: "/" });
    response.clearCookie(this.csrfCookieName, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Patch("me/profile")
  @UseGuards(AuthGuard)
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateOwnProfileRequestSchema)) body: UpdateOwnProfileRequest,
  ) {
    const result = await this.auth.updateOwnProfile(user, body);
    await this.audit.write({
      action: "user.profile_update",
      actorUserId: user.id,
      details: { changedFields: ["fullName"] },
      summary: "User updated own profile",
      targetId: user.id,
      targetType: "user",
      tenantId: user.tenantId,
    });
    return result;
  }

  @Put("me/password")
  @UseGuards(AuthGuard)
  async changeOwnPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ChangeOwnPasswordRequestSchema)) body: ChangeOwnPasswordRequest,
  ) {
    const result = await this.auth.changeOwnPassword(user, body);
    await this.audit.write({
      action: "user.password_change",
      actorUserId: user.id,
      summary: "User changed own password",
      targetId: user.id,
      targetType: "user",
      tenantId: user.tenantId,
    });
    return result;
  }

  private get cookieName(): string {
    return this.config.get<string>("SESSION_COOKIE_NAME", "procuredesk_session");
  }

  private get csrfCookieName(): string {
    return this.config.get<string>("CSRF_COOKIE_NAME", "procuredesk_csrf");
  }

  private singleHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
