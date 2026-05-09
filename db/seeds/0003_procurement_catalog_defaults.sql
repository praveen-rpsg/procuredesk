-- ProcureDesk tenant catalog defaults.
-- Idempotent seed for procurement dropdown values and tender type completion rules.

with tenants as (
  select id
  from iam.tenants
  where status = 'active'
),
defaults(category_code, label, display_order) as (
  values
    ('pr_receiving_medium', 'E-mail', 10),
    ('pr_receiving_medium', 'System', 20),
    ('budget_type', 'Capex', 10),
    ('budget_type', 'Opex', 20),
    ('budget_type', 'Capex+Opex', 30),
    ('budget_type', 'Customer Deposit', 40),
    ('budget_type', 'Govt. Funded', 50),
    ('nature_of_work', 'Supply', 10),
    ('nature_of_work', 'Service', 20),
    ('nature_of_work', 'Composite', 30)
)
insert into catalog.reference_values (
  tenant_id, category_id, label, display_order, is_active
)
select t.id, rc.id, d.label, d.display_order, true
from tenants t
join defaults d on true
join catalog.reference_categories rc on rc.code = d.category_code
on conflict (tenant_id, category_id, lower(label)) where deleted_at is null
do update set
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

with tenants as (
  select id
  from iam.tenants
  where status = 'active'
),
defaults(name, completion_days, display_order) as (
  values
    ('Amendment', 14, 10),
    ('Limited', 39, 20),
    ('Open', 59, 30),
    ('Regularization', 14, 40),
    ('Release Order', 14, 50),
    ('Repeat', 14, 60),
    ('Single Party', 14, 70)
),
upserted_tender_types as (
  insert into catalog.tender_types (
    tenant_id, name, requires_full_milestone_form, is_active
  )
  select t.id, d.name, false, true
  from tenants t
  join defaults d on true
  on conflict (tenant_id, lower(name)) where deleted_at is null
  do update set
    is_active = true,
    updated_at = now()
  returning id, tenant_id, name
)
insert into catalog.tender_type_completion_rules (
  tenant_id, tender_type_id, completion_days
)
select utt.tenant_id, utt.id, d.completion_days
from upserted_tender_types utt
join defaults d on lower(d.name) = lower(utt.name)
on conflict (tenant_id, tender_type_id)
do update set
  completion_days = excluded.completion_days,
  updated_at = now();
