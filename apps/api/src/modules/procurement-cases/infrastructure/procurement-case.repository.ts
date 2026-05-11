import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";
import { toDateOnlyString } from "../../../common/utils/date-only.js";
import type {
  CaseDelay,
  CaseFinancials,
  CaseMilestones,
  ProcurementCaseAggregate,
} from "../domain/case-aggregate.js";

export type CaseListFilters = {
  budgetTypeIds?: string[];
  cpcInvolved?: boolean;
  dateFrom?: string;
  dateTo?: string;
  departmentIds?: string[];
  entityIds?: string[];
  isDelayed?: boolean;
  natureOfWorkIds?: string[];
  ownerUserId?: string;
  priorityCase?: boolean;
  q?: string;
  status?: "running" | "completed";
  tenderTypeIds?: string[];
  valueSlab?: "10l_1cr" | "1cr_10cr" | "gte_10cr" | "lt_10l";
};

export type CaseListScope = {
  actorUserId: string;
  assignedOnly: boolean;
  entityIds: string[];
  tenantWide: boolean;
};

export type CaseListItem = {
  cpcInvolved: boolean | null;
  entityId: string;
  id: string;
  prDescription: string | null;
  prId: string;
  prReceiptDate: string | null;
  priorityCase: boolean;
  isDelayed: boolean;
  status: string;
  stageCode: number;
  tenderName: string | null;
  tentativeCompletionDate: string | null;
  updatedAt: string;
};

export type DeletedCaseListItem = CaseListItem & {
  deletedAt: string;
  deleteReason: string | null;
};

type CaseListCursor = {
  id: string;
  timestamp: string;
};

@Injectable()
export class ProcurementCaseRepository {
  constructor(private readonly db: DatabaseService) {}

