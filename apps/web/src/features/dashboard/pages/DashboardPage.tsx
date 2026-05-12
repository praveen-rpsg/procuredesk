import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FilePenLine,
  FileText,
  Gauge,
  Zap,
} from "lucide-react";

import { getCaseSummary, listCases, type CaseListItem } from "../../procurement-cases/api/casesApi";
import { listRcPoExpiry, type RcPoExpiryRow } from "../../planning/api/planningApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import {
  canCreateCase,
  canManagePlanning,
  canReadCases,
  canReadReports,
} from "../../../shared/auth/permissions";
import { formatDateOnly, todayDateOnlyString, toDateOnlyInputValue } from "../../../shared/utils/dateOnly";
import { formatCaseStage } from "../../../shared/utils/caseStage";
import { navigateToAppPath } from "../../../shared/routing/appLocation";
import { Button } from "../../../shared/ui/button/Button";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { Checkbox } from "../../../shared/ui/form/Checkbox";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";

type DashboardTarget =
  | "all-cases"
  | "assigned-cases"
  | "completed-cases"
  | "delayed-cases"
  | "imports"
  | "new-case"
  | "planning"
  | "priority-cases"
  | "reports"
  | "running-cases"
  | "update-case";

type DashboardPageProps = {
  onNavigate?: (target: DashboardTarget) => void;
};

const expiryColumns: DataTableColumn<RcPoExpiryRow>[] = [
  { key: "contract", header: "Contract", render: (row) => row.tenderDescription ?? row.sourceId },
  { key: "vendors", header: "Vendors", render: (row) => row.awardedVendors ?? "-" },
  { key: "validity", header: "Valid Till", render: (row) => formatDateOnly(row.rcPoValidityDate) },
  {
    key: "urgency",
    filterOptions: [
      { label: "Critical", value: "critical" },
      { label: "Expired", value: "expired" },
      { label: "Warning", value: "warning" },
      { label: "Normal", value: "normal" },
    ],
    filterValue: (row) => row.urgency,
    header: "Urgency",
    render: (row) => <StatusBadge tone={urgencyTone(row.urgency)}>{row.urgency}</StatusBadge>,
  },
];

function urgencyTone(urgency: RcPoExpiryRow["urgency"]) {
  if (urgency === "expired" || urgency === "critical") return "danger";
  if (urgency === "warning") return "warning";
  return "success";
}

function isCaseOverdue(row: Pick<CaseListItem, "status" | "tentativeCompletionDate">) {
  const targetDate = toDateOnlyInputValue(row.tentativeCompletionDate);
  return Boolean(
    row.status === "running" &&
      targetDate &&
      targetDate < todayDateOnlyString(),
  );
}

