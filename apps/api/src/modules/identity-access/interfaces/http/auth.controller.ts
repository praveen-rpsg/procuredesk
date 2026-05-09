import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
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
import { LoginRequestSchema, type LoginRequest } from "./auth.schemas.js";

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
