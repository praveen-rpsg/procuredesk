import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type DeadLetterEvent = {
  attempts: number;
  createdAt: string;
  errorMessage: string;
  eventType: string;
  id: string;
  source: string;
  sourceId: string;
};

@Injectable()
export class DeadLetterRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string): Promise<DeadLetterEvent[]> {
    const result = await this.db.query<
      QueryResultRow & {
        attempts: number;
        created_at: Date;
        error_message: string;
        event_type: string;
        id: string;
        source: string;
        source_id: string;
      }
    >(
      `
        select id, source, source_id, event_type, error_message, attempts, created_at
        from ops.dead_letter_events
        where tenant_id = $1
        order by created_at desc
        limit 50
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      attempts: row.attempts,
      createdAt: row.created_at.toISOString(),
      errorMessage: row.error_message,
      eventType: row.event_type,
      id: row.id,
      source: row.source,
      sourceId: row.source_id,
    }));
  }
}