function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function percentage(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function caseFlagLabel(row: CaseListItem): string {
  if (isCaseOverdue(row)) return "Overdue";
  if (row.isDelayed) return "Delayed";
  if (row.priorityCase) return "Priority";
  return "Normal";
}

function uniqueFilterOptions<TRow>(rows: TRow[], getValue: (row: TRow) => string) {
  return [...new Set(rows.map((row) => getValue(row)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
    .map((value) => ({ label: value, value: value.toLowerCase() }));
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
          <Skeleton height={13} width="11%" />
          <Skeleton height={13} width="37%" />
          <Skeleton height={13} width="13%" />
          <Skeleton height={13} width="15%" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [showDelayedCases, setShowDelayedCases] = useState(false);
  const { user } = useAuth();
  const hasCaseAccess = canReadCases(user);
  const hasCreateAccess = canCreateCase(user);
  const hasPlanningAccess = canManagePlanning(user);
  const hasReportAccess = canReadReports(user);
  const summary = useQuery({ enabled: hasCaseAccess, queryFn: getCaseSummary, queryKey: ["case-summary"] });
  const focusedCases = useQuery({
    enabled: hasCaseAccess,
    queryFn: () =>
      listCases(
        showDelayedCases
          ? { isDelayed: true, limit: 5, status: "running" }
          : { limit: 5, priorityCase: true, status: "running" },
      ),
    queryKey: [showDelayedCases ? "dashboard-delayed-cases" : "dashboard-priority-cases"],
  });
  const expiryRows = useQuery({
    enabled: hasCaseAccess && hasPlanningAccess,
    queryFn: () => listRcPoExpiry({ days: 90, limit: 6 }),
    queryKey: ["dashboard-rc-po-expiry"],
  });

  if (hasCaseAccess && summary.error) {
    return <ErrorState message={summary.error.message} title="Could not load dashboard" />;
  }

  const metrics = summary.data ?? { completed: 0, delayed: 0, priority: 0, risk: 0, running: 0, total: 0 };

  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const firstName = user?.fullName?.split(" ")[0] ?? user?.username ?? "there";
  const todayFormatted = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const completionRate = percentage(metrics.completed, metrics.total);
  const runningRate = percentage(metrics.running, metrics.total);
  const riskCount = metrics.risk;
  const riskRate = percentage(riskCount, metrics.running);
  const focusedCaseRows = focusedCases.data ?? [];
  const caseColumns: DataTableColumn<CaseListItem>[] = [
    { key: "pr", header: "Case ID", render: (row) => row.prId },
    { key: "description", header: "Description", render: (row) => row.prDescription ?? row.tenderName ?? "-" },
    {
      key: "stage",
      filterOptions: uniqueFilterOptions(focusedCaseRows, (row) => formatCaseStage(row.stageCode)),
      filterValue: (row) => formatCaseStage(row.stageCode),
      header: "Stage",
      render: (row) => formatCaseStage(row.stageCode),
    },
    {
      key: "flags",
      filterOptions: uniqueFilterOptions(focusedCaseRows, caseFlagLabel),
      filterValue: caseFlagLabel,
      header: "Flags",
      render: (row) => (
        <div className="row-actions">
          {isCaseOverdue(row) ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}
          {row.isDelayed ? <StatusBadge tone="danger">Delayed</StatusBadge> : null}
          {row.priorityCase ? <StatusBadge tone="warning">Priority</StatusBadge> : null}
          {!isCaseOverdue(row) && !row.isDelayed && !row.priorityCase ? <StatusBadge>Normal</StatusBadge> : null}
        </div>
      ),
    },
    { key: "updated", header: "Updated", render: (row) => new Date(row.updatedAt).toLocaleDateString() },
  ];
  const dashboardActions = [
    {
      description: "Create a fresh PR allocation with the core case details.",
      icon: FilePlus2,
      isVisible: hasCreateAccess,
      label: "Add New Case",
      target: "new-case",
      tone: "primary",
    },
    {
      description: "Open the case list and update milestones, allocations, or awards.",
      icon: FilePenLine,
      isVisible: hasCaseAccess,
      label: "Update Existing Case",
      target: "update-case",
      tone: "neutral",
    },
    {
      description: "Manage RC/PO expiry, bulk upload, and planned tenders.",
      icon: CalendarClock,
      isVisible: hasPlanningAccess,
      label: "Tender Planning",
      target: "planning",
      tone: "planning",
    },
    {
      description: "Review portfolio reports and export procurement data.",
      icon: BarChart3,
      isVisible: hasReportAccess,
      label: "Reports",
      target: "reports",
      tone: "report",
    },
  ] satisfies Array<{
    description: string;
    icon: typeof FilePlus2;
    isVisible: boolean;
    label: string;
    target: DashboardTarget;
    tone: "neutral" | "planning" | "primary" | "report";
  }>;
  const dashboardMetrics = [
    {
      icon: FileText,
      label: "Total Cases",
      progress: undefined,
      subLabel: "All procurement records",
      target: "all-cases",
      tone: "neutral",
      value: metrics.total,
    },
    {
      icon: Activity,
      label: "Running",
      progress: runningRate,
      subLabel: `${runningRate}% of total portfolio`,
      target: "running-cases",
      tone: "brand",
      value: metrics.running,
    },
    {
      icon: CheckCircle2,
      label: "Completed",
      progress: completionRate,
      subLabel: `${completionRate}% completion rate`,
      target: "completed-cases",
      tone: "success",
      value: metrics.completed,
    },
    {
      icon: AlertTriangle,
      label: "Delayed",
      progress: percentage(metrics.delayed, Math.max(metrics.running, 1)),
      subLabel: "Needs intervention",
      target: "delayed-cases",
      tone: "danger",
      value: metrics.delayed,
    },
    {
      icon: Zap,
      label: "Priority",
      progress: percentage(metrics.priority, Math.max(metrics.running, 1)),
      subLabel: "High attention cases",
      target: "priority-cases",
      tone: "warning",
      value: metrics.priority,
    },
  ] as const;

  return (
    <section className="dashboard-grid">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-eyebrow">Procurement command center</p>
          <h1>
            {greeting}, {firstName}
          </h1>
          <p>{todayFormatted} · Track cases, risks, expiry exposure, and import operations from one focused workspace.</p>
          <div className="dashboard-hero-metrics" aria-label="Case summary">
            {dashboardMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <button
                  aria-label={`Open ${metric.label} cases`}
                  className={`metric-card dashboard-metric-card dashboard-metric-card-clickable metric-card-${metric.tone}`}
                  disabled={!hasCaseAccess}
                  key={metric.label}
                  onClick={() => onNavigate?.(metric.target)}
                  type="button"
                >
                  <div className="dashboard-metric-topline">
                    <div className="metric-card-icon">
                      <Icon size={15} />
                    </div>
                    {metric.progress != null ? <span className="dashboard-metric-percent">{metric.progress}%</span> : null}
                  </div>
                  <span>{metric.label}</span>
                  <strong>{summary.isLoading ? <Skeleton height={22} width="60%" /> : metric.value}</strong>
                </button>
              );
            })}
          </div>
        </div>
        <div className="dashboard-hero-card" aria-label="Procurement health summary">
          <div className="dashboard-health-ring">
            <Gauge size={20} />
            <strong>{summary.isLoading ? "..." : `${completionRate}%`}</strong>
            <span>Completion</span>
          </div>
          <div className="dashboard-health-list">
            <div>
              <span>Active workload</span>
              <strong>{summary.isLoading ? "-" : metrics.running}</strong>
            </div>
            <div>
              <span>Open risk signals</span>
              <strong>{summary.isLoading ? "-" : riskCount}</strong>
            </div>
            <div>
              <span>Risk density</span>
              <strong>{summary.isLoading ? "-" : `${riskRate}%`}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-actions-grid" aria-label="Dashboard actions">
        {dashboardActions
          .filter((action) => action.isVisible)
          .map((action) => {
            const Icon = action.icon;
            return (
              <button
                className={`dashboard-action-card dashboard-action-card-${action.tone}`}
                key={action.target}
                onClick={() => onNavigate?.(action.target)}
                type="button"
              >
                <span className="dashboard-action-icon" aria-hidden="true">
                  <Icon size={42} strokeWidth={1.8} />
                </span>
                <strong>{action.label}</strong>
                <span>{action.description}</span>
              </button>
            );
          })}
      </div>

      {/* Priority cases */}
      {hasCaseAccess ? (
      <section className="state-panel dashboard-priority-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">Focus</p>
            <h2>Priority Cases</h2>
          </div>
          <div className="dashboard-case-filter-actions">
            <Checkbox
              checked={showDelayedCases}
              label="Delayed Cases"
              onChange={(event) => setShowDelayedCases(event.target.checked)}
            />
            <div className={`panel-icon ${showDelayedCases ? "panel-icon-danger" : "panel-icon-warning"}`}>
              {showDelayedCases ? <AlertTriangle size={16} /> : <Zap size={16} />}
            </div>
          </div>
        </div>
        {focusedCases.isLoading ? (
          <TableSkeleton rows={4} />
        ) : focusedCases.error ? (
          <p className="inline-error">{focusedCases.error.message}</p>
        ) : (
          <DataTable
            columns={caseColumns}
            emptyMessage={showDelayedCases ? "No delayed running cases." : "No priority running cases."}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigateToAppPath(`/cases/${row.id}`)}
            rows={focusedCases.data ?? []}
          />
        )}
      </section>
      ) : null}

      {/* RC/PO expiry */}
      {hasCaseAccess && hasPlanningAccess ? (
      <section className="state-panel dashboard-expiry-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">RC / PO</p>
            <h2>Expiring Within 90 Days</h2>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onNavigate?.("planning")}>
            <Clock3 size={15} />
            View Plan
          </Button>
        </div>
        {expiryRows.isLoading ? (
          <TableSkeleton rows={5} />
        ) : expiryRows.error ? (
          <p className="inline-error">{expiryRows.error.message}</p>
        ) : (
          <DataTable
            columns={expiryColumns}
            emptyMessage="No RC/PO expiry risks in the selected horizon."
            getRowKey={(row) => row.sourceId}
            rows={expiryRows.data ?? []}
          />
        )}
      </section>
      ) : null}
    </section>
  );
}
