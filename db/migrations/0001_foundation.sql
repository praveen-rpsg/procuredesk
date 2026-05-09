-- ProcureDesk PostgreSQL foundation schema.
-- This migration establishes the multi-tenant production data model baseline.

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists iam;
create schema if not exists org;
create schema if not exists catalog;
create schema if not exists procurement;
create schema if not exists reporting;
create schema if not exists ops;

create table iam.tenants (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_status_check check (status in ('active', 'suspended', 'archived'))
);

create table iam.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete restrict,
  email citext not null,
  username citext not null,
  full_name text not null,
  password_hash text,
  status text not null default 'pending_password_setup',
  is_platform_super_admin boolean not null default false,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id),
  constraint users_status_check check (
    status in ('pending_password_setup', 'active', 'inactive', 'locked')
  ),
  constraint tenant_required_unless_platform_admin check (
    tenant_id is not null or is_platform_super_admin = true
  )
);

create unique index users_email_active_uidx
  on iam.users (tenant_id, email)
  where deleted_at is null and tenant_id is not null;

create unique index users_username_active_uidx
  on iam.users (tenant_id, username)
  where deleted_at is null and tenant_id is not null;

create unique index platform_admin_email_active_uidx
  on iam.users (email)
  where deleted_at is null and is_platform_super_admin = true;

create table iam.password_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  min_length integer not null default 12,
  require_uppercase boolean not null default true,
  require_lowercase boolean not null default true,
  require_number boolean not null default true,
  require_special_character boolean not null default true,
  password_history_count integer not null default 5,
  lockout_attempts integer not null default 5,
  lockout_minutes integer not null default 15,
  force_periodic_expiry boolean not null default false,
  expiry_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_policy_length_check check (min_length >= 8),
  constraint password_policy_history_check check (password_history_count >= 0),
  constraint password_policy_lockout_check check (lockout_attempts > 0 and lockout_minutes > 0),
  constraint password_policy_expiry_check check (
    force_periodic_expiry = false or expiry_days is not null
  )
);

create unique index password_policies_tenant_uidx
  on iam.password_policies (tenant_id);

create table iam.password_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references iam.users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index password_history_user_created_idx
  on iam.password_history (user_id, created_at desc);

create table iam.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  code citext not null,
  name text not null,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint role_tenant_required_unless_system check (
    tenant_id is not null or is_system_role = true
  )
);

create unique index roles_code_active_uidx
  on iam.roles (tenant_id, code)
  where deleted_at is null and tenant_id is not null;

create unique index system_roles_code_active_uidx
  on iam.roles (code)
  where deleted_at is null and tenant_id is null;

create table iam.permissions (
  code citext primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table iam.role_permissions (
  role_id uuid not null references iam.roles(id) on delete cascade,
  permission_code citext not null references iam.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table iam.user_roles (
  user_id uuid not null references iam.users(id) on delete cascade,
  role_id uuid not null references iam.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references iam.users(id),
  primary key (user_id, role_id)
);

create table org.entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  code citext not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id)
);

create unique index entities_code_active_uidx
  on org.entities (tenant_id, code)
  where deleted_at is null;

create table org.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  entity_id uuid not null references org.entities(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id)
);

create unique index departments_entity_name_active_uidx
  on org.departments (tenant_id, entity_id, lower(name))
  where deleted_at is null;

create table iam.user_entity_scopes (
  user_id uuid not null references iam.users(id) on delete cascade,
  entity_id uuid not null references org.entities(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references iam.users(id),
  primary key (user_id, entity_id)
);

create table iam.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references iam.users(id) on delete cascade,
  tenant_id uuid references iam.tenants(id) on delete cascade,
  session_hash text not null unique,
  ip_address inet,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index sessions_user_active_idx
  on iam.sessions (user_id, expires_at desc)
  where revoked_at is null;

create table ops.login_rate_limits (
  key text primary key,
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index login_rate_limits_locked_idx
  on ops.login_rate_limits (locked_until)
  where locked_until is not null;

create table catalog.reference_categories (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  name text not null,
  is_system_category boolean not null default true,
  created_at timestamptz not null default now()
);

create table catalog.reference_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  category_id uuid not null references catalog.reference_categories(id) on delete restrict,
  code citext,
  label text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id)
);

create unique index reference_values_label_active_uidx
  on catalog.reference_values (tenant_id, category_id, lower(label))
  where deleted_at is null;

create table catalog.tender_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  name text not null,
  requires_full_milestone_form boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id)
);

create unique index tender_types_name_active_uidx
  on catalog.tender_types (tenant_id, lower(name))
  where deleted_at is null;

