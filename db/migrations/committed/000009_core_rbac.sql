insert into iam.permissions (code, name, description)
values
  ('admin.console.access', 'Access Admin Console', 'Open admin console modules and configuration routes.'),
  ('system.config.manage', 'Manage System Configuration', 'Manage tenant security and system configuration settings.'),
  ('permission.read', 'Read Permissions', 'View permission catalog entries for role configuration.'),
  ('user.read.entity', 'Read Entity Users', 'View users mapped to the current user''s assigned entities.'),
  ('user.read.all', 'Read All Users', 'View all users inside the current tenant.'),
  ('case.delay.manage.all', 'Manage All Delays', 'Manage delay fields across all entities in the tenant.')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description;

update iam.permissions
set description = 'View users inside the current tenant according to assigned scope.'
where code = 'user.read';

insert into iam.roles (tenant_id, code, name, description, is_system_role)
values
  (null, 'platform_super_admin', 'Super Admin', 'Full unrestricted system access across tenants and modules.', true),
  (null, 'administration_manager', 'Administration Manager', 'Admin-console role for users, roles, system configuration, and master data.', true),
  (null, 'group_manager', 'Group Manager', 'Group-level tender operations manager across all entities.', true),
  (null, 'entity_manager', 'Entity Manager', 'Entity-scoped procurement manager.', true),
  (null, 'tender_owner', 'Tender Owner', 'Procurement user who manages assigned tenders.', true)
on conflict (code) where tenant_id is null and deleted_at is null do update
set
  name = excluded.name,
  description = excluded.description,
  is_system_role = true;

insert into iam.user_roles (user_id, role_id, assigned_by)
select ur.user_id, target.id, ur.assigned_by
from iam.user_roles ur
join iam.roles legacy on legacy.id = ur.role_id
join iam.roles target
  on target.tenant_id is null
 and target.deleted_at is null
 and target.code = case
   when legacy.code = 'tenant_admin' then 'administration_manager'
   when legacy.code = 'group_viewer' then 'group_manager'
   else null
 end
where legacy.tenant_id is null
  and legacy.deleted_at is null
  and legacy.code in ('tenant_admin', 'group_viewer')
on conflict do nothing;

update iam.roles
set deleted_at = now(),
    updated_at = now()
where tenant_id is null
  and deleted_at is null
  and code in ('tenant_admin', 'group_viewer', 'report_viewer');

delete from iam.role_permissions rp
using iam.roles r
where r.id = rp.role_id
  and r.tenant_id is null
  and r.code in (
    'platform_super_admin',
    'administration_manager',
    'group_manager',
    'entity_manager',
    'tender_owner',
    'tenant_admin',
    'group_viewer',
    'report_viewer'
  );

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
cross join iam.permissions p
where r.code = 'platform_super_admin'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'admin.console.access',
  'system.config.manage',
  'permission.read',
  'user.read',
  'user.manage',
  'role.manage',
  'entity.read',
  'entity.manage',
  'catalog.read',
  'catalog.manage',
  'audit.read',
  'notification.manage'
)
where r.code = 'administration_manager'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'user.read.all',
  'case.read.assigned',
  'case.read.entity',
  'case.read.all',
  'case.create',
  'case.update.assigned',
  'case.update.entity',
  'case.update.all',
  'case.delay.manage.entity',
  'case.delay.manage.all',
  'award.manage',
  'planning.manage',
  'report.read',
  'report.export',
  'import.manage'
)
where r.code = 'group_manager'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'user.read.entity',
  'case.read.assigned',
  'case.read.entity',
  'case.create',
  'case.update.assigned',
  'case.update.entity',
  'case.delay.manage.entity',
  'award.manage',
  'planning.manage',
  'report.read',
  'report.export',
  'import.manage'
)
where r.code = 'entity_manager'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'case.read.assigned',
  'case.create',
  'case.update.assigned',
  'award.manage',
  'report.read',
  'report.export'
)
where r.code = 'tender_owner'
  and r.tenant_id is null
  and r.deleted_at is null
on conflict do nothing;

update iam.users u
set access_level = case
  when u.is_platform_super_admin then 'GROUP'
  when exists (
    select 1
    from iam.user_roles ur
    join iam.roles r on r.id = ur.role_id
    where ur.user_id = u.id
      and r.deleted_at is null
      and r.code in ('administration_manager', 'group_manager')
  ) then 'GROUP'
  when exists (
    select 1
    from iam.user_roles ur
    join iam.roles r on r.id = ur.role_id
    where ur.user_id = u.id
      and r.deleted_at is null
      and r.code = 'entity_manager'
  ) then 'ENTITY'
  else 'USER'
end
where u.deleted_at is null;
