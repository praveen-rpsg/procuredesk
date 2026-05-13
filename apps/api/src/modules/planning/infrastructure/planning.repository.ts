import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import {
  diffDateOnlyDays,
  todayDateOnlyString,
  toDateOnlyString,
} from "../../../common/utils/date-only.js";
import { DatabaseService } from "../../../database/database.service.js";
import type { RcPoExpiryRow, RcPoPlan } from "../domain/rc-po-plan.js";
import { ExpiryUrgencyPolicy } from "../domain/expiry-urgency.policy.js";
import type { TenderPlanCase } from "../domain/tender-plan-case.js";

export type PlanningScope = {
  actorUserId: string;
  assignedOnly: boolean;
  entityIds: string[];
  tenantWide: boolean;
};

export type ListPlanningFilters = {
  departmentIds?: string[];
  entityIds?: string[];
  limit?: number;
  q?: string;
};

export type ExpiryFilters = ListPlanningFilters & {
  days?: number;
  includeCompleted?: boolean;
};

export type TenderPlanInput = {
  cpcInvolved?: boolean | null;
  departmentId?: string | null;
  entityId: string;
  notes?: string | null;
  plannedDate?: string | null;
  tenderDescription?: string | null;
  valueRs?: string | null;
};

export type RcPoPlanInput = {
  awardedVendors?: string | null;
  departmentId?: string | null;
  entityId: string;
  rcPoAmount?: string | null;
  rcPoAwardDate?: string | null;
  rcPoValidityDate?: string | null;
  sourceCaseId?: string | null;
  tenderDescription?: string | null;
  tenderFloatedOrNotRequired?: boolean;
  tentativeTenderingDate?: string | null;
};

export type UpdateTenderPlanInput = Partial<TenderPlanInput> & {
  actorUserId: string;
  planId: string;
  tenantId: string;
};

export type UpdateRcPoPlanInput = Partial<RcPoPlanInput> & {
  actorUserId: string;
  planId: string;
  tenantId: string;
};

@Injectable()
export class PlanningRepository {
  constructor(private readonly db: DatabaseService) {}

  async listTenderPlans(input: {
    filters: ListPlanningFilters;
    scope: PlanningScope;
    tenantId: string;
  }): Promise<TenderPlanCase[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["tenant_id = $1", "deleted_at is null"];
    this.applyScope(where, values, input.scope, "entity_id", null);
    this.applyPlanningFilters(where, values, input.filters, "tender_description", "entity_id", "department_id");
    values.push(input.filters.limit ?? 25);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & TenderPlanRow>(
      `
        select
          id, entity_id, department_id, tender_description, value_rs,
          planned_date, cpc_involved, notes
        from procurement.tender_plan_cases
        where ${where.join(" and ")}
        order by planned_date asc nulls last, updated_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => this.mapTenderPlan(row));
  }

  async createTenderPlan(input: TenderPlanInput & {
    actorUserId: string;
    tenantId: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into procurement.tender_plan_cases (
          tenant_id, entity_id, department_id, tender_description, value_rs,
          planned_date, cpc_involved, notes, created_by, updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        returning id
      `,
      [
        input.tenantId,
        input.entityId,
        input.departmentId ?? null,
        input.tenderDescription ?? null,
        input.valueRs ?? null,
        input.plannedDate ?? null,
        input.cpcInvolved ?? null,
        input.notes ?? null,
        input.actorUserId,
      ],
    );
    if (!row) throw new Error("Failed to create tender plan.");
    return { id: row.id };
  }

  async updateTenderPlan(input: UpdateTenderPlanInput): Promise<void> {
    const fields: Array<[string, unknown]> = [];
    this.pushIfPresent(fields, input, "entityId", "entity_id");
    this.pushIfPresent(fields, input, "departmentId", "department_id");
    this.pushIfPresent(fields, input, "tenderDescription", "tender_description");
    this.pushIfPresent(fields, input, "valueRs", "value_rs");
    this.pushIfPresent(fields, input, "plannedDate", "planned_date");
    this.pushIfPresent(fields, input, "cpcInvolved", "cpc_involved");
    this.pushIfPresent(fields, input, "notes", "notes");
    if (!fields.length) return;

    const values: unknown[] = [input.planId, input.tenantId, input.actorUserId];
    const assignments = fields.map(([column, value]) => {
      values.push(value);
      return `${column} = $${values.length}`;
    });

    await this.db.query(
      `
        update procurement.tender_plan_cases
        set ${assignments.join(", ")},
            updated_at = now(),
            updated_by = $3
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      values,
    );
  }

  async listRcPoPlans(input: {
    filters: ListPlanningFilters;
    scope: PlanningScope;
    tenantId: string;
  }): Promise<RcPoPlan[]> {
    const values: unknown[] = [input.tenantId];
    const where = ["tenant_id = $1", "deleted_at is null"];
    this.applyScope(where, values, input.scope, "entity_id", null);
    this.applyPlanningFilters(where, values, input.filters, "tender_description", "entity_id", "department_id");
    values.push(input.filters.limit ?? 25);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & RcPoPlanRow>(
      `
        select
          id, entity_id, department_id, source_case_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
          tentative_tendering_date, tender_floated_or_not_required
        from procurement.rc_po_plans
        where ${where.join(" and ")}
        order by rc_po_validity_date asc nulls last, updated_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => this.mapRcPoPlan(row));
  }

