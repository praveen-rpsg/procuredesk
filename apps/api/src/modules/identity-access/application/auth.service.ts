import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";

import { DatabaseService } from "../../../database/database.service.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import type { AuthenticatedUser } from "../domain/authenticated-user.js";
import type { PasswordPolicy } from "../domain/password-policy.js";
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
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const loginId = input.usernameOrEmail.trim().toLowerCase();
    const tenantCode = input.tenantCode?.trim() || undefined;
    const rateLimitKey = this.rateLimitKey({
      ipAddress: input.ipAddress,
      tenantCode,
      usernameOrEmail: loginId,
    });
    if (await this.rateLimits.isLocked(rateLimitKey)) {
      throw new UnauthorizedException(
        "Too many login attempts. Try again later.",
      );
    }

    const user = await this.users.findForLogin(loginId, tenantCode);

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

    const isValidPassword = await this.passwords.verify(
      user.passwordHash,
      input.password,
    );
    if (!isValidPassword) {
      await this.users.recordFailedLogin(
        user.id,
        policy.lockoutAttempts,
        policy.lockoutMinutes,
      );
      await this.recordRateLimitFailure(rateLimitKey);
      throw new UnauthorizedException("Invalid username or password.");
    }

    if (this.isPasswordExpired(user.passwordChangedAt, policy)) {
      throw new UnauthorizedException(
        "Password expired. Contact an administrator to set a new password.",
      );
    }

    const sessionTenantId = await this.resolveSessionTenantId(user, tenantCode);

    await this.users.resetLoginState(user.id);
    await this.rateLimits.clear(rateLimitKey);

    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = this.hashSessionToken(sessionToken);
    const ttlHours = this.config.get<number>("SESSION_TTL_HOURS", 8);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.sessions.createSession({
      userId: user.id,
      tenantId: sessionTenantId,
      sessionHash: sessionTokenHash,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    const authenticatedUser =
      await this.sessions.findAuthenticatedUser(sessionTokenHash);
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

  async authenticateSession(
    sessionToken?: string,
  ): Promise<AuthenticatedUser | null> {
    if (!sessionToken) {
      return null;
    }
    return this.sessions.findAuthenticatedUser(
      this.hashSessionToken(sessionToken),
    );
  }

  async updateOwnProfile(
    actor: AuthenticatedUser,
    input: { fullName: string },
  ): Promise<{ user: AuthenticatedUser }> {
    const fullName = input.fullName.trim();
    const updated = await this.users.updateOwnProfile({
      fullName,
      tenantId: actor.tenantId,
      updatedBy: actor.id,
      userId: actor.id,
    });
    if (!updated) {
      throw new NotFoundException("User profile not found.");
    }
    return { user: { ...actor, fullName } };
  }

  async changeOwnPassword(
    actor: AuthenticatedUser,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ updated: true }> {
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException(
        "New password must be different from the current password.",
      );
    }

    const passwordRecord = await this.users.findPasswordRecord({
      tenantId: actor.tenantId,
      userId: actor.id,
    });
    if (!passwordRecord?.passwordHash) {
      throw new NotFoundException("User password is not available.");
    }

    const currentPasswordMatches = await this.passwords.verify(
      passwordRecord.passwordHash,
      input.currentPassword,
    );
    if (!currentPasswordMatches) {
      throw new UnauthorizedException("Current password is incorrect.");
    }

    const policy = await this.passwordPolicyForUser(actor.tenantId);
    const errors = this.passwords.validateAgainstPolicy(
      input.newPassword,
      policy,
    );
    const historicalHashes = await this.users.listOwnPasswordHashes({
      historyCount: policy.passwordHistoryCount,
      tenantId: actor.tenantId,
      userId: actor.id,
    });

    for (const hash of historicalHashes) {
      if (await this.passwords.verify(hash, input.newPassword)) {
        errors.push(
          "Password cannot match the current password or recent password history.",
        );
        break;
      }
    }

    if (errors.length) {
      throw new BadRequestException(
        `Password does not satisfy policy: ${errors.join(" ")}`,
      );
    }

    const passwordHash = await this.passwords.hash(input.newPassword);
    const updated = await this.users.setOwnPassword({
      passwordHash,
      tenantId: actor.tenantId,
      updatedBy: actor.id,
      userId: actor.id,
    });
    if (!updated) {
      throw new NotFoundException("User profile not found.");
    }
    return { updated: true };
  }

  async forgotPassword(input: {
    email: string;
    ipAddress?: string | undefined;
    tenantCode?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<{ ok: true }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findForPasswordReset(email, input.tenantCode);
    if (!user) return { ok: true };

    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.users.createPasswordResetToken({
      expiresAt,
      requestedEmail: email,
      requestIp: input.ipAddress ?? null,
      tenantId: user.tenantId,
      tokenHash,
      userAgent: input.userAgent ?? null,
      userId: user.id,
    });

    if (user.tenantId) {
      const resetUrl = new URL("/reset-password", this.config.get<string>("APP_URL", "http://localhost:5175"));
      resetUrl.searchParams.set("token", token);
      if (user.tenantCode) resetUrl.searchParams.set("tenant", user.tenantCode);
      const notification = await this.createNotificationJob({
        notificationType: "password_reset",
        recipientEmail: user.email,
        subject: "Reset your ProcureDesk password",
        tenantId: user.tenantId,
        textBody: [
          `Hello ${user.fullName},`,
          "",
          "We received a request to reset your ProcureDesk password.",
          `Reset link: ${resetUrl.toString()}`,
          "",
          "This link expires in 1 hour. If you did not request it, ignore this email.",
        ].join("\n"),
      });
      await this.outbox.write({
        aggregateId: notification.id,
        aggregateType: "notification_job",
        eventType: "notification_job.created",
        payload: { notificationType: "password_reset" },
        tenantId: user.tenantId,
      });
    }

    return { ok: true };
  }

  async resetPassword(input: {
    newPassword: string;
    token: string;
  }): Promise<{ updated: true }> {
    const reset = await this.users.consumePasswordResetToken({
      tokenHash: this.hashResetToken(input.token),
    });
    if (!reset) {
      throw new BadRequestException("Password reset link is invalid or expired.");
    }
    const policy = await this.passwordPolicyForUser(reset.tenantId);
    const errors = this.passwords.validateAgainstPolicy(input.newPassword, policy);
    const historicalHashes = reset.tenantId
      ? await this.users.listPasswordHashes({
          historyCount: policy.passwordHistoryCount,
          tenantId: reset.tenantId,
          userId: reset.userId,
        })
      : await this.users.listOwnPasswordHashes({
          historyCount: policy.passwordHistoryCount,
          tenantId: null,
          userId: reset.userId,
        });
    for (const hash of historicalHashes) {
      if (await this.passwords.verify(hash, input.newPassword)) {
        errors.push("Password cannot match the current password or recent password history.");
        break;
      }
    }
    if (errors.length) {
      throw new BadRequestException(`Password does not satisfy policy: ${errors.join(" ")}`);
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    const updated = reset.tenantId
      ? await this.users.setPassword({
          passwordHash,
          tenantId: reset.tenantId,
          updatedBy: reset.userId,
          userId: reset.userId,
        })
      : await this.users.setOwnPassword({
          passwordHash,
          tenantId: null,
          updatedBy: reset.userId,
          userId: reset.userId,
        });
    if (!updated) throw new BadRequestException("Password reset failed.");
    return { updated: true };
  }

  hashSessionToken(sessionToken: string): string {
    return createHash("sha256").update(sessionToken).digest("hex");
  }

  private async createNotificationJob(input: {
    notificationType: string;
    recipientEmail: string;
    subject: string;
    tenantId: string;
    textBody: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<{ id: string }>(
      `
        insert into ops.notification_jobs (
          tenant_id, notification_type, recipient_email, subject, text_body
        )
        values ($1, $2, $3, $4, $5)
        returning id
      `,
      [
        input.tenantId,
        input.notificationType,
        input.recipientEmail,
        input.subject,
        input.textBody,
      ],
    );
    if (!row) throw new Error("Failed to create password reset notification.");
    return { id: row.id };
  }

  private hashResetToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private passwordPolicyForUser(
    tenantId: string | null,
  ): Promise<PasswordPolicy> | PasswordPolicy {
    if (tenantId) {
      return this.passwordPolicies.findByTenantId(tenantId);
    }
    return {
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
  }

  private async resolveSessionTenantId(
    user: { isPlatformSuperAdmin: boolean; tenantId: string | null },
    tenantCode?: string | undefined,
  ): Promise<string | null> {
    if (!user.isPlatformSuperAdmin) {
      return user.tenantId;
    }
    if (!tenantCode) {
      return null;
    }

    const tenantId = await this.users.findTenantIdByCode(tenantCode);
    if (!tenantId) {
      throw new UnauthorizedException("Invalid username or password.");
    }
    return tenantId;
  }

  private isPasswordExpired(
    passwordChangedAt: Date | null,
    policy: { expiryDays: number | null; forcePeriodicExpiry: boolean },
  ): boolean {
    if (!policy.forcePeriodicExpiry || !policy.expiryDays) return false;
    if (!passwordChangedAt) return true;
    const expiresAt =
      passwordChangedAt.getTime() + policy.expiryDays * 24 * 60 * 60 * 1000;
    return expiresAt <= Date.now();
  }

  private async recordRateLimitFailure(key: string): Promise<void> {
    await this.rateLimits.recordFailure({
      key,
      lockoutMinutes: this.config.get<number>(
        "LOGIN_RATE_LIMIT_LOCKOUT_MINUTES",
        15,
      ),
      maxAttempts: this.config.get<number>("LOGIN_RATE_LIMIT_ATTEMPTS", 10),
      windowMinutes: this.config.get<number>(
        "LOGIN_RATE_LIMIT_WINDOW_MINUTES",
        15,
      ),
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
