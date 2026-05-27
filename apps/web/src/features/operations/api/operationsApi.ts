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
  recipientMode:
    | "entity_admin"
    | "entity_admin_and_group_viewer"
    | "explicit"
    | "group_viewer"
    | "owner"
    | "owner_or_entity";
  subjectTemplate: string | null;
  thresholdDays: number | null;
  updatedAt: string;
};

export type NotificationJob = {
  attemptCount: number;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  notificationType: NotificationType;
  providerMessageId: string | null;
  recipientEmail: string;
  sentAt: string | null;
  status: "cancelled" | "dead_letter" | "failed" | "queued" | "sending" | "sent" | "skipped";
  subject: string;
};

export type NotificationJobDetail = NotificationJob & {
  attachments: Array<{
    attachmentKind: string;
    contentType: string;
    errorMessage: string | null;
    fileName: string;
    fileSizeBytes: number | null;
    id: string;
    status: string;
  }>;
  attempts: NotificationDeliveryAttempt[];
  htmlBody: string | null;
  payloadJson: Record<string, unknown>;
  textBody: string | null;
};

export type NotificationTemplate = {
  category: string;
  code: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  notificationType: NotificationType;
  publishedVersionId: string | null;
  rendererKey: string | null;
  subjectTemplate: string | null;
  updatedAt: string;
  versionNumber: number | null;
};

export type NotificationTemplateDetail = NotificationTemplate & {
  preheaderTemplate: string | null;
  samplePayload: Record<string, unknown>;
};

export type NotificationTemplatePreview = {
  htmlBody: string;
  preheader: string;
  subject: string;
  textBody: string;
};

export type NotificationTemplateVersion = {
  changeNote: string | null;
  id: string;
  preheaderTemplate: string | null;
  publishedAt: string | null;
  rendererKey: string;
  samplePayload: Record<string, unknown>;
  status: string;
  subjectTemplate: string;
  versionNumber: number;
};

export type NotificationSchedule = {
  cadence: string;
  dayOfMonth: number | null;
  description: string | null;
  id: string;
  intervalDays: number | null;
  isEnabled: boolean;
  lastErrorMessage: string | null;
  lastRunAt: string | null;
  lastStatus: string;
  name: string;
  nextRunAt: string | null;
  notificationType: NotificationType;
  recipientMode: string;
  runTime: string | null;
  scheduleKey: string;
  thresholdDays: number | null;
  timezone: string;
  updatedAt: string;
};

export type NotificationDeliveryAttempt = {
  attemptNumber: number;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  id: string;
  provider: string;
  providerRequestId: string | null;
  startedAt: string;
  status: "failed" | "sending" | "sent";
};

export type NotificationPreference = {
  channel: "email";
  entityCode: string | null;
  entityId: string | null;
  entityName: string | null;
  frequency: "daily" | "default" | "disabled" | "immediate" | "monthly" | "weekly";
  id: string;
  isEnabled: boolean;
  isMandatory: boolean;
  notificationType: NotificationType;
  updatedAt: string;
  userEmail: string;
  userFullName: string;
  userId: string;
};

export type NotificationAuditTimelineItem = {
  action: string;
  actorFullName: string | null;
  actorUserId: string | null;
  details: Record<string, unknown>;
  id: string;
  occurredAt: string;
  summary: string;
  targetId: string | null;
  targetType: string;
};

export type NotificationSettings = {
  support: {
    email: string;
    name: string;
    phone?: string;
  };
  updatedAt: string;
  welcomeManualEnabled: boolean;
  welcomeManualTitle: string;
};


