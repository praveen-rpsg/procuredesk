import type { Pool } from "pg";

import type { MicrosoftGraphClient } from "./microsoft-graph-client.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type NotificationJobPayload = {
  notificationJobId: string;
  tenantId: string;
};

export async function processNotificationJob(
  payload: NotificationJobPayload,
  dependencies: {
    graph: MicrosoftGraphClient;
    pool: Pool;
  },
): Promise<void> {
  const client = await dependencies.pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{
      notification_type: string;
      recipient_email: string;
      subject: string;
    }>(
      `
        select notification_type, recipient_email, subject
        from ops.notification_jobs
        where tenant_id = $1
          and id = $2
          and status in ('queued', 'failed')
        for update
      `,
      [payload.tenantId, payload.notificationJobId],
    );
    const job = result.rows[0];
    if (!job) {
      await client.query("rollback");
      return;
    }

    await client.query(
      `
        update ops.notification_jobs
        set status = 'sending',
            error_message = null
        where tenant_id = $1
          and id = $2
      `,
      [payload.tenantId, payload.notificationJobId],
    );
    await client.query("commit");

    if (!EMAIL_REGEX.test(job.recipient_email)) {
      throw new Error(`Invalid recipient email address: ${job.recipient_email}`);
    }

    await dependencies.graph.send({
      subject: job.subject,
      textBody: `${job.subject}\n\nNotification type: ${job.notification_type}`,
      to: job.recipient_email,
    });

    await dependencies.pool.query(
      `
        update ops.notification_jobs
        set status = 'sent',
            sent_at = now(),
            error_message = null
        where tenant_id = $1
          and id = $2
      `,
      [payload.tenantId, payload.notificationJobId],
    );
    await dependencies.pool.query(
      `
        insert into ops.audit_events (
          tenant_id, action, target_type, target_id, summary, details
        )
        values ($1, 'notification_job.sent', 'notification_job', $2, $3, $4)
      `,
      [
        payload.tenantId,
        payload.notificationJobId,
        "Notification email sent",
        JSON.stringify({ notificationType: job.notification_type }),
      ],
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    await dependencies.pool.query(
      `
        update ops.notification_jobs
        set status = 'failed',
            error_message = $3
        where tenant_id = $1
          and id = $2
      `,
      [
        payload.tenantId,
        payload.notificationJobId,
        error instanceof Error ? error.message : "Unknown notification delivery error",
      ],
    );
    await dependencies.pool.query(
      `
        insert into ops.audit_events (
          tenant_id, action, target_type, target_id, summary, details
        )
        values ($1, 'notification_job.failed', 'notification_job', $2, $3, $4)
      `,
      [
        payload.tenantId,
        payload.notificationJobId,
        "Notification email delivery failed",
        JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      ],
    );
    throw error;
  } finally {
    client.release();
  }
}
