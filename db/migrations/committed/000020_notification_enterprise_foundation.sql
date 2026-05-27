-- Migration 000020: Enterprise notification foundation.
-- Adds governed templates, schedules, preferences, events, attachments, and
-- provider delivery attempts around the existing notification_rules/jobs tables.

alter table ops.notification_jobs
  add column if not exists template_id uuid,
  add column if not exists template_version_id uuid,
  add column if not exists notification_event_id uuid,
  add column if not exists schedule_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists target_type citext,
  add column if not exists target_id uuid,
  add column if not exists payload_json jsonb not null default '{}'::jsonb,
  add column if not exists priority integer not null default 5,
  add column if not exists scheduled_for timestamptz,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists next_retry_at timestamptz,
  add column if not exists provider_response jsonb,
  add column if not exists correlation_id text,
  add column if not exists idempotency_key text,
  add column if not exists rendered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table ops.notification_jobs
  drop constraint if exists notification_jobs_status_check;

alter table ops.notification_jobs
  add constraint notification_jobs_status_check check (
    status in ('queued', 'sending', 'sent', 'failed', 'cancelled', 'dead_letter', 'skipped')
  );

alter table ops.notification_jobs
  add constraint notification_jobs_attempts_check check (
    attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts
  );

alter table ops.notification_jobs
  add constraint notification_jobs_priority_check check (priority between 1 and 10);

create table ops.notification_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  notification_type citext not null,
  code citext not null,
  name text not null,
  description text,
  category citext not null,
  channel citext not null default 'email',
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  constraint notification_templates_channel_check check (channel in ('email')),
  constraint notification_templates_type_check check (
    notification_type in (
      'delayed_case_alert',
      'entity_monthly_digest',
      'export_ready',
      'import_completed',
      'import_failed',
      'manager_daily_snapshot',
      'off_track_case_alert',
      'password_changed',
      'password_reset',
      'rc_po_expiry',
      'security_alert',
      'stale_tender',
      'user_welcome'
    )
  )
);

create unique index notification_templates_code_active_uidx
  on ops.notification_templates (tenant_id, code)
  where deleted_at is null;

create unique index notification_templates_type_active_uidx
  on ops.notification_templates (tenant_id, notification_type, channel)
  where deleted_at is null and is_active = true;

create table ops.notification_template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  template_id uuid not null references ops.notification_templates(id) on delete cascade,
  version_number integer not null,
  status citext not null default 'draft',
  renderer_key citext not null,
  subject_template text not null,
  preheader_template text not null,
  payload_schema jsonb not null default '{}'::jsonb,
  design_tokens jsonb not null default '{}'::jsonb,
  sample_payload jsonb not null default '{}'::jsonb,
  change_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  constraint notification_template_versions_status_check check (
    status in ('draft', 'published', 'archived')
  ),
  constraint notification_template_versions_number_check check (version_number > 0)
);

create unique index notification_template_versions_number_uidx
  on ops.notification_template_versions (tenant_id, template_id, version_number);

create unique index notification_template_versions_published_uidx
  on ops.notification_template_versions (tenant_id, template_id)
  where status = 'published';

alter table ops.notification_jobs
  add constraint notification_jobs_template_fk
  foreign key (template_id) references ops.notification_templates(id) on delete set null;

alter table ops.notification_jobs
  add constraint notification_jobs_template_version_fk
  foreign key (template_version_id) references ops.notification_template_versions(id) on delete set null;

create table ops.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  schedule_key citext not null,
  notification_type citext not null,
  template_id uuid references ops.notification_templates(id) on delete set null,
  name text not null,
  description text,
  is_enabled boolean not null default true,
  cadence citext not null,
  interval_days integer,
  day_of_month integer,
  run_time time,
  timezone text not null default 'Asia/Kolkata',
  threshold_days integer,
  recipient_mode citext not null default 'owner_or_entity',
  condition_json jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status citext not null default 'never_run',
  last_error_message text,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  constraint notification_schedules_type_check check (
    notification_type in (
      'delayed_case_alert',
      'entity_monthly_digest',
      'export_ready',
      'import_completed',
      'import_failed',
      'manager_daily_snapshot',
      'off_track_case_alert',
      'password_changed',
      'password_reset',
      'rc_po_expiry',
      'security_alert',
      'stale_tender',
      'user_welcome'
    )
  ),
  constraint notification_schedules_cadence_check check (
    cadence in ('instant', 'manual', 'daily', 'every_n_days', 'weekly', 'monthly')
  ),
  constraint notification_schedules_interval_check check (
    interval_days is null or interval_days > 0
  ),
  constraint notification_schedules_day_check check (
    day_of_month is null or day_of_month between 1 and 31
  ),
  constraint notification_schedules_threshold_check check (
    threshold_days is null or threshold_days >= 0
  ),
  constraint notification_schedules_recipient_mode_check check (
    recipient_mode in ('owner', 'entity_admin', 'entity_admin_and_group_viewer', 'group_viewer', 'owner_or_entity', 'explicit')
  ),
  constraint notification_schedules_last_status_check check (
    last_status in ('never_run', 'running', 'succeeded', 'failed', 'skipped', 'paused')
  )
);

