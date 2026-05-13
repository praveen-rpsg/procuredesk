import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ListChecks, MailPlus, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createNotificationJob,
  getNotificationStatus,
  listDeadLetterEvents,
  listNotificationRules,
  notificationPreview,
  updateNotificationRule,
  type DeadLetterEvent,
  type NotificationRule,
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
    description: "Triggers daily; one email per Tender Owner with stale running cases.",
    key: "stale_tender",
    label: "#21 - Tender Owner stale-update alert (>10 days)",
  },
  {
    description: "Triggers monthly; one email per ENTITY-level user.",
    key: "entity_monthly_digest",
    label: "#22 - Entity-wise monthly stale-update digest",
  },
  {
    description: "Triggers on the 1st of each month.",
    key: "rc_po_expiry",
    label: "#23 - Entity-wise RC/PO expiry alert (90-day window)",
  },
] satisfies Array<{
  description: string;
  key: "entity_monthly_digest" | "rc_po_expiry" | "stale_tender";
  label: string;
}>;

const deadLetterColumns: DataTableColumn<DeadLetterEvent>[] = [
  { key: "time", header: "Time", render: (row) => new Date(row.createdAt).toLocaleString() },
  { key: "event", header: "Event", render: (row) => row.eventType },
  { key: "attempts", header: "Attempts", render: (row) => row.attempts },
  { key: "error", header: "Error", render: (row) => row.errorMessage },
];

const ruleColumns: DataTableColumn<NotificationRule>[] = [
  { key: "type", header: "Type", render: (row) => row.notificationType },
  { key: "enabled", header: "Enabled", render: (row) => (row.isEnabled ? "Yes" : "No") },
  { key: "cadence", header: "Cadence", render: (row) => row.cadence },
  { key: "threshold", header: "Threshold", render: (row) => row.thresholdDays ?? "-" },
];

type OperationsSectionKey = "dead-letters" | "jobs" | "preview" | "rules";

const operationsSections = [
  { description: "Notification cadence and threshold setup.", icon: Bell, key: "rules", label: "Notification Rules" },
  { description: "Preview email audiences before queueing.", icon: ListChecks, key: "preview", label: "Preview" },
  { description: "Queue manual notification jobs.", icon: MailPlus, key: "jobs", label: "Queue Jobs" },
  { description: "Failed background events that need review.", icon: TriangleAlert, key: "dead-letters", label: "Dead Letters" },
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
  const [previewType, setPreviewType] = useState<"entity_monthly_digest" | "rc_po_expiry" | "stale_tender">("stale_tender");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [ruleType, setRuleType] = useState<NotificationRule["notificationType"]>("stale_tender");
  const [ruleCadence, setRuleCadence] = useState<NotificationRule["cadence"]>("manual");
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleThresholdDays, setRuleThresholdDays] = useState("14");

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
  const previewQueries = {
    entity_monthly_digest: monthlyDigestPreview,
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

  const notificationMutation = useMutation({
    mutationFn: () =>
      createNotificationJob({
        notificationType: previewType,
        recipientEmail,
        subject,
      }),
    onSuccess: (result) => {
      notify({ message: `Notification queued: ${result.id}`, tone: "success" });
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
      <PageHeader eyebrow="Admin" title="Audit And Notifications">
        Manage notification rules, delivery previews, queue jobs, and operational reliability events.
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
              <h2>Notification Rules</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <Bell size={16} />
            </div>
          </div>
          <div className="notification-job-form">
            <FormField label="Rule Type">
              <select
                className="text-input"
                onChange={(event) => setRuleType(event.target.value as NotificationRule["notificationType"])}
                value={ruleType}
              >
                <option value="stale_tender">Stale Tender</option>
                <option value="entity_monthly_digest">Entity Monthly Digest</option>
                <option value="rc_po_expiry">RC/PO Expiry</option>
              </select>
            </FormField>
            <FormField label="Cadence">
              <select
                className="text-input"
                onChange={(event) => setRuleCadence(event.target.value as NotificationRule["cadence"])}
                value={ruleCadence}
              >
                <option value="manual">Manual</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
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
              <h2>Email Alert Preview</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <Bell size={16} />
            </div>
          </div>
          <div className={`operations-alert-mode operations-alert-mode-${notificationStatus.data?.deliveryMode ?? "stub"}`}>
            <Bell aria-hidden="true" size={18} />
            {notificationStatus.data?.graphConfigured ? (
              <span>Microsoft Graph delivery is configured. Preview rows show alerts that are eligible to be sent.</span>
            ) : (
              <span>
                <strong>Stub mode</strong> - the system shows the alerts that would be sent right now, but no email leaves the system until Microsoft Graph is configured.
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
                    <h3>{card.label} ({rows.length} emails)</h3>
                    <span>{card.description}</span>
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
                      emptyMessage="No alerts to send right now."
                      getRowKey={(row) =>
                        `${card.key}:${row.targetId ?? row.subject}:${row.recipientEmail ?? "entity"}`
                      }
                      rows={rows}
                    />
                  ) : (
                    <div className="operations-alert-card-body operations-alert-empty">No alerts to send right now.</div>
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
              <h2>Dead Letter Events</h2>
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
              emptyMessage="No dead-letter events."
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
              <p className="eyebrow">Queue</p>
              <h2>Create Notification Job</h2>
            </div>
          </div>
          <div className="notification-job-form">
            <FormField label="Notification Type">
              <select
                className="text-input"
                onChange={(event) =>
                  setPreviewType(event.target.value as "entity_monthly_digest" | "rc_po_expiry" | "stale_tender")
                }
                value={previewType}
              >
                <option value="stale_tender">Stale Tender</option>
                <option value="entity_monthly_digest">Entity Monthly Digest</option>
                <option value="rc_po_expiry">RC/PO Expiry</option>
              </select>
            </FormField>
            <FormField label="Recipient Email">
              <TextInput
                onChange={(event) => setRecipientEmail(event.target.value)}
                type="email"
                value={recipientEmail}
              />
            </FormField>
            <FormField label="Subject">
              <TextInput onChange={(event) => setSubject(event.target.value)} value={subject} />
            </FormField>
            <Button
              disabled={notificationMutation.isPending || !recipientEmail || !subject}
              onClick={() => notificationMutation.mutate()}
            >
              Queue Notification
            </Button>
          </div>
          {notificationMutation.error ? (
            <p className="inline-error">{notificationMutation.error.message}</p>
          ) : null}
          <StatusBadge tone="warning">Microsoft Graph credentials required before queuing</StatusBadge>
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
