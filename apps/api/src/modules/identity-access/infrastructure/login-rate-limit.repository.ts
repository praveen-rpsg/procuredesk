import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

@Injectable()
export class LoginRateLimitRepository {
  constructor(private readonly db: DatabaseService) {}

  async isLocked(key: string): Promise<boolean> {
    const row = await this.db.one<QueryResultRow & { locked: boolean }>(
      `
        select exists (
          select 1
          from ops.login_rate_limits
          where key = $1
            and locked_until is not null
            and locked_until > now()
        ) as locked
      `,
      [key],
    );
    return row?.locked ?? false;
  }

  async recordFailure(input: {
    key: string;
    lockoutMinutes: number;
    maxAttempts: number;
    windowMinutes: number;
  }): Promise<void> {
    await this.db.query(
      `
        insert into ops.login_rate_limits (key, attempts, window_start, locked_until, updated_at)
        values ($1, 1, now(), null, now())
        on conflict (key) do update
        set attempts = case
              when ops.login_rate_limits.window_start < now() - ($3::text || ' minutes')::interval then 1
              else ops.login_rate_limits.attempts + 1
            end,
            window_start = case
              when ops.login_rate_limits.window_start < now() - ($3::text || ' minutes')::interval then now()
              else ops.login_rate_limits.window_start
            end,
            locked_until = case
              when (
                case
                  when ops.login_rate_limits.window_start < now() - ($3::text || ' minutes')::interval then 1
                  else ops.login_rate_limits.attempts + 1
                end
              ) >= $2 then now() + ($4::text || ' minutes')::interval
              else ops.login_rate_limits.locked_until
            end,
            updated_at = now()
      `,
      [input.key, input.maxAttempts, input.windowMinutes, input.lockoutMinutes],
    );
  }

  async clear(key: string): Promise<void> {
    await this.db.query("delete from ops.login_rate_limits where key = $1", [key]);
  }
}