  async createCase(
    input: {
      actorUserId: string;
      cpcInvolved?: boolean | null;
      departmentId?: string | null;
      desiredStageCode: number | null;
      entityId: string;
      financials: CaseFinancials;
      isDelayed: boolean;
      natureOfWorkId?: string | null;
      ownerUserId?: string | null;
      prDescription?: string | null;
      prId: string;
      prReceiptDate?: string | null;
      prRemarks?: string | null;
      prSchemeNo?: string | null;
      priorityCase: boolean;
      budgetTypeId?: string | null;
      prReceivingMediumId?: string | null;
      stageCode: number;
      status: "running" | "completed";
      tenantId: string;
      tenderTypeId?: string | null;
      tentativeCompletionDate?: string | null;
    },
    client?: PoolClient,
  ): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into procurement.cases (
          tenant_id, pr_id, entity_id, department_id, tender_type_id,
          pr_receiving_medium_id, budget_type_id, nature_of_work_id,
          owner_user_id, created_by, status, stage_code, desired_stage_code,
          is_delayed, priority_case, cpc_involved, pr_scheme_no,
          pr_receipt_date, pr_description, pr_remarks, tentative_completion_date
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        returning id
      `,
      [
        input.tenantId,
        input.prId,
        input.entityId,
        nullable(input.departmentId),
        nullable(input.tenderTypeId),
        nullable(input.prReceivingMediumId),
        nullable(input.budgetTypeId),
        nullable(input.natureOfWorkId),
        nullable(input.ownerUserId),
        input.actorUserId,
        input.status,
        input.stageCode,
        input.desiredStageCode,
        input.isDelayed,
        input.priorityCase,
        nullable(input.cpcInvolved),
        nullable(input.prSchemeNo),
        nullable(input.prReceiptDate),
        nullable(input.prDescription),
        nullable(input.prRemarks),
        nullable(input.tentativeCompletionDate),
      ],
      client,
    );

    if (!row) throw new Error("Failed to create case.");

    await this.upsertFinancials(row.id, input.tenantId, input.financials, client);
    await this.upsertMilestones(row.id, input.tenantId, {}, client);
    await this.upsertDelay(row.id, input.tenantId, {}, input.actorUserId, client);
    return { id: row.id };
  }

  async updateCase(
    input: {
      caseId: string;
      tenantId: string;
      updatedBy: string;
      prDescription?: string | null;
      prRemarks?: string | null;
      prSchemeNo?: string | null;
      tenderName?: string | null;
      tenderNo?: string | null;
      tmRemarks?: string | null;
      tentativeCompletionDate?: string | null;
      desiredStageCode?: number | null;
      isDelayed?: boolean;
      financials?: CaseFinancials;
      priorityCase?: boolean;
    },
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        update procurement.cases
        set pr_description = coalesce($3, pr_description),
            pr_remarks = coalesce($4, pr_remarks),
            pr_scheme_no = coalesce($5, pr_scheme_no),
            tender_name = coalesce($6, tender_name),
            tender_no = coalesce($7, tender_no),
            tm_remarks = coalesce($8, tm_remarks),
            priority_case = coalesce($9, priority_case),
            tentative_completion_date = coalesce($10, tentative_completion_date),
            desired_stage_code = coalesce($11, desired_stage_code),
            is_delayed = coalesce($12, is_delayed),
            version = version + 1,
            updated_at = now(),
            updated_by = $13
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [
        input.caseId,
        input.tenantId,
        input.prDescription ?? null,
        input.prRemarks ?? null,
        input.prSchemeNo ?? null,
        input.tenderName ?? null,
        input.tenderNo ?? null,
        input.tmRemarks ?? null,
        input.priorityCase ?? null,
        input.tentativeCompletionDate ?? null,
        input.desiredStageCode ?? null,
        input.isDelayed ?? null,
        input.updatedBy,
      ],
      client,
    );

    if (input.financials) {
      await this.upsertFinancials(input.caseId, input.tenantId, input.financials, client);
    }
  }

  async updateAssignment(input: {
    caseId: string;
    ownerUserId: string;
    tenantId: string;
    updatedBy: string;
  }): Promise<void> {
    await this.db.query(
      `
        update procurement.cases
        set owner_user_id = $3,
            version = version + 1,
            updated_at = now(),
            updated_by = $4
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [input.caseId, input.tenantId, input.ownerUserId, input.updatedBy],
    );
  }

  async updateMilestones(input: {
    caseId: string;
    desiredStageCode: number | null;
    isDelayed: boolean;
    milestones: CaseMilestones;
    stageCode: number;
    status: "running" | "completed";
    tenantId: string;
    updatedBy: string;
  }): Promise<void> {
    await this.db.transaction(async (client) => {
      await this.upsertMilestones(input.caseId, input.tenantId, input.milestones, client);
      await this.db.query(
        `
          update procurement.cases
          set status = $3,
              stage_code = $4,
              desired_stage_code = $5,
              is_delayed = $6,
              version = version + 1,
              updated_at = now(),
              updated_by = $7
          where id = $1
            and tenant_id = $2
            and deleted_at is null
        `,
        [
          input.caseId,
          input.tenantId,
          input.status,
          input.stageCode,
          input.desiredStageCode,
          input.isDelayed,
          input.updatedBy,
        ],
        client,
      );
    });
  }

  async updateDelay(input: {
    caseId: string;
    delay: CaseDelay;
    tenantId: string;
    updatedBy: string;
  }): Promise<void> {
    await this.upsertDelay(input.caseId, input.tenantId, input.delay, input.updatedBy);
  }

  async softDelete(input: {
    caseId: string;
    deletedBy: string;
    deleteReason?: string | null;
    tenantId: string;
  }): Promise<void> {
    await this.db.query(
      `
        update procurement.cases
        set deleted_at = now(),
            deleted_by = $3,
            delete_reason = $4,
            updated_at = now(),
            updated_by = $3
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [input.caseId, input.tenantId, input.deletedBy, input.deleteReason ?? null],
    );
  }

  async restore(input: {
    caseId: string;
    tenantId: string;
    updatedBy: string;
  }): Promise<"already_active" | "duplicate_active_case" | "not_found" | "restored"> {
    const row = await this.db.one<QueryResultRow & { outcome: string }>(
      `
        with target as (
          select id, tenant_id, pr_id, deleted_at
          from procurement.cases
          where id = $1
            and tenant_id = $2
        ),
        active_duplicate as (
          select 1
          from procurement.cases c
          join target t on t.tenant_id = c.tenant_id and t.pr_id = c.pr_id
          where c.id <> t.id
            and c.deleted_at is null
          limit 1
        ),
        restored as (
          update procurement.cases c
          set deleted_at = null,
              deleted_by = null,
              delete_reason = null,
              updated_at = now(),
              updated_by = $3
          where c.id = $1
            and c.tenant_id = $2
            and c.deleted_at is not null
            and not exists (select 1 from active_duplicate)
          returning c.id
        )
        select case
          when exists (select 1 from restored) then 'restored'
          when not exists (select 1 from target) then 'not_found'
          when exists (select 1 from target where deleted_at is null) then 'already_active'
          when exists (select 1 from active_duplicate) then 'duplicate_active_case'
          else 'not_found'
        end as outcome
      `,
      [input.caseId, input.tenantId, input.updatedBy],
    );

    if (
      row?.outcome === "restored" ||
      row?.outcome === "not_found" ||
      row?.outcome === "already_active" ||
      row?.outcome === "duplicate_active_case"
    ) {
      return row.outcome;
    }

    return "not_found";
  }

  async getCase(tenantId: string, caseId: string): Promise<ProcurementCaseAggregate | null> {
    const row = await this.db.one<QueryResultRow & CaseAggregateRow>(
      this.caseDetailSql("c.id = $2"),
      [tenantId, caseId],
    );
    return row ? this.mapAggregate(row) : null;
  }

  async listCases(input: {
    cursor?: CaseListCursor | undefined;
    filters: CaseListFilters;
    limit: number;
    scope: CaseListScope;
    tenantId: string;
  }): Promise<CaseListItem[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["c.tenant_id = $1", "c.deleted_at is null"];

    applyCaseScope(where, values, input.scope, "c.entity_id", "c.owner_user_id");
    applyCaseListFilters(where, values, input.filters);
    this.applyValueSlabFilter(where, values, input.filters.valueSlab);
    applyCaseSearchFilter(where, values, input.filters.q);
    if (input.cursor) {
      values.push(input.cursor.timestamp);
      const timestampPosition = values.length;
      values.push(input.cursor.id);
      const idPosition = values.length;
      where.push(`(c.updated_at, c.id) < ($${timestampPosition}::timestamptz, $${idPosition}::uuid)`);
    }

    values.push(input.limit);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & CaseListRow>(
      `
        select
          c.id,
          c.cpc_involved,
          c.entity_id,
          c.pr_id,
          c.pr_description,
          c.pr_receipt_date,
          c.is_delayed,
          c.priority_case,
          c.status,
          c.stage_code,
          c.tender_name,
          c.tentative_completion_date,
          c.updated_at
        from procurement.cases c
        left join procurement.case_financials f on f.case_id = c.id and f.tenant_id = c.tenant_id
        where ${where.join(" and ")}
        order by c.updated_at desc, c.id desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      cpcInvolved: row.cpc_involved,
      entityId: row.entity_id,
      id: row.id,
      prId: row.pr_id,
      prDescription: row.pr_description,
      prReceiptDate: this.dateOnly(row.pr_receipt_date),
      isDelayed: row.is_delayed,
      priorityCase: row.priority_case,
      status: row.status,
      stageCode: row.stage_code,
      tenderName: row.tender_name,
      tentativeCompletionDate: this.dateOnly(row.tentative_completion_date),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listDeletedCases(input: {
    cursor?: CaseListCursor | undefined;
    filters: Pick<CaseListFilters, "q" | "status">;
    limit: number;
    tenantId: string;
  }): Promise<DeletedCaseListItem[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["c.tenant_id = $1", "c.deleted_at is not null"];

    if (input.filters.status) {
      values.push(input.filters.status);
      where.push(`c.status = $${values.length}`);
    }
    if (input.filters.q) {
      values.push(input.filters.q);
      where.push(`
        to_tsvector(
          'english',
          coalesce(c.pr_id, '') || ' ' ||
          coalesce(c.pr_description, '') || ' ' ||
          coalesce(c.tender_name, '') || ' ' ||
          coalesce(c.tender_no, '')
        ) @@ plainto_tsquery('english', $${values.length})
      `);
    }
    if (input.cursor) {
      values.push(input.cursor.timestamp);
      const timestampPosition = values.length;
      values.push(input.cursor.id);
      const idPosition = values.length;
      where.push(`(c.deleted_at, c.id) < ($${timestampPosition}::timestamptz, $${idPosition}::uuid)`);
    }

    values.push(input.limit);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & (CaseListRow & DeletedCaseListRow)>(
      `
        select
          c.id,
          c.cpc_involved,
          c.entity_id,
          c.pr_id,
          c.pr_description,
          c.pr_receipt_date,
          c.is_delayed,
          c.priority_case,
          c.status,
          c.stage_code,
          c.tender_name,
          c.tentative_completion_date,
          c.updated_at,
          c.deleted_at,
          c.delete_reason
        from procurement.cases c
        where ${where.join(" and ")}
        order by c.deleted_at desc, c.id desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => ({
      cpcInvolved: row.cpc_involved,
      entityId: row.entity_id,
      id: row.id,
      prId: row.pr_id,
      prDescription: row.pr_description,
      prReceiptDate: this.dateOnly(row.pr_receipt_date),
      isDelayed: row.is_delayed,
      priorityCase: row.priority_case,
      status: row.status,
      stageCode: row.stage_code,
      tenderName: row.tender_name,
      tentativeCompletionDate: this.dateOnly(row.tentative_completion_date),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at.toISOString(),
      deleteReason: row.delete_reason,
    }));
  }

  async summary(tenantId: string, scope: CaseListScope) {
    const values: unknown[] = [tenantId];
    const where = ["tenant_id = $1", "deleted_at is null"];
    applyCaseScope(where, values, scope, "entity_id", "owner_user_id");
    const row = await this.db.one<
      QueryResultRow & {
        completed_count: string;
        delayed_count: string;
        priority_count: string;
        risk_count: string;
        running_count: string;
        total_count: string;
      }
    >(
      `
        select
          count(*)::text as total_count,
          count(*) filter (where status = 'running')::text as running_count,
          count(*) filter (where status = 'completed')::text as completed_count,
          count(*) filter (where status = 'running' and is_delayed)::text as delayed_count,
          count(*) filter (where status = 'running' and priority_case)::text as priority_count,
          count(*) filter (where status = 'running' and (is_delayed or priority_case))::text as risk_count
        from procurement.cases
        where ${where.join(" and ")}
      `,
      values,
    );

    return {
      completed: Number(row?.completed_count ?? 0),
      delayed: Number(row?.delayed_count ?? 0),
      priority: Number(row?.priority_count ?? 0),
      risk: Number(row?.risk_count ?? 0),
      running: Number(row?.running_count ?? 0),
      total: Number(row?.total_count ?? 0),
    };
  }

  async getUserEntityScopes(userId: string): Promise<string[]> {
    const result = await this.db.query<QueryResultRow & { entity_id: string }>(
      `
        select entity_id
        from iam.user_entity_scopes
        where user_id = $1
      `,
      [userId],
    );
    return result.rows.map((row) => row.entity_id);
  }

  async getCaseOwnerEntityScopes(userId: string, tenantId: string): Promise<string[]> {
    const result = await this.db.query<QueryResultRow & { entity_id: string }>(
      `
        select ues.entity_id
        from iam.user_entity_scopes ues
        join iam.users u on u.id = ues.user_id
        where ues.user_id = $1
          and u.tenant_id = $2
          and u.status = 'active'
          and u.deleted_at is null
      `,
      [userId, tenantId],
    );
    return result.rows.map((row) => row.entity_id);
  }

  private async upsertFinancials(
    caseId: string,
    tenantId: string,
    financials: CaseFinancials,
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        insert into procurement.case_financials (
          case_id, tenant_id, pr_value, estimate_benchmark, approved_amount, savings_wrt_pr, savings_wrt_estimate
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          case when $3::numeric is null or $5::numeric is null then null else $3::numeric - $5::numeric end,
          case when $4::numeric is null or $5::numeric is null then null else $4::numeric - $5::numeric end
        )
        on conflict (case_id) do update
        set pr_value = coalesce(excluded.pr_value, procurement.case_financials.pr_value),
            estimate_benchmark = coalesce(
              excluded.estimate_benchmark,
              procurement.case_financials.estimate_benchmark
            ),
            approved_amount = coalesce(
              excluded.approved_amount,
              procurement.case_financials.approved_amount
            ),
            savings_wrt_pr = case
              when coalesce(excluded.pr_value, procurement.case_financials.pr_value) is null
                or coalesce(excluded.approved_amount, procurement.case_financials.approved_amount) is null
                then null
              else coalesce(excluded.pr_value, procurement.case_financials.pr_value)
                - coalesce(excluded.approved_amount, procurement.case_financials.approved_amount)
            end,
            savings_wrt_estimate = case
              when coalesce(excluded.estimate_benchmark, procurement.case_financials.estimate_benchmark) is null
                or coalesce(excluded.approved_amount, procurement.case_financials.approved_amount) is null
                then null
              else coalesce(excluded.estimate_benchmark, procurement.case_financials.estimate_benchmark)
                - coalesce(excluded.approved_amount, procurement.case_financials.approved_amount)
            end,
            updated_at = now()
      `,
      [
        caseId,
        tenantId,
        financials.prValue ?? null,
        financials.estimateBenchmark ?? null,
        financials.approvedAmount ?? null,
      ],
      client,
    );
  }

  private async upsertMilestones(
    caseId: string,
    tenantId: string,
    milestones: CaseMilestones,
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        insert into procurement.case_milestones (
          case_id, tenant_id, nit_initiation_date, nit_approval_date,
          nit_publish_date, bid_receipt_date, bidders_participated,
          commercial_evaluation_date, technical_evaluation_date, qualified_bidders,
          nfa_submission_date, nfa_approval_date, loi_issued, loi_issued_date,
          rc_po_award_date, rc_po_validity
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        on conflict (case_id) do update
        set nit_initiation_date = excluded.nit_initiation_date,
            nit_approval_date = excluded.nit_approval_date,
            nit_publish_date = excluded.nit_publish_date,
            bid_receipt_date = excluded.bid_receipt_date,
            bidders_participated = excluded.bidders_participated,
            commercial_evaluation_date = excluded.commercial_evaluation_date,
            technical_evaluation_date = excluded.technical_evaluation_date,
            qualified_bidders = excluded.qualified_bidders,
            nfa_submission_date = excluded.nfa_submission_date,
            nfa_approval_date = excluded.nfa_approval_date,
            loi_issued = excluded.loi_issued,
            loi_issued_date = excluded.loi_issued_date,
            rc_po_award_date = excluded.rc_po_award_date,
            rc_po_validity = excluded.rc_po_validity,
            updated_at = now()
      `,
      [
        caseId,
        tenantId,
        nullable(milestones.nitInitiationDate),
        nullable(milestones.nitApprovalDate),
        nullable(milestones.nitPublishDate),
        nullable(milestones.bidReceiptDate),
        nullable(milestones.biddersParticipated),
        nullable(milestones.commercialEvaluationDate),
        nullable(milestones.technicalEvaluationDate),
        nullable(milestones.qualifiedBidders),
        nullable(milestones.nfaSubmissionDate),
        nullable(milestones.nfaApprovalDate),
        milestones.loiIssued === true,
        nullable(milestones.loiIssuedDate),
        nullable(milestones.rcPoAwardDate),
        nullable(milestones.rcPoValidity),
      ],
      client,
    );
  }

  private async upsertDelay(
    caseId: string,
    tenantId: string,
    delay: CaseDelay,
    updatedBy?: string,
    client?: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        insert into procurement.case_delays (
          case_id, tenant_id, delay_external_days, delay_reason, updated_by
        )
        values ($1, $2, $3, $4, $5)
        on conflict (case_id) do update
        set delay_external_days = excluded.delay_external_days,
            delay_reason = excluded.delay_reason,
            updated_by = excluded.updated_by,
            updated_at = now()
      `,
      [
        caseId,
        tenantId,
        delay.delayExternalDays ?? null,
        delay.delayReason ?? null,
        updatedBy ?? null,
      ],
      client,
    );
  }

  private caseDetailSql(predicate: string): string {
    return `
      select
        c.id,
        c.tenant_id,
        c.pr_id,
        c.entity_id,
        c.department_id,
        c.owner_user_id,
        c.status,
        c.stage_code,
        c.desired_stage_code,
        c.is_delayed,
        c.priority_case,
        c.cpc_involved,
        c.pr_description,
        c.pr_remarks,
        c.pr_scheme_no,
        c.pr_receipt_date,
        c.tender_name,
        c.tender_no,
        c.tentative_completion_date,
        c.tm_remarks,
        c.created_at,
        c.updated_at,
        f.pr_value,
        f.estimate_benchmark,
        f.approved_amount,
        f.total_awarded_amount,
        f.savings_wrt_pr,
        f.savings_wrt_estimate,
        m.nit_initiation_date,
        m.nit_approval_date,
        m.nit_publish_date,
        m.bid_receipt_date,
        m.bidders_participated,
        m.commercial_evaluation_date,
        m.technical_evaluation_date,
        m.qualified_bidders,
        m.nfa_submission_date,
        m.nfa_approval_date,
        m.loi_issued,
        m.loi_issued_date,
        m.rc_po_award_date,
        m.rc_po_validity,
        d.delay_external_days,
        d.delay_reason,
        dep.name as department_name,
        owner.full_name as owner_full_name,
        rv_budget.label as budget_type_label,
        rv_nature.label as nature_of_work_label,
        rv_medium.label as pr_receiving_medium_label,
        tt.name as tender_type_name
      from procurement.cases c
      left join procurement.case_financials f on f.case_id = c.id
      left join procurement.case_milestones m on m.case_id = c.id
      left join procurement.case_delays d on d.case_id = c.id
      left join org.departments dep on dep.id = c.department_id
      left join iam.users owner on owner.id = c.owner_user_id
      left join catalog.reference_values rv_budget on rv_budget.id = c.budget_type_id
      left join catalog.reference_values rv_nature on rv_nature.id = c.nature_of_work_id
      left join catalog.reference_values rv_medium on rv_medium.id = c.pr_receiving_medium_id
      left join catalog.tender_types tt on tt.id = c.tender_type_id
      where c.tenant_id = $1
        and c.deleted_at is null
        and ${predicate}
    `;
  }

  private mapAggregate(row: CaseAggregateRow): ProcurementCaseAggregate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      prId: row.pr_id,
      entityId: row.entity_id,
      departmentId: row.department_id,
      departmentName: row.department_name,
      ownerUserId: row.owner_user_id,
      ownerFullName: row.owner_full_name,
      status: row.status,
      stageCode: row.stage_code,
      desiredStageCode: row.desired_stage_code,
      isDelayed: row.is_delayed,
      priorityCase: row.priority_case,
      cpcInvolved: row.cpc_involved,
      prDescription: row.pr_description,
      prRemarks: row.pr_remarks,
      prSchemeNo: row.pr_scheme_no,
      prReceiptDate: this.dateOnly(row.pr_receipt_date),
      tenderName: row.tender_name,
      tenderNo: row.tender_no,
      tentativeCompletionDate: this.dateOnly(row.tentative_completion_date),
      tmRemarks: row.tm_remarks,
      budgetTypeLabel: row.budget_type_label,
      natureOfWorkLabel: row.nature_of_work_label,
      prReceivingMediumLabel: row.pr_receiving_medium_label,
      tenderTypeName: row.tender_type_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      financials: {
        approvedAmount: this.numberOrNull(row.approved_amount),
        estimateBenchmark: this.numberOrNull(row.estimate_benchmark),
        prValue: this.numberOrNull(row.pr_value),
        savingsWrtEstimate: this.savingsWrtEstimate(row),
        savingsWrtPr: this.savingsWrtPr(row),
        totalAwardedAmount: this.numberOrNull(row.total_awarded_amount),
      },
      milestones: {
        bidReceiptDate: this.dateOnly(row.bid_receipt_date),
        biddersParticipated: row.bidders_participated,
        commercialEvaluationDate: this.dateOnly(row.commercial_evaluation_date),
        loiIssued: row.loi_issued,
        loiIssuedDate: this.dateOnly(row.loi_issued_date),
        nfaApprovalDate: this.dateOnly(row.nfa_approval_date),
        nfaSubmissionDate: this.dateOnly(row.nfa_submission_date),
        nitApprovalDate: this.dateOnly(row.nit_approval_date),
        nitInitiationDate: this.dateOnly(row.nit_initiation_date),
        nitPublishDate: this.dateOnly(row.nit_publish_date),
        qualifiedBidders: row.qualified_bidders,
        rcPoAwardDate: this.dateOnly(row.rc_po_award_date),
        rcPoValidity: this.dateOnly(row.rc_po_validity),
        technicalEvaluationDate: this.dateOnly(row.technical_evaluation_date),
      },
      delay: {
        delayExternalDays: row.delay_external_days,
        delayReason: row.delay_reason,
      },
    };
  }

  private dateOnly(value: Date | string | null): string | null {
    return toDateOnlyString(value);
  }

  private applyValueSlabFilter(
    where: string[],
    values: unknown[],
    valueSlab: CaseListFilters["valueSlab"],
  ) {
    if (!valueSlab) return;
    const column = "f.pr_value";
    where.push(`${column} is not null`);
    if (valueSlab === "lt_10l") {
      where.push(`${column} < 1000000`);
      return;
    }
    if (valueSlab === "10l_1cr") {
      where.push(`${column} >= 1000000 and ${column} < 10000000`);
      return;
    }
    if (valueSlab === "1cr_10cr") {
      where.push(`${column} >= 10000000 and ${column} < 100000000`);
      return;
    }
    values.push(100000000);
    where.push(`${column} >= $${values.length}`);
  }

  private numberOrNull(value: string | number | null): number | null {
    if (value == null) return null;
    return typeof value === "number" ? value : Number(value);
  }

  private savingsWrtPr(row: CaseAggregateRow): number | null {
    const prValue = this.numberOrNull(row.pr_value);
    const approvedAmount = this.numberOrNull(row.approved_amount);
    if (prValue == null || approvedAmount == null) return null;
    return prValue - approvedAmount;
  }

  private savingsWrtEstimate(row: CaseAggregateRow): number | null {
    const estimateBenchmark = this.numberOrNull(row.estimate_benchmark);
    const approvedAmount = this.numberOrNull(row.approved_amount);
    if (estimateBenchmark == null || approvedAmount == null) return null;
    return estimateBenchmark - approvedAmount;
  }
}

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function applyCaseScope(
  where: string[],
  values: unknown[],
  scope: CaseListScope,
  entityColumn: string,
  ownerColumn: string,
): void {
  if (scope.tenantWide) return;
  if (scope.assignedOnly) {
    appendWhere(where, values, scope.actorUserId, (position) => `${ownerColumn} = $${position}`);
    return;
  }
  appendWhere(where, values, scope.entityIds, (position) => `${entityColumn} = any($${position}::uuid[])`);
}

