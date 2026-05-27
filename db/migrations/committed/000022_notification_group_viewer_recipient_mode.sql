-- Migration 000022: Make group snapshot recipient mode explicit.
-- The group procurement snapshot is sent only to Group Viewer users.

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
set name = 'Procurement Snapshot - Group Viewers',
    recipient_mode = 'group_viewer',
    updated_at = now()
where schedule_key = 'procurement_snapshot_group_every_third_day'
  and notification_type = 'manager_daily_snapshot';
