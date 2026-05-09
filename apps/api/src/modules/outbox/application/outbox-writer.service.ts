import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";

export type OutboxEventInput = {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  tenantId?: string | null;
};

@Injectable()
export class OutboxWriterService {
  constructor(private readonly db: DatabaseService) {}

  async write(input: OutboxEventInput): Promise<void> {
    await this.writeMany([input]);
  }

  async writeMany(events: OutboxEventInput[]): Promise<void> {
    if (!events.length) return;

    const values: unknown[] = [];
    const rows = events.map((event, index) => {
      const offset = index * 5;
      values.push(
        event.tenantId ?? null,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify(event.payload),
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    await this.db.query(
      `
        insert into ops.outbox_events (
          tenant_id, event_type, aggregate_type, aggregate_id, payload
        )
        values ${rows.join(", ")}
      `,
      values,
    );
  }
}
