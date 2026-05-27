import { z } from "zod";

export const NotificationPreviewQuerySchema = z.object({
  type: z.enum([
    "delayed_case_alert",
    "entity_monthly_digest",
    "manager_daily_snapshot",
    "off_track_case_alert",
    "rc_po_expiry",
    "stale_tender",
  ]),
});

export const NotificationRuleTypeSchema = z.enum([
  "delayed_case_alert",
  "entity_monthly_digest",
  "export_ready",
  "import_completed",
  "import_failed",
  "manager_daily_snapshot",
  "off_track_case_alert",
  "password_changed",
  "password_reset",
  "rc_po_expiry",
  "security_alert",
  "stale_tender",
  "user_welcome",
]);
export const NotificationTypeSchema = z.enum([
  "delayed_case_alert",
  "entity_monthly_digest",
  "export_ready",
  "import_completed",
  "import_failed",
  "manager_daily_snapshot",
  "off_track_case_alert",
  "password_changed",
  "password_reset",
  "rc_po_expiry",
  "security_alert",
  "stale_tender",
  "user_welcome",
]);

export const UpdateNotificationRuleRequestSchema = z.object({
  cadence: z.enum(["daily", "manual", "monthly", "weekly"]),
  isEnabled: z.boolean(),
  recipientMode: z.enum([
    "entity_admin",
    "entity_admin_and_group_viewer",
    "explicit",
    "group_viewer",
    "owner",
    "owner_or_entity",
  ]),
  subjectTemplate: z.string().trim().max(500).nullable().optional(),
  thresholdDays: z.number().int().min(0).max(365).nullable().optional(),
});

export const CreateNotificationJobRequestSchema = z.object({
  notificationType: NotificationTypeSchema,
  recipientEmail: z.string().email(),
  subject: z.string().trim().min(1).max(500),
  textBody: z.string().trim().max(10000).optional(),
});

export const TestSendNotificationTemplateRequestSchema = z.object({
  recipientEmail: z.string().email(),
  samplePayload: z.record(z.unknown()).optional(),
});

export const UpdateNotificationSettingsRequestSchema = z.object({
  supportEmail: z.string().trim().email().max(254),
  supportName: z.string().trim().min(2).max(160),
  supportPhone: z.string().trim().min(5).max(40).nullable().optional(),
  welcomeManualEnabled: z.boolean(),
  welcomeManualTitle: z.string().trim().min(2).max(180).nullable().optional(),
});

export const NotificationJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  notificationType: NotificationTypeSchema.optional(),
  status: z.enum(["cancelled", "dead_letter", "failed", "queued", "sending", "sent", "skipped"]).optional(),
});

export const NotificationPreferencesQuerySchema = z.object({
  notificationType: NotificationTypeSchema.optional(),
  userId: z.string().uuid().optional(),
});

export const NotificationAuditTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  targetId: z.string().uuid().optional(),
  targetType: z.enum([
    "email_attachment",
    "notification_event",
    "notification_job",
    "notification_preference",
    "notification_rule",
    "notification_schedule",
    "notification_settings",
    "notification_template",
  ]).optional(),
});

export const UpsertNotificationPreferenceRequestSchema = z.object({
  channel: z.literal("email").default("email"),
  frequency: z.enum(["default", "immediate", "daily", "weekly", "monthly", "disabled"]).default("default"),
  isEnabled: z.boolean(),
  notificationType: NotificationTypeSchema,
  userId: z.string().uuid(),
});

export const UpdateNotificationScheduleRequestSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  intervalDays: z.number().int().min(1).max(365).nullable().optional(),
  isEnabled: z.boolean().optional(),
  runTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  thresholdDays: z.number().int().min(0).max(365).nullable().optional(),
});

export type CreateNotificationJobRequest = z.infer<typeof CreateNotificationJobRequestSchema>;
export type NotificationAuditTimelineQuery = z.infer<typeof NotificationAuditTimelineQuerySchema>;
export type NotificationJobsQuery = z.infer<typeof NotificationJobsQuerySchema>;
export type NotificationPreferencesQuery = z.infer<typeof NotificationPreferencesQuerySchema>;
export type NotificationPreviewQuery = z.infer<typeof NotificationPreviewQuerySchema>;
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export type NotificationRuleType = z.infer<typeof NotificationRuleTypeSchema>;
export type TestSendNotificationTemplateRequest = z.infer<typeof TestSendNotificationTemplateRequestSchema>;
export type UpdateNotificationSettingsRequest = z.infer<typeof UpdateNotificationSettingsRequestSchema>;
export type UpsertNotificationPreferenceRequest = z.infer<typeof UpsertNotificationPreferenceRequestSchema>;
export type UpdateNotificationScheduleRequest = z.infer<typeof UpdateNotificationScheduleRequestSchema>;
export type UpdateNotificationRuleRequest = z.infer<typeof UpdateNotificationRuleRequestSchema>;