create unique index notification_schedules_key_active_uidx
  on ops.notification_schedules (tenant_id, schedule_key)
  where deleted_at is null;

create index notification_schedules_due_idx
  on ops.notification_schedules (tenant_id, is_enabled, next_run_at)
  where deleted_at is null and is_enabled = true;

create table ops.notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  schedule_id uuid references ops.notification_schedules(id) on delete set null,
  notification_type citext not null,
  event_key text not null,
  event_window_start timestamptz,
  event_window_end timestamptz,
  status citext not null default 'queued',
  target_type citext,
  target_id uuid,
  entity_id uuid references org.entities(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0,
  job_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  constraint notification_events_type_check check (
    notification_type in (
      'delayed_case_alert',
      'entity_monthly_digest',
      'export_ready',
      'import_completed',
      'import_failed',
      'manager_daily_snapshot',
      'off_track_case_alert',
      'password_changed',
      'password_reset',
      'rc_po_expiry',
      'security_alert',
      'stale_tender',
      'user_welcome'
    )
  ),
  constraint notification_events_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'skipped')
  ),
  constraint notification_events_counts_check check (
    recipient_count >= 0 and job_count >= 0
  )
);

create unique index notification_events_key_uidx
  on ops.notification_events (tenant_id, event_key);

create index notification_events_status_idx
  on ops.notification_events (tenant_id, status, created_at desc);

alter table ops.notification_jobs
  add constraint notification_jobs_event_fk
  foreign key (notification_event_id) references ops.notification_events(id) on delete set null;

alter table ops.notification_jobs
  add constraint notification_jobs_schedule_fk
  foreign key (schedule_id) references ops.notification_schedules(id) on delete set null;

alter table ops.notification_jobs
  add constraint notification_jobs_entity_fk
  foreign key (entity_id) references org.entities(id) on delete set null;

create unique index notification_jobs_idempotency_uidx
  on ops.notification_jobs (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index notification_jobs_retry_idx
  on ops.notification_jobs (tenant_id, status, next_retry_at)
  where status in ('queued', 'failed');

create index notification_jobs_recipient_idx
  on ops.notification_jobs (tenant_id, recipient_email, created_at desc);

create index notification_jobs_target_idx
  on ops.notification_jobs (tenant_id, target_type, target_id)
  where target_type is not null and target_id is not null;

create table ops.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  notification_job_id uuid not null references ops.notification_jobs(id) on delete cascade,
  attempt_number integer not null,
  status citext not null,
  provider citext not null default 'microsoft_graph',
  provider_message_id text,
  provider_request_id text,
  provider_response jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  constraint notification_delivery_attempts_number_check check (attempt_number > 0),
  constraint notification_delivery_attempts_status_check check (
    status in ('sending', 'sent', 'failed')
  ),
  constraint notification_delivery_attempts_duration_check check (
    duration_ms is null or duration_ms >= 0
  )
);

create unique index notification_delivery_attempts_job_number_uidx
  on ops.notification_delivery_attempts (tenant_id, notification_job_id, attempt_number);

create index notification_delivery_attempts_job_idx
  on ops.notification_delivery_attempts (tenant_id, notification_job_id, started_at desc);

