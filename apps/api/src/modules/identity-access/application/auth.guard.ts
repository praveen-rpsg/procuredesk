import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request.js";
import { AuthService } from "./auth.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get<string>("SESSION_COOKIE_NAME", "procuredesk_session");
    const tokenFromCookie = request.cookies?.[cookieName];
    const tokenFromHeader = this.readBearerToken(request.headers.authorization);
    const sessionToken = tokenFromCookie ?? tokenFromHeader;

    const user = await this.auth.authenticateSession(sessionToken);
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }

    request.user = user;
    if (sessionToken) {
      request.sessionTokenHash = this.auth.hashSessionToken(sessionToken);
    }
    return true;
  }

  private readBearerToken(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    if (!value.toLowerCase().startsWith("bearer ")) {
      return undefined;
    }
    return value.slice(7).trim() || undefined;
  }
}
