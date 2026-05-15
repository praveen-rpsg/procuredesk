import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, History, ListChecks, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  cancelNotificationJob,
  getNotificationStatus,
  listDeadLetterEvents,
  listNotificationJobs,
  listNotificationRules,
  notificationPreview,
  retryNotificationJob,
  updateNotificationRule,
  type DeadLetterEvent,
  type NotificationJob,
  type NotificationRule,
  type NotificationRuleType,
  type NotificationType,
  type NotificationPreviewRow,
} from "../api/operationsApi";
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
    description: "Weekly reminder for running cases that have not been updated recently.",
    key: "stale_tender",
    label: "No Recent Update Reminder",
  },
  {
    description: "Monthly digest for entity-level users.",
    key: "entity_monthly_digest",
    label: "Entity Monthly Digest",
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

const notificationJobColumns = (
  onRetry: (job: NotificationJob) => void,
  onCancel: (job: NotificationJob) => void,
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
        <Button
          disabled={row.status !== "failed" && row.status !== "cancelled"}
          onClick={() => onRetry(row)}
          size="sm"
          variant="secondary"
        >
          Retry
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

type OperationsSectionKey = "dead-letters" | "jobs" | "preview" | "rules";

const operationsSections = [
  { description: "Choose which business emails are enabled.", icon: Bell, key: "rules", label: "Email Rules" },
  { description: "Check recipients before scheduled emails run.", icon: ListChecks, key: "preview", label: "Recipients Preview" },
  { description: "Review queued, sent, and failed emails.", icon: History, key: "jobs", label: "Email History" },
  { description: "Delivery failures that need admin review.", icon: TriangleAlert, key: "dead-letters", label: "Delivery Issues" },
] satisfies Array<{
  description: string;
  icon: typeof Bell;
  key: OperationsSectionKey;
  label: string;
}>;

const operationsSectionPaths: Record<OperationsSectionKey, string> = {
  "dead-letters": "/admin/operations/dead-letters",
  jobs: "/admin/operations/queue-jobs",
  preview: "/admin/operations/preview",
  rules: "/admin/operations/notification-rules",
};

const legacyOperationsSectionPaths: Record<OperationsSectionKey, string> = {
  "dead-letters": "/operations/dead-letters",
  jobs: "/operations/queue-jobs",
  preview: "/operations/preview",
  rules: "/operations/notification-rules",
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
      operationsSections.filter((section) =>
        sectionRequiresAudit(section.key) ? hasAuditAccess : hasNotificationAccess,
      ),
    [hasAuditAccess, hasNotificationAccess],
  );
  const activeSection = requestedSection ?? visibleSections[0]?.key ?? "rules";
  const [ruleType, setRuleType] = useState<NotificationRule["notificationType"]>("manager_daily_snapshot");
  const [ruleCadence, setRuleCadence] = useState<NotificationRule["cadence"]>("manual");
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleThresholdDays, setRuleThresholdDays] = useState("14");
  const [jobStatus, setJobStatus] = useState<NotificationJob["status"] | "">("");
  const [jobType, setJobType] = useState<NotificationType | "">("");

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
  const notificationJobs = useQuery({
    enabled: activeSection === "jobs" && hasNotificationAccess,
    queryFn: () => listNotificationJobs({ limit: 50, notificationType: jobType, status: jobStatus }),
    queryKey: ["notification-jobs", jobStatus, jobType],
  });
  const notificationStatus = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: getNotificationStatus,
    queryKey: ["notification-status"],
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

  useEffect(() => {
    if ((location.pathname === "/operations" || location.pathname === "/admin/operations") && visibleSections[0]) {
      navigateToAppPath(operationsSectionPaths[visibleSections[0].key], { replace: true });
    }
  }, [location.pathname, visibleSections]);

  if (!visibleSections.length) {
    return <AccessDeniedState />;
  }

  if (!requestedSection && location.pathname !== "/operations" && location.pathname !== "/admin/operations") {
    return <NotFoundState />;
  }

  if (!visibleSections.some((section) => section.key === activeSection)) {
    return <AccessDeniedState />;
  }

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
        {activeSection === "rules" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Rules</p>
              <h2>Email Rules</h2>
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
                {businessRuleOptions.map((option) => (
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
                  <option value="cancelled">Cancelled</option>
                </select>
              </FormField>
            </div>
          </div>
          {retryMutation.error ? <p className="inline-error">{retryMutation.error.message}</p> : null}
          {cancelMutation.error ? <p className="inline-error">{cancelMutation.error.message}</p> : null}
          {notificationJobs.isLoading ? (
            <Skeleton height={120} />
          ) : notificationJobs.error ? (
            <p className="inline-error">{notificationJobs.error.message}</p>
          ) : (
            <DataTable
              columns={notificationJobColumns((job) => retryMutation.mutate(job), (job) => cancelMutation.mutate(job))}
              emptyMessage="No notification jobs yet."
              getRowKey={(row) => row.id}
              rows={notificationJobs.data ?? []}
            />
          )}
        </section>
        ) : null}
      </section>
    </section>
  );
}

function operationsSectionFromPath(pathname: string): OperationsSectionKey | null {
  const match = Object.entries(operationsSectionPaths).find(([, path]) => pathname === path) ??
    Object.entries(legacyOperationsSectionPaths).find(([, path]) => pathname === path);
  return match?.[0] as OperationsSectionKey | null;
}

function sectionRequiresAudit(section: OperationsSectionKey): boolean {
  return section === "dead-letters";
}

const notificationTypeOptions: Array<{ label: string; value: NotificationType }> = [
  { label: "New User Setup", value: "user_welcome" },
  { label: "Forgot Password", value: "password_reset" },
  { label: "Manager Daily Snapshot", value: "manager_daily_snapshot" },
  { label: "Delayed Case Alert", value: "delayed_case_alert" },
  { label: "Off Track Case Alert", value: "off_track_case_alert" },
  { label: "RC/PO Expiry", value: "rc_po_expiry" },
  { label: "No Recent Update Reminder", value: "stale_tender" },
  { label: "Entity Monthly Digest", value: "entity_monthly_digest" },
];

const businessRuleOptions: Array<{ label: string; value: NotificationRuleType }> = [
  { label: "Manager Daily Snapshot", value: "manager_daily_snapshot" },
  { label: "Delayed Case Reminder", value: "delayed_case_alert" },
  { label: "Off Track Case Reminder", value: "off_track_case_alert" },
  { label: "RC/PO Expiry Reminder", value: "rc_po_expiry" },
  { label: "Entity Monthly Digest", value: "entity_monthly_digest" },
  { label: "No Recent Update Reminder", value: "stale_tender" },
];

function formatNotificationType(value: string): string {
  return notificationTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function formatCadence(value: NotificationRule["cadence"]): string {
  if (value === "daily") return "Daily";
  if (value === "weekly") return "Weekly";
  if (value === "monthly") return "Monthly";
  return "Manual";
}

function notificationJobTone(status: NotificationJob["status"]) {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "warning";
  return "info";
}
