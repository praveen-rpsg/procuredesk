import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  Eye,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  Send,
  Settings,
  TriangleAlert,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  cancelNotificationJob,
  getNotificationJob,
  getNotificationSettings,
  getNotificationStatus,
  dryRunNotificationSchedule,
  listNotificationSchedules,
  listNotificationTemplates,
  listNotificationTemplateVersions,
  listDeadLetterEvents,
  listNotificationJobs,
  listNotificationAuditTimeline,
  listNotificationPreferences,
  listNotificationRules,
  notificationPreview,
  previewNotificationTemplate,
  resendNotificationJob,
  runNotificationScheduleNow,
  retryNotificationJob,
  testSendNotificationTemplate,
  updateNotificationSettings,
  updateNotificationRule,
  upsertNotificationPreference,
  type DeadLetterEvent,
  type NotificationStatus,
  type NotificationJob,
  type NotificationJobDetail,
  type NotificationAuditTimelineItem,
  type NotificationPreference,
  type NotificationRule,
  type NotificationRuleType,
  type NotificationSchedule,
  type NotificationTemplate,
  type NotificationTemplatePreview,
  type NotificationTemplateVersion,
  type NotificationType,
  type NotificationPreviewRow,
} from "../api/operationsApi";
import { listAdminUsers, type AdminUser } from "../../admin/api/adminApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canManageNotifications, canReadAudit } from "../../../shared/auth/permissions";
import { Button } from "../../../shared/ui/button/Button";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { navigateToAppPath, useAppLocation } from "../../../shared/routing/appLocation";
import { AccessDeniedState, NotFoundState } from "../../../shared/ui/app-states/AppStates";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

const previewColumns: DataTableColumn<NotificationPreviewRow>[] = [
  { key: "subject", header: "Subject", render: (row) => row.subject },
  { key: "recipient", header: "Recipient", render: (row) => row.recipientEmail ?? "Entity digest" },
  { key: "summary", header: "Summary", render: (row) => row.summary },
];

const notificationPreviewCards = [
  {
    description: "Daily reminder for running cases that are already marked delayed.",
    key: "delayed_case_alert",
    label: "Delayed Case Reminder",
  },
  {
    description: "Daily reminder for running cases whose form completion date has passed.",
    key: "off_track_case_alert",
    label: "Off Track Case Reminder",
  },
  {
    description: "Every-third-day alert for running tenders that have not been updated recently.",
    key: "stale_tender",
    label: "Pending Tender Update Alert",
  },
  {
    description: "Monthly manager report for stale running tender updates.",
    key: "entity_monthly_digest",
    label: "Monthly Pending Tender Report",
  },
  {
    description: "Reminder for RC/PO contracts inside the configured expiry window.",
    key: "rc_po_expiry",
    label: "RC/PO Expiry Reminder",
  },
  {
    description: "Daily workload snapshot for entity and group managers.",
    key: "manager_daily_snapshot",
    label: "Manager Daily Snapshot",
  },
] satisfies Array<{
  description: string;
  key: NotificationRuleType;
  label: string;
}>;

const deadLetterColumns: DataTableColumn<DeadLetterEvent>[] = [
  { key: "time", header: "Time", render: (row) => new Date(row.createdAt).toLocaleString() },
  { key: "event", header: "Event", render: (row) => row.eventType },
  { key: "attempts", header: "Attempts", render: (row) => row.attempts },
  { key: "error", header: "Error", render: (row) => row.errorMessage },
];

const ruleColumns: DataTableColumn<NotificationRule>[] = [
  { key: "type", header: "Rule", render: (row) => formatNotificationType(row.notificationType) },
  { key: "enabled", header: "Enabled", render: (row) => (row.isEnabled ? "Yes" : "No") },
  { key: "cadence", header: "Schedule", render: (row) => formatCadence(row.cadence) },
  { key: "threshold", header: "Threshold", render: (row) => row.thresholdDays ?? "-" },
];

const templateColumns = (
  onPreview: (template: NotificationTemplate) => void,
  onTestSend: (template: NotificationTemplate) => void,
  isTestDisabled: boolean,
): DataTableColumn<NotificationTemplate>[] => [
  { key: "name", header: "Template", render: (row) => row.name },
  { key: "category", header: "Category", render: (row) => row.category },
  { key: "type", header: "Type", render: (row) => formatNotificationType(row.notificationType) },
  { key: "renderer", header: "Renderer", render: (row) => row.rendererKey ?? "-" },
  { key: "version", header: "Version", render: (row) => row.versionNumber ? `v${row.versionNumber}` : "Draft only" },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Inactive"}</StatusBadge>,
  },
  { key: "subject", header: "Subject", render: (row) => row.subjectTemplate ?? "-" },
  {
    key: "actions",
    header: "Actions",
    render: (row) => (
      <div className="row-actions">
        <Button disabled={!row.publishedVersionId} onClick={() => onPreview(row)} size="sm" variant="secondary">
          <Eye aria-hidden="true" size={14} />
          Preview
        </Button>
        <Button disabled={!row.isActive || !row.publishedVersionId || isTestDisabled} onClick={() => onTestSend(row)} size="sm" variant="ghost">
          <Send aria-hidden="true" size={14} />
          Test
        </Button>
      </div>
    ),
  },
];

const scheduleColumns: DataTableColumn<NotificationSchedule>[] = [
  { key: "name", header: "Schedule", render: (row) => row.name },
  { key: "type", header: "Type", render: (row) => formatNotificationType(row.notificationType) },
  { key: "cadence", header: "Cadence", render: (row) => formatScheduleCadence(row) },
  { key: "time", header: "Run Time", render: (row) => row.runTime ? `${row.runTime} ${row.timezone}` : "-" },
  { key: "threshold", header: "Threshold", render: (row) => row.thresholdDays ? `${row.thresholdDays} days` : "-" },
  {
    key: "enabled",
    header: "Enabled",
    render: (row) => <StatusBadge tone={row.isEnabled ? "success" : "neutral"}>{row.isEnabled ? "Enabled" : "Paused"}</StatusBadge>,
  },
  {
    key: "last-status",
    header: "Last Status",
    render: (row) => <StatusBadge tone={scheduleStatusTone(row.lastStatus)}>{row.lastStatus}</StatusBadge>,
  },
  { key: "next-run", header: "Next Run", render: (row) => row.nextRunAt ? new Date(row.nextRunAt).toLocaleString() : "-" },
];

const scheduleColumnsWithActions = (
  onDetails: (schedule: NotificationSchedule) => void,
  onRunNow: (schedule: NotificationSchedule) => void,
): DataTableColumn<NotificationSchedule>[] => [
  ...scheduleColumns,
  {
    key: "actions",
    header: "Actions",
    render: (row) => (
      <div className="row-actions">
        <Button onClick={() => onDetails(row)} size="sm" variant="secondary">
          <Eye aria-hidden="true" size={14} />
          Details
        </Button>
        <Button disabled={!row.isEnabled} onClick={() => onRunNow(row)} size="sm" variant="secondary">
          Run Now
        </Button>
      </div>
    ),
  },
];

