alter table ops.notification_rules
  drop constraint if exists notification_rules_type_check;

alter table ops.notification_rules
  add constraint notification_rules_type_check check (
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

insert into ops.notification_rules (
  tenant_id, notification_type, is_enabled, cadence, threshold_days, recipient_mode, subject_template
)
select t.id, template.notification_type, true, template.cadence, template.threshold_days, template.recipient_mode, template.subject_template
from iam.tenants t
cross join (
  values
    ('user_welcome'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Set up your ProcureDesk account'::text),
    ('password_reset'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Reset your ProcureDesk password'::text),
    ('password_changed'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Your ProcureDesk password was changed'::text),
    ('delayed_case_alert'::citext, 'daily'::citext, null::integer, 'owner_or_entity'::citext, 'Delayed procurement case'::text),
    ('off_track_case_alert'::citext, 'daily'::citext, null::integer, 'owner_or_entity'::citext, 'Off-track procurement case'::text),
    ('stale_tender'::citext, 'weekly'::citext, 14::integer, 'owner_or_entity'::citext, 'No recent update reminder'::text),
    ('entity_monthly_digest'::citext, 'monthly'::citext, null::integer, 'entity_admin'::citext, 'Monthly procurement digest'::text),
    ('manager_daily_snapshot'::citext, 'daily'::citext, null::integer, 'entity_admin'::citext, 'Daily procurement snapshot'::text),
    ('rc_po_expiry'::citext, 'weekly'::citext, 90::integer, 'entity_admin'::citext, 'RC/PO expiry alert'::text),
    ('export_ready'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Export ready'::text),
    ('import_completed'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Import completed'::text),
    ('import_failed'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Import failed'::text),
    ('security_alert'::citext, 'manual'::citext, null::integer, 'explicit'::citext, 'Security alert'::text)
) as template(notification_type, cadence, threshold_days, recipient_mode, subject_template)
on conflict (tenant_id, notification_type) where deleted_at is null do nothing;
