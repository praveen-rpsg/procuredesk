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
  "manager_daily_snapshot",
  "off_track_case_alert",
  "rc_po_expiry",
  "stale_tender",
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
  recipientMode: z.enum(["entity_admin", "explicit", "owner", "owner_or_entity"]),
  subjectTemplate: z.string().trim().max(500).nullable().optional(),
  thresholdDays: z.number().int().min(0).max(365).nullable().optional(),
});

export const CreateNotificationJobRequestSchema = z.object({
  notificationType: NotificationTypeSchema,
  recipientEmail: z.string().email(),
  subject: z.string().trim().min(1).max(500),
  textBody: z.string().trim().max(10000).optional(),
});

export const NotificationJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  notificationType: NotificationTypeSchema.optional(),
  status: z.enum(["cancelled", "failed", "queued", "sending", "sent"]).optional(),
});

export type CreateNotificationJobRequest = z.infer<typeof CreateNotificationJobRequestSchema>;
export type NotificationJobsQuery = z.infer<typeof NotificationJobsQuerySchema>;
export type NotificationPreviewQuery = z.infer<typeof NotificationPreviewQuerySchema>;
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export type NotificationRuleType = z.infer<typeof NotificationRuleTypeSchema>;
export type UpdateNotificationRuleRequest = z.infer<typeof UpdateNotificationRuleRequestSchema>;
