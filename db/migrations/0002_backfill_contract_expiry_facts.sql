-- Backfill RC/PO expiry facts from Tender DB awards and bulk/manual RC/PO plans.

delete from reporting.contract_expiry_facts;

insert into reporting.contract_expiry_facts (
  tenant_id, case_id, case_award_id, entity_id, department_id, owner_user_id,
  budget_type_id, nature_of_work_id, tender_description, awarded_vendors,
  rc_po_amount, rc_po_award_date, rc_po_validity_date, tentative_tendering_date,
  tender_floated_or_not_required, source_deleted_at, source_type, updated_at
)
select
  c.tenant_id,
  c.id,
  a.id,
  c.entity_id,
  c.department_id,
  c.owner_user_id,
  c.budget_type_id,
  c.nature_of_work_id,
  coalesce(c.tender_name, c.pr_description),
  a.vendor_name,
  a.po_value,
  a.po_award_date,
  a.po_validity_date,
  coalesce(a.tentative_tendering_date, a.po_award_date + 150),
  a.tender_floated_or_not_required,
  coalesce(a.deleted_at, c.deleted_at),
  'case_award',
  now()
from procurement.case_awards a
join procurement.cases c on c.id = a.case_id and c.tenant_id = a.tenant_id
where a.po_validity_date is not null;

insert into reporting.contract_expiry_facts (
  tenant_id, rc_po_plan_id, case_id, entity_id, department_id,
  owner_user_id, budget_type_id, nature_of_work_id, tender_description,
  awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
  tentative_tendering_date, tender_floated_or_not_required, source_deleted_at,
  source_type, updated_at
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
where p.rc_po_validity_date is not null;