function applyCaseListFilters(where: string[], values: unknown[], filters: CaseListFilters): void {
  const scalarFilters: Array<{ column: string; operator: "=" | ">=" | "<="; value: string | undefined }> = [
    { column: "c.status", operator: "=", value: filters.status },
    { column: "c.owner_user_id", operator: "=", value: filters.ownerUserId },
    { column: "c.pr_receipt_date", operator: ">=", value: filters.dateFrom },
    { column: "c.pr_receipt_date", operator: "<=", value: filters.dateTo },
  ];
  const booleanFilters: Array<{ column: string; value: boolean | undefined }> = [
    { column: "c.priority_case", value: filters.priorityCase },
    { column: "c.is_delayed", value: filters.isDelayed },
    { column: "c.cpc_involved", value: filters.cpcInvolved },
  ];
  const arrayFilters: Array<{ column: string; value: string[] | undefined }> = [
    { column: "c.entity_id", value: filters.entityIds },
    { column: "c.department_id", value: filters.departmentIds },
    { column: "c.tender_type_id", value: filters.tenderTypeIds },
    { column: "c.budget_type_id", value: filters.budgetTypeIds },
    { column: "c.nature_of_work_id", value: filters.natureOfWorkIds },
  ];

  for (const filter of scalarFilters) {
    appendOptionalScalarFilter(where, values, filter);
  }
  for (const filter of booleanFilters) {
    appendOptionalBooleanFilter(where, values, filter);
  }
  for (const filter of arrayFilters) {
    appendOptionalArrayFilter(where, values, filter);
  }
}