create table catalog.tender_type_completion_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  tender_type_id uuid not null references catalog.tender_types(id) on delete cascade,
  completion_days integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completion_days_check check (completion_days >= 0)
);

create unique index tender_type_completion_rules_type_uidx
  on catalog.tender_type_completion_rules (tenant_id, tender_type_id);

create table catalog.stage_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  stage_code integer not null,
  stage_label text not null,
  min_percent_elapsed numeric(5,2) not null,
  max_percent_elapsed numeric(5,2),
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_code_check check (stage_code between 0 and 8)
);

create unique index stage_policies_code_uidx
  on catalog.stage_policies (tenant_id, stage_code);

create table procurement.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  pr_id text not null,
  entity_id uuid not null references org.entities(id) on delete restrict,
  department_id uuid references org.departments(id) on delete restrict,
  tender_type_id uuid references catalog.tender_types(id) on delete restrict,
  pr_receiving_medium_id uuid references catalog.reference_values(id) on delete restrict,
  budget_type_id uuid references catalog.reference_values(id) on delete restrict,
  nature_of_work_id uuid references catalog.reference_values(id) on delete restrict,
  owner_user_id uuid references iam.users(id) on delete restrict,
  created_by uuid not null references iam.users(id) on delete restrict,
  status text not null default 'running',
  stage_code integer not null default 0,
  desired_stage_code integer,
  is_delayed boolean not null default false,
  priority_case boolean not null default false,
  cpc_involved boolean,
  pr_scheme_no text,
  pr_receipt_date date,
  pr_description text,
  pr_remarks text,
  tender_name text,
  tender_no text,
  tentative_completion_date date,
  tm_remarks text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id),
  delete_reason text,
  constraint cases_status_check check (status in ('running', 'completed')),
  constraint cases_stage_code_check check (stage_code between 0 and 8),
  constraint cases_desired_stage_code_check check (
    desired_stage_code is null or desired_stage_code between 0 and 8
  )
);

create unique index cases_pr_id_active_uidx
  on procurement.cases (tenant_id, pr_id)
  where deleted_at is null;

create index cases_tenant_updated_idx
  on procurement.cases (tenant_id, deleted_at, updated_at desc);

create index cases_entity_status_idx
  on procurement.cases (tenant_id, entity_id, status, updated_at desc)
  where deleted_at is null;

create index cases_owner_status_idx
  on procurement.cases (tenant_id, owner_user_id, status, updated_at desc)
  where deleted_at is null;

create index cases_pr_receipt_idx
  on procurement.cases (tenant_id, pr_receipt_date)
  where deleted_at is null;

create index cases_running_partial_idx
  on procurement.cases (tenant_id, updated_at desc)
  where deleted_at is null and status = 'running';

create index cases_completed_partial_idx
  on procurement.cases (tenant_id, updated_at desc)
  where deleted_at is null and status = 'completed';

create index cases_search_gin_idx
  on procurement.cases
  using gin (
    to_tsvector(
      'english',
      coalesce(pr_id, '') || ' ' ||
      coalesce(pr_scheme_no, '') || ' ' ||
      coalesce(pr_description, '') || ' ' ||
      coalesce(tender_name, '') || ' ' ||
      coalesce(tender_no, '') || ' ' ||
      coalesce(pr_remarks, '') || ' ' ||
      coalesce(tm_remarks, '')
    )
  );

create table procurement.case_financials (
  case_id uuid primary key references procurement.cases(id) on delete cascade,
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  pr_value numeric(18,2),
  estimate_benchmark numeric(18,2),
  approved_amount numeric(18,2),
  total_awarded_amount numeric(18,2) not null default 0,
  savings_wrt_pr numeric(18,2),
  savings_wrt_estimate numeric(18,2),
  updated_at timestamptz not null default now(),
  constraint case_financials_non_negative_check check (
    (pr_value is null or pr_value >= 0)
    and (estimate_benchmark is null or estimate_benchmark >= 0)
    and (approved_amount is null or approved_amount >= 0)
    and total_awarded_amount >= 0
  )
);

create table procurement.case_milestones (
  case_id uuid primary key references procurement.cases(id) on delete cascade,
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  nit_initiation_date date,
  nit_approval_date date,
  nit_publish_date date,
  bid_receipt_date date,
  bidders_participated integer,
  commercial_evaluation_date date,
  technical_evaluation_date date,
  qualified_bidders integer,
  nfa_submission_date date,
  nfa_approval_date date,
  loi_issued boolean not null default false,
  loi_issued_date date,
  rc_po_award_date date,
  rc_po_validity date,
  updated_at timestamptz not null default now(),
  constraint milestone_counts_non_negative_check check (
    (bidders_participated is null or bidders_participated >= 0)
    and (qualified_bidders is null or qualified_bidders >= 0)
  ),
  constraint loi_date_required_check check (
    loi_issued = false or loi_issued_date is not null
  )
);

