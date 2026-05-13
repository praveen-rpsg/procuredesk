-- ProcureDesk local bootstrap seed.
-- This is intentionally local-only and does not create default passwords.

with tenant_row as (
  insert into iam.tenants (code, name, status)
  values ('local', 'Local ProcureDesk Tenant', 'active')
  on conflict (code) do update
  set name = excluded.name,
      status = 'active',
      updated_at = now()
  returning id
),
platform_existing as (
  select id
  from iam.users
  where email = 'platform.admin@procuredesk.local'
    and is_platform_super_admin = true
    and deleted_at is null
),
platform_inserted as (
  insert into iam.users (
    tenant_id, email, username, full_name, access_level, status, is_platform_super_admin
  )
  select
    null,
    'platform.admin@procuredesk.local',
    'platform.admin',
    'Platform Admin',
    'GROUP',
    'pending_password_setup',
    true
  where not exists (select 1 from platform_existing)
  returning id
),
platform_admin as (
  select id from platform_existing
  union all
  select id from platform_inserted
),
tenant_existing as (
  select u.id
  from iam.users u
  join tenant_row t on t.id = u.tenant_id
  where u.email = 'tenant.admin@procuredesk.local'
    and u.deleted_at is null
),
tenant_inserted as (
  insert into iam.users (
    tenant_id, email, username, full_name, access_level, status, created_by, updated_by
  )
  select
    t.id,
    'tenant.admin@procuredesk.local',
    'tenant.admin',
    'Tenant Admin',
    'GROUP',
    'pending_password_setup',
    p.id,
    p.id
  from tenant_row t
  cross join platform_admin p
  where not exists (select 1 from tenant_existing)
  returning id
),
tenant_admin as (
  select id from tenant_existing
  union all
  select id from tenant_inserted
),
tenant_role as (
  select id
  from iam.roles
  where tenant_id is null
    and code = 'tenant_admin'
    and deleted_at is null
),
entity_row as (
  insert into org.entities (tenant_id, code, name, created_by, updated_by)
  select t.id, 'LOCAL', 'Local Entity', p.id, p.id
  from tenant_row t
  cross join platform_admin p
  where not exists (
    select 1
    from org.entities e
    where e.tenant_id = t.id
      and e.code = 'LOCAL'
      and e.deleted_at is null
  )
  returning id
),
entity_effective as (
  select id from entity_row
  union all
  select e.id
  from org.entities e
  join tenant_row t on t.id = e.tenant_id
  where e.code = 'LOCAL'
    and e.deleted_at is null
)
insert into iam.user_roles (user_id, role_id, assigned_by)
select ta.id, tr.id, p.id
from tenant_admin ta
cross join tenant_role tr
cross join platform_admin p
on conflict do nothing;

insert into iam.password_policies (tenant_id)
select id
from iam.tenants
where code = 'local'
on conflict (tenant_id) do nothing;

insert into iam.user_entity_scopes (user_id, entity_id, assigned_by)
select ta.id, e.id, p.id
from iam.users ta
join iam.tenants t on t.id = ta.tenant_id and t.code = 'local'
join org.entities e on e.tenant_id = t.id and e.code = 'LOCAL' and e.deleted_at is null
join iam.users p on p.email = 'platform.admin@procuredesk.local' and p.is_platform_super_admin = true
where ta.email = 'tenant.admin@procuredesk.local'
  and ta.deleted_at is null
on conflict do nothing;

insert into org.departments (tenant_id, entity_id, name, created_by, updated_by)
select t.id, e.id, 'Procurement', p.id, p.id
from iam.tenants t
join org.entities e on e.tenant_id = t.id and e.code = 'LOCAL' and e.deleted_at is null
join iam.users p on p.email = 'platform.admin@procuredesk.local' and p.is_platform_super_admin = true
where t.code = 'local'
  and not exists (
    select 1
    from org.departments d
    where d.tenant_id = t.id
      and d.entity_id = e.id
      and lower(d.name) = 'procurement'
      and d.deleted_at is null
  );
