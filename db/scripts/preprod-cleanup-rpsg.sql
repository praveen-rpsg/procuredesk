-- ProcureDesk pre-production cleanup for RPSG.
--
-- Target state:
--   - one tenant: RPSG
--   - one user: Praveen Vishnoi <praveen.vishnoi@rpsg.in>
--   - one assigned role for that user: Super Admin / platform_super_admin
--   - no entities, departments, cases, awards, planning rows, imports, exports,
--     sessions, tokens, report views, notification jobs, or operational history.
--
-- This script is intentionally destructive. Run it only after a verified backup.
--
-- Usage:
--   psql "$DATABASE_URL" \
--     -v cleanup_confirm=YES_CLEAN_RPSG_PREPROD \
--     -f db/scripts/preprod-cleanup-rpsg.sql
--
-- Recommended DB role:
--   procuredesk_cleanup_admin with SELECT/INSERT/UPDATE/DELETE/TRUNCATE on app schemas.

\set ON_ERROR_STOP on

select set_config('app.cleanup_confirm', :'cleanup_confirm', false);

do $$
begin
  if current_setting('app.cleanup_confirm', true) <> 'YES_CLEAN_RPSG_PREPROD' then
    raise exception
      'Refusing cleanup. Run with -v cleanup_confirm=YES_CLEAN_RPSG_PREPROD after backup.';
  end if;
end $$;

begin;

do $$
declare
  rpsg_tenant_id uuid;
  keep_user_id uuid;
  super_admin_role_id uuid;
begin
  select id
    into super_admin_role_id
  from iam.roles
  where tenant_id is null
    and code = 'platform_super_admin'
    and deleted_at is null
  limit 1;

  if super_admin_role_id is null then
    raise exception 'Missing system role iam.roles.code = platform_super_admin.';
  end if;

  insert into iam.tenants (code, name, status)
  values ('RPSG', 'RPSG', 'active')
  on conflict (code) do update
  set code = excluded.code,
      name = excluded.name,
      status = 'active',
      updated_at = now()
  returning id into rpsg_tenant_id;

  select id
    into keep_user_id
  from iam.users
  where email = 'praveen.vishnoi@rpsg.in'::citext
    and deleted_at is null
  order by
    case when tenant_id = rpsg_tenant_id then 0 else 1 end,
    created_at asc
  limit 1;

  if keep_user_id is null then
    insert into iam.users (
      tenant_id,
      email,
      username,
      full_name,
      access_level,
      status,
      is_platform_super_admin,
      failed_login_count,
      locked_until,
      created_at,
      updated_at
    )
    values (
      rpsg_tenant_id,
      'praveen.vishnoi@rpsg.in',
      'praveen.vishnoi',
      'Praveen Vishnoi',
      'GROUP',
      'pending_password_setup',
      true,
      0,
      null,
      now(),
      now()
    )
    returning id into keep_user_id;
  end if;

  update iam.users
  set tenant_id = rpsg_tenant_id,
      email = 'praveen.vishnoi@rpsg.in',
      username = 'praveen.vishnoi',
      full_name = 'Praveen Vishnoi',
      access_level = 'GROUP',
      is_platform_super_admin = true,
      status = case
        when password_hash is null then 'pending_password_setup'
        else 'active'
      end,
      failed_login_count = 0,
      locked_until = null,
      deleted_at = null,
      deleted_by = null,
      updated_at = now()
  where id = keep_user_id;

  insert into iam.password_policies (tenant_id)
  values (rpsg_tenant_id)
  on conflict (tenant_id) do nothing;

  -- Operational/reporting data.
  delete from reporting.contract_expiry_facts;
  delete from reporting.case_facts;
  delete from reporting.report_saved_views;

  delete from procurement.case_awards;
  delete from procurement.case_delays;
  delete from procurement.case_milestones;
  delete from procurement.case_financials;
  delete from procurement.tender_plan_cases;
  delete from procurement.rc_po_plans;
  delete from procurement.cases;

  delete from ops.import_job_rows;
  delete from ops.import_jobs;
  delete from ops.export_jobs;
  delete from ops.notification_jobs;
  delete from ops.notification_rules;
  delete from ops.outbox_events;
  delete from ops.dead_letter_events;
  delete from ops.file_assets;

  if to_regclass('ops.idempotent_requests') is not null then
    delete from ops.idempotent_requests;
  end if;

  -- Security/session state.
  delete from iam.sessions;
  delete from iam.password_reset_tokens;
  delete from iam.password_history;
  delete from ops.login_rate_limits;

  -- Tenant-owned master/setup data that must be loaded fresh for production.
  delete from iam.user_entity_scopes;
  delete from org.departments;
  delete from org.entities;
  delete from catalog.tender_type_completion_rules;
  delete from catalog.tender_types;
  delete from catalog.stage_policies;
  delete from catalog.reference_values;

  -- Remove tenant-specific categories and keep only system category templates.
  update catalog.reference_categories
  set created_by = null,
      updated_by = null,
      deleted_by = null
  where tenant_id is not null;

  delete from catalog.reference_categories
  where tenant_id is not null;

  -- Keep only system roles. Remove tenant custom roles.
  delete from iam.roles
  where tenant_id is not null;

  -- Reset user-role assignments to Praveen -> Super Admin only.
  delete from iam.user_roles;

  insert into iam.user_roles (user_id, role_id, assigned_by)
  values (keep_user_id, super_admin_role_id, keep_user_id)
  on conflict do nothing;

  -- Remove audit history, then leave one explicit cleanup event.
  delete from ops.audit_events;

  -- Clear user self-references before deleting non-kept users.
  update iam.users
  set created_by = case when id = keep_user_id then created_by else null end,
      updated_by = case when id = keep_user_id then keep_user_id else null end,
      deleted_by = null;

  update iam.users
  set created_by = null
  where created_by is not null
    and created_by <> keep_user_id;

  update iam.users
  set updated_by = null
  where updated_by is not null
    and updated_by <> keep_user_id;

  delete from iam.users
  where id <> keep_user_id;

  -- Remove every tenant except RPSG after tenant-owned rows/users are gone.
  delete from iam.password_policies
  where tenant_id <> rpsg_tenant_id;

  delete from iam.tenants
  where id <> rpsg_tenant_id;

  insert into ops.audit_events (
    tenant_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    summary,
    details
  )
  values (
    rpsg_tenant_id,
    keep_user_id,
    'system.preprod_cleanup',
    'tenant',
    rpsg_tenant_id,
    'Pre-production cleanup executed for RPSG target state.',
    jsonb_build_object(
      'tenant_code', 'RPSG',
      'remaining_user_email', 'praveen.vishnoi@rpsg.in',
      'remaining_user_role', 'platform_super_admin',
      'entities', 0,
      'departments', 0,
      'cases', 0
    )
  );