function applyCaseSearchFilter(where: string[], values: unknown[], query: string | undefined): void {
  if (!query) return;
  appendWhere(
    where,
    values,
    query,
    (position) => `
        to_tsvector(
          'english',
          coalesce(c.pr_id, '') || ' ' ||
          coalesce(c.pr_description, '') || ' ' ||
          coalesce(c.tender_name, '') || ' ' ||
          coalesce(c.tender_no, '')
        ) @@ plainto_tsquery('english', $${position})
      `,
  );
}

function appendOptionalScalarFilter(
  where: string[],
  values: unknown[],
  filter: { column: string; operator: "=" | ">=" | "<="; value: string | undefined },
): void {
  if (!filter.value) return;
  appendWhere(where, values, filter.value, (position) => `${filter.column} ${filter.operator} $${position}`);
}

function appendOptionalBooleanFilter(
  where: string[],
  values: unknown[],
  filter: { column: string; value: boolean | undefined },
): void {
  if (typeof filter.value !== "boolean") return;
  appendWhere(where, values, filter.value, (position) => `${filter.column} = $${position}`);
}

function appendOptionalArrayFilter(
  where: string[],
  values: unknown[],
  filter: { column: string; value: string[] | undefined },
): void {
  if (!filter.value?.length) return;
  appendWhere(where, values, filter.value, (position) => `${filter.column} = any($${position}::uuid[])`);
}

