import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FilePlus2,
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
import { Button } from "../../../shared/ui/button/Button";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";

type DashboardTarget = "assigned-cases" | "imports" | "new-case" | "planning" | "reports";

type DashboardPageProps = {
  onNavigate?: (target: DashboardTarget) => void;
};

const caseColumns: DataTableColumn<CaseListItem>[] = [
  { key: "pr", header: "PR", render: (row) => row.prId },
  { key: "description", header: "Description", render: (row) => row.prDescription ?? row.tenderName ?? "-" },
  { key: "stage", header: "Stage", render: (row) => row.stageCode },
  {
    key: "flags",
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

const expiryColumns: DataTableColumn<RcPoExpiryRow>[] = [
  { key: "contract", header: "Contract", render: (row) => row.tenderDescription ?? row.sourceId },
  { key: "vendors", header: "Vendors", render: (row) => row.awardedVendors ?? "-" },
  { key: "validity", header: "Valid Till", render: (row) => formatDateOnly(row.rcPoValidityDate) },
  {
    key: "urgency",
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
  const { user } = useAuth();
  const hasCaseAccess = canReadCases(user);
  const hasCreateAccess = canCreateCase(user);
  const hasPlanningAccess = canManagePlanning(user);
  const hasReportAccess = canReadReports(user);
  const summary = useQuery({ enabled: hasCaseAccess, queryFn: getCaseSummary, queryKey: ["case-summary"] });
  const delayedCases = useQuery({
    enabled: hasCaseAccess,
    queryFn: () => listCases({ isDelayed: true, limit: 5, status: "running" }),
    queryKey: ["dashboard-delayed-cases"],
  });
  const priorityCases = useQuery({
    enabled: hasCaseAccess,
    queryFn: () => listCases({ limit: 5, priorityCase: true, status: "running" }),
    queryKey: ["dashboard-priority-cases"],
  });
  const expiryRows = useQuery({
    enabled: hasCaseAccess && hasPlanningAccess,
    queryFn: () => listRcPoExpiry({ days: 90, limit: 6 }),
    queryKey: ["dashboard-rc-po-expiry"],
  });

  if (hasCaseAccess && summary.error) {
    return <ErrorState message={summary.error.message} title="Could not load dashboard" />;
  }

  const metrics = summary.data ?? { completed: 0, delayed: 0, priority: 0, running: 0, total: 0 };

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
  const riskCount = metrics.delayed + metrics.priority;
  const riskRate = percentage(riskCount, Math.max(metrics.running, metrics.total));
  const dashboardMetrics = [
    {
      icon: FileText,
      label: "Total Cases",
      progress: undefined,
      subLabel: "All procurement records",
      tone: "neutral",
      value: metrics.total,
    },
    {
      icon: Activity,
      label: "Running",
      progress: runningRate,
      subLabel: `${runningRate}% of total portfolio`,
      tone: "brand",
      value: metrics.running,
    },
    {
      icon: CheckCircle2,
      label: "Completed",
      progress: completionRate,
      subLabel: `${completionRate}% completion rate`,
      tone: "success",
      value: metrics.completed,
    },
    {
      icon: AlertTriangle,
      label: "Delayed",
      progress: percentage(metrics.delayed, Math.max(metrics.running, 1)),
      subLabel: "Needs intervention",
      tone: "danger",
      value: metrics.delayed,
    },
    {
      icon: Zap,
      label: "Priority",
      progress: percentage(metrics.priority, Math.max(metrics.running, 1)),
      subLabel: "High attention cases",
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
        <div className="dashboard-hero-actions">
            {hasCreateAccess ? (
            <Button onClick={() => onNavigate?.("new-case")}>
              <FilePlus2 size={16} />
              New Case
            </Button>
            ) : null}
            {hasReportAccess ? (
            <Button variant="secondary" onClick={() => onNavigate?.("reports")}>
              <BarChart3 size={16} />
              Open Reports
            </Button>
            ) : null}
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

      <div className="dashboard-metrics-row">
        {dashboardMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={`metric-card dashboard-metric-card metric-card-${metric.tone}`} key={metric.label}>
              <div className="dashboard-metric-topline">
                <div className="metric-card-icon">
                  <Icon size={16} />
                </div>
                {metric.progress != null ? <span className="dashboard-metric-percent">{metric.progress}%</span> : null}
              </div>
              <span>{metric.label}</span>
              <strong>{summary.isLoading ? <Skeleton height={26} width="60%" /> : metric.value}</strong>
              <small>{metric.subLabel}</small>
              {metric.progress != null ? (
                <div className="dashboard-metric-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(metric.progress, 100)}%` }} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {/* Delayed cases */}
      {hasCaseAccess ? (
      <section className="state-panel dashboard-delayed-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">Risk</p>
            <h2>Delayed Cases</h2>
          </div>
          <div className="panel-icon panel-icon-danger">
            <AlertTriangle size={16} />
          </div>
        </div>
        {delayedCases.isLoading ? (
          <TableSkeleton rows={4} />
        ) : delayedCases.error ? (
          <p className="inline-error">{delayedCases.error.message}</p>
        ) : (
          <DataTable
            columns={caseColumns}
            emptyMessage="No delayed running cases."
            getRowKey={(row) => row.id}
            rows={delayedCases.data ?? []}
          />
        )}
      </section>
      ) : null}

      {/* Priority cases */}
      {hasCaseAccess ? (
      <section className="state-panel dashboard-priority-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">Focus</p>
            <h2>Priority Cases</h2>
          </div>
          <div className="panel-icon panel-icon-warning">
            <Zap size={16} />
          </div>
        </div>
        {priorityCases.isLoading ? (
          <TableSkeleton rows={4} />
        ) : priorityCases.error ? (
          <p className="inline-error">{priorityCases.error.message}</p>
        ) : (
          <DataTable
            columns={caseColumns}
            emptyMessage="No priority running cases."
            getRowKey={(row) => row.id}
            rows={priorityCases.data ?? []}
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
