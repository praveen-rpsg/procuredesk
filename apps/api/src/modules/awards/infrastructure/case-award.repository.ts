import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { toDateOnlyString } from "../../../common/utils/date-only.js";
import { DatabaseService } from "../../../database/database.service.js";
import type { AwardRollup, CaseAward } from "../domain/case-award.js";
import type { MoneyAmount } from "../domain/money.js";

export type CreateAwardInput = {
  actorUserId: string;
  caseId: string;
  notes?: string | null;
  poAwardDate?: string | null;
  poNumber?: string | null;
  poValue?: MoneyAmount | null;
  poValidityDate?: string | null;
  tenantId: string;
  vendorCode?: string | null;
  vendorName: string;
};

export type UpdateAwardInput = Partial<
  Pick<
    CreateAwardInput,
    | "notes"
    | "poAwardDate"
    | "poNumber"
    | "poValue"
    | "poValidityDate"
    | "vendorCode"
    | "vendorName"
  >
> & {
  actorUserId: string;
  awardId: string;
  caseId: string;
  tenantId: string;
};

@Injectable()
export class CaseAwardRepository {
  constructor(private readonly db: DatabaseService) {}

  async listAwards(tenantId: string, caseId: string): Promise<CaseAward[]> {
    const result = await this.db.query<QueryResultRow & AwardRow>(
      `
        select
          id, tenant_id, case_id, vendor_name, vendor_code, po_number,
          po_value, po_award_date, po_validity_date, notes, created_at, updated_at
        from procurement.case_awards
        where tenant_id = $1
          and case_id = $2
          and deleted_at is null
        order by po_award_date desc nulls last, created_at desc
      `,
      [tenantId, caseId],
    );

    return result.rows.map((row) => this.mapAward(row));
  }

  async createAward(input: CreateAwardInput): Promise<{ id: string; rollup: AwardRollup }> {
    return this.db.transaction(async (client) => {
      const row = await this.db.one<QueryResultRow & { id: string }>(
        `
          insert into procurement.case_awards (
            tenant_id, case_id, vendor_name, vendor_code, po_number, po_value,
            po_award_date, po_validity_date, notes, created_by, updated_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
          returning id
        `,
        [
          input.tenantId,
          input.caseId,
          input.vendorName,
          input.vendorCode ?? null,
          input.poNumber ?? null,
          input.poValue ?? null,
          input.poAwardDate ?? null,
          input.poValidityDate ?? null,
          input.notes ?? null,
          input.actorUserId,
        ],
        client,
      );

      if (!row) throw new Error("Failed to create award.");
      const rollup = await this.refreshCaseAwardRollup(
        input.tenantId,
        input.caseId,
        input.actorUserId,
        client,
      );
      return { id: row.id, rollup };
    });
  }

  async updateAward(input: UpdateAwardInput): Promise<{ rollup: AwardRollup }> {
    return this.db.transaction(async (client) => {
      const fields: Array<[string, unknown]> = [];
      this.pushIfPresent(fields, input, "vendorName", "vendor_name");
      this.pushIfPresent(fields, input, "vendorCode", "vendor_code");
      this.pushIfPresent(fields, input, "poNumber", "po_number");
      this.pushIfPresent(fields, input, "poValue", "po_value");
      this.pushIfPresent(fields, input, "poAwardDate", "po_award_date");
      this.pushIfPresent(fields, input, "poValidityDate", "po_validity_date");
      this.pushIfPresent(fields, input, "notes", "notes");

      if (fields.length) {
        const values: unknown[] = [
          input.awardId,
          input.tenantId,
          input.caseId,
          input.actorUserId,
        ];
        const assignments = fields.map(([column, value]) => {
          values.push(value);
          return `${column} = $${values.length}`;
        });
        const result = await this.db.query(
          `
            update procurement.case_awards
            set ${assignments.join(", ")},
                updated_at = now(),
                updated_by = $4
            where id = $1
              and tenant_id = $2
              and case_id = $3
              and deleted_at is null
          `,
          values,
          client,
        );
        if (result.rowCount === 0) {
          throw new Error("Award not found.");
        }
        await this.assertAwardDatesAreValid(
          input.tenantId,
          input.caseId,
          input.awardId,
          client,
        );
      }

      const rollup = await this.refreshCaseAwardRollup(
        input.tenantId,
        input.caseId,
        input.actorUserId,
        client,
      );
      return { rollup };
    });
  }

