import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";

import type { AuthenticatedUser } from "../domain/authenticated-user.js";
import { LoginRateLimitRepository } from "../infrastructure/login-rate-limit.repository.js";
import { PasswordPolicyRepository } from "../infrastructure/password-policy.repository.js";
import { SessionRepository } from "../infrastructure/session.repository.js";
import { UserRepository } from "../infrastructure/user.repository.js";
import { PasswordService } from "./password.service.js";

export type LoginInput = {
  tenantCode?: string | undefined;
  usernameOrEmail: string;
  password: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

export type LoginResult = {
  user: AuthenticatedUser;
  sessionToken: string;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly rateLimits: LoginRateLimitRepository,
    private readonly passwordPolicies: PasswordPolicyRepository,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const loginId = input.usernameOrEmail.trim().toLowerCase();
    const rateLimitKey = this.rateLimitKey({
      ipAddress: input.ipAddress,
      tenantCode: input.tenantCode,
      usernameOrEmail: loginId,
    });
    if (await this.rateLimits.isLocked(rateLimitKey)) {
      throw new UnauthorizedException("Too many login attempts. Try again later.");
    }

    const user = await this.users.findForLogin(loginId, input.tenantCode);

    if (!user || !user.passwordHash) {
      await this.recordRateLimitFailure(rateLimitKey);
      throw new UnauthorizedException("Invalid username or password.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account is temporarily locked.");
    }

    if (user.status !== "active" && user.status !== "locked") {
      throw new UnauthorizedException("Account is not active.");
    }

    const policy = user.tenantId
      ? await this.passwordPolicies.findByTenantId(user.tenantId)
      : {
          tenantId: "platform",
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumber: true,
          requireSpecialCharacter: true,
          passwordHistoryCount: 5,
          lockoutAttempts: 5,
          lockoutMinutes: 15,
          forcePeriodicExpiry: false,
          expiryDays: null,
        };

    const isValidPassword = await this.passwords.verify(user.passwordHash, input.password);
    if (!isValidPassword) {
      await this.users.recordFailedLogin(user.id, policy.lockoutAttempts, policy.lockoutMinutes);
      await this.recordRateLimitFailure(rateLimitKey);
      throw new UnauthorizedException("Invalid username or password.");
    }

    if (this.isPasswordExpired(user.passwordChangedAt, policy)) {
      throw new UnauthorizedException("Password expired. Contact an administrator to set a new password.");
    }

    await this.users.resetLoginState(user.id);
    await this.rateLimits.clear(rateLimitKey);

    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = this.hashSessionToken(sessionToken);
    const ttlHours = this.config.get<number>("SESSION_TTL_HOURS", 8);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.sessions.createSession({
      userId: user.id,
      tenantId: user.tenantId,
      sessionHash: sessionTokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    const authenticatedUser = await this.sessions.findAuthenticatedUser(sessionTokenHash);
    if (!authenticatedUser) {
      throw new UnauthorizedException("Unable to create session.");
    }

    return {
      user: authenticatedUser,
      sessionToken,
      expiresAt,
    };
  }

  async logout(sessionToken?: string): Promise<void> {
    if (!sessionToken) {
      return;
    }
    await this.sessions.revokeSession(this.hashSessionToken(sessionToken));
  }

  async authenticateSession(sessionToken?: string): Promise<AuthenticatedUser | null> {
    if (!sessionToken) {
      return null;
    }
    return this.sessions.findAuthenticatedUser(this.hashSessionToken(sessionToken));
  }

  hashSessionToken(sessionToken: string): string {
    return createHash("sha256").update(sessionToken).digest("hex");
  }

  private isPasswordExpired(
    passwordChangedAt: Date | null,
    policy: { expiryDays: number | null; forcePeriodicExpiry: boolean },
  ): boolean {
    if (!policy.forcePeriodicExpiry || !policy.expiryDays) return false;
    if (!passwordChangedAt) return true;
    const expiresAt = passwordChangedAt.getTime() + policy.expiryDays * 24 * 60 * 60 * 1000;
    return expiresAt <= Date.now();
  }

  private async recordRateLimitFailure(key: string): Promise<void> {
    await this.rateLimits.recordFailure({
      key,
      lockoutMinutes: this.config.get<number>("LOGIN_RATE_LIMIT_LOCKOUT_MINUTES", 15),
      maxAttempts: this.config.get<number>("LOGIN_RATE_LIMIT_ATTEMPTS", 10),
      windowMinutes: this.config.get<number>("LOGIN_RATE_LIMIT_WINDOW_MINUTES", 15),
    });
  }

  private rateLimitKey(input: {
    ipAddress?: string | undefined;
    tenantCode?: string | undefined;
    usernameOrEmail: string;
  }): string {
    return createHash("sha256")
      .update(
        [
          "login",
          input.ipAddress ?? "unknown",
          input.tenantCode?.toLowerCase() ?? "platform",
          input.usernameOrEmail.toLowerCase(),
        ].join(":"),
      )
      .digest("hex");
  }
}
