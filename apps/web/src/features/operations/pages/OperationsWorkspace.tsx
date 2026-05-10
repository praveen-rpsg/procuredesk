import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ListChecks, MailPlus, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createNotificationJob,
  listAuditEvents,
  listDeadLetterEvents,
  listNotificationRules,
  notificationPreview,
  updateNotificationRule,
  type AuditEvent,
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

const auditColumns: DataTableColumn<AuditEvent>[] = [
  { key: "time", header: "Time", render: (row) => new Date(row.occurredAt).toLocaleString() },
  { key: "action", header: "Action", render: (row) => row.action },
  { key: "target", header: "Target", render: (row) => row.targetType },
  { key: "summary", header: "Summary", render: (row) => row.summary },
];

const previewColumns: DataTableColumn<NotificationPreviewRow>[] = [
  { key: "subject", header: "Subject", render: (row) => row.subject },
  { key: "recipient", header: "Recipient", render: (row) => row.recipientEmail ?? "Entity digest" },
  { key: "summary", header: "Summary", render: (row) => row.summary },
];

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

type OperationsSectionKey = "audit" | "dead-letters" | "jobs" | "preview" | "rules";

const operationsSections = [
  { description: "Recent tenant activity and system events.", icon: ShieldCheck, key: "audit", label: "Audit Logs" },
  { description: "Notification cadence and threshold setup.", icon: Bell, key: "rules", label: "Notification Rules" },
  { description: "Preview email audiences before queueing.", icon: ListChecks, key: "preview", label: "Preview" },
  { description: "Queue manual notification jobs.", icon: MailPlus, key: "jobs", label: "Queue Jobs" },
  { description: "Failed background events that need review.", icon: TriangleAlert, key: "dead-letters", label: "Dead Letters" },
] satisfies Array<{
  description: string;
  icon: typeof ShieldCheck;
  key: OperationsSectionKey;
  label: string;
}>;

const operationsSectionPaths: Record<OperationsSectionKey, string> = {
  audit: "/operations/audit-logs",
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
  const activeSection = requestedSection ?? visibleSections[0]?.key ?? "audit";
  const [previewType, setPreviewType] = useState<"entity_monthly_digest" | "rc_po_expiry" | "stale_tender">("stale_tender");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [ruleType, setRuleType] = useState<NotificationRule["notificationType"]>("stale_tender");
  const [ruleCadence, setRuleCadence] = useState<NotificationRule["cadence"]>("manual");
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleThresholdDays, setRuleThresholdDays] = useState("14");

  const audit = useQuery({
    enabled: activeSection === "audit" && hasAuditAccess,
    queryFn: () => listAuditEvents(),
    queryKey: ["audit-events"],
  });
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
  const preview = useQuery({
    enabled: activeSection === "preview" && hasNotificationAccess,
    queryFn: () => notificationPreview(previewType),
    queryKey: ["notification-preview", previewType],
  });

  useEffect(() => {
    if (location.pathname === "/operations" && visibleSections[0]) {
      navigateToAppPath(operationsSectionPaths[visibleSections[0].key], { replace: true });
    }
  }, [location.pathname, visibleSections]);

  if (!visibleSections.length) {
    return <AccessDeniedState />;
  }

  if (!requestedSection && location.pathname !== "/operations") {
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
      <PageHeader eyebrow="Operations" title="Audit And Notifications">
        Review audit activity, notification rules, delivery previews, and operational reliability queues.
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

        {activeSection === "audit" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Audit</p>
              <h2>Recent Events</h2>
            </div>
            <div className="panel-icon panel-icon-success">
              <ShieldCheck size={16} />
            </div>
          </div>
          {audit.isLoading ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                  <Skeleton height={13} width="18%" />
                  <Skeleton height={13} width="16%" />
                  <Skeleton height={13} width="12%" />
                  <Skeleton height={13} width="35%" />
                </div>
              ))}
            </div>
          ) : audit.error ? (
            <p className="inline-error">{audit.error.message}</p>
          ) : (
            <DataTable columns={auditColumns} getRowKey={(row) => row.id} rows={audit.data ?? []} />
          )}
        </section>
        ) : null}

        {activeSection === "preview" ? (
        <section className="state-panel module-focus-panel module-focus-panel-narrow">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Notify</p>
              <h2>Preview</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <Bell size={16} />
            </div>
          </div>
          <div className="stack-form">
            <FormField label="Preview Type">
              <select
                className="text-input"
                onChange={(event) => setPreviewType(event.target.value as typeof previewType)}
                value={previewType}
              >
                <option value="stale_tender">Stale Tender</option>
                <option value="entity_monthly_digest">Entity Monthly Digest</option>
                <option value="rc_po_expiry">RC/PO Expiry</option>
              </select>
            </FormField>
            {preview.isLoading ? (
              <Skeleton height={20} />
            ) : preview.error ? (
              <p className="inline-error">{preview.error.message}</p>
            ) : (
              <DataTable
                columns={previewColumns}
                emptyMessage="No preview rows found."
                getRowKey={(row) => row.targetId ?? row.subject}
                rows={preview.data ?? []}
              />
            )}
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
  const match = Object.entries(operationsSectionPaths).find(([, path]) => pathname === path);
  return match?.[0] as OperationsSectionKey | null;
}

function sectionRequiresAudit(section: OperationsSectionKey): boolean {
  return section === "audit" || section === "dead-letters";
}
