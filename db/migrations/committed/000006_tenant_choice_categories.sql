-- Tenant-owned choice list categories.
-- Existing system categories remain global with tenant_id = null.

alter table catalog.reference_categories
  add column if not exists tenant_id uuid references iam.tenants(id) on delete cascade,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references iam.users(id),
  add column if not exists updated_by uuid references iam.users(id),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references iam.users(id);

alter table catalog.reference_categories
  drop constraint if exists reference_categories_code_key;

create unique index if not exists reference_categories_system_code_active_uidx
  on catalog.reference_categories (lower(code::text))
  where tenant_id is null and deleted_at is null;

create unique index if not exists reference_categories_tenant_code_active_uidx
  on catalog.reference_categories (tenant_id, lower(code::text))
  where tenant_id is not null and deleted_at is null;
