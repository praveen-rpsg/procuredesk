import type { BaseLogger } from "pino";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { generateNotificationAttachments } from "./notification-attachments.js";
import {
  renderNotificationTemplate,
  type WorkerTemplateVersion,
} from "./notification-template-renderer.js";
import type { PrivateObjectStorage } from "../storage/private-object-storage.js";

const IST_OFFSET_MINUTES = 330;
const DEFAULT_APP_URL = process.env.APP_URL ?? "http://localhost:5175";
const DEFAULT_SUPPORT: EmailSupport = {
  email: "santanu.mukherjee@rpsg.in",
  name: "Mr. Santanu Mukherjee",
  phone: "6297445379",
};

type EmailSupport = {
  email: string;
  name: string;
  phone?: string | undefined;
};

export async function processDueNotificationSchedules(input: {
  logger?: BaseLogger;
  pool: Pool;
  storage: PrivateObjectStorage;
}): Promise<number> {
  const schedules = await claimDueNotificationSchedules(input.pool);
  for (const schedule of schedules) {
    await runSchedule(input.pool, schedule, input.storage, input.logger);
  }
  return schedules.length;
}

async function claimDueNotificationSchedules(pool: Pool): Promise<NotificationScheduleRow[]> {
  const client = await pool.connect();
  const schedules: NotificationScheduleRow[] = [];
  try {
    await client.query("begin");
    const result = await client.query<QueryResultRow & NotificationScheduleRow>(
      `
        select
          id, tenant_id, schedule_key, notification_type, template_id, name,
          cadence, interval_days, day_of_month, run_time::text as run_time,
          timezone, threshold_days, recipient_mode, condition_json, next_run_at
        from ops.notification_schedules
        where deleted_at is null
          and is_enabled = true
          and (last_status <> 'running' or updated_at < now() - interval '15 minutes')
          and (next_run_at is null or next_run_at <= now())
        order by next_run_at asc nulls first, updated_at asc
        limit 10
        for update skip locked
      `,
    );

    for (const schedule of result.rows) {
      if (!schedule.next_run_at) {
        const nextRunAt = calculateNextNotificationScheduleRun(schedule, new Date());
        await client.query(
          `
            update ops.notification_schedules
            set next_run_at = $3,
                updated_at = now()
            where tenant_id = $1
              and id = $2
          `,
          [schedule.tenant_id, schedule.id, nextRunAt],
        );
        continue;
      }
      schedules.push(schedule);
    }

    for (const schedule of schedules) {
      await client.query(
        `
          update ops.notification_schedules
          set last_status = 'running',
              last_error_message = null,
              updated_at = now()
          where tenant_id = $1
            and id = $2
        `,
        [schedule.tenant_id, schedule.id],
      );
    }

    await client.query("commit");
    return schedules;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runSchedule(
  pool: Pool,
  schedule: NotificationScheduleRow,
  storage: PrivateObjectStorage,
  logger?: BaseLogger,
): Promise<void> {
  const client = await pool.connect();
  let eventId: string | null = null;
  let jobs: ScheduledNotificationJob[] = [];
  const windowStart = schedule.next_run_at ?? new Date();
  const windowEnd = new Date();
  const eventKey = `${schedule.schedule_key}:${formatIstDate(windowStart)}`;

  try {
    await client.query("begin");
    eventId = await insertScheduleEvent(client, schedule, eventKey, windowStart, windowEnd);
    if (!eventId) {
      await advanceSchedule(client, schedule, "skipped", "Schedule window was already processed.");
      await client.query("commit");
      return;
    }
    jobs = await buildJobsForSchedule(client, schedule, eventId, eventKey);
    await client.query("commit");

    await generatePostCommitAttachments(pool, storage, jobs, schedule, eventId);
    await finalizeScheduleRun(pool, schedule, eventId, eventKey, jobs);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : "Notification schedule failed";
    await markScheduleRunFailed(pool, schedule, eventId, message);
    logger?.error(
      {
        error: message,
        event: "notification_schedule.failed",
        scheduleId: schedule.id,
        scheduleKey: schedule.schedule_key,
        tenantId: schedule.tenant_id,
      },
      "Notification schedule failed",
    );
  } finally {
    client.release();
  }
}

async function insertScheduleEvent(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  eventKey: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<string | null> {
  const event = await client.query<{ id: string }>(
    `
      insert into ops.notification_events (
        tenant_id, schedule_id, notification_type, event_key, event_window_start,
        event_window_end, status, payload_json, started_at
      )
      values ($1, $2, $3, $4, $5, $6, 'running', $7, now())
      on conflict (tenant_id, event_key) do nothing
      returning id
    `,
    [
      schedule.tenant_id,
      schedule.id,
      schedule.notification_type,
      eventKey,
      windowStart,
      windowEnd,
      JSON.stringify({ scheduleKey: schedule.schedule_key }),
    ],
  );
  return event.rows[0]?.id ?? null;
}

async function generatePostCommitAttachments(
  pool: Pool,
  storage: PrivateObjectStorage,
  jobs: ScheduledNotificationJob[],
  schedule: NotificationScheduleRow,
  eventId: string,
): Promise<void> {
  for (const job of jobs) {
    if (!job.needsAttachment) continue;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await generateNotificationAttachments(client, storage, {
        eventId,
        jobId: job.id,
        notificationType: schedule.notification_type,
        payload: job.payload,
        scheduleKey: schedule.schedule_key,
        tenantId: schedule.tenant_id,
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function finalizeScheduleRun(
  pool: Pool,
  schedule: NotificationScheduleRow,
  eventId: string,
  eventKey: string,
  jobs: ScheduledNotificationJob[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const job of jobs) {
      await writeNotificationOutbox(client, schedule.tenant_id, job.id, schedule.notification_type);
    }
    await client.query(
      `
        update ops.notification_events
        set status = $3,
            recipient_count = $4,
            job_count = $5,
            completed_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [schedule.tenant_id, eventId, jobs.length ? "completed" : "skipped", jobs.length, jobs.length],
    );
    await advanceSchedule(client, schedule, jobs.length ? "succeeded" : "skipped", null);
    await insertAudit(client, {
      action: "notification_schedule.run",
      details: {
        eventKey,
        jobCount: jobs.length,
        notificationType: schedule.notification_type,
        scheduleKey: schedule.schedule_key,
      },
      summary: jobs.length
        ? `Notification schedule generated ${jobs.length} email job(s)`
        : "Notification schedule completed with no eligible emails",
      targetId: schedule.id,
      targetType: "notification_schedule",
      tenantId: schedule.tenant_id,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markScheduleRunFailed(
  pool: Pool,
  schedule: NotificationScheduleRow,
  eventId: string | null,
  message: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (eventId) {
      await client.query(
      `
        update ops.notification_events
        set status = 'failed',
            error_message = $3,
            completed_at = now()
        where tenant_id = $1
          and id = $2
      `,
        [schedule.tenant_id, eventId, message],
      );
    }
    await advanceSchedule(client, schedule, "failed", message);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function buildJobsForSchedule(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  eventId: string,
  eventKey: string,
): Promise<ScheduledNotificationJob[]> {
  const support = await getNotificationSupport(client, schedule.tenant_id);
  if (schedule.notification_type === "manager_daily_snapshot") {
    return createSnapshotJobs(client, schedule, eventId, eventKey, support);
  }
  if (schedule.notification_type === "stale_tender") {
    return createPendingTenderOwnerJobs(client, schedule, eventId, eventKey, support);
  }
  if (schedule.notification_type === "entity_monthly_digest") {
    return createMonthlyPendingTenderJobs(client, schedule, eventId, eventKey, support);
  }
  if (schedule.notification_type === "rc_po_expiry") {
    return createRcPoExpiryJobs(client, schedule, eventId, eventKey, support);
  }
  return [];
}

async function createSnapshotJobs(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  eventId: string,
  eventKey: string,
  support: EmailSupport,
): Promise<ScheduledNotificationJob[]> {
  const scope = objectPayload(schedule.condition_json).scope === "group" ? "group" : "entity";
  const result = await client.query<QueryResultRow & SnapshotRecipientRow>(
    scope === "group"
      ? `
        select
          u.id as recipient_user_id,
          u.email as recipient_email,
          u.full_name,
          'all mapped RPSG entities' as scope_label,
          null::text[] as entity_ids,
          count(distinct c.id) filter (where f.status = 'running')::int as running_tenders,
          count(distinct c.id) filter (where f.status = 'completed')::int as completed_tenders,
          count(distinct c.id) filter (where f.status = 'running' and coalesce(f.current_stage_aging_days, 0) >= 10)::int as stage_ageing_alerts,
          count(distinct c.id) filter (where f.status = 'running' and f.stage_code in (4, 5))::int as evaluation_pendency
        from iam.users u
        join iam.user_roles ur on ur.user_id = u.id
        join iam.roles r on r.id = ur.role_id and r.code = 'group_viewer'
        left join reporting.case_facts f on f.tenant_id = u.tenant_id
        left join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        where u.tenant_id = $1
          and u.deleted_at is null
          and u.status = 'active'
          and u.access_level = 'GROUP'
        group by u.id, u.email, u.full_name
        order by u.email asc
      `
      : `
        select
          u.id as recipient_user_id,
          u.email as recipient_email,
          u.full_name,
          string_agg(distinct e.name, ', ' order by e.name) as scope_label,
          array_agg(distinct e.id::text order by e.id::text) as entity_ids,
          count(distinct c.id) filter (where f.status = 'running')::int as running_tenders,
          count(distinct c.id) filter (where f.status = 'completed')::int as completed_tenders,
          count(distinct c.id) filter (where f.status = 'running' and coalesce(f.current_stage_aging_days, 0) >= 10)::int as stage_ageing_alerts,
          count(distinct c.id) filter (where f.status = 'running' and f.stage_code in (4, 5))::int as evaluation_pendency
        from iam.users u
        join iam.user_entity_scopes scope on scope.user_id = u.id
        join org.entities e on e.id = scope.entity_id and e.tenant_id = u.tenant_id and e.deleted_at is null
        join iam.user_roles ur on ur.user_id = u.id
        join iam.roles r on r.id = ur.role_id and r.code in ('entity_manager', 'entity_viewer')
        left join reporting.case_facts f on f.tenant_id = u.tenant_id and f.entity_id = scope.entity_id
        left join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        where u.tenant_id = $1
          and u.deleted_at is null
          and u.status = 'active'
          and u.access_level = 'ENTITY'
        group by u.id, u.email, u.full_name
        order by u.email asc
      `,
    [schedule.tenant_id],
  );

  const jobs: ScheduledNotificationJob[] = [];
  for (const row of result.rows) {
    const payload = {
      appUrl: DEFAULT_APP_URL,
      completedTenders: row.completed_tenders,
      evaluationPendency: row.evaluation_pendency,
      entityIds: row.entity_ids ?? [],
      fullName: row.full_name,
      runningTenders: row.running_tenders,
      scopeLabel: row.scope_label,
      scopeType: scope,
      stageAgeingAlerts: row.stage_ageing_alerts,
      support,
    };
    const email = buildSnapshotEmail(payload);
    const job = await insertNotificationJob(client, {
      email,
      eventId,
      eventKey,
      payload,
      priority: 5,
      recipientEmail: row.recipient_email,
      recipientUserId: row.recipient_user_id,
      schedule,
      scopedEntityIds: row.entity_ids ?? [],
    });
    if (job) {
      jobs.push({ ...job, needsAttachment: true, payload });
    }
  }
  return jobs;
}

async function createPendingTenderOwnerJobs(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  eventId: string,
  eventKey: string,
  support: EmailSupport,
): Promise<ScheduledNotificationJob[]> {
  const thresholdDays = schedule.threshold_days ?? 10;
  const result = await client.query<QueryResultRow & PendingTenderRow>(
    `
      select
        u.id as recipient_user_id,
        u.email as recipient_email,
        u.full_name,
        c.entity_id::text as entity_id,
        c.id as target_id,
        e.name as entity_name,
        c.pr_id,
        coalesce(c.pr_description, c.tender_name, '-') as description,
        'Stage ' || c.stage_code::text as tender_stage,
        coalesce(f.running_age_days, case when c.pr_receipt_date is not null then current_date - c.pr_receipt_date else null end)::int as run_age_days,
        coalesce(f.current_stage_aging_days, 0)::int as current_stage_ageing_days,
        greatest(0, current_date - c.updated_at::date)::int as days_since_last_update
      from procurement.cases c
      join iam.users u on u.id = c.owner_user_id and u.tenant_id = c.tenant_id
      join org.entities e on e.id = c.entity_id and e.tenant_id = c.tenant_id
      left join reporting.case_facts f on f.case_id = c.id and f.tenant_id = c.tenant_id
      where c.tenant_id = $1
        and c.deleted_at is null
        and c.status = 'running'
        and c.owner_user_id is not null
        and u.deleted_at is null
        and u.status = 'active'
        and c.updated_at < now() - ($2::text || ' days')::interval
      order by u.email asc, c.updated_at asc
      limit 500
    `,
    [schedule.tenant_id, thresholdDays],
  );

  const grouped = groupBy(result.rows, (row) => row.recipient_user_id);
  const jobs: ScheduledNotificationJob[] = [];
  for (const rows of grouped.values()) {
    const first = rows[0];
    if (!first) continue;
    const tenders = rows.map(mapPendingTenderRow);
    const payload = { appUrl: DEFAULT_APP_URL, fullName: first.full_name, support, tenders, thresholdDays };
    const email = buildPendingTenderEmail(payload);
    const job = await insertNotificationJob(client, {
      email,
      eventId,
      eventKey,
      payload,
      priority: 3,
      recipientEmail: first.recipient_email,
      recipientUserId: first.recipient_user_id,
      schedule,
      scopedEntityIds: uniqueStrings(rows.map((row) => row.entity_id)),
    });
    if (job) jobs.push({ ...job, needsAttachment: false, payload });
  }
  return jobs;
}

async function createMonthlyPendingTenderJobs(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  eventId: string,
  eventKey: string,
  support: EmailSupport,
): Promise<ScheduledNotificationJob[]> {
  const thresholdDays = schedule.threshold_days ?? 10;
  const result = await client.query<QueryResultRow & PendingTenderManagerRow>(
    `
      select
        u.id as recipient_user_id,
        u.email as recipient_email,
        u.full_name,
        scope_names.scope_label,
        owner.full_name as tender_owner,
        c.entity_id::text as entity_id,
        c.id as target_id,
        e.name as entity_name,
        c.pr_id,
        coalesce(c.pr_description, c.tender_name, '-') as description,
        'Stage ' || c.stage_code::text as tender_stage,
        coalesce(f.running_age_days, case when c.pr_receipt_date is not null then current_date - c.pr_receipt_date else null end)::int as run_age_days,
        coalesce(f.current_stage_aging_days, 0)::int as current_stage_ageing_days,
        greatest(0, current_date - c.updated_at::date)::int as days_since_last_update
      from iam.users u
      join iam.user_entity_scopes scope on scope.user_id = u.id
      join lateral (
        select string_agg(distinct se.name, ', ' order by se.name) as scope_label
        from iam.user_entity_scopes scope2
        join org.entities se on se.id = scope2.entity_id and se.tenant_id = u.tenant_id
        where scope2.user_id = u.id
      ) scope_names on true
      join iam.user_roles ur on ur.user_id = u.id
      join iam.roles r on r.id = ur.role_id and r.code in ('entity_manager', 'entity_viewer')
      join procurement.cases c on c.tenant_id = u.tenant_id and c.entity_id = scope.entity_id
      join org.entities e on e.id = c.entity_id and e.tenant_id = c.tenant_id
      left join iam.users owner on owner.id = c.owner_user_id and owner.tenant_id = c.tenant_id
      left join reporting.case_facts f on f.case_id = c.id and f.tenant_id = c.tenant_id
      where u.tenant_id = $1
        and u.deleted_at is null
        and u.status = 'active'
        and u.access_level = 'ENTITY'
        and c.deleted_at is null
        and c.status = 'running'
        and c.updated_at < now() - ($2::text || ' days')::interval
      order by u.email asc, e.name asc, c.updated_at asc
      limit 1000
    `,
    [schedule.tenant_id, thresholdDays],
  );

  const grouped = groupBy(result.rows, (row) => row.recipient_user_id);
  const jobs: ScheduledNotificationJob[] = [];
  for (const rows of grouped.values()) {
    const first = rows[0];
    if (!first) continue;
    const tenders = rows.map(mapPendingTenderRow);
    const entityGroups = Array.from(groupBy(tenders, (row) => stringValue(row.entity, "Entity")).entries())
      .map(([entity, groupRows]) => ({
        entity,
        tenders: groupRows,
      }));
    const payload = {
      appUrl: DEFAULT_APP_URL,
      entityGroups,
      fullName: first.full_name,
      scopeLabel: first.scope_label,
      support,
      tenders,
      thresholdDays,
    };
    const email = buildMonthlyPendingTenderEmail(payload);
    const job = await insertNotificationJob(client, {
      email,
      eventId,
      eventKey,
      payload,
      priority: 4,
      recipientEmail: first.recipient_email,
      recipientUserId: first.recipient_user_id,
      schedule,
      scopedEntityIds: uniqueStrings(rows.map((row) => row.entity_id)),
    });
    if (job) jobs.push({ ...job, needsAttachment: false, payload });
  }
  return jobs;
}

async function createRcPoExpiryJobs(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  eventId: string,
  eventKey: string,
  support: EmailSupport,
): Promise<ScheduledNotificationJob[]> {
  const thresholdDays = schedule.threshold_days ?? 90;
  const result = await client.query<QueryResultRow & RcPoRecipientRow>(
    `
      select distinct
        recipient.recipient_user_id,
        recipient.recipient_email,
        recipient.full_name,
        recipient.scope_label,
        f.entity_id::text as entity_id,
        f.id as target_id,
        e.name as entity_name,
        coalesce(f.tender_description, f.awarded_vendors, 'RC/PO contract') as tender_name,
        coalesce(f.rc_po_amount::text, '-') as rc_po_value,
        f.rc_po_award_date::text as rc_po_award_date,
        f.rc_po_validity_date::text as rc_po_validity_date,
        coalesce(owner.full_name, '-') as tender_owner,
        recipient.scope_type,
        (f.rc_po_validity_date - current_date)::int as days_remaining
      from reporting.contract_expiry_facts f
      join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
      left join iam.users owner on owner.id = f.owner_user_id and owner.tenant_id = f.tenant_id
      join lateral (
        select u.id as recipient_user_id, u.email as recipient_email, u.full_name, string_agg(distinct se.name, ', ' order by se.name) as scope_label, 'entity' as scope_type
        from iam.users u
        join iam.user_entity_scopes scope on scope.user_id = u.id and scope.entity_id = f.entity_id
        join org.entities se on se.id = scope.entity_id and se.tenant_id = u.tenant_id
        join iam.user_roles ur on ur.user_id = u.id
        join iam.roles r on r.id = ur.role_id and r.code in ('entity_manager', 'entity_viewer')
        where u.tenant_id = f.tenant_id
          and u.deleted_at is null
          and u.status = 'active'
          and u.access_level = 'ENTITY'
        group by u.id, u.email, u.full_name
        union all
        select u.id, u.email, u.full_name, 'all mapped RPSG entities' as scope_label, 'group' as scope_type
        from iam.users u
        join iam.user_roles ur on ur.user_id = u.id
        join iam.roles r on r.id = ur.role_id and r.code = 'group_viewer'
        where u.tenant_id = f.tenant_id
          and u.deleted_at is null
          and u.status = 'active'
          and u.access_level = 'GROUP'
      ) recipient on true
      where f.tenant_id = $1
        and f.source_deleted_at is null
        and f.tender_floated_or_not_required = false
        and f.rc_po_validity_date >= current_date
        and f.rc_po_validity_date <= current_date + ($2::text || ' days')::interval
      order by recipient.recipient_email asc, days_remaining asc
      limit 1500
    `,
    [schedule.tenant_id, thresholdDays],
  );

  const grouped = groupBy(result.rows, (row) => row.recipient_user_id);
  const jobs: ScheduledNotificationJob[] = [];
  for (const rows of grouped.values()) {
    const first = rows[0];
    if (!first) continue;
    const uniqueRows = uniqueBy(rows, (row) => `${row.target_id}:${row.recipient_user_id}`);
    const items = uniqueRows.map((row) => ({
      daysRemaining: row.days_remaining,
      entity: row.entity_name,
      owner: row.tender_owner,
      rcPoAwardDate: row.rc_po_award_date ?? "-",
      rcPoValidityDate: row.rc_po_validity_date,
      rcPoValue: formatMoney(row.rc_po_value),
      tenderName: row.tender_name,
    }));
    const payload = {
      appUrl: DEFAULT_APP_URL,
      excelAttached: true,
      fullName: first.full_name,
      items,
      scopeLabel: first.scope_label,
      scopeType: first.scope_type,
      support,
      thresholdDays,
    };
    const email = buildRcPoExpiryEmail(payload);
    const job = await insertNotificationJob(client, {
      email,
      eventId,
      eventKey,
      payload,
      priority: 3,
      recipientEmail: first.recipient_email,
      recipientUserId: first.recipient_user_id,
      schedule,
      scopedEntityIds: first.scope_type === "entity" ? uniqueStrings(uniqueRows.map((row) => row.entity_id)) : [],
    });
    if (job) {
      jobs.push({ ...job, needsAttachment: true, payload });
    }
  }
  return jobs;
}

async function insertNotificationJob(
  client: PoolClient,
  input: {
    email: RenderedEmail;
    eventId: string;
    eventKey: string;
    payload: Record<string, unknown>;
    priority: number;
    recipientEmail: string;
    recipientUserId: string;
    schedule: NotificationScheduleRow;
    scopedEntityIds: string[];
  },
): Promise<{ id: string } | null> {
  if (!(await isNotificationPreferenceEnabled(client, {
    entityIds: input.scopedEntityIds,
    notificationType: input.schedule.notification_type,
    tenantId: input.schedule.tenant_id,
    userId: input.recipientUserId,
  }))) {
    return null;
  }
  const templateVersion = await client.query<QueryResultRow & TemplateVersionRow>(
    `
      select id, renderer_key, subject_template, preheader_template
      from ops.notification_template_versions
      where tenant_id = $1
        and template_id = $2
        and status = 'published'
      order by version_number desc
      limit 1
    `,
    [input.schedule.tenant_id, input.schedule.template_id],
  );
  const version = templateVersion.rows[0] ? mapTemplateVersion(templateVersion.rows[0]) : null;
  const email = renderNotificationTemplate({
    fallback: input.email,
    notificationType: input.schedule.notification_type,
    payload: input.payload,
    templateVersion: version,
  });
  const idempotencyKey = `${input.eventKey}:${input.recipientUserId}`;
  const result = await client.query<{ id: string }>(
    `
      insert into ops.notification_jobs (
        tenant_id, notification_type, recipient_user_id, recipient_email,
        subject, text_body, html_body, notification_event_id, schedule_id,
        template_id, template_version_id, payload_json, priority, scheduled_for,
        idempotency_key, status, rendered_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'queued', now())
      on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing
      returning id
    `,
    [
      input.schedule.tenant_id,
      input.schedule.notification_type,
      input.recipientUserId,
      input.recipientEmail,
      email.subject,
      email.textBody,
      email.htmlBody,
      input.eventId,
      input.schedule.id,
      input.schedule.template_id,
      version?.id ?? null,
      JSON.stringify(input.payload),
      input.priority,
      input.schedule.next_run_at,
      idempotencyKey,
    ],
  );
  return result.rows[0] ?? null;
}

async function isNotificationPreferenceEnabled(
  client: PoolClient,
  input: {
    entityIds: string[];
    notificationType: string;
    tenantId: string;
    userId: string;
  },
): Promise<boolean> {
  const mandatory = ["password_changed", "password_reset", "security_alert", "user_welcome"];
  if (mandatory.includes(input.notificationType)) return true;
  const result = await client.query<{ frequency: string; is_enabled: boolean }>(
    `
      select is_enabled, frequency
      from ops.notification_preferences
      where tenant_id = $1
        and user_id = $2
        and notification_type = $3
        and channel = 'email'
        and (entity_id is null or entity_id = any($4::uuid[]))
        and deleted_at is null
      order by entity_id is null asc, updated_at desc
    `,
    [input.tenantId, input.userId, input.notificationType, input.entityIds],
  );
  if (!result.rows.length) return true;
  return result.rows.every((preference) => preference.is_enabled && preference.frequency !== "disabled");
}

async function getNotificationSupport(
  client: PoolClient,
  tenantId: string,
): Promise<EmailSupport> {
  const result = await client.query<{
    support_email: string;
    support_name: string;
    support_phone: string | null;
  }>(
    `
      select support_name, support_email::text as support_email, support_phone
      from ops.notification_settings
      where tenant_id = $1
      limit 1
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    email: row?.support_email ?? DEFAULT_SUPPORT.email,
    name: row?.support_name ?? DEFAULT_SUPPORT.name,
    phone: row ? row.support_phone ?? undefined : DEFAULT_SUPPORT.phone,
  };
}

async function writeNotificationOutbox(
  client: PoolClient,
  tenantId: string,
  notificationJobId: string,
  notificationType: string,
): Promise<void> {
  await client.query(
    `
      insert into ops.outbox_events (
        tenant_id, event_type, aggregate_type, aggregate_id, payload
      )
      values ($1, 'notification_job.created', 'notification_job', $2, $3)
    `,
    [tenantId, notificationJobId, JSON.stringify({ notificationType, source: "notification_scheduler" })],
  );
}

async function advanceSchedule(
  client: PoolClient,
  schedule: NotificationScheduleRow,
  status: "failed" | "skipped" | "succeeded",
  errorMessage: string | null,
): Promise<void> {
  await client.query(
    `
      update ops.notification_schedules
      set last_run_at = coalesce(next_run_at, now()),
          next_run_at = $3,
          last_status = $4,
          last_error_message = $5,
          updated_at = now()
      where tenant_id = $1
        and id = $2
    `,
    [
      schedule.tenant_id,
      schedule.id,
      calculateNextNotificationScheduleRun(schedule, schedule.next_run_at ?? new Date()),
      status,
      errorMessage,
    ],
  );
}

async function insertAudit(
  client: PoolClient,
  input: {
    action: string;
    details: Record<string, unknown>;
    summary: string;
    targetId: string;
    targetType: string;
    tenantId: string;
  },
): Promise<void> {
  await client.query(
    `
      insert into ops.audit_events (
        tenant_id, action, target_type, target_id, summary, details
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [input.tenantId, input.action, input.targetType, input.targetId, input.summary, JSON.stringify(input.details)],
  );
}

type RenderedEmail = {
  htmlBody: string;
  subject: string;
  textBody: string;
};

type ScheduledNotificationJob = {
  id: string;
  needsAttachment: boolean;
  payload: Record<string, unknown>;
};

function buildSnapshotEmail(input: Record<string, unknown>): RenderedEmail {
  return renderNotificationTemplate({
    fallback: {
      htmlBody: "",
      subject: "Procurement Dashboard",
      textBody: "Procurement Dashboard",
    },
    notificationType: "manager_daily_snapshot",
    payload: input,
    templateVersion: {
      id: "scheduler-snapshot-fallback",
      preheaderTemplate: null,
      rendererKey: "procurement_snapshot",
      subjectTemplate: "Procurement Dashboard",
    },
  });
}

function buildPendingTenderEmail(input: Record<string, unknown>): RenderedEmail {
  return renderNotificationTemplate({
    fallback: {
      htmlBody: "",
      subject: "Alert for Pending Tender Progress Updates",
      textBody: "Alert for Pending Tender Progress Updates",
    },
    notificationType: "stale_tender",
    payload: input,
    templateVersion: {
      id: "scheduler-pending-tender-fallback",
      preheaderTemplate: null,
      rendererKey: "pending_tender_update_alert",
      subjectTemplate: "Alert for Pending Tender Progress Updates",
    },
  });
}

function buildMonthlyPendingTenderEmail(input: Record<string, unknown>): RenderedEmail {
  return renderNotificationTemplate({
    fallback: {
      htmlBody: "",
      subject: "Alert: Pending Tender Progress Updates",
      textBody: "Alert: Pending Tender Progress Updates",
    },
    notificationType: "entity_monthly_digest",
    payload: input,
    templateVersion: {
      id: "scheduler-monthly-pending-fallback",
      preheaderTemplate: null,
      rendererKey: "monthly_pending_tender_report",
      subjectTemplate: "Alert: Pending Tender Progress Updates",
    },
  });
}

function buildRcPoExpiryEmail(input: Record<string, unknown>): RenderedEmail {
  return renderNotificationTemplate({
    fallback: {
      htmlBody: "",
      subject: "Alert: RC/PO Expiring in next 90 days",
      textBody: "Alert: RC/PO Expiring in next 90 days",
    },
    notificationType: "rc_po_expiry",
    payload: input,
    templateVersion: {
      id: "scheduler-rc-po-expiry-fallback",
      preheaderTemplate: null,
      rendererKey: "rc_po_expiry_alert",
      subjectTemplate: "Alert: RC/PO Expiring in next 90 days",
    },
  });
}

function renderEmail(input: {
  actionHref: string;
  actionLabel: string;
  intro: string;
  kpis?: Array<[string, string]>;
  sections: Array<[string, string]>;
  signOff?: string;
  subject: string;
  support?: EmailSupport;
  title: string;
}): RenderedEmail {
  const support = input.support ?? DEFAULT_SUPPORT;
  const textBody = [
    input.title,
    "",
    input.intro,
    "",
    ...(input.kpis?.length
      ? ["Key Metrics", ...input.kpis.map(([label, value]) => `${label}: ${value}`), ""]
      : []),
    ...input.sections.flatMap(([title, body]) => [title, body, ""]),
    `${input.actionLabel}: ${input.actionHref}`,
    "",
    ...(input.signOff ? [...input.signOff.split("\n"), ""] : []),
    "ProcureDesk | RPSG",
    `Support: ${support.name}${support.phone ? ` | ${support.phone}` : ""} | ${support.email}`,
    "This is a system-generated email. Please do not reply to this email.",
  ].join("\n");
  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2f6;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;border-collapse:collapse;background:#ffffff;border:1px solid #d8e0ea;">
            <tr><td style="padding:22px 28px;background:#10243e;color:#ffffff;"><div style="font-size:12px;text-transform:uppercase;color:#b7c9df;font-weight:700;">RPSG</div><h1 style="margin:8px 0 0;font-size:24px;line-height:31px;color:#ffffff;">${escapeHtml(input.title)}</h1></td></tr>
            <tr><td style="padding:26px 28px;"><p style="white-space:pre-line;margin:0;font-size:15px;line-height:24px;color:#27364f;">${escapeHtml(input.intro)}</p>${renderKpiHtml(input.kpis ?? [])}${input.sections.map(([title, body]) => renderSection(title, body)).join("")}<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px;"><tr><td style="background:#155eef;"><a href="${escapeHtml(input.actionHref)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(input.actionLabel)}</a></td></tr></table></td></tr>
            <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #dbe3ee;font-size:12px;line-height:18px;color:#52637a;">${input.signOff ? `${escapeHtml(input.signOff).replace(/\n/g, "<br>")}<br><br>` : ""}ProcureDesk | RPSG<br>Support: ${escapeHtml(support.name)}${support.phone ? ` | ${escapeHtml(support.phone)}` : ""} | <a href="mailto:${escapeAttribute(support.email)}" style="color:#155eef;text-decoration:none;">${escapeHtml(support.email)}</a><br>This is a system-generated email. Please do not reply to this email.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { htmlBody, subject: input.subject, textBody };
}

function renderKpiHtml(kpis: Array<[string, string]>): string {
  if (!kpis.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;">${kpis
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 10px;border:1px solid #dbe3ee;font-size:12px;color:#607089;font-weight:700;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #dbe3ee;font-size:15px;color:#172033;font-weight:700;">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function renderSection(title: string, body: string): string {
  return `<div style="margin-top:20px;"><h2 style="margin:0 0 6px;font-size:15px;line-height:21px;color:#172033;">${escapeHtml(title)}</h2><p style="white-space:pre-line;margin:0;font-size:13px;line-height:21px;color:#27364f;">${escapeHtml(body)}</p></div>`;
}

function renderTextTable(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (!rows.length) return "No records.";
  const header = columns.map(labelize).join(" | ");
  const body = rows.slice(0, 30).map((row) => columns.map((column) => stringValue(row[column], "-")).join(" | "));
  const overflow = rows.length > 30 ? [`+ ${rows.length - 30} more row(s) in ProcureDesk.`] : [];
  return [header, ...body, ...overflow].join("\n");
}

function mapPendingTenderRow(row: PendingTenderRow | PendingTenderManagerRow): Record<string, unknown> {
  return {
    currentStageAgeingDays: row.current_stage_ageing_days,
    daysSinceLastUpdate: row.days_since_last_update,
    description: row.description,
    entity: row.entity_name,
    prNumber: row.pr_id,
    runAgeDays: row.run_age_days ?? "-",
    tenderOwner: "tender_owner" in row ? row.tender_owner : undefined,
    tenderStage: row.tender_stage,
  };
}

function mapTemplateVersion(row: TemplateVersionRow): WorkerTemplateVersion {
  return {
    id: row.id,
    preheaderTemplate: row.preheader_template,
    rendererKey: row.renderer_key,
    subjectTemplate: row.subject_template,
  };
}

export function calculateNextNotificationScheduleRun(
  schedule: Pick<
    NotificationScheduleRow,
    "cadence" | "day_of_month" | "interval_days" | "next_run_at" | "run_time"
  >,
  from: Date,
): Date {
  const runTime = parseRunTime(schedule.run_time);
  const local = toIstDate(from);
  if (schedule.cadence === "monthly") {
    const day = Math.min(schedule.day_of_month ?? 1, 28);
    let candidate = fromIstParts(local.getUTCFullYear(), local.getUTCMonth(), day, runTime.hour, runTime.minute);
    if (candidate <= from) {
      const nextMonth = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1));
      candidate = fromIstParts(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), day, runTime.hour, runTime.minute);
    }
    return candidate;
  }
  if (schedule.cadence === "every_n_days") {
    if (schedule.next_run_at) {
      return addDays(schedule.next_run_at, schedule.interval_days ?? 1);
    }
    const today = fromIstParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), runTime.hour, runTime.minute);
    return today > from ? today : addDays(today, 1);
  }
  if (schedule.cadence === "weekly") {
    if (schedule.next_run_at) {
      return addDays(schedule.next_run_at, 7);
    }
    const today = fromIstParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), runTime.hour, runTime.minute);
    return today > from ? today : addDays(today, 7);
  }
  const today = fromIstParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), runTime.hour, runTime.minute);
  return today > from ? today : addDays(today, 1);
}

function parseRunTime(value: string | null): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = (value ?? "09:00").split(":");
  return {
    hour: Number(hourRaw ?? 9),
    minute: Number(minuteRaw ?? 0),
  };
}

function toIstDate(value: Date): Date {
  return new Date(value.getTime() + IST_OFFSET_MINUTES * 60_000);
}

function fromIstParts(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MINUTES * 60_000);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatIstDate(value: Date): string {
  const local = toIstDate(value);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupBy<Row>(rows: Row[], keyFn: (row: Row) => string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const group = map.get(key);
    if (group) group.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function uniqueBy<Row>(rows: Row[], keyFn: (row: Row) => string): Row[] {
  const seen = new Set<string>();
  const uniqueRows: Row[] = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }
  return uniqueRows;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function objectPayload(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayPayload(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportFromPayload(payload: Record<string, unknown>): EmailSupport {
  const rawSupport = payload.support;
  const hasSupport = isRecord(rawSupport);
  const support = hasSupport ? rawSupport : {};
  const hasPhone = Object.prototype.hasOwnProperty.call(support, "phone");
  const phone = hasPhone || hasSupport ? stringValue(support.phone, "") : DEFAULT_SUPPORT.phone;
  return {
    email: stringValue(support.email, DEFAULT_SUPPORT.email),
    name: stringValue(support.name, DEFAULT_SUPPORT.name),
    phone: phone || undefined,
  };
}

function stringValue(value: unknown, fallback: string | number): string {
  if (value === null || value === undefined || value === "") return String(fallback);
  return String(value);
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function formatMoney(value: unknown): string {
  const text = stringValue(value, "-");
  if (text === "-") return text;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return text;
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function labelize(value: string): string {
  return value.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

type NotificationScheduleRow = {
  cadence: string;
  condition_json: unknown;
  day_of_month: number | null;
  id: string;
  interval_days: number | null;
  name: string;
  next_run_at: Date | null;
  notification_type: string;
  recipient_mode: string;
  run_time: string | null;
  schedule_key: string;
  template_id: string | null;
  tenant_id: string;
  threshold_days: number | null;
  timezone: string;
};

type TemplateVersionRow = {
  id: string;
  preheader_template: string | null;
  renderer_key: string;
  subject_template: string;
};

type SnapshotRecipientRow = {
  completed_tenders: number;
  entity_ids: string[] | null;
  evaluation_pendency: number;
  full_name: string;
  recipient_email: string;
  recipient_user_id: string;
  running_tenders: number;
  scope_label: string;
  stage_ageing_alerts: number;
};

type PendingTenderRow = {
  current_stage_ageing_days: number;
  days_since_last_update: number;
  description: string;
  entity_id: string;
  entity_name: string;
  full_name: string;
  pr_id: string;
  recipient_email: string;
  recipient_user_id: string;
  run_age_days: number | null;
  target_id: string;
  tender_stage: string;
};

type PendingTenderManagerRow = PendingTenderRow & {
  scope_label: string;
  tender_owner: string | null;
};

type RcPoRecipientRow = {
  days_remaining: number;
  entity_id: string;
  entity_name: string;
  full_name: string;
  rc_po_award_date: string | null;
  rc_po_validity_date: string;
  rc_po_value: string | null;
  recipient_email: string;
  recipient_user_id: string;
  scope_label: string;
  scope_type: "entity" | "group";
  target_id: string;
  tender_name: string;
  tender_owner: string;
};