const emailCapabilityColumns: DataTableColumn<NotificationStatus["emailTypes"][number]>[] = [
  { key: "email", header: "Email", render: (row) => row.label },
  { key: "category", header: "Category", render: (row) => row.category },
  { key: "flag", header: "Flag", render: (row) => (row.ruleGated ? (row.enabledByRule ? "Enabled" : "Disabled") : "System") },
  {
    key: "can-send",
    header: "Can Send",
    render: (row) => <StatusBadge tone={row.canSend ? "success" : "warning"}>{row.canSend ? "Yes" : "No"}</StatusBadge>,
  },
  { key: "reason", header: "Reason", render: (row) => row.blockingReason ?? "-" },
];

const notificationJobColumns = (
  onRetry: (job: NotificationJob) => void,
  onCancel: (job: NotificationJob) => void,
  onResend: (job: NotificationJob) => void,
  onOpen: (job: NotificationJob) => void,
): DataTableColumn<NotificationJob>[] => [
  { key: "created", header: "Created", render: (row) => new Date(row.createdAt).toLocaleString() },
  { key: "type", header: "Type", render: (row) => formatNotificationType(row.notificationType) },
  { key: "recipient", header: "Recipient", render: (row) => row.recipientEmail },
  { key: "subject", header: "Subject", render: (row) => row.subject },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={notificationJobTone(row.status)}>{row.status}</StatusBadge>,
  },
  { key: "sent", header: "Sent", render: (row) => row.sentAt ? new Date(row.sentAt).toLocaleString() : "-" },
  { key: "error", header: "Error", render: (row) => row.errorMessage ?? "-" },
  {
    key: "actions",
    header: "Actions",
    render: (row) => (
      <div className="row-actions">
        <Button onClick={() => onOpen(row)} size="sm" variant="secondary">
          <Eye aria-hidden="true" size={14} />
          Details
        </Button>
        <Button
          disabled={row.status !== "failed" && row.status !== "cancelled" && row.status !== "dead_letter"}
          onClick={() => onRetry(row)}
          size="sm"
          variant="secondary"
        >
          <RefreshCw aria-hidden="true" size={14} />
          Retry
        </Button>
        <Button
          disabled={row.status !== "sent" && row.status !== "failed" && row.status !== "dead_letter"}
          onClick={() => onResend(row)}
          size="sm"
          variant="ghost"
        >
          <Send aria-hidden="true" size={14} />
          Resend
        </Button>
        <Button
          disabled={row.status !== "queued" && row.status !== "failed"}
          onClick={() => onCancel(row)}
          size="sm"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    ),
  },
];

const preferenceColumns = (
  onEdit: (preference: NotificationPreference) => void,
): DataTableColumn<NotificationPreference>[] => [
  { key: "user", header: "User", render: (row) => row.userFullName },
  { key: "email", header: "Email", render: (row) => row.userEmail },
  { key: "type", header: "Notification", render: (row) => formatNotificationType(row.notificationType) },
  { key: "frequency", header: "Frequency", render: (row) => formatPreferenceFrequency(row.frequency) },
  {
    key: "enabled",
    header: "Status",
    render: (row) => <StatusBadge tone={row.isEnabled ? "success" : "neutral"}>{row.isEnabled ? "Enabled" : "Disabled"}</StatusBadge>,
  },
  {
    key: "mandatory",
    header: "Policy",
    render: (row) => <StatusBadge tone={row.isMandatory ? "info" : "neutral"}>{row.isMandatory ? "Mandatory" : "Optional"}</StatusBadge>,
  },
  { key: "scope", header: "Scope", render: (row) => row.entityName ?? "Global" },
  { key: "updated", header: "Updated", render: (row) => new Date(row.updatedAt).toLocaleString() },
  {
    key: "actions",
    header: "Actions",
    render: (row) => (
      <div className="row-actions">
        <Button onClick={() => onEdit(row)} size="sm" variant="secondary">
          Edit
        </Button>
      </div>
    ),
  },
];

const deliveryAttemptColumns: DataTableColumn<NotificationJobDetail["attempts"][number]>[] = [
  { key: "attempt", header: "Attempt", render: (row) => row.attemptNumber },
  { key: "provider", header: "Provider", render: (row) => row.provider },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={row.status === "sent" ? "success" : row.status === "failed" ? "danger" : "info"}>{row.status}</StatusBadge>,
  },
  { key: "started", header: "Started", render: (row) => new Date(row.startedAt).toLocaleString() },
  { key: "duration", header: "Duration", render: (row) => row.durationMs == null ? "-" : `${row.durationMs} ms` },
  { key: "error", header: "Error", render: (row) => row.errorMessage ?? "-" },
];

const attachmentColumns: DataTableColumn<NotificationJobDetail["attachments"][number]>[] = [
  { key: "file", header: "File", render: (row) => row.fileName },
  { key: "kind", header: "Kind", render: (row) => row.attachmentKind },
  { key: "type", header: "Content Type", render: (row) => row.contentType },
  { key: "size", header: "Size", render: (row) => formatBytes(row.fileSizeBytes) },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={row.status === "attached" ? "success" : row.status === "failed" ? "danger" : "info"}>{row.status}</StatusBadge>,
  },
  { key: "error", header: "Error", render: (row) => row.errorMessage ?? "-" },
];

const templateVersionColumns: DataTableColumn<NotificationTemplateVersion>[] = [
  { key: "version", header: "Version", render: (row) => `v${row.versionNumber}` },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge tone={row.status === "published" ? "success" : "neutral"}>{row.status}</StatusBadge>,
  },
  { key: "renderer", header: "Renderer", render: (row) => row.rendererKey },
  { key: "subject", header: "Subject", render: (row) => row.subjectTemplate },
  { key: "published", header: "Published", render: (row) => row.publishedAt ? new Date(row.publishedAt).toLocaleString() : "-" },
  { key: "note", header: "Change Note", render: (row) => row.changeNote ?? "-" },
];

const auditTimelineColumns: DataTableColumn<NotificationAuditTimelineItem>[] = [
  { key: "time", header: "Time", render: (row) => new Date(row.occurredAt).toLocaleString() },
  { key: "action", header: "Action", render: (row) => row.action },
  { key: "target", header: "Target", render: (row) => `${row.targetType}${row.targetId ? ` / ${row.targetId.slice(0, 8)}` : ""}` },
  { key: "actor", header: "Actor", render: (row) => row.actorFullName ?? "System" },
  { key: "summary", header: "Summary", render: (row) => row.summary },
];

type OperationsSectionKey = "audit" | "dead-letters" | "jobs" | "overview" | "preferences" | "preview" | "rules" | "schedules" | "settings" | "templates";

const operationsSections = [
  { description: "Command view of template, schedule, delivery, and reliability posture.", icon: LayoutDashboard, key: "overview", label: "Overview" },
  { description: "Review published email templates and renderer keys.", icon: FileText, key: "templates", label: "Templates" },
  { description: "Configure support contacts and onboarding attachments.", icon: Settings, key: "settings", label: "Settings" },
  { description: "Choose which email templates are enabled.", icon: Bell, key: "rules", label: "Email Rules" },
  { description: "Monitor scheduled notification cadences and next runs.", icon: CalendarClock, key: "schedules", label: "Schedules" },
  { description: "Manage per-user delivery preferences and mandatory system email policy.", icon: UserCog, key: "preferences", label: "Preferences" },
  { description: "Check recipients before scheduled emails run.", icon: ListChecks, key: "preview", label: "Recipients Preview" },
  { description: "Review queued, sent, and failed emails.", icon: History, key: "jobs", label: "Email History" },
  { description: "Trace notification configuration, schedule, delivery, and attachment events.", icon: History, key: "audit", label: "Audit Timeline" },
  { description: "Delivery failures that need admin review.", icon: TriangleAlert, key: "dead-letters", label: "Delivery Issues" },
] satisfies Array<{
  description: string;
  icon: typeof Bell;
  key: OperationsSectionKey;
  label: string;
}>;

