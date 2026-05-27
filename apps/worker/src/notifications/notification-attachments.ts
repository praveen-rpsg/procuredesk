import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import type { PrivateObjectStorage } from "../storage/private-object-storage.js";

export type NotificationAttachmentInput = {
  eventId: string;
  jobId: string;
  notificationType: string;
  payload: Record<string, unknown>;
  scheduleKey: string;
  tenantId: string;
};

type AnalyticsSnapshot = {
  averages: {
    biddersParticipated: number | null;
    cycleTimeDays: number | null;
    qualifiedBidders: number | null;
    runningTenderAgeDays: number | null;
  };
  departmentRows: Array<{
    caseCount: number;
    departmentName: string;
    entityName: string;
    natureOfWorkName: string;
  }>;
  entityRows: Array<{
    caseCount: number;
    completedCount: number;
    delayedCount: number;
    entityName: string;
    offTrackCount: number;
    onTrackCount: number;
    prValue: number;
    priorityCount: number;
    runningCount: number;
  }>;
  generatedAt: Date;
  kpis: {
    completedCases: number;
    delayedCases: number;
    evaluationPendency: number;
    offTrackCases: number;
    onTrackCases: number;
    priorityCases: number;
    runningCases: number;
    savingsWrtEstimate: number;
    savingsWrtPr: number;
    stageAgeingAlerts: number;
    totalApprovedAmount: number;
    totalCases: number;
    totalPrValue: number;
  };
  quickLinks: Array<{ label: string; path: string }>;
  recipientName: string;
  scopeLabel: string;
  scopeType: "entity" | "group";
  stageRows: Array<{ caseCount: number; stageCode: number }>;
  tenderTypeRows: Array<{
    caseCount: number;
    delayedCount: number;
    offTrackCount: number;
    onTrackCount: number;
    tenderTypeName: string;
  }>;
};

export async function generateNotificationAttachments(
  client: PoolClient,
  storage: PrivateObjectStorage,
  input: NotificationAttachmentInput,
): Promise<void> {
  try {
    if (input.notificationType === "rc_po_expiry") {
      await generateRcPoExpiryExcel(client, storage, input);
      return;
    }
    if (input.notificationType === "manager_daily_snapshot") {
      await generateProcurementSnapshotPdf(client, storage, input);
    }
  } catch (error) {
    const meta = attachmentMeta(input.notificationType);
    const failed = await client.query<{ id: string }>(
      `
        insert into ops.email_attachments (
          tenant_id, notification_job_id, notification_event_id, attachment_kind,
          file_name, content_type, status, error_message
        )
        values ($1, $2, $3, $4, $5, $6, 'failed', $7)
        returning id
      `,
      [
        input.tenantId,
        input.jobId,
        input.eventId,
        meta.kind,
        meta.fileName,
        meta.contentType,
        error instanceof Error ? error.message : "Attachment generation failed",
      ],
    );
    const attachmentId = failed.rows[0]?.id;
    if (attachmentId) {
      await insertAttachmentAudit(client, {
        action: "email_attachment.failed",
        attachmentId,
        details: {
          error: error instanceof Error ? error.message : "Attachment generation failed",
          jobId: input.jobId,
          notificationEventId: input.eventId,
          notificationType: input.notificationType,
        },
        summary: "Notification attachment generation failed",
        tenantId: input.tenantId,
      });
    }
    throw error;
  }
}

