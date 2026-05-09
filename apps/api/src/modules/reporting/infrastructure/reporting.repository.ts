import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";
import type {
  ContractExpiryReportRow,
  ReportCaseRow,
  ReportCode,
  StageTimeRow,
  VendorAwardReportRow,
} from "../domain/report-read-models.js";

export type ReportScope = {
  actorUserId: string;
  assignedOnly: boolean;
  entityIds: string[];
  tenantWide: boolean;
};

export type ReportFilters = {
  completionFys?: string[];
  completionMonths?: string[];
  dateFrom?: string;
  dateTo?: string;
  entityIds?: string[];
  limit?: number;
  ownerUserIds?: string[];
  prReceiptMonths?: string[];
  q?: string;
  stageCodes?: number[];
  status?: "completed" | "running";
  tenderTypeIds?: string[];
};

export type SavedReportView = {
  columns: unknown[];
  filters: Record<string, unknown>;
  id: string;
  isDefault: boolean;
  name: string;
  reportCode: string;
};

@Injectable()
export class ReportingRepository {
  constructor(private readonly db: DatabaseService) {}

  async refreshCaseFacts(tenantId: string): Promise<void> {
    await this.db.query(
      `
        delete from reporting.case_facts f
        where f.tenant_id = $1
          and not exists (
            select 1
            from procurement.cases c
            where c.id = f.case_id
              and c.tenant_id = f.tenant_id
              and c.deleted_at is null
          )
      `,
      [tenantId],
    );
    await this.db.query(
      `
        insert into reporting.case_facts (
          case_id, tenant_id, entity_id, department_id, owner_user_id,
          tender_type_id, status, stage_code, desired_stage_code, is_delayed,
          priority_case, cpc_involved, pr_receipt_date, rc_po_award_date,
          completion_fy, value_slab, rc_po_value_slab, running_age_days,
          completed_age_days, current_stage_aging_days, pr_value,
          estimate_benchmark, approved_amount, total_awarded_amount,
          savings_wrt_pr, savings_wrt_estimate, updated_at
        )
        select
          c.id,
          c.tenant_id,
          c.entity_id,
          c.department_id,
          c.owner_user_id,
          c.tender_type_id,
          c.status,
          c.stage_code,
          c.desired_stage_code,
          c.is_delayed,
          c.priority_case,
          c.cpc_involved,
          c.pr_receipt_date,
          m.rc_po_award_date,
          case
            when m.rc_po_award_date is null then null
            when extract(month from m.rc_po_award_date) >= 4
              then extract(year from m.rc_po_award_date)::int || '-' || (extract(year from m.rc_po_award_date)::int + 1)
            else (extract(year from m.rc_po_award_date)::int - 1) || '-' || extract(year from m.rc_po_award_date)::int
          end,
          case
            when f.pr_value is null then null
            when f.pr_value < 1000000 then '<10L'
            when f.pr_value < 10000000 then '10L-1Cr'
            when f.pr_value < 100000000 then '1Cr-10Cr'
            else '10Cr+'
          end,
          case
            when f.total_awarded_amount is null then null
            when f.total_awarded_amount < 1000000 then '<10L'
            when f.total_awarded_amount < 10000000 then '10L-1Cr'
            when f.total_awarded_amount < 100000000 then '1Cr-10Cr'
            else '10Cr+'
          end,
          case
            when c.status = 'running' and c.pr_receipt_date is not null
              then current_date - c.pr_receipt_date
            else null
          end,
          case
            when c.status = 'completed' and c.pr_receipt_date is not null and m.rc_po_award_date is not null
              then m.rc_po_award_date - c.pr_receipt_date
            else null
          end,
          case
            when c.pr_receipt_date is not null then current_date - c.pr_receipt_date
            else null
          end,
          f.pr_value,
          f.estimate_benchmark,
          f.approved_amount,
          f.total_awarded_amount,
          f.savings_wrt_pr,
          f.savings_wrt_estimate,
          now()
        from procurement.cases c
        left join procurement.case_financials f on f.case_id = c.id
        left join procurement.case_milestones m on m.case_id = c.id
        where c.tenant_id = $1
          and c.deleted_at is null
        on conflict (case_id) do update
        set entity_id = excluded.entity_id,
            department_id = excluded.department_id,
            owner_user_id = excluded.owner_user_id,
            tender_type_id = excluded.tender_type_id,
            status = excluded.status,
            stage_code = excluded.stage_code,
            desired_stage_code = excluded.desired_stage_code,
            is_delayed = excluded.is_delayed,
            priority_case = excluded.priority_case,
            cpc_involved = excluded.cpc_involved,
            pr_receipt_date = excluded.pr_receipt_date,
            rc_po_award_date = excluded.rc_po_award_date,
            completion_fy = excluded.completion_fy,
            value_slab = excluded.value_slab,
            rc_po_value_slab = excluded.rc_po_value_slab,
            running_age_days = excluded.running_age_days,
            completed_age_days = excluded.completed_age_days,
            current_stage_aging_days = excluded.current_stage_aging_days,
            pr_value = excluded.pr_value,
            estimate_benchmark = excluded.estimate_benchmark,
            approved_amount = excluded.approved_amount,
            total_awarded_amount = excluded.total_awarded_amount,
            savings_wrt_pr = excluded.savings_wrt_pr,
            savings_wrt_estimate = excluded.savings_wrt_estimate,
            updated_at = now()
      `,
      [tenantId],
    );
  }

