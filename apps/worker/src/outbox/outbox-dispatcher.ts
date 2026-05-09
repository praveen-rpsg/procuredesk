import type { Queue } from "bullmq";
import type { BaseLogger } from "pino";
import type { Pool, PoolClient } from "pg";

const MAX_OUTBOX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5);

export async function dispatchPendingOutbox(input: {
  exportsQueue: Queue;
  importsQueue: Queue;
  notificationsQueue: Queue;
  reportingQueue: Queue;
  logger?: BaseLogger;
  pool: Pool;
}): Promise<number> {
  const client = await input.pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{
      aggregate_id: string;
      attempts: number;
      event_type: string;
      id: string;
      payload: Record<string, unknown>;
      tenant_id: string;
    }>(
      `
        select id, tenant_id, event_type, aggregate_id, payload, attempts
        from ops.outbox_events
        where status in ('pending', 'failed')
          and available_at <= now()
          and event_type in (
            'notification_job.created',
            'import_job.created',
            'export_job.created',
            'procurement_case.created',
            'procurement_case.updated',
            'procurement_case.owner_assigned',
            'procurement_case.milestones_updated',
            'procurement_case.completed',
            'procurement_case.delayed',
            'procurement_case.delay_updated',
            'procurement_case.deleted',
            'procurement_case.restored',
            'case_award.created',
            'case_award.updated',
            'case_award.deleted',
            'rc_po_plan.created',
            'rc_po_plan.updated'
          )
        order by created_at asc
        limit 25
        for update skip locked
      `,
    );

    for (const event of result.rows) {
      try {
        const queue = queueForEvent(event, input);
        await queue.add(event.event_type, payloadForEvent(event), {
          attempts: 5,
          backoff: { delay: 30_000, type: "exponential" },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        });
        await client.query(
          `
            update ops.outbox_events
            set status = 'processed',
                processed_at = now()
            where id = $1
          `,
          [event.id],
        );
      } catch (error) {
        await markDispatchFailure(client, event, error, input.logger);
      }
    }

    await client.query("commit");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markDispatchFailure(
  client: PoolClient,
  event: {
    aggregate_id: string;
    attempts: number;
    event_type: string;
    id: string;
    payload: Record<string, unknown>;
    tenant_id: string;
  },
  error: unknown,
  logger?: BaseLogger,
): Promise<void> {
  const attempts = event.attempts + 1;
  const message = error instanceof Error ? error.message : "Outbox dispatch failed";
  if (attempts >= MAX_OUTBOX_ATTEMPTS) {
    await client.query(
      `
        update ops.outbox_events
        set status = 'dead_letter',
            attempts = $2,
            processed_at = now()
        where id = $1
      `,
      [event.id, attempts],
    );
    await client.query(
      `
        insert into ops.dead_letter_events (
          tenant_id, source, source_id, event_type, payload, error_message, attempts
        )
        values ($1, 'outbox', $2, $3, $4, $5, $6)
      `,
      [
        event.tenant_id,
        event.id,
        event.event_type,
        JSON.stringify(event.payload),
        message,
        attempts,
      ],
    );
    logger?.error(
      {
        event: "outbox.dlq",
        eventId: event.id,
        eventType: event.event_type,
        tenantId: event.tenant_id,
        attempts,
        error: message,
      },
      "Outbox event moved to dead-letter queue — manual investigation required",
    );
    return;
  }

  await client.query(
    `
      update ops.outbox_events
      set status = 'failed',
          attempts = $2,
          available_at = $3
      where id = $1
    `,
    [event.id, attempts, new Date(Date.now() + retryDelayMs(attempts))],
  );
}

function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(attempts - 1, 0), 15 * 60_000);
}

function queueForEvent(
  event: { event_type: string },
  input: { exportsQueue: Queue; importsQueue: Queue; notificationsQueue: Queue; reportingQueue: Queue },
): Queue {
  if (event.event_type === "import_job.created") return input.importsQueue;
  if (event.event_type === "export_job.created") return input.exportsQueue;
  if (isReportingProjectionEvent(event.event_type)) return input.reportingQueue;
  return input.notificationsQueue;
}

function payloadForEvent(event: {
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  tenant_id: string;
}): Record<string, string> {
  if (event.event_type === "import_job.created") {
    return {
      actorUserId: stringPayload(event.payload.actorUserId),
      importJobId: event.aggregate_id,
      tenantId: event.tenant_id,
    };
  }
  if (event.event_type === "export_job.created") {
    return { exportJobId: event.aggregate_id, tenantId: event.tenant_id };
  }
  if (isReportingProjectionEvent(event.event_type)) {
    return {
      aggregateId: event.aggregate_id,
      eventType: event.event_type,
      tenantId: event.tenant_id,
    };
  }
  return { notificationJobId: event.aggregate_id, tenantId: event.tenant_id };
}

function stringPayload(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isReportingProjectionEvent(eventType: string): boolean {
  return (
    eventType.startsWith("procurement_case.") ||
    eventType.startsWith("case_award.") ||
    eventType.startsWith("rc_po_plan.")
  );
}
