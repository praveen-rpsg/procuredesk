import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";
import type { PasswordPolicy } from "../domain/password-policy.js";

type PasswordPolicyRow = {
  expiry_days: number | null;
  force_periodic_expiry: boolean;
  lockout_attempts: number;
  lockout_minutes: number;
  min_length: number;
  password_history_count: number;
  require_lowercase: boolean;
  require_number: boolean;
  require_special_character: boolean;
  require_uppercase: boolean;
  tenant_id: string;
};

@Injectable()
export class PasswordPolicyRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByTenantId(tenantId: string): Promise<PasswordPolicy> {
    const row = await this.db.one<QueryResultRow & PasswordPolicyRow>(
      `
        select
          tenant_id,
          min_length,
          require_uppercase,
          require_lowercase,
          require_number,
          require_special_character,
          password_history_count,
          lockout_attempts,
          lockout_minutes,
          force_periodic_expiry,
          expiry_days
        from iam.password_policies
        where tenant_id = $1
      `,
      [tenantId],
    );

    if (!row) {
      return {
        tenantId,
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

    return mapPasswordPolicyRow(row);
  }

  async upsert(input: PasswordPolicy): Promise<PasswordPolicy> {
    const row = await this.db.one<QueryResultRow & PasswordPolicyRow>(
      `
        insert into iam.password_policies (
          tenant_id, min_length, require_uppercase, require_lowercase,
          require_number, require_special_character, password_history_count,
          lockout_attempts, lockout_minutes, force_periodic_expiry, expiry_days
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (tenant_id) do update
        set min_length = excluded.min_length,
            require_uppercase = excluded.require_uppercase,
            require_lowercase = excluded.require_lowercase,
            require_number = excluded.require_number,
            require_special_character = excluded.require_special_character,
            password_history_count = excluded.password_history_count,
            lockout_attempts = excluded.lockout_attempts,
            lockout_minutes = excluded.lockout_minutes,
            force_periodic_expiry = excluded.force_periodic_expiry,
            expiry_days = excluded.expiry_days,
            updated_at = now()
        returning *
      `,
      [
        input.tenantId,
        input.minLength,
        input.requireUppercase,
        input.requireLowercase,
        input.requireNumber,
        input.requireSpecialCharacter,
        input.passwordHistoryCount,
        input.lockoutAttempts,
        input.lockoutMinutes,
        input.forcePeriodicExpiry,
        input.expiryDays,
      ],
    );

    return row ? mapPasswordPolicyRow(row) : input;
  }
}

function mapPasswordPolicyRow(row: PasswordPolicyRow): PasswordPolicy {
  return {
    expiryDays: row.expiry_days,
    forcePeriodicExpiry: row.force_periodic_expiry,
    lockoutAttempts: row.lockout_attempts,
    lockoutMinutes: row.lockout_minutes,
    minLength: row.min_length,
    passwordHistoryCount: row.password_history_count,
    requireLowercase: row.require_lowercase,
    requireNumber: row.require_number,
    requireSpecialCharacter: row.require_special_character,
    requireUppercase: row.require_uppercase,
    tenantId: row.tenant_id,
  };
}