end $$;

do $$
declare
  validation_errors text[] := array[]::text[];
  actual_count integer;
  actual_text text;
begin
  select count(*) into actual_count from iam.tenants;
  if actual_count <> 1 then
    validation_errors := validation_errors || format('tenants expected 1, got %s', actual_count);
  end if;

  select code::text into actual_text from iam.tenants limit 1;
  if coalesce(actual_text, '') <> 'RPSG' then
    validation_errors := validation_errors || format('tenant code expected RPSG, got %s', coalesce(actual_text, '<null>'));
  end if;

  select count(*) into actual_count from iam.users where deleted_at is null;
  if actual_count <> 1 then
    validation_errors := validation_errors || format('active/non-deleted users expected 1, got %s', actual_count);
  end if;

  select email::text into actual_text from iam.users where deleted_at is null limit 1;
  if coalesce(actual_text, '') <> 'praveen.vishnoi@rpsg.in' then
    validation_errors := validation_errors || format('remaining user email mismatch: %s', coalesce(actual_text, '<null>'));
  end if;

  select count(*)
    into actual_count
  from iam.users u
  join iam.user_roles ur on ur.user_id = u.id
  join iam.roles r on r.id = ur.role_id
  where u.email = 'praveen.vishnoi@rpsg.in'::citext
    and r.code = 'platform_super_admin'
    and r.tenant_id is null
    and r.deleted_at is null;

  if actual_count <> 1 then
    validation_errors := validation_errors || format('Praveen Super Admin assignment expected 1, got %s', actual_count);
  end if;

  select count(*) into actual_count from org.entities;
  if actual_count <> 0 then validation_errors := validation_errors || format('entities expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from org.departments;
  if actual_count <> 0 then validation_errors := validation_errors || format('departments expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from procurement.cases;
  if actual_count <> 0 then validation_errors := validation_errors || format('cases expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from procurement.case_awards;
  if actual_count <> 0 then validation_errors := validation_errors || format('awards expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from procurement.tender_plan_cases;
  if actual_count <> 0 then validation_errors := validation_errors || format('tender plans expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from procurement.rc_po_plans;
  if actual_count <> 0 then validation_errors := validation_errors || format('RC/PO plans expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from ops.import_jobs;
  if actual_count <> 0 then validation_errors := validation_errors || format('import jobs expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from ops.export_jobs;
  if actual_count <> 0 then validation_errors := validation_errors || format('export jobs expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from iam.sessions;
  if actual_count <> 0 then validation_errors := validation_errors || format('sessions expected 0, got %s', actual_count); end if;

  select count(*) into actual_count from iam.password_reset_tokens;
  if actual_count <> 0 then validation_errors := validation_errors || format('password reset tokens expected 0, got %s', actual_count); end if;

  if array_length(validation_errors, 1) is not null then
    raise exception 'RPSG cleanup validation failed: %', array_to_string(validation_errors, '; ');
  end if;
end $$;

commit;

select 'tenants' as metric, count(*)::text as value from iam.tenants
union all
select 'tenant_code', string_agg(code::text, ', ' order by code::text) from iam.tenants
union all
select 'users', count(*)::text from iam.users where deleted_at is null
union all
select 'remaining_user', string_agg(email::text, ', ' order by email::text) from iam.users where deleted_at is null
union all
select 'roles_for_remaining_user', string_agg(r.name, ', ' order by r.name)
from iam.users u
join iam.user_roles ur on ur.user_id = u.id
join iam.roles r on r.id = ur.role_id
where u.deleted_at is null
union all
select 'entities', count(*)::text from org.entities
union all
select 'departments', count(*)::text from org.departments
union all
select 'cases', count(*)::text from procurement.cases
union all
select 'awards', count(*)::text from procurement.case_awards
union all
select 'tender_plans', count(*)::text from procurement.tender_plan_cases
union all
select 'rc_po_plans', count(*)::text from procurement.rc_po_plans
union all
select 'imports', count(*)::text from ops.import_jobs
union all
select 'exports', count(*)::text from ops.export_jobs
union all
select 'sessions', count(*)::text from iam.sessions
union all
select 'password_reset_tokens', count(*)::text from iam.password_reset_tokens
order by metric;