  async refreshContractExpiryFacts(tenantId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      await this.db.query("delete from reporting.contract_expiry_facts where tenant_id = $1", [tenantId], client);
      await this.db.query(
        `
          insert into reporting.contract_expiry_facts (
            tenant_id, case_id, entity_id, department_id, owner_user_id,
            tender_description, awarded_vendors, rc_po_amount, rc_po_award_date,
            rc_po_validity_date, tentative_tendering_date,
            tender_floated_or_not_required, source_type, updated_at
          )
          select
            c.tenant_id,
            c.id,
            c.entity_id,
            c.department_id,
            c.owner_user_id,
            coalesce(c.tender_name, c.pr_description),
            a.vendor_name,
            a.po_value,
            a.po_award_date,
            a.po_validity_date,
            null::date,
            false,
            'case_award',
            now()
          from procurement.case_awards a
          join procurement.cases c on c.id = a.case_id and c.deleted_at is null
          where a.tenant_id = $1
            and a.deleted_at is null
            and a.po_validity_date is not null
        `,
        [tenantId],
        client,
      );
      await this.db.query(
        `
          insert into reporting.contract_expiry_facts (
            tenant_id, rc_po_plan_id, case_id, entity_id, department_id,
            owner_user_id, tender_description, awarded_vendors, rc_po_amount,
            rc_po_award_date, rc_po_validity_date, tentative_tendering_date,
            tender_floated_or_not_required, source_type, updated_at
          )
          select
            p.tenant_id,
            p.id,
            p.source_case_id,
            p.entity_id,
            p.department_id,
            c.owner_user_id,
            p.tender_description,
            p.awarded_vendors,
            p.rc_po_amount,
            p.rc_po_award_date,
            p.rc_po_validity_date,
            p.tentative_tendering_date,
            p.tender_floated_or_not_required,
            'manual_plan',
            now()
          from procurement.rc_po_plans p
          left join procurement.cases c on c.id = p.source_case_id
          where p.tenant_id = $1
            and p.deleted_at is null
            and p.rc_po_validity_date is not null
        `,
        [tenantId],
        client,
      );
    });
  }

  async analytics(tenantId: string, scope: ReportScope, filters: ReportFilters) {
    const values: unknown[] = [tenantId];
    const where = ["f.tenant_id = $1"];
    this.applyScope(where, values, scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, filters);
    const row = await this.db.one<QueryResultRow & AnalyticsRow>(
      `
        select
          count(*)::text as total_cases,
          count(*) filter (where f.status = 'running')::text as running_cases,
          count(*) filter (where f.status = 'completed')::text as completed_cases,
          count(*) filter (where f.is_delayed)::text as delayed_cases,
          coalesce(sum(f.total_awarded_amount), 0)::text as total_awarded_amount,
          coalesce(sum(f.savings_wrt_pr), 0)::text as savings_wrt_pr
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        where ${where.join(" and ")}
      `,
      values,
    );
    const entityDistribution = await this.db.query<QueryResultRow & AnalyticsEntityRow>(
      `
        select
          f.entity_id,
          e.code as entity_code,
          e.name as entity_name,
          count(*)::text as case_count,
          count(*) filter (where f.is_delayed)::text as delayed_count,
          coalesce(sum(f.total_awarded_amount), 0)::text as total_awarded_amount
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
        where ${where.join(" and ")}
        group by f.entity_id, e.code, e.name
        order by count(*) desc, e.code asc nulls last, e.name asc nulls last
        limit 8
      `,
      values,
    );
    const tenderTypeDistribution = await this.db.query<QueryResultRow & AnalyticsTenderTypeRow>(
      `
        select
          f.tender_type_id,
          tt.name as tender_type_name,
          count(*)::text as case_count,
          count(*) filter (where f.is_delayed)::text as delayed_count,
          coalesce(sum(f.total_awarded_amount), 0)::text as total_awarded_amount
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
        where ${where.join(" and ")}
        group by f.tender_type_id, tt.name
        order by count(*) desc, tt.name asc nulls last
        limit 8
      `,
      values,
    );
    const bidderRow = await this.db.one<QueryResultRow & AnalyticsBidderRow>(
      `
        select
          avg(m.bidders_participated)::text as average_bidders_participated,
          avg(m.qualified_bidders)::text as average_qualified_bidders,
          count(*) filter (where m.bidders_participated is not null)::text as bidder_case_count
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        left join procurement.case_milestones m on m.case_id = f.case_id and m.tenant_id = f.tenant_id
        where ${where.join(" and ")}
      `,
      values,
    );

    return this.mapAnalyticsResult(
      row,
      bidderRow,
      entityDistribution.rows,
      tenderTypeDistribution.rows,
    );
  }

  async caseReport(input: {
    filters: ReportFilters;
    scope: ReportScope;
    status?: "completed" | "running";
    tenantId: string;
  }): Promise<ReportCaseRow[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["f.tenant_id = $1"];
    this.applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, input.filters);
    if (input.status) {
      values.push(input.status);
      where.push(`f.status = $${values.length}`);
    }
    values.push(input.filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & CaseReportRow>(
      `
        select
          c.id as case_id,
          c.pr_id,
          c.tender_name,
          f.entity_id,
          f.status,
          f.stage_code,
          f.is_delayed,
          f.pr_receipt_date,
          f.rc_po_award_date,
          f.total_awarded_amount
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        where ${where.join(" and ")}
        order by f.updated_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      caseId: row.case_id,
      entityId: row.entity_id,
      isDelayed: row.is_delayed,
      prId: row.pr_id,
      prReceiptDate: this.dateToIso(row.pr_receipt_date),
      rcPoAwardDate: this.dateToIso(row.rc_po_award_date),
      stageCode: row.stage_code,
      status: row.status,
      tenderName: row.tender_name,
      totalAwardedAmount: this.numberOrNull(row.total_awarded_amount),
    }));
  }

  async vendorAwards(input: {
    filters: ReportFilters;
    scope: ReportScope;
    tenantId: string;
  }): Promise<VendorAwardReportRow[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["a.tenant_id = $1", "a.deleted_at is null"];
    this.applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, input.filters);
    values.push(input.filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & VendorAwardRow>(
      `
        select
          a.id as award_id,
          c.id as case_id,
          c.pr_id,
          c.tender_name,
          c.entity_id,
          a.vendor_name,
          a.po_number,
          a.po_value,
          a.po_award_date,
          a.po_validity_date
        from procurement.case_awards a
        join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id and c.deleted_at is null
        join reporting.case_facts f on f.case_id = c.id and f.tenant_id = c.tenant_id
        where ${where.join(" and ")}
        order by a.po_award_date desc nulls last, a.created_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      awardId: row.award_id,
      caseId: row.case_id,
      entityId: row.entity_id,
      poAwardDate: this.dateToIso(row.po_award_date),
      poNumber: row.po_number,
      poValue: this.numberOrNull(row.po_value),
      poValidityDate: this.dateToIso(row.po_validity_date),
      prId: row.pr_id,
      tenderName: row.tender_name,
      vendorName: row.vendor_name,
    }));
  }

  async stageTime(tenantId: string, scope: ReportScope, filters: ReportFilters): Promise<StageTimeRow[]> {
    const values: unknown[] = [tenantId];
    const where = ["f.tenant_id = $1"];
    this.applyScope(where, values, scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, filters);
    const result = await this.db.query<QueryResultRow & StageTimeSqlRow>(
      `
        select
          f.stage_code,
          count(*)::integer as case_count,
          avg(f.running_age_days)::text as average_running_age_days
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        where ${where.join(" and ")}
        group by f.stage_code
        order by f.stage_code asc
      `,
      values,
    );

    return result.rows.map((row) => ({
      averageRunningAgeDays: this.numberOrNull(row.average_running_age_days),
      caseCount: row.case_count,
      stageCode: row.stage_code,
    }));
  }

  async rcPoExpiry(input: {
    filters: ReportFilters;
    scope: ReportScope;
    tenantId: string;
  }): Promise<ContractExpiryReportRow[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["e.tenant_id = $1"];
    this.applyScope(where, values, input.scope, "e.entity_id", "e.owner_user_id");
    this.applyEntityFilter(where, values, input.filters, "e.entity_id");
    this.applyUuidArrayFilter(where, values, input.filters.ownerUserIds, "e.owner_user_id");
    this.applyDateFilters(where, values, input.filters, "e.rc_po_validity_date");
    if (input.filters.q) {
      values.push(input.filters.q);
      where.push(`
        to_tsvector('english', coalesce(e.tender_description, '') || ' ' || coalesce(e.awarded_vendors, ''))
          @@ plainto_tsquery('english', $${values.length})
      `);
    }
    values.push(input.filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & ContractExpiryRow>(
      `
        select
          coalesce(e.case_id, e.rc_po_plan_id, e.id) as source_id,
          e.source_type,
          e.entity_id,
          e.tender_description,
          e.awarded_vendors,
          e.rc_po_amount,
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

    return result.rows.map((row) => ({
      awardedVendors: row.awarded_vendors,
      daysToExpiry: row.days_to_expiry,
      entityId: row.entity_id,
      rcPoAmount: this.numberOrNull(row.rc_po_amount),
      rcPoValidityDate: this.dateToIso(row.rc_po_validity_date) ?? "",
      sourceId: row.source_id,
      sourceType: row.source_type,
      tenderDescription: row.tender_description,
      tenderFloatedOrNotRequired: row.tender_floated_or_not_required,
    }));
  }

  async filterMetadata(tenantId: string, scope: ReportScope) {
    const values: unknown[] = [tenantId];
    const where = ["f.tenant_id = $1"];
    this.applyScope(where, values, scope, "f.entity_id", "f.owner_user_id");
    const result = await this.db.query<QueryResultRow & FilterMetadataRow>(
      `
        select distinct
          f.entity_id,
          e.code as entity_code,
          e.name as entity_name,
          f.owner_user_id,
          u.username as owner_username,
          u.full_name as owner_full_name,
          f.tender_type_id,
          tt.name as tender_type_name,
          f.status,
          f.stage_code,
          f.completion_fy,
          to_char(f.pr_receipt_date, 'YYYY-MM') as pr_receipt_month,
          to_char(f.rc_po_award_date, 'YYYY-MM') as completion_month
        from reporting.case_facts f
        left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
        left join iam.users u on u.id = f.owner_user_id and u.tenant_id = f.tenant_id
        left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
        where ${where.join(" and ")}
        order by f.status asc, f.stage_code asc
      `,
      values,
    );
    const entities = new Map<string, { code: string | null; id: string; name: string | null }>();
    const owners = new Map<string, { fullName: string | null; id: string; username: string | null }>();
    const tenderTypes = new Map<string, { id: string; name: string }>();
    for (const row of result.rows) {
      entities.set(row.entity_id, {
        code: row.entity_code,
        id: row.entity_id,
        name: row.entity_name,
      });
      if (row.owner_user_id) {
        owners.set(row.owner_user_id, {
          fullName: row.owner_full_name,
          id: row.owner_user_id,
          username: row.owner_username,
        });
      }
      if (row.tender_type_id) {
        tenderTypes.set(row.tender_type_id, {
          id: row.tender_type_id,
          name: row.tender_type_name ?? "Unspecified",
        });
      }
    }
    return {
      completionFys: [...new Set(result.rows.map((row) => row.completion_fy).filter(Boolean))].sort(),
      completionMonths: [...new Set(result.rows.map((row) => row.completion_month).filter(Boolean))].sort(),
      entities: [...entities.values()].sort((left, right) =>
        (left.code ?? left.name ?? left.id).localeCompare(right.code ?? right.name ?? right.id),
      ),
      entityIds: [...entities.keys()],
      owners: [...owners.values()].sort((left, right) =>
        (left.fullName ?? left.username ?? left.id).localeCompare(right.fullName ?? right.username ?? right.id),
      ),
      prReceiptMonths: [...new Set(result.rows.map((row) => row.pr_receipt_month).filter(Boolean))].sort(),
      stages: [...new Set(result.rows.map((row) => row.stage_code))],
      statuses: [...new Set(result.rows.map((row) => row.status))],
      tenderTypes: [...tenderTypes.values()].sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  async listSavedViews(tenantId: string, userId: string, reportCode?: string): Promise<SavedReportView[]> {
    const values: unknown[] = [tenantId, userId];
    const where = ["tenant_id = $1", "user_id = $2"];
    if (reportCode) {
      values.push(reportCode);
      where.push(`report_code = $${values.length}`);
    }
    const result = await this.db.query<QueryResultRow & SavedViewRow>(
      `
        select id, report_code, name, filters, columns, is_default
        from reporting.report_saved_views
        where ${where.join(" and ")}
        order by is_default desc, name asc
      `,
      values,
    );
    return result.rows.map((row) => ({
      columns: row.columns,
      filters: row.filters,
      id: row.id,
      isDefault: row.is_default,
      name: row.name,
      reportCode: row.report_code,
    }));
  }

  async createSavedView(input: {
    columns: unknown[];
    filters: Record<string, unknown>;
    isDefault: boolean;
    name: string;
    reportCode: ReportCode;
    tenantId: string;
    userId: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into reporting.report_saved_views (
          tenant_id, user_id, report_code, name, filters, columns, is_default
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [
        input.tenantId,
        input.userId,
        input.reportCode,
        input.name,
        JSON.stringify(input.filters),
        JSON.stringify(input.columns),
        input.isDefault,
      ],
    );
    if (!row) throw new Error("Failed to save report view.");
    return { id: row.id };
  }

  async createExportJob(input: {
    createdBy: string;
    filters: Record<string, unknown>;
    format: "csv" | "xlsx";
    reportCode: ReportCode;
    tenantId: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into ops.export_jobs (
          tenant_id, report_code, format, filters, created_by, progress_percent, progress_message
        )
        values ($1, $2, $3, $4, $5, 0, 'Queued')
        returning id
      `,
      [
        input.tenantId,
        input.reportCode,
        input.format,
        JSON.stringify(input.filters),
        input.createdBy,
      ],
    );
    if (!row) throw new Error("Failed to create export job.");
    return { id: row.id };
  }

  async getExportJob(tenantId: string, jobId: string) {
    return this.db.one<
      QueryResultRow & {
        completed_at: Date | null;
        created_at: Date;
        expires_at: Date | null;
        file_asset_id: string | null;
        format: string;
        id: string;
        progress_message: string | null;
        progress_percent: number;
        report_code: string;
        status: string;
      }
    >(
      `
        select
          id, report_code, format, status, progress_percent, progress_message,
          file_asset_id, created_at, completed_at, expires_at
        from ops.export_jobs
        where tenant_id = $1
          and id = $2
      `,
      [tenantId, jobId],
    );
  }

  async getExportFile(tenantId: string, jobId: string) {
    return this.db.one<
      QueryResultRow & {
        content_type: string | null;
        original_filename: string | null;
        storage_key: string;
      }
    >(
      `
        select f.storage_key, f.original_filename, f.content_type
        from ops.export_jobs j
        join ops.file_assets f on f.id = j.file_asset_id
        where j.tenant_id = $1
          and j.id = $2
          and j.status = 'completed'
          and (j.expires_at is null or j.expires_at > now())
      `,
      [tenantId, jobId],
    );
  }

  private applyReportFilters(where: string[], values: unknown[], filters: ReportFilters) {
    if (filters.status) {
      values.push(filters.status);
      where.push(`f.status = $${values.length}`);
    }
    this.applyEntityFilter(where, values, filters, "f.entity_id");
    this.applyUuidArrayFilter(where, values, filters.ownerUserIds, "f.owner_user_id");
    this.applyUuidArrayFilter(where, values, filters.tenderTypeIds, "f.tender_type_id");
    if (filters.stageCodes?.length) {
      values.push(filters.stageCodes);
      where.push(`f.stage_code = any($${values.length}::int[])`);
    }
    if (filters.completionFys?.length) {
      values.push(filters.completionFys);
      where.push(`f.completion_fy = any($${values.length}::text[])`);
    }
    if (filters.prReceiptMonths?.length) {
      values.push(filters.prReceiptMonths);
      where.push(`to_char(f.pr_receipt_date, 'YYYY-MM') = any($${values.length}::text[])`);
    }
    if (filters.completionMonths?.length) {
      values.push(filters.completionMonths);
      where.push(`to_char(f.rc_po_award_date, 'YYYY-MM') = any($${values.length}::text[])`);
    }
    this.applyDateFilters(where, values, filters, "f.pr_receipt_date");
    if (filters.q) {
      values.push(filters.q);
      where.push(`
        to_tsvector('english', coalesce(c.pr_id, '') || ' ' || coalesce(c.tender_name, '') || ' ' || coalesce(c.pr_description, ''))
          @@ plainto_tsquery('english', $${values.length})
      `);
    }
  }

  private applyDateFilters(
    where: string[],
    values: unknown[],
    filters: ReportFilters,
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

  private applyEntityFilter(
    where: string[],
    values: unknown[],
    filters: ReportFilters,
    column: string,
  ) {
    this.applyUuidArrayFilter(where, values, filters.entityIds, column);
  }

  private applyUuidArrayFilter(
    where: string[],
    values: unknown[],
    ids: string[] | undefined,
    column: string,
  ) {
    if (ids?.length) {
      values.push(ids);
      where.push(`${column} = any($${values.length}::uuid[])`);
    }
  }

  private applyScope(
    where: string[],
    values: unknown[],
    scope: ReportScope,
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

  private dateToIso(value: Date | string | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value;
  }

  private numberOrNull(value: string | number | null): number | null {
    if (value == null) return null;
    return typeof value === "number" ? value : Number(value);
  }

  private mapAnalyticsResult(
    row: AnalyticsRow | null,
    bidderRow: AnalyticsBidderRow | null,
    entityRows: AnalyticsEntityRow[],
    tenderTypeRows: AnalyticsTenderTypeRow[],
  ) {
    return {
      averageBiddersParticipated: this.numberOrNull(nullable(rowValue(bidderRow, "average_bidders_participated"))),
      averageQualifiedBidders: this.numberOrNull(nullable(rowValue(bidderRow, "average_qualified_bidders"))),
      bidderCaseCount: Number(rowValue(bidderRow, "bidder_case_count", "0")),
      byEntity: entityRows.map(mapAnalyticsEntityRow),
      byTenderType: tenderTypeRows.map(mapAnalyticsTenderTypeRow),
      completedCases: Number(rowValue(row, "completed_cases", "0")),
      delayedCases: Number(rowValue(row, "delayed_cases", "0")),
      runningCases: Number(rowValue(row, "running_cases", "0")),
      savingsWrtPr: Number(rowValue(row, "savings_wrt_pr", "0")),
      totalAwardedAmount: Number(rowValue(row, "total_awarded_amount", "0")),
      totalCases: Number(rowValue(row, "total_cases", "0")),
    };
  }
}

function rowValue<TRow extends object, TKey extends keyof TRow>(
  row: TRow | null,
  key: TKey,
  fallback: NonNullable<TRow[TKey]>,
): NonNullable<TRow[TKey]>;
function rowValue<TRow extends object, TKey extends keyof TRow>(
  row: TRow | null,
  key: TKey,
): TRow[TKey] | null;
function rowValue<TRow extends object, TKey extends keyof TRow>(
  row: TRow | null,
  key: TKey,
  fallback?: NonNullable<TRow[TKey]>,
): TRow[TKey] | NonNullable<TRow[TKey]> | null {
  if (!row) return fallback ?? null;
  const value = row[key];
  return value ?? fallback ?? null;
}

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function mapAnalyticsEntityRow(row: AnalyticsEntityRow) {
  return {
    caseCount: Number(row.case_count),
    delayedCount: Number(row.delayed_count),
    entityCode: row.entity_code,
    entityId: row.entity_id,
    entityName: row.entity_name,
    totalAwardedAmount: Number(row.total_awarded_amount),
  };
}

function mapAnalyticsTenderTypeRow(row: AnalyticsTenderTypeRow) {
  return {
    caseCount: Number(row.case_count),
    delayedCount: Number(row.delayed_count),
    tenderTypeId: row.tender_type_id,
    tenderTypeName: row.tender_type_name ?? "Unspecified",
    totalAwardedAmount: Number(row.total_awarded_amount),
  };
}

type AnalyticsRow = {
  completed_cases: string;
  delayed_cases: string;
  running_cases: string;
  savings_wrt_pr: string;
  total_awarded_amount: string;
  total_cases: string;
};

type AnalyticsBidderRow = {
  average_bidders_participated: string | null;
  average_qualified_bidders: string | null;
  bidder_case_count: string;
};

type AnalyticsEntityRow = {
  case_count: string;
  delayed_count: string;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  total_awarded_amount: string;
};

type AnalyticsTenderTypeRow = {
  case_count: string;
  delayed_count: string;
  tender_type_id: string | null;
  tender_type_name: string | null;
  total_awarded_amount: string;
};

type CaseReportRow = {
  case_id: string;
  entity_id: string;
  is_delayed: boolean;
  pr_id: string;
  pr_receipt_date: Date | null;
  rc_po_award_date: Date | null;
  stage_code: number;
  status: string;
  tender_name: string | null;
  total_awarded_amount: string | null;
};

type VendorAwardRow = {
  award_id: string;
  case_id: string;
  entity_id: string;
  po_award_date: Date | null;
  po_number: string | null;
  po_value: string | null;
  po_validity_date: Date | null;
  pr_id: string;
  tender_name: string | null;
  vendor_name: string;
};

type StageTimeSqlRow = {
  average_running_age_days: string | null;
  case_count: number;
  stage_code: number;
};

type ContractExpiryRow = {
  awarded_vendors: string | null;
  days_to_expiry: number;
  entity_id: string;
  rc_po_amount: string | null;
  rc_po_validity_date: Date;
  source_id: string;
  source_type: "case_award" | "manual_plan";
  tender_description: string | null;
  tender_floated_or_not_required: boolean;
};

type SavedViewRow = {
  columns: unknown[];
  filters: Record<string, unknown>;
  id: string;
  is_default: boolean;
  name: string;
  report_code: string;
};

type FilterMetadataRow = {
  completion_fy: string | null;
  completion_month: string | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  owner_full_name: string | null;
  owner_user_id: string | null;
  owner_username: string | null;
  pr_receipt_month: string | null;
  stage_code: number;
  status: string;
  tender_type_id: string | null;
  tender_type_name: string | null;
};