  async deleteAward(input: {
    actorUserId: string;
    awardId: string;
    caseId: string;
    tenantId: string;
  }): Promise<{ rollup: AwardRollup }> {
    return this.db.transaction(async (client) => {
      const result = await this.db.query(
        `
          update procurement.case_awards
          set deleted_at = now(),
              deleted_by = $4,
              updated_at = now(),
              updated_by = $4
          where id = $1
            and tenant_id = $2
            and case_id = $3
            and deleted_at is null
        `,
        [input.awardId, input.tenantId, input.caseId, input.actorUserId],
        client,
      );
      if (result.rowCount === 0) {
        throw new Error("Award not found.");
      }

      const rollup = await this.refreshCaseAwardRollup(
        input.tenantId,
        input.caseId,
        input.actorUserId,
        client,
      );
      return { rollup };
    });
  }

  private async refreshCaseAwardRollup(
    tenantId: string,
    caseId: string,
    actorUserId: string,
    client: PoolClient,
  ): Promise<AwardRollup> {
    const aggregate = await this.db.one<QueryResultRow & AwardRollupRow>(
      `
        select
          count(*)::integer as award_count,
          coalesce(sum(po_value), 0)::text as total_awarded_amount,
          min(po_award_date) as first_award_date,
          max(po_validity_date) as effective_validity_date
        from procurement.case_awards
        where tenant_id = $1
          and case_id = $2
          and deleted_at is null
      `,
      [tenantId, caseId],
      client,
    );

    const rollup = this.mapAwardRollup(aggregate);
    await this.db.query(
      `
        update procurement.case_financials f
        set total_awarded_amount = $3,
            savings_wrt_pr = case
              when f.pr_value is null then null
              else f.pr_value - $3::numeric
            end,
            savings_wrt_estimate = case
              when f.estimate_benchmark is null then null
              else f.estimate_benchmark - $3::numeric
            end,
            updated_at = now()
        where f.tenant_id = $1
          and f.case_id = $2
      `,
      [tenantId, caseId, rollup.totalAwardedAmount],
      client,
    );

    await this.db.query(
      `
        update procurement.case_milestones
        set rc_po_award_date = $3,
            rc_po_validity = $4,
            updated_at = now()
        where tenant_id = $1
          and case_id = $2
      `,
      [
        tenantId,
        caseId,
        rollup.firstAwardDate,
        rollup.effectiveValidityDate,
      ],
      client,
    );

    await this.db.query(
      `
        update procurement.cases c
        set status = case when m.rc_po_award_date is not null then 'completed' else 'running' end,
            stage_code = case
              when m.rc_po_award_date is not null then 8
              when m.nfa_approval_date is not null then 7
              when m.nfa_submission_date is not null then 6
              when m.commercial_evaluation_date is not null and m.technical_evaluation_date is not null then 5
              when m.bid_receipt_date is not null then 4
              when m.nit_publish_date is not null then 3
              when m.nit_approval_date is not null then 2
              when m.nit_initiation_date is not null then 1
              else 0
            end,
            desired_stage_code = case
              when m.rc_po_award_date is not null then null
              else c.desired_stage_code
            end,
            is_delayed = case
              when m.rc_po_award_date is not null then false
              else c.is_delayed
            end,
            version = version + 1,
            updated_at = now(),
            updated_by = $3
        from procurement.case_milestones m
        where c.tenant_id = $1
          and c.id = $2
          and m.tenant_id = c.tenant_id
          and m.case_id = c.id
          and c.deleted_at is null
      `,
      [tenantId, caseId, actorUserId],
      client,
    );

    await this.refreshCaseFacts(tenantId, caseId, client);

    return {
      awardCount: rollup.awardCount,
      effectiveValidityDate: this.dateOnly(rollup.effectiveValidityDate),
      firstAwardDate: this.dateOnly(rollup.firstAwardDate),
      totalAwardedAmount: this.numberOrZero(rollup.totalAwardedAmount),
    };
  }

