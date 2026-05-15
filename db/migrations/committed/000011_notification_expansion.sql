alter table ops.notification_rules
  drop constraint if exists notification_rules_type_check;

alter table ops.notification_rules
  add constraint notification_rules_type_check check (
    notification_type in (
      'delayed_case_alert',
      'entity_monthly_digest',
      'manager_daily_snapshot',
      'off_track_case_alert',
      'rc_po_expiry',
      'stale_tender'
    )
  );

alter table ops.notification_jobs
  drop constraint if exists notification_jobs_type_check;

alter table ops.notification_jobs
  add constraint notification_jobs_type_check check (
    notification_type in (
      'delayed_case_alert',
      'entity_monthly_digest',
      'export_ready',
      'import_completed',
      'import_failed',
      'manager_daily_snapshot',
      'off_track_case_alert',
      'password_changed',
      'password_reset',
      'rc_po_expiry',
      'security_alert',
      'stale_tender',
      'user_welcome'
    )
  );