export async function ensureWelcomeManualAttachment(
  pool: Pool,
  storage: PrivateObjectStorage,
  input: {
    jobId: string;
    notificationType: string;
    tenantId: string;
  },
): Promise<void> {
  if (input.notificationType !== "user_welcome") return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ id: string }>(
      `
        select id
        from ops.email_attachments
        where tenant_id = $1
          and notification_job_id = $2
          and attachment_kind = 'welcome_user_manual_pdf'
          and status in ('generated', 'attached')
        limit 1
      `,
      [input.tenantId, input.jobId],
    );
    if (existing.rows[0]) {
      await client.query("commit");
      return;
    }

    const settings = await getNotificationSettings(client, input.tenantId);
    if (!settings.welcomeManualEnabled) {
      await client.query("commit");
      return;
    }

    const pdf = createWelcomeManualPdf({
      support: settings.support,
      title: settings.welcomeManualTitle,
    });
    await storeAttachment(client, storage, {
      attachmentKind: "welcome_user_manual_pdf",
      buffer: pdf,
      contentType: "application/pdf",
      eventId: null,
      fileName: `procuredesk-user-manual-${dateStamp()}.pdf`,
      jobId: input.jobId,
      tenantId: input.tenantId,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function generateRcPoExpiryExcel(
  client: PoolClient,
  storage: PrivateObjectStorage,
  input: NotificationAttachmentInput,
): Promise<void> {
  const items = arrayPayload(input.payload.items).sort(
    (left, right) => Number(left.daysRemaining) - Number(right.daysRemaining),
  );
  if (!items.length) return;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ProcureDesk";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("RC PO Expiry");
  sheet.columns = [
    { header: "Entity", key: "entity", width: 24 },
    { header: "Tender Name", key: "tenderName", width: 36 },
    { header: "PO/RC Value", key: "rcPoValue", width: 18 },
    { header: "PO/RC Award Date", key: "rcPoAwardDate", width: 18 },
    { header: "PO/RC Validity Date", key: "rcPoValidityDate", width: 20 },
    { header: "Tender Owner", key: "owner", width: 24 },
    { header: "Days remaining to expire", key: "daysRemaining", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    fgColor: { argb: "FF10243E" },
    pattern: "solid",
    type: "pattern",
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:G1";
  for (const item of items) {
    sheet.addRow({
      daysRemaining: numberOrText(item.daysRemaining),
      entity: textValue(item.entity),
      owner: textValue(item.owner),
      rcPoAwardDate: textValue(item.rcPoAwardDate),
      rcPoValidityDate: textValue(item.rcPoValidityDate),
      rcPoValue: textValue(item.rcPoValue),
      tenderName: textValue(item.tenderName),
    });
  }
  for (const row of sheet.getRows(2, sheet.rowCount - 1) ?? []) {
    const days = Number(row.getCell("daysRemaining").value);
    if (Number.isFinite(days) && days <= 15) {
      row.getCell("daysRemaining").fill = {
        fgColor: { argb: "FFFEE2E2" },
        pattern: "solid",
        type: "pattern",
      };
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await storeAttachment(client, storage, {
    attachmentKind: "rc_po_expiry_excel",
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    eventId: input.eventId,
    fileName: `rc-po-expiry-${dateStamp()}.xlsx`,
    jobId: input.jobId,
    tenantId: input.tenantId,
  });
}

async function generateProcurementSnapshotPdf(
  client: PoolClient,
  storage: PrivateObjectStorage,
  input: NotificationAttachmentInput,
): Promise<void> {
  const snapshot = await loadAnalyticsSnapshot(client, input.tenantId, input.payload);
  const pdf = createAnalyticsSnapshotPdf(snapshot);
  await storeAttachment(client, storage, {
    attachmentKind: "procurement_snapshot_pdf",
    buffer: pdf,
    contentType: "application/pdf",
    eventId: input.eventId,
    fileName: `procuredesk-analytics-snapshot-${dateStamp()}.pdf`,
    jobId: input.jobId,
    tenantId: input.tenantId,
  });
}

async function loadAnalyticsSnapshot(
  client: PoolClient,
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<AnalyticsSnapshot> {
  const scopeType = textValue(payload.scopeType).toLowerCase() === "group" ? "group" : "entity";
  const entityIds = scopeType === "entity" ? stringArrayPayload(payload.entityIds) : [];
  const scopeWhere = scopeType === "entity" ? "and f.entity_id = any($2::uuid[])" : "";
  const values: unknown[] = scopeType === "entity" ? [tenantId, entityIds] : [tenantId];

  const summary = await client.query<{
    average_bidders_participated: string | null;
    average_cycle_time_days: string | null;
    average_qualified_bidders: string | null;
    average_running_cycle_time_days: string | null;
    completed_cases: string;
    delayed_cases: string;
    evaluation_pendency: string;
    off_track_cases: string;
    on_track_cases: string;
    priority_cases: string;
    running_cases: string;
    savings_wrt_estimate: string;
    savings_wrt_pr: string;
    stage_ageing_alerts: string;
    total_approved_amount: string;
    total_cases: string;
    total_pr_value: string;
  }>(
    `
      select
        count(*)::text as total_cases,
        count(*) filter (where f.status = 'running')::text as running_cases,
        count(*) filter (where f.status = 'completed')::text as completed_cases,
        count(*) filter (
          where f.status = 'running'
            and c.tentative_completion_date is not null
            and c.tentative_completion_date < current_date
        )::text as delayed_cases,
        count(*) filter (
          where f.status = 'running'
            and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
            and f.desired_stage_code is not null
            and f.stage_code < f.desired_stage_code
        )::text as off_track_cases,
        count(*) filter (
          where f.status = 'running'
            and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
            and (f.desired_stage_code is null or f.stage_code >= f.desired_stage_code)
        )::text as on_track_cases,
        count(*) filter (where f.status = 'running' and f.priority_case = true)::text as priority_cases,
        count(*) filter (where f.status = 'running' and coalesce(f.current_stage_aging_days, 0) >= 10)::text as stage_ageing_alerts,
        count(*) filter (where f.status = 'running' and f.stage_code in (4, 5))::text as evaluation_pendency,
        coalesce(sum(f.pr_value), 0)::text as total_pr_value,
        coalesce(sum(f.approved_amount) filter (where f.status = 'completed'), 0)::text as total_approved_amount,
        coalesce(sum(f.savings_wrt_pr) filter (where f.status = 'completed'), 0)::text as savings_wrt_pr,
        coalesce(sum(f.savings_wrt_estimate) filter (where f.status = 'completed'), 0)::text as savings_wrt_estimate,
        (avg(f.completed_age_days) filter (where f.status = 'completed'))::text as average_cycle_time_days,
        (avg(current_date - f.pr_receipt_date) filter (where f.status = 'running' and f.pr_receipt_date is not null))::text as average_running_cycle_time_days,
        (avg(m.bidders_participated) filter (
          where f.status = 'completed'
            and lower(coalesce(tt.name, '')) in ('open', 'limited')
        ))::text as average_bidders_participated,
        (avg(m.qualified_bidders) filter (
          where f.status = 'completed'
            and lower(coalesce(tt.name, '')) in ('open', 'limited')
        ))::text as average_qualified_bidders
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
      left join procurement.case_milestones m on m.case_id = f.case_id and m.tenant_id = f.tenant_id
      left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
      where f.tenant_id = $1
        ${scopeWhere}
    `,
    values,
  );
  const entityRows = await client.query<{
    case_count: string;
    completed_count: string;
    delayed_count: string;
    entity_code: string | null;
    entity_name: string | null;
    off_track_count: string;
    on_track_count: string;
    priority_count: string;
    pr_value: string;
    running_count: string;
  }>(
    `
      select
        coalesce(e.code, e.name, 'Unmapped') as entity_code,
        coalesce(e.name, e.code, 'Unmapped') as entity_name,
        count(*)::text as case_count,
        count(*) filter (where f.status = 'running')::text as running_count,
        count(*) filter (where f.status = 'completed')::text as completed_count,
        count(*) filter (
          where f.status = 'running'
            and c.tentative_completion_date is not null
            and c.tentative_completion_date < current_date
        )::text as delayed_count,
        count(*) filter (
          where f.status = 'running'
            and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
            and f.desired_stage_code is not null
            and f.stage_code < f.desired_stage_code
        )::text as off_track_count,
        count(*) filter (
          where f.status = 'running'
            and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
            and (f.desired_stage_code is null or f.stage_code >= f.desired_stage_code)
        )::text as on_track_count,
        count(*) filter (where f.status = 'running' and f.priority_case = true)::text as priority_count,
        coalesce(sum(f.pr_value), 0)::text as pr_value
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
      left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
      where f.tenant_id = $1
        ${scopeWhere}
      group by e.code, e.name
      order by count(*) desc, e.code asc nulls last, e.name asc nulls last
      limit 10
    `,
    values,
  );

  const tenderTypeRows = await client.query<{
    case_count: string;
    delayed_count: string;
    off_track_count: string;
    on_track_count: string;
    tender_type_name: string | null;
  }>(
    `
      select
        coalesce(tt.name, 'Unspecified') as tender_type_name,
        count(*) filter (where f.status = 'running')::text as case_count,
        count(*) filter (
          where f.status = 'running'
            and c.tentative_completion_date is not null
            and c.tentative_completion_date < current_date
        )::text as delayed_count,
        count(*) filter (
          where f.status = 'running'
            and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
            and f.desired_stage_code is not null
            and f.stage_code < f.desired_stage_code
        )::text as off_track_count,
        count(*) filter (
          where f.status = 'running'
            and (c.tentative_completion_date is null or c.tentative_completion_date >= current_date)
            and (f.desired_stage_code is null or f.stage_code >= f.desired_stage_code)
        )::text as on_track_count
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
      left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
      where f.tenant_id = $1
        ${scopeWhere}
      group by tt.name
      having count(*) filter (where f.status = 'running') > 0
      order by count(*) filter (where f.status = 'running') desc, tt.name asc nulls last
      limit 8
    `,
    values,
  );

  const departmentRows = await client.query<{
    case_count: string;
    department_name: string | null;
    entity_code: string | null;
    entity_name: string | null;
    nature_of_work_name: string | null;
  }>(
    `
      select
        coalesce(e.code, e.name, 'Unmapped') as entity_code,
        coalesce(e.name, e.code, 'Unmapped') as entity_name,
        coalesce(dep.name, 'Unspecified') as department_name,
        coalesce(rv.label, 'Unspecified') as nature_of_work_name,
        count(*)::text as case_count
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
      left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
      left join org.departments dep on dep.id = f.department_id and dep.tenant_id = f.tenant_id
      left join catalog.reference_values rv on rv.id = c.nature_of_work_id and rv.tenant_id = c.tenant_id
      where f.tenant_id = $1
        ${scopeWhere}
      group by e.code, e.name, dep.name, rv.label
      order by count(*) desc, e.code asc nulls last, dep.name asc nulls last, rv.label asc nulls last
      limit 18
    `,
    values,
  );

  const stageRows = await client.query<{
    case_count: string;
    stage_code: number;
  }>(
    `
      select f.stage_code, count(*)::text as case_count
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
      where f.tenant_id = $1
        ${scopeWhere}
      group by f.stage_code
      order by f.stage_code asc
    `,
    values,
  );

  return buildAnalyticsSnapshotFromRows({
    departmentRows: departmentRows.rows,
    entityRows: entityRows.rows,
    payload,
    scopeType,
    stageRows: stageRows.rows,
    summary: summary.rows[0],
    tenderTypeRows: tenderTypeRows.rows,
  });
}

function buildAnalyticsSnapshotFromRows(input: {
  departmentRows: Array<{
    case_count: string;
    department_name: string | null;
    entity_code: string | null;
    entity_name: string | null;
    nature_of_work_name: string | null;
  }>;
  entityRows: Array<{
    case_count: string;
    completed_count: string;
    delayed_count: string;
    entity_code: string | null;
    entity_name: string | null;
    off_track_count: string;
    on_track_count: string;
    priority_count: string;
    pr_value: string;
    running_count: string;
  }>;
  payload: Record<string, unknown>;
  scopeType: "entity" | "group";
  stageRows: Array<{ case_count: string; stage_code: number }>;
  summary: AnalyticsSummaryRow | undefined;
  tenderTypeRows: Array<{
    case_count: string;
    delayed_count: string;
    off_track_count: string;
    on_track_count: string;
    tender_type_name: string | null;
  }>;
}): AnalyticsSnapshot {
  const row = input.summary;
  return {
    averages: mapAnalyticsAverages(row),
    departmentRows: input.departmentRows.map(mapAnalyticsDepartmentRow),
    entityRows: input.entityRows.map(mapAnalyticsEntityRow),
    generatedAt: new Date(),
    kpis: mapAnalyticsKpis(row, input.payload),
    quickLinks: [
      { label: "Analytics", path: "/reports/analytics" },
      { label: "Running Tenders", path: "/reports/running" },
      { label: "Completed Tenders", path: "/reports/completed" },
      { label: "Stage Wise Time Lapse", path: "/reports/stage-time" },
      { label: "Bid Evaluation Pendency", path: "/reports/technical-evaluation-pendency" },
    ],
    recipientName: textValue(input.payload.fullName),
    scopeLabel: input.scopeType === "group" ? "Group-wide procurement function" : textValue(input.payload.scopeLabel),
    scopeType: input.scopeType,
    stageRows: input.stageRows.map(mapAnalyticsStageRow),
    tenderTypeRows: input.tenderTypeRows.map(mapAnalyticsTenderTypeRow),
  };
}

type AnalyticsSummaryRow = {
  average_bidders_participated: string | null;
  average_cycle_time_days: string | null;
  average_qualified_bidders: string | null;
  average_running_cycle_time_days: string | null;
  completed_cases: string;
  delayed_cases: string;
  evaluation_pendency: string;
  off_track_cases: string;
  on_track_cases: string;
  priority_cases: string;
  running_cases: string;
  savings_wrt_estimate: string;
  savings_wrt_pr: string;
  stage_ageing_alerts: string;
  total_approved_amount: string;
  total_cases: string;
  total_pr_value: string;
};

function mapAnalyticsAverages(row: AnalyticsSummaryRow | undefined): AnalyticsSnapshot["averages"] {
  return {
    biddersParticipated: nullableNumber(row?.average_bidders_participated),
    cycleTimeDays: nullableNumber(row?.average_cycle_time_days),
    qualifiedBidders: nullableNumber(row?.average_qualified_bidders),
    runningTenderAgeDays: nullableNumber(row?.average_running_cycle_time_days),
  };
}

function mapAnalyticsKpis(row: AnalyticsSummaryRow | undefined, payload: Record<string, unknown>): AnalyticsSnapshot["kpis"] {
  return {
    completedCases: analyticsNumber(row, "completed_cases", payload.completedTenders),
    delayedCases: analyticsNumber(row, "delayed_cases"),
    evaluationPendency: analyticsNumber(row, "evaluation_pendency", payload.evaluationPendency),
    offTrackCases: analyticsNumber(row, "off_track_cases"),
    onTrackCases: analyticsNumber(row, "on_track_cases"),
    priorityCases: analyticsNumber(row, "priority_cases"),
    runningCases: analyticsNumber(row, "running_cases", payload.runningTenders),
    savingsWrtEstimate: analyticsNumber(row, "savings_wrt_estimate"),
    savingsWrtPr: analyticsNumber(row, "savings_wrt_pr"),
    stageAgeingAlerts: analyticsNumber(row, "stage_ageing_alerts", payload.stageAgeingAlerts),
    totalApprovedAmount: analyticsNumber(row, "total_approved_amount"),
    totalCases: analyticsNumber(row, "total_cases"),
    totalPrValue: analyticsNumber(row, "total_pr_value"),
  };
}

function analyticsNumber(
  row: AnalyticsSummaryRow | undefined,
  key: keyof AnalyticsSummaryRow,
  fallback: unknown = 0,
): number {
  return Number(row?.[key] ?? fallback ?? 0);
}

function mapAnalyticsDepartmentRow(item: {
  case_count: string;
  department_name: string | null;
  entity_code: string | null;
  entity_name: string | null;
  nature_of_work_name: string | null;
}): AnalyticsSnapshot["departmentRows"][number] {
  return {
    caseCount: Number(item.case_count),
    departmentName: item.department_name ?? "Unspecified",
    entityName: item.entity_code ?? item.entity_name ?? "Unmapped",
    natureOfWorkName: item.nature_of_work_name ?? "Unspecified",
  };
}

function mapAnalyticsEntityRow(item: {
  case_count: string;
  completed_count: string;
  delayed_count: string;
  entity_code: string | null;
  entity_name: string | null;
  off_track_count: string;
  on_track_count: string;
  priority_count: string;
  pr_value: string;
  running_count: string;
}): AnalyticsSnapshot["entityRows"][number] {
  return {
    caseCount: Number(item.case_count),
    completedCount: Number(item.completed_count),
    delayedCount: Number(item.delayed_count),
    entityName: item.entity_code ?? item.entity_name ?? "Unmapped",
    offTrackCount: Number(item.off_track_count),
    onTrackCount: Number(item.on_track_count),
    prValue: Number(item.pr_value),
    priorityCount: Number(item.priority_count),
    runningCount: Number(item.running_count),
  };
}

function mapAnalyticsStageRow(item: { case_count: string; stage_code: number }): AnalyticsSnapshot["stageRows"][number] {
  return {
    caseCount: Number(item.case_count),
    stageCode: item.stage_code,
  };
}

function mapAnalyticsTenderTypeRow(item: {
  case_count: string;
  delayed_count: string;
  off_track_count: string;
  on_track_count: string;
  tender_type_name: string | null;
}): AnalyticsSnapshot["tenderTypeRows"][number] {
  return {
    caseCount: Number(item.case_count),
    delayedCount: Number(item.delayed_count),
    offTrackCount: Number(item.off_track_count),
    onTrackCount: Number(item.on_track_count),
    tenderTypeName: item.tender_type_name ?? "Unspecified",
  };
}

async function storeAttachment(
  client: PoolClient,
  storage: PrivateObjectStorage,
  input: {
    attachmentKind: string;
    buffer: Buffer;
    contentType: string;
    eventId: string | null;
    fileName: string;
    jobId: string;
    tenantId: string;
  },
): Promise<void> {
  const checksumSha256 = createHash("sha256").update(input.buffer).digest("hex");
  const storageKey = `${input.tenantId}/notifications/${input.jobId}/${input.fileName}`;
  const stored = await storage.write(storageKey, input.buffer);
  const fileAsset = await client.query<{ id: string }>(
    `
      insert into ops.file_assets (
        tenant_id, storage_key, original_filename, content_type, byte_size,
        checksum_sha256, purpose
      )
      values ($1, $2, $3, $4, $5, $6, 'notification_attachment')
      returning id
    `,
    [
      input.tenantId,
      stored.storageKey,
      input.fileName,
      input.contentType,
      stored.byteSize,
      checksumSha256,
    ],
  );
  const fileAssetId = fileAsset.rows[0]?.id;
  if (!fileAssetId) throw new Error("Failed to create notification attachment file asset.");

  const attachment = await client.query<{ id: string }>(
    `
      insert into ops.email_attachments (
        tenant_id, notification_job_id, notification_event_id, file_asset_id,
        attachment_kind, file_name, content_type, file_size_bytes,
        checksum_sha256, status, expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'generated', now() + interval '14 days')
      returning id
    `,
    [
      input.tenantId,
      input.jobId,
      input.eventId,
      fileAssetId,
      input.attachmentKind,
      input.fileName,
      input.contentType,
      stored.byteSize,
      checksumSha256,
    ],
  );
  const attachmentId = attachment.rows[0]?.id;
  if (attachmentId) {
    await insertAttachmentAudit(client, {
      action: "email_attachment.generated",
      attachmentId,
      details: {
        attachmentKind: input.attachmentKind,
        byteSize: stored.byteSize,
        checksumSha256,
        fileName: input.fileName,
        jobId: input.jobId,
        notificationEventId: input.eventId,
        storageKey: stored.storageKey,
      },
      summary: "Notification attachment generated",
      tenantId: input.tenantId,
    });
  }
}

export function createWelcomeManualPdf(input: {
  support: EmailSupport;
  title?: string | undefined;
}): Buffer {
  return createSimplePdf([
    input.title?.trim() || "ProcureDesk User Manual",
    "Welcome to ProcureDesk - Procurement KPI Tracking Portal",
    "",
    "Purpose",
    "ProcureDesk is the governed system of record for procurement cases, tenders, awards, reports, and expiry tracking.",
    "",
    "Getting Started",
    "1. Open the Set Password button from your welcome email within 24 hours.",
    "2. Create a strong password and sign in with your official email or username.",
    "3. Verify that your role and mapped entity access are correct after login.",
    "",
    "Daily Workflow",
    "1. Review dashboard KPIs for running tenders, stage ageing, and evaluation pendency.",
    "2. Open Procurement Cases to update milestones, tender stage, owner remarks, and delays.",
    "3. Use Reports for analytics, tender tracking, bid evaluation, and RC/PO expiry review.",
    "",
    "Security",
    "Do not forward setup or reset links. ProcureDesk will never ask for your password by email or phone.",
    "",
    "Support",
    `${input.support.name}${input.support.phone ? ` | ${input.support.phone}` : ""}`,
    input.support.email,
  ]);
}

export function createAnalyticsSnapshotPdf(snapshot: AnalyticsSnapshot): Buffer {
  const pdf = new PdfReport();
  const scopeLabel =
    snapshot.scopeType === "group"
      ? "Group Viewer - group-wide"
      : `Entity Manager / Viewer - ${snapshot.scopeLabel}`;

  pdf.hero("Procurement Dashboard", [
    "ProcureDesk Analytics Snapshot",
    `Scope: ${scopeLabel}`,
    `Generated: ${formatDateTime(snapshot.generatedAt)}`,
    `Recipient: ${snapshot.recipientName}`,
  ]);

  pdf.sectionTitle("Case portfolio tiles", "Executive overview of current procurement workload");
  pdf.metricGrid([
    { label: "Total Cases", tone: "neutral", value: formatInteger(snapshot.kpis.totalCases) },
    { label: "Running", note: `${percentage(snapshot.kpis.runningCases, snapshot.kpis.totalCases)}% of portfolio`, tone: "brand", value: formatInteger(snapshot.kpis.runningCases) },
    { label: "Completed", note: `${percentage(snapshot.kpis.completedCases, snapshot.kpis.totalCases)}% complete`, tone: "success", value: formatInteger(snapshot.kpis.completedCases) },
    { label: "Delayed", note: "Needs intervention", tone: "danger", value: formatInteger(snapshot.kpis.delayedCases) },
    { label: "Off Track", note: "Form date passed", tone: "warning", value: formatInteger(snapshot.kpis.offTrackCases) },
    { label: "Priority", note: "High attention cases", tone: "warning", value: formatInteger(snapshot.kpis.priorityCases) },
    { label: "On Track", note: "Within expected timeline", tone: "success", value: formatInteger(snapshot.kpis.onTrackCases) },
    { label: "Stage Ageing Alerts", note: "Current stage >= 10 days", tone: "danger", value: formatInteger(snapshot.kpis.stageAgeingAlerts) },
  ]);

  pdf.sectionTitle("Procurement reporting health", "Financial and cycle-time indicators");
  pdf.metricGrid([
    { label: "Tender Value", note: "Rs. Lakhs", tone: "neutral", value: formatLakhs(snapshot.kpis.totalPrValue) },
    { label: "NFA Approved Amount", note: "Rs. Lakhs", tone: "success", value: formatLakhs(snapshot.kpis.totalApprovedAmount) },
    { label: "Savings WRT PR", note: "Rs. Lakhs", tone: "success", value: formatLakhs(snapshot.kpis.savingsWrtPr) },
    { label: "Savings WRT Estimate", note: "Rs. Lakhs", tone: "success", value: formatLakhs(snapshot.kpis.savingsWrtEstimate) },
    { label: "Avg Bidder Participation", note: "Completed open/limited", tone: "neutral", value: formatDecimal(snapshot.averages.biddersParticipated) },
    { label: "Avg Qualified Bidders", note: "Completed open/limited", tone: "neutral", value: formatDecimal(snapshot.averages.qualifiedBidders) },
    { label: "Avg Cycle Time", note: "Completed cases", tone: "brand", value: formatDays(snapshot.averages.cycleTimeDays) },
    { label: "Avg Running Tender Age", note: "Running cases", tone: "warning", value: formatDays(snapshot.averages.runningTenderAgeDays) },
  ]);

  pdf.sectionTitle("Running workload indicator", "On-track, off-track, and delayed distribution");
  pdf.progressRows([
    { label: "On-Track", tone: "success", value: snapshot.kpis.onTrackCases },
    { label: "Off-Track", tone: "warning", value: snapshot.kpis.offTrackCases },
    { label: "Delayed", tone: "danger", value: snapshot.kpis.delayedCases },
  ], Math.max(snapshot.kpis.runningCases, 1));

  pdf.sectionTitle("Entity-wise analytics", "Cases by entity and PR value distribution");
  pdf.entityTable(snapshot.entityRows, snapshot.kpis.totalPrValue);

  pdf.sectionTitle("Department workload", "Top department and nature-of-work combinations");
  pdf.simpleRows(
    ["Entity", "Department", "Nature of Work", "Cases"],
    snapshot.departmentRows.map((row) => [
      row.entityName,
      row.departmentName,
      row.natureOfWorkName,
      formatInteger(row.caseCount),
    ]),
    [82, 156, 190, 52],
  );

  pdf.sectionTitle("Tender Track Analysis", "Running tenders by tender type");
  pdf.tenderTypeTable(snapshot.tenderTypeRows);

  pdf.sectionTitle("Stage distribution", "Current procurement stage mix");
  pdf.progressRows(
    snapshot.stageRows.map((row) => ({
      label: formatStage(row.stageCode),
      tone: "brand" as const,
      value: row.caseCount,
    })),
    Math.max(snapshot.kpis.totalCases, 1),
  );

  pdf.sectionTitle("Quick report links", "Open live ProcureDesk reports for drill-down");
  pdf.simpleRows(
    ["Report", "Path"],
    snapshot.quickLinks.map((link) => [link.label, link.path]),
    [190, 310],
  );
  pdf.note("Confidential: This PDF is generated from ProcureDesk reporting projections and is scoped to the recipient's role and entity access at generation time.");

  return pdf.toBuffer();
}

type PdfTone = "brand" | "danger" | "neutral" | "success" | "warning";

type PdfMetric = {
  label: string;
  note?: string | undefined;
  tone: PdfTone;
  value: string;
};

class PdfReport {
  private readonly height = 792;
  private readonly margin = 36;
  private readonly pageCommands: string[][] = [];
  private readonly width = 612;
  private y = 36;

  constructor() {
    this.addPage();
  }

  hero(title: string, lines: string[]): void {
    this.rect(0, 0, this.width, 132, "#10243e");
    this.text("RPSG Procurement", this.margin, 36, { color: "#d7e5f5", font: "bold", size: 10 });
    this.text("ProcureDesk", this.margin, 55, { color: "#ffffff", font: "bold", size: 20 });
    this.text(title, this.margin, 88, { color: "#ffffff", font: "bold", size: 24 });
    this.text("Procurement KPI Tracking Portal", 402, 40, { color: "#d7e5f5", font: "regular", size: 10 });
    let lineY = 76;
    for (const line of lines.slice(0, 4)) {
      this.text(line, 402, lineY, { color: "#d7e5f5", font: "regular", size: 9, maxWidth: 160 });
      lineY += 15;
    }
    this.y = 154;
  }

  sectionTitle(title: string, subtitle?: string): void {
    this.ensure(58);
    this.text(title, this.margin, this.y, { color: "#172033", font: "bold", size: 15 });
    if (subtitle) {
      this.text(subtitle, this.margin, this.y + 17, { color: "#62718a", size: 9 });
      this.y += 34;
    } else {
      this.y += 24;
    }
  }

  metricGrid(metrics: PdfMetric[]): void {
    const gap = 10;
    const cardWidth = (this.width - this.margin * 2 - gap * 3) / 4;
    const cardHeight = 66;
    for (let index = 0; index < metrics.length; index++) {
      if (index % 4 === 0) this.ensure(cardHeight + 12);
      const row = Math.floor(index / 4);
      const col = index % 4;
      const x = this.margin + col * (cardWidth + gap);
      const y = this.y + row * (cardHeight + gap);
      const metric = metrics[index];
      if (!metric) continue;
      const colors = pdfTone(metric.tone);
      this.rect(x, y, cardWidth, cardHeight, colors.background, colors.border);
      this.text(metric.label, x + 10, y + 14, { color: "#62718a", font: "bold", size: 7, maxWidth: cardWidth - 20 });
      this.text(metric.value, x + 10, y + 36, { color: colors.text, font: "bold", size: 18, maxWidth: cardWidth - 20 });
      if (metric.note) {
        this.text(metric.note, x + 10, y + 55, { color: "#62718a", size: 7, maxWidth: cardWidth - 20 });
      }
    }
    this.y += Math.ceil(metrics.length / 4) * (cardHeight + gap) + 8;
  }

  progressRows(rows: Array<{ label: string; tone: PdfTone; value: number }>, total: number): void {
    if (!rows.length) {
      this.note("No data available for this section.");
      return;
    }
    for (const row of rows.slice(0, 12)) {
      this.ensure(30);
      const percent = Math.min(100, percentage(row.value, total));
      const colors = pdfTone(row.tone);
      this.text(row.label, this.margin, this.y + 10, { color: "#27364f", font: "bold", size: 9, maxWidth: 250 });
      this.rect(this.margin + 285, this.y + 4, 185, 8, "#eef3f8");
      this.rect(this.margin + 285, this.y + 4, Math.max(4, 185 * (percent / 100)), 8, colors.text);
      this.text(formatInteger(row.value), this.width - this.margin - 36, this.y + 10, { color: "#172033", font: "bold", size: 9 });
      this.text(`${percent}%`, this.width - this.margin - 4, this.y + 10, { color: "#62718a", size: 8 });
      this.y += 26;
    }
    this.y += 6;
  }

  entityTable(rows: AnalyticsSnapshot["entityRows"], totalPrValue: number): void {
    if (!rows.length) {
      this.note("No entity-level analytics available for this scope.");
      return;
    }
    this.simpleRows(
      ["Entity", "Total", "Run", "Done", "Delay", "Off", "On", "PR %"],
      rows.map((row) => [
        row.entityName,
        formatInteger(row.caseCount),
        formatInteger(row.runningCount),
        formatInteger(row.completedCount),
        formatInteger(row.delayedCount),
        formatInteger(row.offTrackCount),
        formatInteger(row.onTrackCount),
        `${percentage(row.prValue, totalPrValue)}%`,
      ]),
      [142, 45, 45, 45, 45, 45, 45, 60],
    );
  }

  tenderTypeTable(rows: AnalyticsSnapshot["tenderTypeRows"]): void {
    if (!rows.length) {
      this.note("No running tender type data available for this scope.");
      return;
    }
    this.simpleRows(
      ["Tender Type", "Running", "On-Track", "Off-Track", "Delayed"],
      rows.map((row) => [
        row.tenderTypeName,
        formatInteger(row.caseCount),
        formatInteger(row.onTrackCount),
        formatInteger(row.offTrackCount),
        formatInteger(row.delayedCount),
      ]),
      [202, 70, 76, 76, 76],
    );
  }

  simpleRows(headers: string[], rows: string[][], widths: number[]): void {
    const rowHeight = 24;
    this.ensure(rowHeight * Math.min(rows.length + 1, 10) + 10);
    this.tableRow(headers, widths, true);
    for (const row of rows) {
      this.ensure(rowHeight + 2);
      this.tableRow(row, widths, false);
    }
    if (!rows.length) this.note("No data available for this section.");
    this.y += 8;
  }

  note(value: string): void {
    this.ensure(34);
    this.rect(this.margin, this.y, this.width - this.margin * 2, 30, "#f5f9ff", "#bfd7ff");
    this.text(value, this.margin + 10, this.y + 13, { color: "#27364f", size: 8, maxWidth: this.width - this.margin * 2 - 20 });
    this.y += 42;
  }

  toBuffer(): Buffer {
    this.addFooters();
    const objects: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ];
    const pageObjectIds: number[] = [];
    for (const commands of this.pageCommands) {
      const pageObjectId = objects.length + 1;
      const contentObjectId = pageObjectId + 1;
      pageObjectIds.push(pageObjectId);
      const stream = commands.join("\n");
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
      objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    }
    objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
    return buildPdf(objects);
  }

  private addPage(): void {
    this.pageCommands.push([]);
    this.y = this.margin;
  }

  private addFooters(): void {
    const pageCount = this.pageCommands.length;
    for (let index = 0; index < this.pageCommands.length; index++) {
      const commands = this.pageCommands[index];
      if (!commands) continue;
      commands.push(
        ...this.footerCommands(index + 1, pageCount),
      );
    }
  }

  private commands(): string[] {
    const commands = this.pageCommands[this.pageCommands.length - 1];
    if (!commands) throw new Error("PDF page not initialized.");
    return commands;
  }

  private ensure(height: number): void {
    if (this.y + height <= this.height - 54) return;
    this.addPage();
  }

  private footerCommands(pageNumber: number, pageCount: number): string[] {
    return [
      pdfLine(this.margin, this.height - 40, this.width - this.margin, this.height - 40, "#dbe4ef"),
      pdfText("Confidential - ProcureDesk generated report", this.margin, this.height - 24, { color: "#62718a", size: 8 }),
      pdfText(`Page ${pageNumber} of ${pageCount}`, this.width - this.margin - 55, this.height - 24, { color: "#62718a", size: 8 }),
    ];
  }

  private rect(x: number, y: number, width: number, height: number, fill: string, stroke?: string): void {
    this.commands().push(pdfRect(x, y, width, height, fill, stroke));
  }

  private tableRow(values: string[], widths: number[], header: boolean): void {
    const rowHeight = 22;
    const x = this.margin;
    const y = this.y;
    this.rect(x, y, widths.reduce((sum, width) => sum + width, 0), rowHeight, header ? "#f1f5f9" : "#ffffff", "#dbe4ef");
    let cursor = x;
    for (let index = 0; index < values.length; index++) {
      const width = widths[index] ?? 80;
      this.text(values[index] ?? "-", cursor + 6, y + 14, {
        color: header ? "#52637a" : "#27364f",
        font: header ? "bold" : "regular",
        maxWidth: width - 10,
        size: header ? 7 : 8,
      });
      cursor += width;
      if (index < values.length - 1) {
        this.commands().push(pdfLine(cursor, y, cursor, y + rowHeight, "#e7edf5"));
      }
    }
    this.y += rowHeight;
  }

  private text(
    value: string,
    x: number,
    y: number,
    options: {
      color?: string | undefined;
      font?: "bold" | "regular" | undefined;
      maxWidth?: number | undefined;
      size?: number | undefined;
    } = {},
  ): void {
    const size = options.size ?? 9;
    const lines = options.maxWidth ? wrapPdfText(value, options.maxWidth, size) : [value];
    lines.slice(0, 2).forEach((line, index) => {
      this.commands().push(pdfText(line, x, y + index * (size + 3), options));
    });
  }
}

function buildPdf(objects: string[]): Buffer {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function pdfRect(x: number, y: number, width: number, height: number, fill: string, stroke?: string): string {
  const [fr, fg, fb] = hexToRgb(fill);
  const pdfY = 792 - y - height;
  const fillCommand = `${fr} ${fg} ${fb} rg ${x} ${pdfY} ${width} ${height} re f`;
  if (!stroke) return `q ${fillCommand} Q`;
  const [sr, sg, sb] = hexToRgb(stroke);
  return `q ${fillCommand} ${sr} ${sg} ${sb} RG ${x} ${pdfY} ${width} ${height} re S Q`;
}

function pdfLine(x1: number, y1: number, x2: number, y2: number, color: string): string {
  const [r, g, b] = hexToRgb(color);
  return `q ${r} ${g} ${b} RG 0.7 w ${x1} ${792 - y1} m ${x2} ${792 - y2} l S Q`;
}

function pdfText(
  value: string,
  x: number,
  y: number,
  options: {
    color?: string | undefined;
    font?: "bold" | "regular" | undefined;
    size?: number | undefined;
  } = {},
): string {
  const [r, g, b] = hexToRgb(options.color ?? "#172033");
  const font = options.font === "bold" ? "F2" : "F1";
  const size = options.size ?? 9;
  return `BT /${font} ${size} Tf ${r} ${g} ${b} rg ${x} ${792 - y} Td (${escapePdfText(value)}) Tj ET`;
}

function wrapPdfText(value: string, maxWidth: number, size: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (size * 0.52)));
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}.` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function hexToRgb(hex: string): [string, string, string] {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return [r.toFixed(3), g.toFixed(3), b.toFixed(3)];
}

function pdfTone(tone: PdfTone): { background: string; border: string; text: string } {
  const tones: Record<PdfTone, { background: string; border: string; text: string }> = {
    brand: { background: "#eff6ff", border: "#bfd7ff", text: "#155eef" },
    danger: { background: "#fff1f2", border: "#fecdd3", text: "#dc2626" },
    neutral: { background: "#f8fafc", border: "#dbe4ef", text: "#172033" },
    success: { background: "#ecfdf5", border: "#bbf7d0", text: "#047857" },
    warning: { background: "#fffbeb", border: "#fde68a", text: "#b45309" },
  };
  return tones[tone];
}

function formatStage(stageCode: number): string {
  const stageNames: Record<number, string> = {
    0: "PR under review by Buyer",
    1: "NIT Approval Awaited",
    2: "NIT Approved, Tender to be published",
    3: "NIT published, Bids awaited",
    4: "Bids under evaluation",
    5: "Evaluation completed, in Negotiation stage",
    6: "NFA Note under approval",
    7: "NFA Note Approved, RC/PO to be issued",
    8: "RC/PO issued",
  };
  return stageNames[stageCode] ? `Stage ${stageCode} - ${stageNames[stageCode]}` : `Stage ${stageCode}`;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function formatLakhs(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value / 100000);
}

function formatDecimal(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDays(value: number | null): string {
  if (value === null) return "-";
  return formatDecimal(value);
}

function percentage(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((value / total) * 100);
}

async function insertAttachmentAudit(
  client: PoolClient,
  input: {
    action: string;
    attachmentId: string;
    details: Record<string, unknown>;
    summary: string;
    tenantId: string;
  },
): Promise<void> {
  await client.query(
    `
      insert into ops.audit_events (
        tenant_id, action, target_type, target_id, summary, details
      )
      values ($1, $2, 'email_attachment', $3, $4, $5)
    `,
    [
      input.tenantId,
      input.action,
      input.attachmentId,
      input.summary,
      JSON.stringify(input.details),
    ],
  );
}

export function createSimplePdf(lines: string[]): Buffer {
  const escapedLines = lines.map((line, index) => {
    const y = 760 - index * 20;
    return `BT /F1 11 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(escapedLines.join("\n"), "utf8")} >>\nstream\n${escapedLines.join("\n")}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function arrayPayload(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArrayPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrText(value: unknown): number | string {
  const number = Number(value);
  return Number.isFinite(number) ? number : textValue(value);
}

function textValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

type EmailSupport = {
  email: string;
  name: string;
  phone?: string | undefined;
};

async function getNotificationSettings(
  client: PoolClient,
  tenantId: string,
): Promise<{
  support: EmailSupport;
  welcomeManualEnabled: boolean;
  welcomeManualTitle: string;
}> {
  const result = await client.query<{
    support_email: string;
    support_name: string;
    support_phone: string | null;
    welcome_manual_enabled: boolean;
    welcome_manual_title: string;
  }>(
    `
      select
        support_name,
        support_email::text as support_email,
        support_phone,
        welcome_manual_enabled,
        welcome_manual_title
      from ops.notification_settings
      where tenant_id = $1
      limit 1
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    support: {
      email: row?.support_email ?? "santanu.mukherjee@rpsg.in",
      name: row?.support_name ?? "Mr. Santanu Mukherjee",
      phone: row ? row.support_phone ?? undefined : "6297445379",
    },
    welcomeManualEnabled: row?.welcome_manual_enabled ?? true,
    welcomeManualTitle: row?.welcome_manual_title ?? "ProcureDesk User Manual",
  };
}

function attachmentMeta(notificationType: string): {
  contentType: string;
  fileName: string;
  kind: string;
} {
  if (notificationType === "rc_po_expiry") {
    return {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: "rc-po-expiry.xlsx",
      kind: "rc_po_expiry_excel",
    };
  }
  return {
    contentType: "application/pdf",
    fileName: "procuredesk-analytics-snapshot.pdf",
    kind: "procurement_snapshot_pdf",
  };
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