create table ops.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  user_id uuid not null references iam.users(id) on delete cascade,
  entity_id uuid references org.entities(id) on delete cascade,
  notification_type citext not null,
  channel citext not null default 'email',
  is_enabled boolean not null default true,
  frequency citext not null default 'default',
  is_mandatory boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  deleted_at timestamptz,
  constraint notification_preferences_type_check check (
    notification_type in (
      'delayed_case_alert',
      'entity_monthly_digest',
      'export_ready',
      'import_completed',
      'import_failed',
      'manager_daily_snapshot',
      'off_track_case_alert',
      'password_changed',
      'password_reset',
      'rc_po_expiry',
      'security_alert',
      'stale_tender',
      'user_welcome'
    )
  ),
  constraint notification_preferences_channel_check check (channel in ('email')),
  constraint notification_preferences_frequency_check check (
    frequency in ('default', 'immediate', 'daily', 'weekly', 'monthly', 'disabled')
  ),
  constraint notification_preferences_mandatory_check check (
    is_mandatory = false or is_enabled = true
  )
);

create unique index notification_preferences_user_global_uidx
  on ops.notification_preferences (tenant_id, user_id, notification_type, channel)
  where entity_id is null and deleted_at is null;

create unique index notification_preferences_user_entity_uidx
  on ops.notification_preferences (tenant_id, user_id, entity_id, notification_type, channel)
  where entity_id is not null and deleted_at is null;

create index notification_preferences_lookup_idx
  on ops.notification_preferences (tenant_id, user_id, notification_type, channel)
  where deleted_at is null;

create table ops.email_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iam.tenants(id) on delete cascade,
  notification_job_id uuid references ops.notification_jobs(id) on delete cascade,
  notification_event_id uuid references ops.notification_events(id) on delete set null,
  file_asset_id uuid references ops.file_assets(id) on delete set null,
  attachment_kind citext not null,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint,
  checksum_sha256 text,
  status citext not null default 'pending',
  expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  constraint email_attachments_status_check check (
    status in ('pending', 'generated', 'attached', 'failed', 'skipped')
  ),
  constraint email_attachments_size_check check (
    file_size_bytes is null or file_size_bytes >= 0
  )
);

create index email_attachments_job_idx
  on ops.email_attachments (tenant_id, notification_job_id, created_at desc);

create index email_attachments_event_idx
  on ops.email_attachments (tenant_id, notification_event_id, created_at desc);

grant select, insert, update, delete on
  ops.notification_templates,
  ops.notification_template_versions,
  ops.notification_schedules,
  ops.notification_events,
  ops.notification_delivery_attempts,
  ops.notification_preferences,
  ops.email_attachments
to procuredesk_app;

alter table ops.notification_templates enable row level security;
alter table ops.notification_template_versions enable row level security;
alter table ops.notification_schedules enable row level security;
alter table ops.notification_events enable row level security;
alter table ops.notification_delivery_attempts enable row level security;
alter table ops.notification_preferences enable row level security;
alter table ops.email_attachments enable row level security;

create policy tenant_isolation on ops.notification_templates
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ops.notification_template_versions
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ops.notification_schedules
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ops.notification_events
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ops.notification_delivery_attempts
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ops.notification_preferences
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ops.email_attachments
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id());

insert into ops.notification_templates (
  tenant_id, notification_type, code, name, description, category, channel, is_system, is_active
)
select
  t.id,
  template.notification_type,
  template.code,
  template.name,
  template.description,
  template.category,
  'email',
  true,
  true
from iam.tenants t
cross join (
  values
    ('user_welcome'::citext, 'welcome_email'::citext, 'Welcome Email'::text, 'Account setup email for newly created users.'::text, 'Account'::citext),
    ('password_reset'::citext, 'forgot_password_email'::citext, 'Forgot Password Email'::text, 'Security-first password reset email.'::text, 'Security'::citext),
    ('password_changed'::citext, 'password_changed_email'::citext, 'Password Changed Email'::text, 'Confirmation email after password change.'::text, 'Security'::citext),
    ('manager_daily_snapshot'::citext, 'procurement_snapshot_email'::citext, 'Procurement Snapshot Email'::text, 'Executive procurement KPI snapshot with report links and PDF attachment.'::text, 'Reports'::citext),
    ('stale_tender'::citext, 'pending_tender_update_alert'::citext, 'Pending Tender Update Alert'::text, 'Tender-owner alert for running tenders with no update for more than the configured threshold.'::text, 'Cases'::citext),
    ('entity_monthly_digest'::citext, 'monthly_pending_tender_report'::citext, 'Monthly Pending Tender Report'::text, 'Manager report for stale running tender updates.'::text, 'Reports'::citext),
    ('rc_po_expiry'::citext, 'rc_po_expiry_alert'::citext, 'RC/PO Expiry Alert'::text, 'Monthly RC/PO expiry alert with Excel attachment.'::text, 'Planning'::citext),
    ('delayed_case_alert'::citext, 'delayed_case_alert'::citext, 'Delayed Case Alert'::text, 'Operational alert for delayed procurement cases.'::text, 'Cases'::citext),
    ('off_track_case_alert'::citext, 'off_track_case_alert'::citext, 'Off-Track Case Alert'::text, 'Operational alert for cases behind expected stage.'::text, 'Cases'::citext),
    ('export_ready'::citext, 'export_ready_email'::citext, 'Export Ready Email'::text, 'Report export completion email.'::text, 'Exports'::citext),
    ('import_completed'::citext, 'import_completed_email'::citext, 'Import Completed Email'::text, 'Import completion email.'::text, 'Imports'::citext),
    ('import_failed'::citext, 'import_failed_email'::citext, 'Import Failed Email'::text, 'Import failure email.'::text, 'Imports'::citext),
    ('security_alert'::citext, 'security_alert_email'::citext, 'Security Alert Email'::text, 'Security-sensitive activity notification.'::text, 'Security'::citext)
) as template(notification_type, code, name, description, category)
on conflict (tenant_id, code) where deleted_at is null do nothing;

