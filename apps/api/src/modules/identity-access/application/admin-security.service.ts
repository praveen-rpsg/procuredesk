import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../domain/authenticated-user.js";
import type { PasswordPolicy } from "../domain/password-policy.js";
import { PasswordPolicyRepository } from "../infrastructure/password-policy.repository.js";
import { UserRepository } from "../infrastructure/user.repository.js";
import { PasswordService } from "./password.service.js";

@Injectable()
export class AdminSecurityService {
  constructor(
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly passwordPolicies: PasswordPolicyRepository,
    private readonly passwords: PasswordService,
    private readonly users: UserRepository,
  ) {}

  getPasswordPolicy(actor: AuthenticatedUser): Promise<PasswordPolicy> {
    return this.passwordPolicies.findByTenantId(this.requireTenant(actor));
  }

  async updatePasswordPolicy(
    actor: AuthenticatedUser,
    input: Omit<PasswordPolicy, "tenantId">,
  ): Promise<PasswordPolicy> {
    const tenantId = this.requireTenant(actor);
    if (input.forcePeriodicExpiry && !input.expiryDays) {
      throw new BadRequestException("Expiry days are required when periodic expiry is enabled.");
    }
    return this.db.transaction(async () => {
      const policy = await this.passwordPolicies.upsert({ ...input, tenantId });
      await this.audit.write({
        action: "security.password_policy.update",
        actorUserId: actor.id,
        details: {
          forcePeriodicExpiry: policy.forcePeriodicExpiry,
          lockoutAttempts: policy.lockoutAttempts,
          lockoutMinutes: policy.lockoutMinutes,
          minLength: policy.minLength,
          passwordHistoryCount: policy.passwordHistoryCount,
        },
        summary: "Updated password policy",
        targetType: "password_policy",
        tenantId,
      });
      return policy;
    });
  }

  async setUserPassword(
    actor: AuthenticatedUser,
    input: { password: string; userId: string },
  ): Promise<{ updated: true }> {
    const tenantId = this.requireTenant(actor);
    const policy = await this.passwordPolicies.findByTenantId(tenantId);
    const errors = this.passwords.validateAgainstPolicy(input.password, policy);
    const historicalHashes = await this.users.listPasswordHashes({
      historyCount: policy.passwordHistoryCount,
      tenantId,
      userId: input.userId,
    });

    for (const hash of historicalHashes) {
      if (await this.passwords.verify(hash, input.password)) {
        errors.push("Password cannot match the current password or recent password history.");
        break;
      }
    }

    if (errors.length) {
      throw new BadRequestException(`Password does not satisfy policy: ${errors.join(" ")}`);
    }

    const passwordHash = await this.passwords.hash(input.password);
    await this.db.transaction(async () => {
      const updated = await this.users.setPassword({
        passwordHash,
        tenantId,
        updatedBy: actor.id,
        userId: input.userId,
      });
      if (!updated) {
        throw new NotFoundException("User not found.");
      }
      await this.audit.write({
        action: "user.password_set",
        actorUserId: actor.id,
        summary: "Admin set user password",
        targetId: input.userId,
        targetType: "user",
        tenantId,
      });
    });
    return { updated: true };
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId || actor.isPlatformSuperAdmin) {
      throw new ForbiddenException("Select a tenant context before managing tenant security.");
    }
    return actor.tenantId;
  }
}
