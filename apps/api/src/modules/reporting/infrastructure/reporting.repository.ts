import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { toDateOnlyString } from "../../../common/utils/date-only.js";
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
  budgetTypeIds?: string[];
  completionFys?: string[];
  completionMonths?: string[];
  cpcInvolved?: boolean;
  dateFrom?: string;
  dateTo?: string;
  delayStatus?: "delayed" | "on_time";
  deletedOnly?: boolean;
  departmentIds?: string[];
  entityIds?: string[];
  limit?: number;
  loiAwarded?: boolean;
  natureOfWorkIds?: string[];
  ownerUserIds?: string[];
  prReceiptMonths?: string[];
  priorityCase?: boolean;
  q?: string;
  stageCodes?: number[];
  status?: "completed" | "running";
  tenderTypeIds?: string[];
  valueSlabs?: string[];
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
          case
            when f.pr_value is null or f.approved_amount is null then null
            else f.pr_value - f.approved_amount
          end,
          case
            when f.estimate_benchmark is null or f.approved_amount is null then null
            else f.estimate_benchmark - f.approved_amount
          end,
          now()
        from procurement.cases c
        left join procurement.case_financials f on f.case_id = c.id
        left join procurement.case_milestones m on m.case_id = c.id
        where c.tenant_id = $1
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
            tenant_id, case_id, case_award_id, entity_id, department_id, owner_user_id,
            tender_description, awarded_vendors, rc_po_amount, rc_po_award_date,
            rc_po_validity_date, tentative_tendering_date,
            tender_floated_or_not_required, source_type, updated_at
          )
          select
            c.tenant_id,
            c.id,
            a.id,
            c.entity_id,
            c.department_id,
            c.owner_user_id,
            coalesce(c.tender_name, c.pr_description),
            a.vendor_name,
            a.po_value,
            a.po_award_date,
            a.po_validity_date,
            a.tentative_tendering_date,
            a.tender_floated_or_not_required,
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
    const caseDeletionPredicate = this.caseDeletionPredicate(filters);
    this.applyScope(where, values, scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, filters);
    const row = await this.db.one<QueryResultRow & AnalyticsRow>(
      `
        select
          count(*)::text as total_cases,
          count(*) filter (where f.status = 'running')::text as running_cases,
          count(*) filter (where f.status = 'completed')::text as completed_cases,
          count(*) filter (where f.is_delayed)::text as delayed_cases,
          coalesce(sum(f.pr_value), 0)::text as total_pr_value,
          coalesce(sum(f.approved_amount), 0)::text as total_approved_amount,
          coalesce(sum(f.total_awarded_amount), 0)::text as total_awarded_amount,
          coalesce(sum(f.savings_wrt_pr), 0)::text as savings_wrt_pr,
          coalesce(sum(f.savings_wrt_estimate), 0)::text as savings_wrt_estimate,
          avg(coalesce(f.completed_age_days, f.running_age_days))::text as average_cycle_time_days
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and ${caseDeletionPredicate}
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
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and ${caseDeletionPredicate}
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
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and ${caseDeletionPredicate}
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
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and ${caseDeletionPredicate}
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
    const caseDeletionPredicate = this.caseDeletionPredicate(input.filters);
    this.applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, input.filters, [
      "c.pr_id",
      "c.tender_no",
      "c.tender_name",
      "c.pr_description",
      "e.code",
      "e.name",
      "dep.name",
      "tt.name",
      "owner.full_name",
      "d.delay_reason",
    ]);
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
          c.pr_description,
          c.tender_no,
          c.tender_name,
          f.entity_id,
          e.code as entity_code,
          e.name as entity_name,
          dep.name as department_name,
          tt.name as tender_type_name,
          owner.full_name as owner_full_name,
          f.status,
          f.stage_code,
          f.desired_stage_code,
          f.is_delayed,
          f.pr_receipt_date,
          f.rc_po_award_date,
          f.completion_fy,
          f.running_age_days,
          f.current_stage_aging_days,
          f.completed_age_days,
          f.pr_value,
          f.estimate_benchmark,
          f.approved_amount,
          f.total_awarded_amount,
          f.savings_wrt_pr,
          f.savings_wrt_estimate,
          case
            when c.tentative_completion_date is null or f.pr_receipt_date is null then null
            when coalesce(f.completed_age_days, f.running_age_days) is null then null
            when greatest((c.tentative_completion_date - f.pr_receipt_date), 1) = 0 then null
            else round((coalesce(f.completed_age_days, f.running_age_days)::numeric / greatest((c.tentative_completion_date - f.pr_receipt_date), 1)) * 100)
          end as percent_time_elapsed,
          m.nit_publish_date,
          m.bidders_participated,
          m.qualified_bidders,
          m.loi_issued,
          m.loi_issued_date,
          d.delay_external_days,
          d.delay_reason,
          c.pr_remarks
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and ${caseDeletionPredicate}
        left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
        left join org.departments dep on dep.id = f.department_id and dep.tenant_id = f.tenant_id
        left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
        left join iam.users owner on owner.id = f.owner_user_id and owner.tenant_id = f.tenant_id
        left join procurement.case_milestones m on m.case_id = f.case_id and m.tenant_id = f.tenant_id
        left join procurement.case_delays d on d.case_id = f.case_id and d.tenant_id = f.tenant_id
        where ${where.join(" and ")}
        order by f.updated_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      approvedAmount: this.numberOrNull(row.approved_amount),
      biddersParticipated: row.bidders_participated,
      caseId: row.case_id,
      completedCycleTimeDays: row.completed_age_days,
      completionFy: row.completion_fy,
      currentStageAgingDays: row.current_stage_aging_days,
      delayReason: row.delay_reason,
      departmentName: row.department_name,
      desiredStageCode: row.desired_stage_code,
      entityCode: row.entity_code,
      entityId: row.entity_id,
      entityName: row.entity_name,
      estimateBenchmark: this.numberOrNull(row.estimate_benchmark),
      isDelayed: row.is_delayed,
      loiAwardDate: this.dateOnly(row.loi_issued_date),
      loiAwarded: row.loi_issued,
      nitPublishDate: this.dateOnly(row.nit_publish_date),
      ownerFullName: row.owner_full_name,
      percentTimeElapsed: this.numberOrNull(row.percent_time_elapsed),
      prId: row.pr_id,
      prDescription: row.pr_description,
      prReceiptDate: this.dateOnly(row.pr_receipt_date),
      prRemarks: row.pr_remarks,
      prValue: this.numberOrNull(row.pr_value),
      qualifiedBidders: row.qualified_bidders,
      rcPoAwardDate: this.dateOnly(row.rc_po_award_date),
      runningAgeDays: row.running_age_days,
      savingsWrtEstimate: this.numberOrNull(row.savings_wrt_estimate),
      savingsWrtPr: this.numberOrNull(row.savings_wrt_pr),
      stageCode: row.stage_code,
      status: row.status,
      tenderName: row.tender_name,
      tenderNo: row.tender_no,
      tenderTypeName: row.tender_type_name,
      totalAwardedAmount: this.numberOrNull(row.total_awarded_amount),
      uncontrollableDelayDays: row.delay_external_days,
    }));
  }

  async vendorAwards(input: {
    filters: ReportFilters;
    scope: ReportScope;
    tenantId: string;
  }): Promise<VendorAwardReportRow[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["a.tenant_id = $1", "a.deleted_at is null"];
    const caseDeletionPredicate = this.caseDeletionPredicate(input.filters);
    this.applyScope(where, values, input.scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, input.filters, [
      "c.pr_id",
      "c.tender_no",
      "c.tender_name",
      "c.pr_description",
      "e.code",
      "e.name",
      "dep.name",
      "owner.full_name",
      "a.vendor_code",
      "a.vendor_name",
      "a.po_number",
    ]);
    values.push(input.filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & VendorAwardRow>(
      `
        select
          a.id as award_id,
          c.id as case_id,
          c.pr_id,
          c.tender_no,
          c.tender_name,
          f.entity_id,
          e.code as entity_code,
          e.name as entity_name,
          dep.name as department_name,
          owner.full_name as owner_full_name,
          f.approved_amount,
          a.vendor_code,
          a.vendor_name,
          a.po_number,
          a.po_value,
          a.po_award_date,
          a.po_validity_date
        from procurement.case_awards a
        join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id and ${caseDeletionPredicate}
        join reporting.case_facts f on f.case_id = c.id and f.tenant_id = c.tenant_id
        left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
        left join org.departments dep on dep.id = f.department_id and dep.tenant_id = f.tenant_id
        left join iam.users owner on owner.id = f.owner_user_id and owner.tenant_id = f.tenant_id
        where ${where.join(" and ")}
        order by a.po_award_date desc nulls last, a.created_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      approvedAmount: this.numberOrNull(row.approved_amount),
      awardId: row.award_id,
      caseId: row.case_id,
      departmentName: row.department_name,
      entityCode: row.entity_code,
      entityId: row.entity_id,
      entityName: row.entity_name,
      ownerFullName: row.owner_full_name,
      poAwardDate: this.dateOnly(row.po_award_date),
      poNumber: row.po_number,
      poValue: this.numberOrNull(row.po_value),
      poValidityDate: this.dateOnly(row.po_validity_date),
      prId: row.pr_id,
      tenderNo: row.tender_no,
      tenderName: row.tender_name,
      vendorCode: row.vendor_code,
      vendorName: row.vendor_name,
    }));
  }

  async stageTime(tenantId: string, scope: ReportScope, filters: ReportFilters): Promise<StageTimeRow[]> {
    const values: unknown[] = [tenantId];
    const where = ["f.tenant_id = $1"];
    const caseDeletionPredicate = this.caseDeletionPredicate(filters);
    this.applyScope(where, values, scope, "f.entity_id", "f.owner_user_id");
    this.applyReportFilters(where, values, filters, [
      "c.pr_id",
      "c.tender_no",
      "c.tender_name",
      "c.pr_description",
      "e.code",
      "e.name",
      "tt.name",
      "owner.full_name",
    ]);
    values.push(filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & StageTimeSqlRow>(
      `
        select
          c.id as case_id,
          c.pr_id,
          c.tender_no,
          c.tender_name,
          f.entity_id,
          e.code as entity_code,
          e.name as entity_name,
          tt.name as tender_type_name,
          owner.full_name as owner_full_name,
          f.priority_case,
          f.stage_code,
          f.running_age_days,
          f.current_stage_aging_days,
          f.completed_age_days as cycle_time_days,
          case
            when f.pr_receipt_date is null or m.nit_initiation_date is null then null
            else m.nit_initiation_date - f.pr_receipt_date
          end as pr_review_time_days,
          case
            when m.nit_publish_date is null then null
            when m.nit_approval_date is not null then m.nit_publish_date - m.nit_approval_date
            when m.nit_initiation_date is not null then m.nit_publish_date - m.nit_initiation_date
            else null
          end as nit_publish_time_days,
          case
            when m.bid_receipt_date is null or m.nit_publish_date is null then null
            else m.bid_receipt_date - m.nit_publish_date
          end as bid_receipt_time_days,
          case
            when m.bid_receipt_date is null then null
            when m.commercial_evaluation_date is null and m.technical_evaluation_date is null then null
            else greatest(
              coalesce(m.commercial_evaluation_date, m.technical_evaluation_date),
              coalesce(m.technical_evaluation_date, m.commercial_evaluation_date)
            ) - m.bid_receipt_date
          end as bid_evaluation_time_days,
          case
            when m.nfa_submission_date is null then null
            when m.commercial_evaluation_date is not null or m.technical_evaluation_date is not null then
              m.nfa_submission_date - greatest(
                coalesce(m.commercial_evaluation_date, m.technical_evaluation_date),
                coalesce(m.technical_evaluation_date, m.commercial_evaluation_date)
              )
            when m.bid_receipt_date is not null then m.nfa_submission_date - m.bid_receipt_date
            else null
          end as negotiation_nfa_submission_time_days,
          case
            when m.nfa_approval_date is null or m.nfa_submission_date is null then null
            else m.nfa_approval_date - m.nfa_submission_date
          end as nfa_approval_time_days,
          case
            when m.rc_po_award_date is null or m.nfa_approval_date is null then null
            else m.rc_po_award_date - m.nfa_approval_date
          end as contract_issuance_time_days,
          coalesce(m.loi_issued, false) as loi_awarded
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and ${caseDeletionPredicate}
        left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
        left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
        left join iam.users owner on owner.id = f.owner_user_id and owner.tenant_id = f.tenant_id
        left join procurement.case_milestones m on m.case_id = f.case_id and m.tenant_id = f.tenant_id
        where ${where.join(" and ")}
        order by f.updated_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      bidEvaluationTimeDays: row.bid_evaluation_time_days,
      bidReceiptTimeDays: row.bid_receipt_time_days,
      caseId: row.case_id,
      contractIssuanceTimeDays: row.contract_issuance_time_days,
      currentStageAgingDays: row.current_stage_aging_days,
      cycleTimeDays: row.cycle_time_days,
      entityCode: row.entity_code,
      entityId: row.entity_id,
      entityName: row.entity_name,
      loiAwarded: row.loi_awarded,
      negotiationNfaSubmissionTimeDays: row.negotiation_nfa_submission_time_days,
      nfaApprovalTimeDays: row.nfa_approval_time_days,
      nitPublishTimeDays: row.nit_publish_time_days,
      ownerFullName: row.owner_full_name,
      prId: row.pr_id,
      prReviewTimeDays: row.pr_review_time_days,
      priorityCase: row.priority_case,
      runningAgeDays: row.running_age_days,
      stageCode: row.stage_code,
      tenderName: row.tender_name,
      tenderNo: row.tender_no,
      tenderTypeName: row.tender_type_name,
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
      this.applyTextSearch(where, values, input.filters.q, ["e.tender_description", "e.awarded_vendors"]);
    }
    values.push(input.filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & ContractExpiryRow>(
      `
        select
          case
            when e.source_type = 'case_award' and e.case_award_id is not null then e.case_award_id
            when e.source_type = 'manual_plan' and e.rc_po_plan_id is not null then e.rc_po_plan_id
            else e.id
          end as source_id,
          e.source_type,
          e.case_id as source_case_id,
          e.entity_id,
          ent.code as entity_code,
          ent.name as entity_name,
          dep.name as department_name,
          owner.full_name as owner_full_name,
          e.tender_description,
          e.awarded_vendors,
          e.rc_po_amount,
          e.rc_po_award_date,
          e.rc_po_validity_date,
          e.tentative_tendering_date,
          e.tender_floated_or_not_required,
          (e.rc_po_validity_date - current_date)::integer as days_to_expiry
        from reporting.contract_expiry_facts e
        left join org.entities ent on ent.id = e.entity_id and ent.tenant_id = e.tenant_id
        left join org.departments dep on dep.id = e.department_id and dep.tenant_id = e.tenant_id
        left join iam.users owner on owner.id = e.owner_user_id and owner.tenant_id = e.tenant_id
        where ${where.join(" and ")}
        order by e.rc_po_validity_date asc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => this.mapContractExpiryRow(row));
  }

  async updateRcPoExpiryRow(input: {
    actorUserId: string;
    sourceId: string;
    sourceType: "case_award" | "manual_plan";
    tenantId: string;
    tenderFloatedOrNotRequired?: boolean | undefined;
    tentativeTenderingDate?: string | null | undefined;
  }): Promise<ContractExpiryReportRow | null> {
    return this.db.transaction(async (client) => {
      if (input.sourceType === "case_award") {
        const fields: Array<[string, unknown]> = [];
        this.pushIfPresent(fields, input, "tentativeTenderingDate", "tentative_tendering_date");
        this.pushIfPresent(fields, input, "tenderFloatedOrNotRequired", "tender_floated_or_not_required");
        if (!fields.length) return this.rcPoExpiryRow(input.tenantId, input.sourceType, input.sourceId, client);
        const values: unknown[] = [input.tenantId, input.sourceId, input.actorUserId];
        const assignments = fields.map(([column, value]) => {
          values.push(value);
          return `${column} = $${values.length}`;
        });
        await this.db.query(
          `
            update procurement.case_awards
            set ${assignments.join(", ")},
                updated_at = now(),
                updated_by = $3
            where tenant_id = $1
              and id = $2
              and deleted_at is null
          `,
          values,
          client,
        );
        await this.refreshContractExpiryFactForAward(input.tenantId, input.sourceId, client);
        return this.rcPoExpiryRow(input.tenantId, input.sourceType, input.sourceId, client);
      }

      const fields: Array<[string, unknown]> = [];
      this.pushIfPresent(fields, input, "tentativeTenderingDate", "tentative_tendering_date");
      this.pushIfPresent(fields, input, "tenderFloatedOrNotRequired", "tender_floated_or_not_required");
      if (!fields.length) return this.rcPoExpiryRow(input.tenantId, input.sourceType, input.sourceId, client);
      const values: unknown[] = [input.tenantId, input.sourceId, input.actorUserId];
      const assignments = fields.map(([column, value]) => {
        values.push(value);
        return `${column} = $${values.length}`;
      });
      await this.db.query(
        `
          update procurement.rc_po_plans
          set ${assignments.join(", ")},
              updated_at = now(),
              updated_by = $3
          where tenant_id = $1
            and id = $2
            and deleted_at is null
        `,
        values,
        client,
      );
      await this.refreshContractExpiryFactForPlan(input.tenantId, input.sourceId, client);
      return this.rcPoExpiryRow(input.tenantId, input.sourceType, input.sourceId, client);
    });
  }

  async rcPoExpiryEditTarget(
    tenantId: string,
    sourceType: "case_award" | "manual_plan",
    sourceId: string,
  ): Promise<{ entityId: string; ownerUserId: string | null } | null> {
    if (sourceType === "case_award") {
      return this.db.one(
        `
          select c.entity_id, c.owner_user_id
          from procurement.case_awards a
          join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id
          where a.tenant_id = $1
            and a.id = $2
            and a.deleted_at is null
        `,
        [tenantId, sourceId],
      );
    }
    return this.db.one(
      `
        select p.entity_id, c.owner_user_id
        from procurement.rc_po_plans p
        left join procurement.cases c on c.id = p.source_case_id and c.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and p.id = $2
          and p.deleted_at is null
      `,
      [tenantId, sourceId],
    );
  }

  private async refreshContractExpiryFactForAward(
    tenantId: string,
    awardId: string,
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      "delete from reporting.contract_expiry_facts where tenant_id = $1 and case_award_id = $2",
      [tenantId, awardId],
      client,
    );
    await this.db.query(
      `
        insert into reporting.contract_expiry_facts (
          tenant_id, case_id, case_award_id, entity_id, department_id, owner_user_id,
          tender_description, awarded_vendors, rc_po_amount, rc_po_award_date,
          rc_po_validity_date, tentative_tendering_date,
          tender_floated_or_not_required, source_type, updated_at
        )
        select
          c.tenant_id,
          c.id,
          a.id,
          c.entity_id,
          c.department_id,
          c.owner_user_id,
          coalesce(c.tender_name, c.pr_description),
          a.vendor_name,
          a.po_value,
          a.po_award_date,
          a.po_validity_date,
          a.tentative_tendering_date,
          a.tender_floated_or_not_required,
          'case_award',
          now()
        from procurement.case_awards a
        join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id and c.deleted_at is null
        where a.tenant_id = $1
          and a.id = $2
          and a.deleted_at is null
          and a.po_validity_date is not null
      `,
      [tenantId, awardId],
      client,
    );
  }

  private async refreshContractExpiryFactForPlan(
    tenantId: string,
    planId: string,
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      "delete from reporting.contract_expiry_facts where tenant_id = $1 and rc_po_plan_id = $2",
      [tenantId, planId],
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
        left join procurement.cases c on c.id = p.source_case_id and c.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and p.id = $2
          and p.deleted_at is null
          and p.rc_po_validity_date is not null
      `,
      [tenantId, planId],
      client,
    );
  }

  private async rcPoExpiryRow(
    tenantId: string,
    sourceType: "case_award" | "manual_plan",
    sourceId: string,
    client: PoolClient,
  ): Promise<ContractExpiryReportRow | null> {
    const result = await this.db.one<QueryResultRow & ContractExpiryRow>(
      `
        select
          case
            when e.source_type = 'case_award' and e.case_award_id is not null then e.case_award_id
            when e.source_type = 'manual_plan' and e.rc_po_plan_id is not null then e.rc_po_plan_id
            else e.id
          end as source_id,
          e.source_type,
          e.case_id as source_case_id,
          e.entity_id,
          ent.code as entity_code,
          ent.name as entity_name,
          dep.name as department_name,
          owner.full_name as owner_full_name,
          e.tender_description,
          e.awarded_vendors,
          e.rc_po_amount,
          e.rc_po_award_date,
          e.rc_po_validity_date,
          e.tentative_tendering_date,
          e.tender_floated_or_not_required,
          (e.rc_po_validity_date - current_date)::integer as days_to_expiry
        from reporting.contract_expiry_facts e
        left join org.entities ent on ent.id = e.entity_id and ent.tenant_id = e.tenant_id
        left join org.departments dep on dep.id = e.department_id and dep.tenant_id = e.tenant_id
        left join iam.users owner on owner.id = e.owner_user_id and owner.tenant_id = e.tenant_id
        where e.tenant_id = $1
          and e.source_type = $2
          and (
            ($2 = 'case_award' and e.case_award_id = $3)
            or ($2 = 'manual_plan' and e.rc_po_plan_id = $3)
          )
      `,
      [tenantId, sourceType, sourceId],
      client,
    );
    return result ? this.mapContractExpiryRow(result) : null;
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
          f.department_id,
          dep.name as department_name,
          f.owner_user_id,
          u.username as owner_username,
          u.full_name as owner_full_name,
          f.tender_type_id,
          tt.name as tender_type_name,
          c.budget_type_id,
          rv_budget.label as budget_type_name,
          c.nature_of_work_id,
          rv_nature.label as nature_of_work_name,
          f.value_slab,
          f.status,
          f.stage_code,
          f.completion_fy,
          to_char(f.pr_receipt_date, 'YYYY-MM') as pr_receipt_month,
          to_char(f.rc_po_award_date, 'YYYY-MM') as completion_month
        from reporting.case_facts f
        join procurement.cases c on c.id = f.case_id and c.tenant_id = f.tenant_id and c.deleted_at is null
        left join org.entities e on e.id = f.entity_id and e.tenant_id = f.tenant_id
        left join org.departments dep on dep.id = f.department_id and dep.tenant_id = f.tenant_id
        left join iam.users u on u.id = f.owner_user_id and u.tenant_id = f.tenant_id
        left join catalog.tender_types tt on tt.id = f.tender_type_id and tt.tenant_id = f.tenant_id
        left join catalog.reference_values rv_budget on rv_budget.id = c.budget_type_id and rv_budget.tenant_id = c.tenant_id
        left join catalog.reference_values rv_nature on rv_nature.id = c.nature_of_work_id and rv_nature.tenant_id = c.tenant_id
        where ${where.join(" and ")}
        order by f.status asc, f.stage_code asc
      `,
      values,
    );
    const entities = new Map<string, { code: string | null; id: string; name: string | null }>();
    const owners = new Map<string, { fullName: string | null; id: string; username: string | null }>();
    const tenderTypes = new Map<string, { id: string; name: string }>();
    const departments = new Map<string, { id: string; name: string }>();
    const budgetTypes = new Map<string, { id: string; name: string }>();
    const natureOfWorks = new Map<string, { id: string; name: string }>();
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
      if (row.department_id) {
        departments.set(row.department_id, { id: row.department_id, name: row.department_name ?? "Unspecified" });
      }
      if (row.budget_type_id) {
        budgetTypes.set(row.budget_type_id, { id: row.budget_type_id, name: row.budget_type_name ?? "Unspecified" });
      }
      if (row.nature_of_work_id) {
        natureOfWorks.set(row.nature_of_work_id, { id: row.nature_of_work_id, name: row.nature_of_work_name ?? "Unspecified" });
      }
    }
    return {
      budgetTypes: [...budgetTypes.values()].sort((left, right) => left.name.localeCompare(right.name)),
      completionFys: [...new Set(result.rows.map((row) => row.completion_fy).filter(Boolean))].sort(),
      completionMonths: [...new Set(result.rows.map((row) => row.completion_month).filter(Boolean))].sort(),
      departments: [...departments.values()].sort((left, right) => left.name.localeCompare(right.name)),
      entities: [...entities.values()].sort((left, right) =>
        (left.code ?? left.name ?? left.id).localeCompare(right.code ?? right.name ?? right.id),
      ),
      entityIds: [...entities.keys()],
      natureOfWorks: [...natureOfWorks.values()].sort((left, right) => left.name.localeCompare(right.name)),
      owners: [...owners.values()].sort((left, right) =>
        (left.fullName ?? left.username ?? left.id).localeCompare(right.fullName ?? right.username ?? right.id),
      ),
      prReceiptMonths: [...new Set(result.rows.map((row) => row.pr_receipt_month).filter(Boolean))].sort(),
      stages: [...new Set(result.rows.map((row) => row.stage_code))],
      statuses: [...new Set(result.rows.map((row) => row.status))],
      tenderTypes: [...tenderTypes.values()].sort((left, right) => left.name.localeCompare(right.name)),
      valueSlabs: [...new Set(result.rows.map((row) => row.value_slab).filter(Boolean))].sort(),
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

  async getExportJob(tenantId: string, userId: string, jobId: string) {
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
          and created_by = $3
      `,
      [tenantId, jobId, userId],
    );
  }

  async listExportJobs(tenantId: string, userId: string, limit = 100) {
    return this.db.query<
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
        selected_count: number;
        status: string;
      }
    >(
      `
        select
          id, report_code, format, status, progress_percent, progress_message,
          file_asset_id, created_at, completed_at, expires_at,
          case
            when jsonb_typeof(filters->'selectedIds') = 'array'
              then jsonb_array_length(filters->'selectedIds')
            else 0
          end as selected_count
        from ops.export_jobs
        where tenant_id = $1
          and created_by = $2
        order by created_at desc
        limit $3
      `,
      [tenantId, userId, limit],
    );
  }

  async getExportFile(tenantId: string, userId: string, jobId: string) {
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
          and j.created_by = $3
          and j.status = 'completed'
          and (j.expires_at is null or j.expires_at > now())
      `,
      [tenantId, jobId, userId],
    );
  }

  private applyReportFilters(
    where: string[],
    values: unknown[],
    filters: ReportFilters,
    searchColumns = ["c.pr_id", "c.tender_no", "c.tender_name", "c.pr_description"],
  ) {
    if (filters.status) {
      values.push(filters.status);
      where.push(`f.status = $${values.length}`);
    }
    this.applyEntityFilter(where, values, filters, "f.entity_id");
    this.applyUuidArrayFilter(where, values, filters.departmentIds, "f.department_id");
    this.applyUuidArrayFilter(where, values, filters.ownerUserIds, "f.owner_user_id");
    this.applyUuidArrayFilter(where, values, filters.tenderTypeIds, "f.tender_type_id");
    this.applyUuidArrayFilter(where, values, filters.budgetTypeIds, "c.budget_type_id");
    this.applyUuidArrayFilter(where, values, filters.natureOfWorkIds, "c.nature_of_work_id");
    if (filters.stageCodes?.length) {
      values.push(filters.stageCodes);
      where.push(`f.stage_code = any($${values.length}::int[])`);
    }
    if (filters.valueSlabs?.length) {
      values.push(filters.valueSlabs);
      where.push(`f.value_slab = any($${values.length}::text[])`);
    }
    if (filters.delayStatus) {
      where.push(filters.delayStatus === "delayed" ? "f.is_delayed" : "not f.is_delayed");
    }
    if (filters.loiAwarded !== undefined) {
      values.push(filters.loiAwarded);
      where.push(`exists (
        select 1 from procurement.case_milestones m_filter
        where m_filter.case_id = f.case_id
          and m_filter.tenant_id = f.tenant_id
          and m_filter.loi_issued = $${values.length}
      )`);
    }
    if (filters.cpcInvolved !== undefined) {
      values.push(filters.cpcInvolved);
      where.push(`f.cpc_involved = $${values.length}`);
    }
    if (filters.priorityCase !== undefined) {
      values.push(filters.priorityCase);
      where.push(`f.priority_case = $${values.length}`);
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
      this.applyTextSearch(where, values, filters.q, searchColumns);
    }
  }

  private applyTextSearch(where: string[], values: unknown[], query: string, columns: string[]) {
    const trimmed = query.trim();
    if (!trimmed) return;
    values.push(`%${trimmed.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    const position = values.length;
    where.push(`(${columns.map((column) => `coalesce(${column}, '') ilike $${position} escape '\\'`).join(" or ")})`);
  }

  private caseDeletionPredicate(filters: Pick<ReportFilters, "deletedOnly">) {
    return filters.deletedOnly ? "c.deleted_at is not null" : "c.deleted_at is null";
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

  private dateOnly(value: Date | string | null): string | null {
    return toDateOnlyString(value);
  }

  private numberOrNull(value: string | number | null): number | null {
    if (value == null) return null;
    return typeof value === "number" ? value : Number(value);
  }

  private pushIfPresent<T extends Record<string, unknown>>(
    fields: Array<[string, unknown]>,
    input: T,
    key: keyof T,
    column: string,
  ) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      fields.push([column, input[key]]);
    }
  }

  private mapContractExpiryRow(row: ContractExpiryRow): ContractExpiryReportRow {
    return {
      awardedVendors: row.awarded_vendors,
      departmentName: row.department_name,
      daysToExpiry: row.days_to_expiry,
      entityCode: row.entity_code,
      entityId: row.entity_id,
      entityName: row.entity_name,
      ownerFullName: row.owner_full_name,
      rcPoAwardDate: this.dateOnly(row.rc_po_award_date),
      rcPoAmount: this.numberOrNull(row.rc_po_amount),
      rcPoValidityDate: this.dateOnly(row.rc_po_validity_date) ?? "",
      sourceCaseId: row.source_case_id,
      sourceId: row.source_id,
      sourceType: row.source_type,
      tenderDescription: row.tender_description,
      tenderFloatedOrNotRequired: row.tender_floated_or_not_required,
      tentativeTenderingDate: this.dateOnly(row.tentative_tendering_date),
    };
  }

  private mapAnalyticsResult(
    row: AnalyticsRow | null,
    bidderRow: AnalyticsBidderRow | null,
    entityRows: AnalyticsEntityRow[],
    tenderTypeRows: AnalyticsTenderTypeRow[],
  ) {
    return {
      averageBiddersParticipated: this.numberOrNull(nullable(rowValue(bidderRow, "average_bidders_participated"))),
      averageCycleTimeDays: this.numberOrNull(nullable(rowValue(row, "average_cycle_time_days"))),
      averageQualifiedBidders: this.numberOrNull(nullable(rowValue(bidderRow, "average_qualified_bidders"))),
      bidderCaseCount: Number(rowValue(bidderRow, "bidder_case_count", "0")),
      byEntity: entityRows.map(mapAnalyticsEntityRow),
      byTenderType: tenderTypeRows.map(mapAnalyticsTenderTypeRow),
      completedCases: Number(rowValue(row, "completed_cases", "0")),
      delayedCases: Number(rowValue(row, "delayed_cases", "0")),
      runningCases: Number(rowValue(row, "running_cases", "0")),
      savingsWrtEstimate: Number(rowValue(row, "savings_wrt_estimate", "0")),
      savingsWrtPr: Number(rowValue(row, "savings_wrt_pr", "0")),
      totalApprovedAmount: Number(rowValue(row, "total_approved_amount", "0")),
      totalAwardedAmount: Number(rowValue(row, "total_awarded_amount", "0")),
      totalCases: Number(rowValue(row, "total_cases", "0")),
      totalPrValue: Number(rowValue(row, "total_pr_value", "0")),
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
  average_cycle_time_days: string | null;
  completed_cases: string;
  delayed_cases: string;
  running_cases: string;
  savings_wrt_estimate: string;
  savings_wrt_pr: string;
  total_approved_amount: string;
  total_awarded_amount: string;
  total_cases: string;
  total_pr_value: string;
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
  approved_amount: string | null;
  bidders_participated: number | null;
  case_id: string;
  completed_age_days: number | null;
  completion_fy: string | null;
  current_stage_aging_days: number | null;
  delay_reason: string | null;
  department_name: string | null;
  desired_stage_code: number | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  estimate_benchmark: string | null;
  is_delayed: boolean;
  loi_issued: boolean;
  loi_issued_date: Date | null;
  nit_publish_date: Date | null;
  owner_full_name: string | null;
  percent_time_elapsed: string | null;
  pr_description: string | null;
  pr_id: string;
  pr_remarks: string | null;
  pr_receipt_date: Date | null;
  pr_value: string | null;
  qualified_bidders: number | null;
  rc_po_award_date: Date | null;
  running_age_days: number | null;
  savings_wrt_estimate: string | null;
  savings_wrt_pr: string | null;
  stage_code: number;
  status: string;
  tender_name: string | null;
  tender_no: string | null;
  tender_type_name: string | null;
  total_awarded_amount: string | null;
  delay_external_days: number | null;
};

type VendorAwardRow = {
  approved_amount: string | null;
  award_id: string;
  case_id: string;
  department_name: string | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  owner_full_name: string | null;
  po_award_date: Date | null;
  po_number: string | null;
  po_value: string | null;
  po_validity_date: Date | null;
  pr_id: string;
  tender_no: string | null;
  tender_name: string | null;
  vendor_code: string | null;
  vendor_name: string;
};

type StageTimeSqlRow = {
  bid_evaluation_time_days: number | null;
  bid_receipt_time_days: number | null;
  case_id: string;
  contract_issuance_time_days: number | null;
  current_stage_aging_days: number | null;
  cycle_time_days: number | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  loi_awarded: boolean;
  negotiation_nfa_submission_time_days: number | null;
  nfa_approval_time_days: number | null;
  nit_publish_time_days: number | null;
  owner_full_name: string | null;
  pr_id: string;
  pr_review_time_days: number | null;
  priority_case: boolean;
  running_age_days: number | null;
  stage_code: number;
  tender_name: string | null;
  tender_no: string | null;
  tender_type_name: string | null;
};

type ContractExpiryRow = {
  awarded_vendors: string | null;
  department_name: string | null;
  days_to_expiry: number;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  owner_full_name: string | null;
  rc_po_award_date: Date | null;
  rc_po_amount: string | null;
  rc_po_validity_date: Date;
  source_case_id: string | null;
  source_id: string;
  source_type: "case_award" | "manual_plan";
  tender_description: string | null;
  tender_floated_or_not_required: boolean;
  tentative_tendering_date: Date | null;
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
  budget_type_id: string | null;
  budget_type_name: string | null;
  completion_fy: string | null;
  completion_month: string | null;
  department_id: string | null;
  department_name: string | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  nature_of_work_id: string | null;
  nature_of_work_name: string | null;
  owner_full_name: string | null;
  owner_user_id: string | null;
  owner_username: string | null;
  pr_receipt_month: string | null;
  stage_code: number;
  status: string;
  tender_type_id: string | null;
  tender_type_name: string | null;
  value_slab: string | null;
};