insert into ops.notification_template_versions (
  tenant_id, template_id, version_number, status, renderer_key,
  subject_template, preheader_template, payload_schema, design_tokens,
  sample_payload, change_note, published_at
)
select
  nt.tenant_id,
  nt.id,
  1,
  'published',
  seed.renderer_key,
  seed.subject_template,
  seed.preheader_template,
  '{}'::jsonb,
  jsonb_build_object('brand', 'ProcureDesk', 'organization', 'RPSG'),
  seed.sample_payload,
  'Initial enterprise notification template baseline.',
  now()
from ops.notification_templates nt
join (
  values
    ('welcome_email'::citext, 'welcome'::citext, 'Welcome to Procurement KPI Tracking Portal – Complete Your Account Setup'::text, 'Complete your ProcureDesk account setup within 24 hours.'::text, jsonb_build_object('firstName', 'Asha', 'fullName', 'Asha Rao', 'expiresIn', '24 hours')),
    ('forgot_password_email'::citext, 'password_reset'::citext, 'Reset your ProcureDesk password'::text, 'Use the secure link to reset your ProcureDesk password.'::text, jsonb_build_object('firstName', 'Asha', 'expiresIn', '1 hour')),
    ('password_changed_email'::citext, 'password_changed'::citext, 'Your ProcureDesk password was changed'::text, 'Your ProcureDesk password was changed.'::text, jsonb_build_object('firstName', 'Asha')),
    ('procurement_snapshot_email'::citext, 'procurement_snapshot'::citext, 'Procurement Dashboard'::text, 'Your procurement dashboard snapshot is ready.'::text, jsonb_build_object('firstName', 'Asha', 'scopeLabel', 'CESC')),
    ('pending_tender_update_alert'::citext, 'pending_tender_update_alert'::citext, 'Alert for Pending Tender Progress Updates'::text, 'Running tenders need status updates.'::text, jsonb_build_object('firstName', 'Asha', 'thresholdDays', 10)),
    ('monthly_pending_tender_report'::citext, 'monthly_pending_tender_report'::citext, 'Alert: Pending Tender Progress Updates'::text, 'Monthly pending tender update report is ready.'::text, jsonb_build_object('firstName', 'Asha', 'thresholdDays', 10)),
    ('rc_po_expiry_alert'::citext, 'rc_po_expiry_alert'::citext, 'Alert: RC/PO Expiring in next 90 days'::text, 'RC/PO contracts are approaching expiry.'::text, jsonb_build_object('firstName', 'Asha', 'thresholdDays', 90)),
    ('delayed_case_alert'::citext, 'generic_notification'::citext, 'Delayed procurement case'::text, 'A procurement case is delayed and needs attention.'::text, '{}'::jsonb),
    ('off_track_case_alert'::citext, 'generic_notification'::citext, 'Off-track procurement case'::text, 'A procurement case is off track.'::text, '{}'::jsonb),
    ('export_ready_email'::citext, 'generic_notification'::citext, 'Export ready'::text, 'Your ProcureDesk export is ready.'::text, '{}'::jsonb),
    ('import_completed_email'::citext, 'generic_notification'::citext, 'Import completed'::text, 'A ProcureDesk import completed successfully.'::text, '{}'::jsonb),
    ('import_failed_email'::citext, 'generic_notification'::citext, 'Import failed'::text, 'A ProcureDesk import failed and needs review.'::text, '{}'::jsonb),
    ('security_alert_email'::citext, 'generic_notification'::citext, 'Security alert'::text, 'A ProcureDesk security event needs review.'::text, '{}'::jsonb)
) as seed(code, renderer_key, subject_template, preheader_template, sample_payload)
  on seed.code = nt.code
