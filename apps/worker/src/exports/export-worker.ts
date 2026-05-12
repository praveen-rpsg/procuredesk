import ExcelJS from "exceljs";
import type { Pool } from "pg";

import type { PrivateObjectStorage } from "../storage/private-object-storage.js";

export type ExportJobPayload = {
  exportJobId: string;
  tenantId: string;
};

type ExportRow = Record<string, string | number | boolean | null>;
type ReportCode =
  | "completed"
  | "rc_po_expiry"
  | "running"
  | "stage_time"
  | "tender_details"
  | "vendor_awards";
type ReportFilters = {
  budgetTypeIds: string[];
  completionFys: string[];
  completionMonths: string[];
  cpcInvolved?: boolean | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  delayStatus?: "delayed" | "on_time" | undefined;
  departmentIds: string[];
  entityIds: string[];
  limit: number;
  loiAwarded?: boolean | undefined;
  natureOfWorkIds: string[];
  ownerUserIds: string[];
  prReceiptMonths: string[];
  priorityCase?: boolean | undefined;
  q?: string | undefined;
  selectedIds: string[];
  stageCodes: number[];
  status?: "completed" | "running" | undefined;
  tenderTypeIds: string[];
  valueSlabs: string[];
};
type ExportScope = {
  actorUserId: string;
  assignedOnly: boolean;
  entityIds: string[];
  tenantWide: boolean;
};
type ExportJob = {
  created_by: string;
  filters: unknown;
  format: "csv" | "xlsx";
  report_code: ReportCode;
};

