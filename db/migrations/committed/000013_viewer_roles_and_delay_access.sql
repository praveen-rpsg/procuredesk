insert into iam.permissions (code, name, description)
values
  ('case.delay.read.all', 'Read All Delay Fields', 'View external delay days and delay reasons across all entities in the tenant.')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description;

insert into iam.roles (tenant_id, code, name, description, is_system_role)
values
  (null, 'entity_viewer', 'Entity Viewer', 'Entity-scoped read-only procurement and reporting access.', true),
  (null, 'group_viewer', 'Group Viewer', 'Group-level read-only procurement and reporting access with report export.', true)
on conflict (code) where tenant_id is null and deleted_at is null do update
set
  name = excluded.name,
  description = excluded.description,
  is_system_role = true;

delete from iam.role_permissions rp
using iam.roles r
where r.id = rp.role_id
  and r.tenant_id is null
  and r.deleted_at is null
  and r.code in ('entity_manager', 'group_manager')
  and rp.permission_code = 'case.delay.manage.entity';

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code = 'case.delay.read.all'
where r.code = 'group_manager'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

delete from iam.role_permissions rp
using iam.roles r
where r.id = rp.role_id
  and r.tenant_id is null
  and r.deleted_at is null
  and r.code in ('entity_viewer', 'group_viewer');

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'case.read.entity',
  'report.read'
)
where r.code = 'entity_viewer'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'case.read.all',
  'report.read',
  'report.export'
)
where r.code = 'group_viewer'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;