on conflict (tenant_id, template_id, version_number) do nothing;

insert into ops.notification_schedules (
  tenant_id, schedule_key, notification_type, template_id, name, description,
  is_enabled, cadence, interval_days, day_of_month, run_time, timezone,
  threshold_days, recipient_mode, condition_json, last_status
)
select
  t.id,
  seed.schedule_key,
  seed.notification_type,
  nt.id,
  seed.name,
  seed.description,
  seed.is_enabled,
  seed.cadence,
  seed.interval_days,
  seed.day_of_month,
  seed.run_time,
  'Asia/Kolkata',
  seed.threshold_days,
  seed.recipient_mode,
  seed.condition_json,
  'never_run'
from iam.tenants t
join (
  values
    ('welcome_email_instant'::citext, 'user_welcome'::citext, 'Welcome Email'::text, 'Instant account setup email when a user is created.'::text, true, 'instant'::citext, null::integer, null::integer, null::time, null::integer, 'explicit'::citext, jsonb_build_object('trigger', 'user_created')),
    ('forgot_password_instant'::citext, 'password_reset'::citext, 'Forgot Password Email'::text, 'Instant password reset email when requested by a user.'::text, true, 'instant'::citext, null::integer, null::integer, null::time, null::integer, 'explicit'::citext, jsonb_build_object('trigger', 'forgot_password')),
    ('procurement_snapshot_daily'::citext, 'manager_daily_snapshot'::citext, 'Procurement Snapshot - Entity Users'::text, 'Daily 10:00 AM IST procurement dashboard for entity-scoped managers and viewers.'::text, true, 'daily'::citext, null::integer, null::integer, '10:00'::time, null::integer, 'entity_admin'::citext, jsonb_build_object('scope', 'entity')),
    ('procurement_snapshot_group_every_third_day'::citext, 'manager_daily_snapshot'::citext, 'Procurement Snapshot - Group Viewers'::text, 'Every third day 10:00 AM IST procurement dashboard for group viewers.'::text, true, 'every_n_days'::citext, 3::integer, null::integer, '10:00'::time, null::integer, 'group_viewer'::citext, jsonb_build_object('scope', 'group')),
    ('pending_tender_update_alert_every_third_day'::citext, 'stale_tender'::citext, 'Pending Tender Update Alert'::text, 'Every 3 days at 11:00 AM IST for running tenders not updated beyond threshold.'::text, true, 'every_n_days'::citext, 3::integer, null::integer, '11:00'::time, 10::integer, 'owner'::citext, jsonb_build_object('status', 'running', 'lastUpdateOlderThanDays', 10)),
    ('monthly_pending_tender_report'::citext, 'entity_monthly_digest'::citext, 'Monthly Pending Tender Report'::text, 'Monthly manager report on stale running tender updates.'::text, true, 'monthly'::citext, null::integer, 1::integer, '11:00'::time, 10::integer, 'entity_admin'::citext, jsonb_build_object('status', 'running', 'lastUpdateOlderThanDays', 10)),
    ('monthly_rc_po_expiry_report'::citext, 'rc_po_expiry'::citext, 'Monthly RC/PO Expiry Alert'::text, 'Monthly 09:30 AM IST RC/PO expiry alert for contracts expiring within threshold.'::text, true, 'monthly'::citext, null::integer, 1::integer, '09:30'::time, 90::integer, 'entity_admin_and_group_viewer'::citext, jsonb_build_object('daysRemainingLte', 90))
) as seed(
  schedule_key, notification_type, name, description, is_enabled, cadence,
  interval_days, day_of_month, run_time, threshold_days, recipient_mode, condition_json
)
  on true
left join ops.notification_templates nt
  on nt.tenant_id = t.id
 and nt.notification_type = seed.notification_type
 and nt.channel = 'email'
 and nt.deleted_at is null
 and nt.is_active = true
on conflict (tenant_id, schedule_key) where deleted_at is null do nothing;
