-- Enterprise import extensions for official business-facing migration templates.

alter table iam.users
  add column if not exists contact_no text;

alter table procurement.rc_po_plans
  add column if not exists owner_user_id uuid references iam.users(id) on delete restrict;

create index if not exists rc_po_plans_owner_idx
  on procurement.rc_po_plans (tenant_id, owner_user_id)
  where deleted_at is null;
