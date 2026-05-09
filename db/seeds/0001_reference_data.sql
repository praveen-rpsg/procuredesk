-- ProcureDesk reference seed data.
-- This seed contains system-level permissions, role templates, and catalog categories only.
-- It does not create default passwords or active tenant users.

insert into iam.permissions (code, name, description)
values
  ('tenant.manage', 'Manage Tenants', 'Create, update, suspend, and administer tenants.'),
  ('user.read', 'Read Users', 'View users inside the current tenant.'),
  ('user.manage', 'Manage Users', 'Create, update, activate, deactivate, and assign users.'),
  ('role.manage', 'Manage Roles', 'Manage tenant roles and permission assignments.'),
  ('entity.read', 'Read Entities', 'View entities and departments.'),
  ('entity.manage', 'Manage Entities', 'Create and update tenant entities and departments.'),
  ('catalog.read', 'Read Catalog', 'View tender types and reference values.'),
  ('catalog.manage', 'Manage Catalog', 'Create and update tender types and reference values.'),
  ('case.read.assigned', 'Read Assigned Cases', 'View cases assigned to the current user.'),
  ('case.read.entity', 'Read Entity Cases', 'View cases for mapped entities.'),
  ('case.read.all', 'Read All Tenant Cases', 'View all cases in the current tenant.'),
  ('case.create', 'Create Cases', 'Create procurement cases.'),
  ('case.update.assigned', 'Update Assigned Cases', 'Update cases assigned to the current user.'),
  ('case.update.entity', 'Update Entity Cases', 'Update cases for mapped entities.'),
  ('case.update.all', 'Update All Tenant Cases', 'Update all cases in the current tenant.'),
  ('case.delete', 'Delete Cases', 'Soft-delete cases.'),
  ('case.restore', 'Restore Cases', 'Restore soft-deleted cases.'),
  ('case.delay.manage.entity', 'Manage Entity Delays', 'Manage delay fields for mapped entities.'),
  ('award.manage', 'Manage Awards', 'Create, update, and delete case awards.'),
  ('planning.manage', 'Manage Planning', 'Manage tender plans and RC/PO planning rows.'),
  ('report.read', 'Read Reports', 'View reports and analytics.'),
  ('report.export', 'Export Reports', 'Create XLSX and CSV report exports.'),
  ('import.manage', 'Manage Imports', 'Upload, review, and commit import jobs.'),
  ('audit.read', 'Read Audit Events', 'View tenant audit events.'),
  ('notification.manage', 'Manage Notifications', 'Preview and manage notification rules.')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description;

insert into iam.roles (tenant_id, code, name, description, is_system_role)
values
  (null, 'platform_super_admin', 'Platform Super Admin', 'Platform-level operational administrator across tenants.', true),
  (null, 'tenant_admin', 'Tenant Admin', 'Tenant-scoped administrator.', true),
  (null, 'group_viewer', 'Group Viewer', 'Tenant-scoped user who can view all cases and reports.', true),
  (null, 'entity_manager', 'Entity Manager', 'Entity-scoped procurement manager.', true),
  (null, 'tender_owner', 'Tender Owner', 'Procurement user who manages assigned cases.', true),
  (null, 'report_viewer', 'Report Viewer', 'Read-only reporting user.', true)
on conflict (code) where tenant_id is null and deleted_at is null do update
set
  name = excluded.name,
  description = excluded.description,
  is_system_role = true;

with seed_categories(code, name) as (
  values
    ('pr_receiving_medium', 'PR Receiving Medium'),
    ('budget_type', 'Budget Type'),
    ('nature_of_work', 'Nature Of Work'),
    ('cpc_involved', 'CPC Involved')
),
updated_categories as (
  update catalog.reference_categories rc
  set
    name = sc.name,
    is_system_category = true,
    is_active = true,
    updated_at = now()
  from seed_categories sc
  where rc.tenant_id is null
    and rc.deleted_at is null
    and lower(rc.code::text) = lower(sc.code)
  returning rc.code
)
insert into catalog.reference_categories (code, name, is_system_category, is_active)
select sc.code, sc.name, true, true
from seed_categories sc
where not exists (
  select 1
  from updated_categories uc
  where lower(uc.code::text) = lower(sc.code)
);

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
cross join iam.permissions p
where r.code = 'platform_super_admin'
  and r.tenant_id is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'user.read',
  'user.manage',
  'role.manage',
  'entity.read',
  'entity.manage',
  'catalog.read',
  'catalog.manage',
  'case.read.assigned',
  'case.read.entity',
  'case.read.all',
  'case.create',
  'case.update.assigned',
  'case.update.entity',
  'case.update.all',
  'case.delete',
  'case.restore',
  'case.delay.manage.entity',
  'award.manage',
  'planning.manage',
  'report.read',
  'report.export',
  'import.manage',
  'audit.read',
  'notification.manage'
)
where r.code = 'tenant_admin'
  and r.tenant_id is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'case.read.assigned',
  'case.read.entity',
  'case.read.all',
  'report.read',
  'report.export'
)
where r.code = 'group_viewer'
  and r.tenant_id is null
on conflict do nothing;

insert into iam.role_permissions (role_id, permission_code)
select r.id, p.code
from iam.roles r
join iam.permissions p on p.code in (
  'entity.read',
  'catalog.read',
  'case.read.assigned',
  'case.read.entity',
  'case.create',
  'case.update.assigned',
  'case.update.entity',
  'case.delay.manage.entity',
  'award.manage',
  'planning.manage',
  'report.read',
  'report.export'
)
where r.code = 'entity_manager'
  and r.tenant_id is null
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
  'award.manage'
)
where r.code = 'tender_owner'
  and r.tenant_id is null
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
where r.code = 'report_viewer'
  and r.tenant_id is null
on conflict do nothing;