function appendWhere(
  where: string[],
  values: unknown[],
  value: unknown,
  predicate: (position: number) => string,
): void {
  values.push(value);
  where.push(predicate(values.length));
}

type CaseListRow = {
  cpc_involved: boolean | null;
  entity_id: string;
  id: string;
  pr_description: string | null;
  pr_id: string;
  pr_receipt_date: Date | null;
  is_delayed: boolean;
  priority_case: boolean;
  status: string;
  stage_code: number;
  tender_name: string | null;
  tentative_completion_date: Date | null;
  updated_at: Date;
};

type DeletedCaseListRow = {
  deleted_at: Date;
  delete_reason: string | null;
};

type CaseAggregateRow = {
  approved_amount: string | null;
  bid_receipt_date: Date | null;
  bidders_participated: number | null;
  budget_type_label: string | null;
  commercial_evaluation_date: Date | null;
  created_at: Date;
  delay_external_days: number | null;
  delay_reason: string | null;
  department_id: string | null;
  department_name: string | null;
  desired_stage_code: number | null;
  entity_id: string;
  estimate_benchmark: string | null;
  id: string;
  is_delayed: boolean;
  cpc_involved: boolean | null;
  loi_issued: boolean;
  loi_issued_date: Date | null;
  nature_of_work_label: string | null;
  nfa_approval_date: Date | null;
  nfa_submission_date: Date | null;
  nit_approval_date: Date | null;
  nit_initiation_date: Date | null;
  nit_publish_date: Date | null;
  owner_full_name: string | null;
  owner_user_id: string | null;
  pr_description: string | null;
  pr_id: string;
  pr_receiving_medium_label: string | null;
  pr_remarks: string | null;
  pr_receipt_date: Date | null;
  pr_scheme_no: string | null;
  pr_value: string | null;
  priority_case: boolean;
  qualified_bidders: number | null;
  rc_po_award_date: Date | null;
  rc_po_validity: Date | null;
  savings_wrt_estimate: string | null;
  savings_wrt_pr: string | null;
  stage_code: number;
  status: "running" | "completed";
  technical_evaluation_date: Date | null;
  tenant_id: string;
  tender_name: string | null;
  tender_no: string | null;
  tender_type_name: string | null;
  tentative_completion_date: Date | null;
  tm_remarks: string | null;
  total_awarded_amount: string | null;
  updated_at: Date;
};
