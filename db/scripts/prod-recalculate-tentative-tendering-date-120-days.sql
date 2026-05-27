-- Recalculate RC/PO Tentative Tendering Date using the current rule:
-- tentative_tendering_date = validity_date - 120 days
--
-- Dry run, no commit:
--   psql "$DATABASE_URL" -v apply=false -f db/scripts/prod-recalculate-tentative-tendering-date-120-days.sql
--
-- Apply and commit:
--   psql "$DATABASE_URL" -v apply=true -f db/scripts/prod-recalculate-tentative-tendering-date-120-days.sql

\set ON_ERROR_STOP on
\pset pager off

\if :{?apply}
\else
\set apply false
\endif

\echo 'Recalculating tentative_tendering_date as validity_date - 120 days'
\echo 'apply=' :apply

begin;

create temporary table _tentative_tendering_date_run as
select gen_random_uuid() as run_id;

create temporary table _tentative_tendering_date_changes as
select *
from (
  select
    'case_award'::text as source_type,
    a.tenant_id,
    a.id as source_id,
    a.case_id,
    a.po_number as reference_no,
    a.po_validity_date as validity_date,
    a.tentative_tendering_date as old_tentative_tendering_date,
    (a.po_validity_date - 120)::date as new_tentative_tendering_date,
    a.deleted_at as source_deleted_at
  from procurement.case_awards a
  where a.po_validity_date is not null

  union all

  select
    'manual_plan'::text as source_type,
    p.tenant_id,
    p.id as source_id,
    p.source_case_id as case_id,
    null::text as reference_no,
    p.rc_po_validity_date as validity_date,
    p.tentative_tendering_date as old_tentative_tendering_date,
    (p.rc_po_validity_date - 120)::date as new_tentative_tendering_date,
    p.deleted_at as source_deleted_at
  from procurement.rc_po_plans p
  where p.rc_po_validity_date is not null
) changes
where old_tentative_tendering_date is distinct from new_tentative_tendering_date;

\echo 'Summary of rows that will change'
select
  source_type,
  count(*) as rows_to_update,
  count(*) filter (where old_tentative_tendering_date is null) as currently_null,
  count(*) filter (where source_deleted_at is not null) as deleted_source_rows
from _tentative_tendering_date_changes
group by source_type
order by source_type;

\echo 'Sample rows that will change'
select
  source_type,
  tenant_id,
  source_id,
  case_id,
  reference_no,
  validity_date,
  old_tentative_tendering_date,
  new_tentative_tendering_date,
  source_deleted_at
from _tentative_tendering_date_changes
order by source_type, validity_date nulls last, source_id
limit 50;

create schema if not exists maintenance;

create table if not exists maintenance.tentative_tendering_date_120_backup (
  run_id uuid not null,
  captured_at timestamptz not null default now(),
  source_type text not null,
  tenant_id uuid not null,
  source_id uuid not null,
  case_id uuid,
  reference_no text,
  validity_date date,
  old_tentative_tendering_date date,
  new_tentative_tendering_date date,
  source_deleted_at timestamptz
);

insert into maintenance.tentative_tendering_date_120_backup (
  run_id,
  source_type,
  tenant_id,
  source_id,
  case_id,
  reference_no,
  validity_date,
  old_tentative_tendering_date,
  new_tentative_tendering_date,
  source_deleted_at
)
select
  run.run_id,
  changes.source_type,
  changes.tenant_id,
  changes.source_id,
  changes.case_id,
  changes.reference_no,
  changes.validity_date,
  changes.old_tentative_tendering_date,
  changes.new_tentative_tendering_date,
  changes.source_deleted_at
from _tentative_tendering_date_changes changes
cross join _tentative_tendering_date_run run;

\echo 'Backup run id'
select run_id from _tentative_tendering_date_run;

update procurement.case_awards a
set tentative_tendering_date = changes.new_tentative_tendering_date,
    updated_at = now()
from _tentative_tendering_date_changes changes
where changes.source_type = 'case_award'
  and changes.tenant_id = a.tenant_id
  and changes.source_id = a.id;

\echo 'Updated procurement.case_awards rows'
select count(*) as updated_case_awards
from _tentative_tendering_date_changes
where source_type = 'case_award';

update procurement.rc_po_plans p
set tentative_tendering_date = changes.new_tentative_tendering_date,
    updated_at = now()
from _tentative_tendering_date_changes changes
where changes.source_type = 'manual_plan'
  and changes.tenant_id = p.tenant_id
  and changes.source_id = p.id;

\echo 'Updated procurement.rc_po_plans rows'
select count(*) as updated_manual_plans
from _tentative_tendering_date_changes
where source_type = 'manual_plan';

update reporting.contract_expiry_facts f
set tentative_tendering_date = changes.new_tentative_tendering_date,
    updated_at = now()
from _tentative_tendering_date_changes changes
where changes.source_type = 'case_award'
  and changes.tenant_id = f.tenant_id
  and changes.source_id = f.case_award_id
  and f.source_type = 'case_award';

\echo 'Updated reporting.contract_expiry_facts case_award rows'
select count(*) as updated_case_award_facts
from _tentative_tendering_date_changes changes
join reporting.contract_expiry_facts f
  on f.tenant_id = changes.tenant_id
 and f.case_award_id = changes.source_id
 and f.source_type = 'case_award'
where changes.source_type = 'case_award';

update reporting.contract_expiry_facts f
set tentative_tendering_date = changes.new_tentative_tendering_date,
    updated_at = now()
from _tentative_tendering_date_changes changes
where changes.source_type = 'manual_plan'
  and changes.tenant_id = f.tenant_id
  and changes.source_id = f.rc_po_plan_id
  and f.source_type = 'manual_plan';

\echo 'Updated reporting.contract_expiry_facts manual_plan rows'
select count(*) as updated_manual_plan_facts
from _tentative_tendering_date_changes changes
join reporting.contract_expiry_facts f
  on f.tenant_id = changes.tenant_id
 and f.rc_po_plan_id = changes.source_id
 and f.source_type = 'manual_plan'
where changes.source_type = 'manual_plan';

\if :apply
commit;
\echo 'COMMITTED tentative_tendering_date recalculation.'
\else
rollback;
\echo 'DRY RUN ONLY. Rolled back all changes. Re-run with -v apply=true to commit.'
\endif
