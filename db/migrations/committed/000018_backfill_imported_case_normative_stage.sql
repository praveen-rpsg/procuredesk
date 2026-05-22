-- Backfill normative stage values missed by earlier tender bulk imports.

with derived as (
  select
    c.id,
    c.stage_code,
    case
      when c.status <> 'running' then null
      when c.pr_receipt_date is null or c.tentative_completion_date is null then null
      when c.tentative_completion_date <= c.pr_receipt_date then null
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 8 then 0
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 13 then 1
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 17 then 2
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 52 then 3
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 68 then 4
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 88 then 5
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 97 then 6
      when ((current_date - c.pr_receipt_date)::numeric / nullif((c.tentative_completion_date - c.pr_receipt_date), 0)) * 100 < 100 then 7
      else 8
    end as desired_stage_code
  from procurement.cases c
  where c.deleted_at is null
    and c.desired_stage_code is null
)
update procurement.cases c
set desired_stage_code = d.desired_stage_code,
    is_delayed = case
      when d.desired_stage_code is not null and d.stage_code < d.desired_stage_code then true
      else false
    end
from derived d
where c.id = d.id
  and d.desired_stage_code is not null;

update reporting.case_facts f
set desired_stage_code = c.desired_stage_code,
    updated_at = now()
from procurement.cases c
where f.case_id = c.id
  and f.tenant_id = c.tenant_id
  and f.desired_stage_code is distinct from c.desired_stage_code;
