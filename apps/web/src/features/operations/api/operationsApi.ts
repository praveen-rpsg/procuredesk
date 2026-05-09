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

export type NotificationRule = {
  cadence: "daily" | "manual" | "monthly" | "weekly";
  id: string;
  isEnabled: boolean;
  notificationType: "entity_monthly_digest" | "rc_po_expiry" | "stale_tender";
  recipientMode: "entity_admin" | "explicit" | "owner" | "owner_or_entity";
  subjectTemplate: string | null;
  thresholdDays: number | null;
  updatedAt: string;
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

export function notificationPreview(type: "entity_monthly_digest" | "rc_po_expiry" | "stale_tender") {
  return apiRequest<NotificationPreviewRow[]>(`/notifications/preview?type=${type}`);
}

export function listNotificationRules() {
  return apiRequest<NotificationRule[]>("/notifications/rules");
}

export function updateNotificationRule(payload: {
  cadence: "daily" | "manual" | "monthly" | "weekly";
  isEnabled: boolean;
  notificationType: "entity_monthly_digest" | "rc_po_expiry" | "stale_tender";
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
  notificationType: string;
  recipientEmail: string;
  subject: string;
}) {
  return apiRequest<{ id: string }>("/notifications/jobs", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}