  private mapAwardRollup(row: AwardRollupRow | null): {
    awardCount: number;
    effectiveValidityDate: Date | null;
    firstAwardDate: Date | null;
    totalAwardedAmount: string;
  } {
    return {
      awardCount: row?.award_count ?? 0,
      effectiveValidityDate: row?.effective_validity_date ?? null,
      firstAwardDate: row?.first_award_date ?? null,
      totalAwardedAmount: row?.total_awarded_amount ?? "0",
    };
  }

  private async refreshCaseFacts(
    tenantId: string,
    caseId: string,
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        insert into reporting.case_facts (
          case_id, tenant_id, entity_id, department_id, owner_user_id,
          tender_type_id, status, stage_code, desired_stage_code, is_delayed,
          priority_case, cpc_involved, pr_receipt_date, rc_po_award_date,
          pr_value, estimate_benchmark, approved_amount, total_awarded_amount,
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
          and c.id = $2
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
            pr_value = excluded.pr_value,
            estimate_benchmark = excluded.estimate_benchmark,
            approved_amount = excluded.approved_amount,
            total_awarded_amount = excluded.total_awarded_amount,
            savings_wrt_pr = excluded.savings_wrt_pr,
            savings_wrt_estimate = excluded.savings_wrt_estimate,
            updated_at = now()
      `,
      [tenantId, caseId],
      client,
    );
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

  private async assertAwardDatesAreValid(
    tenantId: string,
    caseId: string,
    awardId: string,
    client: PoolClient,
  ): Promise<void> {
    const row = await this.db.one<
      QueryResultRow & { po_award_date: Date | null; po_validity_date: Date | null }
    >(
      `
        select po_award_date, po_validity_date
        from procurement.case_awards
        where tenant_id = $1
          and case_id = $2
          and id = $3
          and deleted_at is null
      `,
      [tenantId, caseId, awardId],
      client,
    );
    if (!row) {
      throw new Error("Award not found.");
    }

    const awardDate = this.dateOnly(row.po_award_date);
    const validityDate = this.dateOnly(row.po_validity_date);
    if (awardDate && validityDate && validityDate < awardDate) {
      throw new Error("Award date invalid.");
    }
  }

  private mapAward(row: AwardRow): CaseAward {
    return {
      caseId: row.case_id,
      createdAt: row.created_at.toISOString(),
      id: row.id,
      notes: row.notes,
      poAwardDate: this.dateOnly(row.po_award_date),
      poNumber: row.po_number,
      poValue: this.numberOrNull(row.po_value),
      poValidityDate: this.dateOnly(row.po_validity_date),
      tenantId: row.tenant_id,
      updatedAt: row.updated_at.toISOString(),
      vendorCode: row.vendor_code,
      vendorName: row.vendor_name,
    };
  }

  private dateOnly(value: Date | string | null): string | null {
    return toDateOnlyString(value);
  }

  private numberOrNull(value: string | number | null): number | null {
    if (value == null) return null;
    return typeof value === "number" ? value : Number(value);
  }

  private numberOrZero(value: string | number): number {
    return typeof value === "number" ? value : Number(value);
  }
}

type AwardRow = {
  case_id: string;
  created_at: Date;
  id: string;
  notes: string | null;
  po_award_date: Date | null;
  po_number: string | null;
  po_value: string | null;
  po_validity_date: Date | null;
  tenant_id: string;
  updated_at: Date;
  vendor_code: string | null;
  vendor_name: string;
};

type AwardRollupRow = {
  award_count: number;
  effective_validity_date: Date | null;
  first_award_date: Date | null;
  total_awarded_amount: string;
};
