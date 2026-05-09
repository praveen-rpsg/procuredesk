import { z } from "zod";

export const NotificationPreviewQuerySchema = z.object({
  type: z.enum(["entity_monthly_digest", "rc_po_expiry", "stale_tender"]),
});

export const NotificationTypeSchema = z.enum(["entity_monthly_digest", "rc_po_expiry", "stale_tender"]);

export const UpdateNotificationRuleRequestSchema = z.object({
  cadence: z.enum(["daily", "manual", "monthly", "weekly"]),
  isEnabled: z.boolean(),
  recipientMode: z.enum(["entity_admin", "explicit", "owner", "owner_or_entity"]),
  subjectTemplate: z.string().trim().max(500).nullable().optional(),
  thresholdDays: z.number().int().min(0).max(365).nullable().optional(),
});

export const CreateNotificationJobRequestSchema = z.object({
  notificationType: z.string().trim().min(1).max(100),
  recipientEmail: z.string().email(),
  subject: z.string().trim().min(1).max(500),
});

export type CreateNotificationJobRequest = z.infer<typeof CreateNotificationJobRequestSchema>;
export type NotificationPreviewQuery = z.infer<typeof NotificationPreviewQuerySchema>;
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export type UpdateNotificationRuleRequest = z.infer<typeof UpdateNotificationRuleRequestSchema>;
