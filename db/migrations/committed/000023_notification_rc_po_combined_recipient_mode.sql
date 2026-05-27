alter table ops.notification_schedules
  drop constraint if exists notification_schedules_recipient_mode_check;

alter table ops.notification_schedules
  add constraint notification_schedules_recipient_mode_check check (
    recipient_mode in (
      'owner',
      'entity_admin',
      'entity_admin_and_group_viewer',
      'group_viewer',
      'owner_or_entity',
      'explicit'
    )
  );

update ops.notification_schedules
set recipient_mode = 'entity_admin_and_group_viewer',
    updated_at = now()
where schedule_key = 'monthly_rc_po_expiry_report'
  and notification_type = 'rc_po_expiry';
