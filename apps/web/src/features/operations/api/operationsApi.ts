import { apiRequest } from "../../../shared/api/client";

export type AuditEvent = {
  action: string;
  actorUserId: string | null;
  details: Record<string, unknown>;
  id: string;
  occurredAt: string;
  summary: string;
  targetId: string | null;
  targetType: string;
};

export type NotificationPreviewRow = {
  entityId: string | null;
  recipientEmail: string | null;
  subject: string;
  summary: string;
  targetId: string | null;
};

export type NotificationRuleType =
  | "delayed_case_alert"
  | "entity_monthly_digest"
  | "manager_daily_snapshot"
  | "off_track_case_alert"
  | "rc_po_expiry"
  | "stale_tender";

export type NotificationType =
  | "delayed_case_alert"
  | "entity_monthly_digest"
  | "export_ready"
  | "import_completed"
  | "import_failed"
  | "manager_daily_snapshot"
  | "off_track_case_alert"
  | "password_changed"
  | "password_reset"
  | "rc_po_expiry"
  | "security_alert"
  | "stale_tender"
  | "user_welcome";

export type NotificationRule = {
  cadence: "daily" | "manual" | "monthly" | "weekly";
  id: string;
  isEnabled: boolean;
  notificationType: NotificationRuleType;
  recipientMode: "entity_admin" | "explicit" | "owner" | "owner_or_entity";
  subjectTemplate: string | null;
  thresholdDays: number | null;
  updatedAt: string;
};

export type NotificationJob = {
  createdAt: string;
  errorMessage: string | null;
  id: string;
  notificationType: NotificationType;
  recipientEmail: string;
  sentAt: string | null;
  status: "cancelled" | "failed" | "queued" | "sending" | "sent";
  subject: string;
};

export type NotificationStatus = {
  deliveryMode: "microsoft_graph" | "stub";
  graphConfigured: boolean;
};

export type DeadLetterEvent = {
  attempts: number;
  createdAt: string;
  errorMessage: string;
  eventType: string;
  id: string;
  source: string;
  sourceId: string;
};

export function listAuditEvents(params: {
  limit?: number;
  targetId?: string;
  targetType?: string;
} = {}) {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));
  if (params.targetId) search.set("targetId", params.targetId);
  if (params.targetType) search.set("targetType", params.targetType);
  return apiRequest<AuditEvent[]>(`/audit/events?${search.toString()}`);
}

export function listDeadLetterEvents() {
  return apiRequest<DeadLetterEvent[]>("/operations/dead-letter-events");
}

export function notificationPreview(type: NotificationRuleType) {
  return apiRequest<NotificationPreviewRow[]>(`/notifications/preview?type=${type}`);
}

export function listNotificationRules() {
  return apiRequest<NotificationRule[]>("/notifications/rules");
}

export function getNotificationStatus() {
  return apiRequest<NotificationStatus>("/notifications/status");
}

export function updateNotificationRule(payload: {
  cadence: "daily" | "manual" | "monthly" | "weekly";
  isEnabled: boolean;
  notificationType: NotificationRuleType;
  recipientMode: "entity_admin" | "explicit" | "owner" | "owner_or_entity";
  subjectTemplate?: string | null;
  thresholdDays?: number | null;
}) {
  const { notificationType, ...body } = payload;
  return apiRequest<NotificationRule>(`/notifications/rules/${notificationType}`, {
    body: JSON.stringify(body),
    method: "PUT",
  });
}

export function createNotificationJob(payload: {
  notificationType: NotificationType;
  recipientEmail: string;
  subject: string;
  textBody?: string;
}) {
  return apiRequest<{ id: string }>("/notifications/jobs", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function listNotificationJobs(params: {
  limit?: number;
  notificationType?: NotificationType | "";
  status?: NotificationJob["status"] | "";
} = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.notificationType) search.set("notificationType", params.notificationType);
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  return apiRequest<NotificationJob[]>(`/notifications/jobs${query ? `?${query}` : ""}`);
}

export function retryNotificationJob(jobId: string) {
  return apiRequest<{ id: string }>(`/notifications/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export function cancelNotificationJob(jobId: string) {
  return apiRequest<{ id: string }>(`/notifications/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}
