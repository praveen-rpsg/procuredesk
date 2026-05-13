import type { Pool } from "pg";

export type ReportingProjectionPayload = {
  aggregateId: string;
  eventType: string;
  tenantId: string;
};

export async function processReportingProjection(
  payload: ReportingProjectionPayload,
  deps: { pool: Pool },
): Promise<void> {
  const { aggregateId, eventType, tenantId } = payload;

  if (eventType.startsWith("procurement_case.")) {
    await upsertCaseFact(tenantId, aggregateId, deps.pool);
    await refreshContractExpiryForCase(tenantId, aggregateId, deps.pool);
  } else if (eventType.startsWith("case_award.")) {
    const caseId = await getCaseIdForAward(aggregateId, deps.pool);
    if (caseId) {
      await upsertCaseFact(tenantId, caseId, deps.pool);
      await refreshContractExpiryForCase(tenantId, caseId, deps.pool);
    }
  } else if (eventType.startsWith("rc_po_plan.")) {
    await refreshContractExpiryForPlan(tenantId, aggregateId, deps.pool);
  }
}

async function upsertCaseFact(tenantId: string, caseId: string, pool: Pool): Promise<void> {
  await pool.query(
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
    [tenantId, caseId],
  );
}

async function getCaseIdForAward(awardId: string, pool: Pool): Promise<string | null> {
  const result = await pool.query<{ case_id: string }>(
    "select case_id from procurement.case_awards where id = $1 limit 1",
    [awardId],
  );
  return result.rows[0]?.case_id ?? null;
}

async function refreshContractExpiryForCase(tenantId: string, caseId: string, pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from reporting.contract_expiry_facts where tenant_id = $1 and case_id = $2 and source_type = 'case_award'",
      [tenantId, caseId],
    );
    await client.query(
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
          and a.case_id = $2
          and a.deleted_at is null
          and a.po_validity_date is not null
      `,
      [tenantId, caseId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function refreshContractExpiryForPlan(tenantId: string, planId: string, pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from reporting.contract_expiry_facts where tenant_id = $1 and rc_po_plan_id = $2",
      [tenantId, planId],
    );
    await client.query(
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
          and p.id = $2
          and p.deleted_at is null
          and p.rc_po_validity_date is not null
      `,
      [tenantId, planId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