  async createRcPoPlan(input: RcPoPlanInput & {
    actorUserId: string;
    tenantId: string;
  }): Promise<{ id: string }> {
    const result = await this.db.transaction(async (client) => {
      const row = await this.db.one<QueryResultRow & { id: string }>(
        `
          insert into procurement.rc_po_plans (
            tenant_id, entity_id, department_id, source_case_id, tender_description,
            awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
            tentative_tendering_date, tender_floated_or_not_required,
            created_by, updated_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
          returning id
        `,
        [
          input.tenantId,
          input.entityId,
          input.departmentId ?? null,
          input.sourceCaseId ?? null,
          input.tenderDescription ?? null,
          input.awardedVendors ?? null,
          input.rcPoAmount ?? null,
          input.rcPoAwardDate ?? null,
          input.rcPoValidityDate ?? null,
          input.tentativeTenderingDate ?? null,
          input.tenderFloatedOrNotRequired ?? false,
          input.actorUserId,
        ],
        client,
      );
      if (!row) throw new Error("Failed to create RC/PO plan.");
      await this.refreshContractExpiryFact(input.tenantId, row.id, client);
      return { id: row.id };
    });

    return result;
  }

  async updateRcPoPlan(input: UpdateRcPoPlanInput): Promise<void> {
    await this.db.transaction(async (client) => {
      const fields: Array<[string, unknown]> = [];
      this.pushIfPresent(fields, input, "entityId", "entity_id");
      this.pushIfPresent(fields, input, "departmentId", "department_id");
      this.pushIfPresent(fields, input, "sourceCaseId", "source_case_id");
      this.pushIfPresent(fields, input, "tenderDescription", "tender_description");
      this.pushIfPresent(fields, input, "awardedVendors", "awarded_vendors");
      this.pushIfPresent(fields, input, "rcPoAmount", "rc_po_amount");
      this.pushIfPresent(fields, input, "rcPoAwardDate", "rc_po_award_date");
      this.pushIfPresent(fields, input, "rcPoValidityDate", "rc_po_validity_date");
      this.pushIfPresent(fields, input, "tentativeTenderingDate", "tentative_tendering_date");
      this.pushIfPresent(
        fields,
        input,
        "tenderFloatedOrNotRequired",
        "tender_floated_or_not_required",
      );
      if (!fields.length) return;

      const values: unknown[] = [input.planId, input.tenantId, input.actorUserId];
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
          where id = $1
            and tenant_id = $2
            and deleted_at is null
        `,
        values,
        client,
      );
      await this.assertRcPoPlanDatesValid(input.tenantId, input.planId, client);
      await this.refreshContractExpiryFact(input.tenantId, input.planId, client);
    });
  }

  async listExpiryRows(input: {
    filters: ExpiryFilters;
    scope: PlanningScope;
    tenantId: string;
  }): Promise<RcPoExpiryRow[]> {
    const values: unknown[] = [input.tenantId];
    const manualWhere = ["p.tenant_id = $1", "p.deleted_at is null", "p.rc_po_validity_date is not null"];
    const awardWhere = ["a.tenant_id = $1", "a.deleted_at is null", "a.po_validity_date is not null"];
    this.applyScope(manualWhere, values, input.scope, "p.entity_id", "coalesce(p.owner_user_id, c.owner_user_id)");
    this.applyScope(awardWhere, values, input.scope, "c.entity_id", "c.owner_user_id");

    if (!input.filters.includeCompleted) {
      manualWhere.push("p.tender_floated_or_not_required = false");
    }
    if (input.filters.days != null) {
      values.push(input.filters.days);
      manualWhere.push(`p.rc_po_validity_date <= current_date + ($${values.length}::integer * interval '1 day')`);
      awardWhere.push(`a.po_validity_date <= current_date + ($${values.length}::integer * interval '1 day')`);
    }
    if (input.filters.q) {
      values.push(input.filters.q);
      const position = values.length;
      manualWhere.push(`
        to_tsvector('english', coalesce(p.tender_description, '') || ' ' || coalesce(p.awarded_vendors, ''))
          @@ plainto_tsquery('english', $${position})
      `);
      awardWhere.push(`
        to_tsvector('english', coalesce(c.tender_name, '') || ' ' || coalesce(c.pr_description, '') || ' ' || coalesce(a.vendor_name, ''))
          @@ plainto_tsquery('english', $${position})
      `);
    }
    if (input.filters.entityIds?.length) {
      values.push(input.filters.entityIds);
      const position = values.length;
      manualWhere.push(`p.entity_id = any($${position}::uuid[])`);
      awardWhere.push(`c.entity_id = any($${position}::uuid[])`);
    }
    if (input.filters.departmentIds?.length) {
      values.push(input.filters.departmentIds);
      const position = values.length;
      manualWhere.push(`p.department_id = any($${position}::uuid[])`);
      awardWhere.push(`c.department_id = any($${position}::uuid[])`);
    }
    values.push(input.filters.limit ?? 50);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & ExpiryRow>(
      `
        select
          source_type,
          source_id,
          source_case_id,
          entity_id,
          department_id,
          owner_user_id,
          tender_description,
          awarded_vendors,
          rc_po_amount,
          rc_po_award_date,
          rc_po_validity_date,
          tentative_tendering_date,
          tender_floated_or_not_required
        from (
          select
            'manual_plan'::text as source_type,
            p.id as source_id,
            p.source_case_id,
            p.entity_id,
            p.department_id,
            coalesce(p.owner_user_id, c.owner_user_id),
            p.tender_description,
            p.awarded_vendors,
            p.rc_po_amount,
            p.rc_po_award_date,
            p.rc_po_validity_date,
            coalesce(p.tentative_tendering_date, p.rc_po_award_date + 150),
            p.tender_floated_or_not_required
          from procurement.rc_po_plans p
          left join procurement.cases c on c.id = p.source_case_id
          where ${manualWhere.join(" and ")}
          union all
          select
            'case_award'::text as source_type,
            a.id as source_id,
            c.id as source_case_id,
            c.entity_id,
            c.department_id,
            c.owner_user_id,
            coalesce(c.tender_name, c.pr_description) as tender_description,
            a.vendor_name as awarded_vendors,
            a.po_value as rc_po_amount,
            a.po_award_date as rc_po_award_date,
            a.po_validity_date as rc_po_validity_date,
            coalesce(a.tentative_tendering_date, a.po_award_date + 150),
            a.tender_floated_or_not_required
          from procurement.case_awards a
          join procurement.cases c on c.id = a.case_id and c.deleted_at is null
          where ${awardWhere.join(" and ")}
        ) expiry
        order by rc_po_validity_date asc
        limit $${limitPosition}
      `,
      values,
    );

    const urgency = new ExpiryUrgencyPolicy();
    return result.rows.map((row) => {
      const validityDate = this.dateOnly(row.rc_po_validity_date);
      const daysToExpiry = validityDate ? this.diffDays(validityDate) : null;
      return {
        awardedVendors: row.awarded_vendors,
        daysToExpiry,
        departmentId: row.department_id,
        entityId: row.entity_id,
        ownerUserId: row.owner_user_id,
        rcPoAmount: this.numberOrNull(row.rc_po_amount),
        rcPoAwardDate: this.dateOnly(row.rc_po_award_date),
        rcPoValidityDate: validityDate ?? "",
        sourceCaseId: row.source_case_id,
        sourceId: row.source_id,
        sourceType: row.source_type,
        tenderDescription: row.tender_description,
        tenderFloatedOrNotRequired: row.tender_floated_or_not_required,
        tentativeTenderingDate: this.dateOnly(row.tentative_tendering_date),
        urgency: urgency.classify(daysToExpiry),
      };
    });
  }

  private async refreshContractExpiryFact(
    tenantId: string,
    planId: string,
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        delete from reporting.contract_expiry_facts
        where tenant_id = $1
          and rc_po_plan_id = $2
      `,
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
          coalesce(p.owner_user_id, c.owner_user_id),
          p.tender_description,
          p.awarded_vendors,
          p.rc_po_amount,
          p.rc_po_award_date,
          p.rc_po_validity_date,
          coalesce(p.tentative_tendering_date, p.rc_po_award_date + 150),
          p.tender_floated_or_not_required,
          'manual_plan',
          now()
        from procurement.rc_po_plans p
        left join procurement.cases c on c.id = p.source_case_id
        where p.tenant_id = $1
          and p.id = $2
          and p.deleted_at is null
          and p.rc_po_validity_date is not null
      `,
      [tenantId, planId],
      client,
    );
  }

  private async assertRcPoPlanDatesValid(
    tenantId: string,
    planId: string,
    client: PoolClient,
  ): Promise<void> {
    const row = await this.db.one<
      QueryResultRow & { rc_po_award_date: Date | null; rc_po_validity_date: Date | null }
    >(
      `
        select rc_po_award_date, rc_po_validity_date
        from procurement.rc_po_plans
        where tenant_id = $1
          and id = $2
          and deleted_at is null
      `,
      [tenantId, planId],
      client,
    );
    if (!row) return;

    const awardDate = this.dateOnly(row.rc_po_award_date);
    const validityDate = this.dateOnly(row.rc_po_validity_date);
    if (awardDate && validityDate && validityDate < awardDate) {
      throw new Error("RC/PO plan date invalid.");
    }
  }

  private applyScope(
    where: string[],
    values: unknown[],
    scope: PlanningScope,
    entityColumn: string,
    ownerColumn: string | null,
  ) {
    if (scope.tenantWide) return;
    if (scope.assignedOnly && ownerColumn) {
      values.push(scope.actorUserId);
      where.push(`${ownerColumn} = $${values.length}`);
      return;
    }
    values.push(scope.entityIds);
    where.push(`${entityColumn} = any($${values.length}::uuid[])`);
  }

  private applyPlanningFilters(
    where: string[],
    values: unknown[],
    filters: ListPlanningFilters,
    searchColumn: string,
    entityColumn: string,
    departmentColumn: string,
  ) {
    if (filters.entityIds?.length) {
      values.push(filters.entityIds);
      where.push(`${entityColumn} = any($${values.length}::uuid[])`);
    }
    if (filters.departmentIds?.length) {
      values.push(filters.departmentIds);
      where.push(`${departmentColumn} = any($${values.length}::uuid[])`);
    }
    if (filters.q) {
      values.push(filters.q);
      where.push(`to_tsvector('english', coalesce(${searchColumn}, '')) @@ plainto_tsquery('english', $${values.length})`);
    }
  }

  private pushIfPresent(
    fields: Array<[string, unknown]>,
    input: object,
    key: string,
    column: string,
  ) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      fields.push([column, (input as Record<string, unknown>)[key]]);
    }
  }

  private mapTenderPlan(row: TenderPlanRow): TenderPlanCase {
    return {
      cpcInvolved: row.cpc_involved,
      departmentId: row.department_id,
      entityId: row.entity_id,
      id: row.id,
      notes: row.notes,
      plannedDate: this.dateOnly(row.planned_date),
      tenderDescription: row.tender_description,
      valueRs: this.numberOrNull(row.value_rs),
    };
  }

  private mapRcPoPlan(row: RcPoPlanRow): RcPoPlan {
    return {
      awardedVendors: row.awarded_vendors,
      departmentId: row.department_id,
      entityId: row.entity_id,
      id: row.id,
      rcPoAmount: this.numberOrNull(row.rc_po_amount),
      rcPoAwardDate: this.dateOnly(row.rc_po_award_date),
      rcPoValidityDate: this.dateOnly(row.rc_po_validity_date),
      sourceCaseId: row.source_case_id,
      tenderDescription: row.tender_description,
      tenderFloatedOrNotRequired: row.tender_floated_or_not_required,
      tentativeTenderingDate: this.dateOnly(row.tentative_tendering_date),
    };
  }

  private dateOnly(value: Date | string | null): string | null {
    return toDateOnlyString(value);
  }

  private diffDays(value: string): number {
    return diffDateOnlyDays(value, todayDateOnlyString()) ?? 0;
  }

  private numberOrNull(value: string | number | null): number | null {
    if (value == null) return null;
    return typeof value === "number" ? value : Number(value);
  }
}

type TenderPlanRow = {
  cpc_involved: boolean | null;
  department_id: string | null;
  entity_id: string;
  id: string;
  notes: string | null;
  planned_date: Date | null;
  tender_description: string | null;
  value_rs: string | null;
};

type RcPoPlanRow = {
  awarded_vendors: string | null;
  department_id: string | null;
  entity_id: string;
  id: string;
  rc_po_amount: string | null;
  rc_po_award_date: Date | null;
  rc_po_validity_date: Date | null;
  source_case_id: string | null;
  tender_description: string | null;
  tender_floated_or_not_required: boolean;
  tentative_tendering_date: Date | null;
};

type ExpiryRow = {
  awarded_vendors: string | null;
  department_id: string | null;
  entity_id: string;
  owner_user_id: string | null;
  rc_po_amount: string | null;
  rc_po_award_date: Date | null;
  rc_po_validity_date: Date;
  source_case_id: string | null;
  source_id: string;
  source_type: "case_award" | "manual_plan";
  tender_description: string | null;
  tender_floated_or_not_required: boolean;
  tentative_tendering_date: Date | null;
};
