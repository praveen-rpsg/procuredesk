-- Migration 000021: Tenant notification settings and onboarding manual toggle.
-- Keeps support contact and welcome-manual behavior tenant-configurable while
-- preserving the existing Microsoft Graph delivery integration.

create table if not exists ops.notification_settings (
  tenant_id uuid primary key references iam.tenants(id) on delete cascade,
  support_name text not null default 'Mr. Santanu Mukherjee',
  support_email citext not null default 'santanu.mukherjee@rpsg.in',
  support_phone text default '6297445379',
  welcome_manual_enabled boolean not null default true,
  welcome_manual_title text not null default 'ProcureDesk User Manual',
  created_at timestamptz not null default now(),
  created_by uuid references iam.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references iam.users(id),
  constraint notification_settings_support_name_check check (length(trim(support_name)) between 2 and 160),
  constraint notification_settings_support_email_check check (support_email::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint notification_settings_support_phone_check check (support_phone is null or length(trim(support_phone)) between 5 and 40),
  constraint notification_settings_manual_title_check check (length(trim(welcome_manual_title)) between 2 and 180)
);

insert into ops.notification_settings (tenant_id)
select id
from iam.tenants
on conflict (tenant_id) do nothing;

grant select, insert, update, delete on ops.notification_settings to procuredesk_app;

alter table ops.notification_settings enable row level security;

drop policy if exists tenant_isolation on ops.notification_settings;
create policy tenant_isolation on ops.notification_settings
  as restrictive to procuredesk_app
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
