import type { Pool } from "pg";

import type { MicrosoftGraphClient, MicrosoftGraphSendResult, WorkerEmailAttachment } from "./microsoft-graph-client.js";
import { ensureWelcomeManualAttachment } from "./notification-attachments.js";
import {
  renderNotificationTemplate,
  type WorkerTemplateVersion,
} from "./notification-template-renderer.js";
import type { PrivateObjectStorage } from "../storage/private-object-storage.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type NotificationJobPayload = {
  notificationJobId: string;
  tenantId: string;
};

type LockedNotificationJob = {
  attempt_count: number;
  html_body: string | null;
  max_attempts: number;
  notification_type: string;
  payload_json: unknown;
  preheader_template: string | null;
  recipient_email: string;
  renderer_key: string | null;
  rule_enabled: boolean;
  subject: string;
  subject_template: string | null;
  template_version_id: string | null;
  text_body: string | null;
};

export async function processNotificationJob(
  payload: NotificationJobPayload,
  dependencies: {
    graph: MicrosoftGraphClient;
    pool: Pool;
    storage: PrivateObjectStorage;
  },
): Promise<void> {
  let attemptId: string | null = null;
  let attemptNumber = 0;
  let maxAttempts = 5;
  const startedAt = Date.now();

  const client = await dependencies.pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<LockedNotificationJob>(
      `
        select
          j.notification_type,
          j.recipient_email,
          j.subject,
          j.text_body,
          j.html_body,
          j.payload_json,
          j.attempt_count,
          j.max_attempts,
          coalesce(r.is_enabled, true) as rule_enabled,
          tv.id as template_version_id,
          tv.renderer_key,
          tv.subject_template,
          tv.preheader_template
        from ops.notification_jobs j
        left join ops.notification_rules r
          on r.tenant_id = j.tenant_id
         and r.notification_type = j.notification_type
         and r.deleted_at is null
        left join ops.notification_template_versions tv
          on tv.tenant_id = j.tenant_id
         and tv.id = j.template_version_id
        where j.tenant_id = $1
          and j.id = $2
          and j.status in ('queued', 'failed')
        for update of j
      `,
      [payload.tenantId, payload.notificationJobId],
    );
    const job = result.rows[0];
    if (!job) {
      await client.query("rollback");
      return;
    }

    if (!job.rule_enabled) {
      await client.query(
        `
          update ops.notification_jobs
          set status = 'cancelled',
              cancelled_at = now(),
              updated_at = now(),
              error_message = 'Notification rule disabled.'
          where tenant_id = $1
            and id = $2
        `,
        [payload.tenantId, payload.notificationJobId],
      );
      await insertAuditEvent(client, {
        action: "notification_job.cancelled",
        details: { notificationType: job.notification_type },
        summary: "Notification email skipped because the rule is disabled",
        targetId: payload.notificationJobId,
        tenantId: payload.tenantId,
      });
      await client.query("commit");
      return;
    }

    attemptNumber = job.attempt_count + 1;
    maxAttempts = job.max_attempts;
    const email = renderNotificationTemplate({
      fallback: {
        htmlBody: job.html_body ?? "",
        subject: job.subject,
        textBody: job.text_body ?? `${job.subject}\n\nNotification type: ${job.notification_type}`,
      },
      notificationType: job.notification_type,
      payload: isRecord(job.payload_json) ? job.payload_json : {},
      templateVersion: mapLockedTemplateVersion(job),
    });
    const attempt = await client.query<{ id: string }>(
      `
        insert into ops.notification_delivery_attempts (
          tenant_id, notification_job_id, attempt_number, status, provider, started_at
        )
        values ($1, $2, $3, 'sending', 'microsoft_graph', now())
        returning id
      `,
      [payload.tenantId, payload.notificationJobId, attemptNumber],
    );
    attemptId = attempt.rows[0]?.id ?? null;

    await client.query(
      `
        update ops.notification_jobs
        set status = 'sending',
            attempt_count = $3,
            subject = $4,
            text_body = $5,
            html_body = $6,
            rendered_at = coalesce(rendered_at, now()),
            error_message = null,
            updated_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [payload.tenantId, payload.notificationJobId, attemptNumber, email.subject, email.textBody, email.htmlBody],
    );
    await client.query("commit");

    assertValidRecipientEmail(job.recipient_email);
    await ensureWelcomeManualAttachment(dependencies.pool, dependencies.storage, {
      jobId: payload.notificationJobId,
      notificationType: job.notification_type,
      tenantId: payload.tenantId,
    });

    const attachments = await loadAttachments(dependencies.pool, dependencies.storage, {
      notificationJobId: payload.notificationJobId,
      tenantId: payload.tenantId,
    });

    const providerResult = await dependencies.graph.send({
      attachments,
      htmlBody: email.htmlBody,
      subject: email.subject,
      textBody: email.textBody,
      to: job.recipient_email,
    });

    await markAttemptSent(dependencies.pool, {
      attemptId,
      durationMs: Date.now() - startedAt,
      providerResult,
      tenantId: payload.tenantId,
    });
    await dependencies.pool.query(
      `
        update ops.notification_jobs
        set status = 'sent',
            sent_at = now(),
            provider_message_id = $3,
            provider_response = $4,
            error_message = null,
            updated_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [
        payload.tenantId,
        payload.notificationJobId,
        providerResult.requestId,
        JSON.stringify(providerResult),
      ],
    );
    await markAttachmentsAttached(dependencies.pool, {
      notificationJobId: payload.notificationJobId,
      tenantId: payload.tenantId,
    });
    await insertAuditEvent(dependencies.pool, {
      action: "notification_job.sent",
      details: {
        attemptNumber,
        notificationType: job.notification_type,
        provider: providerResult.provider,
        requestId: providerResult.requestId,
      },
      summary: "Notification email sent",
      targetId: payload.notificationJobId,
      tenantId: payload.tenantId,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    await handleNotificationDeliveryFailure(dependencies.pool, {
      attemptId,
      attemptNumber,
      error,
      maxAttempts,
      notificationJobId: payload.notificationJobId,
      startedAt,
      tenantId: payload.tenantId,
    });
    throw error;
  } finally {
    client.release();
  }
}

async function handleNotificationDeliveryFailure(
  pool: Pool,
  input: {
    attemptId: string | null;
    attemptNumber: number;
    error: unknown;
    maxAttempts: number;
    notificationJobId: string;
    startedAt: number;
    tenantId: string;
  },
): Promise<void> {
  const message = input.error instanceof Error ? input.error.message : "Unknown notification delivery error";
  const exhausted = input.attemptNumber >= input.maxAttempts;
  await markAttemptFailed(pool, {
    attemptId: input.attemptId,
    durationMs: Date.now() - input.startedAt,
    errorMessage: message,
    tenantId: input.tenantId,
  });
  await pool.query(
    `
      update ops.notification_jobs
      set status = $3,
          error_message = $4,
          failed_at = now(),
          next_retry_at = case when $3 = 'failed' then now() + ($5::text || ' seconds')::interval else null end,
          updated_at = now()
      where tenant_id = $1
        and id = $2
    `,
    [
      input.tenantId,
      input.notificationJobId,
      exhausted ? "dead_letter" : "failed",
      message,
      retryDelaySeconds(input.attemptNumber),
    ],
  );
  if (exhausted) {
    await pool.query(
      `
        insert into ops.dead_letter_events (
          tenant_id, source, source_id, event_type, payload, error_message, attempts
        )
        values ($1, 'notification', $2, 'notification_job.delivery_failed', $3, $4, $5)
      `,
      [
        input.tenantId,
        input.notificationJobId,
        JSON.stringify({ notificationJobId: input.notificationJobId }),
        message,
        input.attemptNumber,
      ],
    );
  }
  await insertAuditEvent(pool, {
    action: exhausted ? "notification_job.dead_letter" : "notification_job.failed",
    details: {
      attemptNumber: input.attemptNumber,
      error: message,
      maxAttempts: input.maxAttempts,
    },
    summary: exhausted ? "Notification email moved to dead-letter queue" : "Notification email delivery failed",
    targetId: input.notificationJobId,
    tenantId: input.tenantId,
  });
}

function assertValidRecipientEmail(email: string): void {
  if (!EMAIL_REGEX.test(email)) {
    throw new Error(`Invalid recipient email address: ${email}`);
  }
}

function mapLockedTemplateVersion(job: LockedNotificationJob): WorkerTemplateVersion | null {
  if (!job.template_version_id || !job.renderer_key || !job.subject_template) return null;
  return {
    id: job.template_version_id,
    preheaderTemplate: job.preheader_template,
    rendererKey: job.renderer_key,
    subjectTemplate: job.subject_template,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadAttachments(
  pool: Pool,
  storage: PrivateObjectStorage,
  input: {
    notificationJobId: string;
    tenantId: string;
  },
): Promise<WorkerEmailAttachment[]> {
  const result = await pool.query<{
    content_type: string;
    file_name: string;
    storage_key: string;
  }>(
    `
      select a.file_name, a.content_type, f.storage_key
      from ops.email_attachments a
      join ops.file_assets f on f.id = a.file_asset_id and f.tenant_id = a.tenant_id
      where a.tenant_id = $1
        and a.notification_job_id = $2
        and a.status in ('generated', 'attached')
        and (a.expires_at is null or a.expires_at > now())
      order by a.created_at asc
    `,
    [input.tenantId, input.notificationJobId],
  );
  const attachments: WorkerEmailAttachment[] = [];
  for (const row of result.rows) {
    const data = await storage.read(row.storage_key);
    attachments.push({
      contentBase64: data.toString("base64"),
      contentType: row.content_type,
      name: row.file_name,
    });
  }
  return attachments;
}

async function markAttachmentsAttached(
  pool: Pool,
  input: {
    notificationJobId: string;
    tenantId: string;
  },
): Promise<void> {
  const attached = await pool.query<{ file_name: string; id: string }>(
    `
      update ops.email_attachments
      set status = 'attached',
          updated_at = now()
      where tenant_id = $1
        and notification_job_id = $2
        and status = 'generated'
      returning id, file_name
    `,
    [input.tenantId, input.notificationJobId],
  );
  for (const row of attached.rows) {
    await insertAuditEvent(pool, {
      action: "email_attachment.attached",
      details: {
        fileName: row.file_name,
        notificationJobId: input.notificationJobId,
      },
      summary: "Notification attachment attached to email delivery",
      targetId: row.id,
      targetType: "email_attachment",
      tenantId: input.tenantId,
    });
  }
}

async function markAttemptSent(
  pool: Pool,
  input: {
    attemptId: string | null;
    durationMs: number;
    providerResult: MicrosoftGraphSendResult;
    tenantId: string;
  },
): Promise<void> {
  if (!input.attemptId) return;
  await pool.query(
    `
      update ops.notification_delivery_attempts
      set status = 'sent',
          provider_message_id = $3,
          provider_request_id = $4,
          provider_response = $5,
          completed_at = now(),
          duration_ms = $6
      where tenant_id = $1
        and id = $2
    `,
    [
      input.tenantId,
      input.attemptId,
      input.providerResult.requestId,
      input.providerResult.clientRequestId,
      JSON.stringify(input.providerResult),
      input.durationMs,
    ],
  );
}

async function markAttemptFailed(
  pool: Pool,
  input: {
    attemptId: string | null;
    durationMs: number;
    errorMessage: string;
    tenantId: string;
  },
): Promise<void> {
  if (!input.attemptId) return;
  await pool.query(
    `
      update ops.notification_delivery_attempts
      set status = 'failed',
          error_message = $3,
          completed_at = now(),
          duration_ms = $4
      where tenant_id = $1
        and id = $2
    `,
    [input.tenantId, input.attemptId, input.errorMessage, input.durationMs],
  );
}

async function insertAuditEvent(
  queryable: Pool | { query: Pool["query"] },
  input: {
    action: string;
    details: Record<string, unknown>;
    summary: string;
    targetId: string;
    targetType?: string | undefined;
    tenantId: string;
  },
): Promise<void> {
  await queryable.query(
    `
      insert into ops.audit_events (
        tenant_id, action, target_type, target_id, summary, details
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.tenantId,
      input.action,
      input.targetType ?? "notification_job",
      input.targetId,
      input.summary,
      JSON.stringify(input.details),
    ],
  );
}

function retryDelaySeconds(attemptNumber: number): number {
  return Math.min(30 * 2 ** Math.max(attemptNumber - 1, 0), 15 * 60);
}