create table procurement.case_delays (
  case_id uuid primary key references procurement.cases(id) on delete cascade,
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  delay_external_days integer,
  delay_reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  constraint delay_non_negative_check check (
    delay_external_days is null or delay_external_days >= 0
  ),
  constraint delay_reason_required_check check (
    coalesce(delay_external_days, 0) = 0 or nullif(trim(delay_reason), '') is not null
  )
);

create table procurement.case_awards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  case_id uuid not null references procurement.cases(id) on delete cascade,
  vendor_name text not null,
  vendor_code text,
  po_number text,
  po_value numeric(18,2),
  po_award_date date,
  po_validity_date date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id),
  constraint award_value_non_negative_check check (po_value is null or po_value >= 0),
  constraint award_validity_after_award_check check (
    po_award_date is null
    or po_validity_date is null
    or po_validity_date >= po_award_date
  )
);

create index case_awards_case_idx
  on procurement.case_awards (tenant_id, case_id)
  where deleted_at is null;

create index case_awards_validity_idx
  on procurement.case_awards (tenant_id, po_validity_date)
  where deleted_at is null;

create table procurement.rc_po_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  entity_id uuid not null references org.entities(id) on delete restrict,
  department_id uuid references org.departments(id) on delete restrict,
  source_case_id uuid references procurement.cases(id) on delete set null,
  tender_description text,
  awarded_vendors text,
  rc_po_amount numeric(18,2),
  rc_po_award_date date,
  rc_po_validity_date date,
  tentative_tendering_date date,
  tender_floated_or_not_required boolean not null default false,
  uploaded_by uuid references iam.users(id),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id),
  constraint rc_po_plan_validity_after_award_check check (
    rc_po_award_date is null
    or rc_po_validity_date is null
    or rc_po_validity_date >= rc_po_award_date
  )
);

create index rc_po_plans_expiry_idx
  on procurement.rc_po_plans (tenant_id, rc_po_validity_date)
  where deleted_at is null;

create table procurement.tender_plan_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  entity_id uuid not null references org.entities(id) on delete restrict,
  department_id uuid references org.departments(id) on delete restrict,
  tender_description text,
  value_rs numeric(18,2),
  planned_date date,
  cpc_involved boolean,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  deleted_by uuid references iam.users(id),
  constraint tender_plan_value_non_negative_check check (value_rs is null or value_rs >= 0)
);

create index tender_plan_cases_planned_idx
  on procurement.tender_plan_cases (tenant_id, planned_date)
  where deleted_at is null;

create table reporting.case_facts (
  case_id uuid primary key references procurement.cases(id) on delete cascade,
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  entity_id uuid not null,
  department_id uuid,
  owner_user_id uuid,
  tender_type_id uuid,
  status text not null,
  stage_code integer not null,
  desired_stage_code integer,
  is_delayed boolean not null,
  priority_case boolean not null,
  cpc_involved boolean,
  pr_receipt_date date,
  rc_po_award_date date,
  completion_fy text,
  value_slab text,
  rc_po_value_slab text,
  running_age_days integer,
  completed_age_days integer,
  current_stage_aging_days integer,
  pr_value numeric(18,2),
  estimate_benchmark numeric(18,2),
  approved_amount numeric(18,2),
  total_awarded_amount numeric(18,2),
  savings_wrt_pr numeric(18,2),
  savings_wrt_estimate numeric(18,2),
  updated_at timestamptz not null default now()
);

create index case_facts_report_idx
  on reporting.case_facts (tenant_id, status, entity_id, updated_at desc);

create index case_facts_owner_idx
  on reporting.case_facts (tenant_id, owner_user_id, status);

create table reporting.contract_expiry_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  case_id uuid references procurement.cases(id) on delete cascade,
  rc_po_plan_id uuid references procurement.rc_po_plans(id) on delete cascade,
  entity_id uuid not null,
  department_id uuid,
  owner_user_id uuid,
  tender_description text,
  awarded_vendors text,
  rc_po_amount numeric(18,2),
  rc_po_award_date date,
  rc_po_validity_date date not null,
  tentative_tendering_date date,
  tender_floated_or_not_required boolean not null,
  source_type text not null,
  updated_at timestamptz not null default now(),
  constraint contract_expiry_source_check check (source_type in ('case_award', 'manual_plan'))
);