export async function processExportJob(
  payload: ExportJobPayload,
  dependencies: { pool: Pool; storage: PrivateObjectStorage },
): Promise<void> {
  const job = await markRunning(payload, dependencies.pool);
  if (!job) return;

  try {
    await updateExportProgress(dependencies.pool, payload, 20, "Querying report data");
    const rows = await queryExportRows({
      filters: normalizeFilters(job.filters),
      pool: dependencies.pool,
      reportCode: job.report_code,
      scope: await getExportScope(payload.tenantId, job.created_by, dependencies.pool),
      tenantId: payload.tenantId,
    });
    await updateExportProgress(dependencies.pool, payload, 55, "Generating file");
    const storageKey = `exports/${payload.tenantId}/${payload.exportJobId}.${job.format}`;
    const file =
      job.format === "xlsx" ? await createXlsx(rows) : Buffer.from(createCsv(rows), "utf8");
    await updateExportProgress(dependencies.pool, payload, 80, "Writing file to private storage");
    const stored = await dependencies.storage.write(storageKey, file);
    const fileAssetId = await createFileAsset({
      byteSize: stored.byteSize,
      createdBy: job.created_by,
      format: job.format,
      pool: dependencies.pool,
      storageKey,
      tenantId: payload.tenantId,
    });
    await dependencies.pool.query(
      `
        update ops.export_jobs
        set status = 'completed',
            progress_percent = 100,
            progress_message = 'Export ready',
            file_asset_id = $3,
            completed_at = now(),
            expires_at = now() + interval '7 days'
        where tenant_id = $1
          and id = $2
      `,
      [payload.tenantId, payload.exportJobId, fileAssetId],
    );
    await dependencies.pool.query(
      `
        insert into ops.audit_events (
          tenant_id, action, target_type, target_id, summary, details
        )
        values ($1, 'export_job.completed', 'export_job', $2, $3, $4)
      `,
      [
        payload.tenantId,
        payload.exportJobId,
        "Export file generated",
        JSON.stringify({ rowCount: rows.length, storageKey }),
      ],
    );
  } catch (error) {
    await dependencies.pool.query(
      `
        update ops.export_jobs
        set status = 'failed',
            progress_message = $3,
            completed_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [
        payload.tenantId,
        payload.exportJobId,
        error instanceof Error ? error.message : "Export generation failed",
      ],
    );
    await dependencies.pool.query(
      `
        insert into ops.audit_events (
          tenant_id, action, target_type, target_id, summary, details
        )
        values ($1, 'export_job.failed', 'export_job', $2, $3, $4)
      `,
      [
        payload.tenantId,
        payload.exportJobId,
        "Export generation failed",
        JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      ],
    );
    throw error;
  }
}

async function markRunning(
  payload: ExportJobPayload,
  pool: Pool,
): Promise<ExportJob | null> {
  const result = await pool.query<ExportJob>(
    `
      update ops.export_jobs
      set status = 'running',
          progress_percent = 10,
          progress_message = 'Export worker started'
      where tenant_id = $1
        and id = $2
        and status in ('queued', 'failed')
      returning created_by, filters, format, report_code
    `,
    [payload.tenantId, payload.exportJobId],
  );
  return result.rows[0] ?? null;
}

async function updateExportProgress(
  pool: Pool,
  payload: ExportJobPayload,
  progressPercent: number,
  progressMessage: string,
): Promise<void> {
  await pool.query(
    `
      update ops.export_jobs
      set progress_percent = $3,
          progress_message = $4
      where tenant_id = $1
        and id = $2
        and status = 'running'
    `,
    [payload.tenantId, payload.exportJobId, progressPercent, progressMessage],
  );
}

async function queryExportRows(input: {
  filters: ReportFilters;
  pool: Pool;
  reportCode: ReportCode;
  scope: ExportScope;
  tenantId: string;
}): Promise<ExportRow[]> {
  if (input.reportCode === "stage_time") {
    return queryStageTimeExport(input);
  }
  if (input.reportCode === "rc_po_expiry") {
    return queryRcPoExpiryExport(input);
  }
  if (input.reportCode === "vendor_awards") {
    const values: unknown[] = [input.tenantId];
    const where = ["a.tenant_id = $1", "a.deleted_at is null", "c.deleted_at is null"];
    applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
    applyCaseFactFilters(where, values, input.filters, [
      "c.pr_id",
      "c.tender_name",
      "c.pr_description",
      "a.vendor_name",
      "a.po_number",
    ]);
    applyUuidArrayFilter(where, values, input.filters.selectedIds, "a.id");
    values.push(input.filters.limit);
    const limitPosition = values.length;
    const result = await input.pool.query<ExportRow>(
      `
        select
          c.pr_id,
          c.tender_name,
          a.vendor_name,
          a.po_number,
          a.po_value,
          a.po_award_date,
          a.po_validity_date
      from procurement.case_awards a
      join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id
      join reporting.case_facts f on f.case_id = c.id and f.tenant_id = c.tenant_id
      left join procurement.case_milestones m on m.case_id = c.id and m.tenant_id = c.tenant_id
      where ${where.join(" and ")}
        order by a.po_award_date desc nulls last
        limit $${limitPosition}
      `,
      values,
    );
    return result.rows;
  }

  const statusClause =
    input.reportCode === "running"
      ? "and f.status = 'running'"
      : input.reportCode === "completed"
        ? "and f.status = 'completed'"
        : "";
  const values: unknown[] = [input.tenantId];
  const where = ["f.tenant_id = $1", "c.deleted_at is null"];
  applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
  applyCaseFactFilters(where, values, input.filters, ["c.pr_id", "c.tender_name", "c.pr_description"]);
  applyUuidArrayFilter(where, values, input.filters.selectedIds, "f.case_id");
  values.push(input.filters.limit);
  const limitPosition = values.length;
  const result = await input.pool.query<ExportRow>(
    `
      select
        c.tender_no,
        c.pr_id,
        c.pr_description,
        c.tender_name,
        coalesce(e.code, e.name) as entity,
        dep.name as department,
        f.pr_value,
        f.approved_amount,
        tt.name as tender_type,
        f.status,
        f.stage_code,
        f.desired_stage_code,
        f.is_delayed,
        case
          when c.tentative_completion_date is null or f.pr_receipt_date is null then null
          when coalesce(f.completed_age_days, f.running_age_days) is null then null
          else round((coalesce(f.completed_age_days, f.running_age_days)::numeric / greatest((c.tentative_completion_date - f.pr_receipt_date), 1)) * 100)
        end as percent_time_elapsed,
        f.running_age_days,
        f.pr_receipt_date,
        m.nit_publish_date,
        m.bidders_participated,
        m.qualified_bidders,
        f.completed_age_days as completed_cycle_time_days,
        f.rc_po_award_date,
        f.total_awarded_amount,
        f.savings_wrt_pr,
        f.savings_wrt_estimate,
        owner.full_name as tender_owner,
        d.delay_external_days as uncontrollable_delay_days,
        m.loi_issued as loi_awarded,
        m.loi_issued_date as loi_award_date,
        c.pr_remarks,
        f.completion_fy
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id
      left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
      left join org.departments dep on dep.id = f.department_id and dep.tenant_id = f.tenant_id
      left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
      left join iam.users owner on owner.id = f.owner_user_id and owner.tenant_id = f.tenant_id
      left join procurement.case_milestones m on m.case_id = f.case_id and m.tenant_id = f.tenant_id
      left join procurement.case_delays d on d.case_id = f.case_id and d.tenant_id = f.tenant_id
      where ${where.join(" and ")}
      ${statusClause}
      order by f.updated_at desc
      limit $${limitPosition}
    `,
    values,
  );
  return result.rows;
}

async function queryStageTimeExport(input: {
  filters: ReportFilters;
  pool: Pool;
  reportCode: ReportCode;
  scope: ExportScope;
  tenantId: string;
}): Promise<ExportRow[]> {
  const values: unknown[] = [input.tenantId];
  const where = ["f.tenant_id = $1", "c.deleted_at is null"];
  applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
  applyCaseFactFilters(where, values, input.filters, ["c.pr_id", "c.tender_name", "c.pr_description"]);
  if (input.filters.selectedIds.length) {
    values.push(input.filters.selectedIds.map(Number).filter((stageCode) => Number.isInteger(stageCode)));
    where.push(`f.stage_code = any($${values.length}::int[])`);
  }
  const result = await input.pool.query<ExportRow>(
    `
      select
        f.stage_code,
        count(*)::integer as case_count,
        round(avg(f.running_age_days)::numeric, 2) as average_running_age_days
      from reporting.case_facts f
      join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id
      left join procurement.case_milestones m on m.case_id = f.case_id and m.tenant_id = f.tenant_id
      where ${where.join(" and ")}
      group by f.stage_code
      order by f.stage_code asc
    `,
    values,
  );
  return result.rows;
}

async function queryRcPoExpiryExport(input: {
  filters: ReportFilters;
  pool: Pool;
  reportCode: ReportCode;
  scope: ExportScope;
  tenantId: string;
}): Promise<ExportRow[]> {
  const values: unknown[] = [input.tenantId];
  const where = ["e.tenant_id = $1"];
  applyScope(where, values, input.scope, "e.entity_id", "e.owner_user_id");
  applyUuidArrayFilter(where, values, input.filters.entityIds, "e.entity_id");
  applyUuidArrayFilter(where, values, input.filters.ownerUserIds, "e.owner_user_id");
  applyDateFilters(where, values, input.filters, "e.rc_po_validity_date");
  if (input.filters.q) {
    applyTextSearch(where, values, input.filters.q, ["e.tender_description", "e.awarded_vendors"]);
  }
  if (input.filters.selectedIds.length) {
    values.push(input.filters.selectedIds);
    where.push(`coalesce(e.case_id, e.rc_po_plan_id, e.id)::text = any($${values.length}::text[])`);
  }
  values.push(input.filters.limit);
  const limitPosition = values.length;
  const result = await input.pool.query<ExportRow>(
    `
      select
        coalesce(e.case_id, e.rc_po_plan_id, e.id) as source_id,
        e.source_type,
        e.tender_description,
        e.awarded_vendors,
        e.rc_po_amount,
        e.rc_po_award_date,
        e.rc_po_validity_date,
        e.tender_floated_or_not_required,
        (e.rc_po_validity_date - current_date)::integer as days_to_expiry
      from reporting.contract_expiry_facts e
      where ${where.join(" and ")}
      order by e.rc_po_validity_date asc
      limit $${limitPosition}
    `,
    values,
  );
  return result.rows;
}

async function getExportScope(
  tenantId: string,
  userId: string,
  pool: Pool,
): Promise<ExportScope> {
  const result = await pool.query<{
    entity_ids: string[] | null;
    is_platform_super_admin: boolean;
    permissions: string[] | null;
  }>(
    `
      select
        u.is_platform_super_admin,
        array_remove(array_agg(distinct p.code::text), null) as permissions,
        array_remove(array_agg(distinct ues.entity_id::text), null) as entity_ids
      from iam.users u
      left join iam.user_roles ur on ur.user_id = u.id
      left join iam.role_permissions rp on rp.role_id = ur.role_id
      left join iam.permissions p on p.code = rp.permission_code
      left join iam.user_entity_scopes ues on ues.user_id = u.id
      where u.tenant_id = $1
        and u.id = $2
        and u.deleted_at is null
      group by u.id, u.is_platform_super_admin
    `,
    [tenantId, userId],
  );
  const actor = result.rows[0];
  const permissions = actor?.permissions ?? [];
  if (actor?.is_platform_super_admin || permissions.includes("case.read.all")) {
    return { actorUserId: userId, assignedOnly: false, entityIds: [], tenantWide: true };
  }
  if (permissions.includes("case.read.entity")) {
    return {
      actorUserId: userId,
      assignedOnly: false,
      entityIds: actor?.entity_ids ?? [],
      tenantWide: false,
    };
  }
  return { actorUserId: userId, assignedOnly: true, entityIds: [], tenantWide: false };
}

function normalizeFilters(value: unknown): ReportFilters {
  const record = isRecord(value) ? value : {};
  return {
    budgetTypeIds: stringArray(record.budgetTypeIds, 100),
    completionFys: stringArray(record.completionFys, 50),
    completionMonths: stringArray(record.completionMonths, 60),
    cpcInvolved: optionalBoolean(record.cpcInvolved),
    dateFrom: dateString(record.dateFrom),
    dateTo: dateString(record.dateTo),
    delayStatus: record.delayStatus === "delayed" || record.delayStatus === "on_time" ? record.delayStatus : undefined,
    departmentIds: stringArray(record.departmentIds, 200),
    entityIds: stringArray(record.entityIds, 200),
    limit: positiveLimit(record.limit),
    loiAwarded: optionalBoolean(record.loiAwarded),
    natureOfWorkIds: stringArray(record.natureOfWorkIds, 100),
    ownerUserIds: stringArray(record.ownerUserIds, 200),
    prReceiptMonths: stringArray(record.prReceiptMonths, 60),
    priorityCase: optionalBoolean(record.priorityCase),
    q: optionalSearch(record.q),
    selectedIds: stringArray(record.selectedIds, 500),
    stageCodes: intArray(record.stageCodes, 20).filter((stageCode) => stageCode >= 0 && stageCode <= 8),
    status: record.status === "completed" || record.status === "running" ? record.status : undefined,
    tenderTypeIds: stringArray(record.tenderTypeIds, 100),
    valueSlabs: stringArray(record.valueSlabs, 20),
  };
}

function applyCaseFactFilters(
  where: string[],
  values: unknown[],
  filters: ReportFilters,
  searchColumns: string[],
) {
  if (filters.status) {
    values.push(filters.status);
    where.push(`f.status = $${values.length}`);
  }
  applyUuidArrayFilter(where, values, filters.entityIds, "f.entity_id");
  applyUuidArrayFilter(where, values, filters.departmentIds, "f.department_id");
  applyUuidArrayFilter(where, values, filters.ownerUserIds, "f.owner_user_id");
  applyUuidArrayFilter(where, values, filters.tenderTypeIds, "f.tender_type_id");
  applyUuidArrayFilter(where, values, filters.budgetTypeIds, "c.budget_type_id");
  applyUuidArrayFilter(where, values, filters.natureOfWorkIds, "c.nature_of_work_id");
  if (filters.valueSlabs.length) {
    values.push(filters.valueSlabs);
    where.push(`f.value_slab = any($${values.length}::text[])`);
  }
  if (filters.stageCodes.length) {
    values.push(filters.stageCodes);
    where.push(`f.stage_code = any($${values.length}::int[])`);
  }
  if (filters.completionFys.length) {
    values.push(filters.completionFys);
    where.push(`f.completion_fy = any($${values.length}::text[])`);
  }
  if (filters.prReceiptMonths.length) {
    values.push(filters.prReceiptMonths);
    where.push(`to_char(f.pr_receipt_date, 'YYYY-MM') = any($${values.length}::text[])`);
  }
  if (filters.completionMonths.length) {
    values.push(filters.completionMonths);
    where.push(`to_char(f.rc_po_award_date, 'YYYY-MM') = any($${values.length}::text[])`);
  }
  applyDateFilters(where, values, filters, "f.pr_receipt_date");
  if (filters.delayStatus) {
    where.push(filters.delayStatus === "delayed" ? "f.is_delayed" : "not f.is_delayed");
  }
  if (filters.loiAwarded !== undefined) {
    where.push(filters.loiAwarded ? "coalesce(m.loi_issued, false)" : "not coalesce(m.loi_issued, false)");
  }
  if (filters.cpcInvolved !== undefined) {
    where.push(filters.cpcInvolved ? "f.cpc_involved" : "not f.cpc_involved");
  }
  if (filters.priorityCase !== undefined) {
    where.push(filters.priorityCase ? "f.priority_case" : "not f.priority_case");
  }
  if (filters.q) {
    applyTextSearch(where, values, filters.q, searchColumns);
  }
}

function applyDateFilters(
  where: string[],
  values: unknown[],
  filters: Pick<ReportFilters, "dateFrom" | "dateTo">,
  column: string,
) {
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`${column} >= $${values.length}`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`${column} <= $${values.length}`);
  }
}

function applyScope(
  where: string[],
  values: unknown[],
  scope: ExportScope,
  entityColumn: string,
  ownerColumn: string,
) {
  if (scope.tenantWide) return;
  if (scope.assignedOnly) {
    values.push(scope.actorUserId);
    where.push(`${ownerColumn} = $${values.length}`);
    return;
  }
  values.push(scope.entityIds);
  where.push(`${entityColumn} = any($${values.length}::uuid[])`);
}

function applyTextSearch(
  where: string[],
  values: unknown[],
  query: string,
  columns: string[],
) {
  values.push(query);
  const vector = columns.map((column) => `coalesce(${column}, '')`).join(" || ' ' || ");
  where.push(`to_tsvector('english', ${vector}) @@ plainto_tsquery('english', $${values.length})`);
}

function applyUuidArrayFilter(
  where: string[],
  values: unknown[],
  ids: string[],
  column: string,
) {
  if (ids.length) {
    values.push(ids);
    where.push(`${column} = any($${values.length}::uuid[])`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, maxLength);
}

function intArray(value: unknown, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .slice(0, maxLength);
}

function dateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function optionalSearch(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

function optionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function positiveLimit(value: unknown) {
  const limit = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 50_000;
  return Math.min(limit, 50_000);
}

function createCsv(rows: ExportRow[]): string {
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

async function createXlsx(rows: ExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");
  const headers = Object.keys(rows[0] ?? {});
  sheet.columns = headers.map((header) => ({ header, key: header }));
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

async function createFileAsset(input: {
  byteSize: number;
  createdBy: string;
  format: "csv" | "xlsx";
  pool: Pool;
  storageKey: string;
  tenantId: string;
}): Promise<string> {
  const result = await input.pool.query<{ id: string }>(
    `
      insert into ops.file_assets (
        tenant_id, storage_key, original_filename, content_type, byte_size, purpose, created_by
      )
      values ($1, $2, $3, $4, $5, 'export', $6)
      returning id
    `,
    [
      input.tenantId,
      input.storageKey,
      input.storageKey.split("/").at(-1) ?? "export",
      input.format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
      input.byteSize,
      input.createdBy,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Failed to create export file asset.");
  return id;
}
