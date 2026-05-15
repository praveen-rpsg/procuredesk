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
  cpcInvolved?: boolean;
  departmentIds?: string[];
  entityIds?: string[];
  limit?: number;
  natureOfWorkIds?: string[];
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
  natureOfWorkId?: string | null;
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
    const where = ["p.tenant_id = $1", "p.deleted_at is null"];
    this.applyScope(where, values, input.scope, "p.entity_id", null);
    this.applyPlanningFilters(
      where,
      values,
      input.filters,
      "p.tender_description",
      "p.entity_id",
      "p.department_id",
      "p.nature_of_work_id",
      "p.cpc_involved",
    );
    values.push(input.filters.limit ?? 25);
    const limitPosition = values.length;

    const result = await this.db.query<QueryResultRow & TenderPlanRow>(
      `
        select
          p.id, p.entity_id, ent.code as entity_code, ent.name as entity_name,
          p.department_id, dep.name as department_name,
          p.nature_of_work_id, nature.label as nature_of_work_label,
          p.tender_description, p.value_rs, p.planned_date, p.cpc_involved,
          p.notes
        from procurement.tender_plan_cases p
        left join org.entities ent on ent.id = p.entity_id and ent.tenant_id = $1
        left join org.departments dep on dep.id = p.department_id and dep.tenant_id = $1
        left join catalog.reference_values nature on nature.id = p.nature_of_work_id
        where ${where.join(" and ")}
        order by p.planned_date asc nulls last, p.updated_at desc
        limit $${limitPosition}
      `,
      values,
    );

    return result.rows.map((row) => this.mapTenderPlan(row));
  }

  async createTenderPlan(
    input: TenderPlanInput & {
      actorUserId: string;
      tenantId: string;
    },
  ): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into procurement.tender_plan_cases (
          tenant_id, entity_id, department_id, nature_of_work_id,
          tender_description, value_rs, planned_date, cpc_involved, notes,
          created_by, updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        returning id
      `,
      [
        input.tenantId,
        input.entityId,
        input.departmentId ?? null,
        input.natureOfWorkId ?? null,
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
    this.pushIfPresent(fields, input, "natureOfWorkId", "nature_of_work_id");
    this.pushIfPresent(
      fields,
      input,
      "tenderDescription",
      "tender_description",
    );
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

  async deleteTenderPlan(input: {
    actorUserId: string;
    planId: string;
    tenantId: string;
  }): Promise<void> {
    await this.db.query(
      `
        update procurement.tender_plan_cases
        set deleted_at = now(),
            deleted_by = $3,
            updated_at = now(),
            updated_by = $3
        where id = $1
          and tenant_id = $2
          and deleted_at is null
      `,
      [input.planId, input.tenantId, input.actorUserId],
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
    this.applyPlanningFilters(
      where,
      values,
      input.filters,
      "tender_description",
      "entity_id",
      "department_id",
    );
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

  async createRcPoPlan(
    input: RcPoPlanInput & {
      actorUserId: string;
      tenantId: string;
    },
  ): Promise<{ id: string }> {
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
      this.pushIfPresent(
        fields,
        input,
        "tenderDescription",
        "tender_description",
      );
      this.pushIfPresent(fields, input, "awardedVendors", "awarded_vendors");
      this.pushIfPresent(fields, input, "rcPoAmount", "rc_po_amount");
      this.pushIfPresent(fields, input, "rcPoAwardDate", "rc_po_award_date");
      this.pushIfPresent(
        fields,
        input,
        "rcPoValidityDate",
        "rc_po_validity_date",
      );
      this.pushIfPresent(
        fields,
        input,
        "tentativeTenderingDate",
        "tentative_tendering_date",
      );
      this.pushIfPresent(
        fields,
        input,
        "tenderFloatedOrNotRequired",
        "tender_floated_or_not_required",
      );
      if (!fields.length) return;

      const values: unknown[] = [
        input.planId,
        input.tenantId,
        input.actorUserId,
      ];
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
      await this.refreshContractExpiryFact(
        input.tenantId,
        input.planId,
        client,
      );
    });
  }

  async listExpiryRows(input: {
    filters: ExpiryFilters;
    scope: PlanningScope;
    tenantId: string;
  }): Promise<RcPoExpiryRow[]> {
    const values: unknown[] = [input.tenantId];
    const manualWhere = [
      "p.tenant_id = $1",
      "p.deleted_at is null",
      "p.rc_po_validity_date is not null",
    ];
    const awardWhere = [
      "a.tenant_id = $1",
      "a.deleted_at is null",
      "a.po_validity_date is not null",
    ];
    this.applyScope(
      manualWhere,
      values,
      input.scope,
      "p.entity_id",
      "coalesce(p.owner_user_id, c.owner_user_id)",
    );
    this.applyScope(
      awardWhere,
      values,
      input.scope,
      "c.entity_id",
      "c.owner_user_id",
    );

    if (!input.filters.includeCompleted) {
      manualWhere.push("p.tender_floated_or_not_required = false");
    }
    values.push(Math.min(input.filters.days ?? 90, 90));
    manualWhere.push(
      `p.rc_po_validity_date >= current_date and p.rc_po_validity_date <= current_date + ($${values.length}::integer * interval '1 day')`,
    );
    awardWhere.push(
      `a.po_validity_date >= current_date and a.po_validity_date <= current_date + ($${values.length}::integer * interval '1 day')`,
    );
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
          expiry.source_type,
          expiry.source_origin,
          expiry.source_id,
          expiry.source_case_id,
          expiry.entity_id,
          ent.code as entity_code,
          ent.name as entity_name,
          expiry.department_id,
          dep.name as department_name,
          expiry.owner_user_id,
          owner.full_name as owner_full_name,
          expiry.tender_description,
          expiry.awarded_vendors,
          expiry.rc_po_amount,
          expiry.rc_po_award_date,
          expiry.rc_po_validity_date,
          expiry.tentative_tendering_date,
          expiry.tender_floated_or_not_required
        from (
          select
            'manual_plan'::text as source_type,
            case
              when p.uploaded_at is not null then 'bulk_upload'
              else 'manual_entry'
            end as source_origin,
            p.id as source_id,
            p.source_case_id,
            p.entity_id,
            p.department_id,
            coalesce(p.owner_user_id, c.owner_user_id) as owner_user_id,
            p.tender_description,
            p.awarded_vendors,
            p.rc_po_amount,
            p.rc_po_award_date,
            p.rc_po_validity_date,
            coalesce(p.tentative_tendering_date, p.rc_po_award_date + 150) as tentative_tendering_date,
            p.tender_floated_or_not_required
          from procurement.rc_po_plans p
          left join procurement.cases c on c.id = p.source_case_id and c.tenant_id = p.tenant_id
          where ${manualWhere.join(" and ")}
          union all
          select
            'case_award'::text as source_type,
            'tenderdb'::text as source_origin,
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
            coalesce(a.tentative_tendering_date, a.po_award_date + 150) as tentative_tendering_date,
            a.tender_floated_or_not_required
          from procurement.case_awards a
          join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id and c.deleted_at is null
          where ${awardWhere.join(" and ")}
        ) expiry
        left join org.entities ent on ent.id = expiry.entity_id and ent.tenant_id = $1
        left join org.departments dep on dep.id = expiry.department_id and dep.tenant_id = $1
        left join iam.users owner on owner.id = expiry.owner_user_id and owner.tenant_id = $1
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
        departmentName: row.department_name,
        entityCode: row.entity_code,
        entityId: row.entity_id,
        entityName: row.entity_name,
        ownerFullName: row.owner_full_name,
        ownerUserId: row.owner_user_id,
        rcPoAmount: this.numberOrNull(row.rc_po_amount),
        rcPoAwardDate: this.dateOnly(row.rc_po_award_date),
        rcPoValidityDate: validityDate ?? "",
        sourceCaseId: row.source_case_id,
        sourceId: row.source_id,
        sourceOrigin: row.source_origin,
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
          owner_user_id, budget_type_id, nature_of_work_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
          tentative_tendering_date, tender_floated_or_not_required,
          source_deleted_at, source_type, updated_at
        )
        select
          p.tenant_id,
          p.id,
          p.source_case_id,
          p.entity_id,
          p.department_id,
          coalesce(p.owner_user_id, c.owner_user_id),
          c.budget_type_id,
          c.nature_of_work_id,
          p.tender_description,
          p.awarded_vendors,
          p.rc_po_amount,
          p.rc_po_award_date,
          p.rc_po_validity_date,
          coalesce(p.tentative_tendering_date, p.rc_po_award_date + 150),
          p.tender_floated_or_not_required,
          coalesce(p.deleted_at, c.deleted_at),
          'manual_plan',
          now()
        from procurement.rc_po_plans p
        left join procurement.cases c on c.id = p.source_case_id and c.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and p.id = $2
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
      QueryResultRow & {
        rc_po_award_date: Date | null;
        rc_po_validity_date: Date | null;
      }
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
    natureOfWorkColumn?: string,
    cpcInvolvedColumn?: string,
  ) {
    if (filters.entityIds?.length) {
      values.push(filters.entityIds);
      where.push(`${entityColumn} = any($${values.length}::uuid[])`);
    }
    if (filters.departmentIds?.length) {
      values.push(filters.departmentIds);
      where.push(`${departmentColumn} = any($${values.length}::uuid[])`);
    }
    if (natureOfWorkColumn && filters.natureOfWorkIds?.length) {
      values.push(filters.natureOfWorkIds);
      where.push(`${natureOfWorkColumn} = any($${values.length}::uuid[])`);
    }
    if (cpcInvolvedColumn && typeof filters.cpcInvolved === "boolean") {
      values.push(filters.cpcInvolved);
      where.push(`${cpcInvolvedColumn} = $${values.length}`);
    }
    if (filters.q) {
      values.push(filters.q);
      where.push(
        `to_tsvector('english', coalesce(${searchColumn}, '')) @@ plainto_tsquery('english', $${values.length})`,
      );
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
      departmentName: row.department_name,
      entityCode: row.entity_code,
      entityId: row.entity_id,
      entityName: row.entity_name,
      id: row.id,
      natureOfWorkId: row.nature_of_work_id,
      natureOfWorkLabel: row.nature_of_work_label,
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
  department_name: string | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  id: string;
  nature_of_work_id: string | null;
  nature_of_work_label: string | null;
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
  department_name: string | null;
  entity_code: string | null;
  entity_id: string;
  entity_name: string | null;
  owner_full_name: string | null;
  owner_user_id: string | null;
  rc_po_amount: string | null;
  rc_po_award_date: Date | null;
  rc_po_validity_date: Date;
  source_case_id: string | null;
  source_id: string;
  source_origin: "bulk_upload" | "manual_entry" | "tenderdb";
  source_type: "case_award" | "manual_plan";
  tender_description: string | null;
  tender_floated_or_not_required: boolean;
  tentative_tendering_date: Date | null;
};