create index contract_expiry_facts_date_idx
  on reporting.contract_expiry_facts (tenant_id, rc_po_validity_date);

create table reporting.report_saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  user_id uuid not null references iam.users(id) on delete cascade,
  report_code citext not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index report_saved_views_name_uidx
  on reporting.report_saved_views (tenant_id, user_id, report_code, lower(name));

create table ops.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  actor_user_id uuid references iam.users(id) on delete set null,
  action citext not null,
  target_type citext not null,
  target_id uuid,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create index audit_events_tenant_time_idx
  on ops.audit_events (tenant_id, occurred_at desc);

create index audit_events_actor_time_idx
  on ops.audit_events (tenant_id, actor_user_id, occurred_at desc);

create table ops.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  event_type citext not null,
  aggregate_type citext not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint outbox_status_check check (status in ('pending', 'processing', 'processed', 'failed', 'dead_letter'))
);

create index outbox_events_pending_idx
  on ops.outbox_events (status, available_at)
  where status in ('pending', 'failed');

create table ops.dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  source citext not null,
  source_id uuid not null,
  event_type citext not null,
  payload jsonb not null,
  error_message text not null,
  attempts integer not null,
  created_at timestamptz not null default now()
);

create index dead_letter_events_tenant_time_idx
  on ops.dead_letter_events (tenant_id, created_at desc);

create table ops.file_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  storage_key text not null,
  original_filename text,
  content_type text,
  byte_size bigint,
  checksum_sha256 text,
  purpose citext not null,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  deleted_at timestamptz
);

create unique index file_assets_storage_key_uidx
  on ops.file_assets (storage_key);

create table ops.import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  file_asset_id uuid not null references ops.file_assets(id) on delete restrict,
  import_type citext not null,
  status text not null default 'uploaded',
  progress_percent integer not null default 0,
  progress_message text,
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  rejected_rows integer not null default 0,
  staged_unknown_users integer not null default 0,
  staged_unknown_entities integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  completed_at timestamptz,
  committed_at timestamptz,
  committed_by uuid references iam.users(id),
  constraint import_jobs_progress_check check (
    progress_percent between 0 and 100
  ),
  constraint import_jobs_status_check check (
    status in ('uploaded', 'parsing', 'parsed', 'failed', 'committed', 'cancelled')
  )
);

create index import_jobs_tenant_status_idx
  on ops.import_jobs (tenant_id, status, created_at desc);

create table ops.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references ops.import_jobs(id) on delete cascade,
  row_number integer not null,
  status text not null,
  source_payload jsonb not null,
  normalized_payload jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_job_rows_status_check check (
    status in ('accepted', 'rejected', 'staged')
  )
);

create unique index import_job_rows_number_uidx
  on ops.import_job_rows (import_job_id, row_number);

create table ops.export_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  report_code citext not null,
  format citext not null,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  progress_percent integer not null default 0,
  progress_message text,
  file_asset_id uuid references ops.file_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  completed_at timestamptz,
  expires_at timestamptz,
  constraint export_jobs_format_check check (format in ('xlsx', 'csv')),
  constraint export_jobs_progress_check check (
    progress_percent between 0 and 100
  ),
  constraint export_jobs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'expired')
  )
);

create index export_jobs_tenant_status_idx
  on ops.export_jobs (tenant_id, status, created_at desc);

create table ops.notification_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  notification_type citext not null,
  is_enabled boolean not null default true,
  cadence citext not null default 'manual',
  threshold_days integer,
  recipient_mode citext not null default 'owner_or_entity',
  subject_template text,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  constraint notification_rules_type_check check (
    notification_type in ('entity_monthly_digest', 'rc_po_expiry', 'stale_tender')
  ),
  constraint notification_rules_cadence_check check (
    cadence in ('manual', 'daily', 'weekly', 'monthly')
  ),
  constraint notification_rules_recipient_mode_check check (
    recipient_mode in ('owner', 'entity_admin', 'owner_or_entity', 'explicit')
  ),
  constraint notification_rules_threshold_check check (
    threshold_days is null or threshold_days >= 0
  )
);

create unique index notification_rules_type_active_uidx
  on ops.notification_rules (tenant_id, notification_type)
  where deleted_at is null;

create table ops.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  notification_type citext not null,
  recipient_user_id uuid references iam.users(id) on delete set null,
  recipient_email citext not null,
  subject text not null,
  status text not null default 'queued',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_jobs_status_check check (
    status in ('queued', 'sending', 'sent', 'failed', 'cancelled')
  )
);

create index notification_jobs_status_idx
  on ops.notification_jobs (tenant_id, status, created_at desc);