export type NotificationStatus = {
  deliveryMode: "microsoft_graph" | "stub";
  emailTypes: Array<{
    blockingReason: string | null;
    canSend: boolean;
    category: string;
    enabledByRule: boolean;
    label: string;
    notificationType: NotificationType;
    ruleGated: boolean;
  }>;
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

export function getNotificationSettings() {
  return apiRequest<NotificationSettings>("/notifications/settings");
}

export function updateNotificationSettings(payload: {
  supportEmail: string;
  supportName: string;
  supportPhone?: string | null;
  welcomeManualEnabled: boolean;
  welcomeManualTitle?: string | null;
}) {
  return apiRequest<NotificationSettings>("/notifications/settings", {
    body: JSON.stringify(payload),
    method: "PUT",
  });
}

export function listNotificationTemplates() {
  return apiRequest<NotificationTemplate[]>("/notifications/templates");
}

export function getNotificationTemplate(templateId: string) {
  return apiRequest<NotificationTemplateDetail>(`/notifications/templates/${templateId}`);
}

export function previewNotificationTemplate(templateId: string) {
  return apiRequest<NotificationTemplatePreview>(`/notifications/templates/${templateId}/preview`);
}

export function listNotificationTemplateVersions(templateId: string) {
  return apiRequest<NotificationTemplateVersion[]>(`/notifications/templates/${templateId}/versions`);
}

export function testSendNotificationTemplate(payload: {
  recipientEmail: string;
  samplePayload?: Record<string, unknown>;
  templateId: string;
}) {
  const { templateId, ...body } = payload;
  return apiRequest<{ id: string }>(`/notifications/templates/${templateId}/test-send`, {
    body: JSON.stringify(body),
    method: "POST",
  });
}

export function listNotificationSchedules() {
  return apiRequest<NotificationSchedule[]>("/notifications/schedules");
}

export function updateNotificationSchedule(payload: {
  dayOfMonth?: number | null;
  intervalDays?: number | null;
  isEnabled?: boolean;
  runTime?: string | null;
  scheduleId: string;
  thresholdDays?: number | null;
}) {
  const { scheduleId, ...body } = payload;
  return apiRequest<NotificationSchedule>(`/notifications/schedules/${scheduleId}`, {
    body: JSON.stringify(body),
    method: "PUT",
  });
}

export function runNotificationScheduleNow(scheduleId: string) {
  return apiRequest<NotificationSchedule>(`/notifications/schedules/${scheduleId}/run-now`, {
    method: "POST",
  });
}

export function dryRunNotificationSchedule(scheduleId: string) {
  return apiRequest<NotificationPreviewRow[]>(`/notifications/schedules/${scheduleId}/dry-run`);
}

export function updateNotificationRule(payload: {
  cadence: "daily" | "manual" | "monthly" | "weekly";
  isEnabled: boolean;
  notificationType: NotificationRuleType;
  recipientMode:
    | "entity_admin"
    | "entity_admin_and_group_viewer"
    | "explicit"
    | "group_viewer"
    | "owner"
    | "owner_or_entity";
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

export function getNotificationJob(jobId: string) {
  return apiRequest<NotificationJobDetail>(`/notifications/jobs/${jobId}`);
}

export function retryNotificationJob(jobId: string) {
  return apiRequest<{ id: string }>(`/notifications/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export function listNotificationDeliveryAttempts(jobId: string) {
  return apiRequest<NotificationDeliveryAttempt[]>(`/notifications/jobs/${jobId}/attempts`);
}

export function resendNotificationJob(jobId: string) {
  return apiRequest<{ id: string }>(`/notifications/jobs/${jobId}/resend`, {
    method: "POST",
  });
}

export function cancelNotificationJob(jobId: string) {
  return apiRequest<{ id: string }>(`/notifications/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}

export function listNotificationAuditTimeline(params: {
  limit?: number;
  q?: string;
  targetId?: string;
  targetType?: string;
} = {}) {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 50));
  if (params.q) search.set("q", params.q);
  if (params.targetId) search.set("targetId", params.targetId);
  if (params.targetType) search.set("targetType", params.targetType);
  return apiRequest<NotificationAuditTimelineItem[]>(`/notifications/audit-timeline?${search.toString()}`);
}

export function listNotificationPreferences(params: {
  notificationType?: NotificationType | "";
  userId?: string;
} = {}) {
  const search = new URLSearchParams();
  if (params.notificationType) search.set("notificationType", params.notificationType);
  if (params.userId) search.set("userId", params.userId);
  const query = search.toString();
  return apiRequest<NotificationPreference[]>(`/notifications/preferences${query ? `?${query}` : ""}`);
}

export function upsertNotificationPreference(payload: {
  channel?: "email";
  frequency: NotificationPreference["frequency"];
  isEnabled: boolean;
  notificationType: NotificationType;
  userId: string;
}) {
  return apiRequest<NotificationPreference>("/notifications/preferences", {
    body: JSON.stringify({ channel: "email", ...payload }),
    method: "PUT",
  });
}
