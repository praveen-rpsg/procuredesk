alter table iam.users
  add column if not exists access_level text not null default 'USER';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_access_level_check'
      and conrelid = 'iam.users'::regclass
  ) then
    alter table iam.users
      add constraint users_access_level_check
      check (access_level in ('USER', 'ENTITY', 'GROUP'));
  end if;
end $$;

update iam.users u
set access_level = case
  when u.is_platform_super_admin then 'GROUP'
  when exists (
    select 1
    from iam.user_roles ur
    join iam.roles r on r.id = ur.role_id
    where ur.user_id = u.id
      and r.deleted_at is null
      and r.code in ('tenant_admin', 'group_viewer', 'report_viewer')
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
