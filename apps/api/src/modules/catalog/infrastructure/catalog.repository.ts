import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type CatalogSnapshot = {
  referenceCategories: Array<{
    id: string;
    code: string;
    name: string;
    isSystemCategory: boolean;
    isActive: boolean;
    usageCount: number;
    valueCount: number;
  }>;
  referenceValues: Array<{
    id: string;
    categoryCode: string;
    label: string;
    isActive: boolean;
    usageCount: number;
  }>;
  tenderTypes: Array<{
    id: string;
    name: string;
    requiresFullMilestoneForm: boolean;
    completionDays: number | null;
    ruleId: string | null;
    isActive: boolean;
    usageCount: number;
  }>;
};

@Injectable()
export class CatalogRepository {
  constructor(private readonly db: DatabaseService) {}

  async getSnapshot(tenantId: string): Promise<CatalogSnapshot> {
    const [referenceCategories, referenceValues, tenderTypes] =
      await Promise.all([
        this.db.query<
          QueryResultRow & {
            id: string;
            code: string;
            name: string;
            is_system_category: boolean;
            is_active: boolean;
            usage_count: number;
            value_count: number;
          }
        >(
          `
          with reference_usage_raw as (
            select pr_receiving_medium_id as reference_value_id, count(*) as usage_count
            from procurement.cases
            where tenant_id = $1 and pr_receiving_medium_id is not null
            group by pr_receiving_medium_id
            union all
            select budget_type_id as reference_value_id, count(*) as usage_count
            from procurement.cases
            where tenant_id = $1 and budget_type_id is not null
            group by budget_type_id
            union all
            select nature_of_work_id as reference_value_id, count(*) as usage_count
            from procurement.cases
            where tenant_id = $1 and nature_of_work_id is not null
            group by nature_of_work_id
          ),
          reference_usage as (
            select reference_value_id, sum(usage_count)::integer as usage_count
            from reference_usage_raw
            group by reference_value_id
          ),
          category_summary as (
            select
              rv.category_id,
              count(rv.id)::integer as value_count,
              coalesce(sum(coalesce(ru.usage_count, 0)), 0)::integer as usage_count
            from catalog.reference_values rv
            left join reference_usage ru
              on ru.reference_value_id = rv.id
            where rv.tenant_id = $1
              and rv.deleted_at is null
            group by rv.category_id
          )
          select
            rc.id,
            rc.code,
            rc.name,
            rc.is_system_category,
            rc.is_active,
            coalesce(cs.usage_count, 0)::integer as usage_count,
            coalesce(cs.value_count, 0)::integer as value_count
          from catalog.reference_categories rc
          left join category_summary cs
            on cs.category_id = rc.id
          where (rc.tenant_id = $1 or rc.tenant_id is null)
            and rc.deleted_at is null
          order by rc.is_system_category desc, rc.name asc
        `,
          [tenantId],
        ),
        this.db.query<
          QueryResultRow & {
            id: string;
            category_code: string;
            label: string;
            is_active: boolean;
            usage_count: number;
          }
        >(
          `
          with reference_usage_raw as (
            select pr_receiving_medium_id as reference_value_id, count(*) as usage_count
            from procurement.cases
            where tenant_id = $1 and pr_receiving_medium_id is not null
            group by pr_receiving_medium_id
            union all
            select budget_type_id as reference_value_id, count(*) as usage_count
            from procurement.cases
            where tenant_id = $1 and budget_type_id is not null
            group by budget_type_id
            union all
            select nature_of_work_id as reference_value_id, count(*) as usage_count
            from procurement.cases
            where tenant_id = $1 and nature_of_work_id is not null
            group by nature_of_work_id
          ),
          reference_usage as (
            select reference_value_id, sum(usage_count)::integer as usage_count
            from reference_usage_raw
            group by reference_value_id
          )
          select
            rv.id,
            rc.code as category_code,
            rv.label,
            rv.is_active,
            coalesce(ru.usage_count, 0)::integer as usage_count
          from catalog.reference_values rv
          join catalog.reference_categories rc on rc.id = rv.category_id
          left join reference_usage ru on ru.reference_value_id = rv.id
          where rv.tenant_id = $1
            and (rc.tenant_id = $1 or rc.tenant_id is null)
            and rc.deleted_at is null
            and rc.is_active = true
            and rv.deleted_at is null
          order by rc.code asc, rv.display_order asc, rv.label asc
        `,
          [tenantId],
        ),
        this.db.query<
          QueryResultRow & {
            id: string;
            name: string;
            requires_full_milestone_form: boolean;
            completion_days: number | null;
            rule_id: string | null;
            is_active: boolean;
            usage_count: number;
          }
        >(
          `
          with tender_usage as (
            select tender_type_id, count(*)::integer as usage_count
            from procurement.cases
            where tenant_id = $1
              and tender_type_id is not null
            group by tender_type_id
          )
          select
            tt.id,
            tt.name,
            tt.requires_full_milestone_form,
            tcr.completion_days,
            tcr.id as rule_id,
            tt.is_active,
            coalesce(tu.usage_count, 0)::integer as usage_count
          from catalog.tender_types tt
          left join catalog.tender_type_completion_rules tcr
            on tcr.tender_type_id = tt.id
          left join tender_usage tu
            on tu.tender_type_id = tt.id
          where tt.tenant_id = $1
            and tt.deleted_at is null
          order by tt.name asc
        `,
          [tenantId],
        ),
      ]);

    return {
      referenceCategories: referenceCategories.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isSystemCategory: row.is_system_category,
        isActive: row.is_active,
        usageCount: row.usage_count,
        valueCount: row.value_count,
      })),
      referenceValues: referenceValues.rows.map((row) => ({
        id: row.id,
        categoryCode: row.category_code,
        label: row.label,
        isActive: row.is_active,
        usageCount: row.usage_count,
      })),
      tenderTypes: tenderTypes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        requiresFullMilestoneForm: row.requires_full_milestone_form,
        completionDays: row.completion_days,
        ruleId: row.rule_id,
        isActive: row.is_active,
        usageCount: row.usage_count,
      })),
    };
  }

  async createReferenceValue(input: {
    tenantId: string;
    categoryCode: string;
    label: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into catalog.reference_values (
          tenant_id, category_id, label, created_by, updated_by
        )
        select $1, rc.id, $3, $4, $4
        from catalog.reference_categories rc
        where rc.code = $2
          and (rc.tenant_id = $1 or rc.tenant_id is null)
          and rc.is_active = true
          and rc.deleted_at is null
        order by rc.tenant_id nulls last
        limit 1
        returning id
      `,
      [input.tenantId, input.categoryCode, input.label, input.createdBy],
    );
    if (!row) {
      throw new Error("Failed to create reference value.");
    }
    return { id: row.id };
  }

  async createReferenceCategory(input: {
    code: string;
    createdBy: string;
    name: string;
    tenantId: string;
  }): Promise<{ id: string } | null> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into catalog.reference_categories (
          tenant_id, code, name, is_system_category, created_by, updated_by
        )
        select $1, $2, $3, false, $4, $4
        where not exists (
          select 1
          from catalog.reference_categories rc
          where rc.code = $2
            and (rc.tenant_id = $1 or rc.tenant_id is null)
            and rc.deleted_at is null
        )
        returning id
      `,
      [input.tenantId, input.code, input.name, input.createdBy],
    );
    return row ? { id: row.id } : null;
  }

  async updateReferenceCategory(input: {
    categoryId: string;
    isActive: boolean;
    name: string;
    tenantId: string;
    updatedBy: string;
  }): Promise<boolean> {
    const result = await this.db.query(
      `
        update catalog.reference_categories
        set name = $3,
            is_active = $4,
            updated_at = now(),
            updated_by = $5
        where id = $1
          and tenant_id = $2
          and is_system_category = false
          and deleted_at is null
      `,
      [
        input.categoryId,
        input.tenantId,
        input.name,
        input.isActive,
        input.updatedBy,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countReferenceCategoryUsage(input: {
    categoryId: string;
  }): Promise<number> {
    const row = await this.db.one<QueryResultRow & { usage_count: number }>(
      `
        with reference_usage_raw as (
          select pr_receiving_medium_id as reference_value_id
          from procurement.cases
          where pr_receiving_medium_id is not null
          union all
          select budget_type_id as reference_value_id
          from procurement.cases
          where budget_type_id is not null
          union all
          select nature_of_work_id as reference_value_id
          from procurement.cases
          where nature_of_work_id is not null
        )
        select count(*)::integer as usage_count
        from reference_usage_raw ru
        join catalog.reference_values rv
          on rv.id = ru.reference_value_id
        where rv.category_id = $1
          and rv.deleted_at is null
      `,
      [input.categoryId],
    );
    return row?.usage_count ?? 0;
  }

  async deleteReferenceCategory(input: {
    categoryId: string;
    deletedBy: string;
    tenantId: string;
  }): Promise<boolean> {
    return this.db.transaction(async (client) => {
      const category = await this.db.one<
        QueryResultRow & { tenant_id: string | null }
      >(
        `
          update catalog.reference_categories
          set is_active = false,
              deleted_at = now(),
              deleted_by = $3,
              updated_at = now(),
              updated_by = $3
          where id = $1
            and (tenant_id = $2 or tenant_id is null)
            and deleted_at is null
          returning tenant_id
        `,
        [input.categoryId, input.tenantId, input.deletedBy],
        client,
      );

      if (!category) {
        return false;
      }

      await this.db.query(
        `
          update catalog.reference_values
          set is_active = false,
              deleted_at = now(),
              deleted_by = $3,
              updated_at = now(),
              updated_by = $3
          where category_id = $2
            and deleted_at is null
            and ($4::boolean or tenant_id = $1)
        `,
        [
          input.tenantId,
          input.categoryId,
          input.deletedBy,
          category.tenant_id === null,
        ],
        client,
      );

      return true;
    });
  }

  async updateReferenceValue(input: {
    tenantId: string;
    referenceValueId: string;
    label: string;
    isActive: boolean;
    updatedBy: string;
  }): Promise<void> {
    await this.db.query(
      `
        update catalog.reference_values
        set label = $3,
            is_active = $4,
            updated_at = now(),
            updated_by = $5
        where tenant_id = $1
          and id = $2
          and deleted_at is null
      `,
      [
        input.tenantId,
        input.referenceValueId,
        input.label,
        input.isActive,
        input.updatedBy,
      ],
    );
  }

  async countReferenceValueUsage(input: {
    tenantId: string;
    referenceValueId: string;
  }): Promise<number> {
    const row = await this.db.one<QueryResultRow & { usage_count: number }>(
      `
        select count(*)::integer as usage_count
        from procurement.cases
        where tenant_id = $1
          and (
            pr_receiving_medium_id = $2
            or budget_type_id = $2
            or nature_of_work_id = $2
          )
      `,
      [input.tenantId, input.referenceValueId],
    );
    return row?.usage_count ?? 0;
  }

  async deleteReferenceValue(input: {
    deletedBy: string;
    referenceValueId: string;
    tenantId: string;
  }): Promise<void> {
    await this.db.query(
      `
        update catalog.reference_values
        set is_active = false,
            deleted_at = now(),
            deleted_by = $3,
            updated_at = now(),
            updated_by = $3
        where tenant_id = $1
          and id = $2
          and deleted_at is null
      `,
      [input.tenantId, input.referenceValueId, input.deletedBy],
    );
  }

  async createTenderType(input: {
    completionDays: number;
    createdBy: string;
    name: string;
    requiresFullMilestoneForm: boolean;
    tenantId: string;
  }): Promise<{ id: string }> {
    return this.db.transaction(async (client) => {
      const row = await this.db.one<QueryResultRow & { id: string }>(
        `
          insert into catalog.tender_types (
            tenant_id, name, requires_full_milestone_form, created_by, updated_by
          )
          values ($1, $2, $3, $4, $4)
          returning id
        `,
        [
          input.tenantId,
          input.name,
          input.requiresFullMilestoneForm,
          input.createdBy,
        ],
        client,
      );
      if (!row) {
        throw new Error("Failed to create tender type.");
      }

      await this.db.query(
        `
          insert into catalog.tender_type_completion_rules (
            tenant_id, tender_type_id, completion_days
          )
          values ($1, $2, $3)
        `,
        [input.tenantId, row.id, input.completionDays],
        client,
      );

      return { id: row.id };
    });
  }

  async updateTenderType(input: {
    completionDays: number;
    isActive: boolean;
    name: string;
    requiresFullMilestoneForm: boolean;
    tenderTypeId: string;
    tenantId: string;
    updatedBy: string;
  }): Promise<void> {
    await this.db.transaction(async (client) => {
      await this.db.query(
        `
          update catalog.tender_types
          set name = $3,
              requires_full_milestone_form = $4,
              is_active = $5,
              updated_at = now(),
              updated_by = $6
          where tenant_id = $1
            and id = $2
            and deleted_at is null
        `,
        [
          input.tenantId,
          input.tenderTypeId,
          input.name,
          input.requiresFullMilestoneForm,
          input.isActive,
          input.updatedBy,
        ],
        client,
      );

      await this.db.query(
        `
          insert into catalog.tender_type_completion_rules (
            tenant_id, tender_type_id, completion_days
          )
          values ($1, $2, $3)
          on conflict (tenant_id, tender_type_id)
          do update set
            completion_days = excluded.completion_days,
            updated_at = now()
        `,
        [input.tenantId, input.tenderTypeId, input.completionDays],
        client,
      );
    });
  }

  async countTenderTypeUsage(input: {
    tenantId: string;
    tenderTypeId: string;
  }): Promise<number> {
    const row = await this.db.one<QueryResultRow & { usage_count: number }>(
      `
        select count(*)::integer as usage_count
        from procurement.cases
        where tenant_id = $1
          and tender_type_id = $2
      `,
      [input.tenantId, input.tenderTypeId],
    );
    return row?.usage_count ?? 0;
  }

  async deleteTenderType(input: {
    deletedBy: string;
    tenderTypeId: string;
    tenantId: string;
  }): Promise<void> {
    await this.db.query(
      `
        update catalog.tender_types
        set is_active = false,
            deleted_at = now(),
            deleted_by = $3,
            updated_at = now(),
            updated_by = $3
        where tenant_id = $1
          and id = $2
          and deleted_at is null
      `,
      [input.tenantId, input.tenderTypeId, input.deletedBy],
    );
  }

  async validateProcurementCaseSelections(input: {
    budgetTypeId?: string | null;
    natureOfWorkId?: string | null;
    prReceivingMediumId?: string | null;
    tenderTypeId?: string | null;
    tenantId: string;
  }): Promise<string[]> {
    const referenceChecks = [
      {
        categoryCode: "budget_type",
        id: input.budgetTypeId,
        label: "Budget type",
      },
      {
        categoryCode: "nature_of_work",
        id: input.natureOfWorkId,
        label: "Nature of work",
      },
      {
        categoryCode: "pr_receiving_medium",
        id: input.prReceivingMediumId,
        label: "PR receiving medium",
      },
    ].filter((check) => Boolean(check.id));

    const referenceResults = await Promise.all(
      referenceChecks.map((check) =>
        this.db.one<QueryResultRow & { id: string }>(
          `
            select rv.id
            from catalog.reference_values rv
            join catalog.reference_categories rc on rc.id = rv.category_id
            where rv.tenant_id = $1
              and rv.id = $2
              and rc.code = $3
              and rv.is_active = true
              and rv.deleted_at is null
          `,
          [input.tenantId, check.id, check.categoryCode],
        ),
      ),
    );

    const errors = referenceChecks
      .filter((_, index) => !referenceResults[index])
      .map((check) => `${check.label} is invalid or inactive.`);

    if (input.tenderTypeId) {
      const tenderType = await this.db.one<QueryResultRow & { id: string }>(
        `
          select id
          from catalog.tender_types
          where tenant_id = $1
            and id = $2
            and is_active = true
            and deleted_at is null
        `,
        [input.tenantId, input.tenderTypeId],
      );
      if (!tenderType) {
        errors.push("Tender type is invalid or inactive.");
      }
    }

    return errors;
  }

  async getTenderTypeCompletionDays(input: {
    tenantId: string;
    tenderTypeId: string;
  }): Promise<number | null> {
    const row = await this.db.one<
      QueryResultRow & { completion_days: number | null }
    >(
      `
        select tcr.completion_days
        from catalog.tender_types tt
        left join catalog.tender_type_completion_rules tcr
          on tcr.tender_type_id = tt.id
        where tt.tenant_id = $1
          and tt.id = $2
          and tt.is_active = true
          and tt.deleted_at is null
      `,
      [input.tenantId, input.tenderTypeId],
    );
    return row?.completion_days ?? null;
  }

  async updateTenderTypeRule(input: {
    tenantId: string;
    ruleId: string;
    completionDays: number;
  }): Promise<void> {
    await this.db.query(
      `
        update catalog.tender_type_completion_rules
        set completion_days = $3,
            updated_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [input.tenantId, input.ruleId, input.completionDays],
    );
  }

  async upsertTenderTypeRule(input: {
    tenantId: string;
    tenderTypeId: string;
    completionDays: number;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into catalog.tender_type_completion_rules (
          tenant_id, tender_type_id, completion_days
        )
        values ($1, $2, $3)
        on conflict (tenant_id, tender_type_id)
        do update set
          completion_days = excluded.completion_days,
          updated_at = now()
        returning id
      `,
      [input.tenantId, input.tenderTypeId, input.completionDays],
    );
    if (!row) {
      throw new Error("Failed to save tender type rule.");
    }
    return { id: row.id };
  }
}
