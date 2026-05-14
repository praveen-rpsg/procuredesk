-- Migration 000010: user onboarding import credentials, email bodies, and password reset tokens

alter table ops.import_jobs
  add column if not exists credential_file_asset_id uuid references ops.file_assets(id) on delete set null,
  add column if not exists credential_export_expires_at timestamptz;

alter table ops.notification_jobs
  add column if not exists text_body text,
  add column if not exists html_body text;

alter table ops.notification_jobs
  drop constraint if exists notification_jobs_type_check;

alter table ops.notification_jobs
  add constraint notification_jobs_type_check check (
    notification_type in (
      'entity_monthly_digest',
      'rc_po_expiry',
      'stale_tender',
      'user_welcome',
      'password_reset'
    )
  );

create table if not exists iam.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references iam.tenants(id) on delete cascade,
  user_id uuid not null references iam.users(id) on delete cascade,
  token_hash text not null,
  requested_email citext not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  request_ip inet,
  user_agent text
);

do $$ begin
  if exists (select from pg_roles where rolname = 'procuredesk_app') then
    grant select, insert, update on iam.password_reset_tokens to procuredesk_app;
  end if;
end $$;

create unique index if not exists password_reset_tokens_hash_uidx
  on iam.password_reset_tokens (token_hash);

create index if not exists password_reset_tokens_user_active_idx
  on iam.password_reset_tokens (user_id, created_at desc)
  where used_at is null;

alter table iam.password_reset_tokens enable row level security;

drop policy if exists tenant_isolation on iam.password_reset_tokens;
do $$ begin
  if exists (select from pg_roles where rolname = 'procuredesk_app') then
    create policy tenant_isolation on iam.password_reset_tokens
      as restrictive to procuredesk_app
      using (tenant_id = current_tenant_id());
  end if;
end $$;