const operationsSectionPaths: Record<OperationsSectionKey, string> = {
  audit: "/admin/operations/notification-audit",
  "dead-letters": "/admin/operations/dead-letters",
  jobs: "/admin/operations/queue-jobs",
  overview: "/admin/operations/overview",
  preferences: "/admin/operations/notification-preferences",
  preview: "/admin/operations/preview",
  rules: "/admin/operations/notification-rules",
  schedules: "/admin/operations/notification-schedules",
  settings: "/admin/operations/notification-settings",
  templates: "/admin/operations/email-templates",
};

const legacyOperationsSectionPaths: Record<OperationsSectionKey, string> = {
  audit: "/operations/notification-audit",
  "dead-letters": "/operations/dead-letters",
  jobs: "/operations/queue-jobs",
  overview: "/operations/overview",
  preferences: "/operations/notification-preferences",
  preview: "/operations/preview",
  rules: "/operations/notification-rules",
  schedules: "/operations/notification-schedules",
  settings: "/operations/notification-settings",
  templates: "/operations/email-templates",
};

export function OperationsWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const location = useAppLocation();
  const requestedSection = operationsSectionFromPath(location.pathname);
  const hasAuditAccess = canReadAudit(user);
  const hasNotificationAccess = canManageNotifications(user);
  const visibleSections = useMemo(
    () =>
      operationsSections.filter((section) => {
        if (sectionRequiresAudit(section.key) && !hasAuditAccess) return false;
        if (sectionRequiresNotification(section.key) && !hasNotificationAccess) return false;
        return true;
      }),
    [hasAuditAccess, hasNotificationAccess],
  );
  const activeSection = requestedSection ?? visibleSections[0]?.key ?? "rules";
  const [ruleType, setRuleType] = useState<NotificationRule["notificationType"]>("manager_daily_snapshot");
  const [ruleCadence, setRuleCadence] = useState<NotificationRule["cadence"]>("manual");
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleThresholdDays, setRuleThresholdDays] = useState("14");
  const [jobStatus, setJobStatus] = useState<NotificationJob["status"] | "">("");
  const [jobType, setJobType] = useState<NotificationType | "">("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateTestRecipient, setTemplateTestRecipient] = useState(user?.email ?? "");
  const [preferenceFilterType, setPreferenceFilterType] = useState<NotificationType | "">("");
  const [preferenceUserId, setPreferenceUserId] = useState(user?.id ?? "");
  const [preferenceType, setPreferenceType] = useState<NotificationType>("manager_daily_snapshot");
  const [preferenceFrequency, setPreferenceFrequency] = useState<NotificationPreference["frequency"]>("default");
  const [preferenceEnabled, setPreferenceEnabled] = useState(true);
  const [auditTargetType, setAuditTargetType] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [welcomeManualEnabled, setWelcomeManualEnabled] = useState(true);
  const [welcomeManualTitle, setWelcomeManualTitle] = useState("ProcureDesk User Manual");

  const deadLetters = useQuery({
    enabled: activeSection === "dead-letters" && hasAuditAccess,
    queryFn: listDeadLetterEvents,
    queryKey: ["dead-letter-events"],
  });
  const rules = useQuery({
    enabled: activeSection === "rules" && hasNotificationAccess,
    queryFn: listNotificationRules,
    queryKey: ["notification-rules"],
  });
  const templates = useQuery({
    enabled: (activeSection === "templates" || activeSection === "overview") && hasNotificationAccess,
    queryFn: listNotificationTemplates,
    queryKey: ["notification-templates"],
  });
  const schedules = useQuery({
    enabled: (activeSection === "schedules" || activeSection === "overview") && hasNotificationAccess,
    queryFn: listNotificationSchedules,
    queryKey: ["notification-schedules"],
  });
  const notificationJobs = useQuery({
    enabled: (activeSection === "jobs" || activeSection === "overview") && hasNotificationAccess,
    queryFn: () => listNotificationJobs({
      limit: activeSection === "overview" ? 25 : 50,
      notificationType: activeSection === "overview" ? "" : jobType,
      status: activeSection === "overview" ? "" : jobStatus,
    }),
    queryKey: ["notification-jobs", activeSection === "overview" ? "" : jobStatus, activeSection === "overview" ? "" : jobType, activeSection === "overview" ? 25 : 50],
  });
  const notificationSettings = useQuery({
    enabled: (activeSection === "settings" || activeSection === "overview" || activeSection === "templates") && hasNotificationAccess,
    queryFn: getNotificationSettings,
    queryKey: ["notification-settings"],
  });
  const notificationJobDetail = useQuery({
    enabled: activeSection === "jobs" && hasNotificationAccess && Boolean(selectedJobId),
    queryFn: () => getNotificationJob(selectedJobId as string),
    queryKey: ["notification-job-detail", selectedJobId],
  });
  const templatePreview = useQuery({
    enabled: activeSection === "templates" && hasNotificationAccess && Boolean(selectedTemplateId),
    queryFn: () => previewNotificationTemplate(selectedTemplateId as string),
    queryKey: ["notification-template-preview", selectedTemplateId],
  });
  const templateVersions = useQuery({
    enabled: activeSection === "templates" && hasNotificationAccess && Boolean(selectedTemplateId),
    queryFn: () => listNotificationTemplateVersions(selectedTemplateId as string),
    queryKey: ["notification-template-versions", selectedTemplateId],
  });
  const adminUsers = useQuery({
    enabled: activeSection === "preferences" && hasNotificationAccess,
    queryFn: listAdminUsers,
    queryKey: ["admin-users"],
  });
  const preferences = useQuery({
    enabled: activeSection === "preferences" && hasNotificationAccess,
    queryFn: () => listNotificationPreferences({ notificationType: preferenceFilterType }),
    queryKey: ["notification-preferences", preferenceFilterType],
  });
  const auditTimeline = useQuery({
    enabled: activeSection === "audit" && hasAuditAccess && hasNotificationAccess,
    queryFn: () => listNotificationAuditTimeline({ limit: 75, q: auditSearch, targetType: auditTargetType }),
    queryKey: ["notification-audit-timeline", auditSearch, auditTargetType],
  });
  const notificationStatus = useQuery({
    enabled: (activeSection === "preview" || activeSection === "overview") && hasNotificationAccess,
    queryFn: getNotificationStatus,
    queryKey: ["notification-status"],
  });
  const scheduleDryRun = useQuery({
    enabled: activeSection === "schedules" && hasNotificationAccess && Boolean(selectedScheduleId),
    queryFn: () => dryRunNotificationSchedule(selectedScheduleId as string),
    queryKey: ["notification-schedule-dry-run", selectedScheduleId],
  });
  const staleTenderPreview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview("stale_tender"),
    queryKey: ["notification-preview", "stale_tender"],
  });
  const monthlyDigestPreview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview("entity_monthly_digest"),
    queryKey: ["notification-preview", "entity_monthly_digest"],
  });
  const rcPoExpiryPreview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview("rc_po_expiry"),
    queryKey: ["notification-preview", "rc_po_expiry"],
  });
  const managerDailySnapshotPreview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview("manager_daily_snapshot"),
    queryKey: ["notification-preview", "manager_daily_snapshot"],
  });
  const delayedCasePreview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview("delayed_case_alert"),
    queryKey: ["notification-preview", "delayed_case_alert"],
  });
  const offTrackCasePreview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview("off_track_case_alert"),
    queryKey: ["notification-preview", "off_track_case_alert"],
  });
  const previewQueries = {
    delayed_case_alert: delayedCasePreview,
    entity_monthly_digest: monthlyDigestPreview,
    manager_daily_snapshot: managerDailySnapshotPreview,
    off_track_case_alert: offTrackCasePreview,
    rc_po_expiry: rcPoExpiryPreview,
    stale_tender: staleTenderPreview,
  };

  const retryMutation = useMutation({
    mutationFn: (job: NotificationJob) => retryNotificationJob(job.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-jobs"] });
      notify({ message: "Notification job queued for retry.", tone: "success" });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (job: NotificationJob) => cancelNotificationJob(job.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-jobs"] });
      notify({ message: "Notification job cancelled.", tone: "success" });
    },
  });
  const resendMutation = useMutation({
    mutationFn: (job: NotificationJob) => resendNotificationJob(job.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-jobs"] });
      notify({ message: "Notification email cloned and queued for resend.", tone: "success" });
    },
  });

  const ruleMutation = useMutation({
    mutationFn: () =>
      updateNotificationRule({
        cadence: ruleCadence,
        isEnabled: ruleEnabled,
        notificationType: ruleType,
        recipientMode: "owner_or_entity",
        thresholdDays: ruleThresholdDays ? Number(ruleThresholdDays) : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      notify({ message: "Notification rule saved.", tone: "success" });
    },
  });
  const runScheduleMutation = useMutation({
    mutationFn: (schedule: NotificationSchedule) => runNotificationScheduleNow(schedule.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-schedules"] });
      notify({ message: "Notification schedule queued for immediate execution.", tone: "success" });
    },
  });
  const testSendMutation = useMutation({
    mutationFn: (template: NotificationTemplate) =>
      testSendNotificationTemplate({
        recipientEmail: templateTestRecipient.trim(),
        templateId: template.id,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-jobs"] });
      notify({ message: "Template test email queued.", tone: "success" });
    },
  });
  const preferenceMutation = useMutation({
    mutationFn: () =>
      upsertNotificationPreference({
        frequency: preferenceFrequency,
        isEnabled: isPreferenceTypeMandatory(preferenceType) ? true : preferenceEnabled,
        notificationType: preferenceType,
        userId: preferenceUserId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      notify({ message: "Notification preference saved.", tone: "success" });
    },
  });
  const settingsMutation = useMutation({
    mutationFn: () =>
      updateNotificationSettings({
        supportEmail: supportEmail.trim(),
        supportName: supportName.trim(),
        supportPhone: supportPhone.trim() || null,
        welcomeManualEnabled,
        welcomeManualTitle: welcomeManualTitle.trim() || "ProcureDesk User Manual",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["notification-template-preview"] });
      notify({ message: "Notification settings saved.", tone: "success" });
    },
  });

  useEffect(() => {
    if ((location.pathname === "/operations" || location.pathname === "/admin/operations") && visibleSections[0]) {
      navigateToAppPath(operationsSectionPaths[visibleSections[0].key], { replace: true });
    }
  }, [location.pathname, visibleSections]);

  useEffect(() => {
    if (!preferenceUserId && user?.id) {
      setPreferenceUserId(user.id);
    }
  }, [preferenceUserId, user?.id]);

  useEffect(() => {
    if (!templateTestRecipient && user?.email) {
      setTemplateTestRecipient(user.email);
    }
  }, [templateTestRecipient, user?.email]);

  useEffect(() => {
    if (!notificationSettings.data) return;
    setSupportName(notificationSettings.data.support.name);
    setSupportEmail(notificationSettings.data.support.email);
    setSupportPhone(notificationSettings.data.support.phone ?? "");
    setWelcomeManualEnabled(notificationSettings.data.welcomeManualEnabled);
    setWelcomeManualTitle(notificationSettings.data.welcomeManualTitle);
  }, [notificationSettings.data]);

  const selectedTemplate = templates.data?.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedSchedule = schedules.data?.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  const selectedPreferenceUser = adminUsers.data?.find((item) => item.id === preferenceUserId) ?? null;
  const mandatoryPreference = isPreferenceTypeMandatory(preferenceType);

  const handleTemplateTestSend = (template: NotificationTemplate) => {
    if (!templateTestRecipient.trim()) {
      notify({ message: "Enter a recipient email before sending a template test.", tone: "warning" });
      return;
    }
    testSendMutation.mutate(template);
  };

  const handlePreferenceEdit = (preference: NotificationPreference) => {
    setPreferenceUserId(preference.userId);
    setPreferenceType(preference.notificationType);
    setPreferenceFrequency(preference.frequency);
    setPreferenceEnabled(preference.isEnabled);
  };

  if (!visibleSections.length) {
    return <AccessDeniedState />;
  }

  if (!requestedSection && location.pathname !== "/operations" && location.pathname !== "/admin/operations") {
    return <NotFoundState />;
  }

  if (!visibleSections.some((section) => section.key === activeSection)) {
    return <AccessDeniedState />;
  }

  return (
    <section className="workspace-section">
      <PageHeader eyebrow="Admin" title="Email Notifications">
        Manage business email rules, recipient previews, delivery history, and audit reliability events.
      </PageHeader>

      <section className="module-subnav-shell">
        <SecondaryNav
          activeKey={activeSection}
          ariaLabel="Operations sections"
          items={visibleSections}
          onChange={(key) => navigateToAppPath(operationsSectionPaths[key])}
        />
      </section>

      <section className="module-content-area">
        {activeSection === "overview" ? (
        <section className="state-panel module-focus-panel notification-overview-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Command Center</p>
              <h2>Notification Operations Overview</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <LayoutDashboard size={16} />
            </div>
          </div>
          <div className="notification-overview-grid">
            <OverviewMetric
              label="Active Templates"
              tone="success"
              value={`${(templates.data ?? []).filter((template) => template.isActive).length}/${templates.data?.length ?? 0}`}
            />
            <OverviewMetric
              label="Enabled Schedules"
              tone="info"
              value={`${(schedules.data ?? []).filter((schedule) => schedule.isEnabled).length}/${schedules.data?.length ?? 0}`}
            />
            <OverviewMetric
              label="Recent Failures"
              tone={(notificationJobs.data ?? []).some((job) => job.status === "failed" || job.status === "dead_letter") ? "danger" : "success"}
              value={(notificationJobs.data ?? []).filter((job) => job.status === "failed" || job.status === "dead_letter").length}
            />
            <OverviewMetric
              label="Graph Delivery"
              tone={notificationStatus.data?.graphConfigured ? "success" : "warning"}
              value={notificationStatus.data?.graphConfigured ? "Configured" : "Stub"}
            />
          </div>
          <div className="notification-overview-split">
            <section>
              <h3>Upcoming Schedules</h3>
              {schedules.isLoading ? (
                <Skeleton height={120} />
              ) : (
                <DataTable
                  columns={scheduleColumns}
                  emptyMessage="No notification schedules configured."
                  getRowKey={(row) => row.id}
                  pagination={{ pageSize: 5 }}
                  rows={(schedules.data ?? []).slice().sort(compareScheduleNextRun).slice(0, 8)}
                  showSearch={false}
                />
              )}
            </section>
            <section>
              <h3>Recent Delivery Activity</h3>
              {notificationJobs.isLoading ? (
                <Skeleton height={120} />
              ) : (
                <DataTable
                  columns={notificationJobColumns(
                    (job) => retryMutation.mutate(job),
                    (job) => cancelMutation.mutate(job),
                    (job) => resendMutation.mutate(job),
                    (job) => setSelectedJobId(job.id),
                  )}
                  emptyMessage="No notification jobs yet."
                  getRowKey={(row) => row.id}
                  pagination={{ pageSize: 5 }}
                  rows={notificationJobs.data ?? []}
                  showSearch={false}
                />
              )}
            </section>
          </div>
        </section>
        ) : null}

        {activeSection === "templates" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Templates</p>
              <h2>Email Template Library</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <FileText size={16} />
            </div>
          </div>
          <div className="notification-template-toolbar">
            <FormField label="Test Recipient">
              <TextInput
                onChange={(event) => setTemplateTestRecipient(event.target.value)}
                placeholder="name@company.com"
                type="email"
                value={templateTestRecipient}
              />
            </FormField>
            <p>
              Select a published template to preview the exact rendered HTML, or send a test email through the existing
              Microsoft Graph queue.
            </p>
          </div>
          {testSendMutation.error ? <p className="inline-error">{testSendMutation.error.message}</p> : null}
          {templates.isLoading ? (
            <Skeleton height={140} />
          ) : templates.error ? (
            <p className="inline-error">{templates.error.message}</p>
          ) : (
            <DataTable
              columns={templateColumns(
                (template) => setSelectedTemplateId(template.id),
                handleTemplateTestSend,
                testSendMutation.isPending || !templateTestRecipient.trim(),
              )}
              emptyMessage="No email templates configured."
              getRowKey={(row) => row.id}
              rows={templates.data ?? []}
            />
          )}
          <TemplatePreviewPanel
            error={templatePreview.error?.message}
            isLoading={templatePreview.isLoading}
            isVersionsLoading={templateVersions.isLoading}
            preview={templatePreview.data ?? null}
            template={selectedTemplate}
            versions={templateVersions.data ?? []}
            versionsError={templateVersions.error?.message}
          />
        </section>
        ) : null}

        {activeSection === "settings" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Settings</p>
              <h2>Notification Support Settings</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <Settings size={16} />
            </div>
          </div>
          {notificationSettings.isLoading ? (
            <Skeleton height={180} />
          ) : notificationSettings.error ? (
            <p className="inline-error">{notificationSettings.error.message}</p>
          ) : (
            <div className="notification-preference-grid">
              <div className="notification-preference-editor">
                <FormField label="Support Contact Name">
                  <TextInput
                    onChange={(event) => setSupportName(event.target.value)}
                    placeholder="ProcureDesk Support"
                    value={supportName}
                  />
                </FormField>
                <FormField label="Support Email">
                  <TextInput
                    onChange={(event) => setSupportEmail(event.target.value)}
                    placeholder="support@company.com"
                    type="email"
                    value={supportEmail}
                  />
                </FormField>
                <FormField label="Support Phone">
                  <TextInput
                    onChange={(event) => setSupportPhone(event.target.value)}
                    placeholder="+91..."
                    value={supportPhone}
                  />
                </FormField>
                <FormField label="Welcome Manual Title">
                  <TextInput
                    onChange={(event) => setWelcomeManualTitle(event.target.value)}
                    value={welcomeManualTitle}
                  />
                </FormField>
                <label className="checkbox-row">
                  <input
                    checked={welcomeManualEnabled}
                    onChange={(event) => setWelcomeManualEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  Attach welcome user manual PDF
                </label>
                <Button
                  disabled={settingsMutation.isPending || !supportName.trim() || !supportEmail.trim()}
                  onClick={() => settingsMutation.mutate()}
                >
                  Save Settings
                </Button>
              </div>
              <div className="notification-preference-summary">
                <span>Tenant email footer</span>
                <strong>{supportName || "Support contact"}</strong>
                <p>{supportEmail || "support email"}{supportPhone ? ` | ${supportPhone}` : ""}</p>
                <p>
                  {welcomeManualEnabled
                    ? "New user setup emails will include the generated ProcureDesk user manual PDF."
                    : "Welcome emails will be sent without the onboarding manual attachment."}
                </p>
              </div>
            </div>
          )}
          {settingsMutation.error ? <p className="inline-error">{settingsMutation.error.message}</p> : null}
        </section>
        ) : null}

        {activeSection === "rules" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Rules</p>
              <h2>Email Template Flags</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <Bell size={16} />
            </div>
          </div>
          <div className="notification-job-form">
            <FormField label="Email Rule">
              <select
                className="text-input"
                onChange={(event) => setRuleType(event.target.value as NotificationRule["notificationType"])}
                value={ruleType}
              >
                  {emailTemplateRuleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Schedule">
              <select
                className="text-input"
                onChange={(event) => setRuleCadence(event.target.value as NotificationRule["cadence"])}
                value={ruleCadence}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="manual">Manual</option>
              </select>
            </FormField>
            <FormField label="Threshold Days">
              <TextInput
                min={0}
                onChange={(event) => setRuleThresholdDays(event.target.value)}
                type="number"
                value={ruleThresholdDays}
              />
            </FormField>
            <label className="checkbox-row">
              <input checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} type="checkbox" />
              Enabled
            </label>
            <Button disabled={ruleMutation.isPending} onClick={() => ruleMutation.mutate()}>
              Save Rule
            </Button>
          </div>
          {ruleMutation.error ? <p className="inline-error">{ruleMutation.error.message}</p> : null}
          {rules.isLoading ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                  <Skeleton height={13} width="20%" />
                  <Skeleton height={13} width="8%" />
                  <Skeleton height={13} width="12%" />
                  <Skeleton height={13} width="10%" />
                </div>
              ))}
            </div>
          ) : rules.error ? (
            <p className="inline-error">{rules.error.message}</p>
          ) : (
            <DataTable
              columns={ruleColumns}
              emptyMessage="No notification rules configured."
              getRowKey={(row) => row.id}
              rows={rules.data ?? []}
            />
          )}
        </section>
        ) : null}

        {activeSection === "schedules" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Scheduler</p>
              <h2>Notification Schedules</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <CalendarClock size={16} />
            </div>
          </div>
          {schedules.isLoading ? (
            <Skeleton height={140} />
          ) : schedules.error ? (
            <p className="inline-error">{schedules.error.message}</p>
          ) : (
            <DataTable
              columns={scheduleColumnsWithActions(
                (schedule) => setSelectedScheduleId(schedule.id),
                (schedule) => runScheduleMutation.mutate(schedule),
              )}
              emptyMessage="No notification schedules configured."
              getRowKey={(row) => row.id}
              rows={schedules.data ?? []}
            />
          )}
          {runScheduleMutation.error ? <p className="inline-error">{runScheduleMutation.error.message}</p> : null}
          <ScheduleDetailPanel
            dryRunError={scheduleDryRun.error?.message}
            dryRunRows={scheduleDryRun.data ?? []}
            isDryRunLoading={scheduleDryRun.isLoading}
            schedule={selectedSchedule}
          />
        </section>
        ) : null}

        {activeSection === "preferences" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Preferences</p>
              <h2>User Notification Preferences</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <UserCog size={16} />
            </div>
          </div>
          <div className="notification-preference-grid">
            <div className="notification-preference-editor">
              <FormField label="User">
                {adminUsers.data?.length ? (
                  <select
                    className="text-input"
                    onChange={(event) => setPreferenceUserId(event.target.value)}
                    value={preferenceUserId}
                  >
                    <option value="">Select user</option>
                    {adminUsers.data.map((adminUser) => (
                      <option key={adminUser.id} value={adminUser.id}>
                        {formatUserOption(adminUser)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    onChange={(event) => setPreferenceUserId(event.target.value)}
                    placeholder="User UUID"
                    value={preferenceUserId}
                  />
                )}
              </FormField>
              <FormField label="Notification">
                <select
                  className="text-input"
                  onChange={(event) => setPreferenceType(event.target.value as NotificationType)}
                  value={preferenceType}
                >
                  {notificationTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Frequency">
                <select
                  className="text-input"
                  onChange={(event) => setPreferenceFrequency(event.target.value as NotificationPreference["frequency"])}
                  value={preferenceFrequency}
                >
                  {preferenceFrequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
              <label className="checkbox-row">
                <input
                  checked={mandatoryPreference || preferenceEnabled}
                  disabled={mandatoryPreference}
                  onChange={(event) => setPreferenceEnabled(event.target.checked)}
                  type="checkbox"
                />
                Enabled
              </label>
              <Button disabled={!preferenceUserId || preferenceMutation.isPending} onClick={() => preferenceMutation.mutate()}>
                Save Preference
              </Button>
            </div>
            <div className="notification-preference-summary">
              <span>{selectedPreferenceUser?.email ?? "No user selected"}</span>
              <strong>{formatNotificationType(preferenceType)}</strong>
              <p>
                {mandatoryPreference
                  ? "Mandatory security and onboarding notifications stay enabled by policy."
                  : "Optional notifications can be disabled or tuned to match a user's working cadence."}
              </p>
            </div>
          </div>
          <div className="filter-bar notification-preference-filter">
            <div className="filter-bar-controls">
              <FormField label="Filter by Notification">
                <select
                  className="text-input"
                  onChange={(event) => setPreferenceFilterType(event.target.value as NotificationType | "")}
                  value={preferenceFilterType}
                >
                  <option value="">All</option>
                  {notificationTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
          </div>
          {adminUsers.error ? <p className="inline-error">{adminUsers.error.message}</p> : null}
          {preferenceMutation.error ? <p className="inline-error">{preferenceMutation.error.message}</p> : null}
          {preferences.isLoading ? (
            <Skeleton height={140} />
          ) : preferences.error ? (
            <p className="inline-error">{preferences.error.message}</p>
          ) : (
            <DataTable
              columns={preferenceColumns(handlePreferenceEdit)}
              emptyMessage="No notification preferences configured."
              getRowKey={(row) => row.id}
              rows={preferences.data ?? []}
            />
          )}
        </section>
        ) : null}

        {activeSection === "preview" ? (
        <section className="state-panel module-focus-panel operations-alert-preview-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Notify</p>
              <h2>Recipients Preview</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <Bell size={16} />
            </div>
          </div>
          <div className={`operations-alert-mode operations-alert-mode-${notificationStatus.data?.deliveryMode ?? "stub"}`}>
            <Bell aria-hidden="true" size={18} />
            {notificationStatus.data?.graphConfigured ? (
              <span>Microsoft Graph delivery is configured. Preview rows show emails that are eligible to be sent.</span>
            ) : (
              <span>
                <strong>Stub mode</strong> - previews are available, but no email leaves the system until Microsoft Graph is configured.
              </span>
            )}
          </div>
          {notificationStatus.data?.emailTypes?.length ? (
            <DataTable
              columns={emailCapabilityColumns}
              emptyMessage="No email delivery status available."
              getRowKey={(row) => row.notificationType}
              rows={notificationStatus.data.emailTypes}
            />
          ) : null}
          <div className="operations-alert-preview-list">
            {notificationPreviewCards.map((card) => {
              const query = previewQueries[card.key];
              const rows = query.data ?? [];
              return (
                <article className="operations-alert-card" key={card.key}>
                  <div className="operations-alert-card-header">
                    <h3>{card.label}</h3>
                    <span>{card.description}</span>
                  </div>
                  <div className="operations-alert-card-meta">
                    <StatusBadge tone={rows.length ? "info" : "neutral"}>{rows.length} email{rows.length === 1 ? "" : "s"}</StatusBadge>
                  </div>
                  {query.isLoading ? (
                    <div className="operations-alert-card-body">
                      <Skeleton height={20} />
                    </div>
                  ) : query.error ? (
                    <div className="operations-alert-card-body">
                      <p className="inline-error">{query.error.message}</p>
                    </div>
                  ) : rows.length ? (
                    <DataTable
                      columns={previewColumns}
                      emptyMessage="No emails due right now."
                      getRowKey={(row) =>
                        `${card.key}:${row.targetId ?? row.subject}:${row.recipientEmail ?? "entity"}`
                      }
                      rows={rows}
                    />
                  ) : (
                    <div className="operations-alert-card-body operations-alert-empty">No emails due right now.</div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        ) : null}

        {activeSection === "dead-letters" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Reliability</p>
              <h2>Delivery Issues</h2>
            </div>
          </div>
          {deadLetters.isLoading ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                  <Skeleton height={13} width="18%" />
                  <Skeleton height={13} width="20%" />
                  <Skeleton height={13} width="8%" />
                  <Skeleton height={13} width="30%" />
                </div>
              ))}
            </div>
          ) : deadLetters.error ? (
            <p className="inline-error">{deadLetters.error.message}</p>
          ) : (
            <DataTable
              columns={deadLetterColumns}
              emptyMessage="No delivery issues."
              getRowKey={(row) => row.id}
              rows={deadLetters.data ?? []}
            />
          )}
        </section>
        ) : null}

        {activeSection === "audit" ? (
        <section className="state-panel module-focus-panel module-focus-panel-narrow">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Governance</p>
              <h2>Notification Audit Timeline</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <History size={16} />
            </div>
          </div>
          <div className="filter-bar">
            <div className="filter-bar-controls">
              <FormField label="Search">
                <TextInput
                  onChange={(event) => setAuditSearch(event.target.value)}
                  placeholder="Action, actor, or summary"
                  value={auditSearch}
                />
              </FormField>
              <FormField label="Target Type">
                <select className="text-input" onChange={(event) => setAuditTargetType(event.target.value)} value={auditTargetType}>
                  <option value="">All</option>
                  {notificationAuditTargetOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
          </div>
          {auditTimeline.isLoading ? (
            <Skeleton height={140} />
          ) : auditTimeline.error ? (
            <p className="inline-error">{auditTimeline.error.message}</p>
          ) : (
            <DataTable
              columns={auditTimelineColumns}
              emptyMessage="No notification audit events found."
              getRowKey={(row) => row.id}
              rows={auditTimeline.data ?? []}
            />
          )}
        </section>
        ) : null}

        {activeSection === "jobs" ? (
        <section className="state-panel module-focus-panel module-focus-panel-narrow">
          <div className="detail-header">
            <div>
              <p className="eyebrow">History</p>
              <h2>Email History</h2>
            </div>
          </div>
          <div className="filter-bar">
            <div className="filter-bar-controls">
              <FormField label="History Type">
                <select className="text-input" onChange={(event) => setJobType(event.target.value as NotificationType | "")} value={jobType}>
                  <option value="">All</option>
                  {notificationTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select className="text-input" onChange={(event) => setJobStatus(event.target.value as NotificationJob["status"] | "")} value={jobStatus}>
                  <option value="">All</option>
                  <option value="queued">Queued</option>
                  <option value="sending">Sending</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                  <option value="dead_letter">Dead Letter</option>
                  <option value="skipped">Skipped</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </FormField>
            </div>
          </div>
          {retryMutation.error ? <p className="inline-error">{retryMutation.error.message}</p> : null}
          {cancelMutation.error ? <p className="inline-error">{cancelMutation.error.message}</p> : null}
          {resendMutation.error ? <p className="inline-error">{resendMutation.error.message}</p> : null}
          {notificationJobs.isLoading ? (
            <Skeleton height={120} />
          ) : notificationJobs.error ? (
            <p className="inline-error">{notificationJobs.error.message}</p>
          ) : (
            <DataTable
              columns={notificationJobColumns(
                (job) => retryMutation.mutate(job),
                (job) => cancelMutation.mutate(job),
                (job) => resendMutation.mutate(job),
                (job) => setSelectedJobId(job.id),
              )}
              emptyMessage="No notification jobs yet."
              getRowKey={(row) => row.id}
              rows={notificationJobs.data ?? []}
            />
          )}
          <NotificationJobDetailPanel
            detail={notificationJobDetail.data ?? null}
            error={notificationJobDetail.error?.message}
            isLoading={notificationJobDetail.isLoading}
          />
        </section>
        ) : null}
      </section>
    </section>
  );
}

function OverviewMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "danger" | "info" | "success" | "warning";
  value: number | string;
}) {
  return (
    <div className={`notification-overview-metric notification-overview-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TemplatePreviewPanel({
  error,
  isLoading,
  isVersionsLoading,
  preview,
  template,
  versions,
  versionsError,
}: {
  error: string | undefined;
  isLoading: boolean;
  isVersionsLoading: boolean;
  preview: NotificationTemplatePreview | null;
  template: NotificationTemplate | null;
  versions: NotificationTemplateVersion[];
  versionsError: string | undefined;
}) {
  if (!template) {
    return (
      <div className="notification-preview-empty">
        <Eye aria-hidden="true" size={18} />
        <span>Select a published template to inspect its rendered subject, preheader, HTML, and plain text fallback.</span>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton height={260} />;
  }

  if (error) {
    return <p className="inline-error">{error}</p>;
  }

  if (!preview) return null;

  return (
    <div className="notification-template-preview-stack">
      <div className="notification-template-preview-grid">
        <div className="notification-template-preview-meta">
          <p className="eyebrow">Live Preview</p>
          <h3>{template.name}</h3>
          <dl className="detail-grid notification-template-metrics">
            <div>
              <dt>Subject</dt>
              <dd>{preview.subject}</dd>
            </div>
            <div>
              <dt>Preheader</dt>
              <dd>{preview.preheader || "-"}</dd>
            </div>
          </dl>
          <pre className="json-block notification-text-preview">{preview.textBody}</pre>
        </div>
        <div className="notification-email-preview-shell">
          <iframe
            className="notification-email-preview-frame"
            sandbox=""
            srcDoc={preview.htmlBody}
            title={`${template.name} email preview`}
          />
        </div>
      </div>
      <div className="notification-template-version-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">Versions</p>
            <h2>Version History & Compare</h2>
          </div>
        </div>
        {isVersionsLoading ? (
          <Skeleton height={120} />
        ) : versionsError ? (
          <p className="inline-error">{versionsError}</p>
        ) : (
          <>
            <DataTable
              columns={templateVersionColumns}
              emptyMessage="No template versions found."
              getRowKey={(row) => row.id}
              pagination={{ pageSize: 5 }}
              rows={versions}
            />
            <TemplateVersionCompare versions={versions} />
          </>
        )}
      </div>
    </div>
  );
}

function TemplateVersionCompare({ versions }: { versions: NotificationTemplateVersion[] }) {
  const [latest, previous] = versions;
  if (!latest) return null;
  if (!previous) {
    return (
      <div className="notification-preview-empty">
        <History aria-hidden="true" size={18} />
        <span>Only one version exists, so there is no previous version to compare yet.</span>
      </div>
    );
  }
  return (
    <div className="notification-template-compare-grid">
      <TemplateVersionSnapshot label="Current Published Baseline" version={latest} />
      <TemplateVersionSnapshot label="Previous Baseline" version={previous} />
    </div>
  );
}

function TemplateVersionSnapshot({
  label,
  version,
}: {
  label: string;
  version: NotificationTemplateVersion;
}) {
  return (
    <div className="notification-template-version-snapshot">
      <span>{label}</span>
      <strong>v{version.versionNumber}</strong>
      <p>{version.subjectTemplate}</p>
      <pre className="json-block">{JSON.stringify(version.samplePayload, null, 2)}</pre>
    </div>
  );
}

function ScheduleDetailPanel({
  dryRunError,
  dryRunRows,
  isDryRunLoading,
  schedule,
}: {
  dryRunError: string | undefined;
  dryRunRows: NotificationPreviewRow[];
  isDryRunLoading: boolean;
  schedule: NotificationSchedule | null;
}) {
  if (!schedule) {
    return (
      <div className="notification-preview-empty">
        <CalendarClock aria-hidden="true" size={18} />
        <span>Select a schedule to inspect run policy, next execution, and current eligible recipients.</span>
      </div>
    );
  }

  return (
    <div className="notification-schedule-detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Schedule Detail</p>
          <h2>{schedule.name}</h2>
        </div>
        <StatusBadge tone={schedule.isEnabled ? "success" : "warning"}>{schedule.isEnabled ? "Enabled" : "Paused"}</StatusBadge>
      </div>
      <dl className="detail-grid notification-job-detail-grid">
        <div>
          <dt>Cadence</dt>
          <dd>{formatScheduleCadence(schedule)}</dd>
        </div>
        <div>
          <dt>Run Time</dt>
          <dd>{schedule.runTime ? `${schedule.runTime} ${schedule.timezone}` : "-"}</dd>
        </div>
        <div>
          <dt>Next Run</dt>
          <dd>{schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "-"}</dd>
        </div>
        <div>
          <dt>Last Status</dt>
          <dd>{schedule.lastStatus}</dd>
        </div>
      </dl>
      {schedule.lastErrorMessage ? <p className="inline-error">{schedule.lastErrorMessage}</p> : null}
      <section className="notification-job-detail-sections">
        <h3>Eligible Recipients Right Now</h3>
        {isDryRunLoading ? (
          <Skeleton height={100} />
        ) : dryRunError ? (
          <p className="inline-error">{dryRunError}</p>
        ) : (
          <DataTable
            columns={previewColumns}
            emptyMessage="No recipients eligible for this schedule right now."
            getRowKey={(row) => `${schedule.id}:${row.targetId ?? row.recipientEmail ?? row.subject}`}
            pagination={{ pageSize: 10 }}
            rows={dryRunRows}
          />
        )}
      </section>
    </div>
  );
}

function NotificationJobDetailPanel({
  detail,
  error,
  isLoading,
}: {
  detail: NotificationJobDetail | null;
  error: string | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton height={220} />;
  }

  if (error) {
    return <p className="inline-error">{error}</p>;
  }

  if (!detail) return null;

  return (
    <div className="notification-job-detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Delivery Detail</p>
          <h2>{detail.subject}</h2>
        </div>
        <StatusBadge tone={notificationJobTone(detail.status)}>{detail.status}</StatusBadge>
      </div>
      <dl className="detail-grid notification-job-detail-grid">
        <div>
          <dt>Recipient</dt>
          <dd>{detail.recipientEmail}</dd>
        </div>
        <div>
          <dt>Provider Message</dt>
          <dd>{detail.providerMessageId ?? "-"}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{detail.attemptCount}</dd>
        </div>
        <div>
          <dt>Sent</dt>
          <dd>{detail.sentAt ? new Date(detail.sentAt).toLocaleString() : "-"}</dd>
        </div>
      </dl>
      <div className="notification-job-detail-sections">
        <section>
          <h3>Delivery Attempts</h3>
          {detail.attempts.length ? (
            <DataTable
              columns={deliveryAttemptColumns}
              emptyMessage="No delivery attempts recorded."
              getRowKey={(row) => row.id}
              pagination={false}
              rows={detail.attempts}
              showSearch={false}
            />
          ) : (
            <p>No delivery attempts recorded.</p>
          )}
        </section>
        <section>
          <h3>Attachments</h3>
          {detail.attachments.length ? (
            <DataTable
              columns={attachmentColumns}
              emptyMessage="No attachments."
              getRowKey={(row) => row.id}
              pagination={false}
              rows={detail.attachments}
              showSearch={false}
            />
          ) : (
            <p>No attachments.</p>
          )}
        </section>
        <section>
          <h3>Payload</h3>
          <pre className="json-block">{JSON.stringify(detail.payloadJson, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}

function operationsSectionFromPath(pathname: string): OperationsSectionKey | null {
  const match = Object.entries(operationsSectionPaths).find(([, path]) => pathname === path) ??
    Object.entries(legacyOperationsSectionPaths).find(([, path]) => pathname === path);
  return match?.[0] as OperationsSectionKey | null;
}

function sectionRequiresAudit(section: OperationsSectionKey): boolean {
  return section === "audit" || section === "dead-letters";
}

function sectionRequiresNotification(section: OperationsSectionKey): boolean {
  return section !== "dead-letters";
}

const notificationTypeOptions: Array<{ label: string; value: NotificationType }> = [
  { label: "New User Setup", value: "user_welcome" },
  { label: "Forgot Password", value: "password_reset" },
  { label: "Password Changed", value: "password_changed" },
  { label: "Procurement Snapshot", value: "manager_daily_snapshot" },
  { label: "Delayed Case Alert", value: "delayed_case_alert" },
  { label: "Off Track Case Alert", value: "off_track_case_alert" },
  { label: "RC/PO Expiry", value: "rc_po_expiry" },
  { label: "Pending Tender Update Alert", value: "stale_tender" },
  { label: "Monthly Pending Tender Report", value: "entity_monthly_digest" },
  { label: "Export Ready", value: "export_ready" },
  { label: "Import Completed", value: "import_completed" },
  { label: "Import Failed", value: "import_failed" },
  { label: "Security Alert", value: "security_alert" },
];

const emailTemplateRuleOptions: Array<{ label: string; value: NotificationRuleType }> = notificationTypeOptions;

const mandatoryNotificationTypes = new Set<NotificationType>([
  "password_changed",
  "password_reset",
  "security_alert",
  "user_welcome",
]);

const preferenceFrequencyOptions: Array<{ label: string; value: NotificationPreference["frequency"] }> = [
  { label: "System Default", value: "default" },
  { label: "Immediate", value: "immediate" },
  { label: "Daily Digest", value: "daily" },
  { label: "Weekly Digest", value: "weekly" },
  { label: "Monthly Digest", value: "monthly" },
  { label: "Disabled", value: "disabled" },
];

const notificationAuditTargetOptions = [
  { label: "Email Attachment", value: "email_attachment" },
  { label: "Notification Event", value: "notification_event" },
  { label: "Notification Job", value: "notification_job" },
  { label: "Notification Preference", value: "notification_preference" },
  { label: "Notification Rule", value: "notification_rule" },
  { label: "Notification Schedule", value: "notification_schedule" },
  { label: "Notification Settings", value: "notification_settings" },
  { label: "Notification Template", value: "notification_template" },
];

function formatNotificationType(value: string): string {
  return notificationTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function formatPreferenceFrequency(value: NotificationPreference["frequency"]): string {
  return preferenceFrequencyOptions.find((option) => option.value === value)?.label ?? value;
}

function isPreferenceTypeMandatory(value: NotificationType): boolean {
  return mandatoryNotificationTypes.has(value);
}

function formatUserOption(user: AdminUser): string {
  return `${user.fullName} - ${user.email}`;
}

function formatBytes(value: number | null): string {
  if (value == null) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatCadence(value: NotificationRule["cadence"]): string {
  if (value === "daily") return "Daily";
  if (value === "weekly") return "Weekly";
  if (value === "monthly") return "Monthly";
  return "Manual";
}

function notificationJobTone(status: NotificationJob["status"]) {
  if (status === "sent") return "success";
  if (status === "failed" || status === "dead_letter") return "danger";
  if (status === "cancelled") return "warning";
  if (status === "skipped") return "neutral";
  return "info";
}

function formatScheduleCadence(row: NotificationSchedule): string {
  if (row.cadence === "daily") return "Daily";
  if (row.cadence === "weekly") return "Weekly";
  if (row.cadence === "monthly") return row.dayOfMonth ? `Monthly, day ${row.dayOfMonth}` : "Monthly";
  if (row.cadence === "every_n_days") return `Every ${row.intervalDays ?? "-"} days`;
  if (row.cadence === "instant") return "Instant";
  return row.cadence;
}

function scheduleStatusTone(status: string) {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "paused") return "warning";
  if (status === "never_run") return "neutral";
  return "info";
}

function compareScheduleNextRun(left: NotificationSchedule, right: NotificationSchedule): number {
  const leftTime = left.nextRunAt ? new Date(left.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.nextRunAt ? new Date(right.nextRunAt).getTime() : Number.POSITIVE_INFINITY;
  return leftTime - rightTime;
}
