import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FilePlus2,
  FilePenLine,
  FileText,
  Gauge,
  Zap,
} from "lucide-react";

import {
  getCase,
  getCaseSummary,
  listCases,
  type CaseSummary,
  type CaseListItem,
} from "../../procurement-cases/api/casesApi";
import { StageAgingModalContent } from "../../procurement-cases/components/StageAgingModalContent";
import {
  listRcPoExpiry,
  type RcPoExpiryRow,
} from "../../planning/api/planningApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import {
  canAccessPlanning,
  canCreateCase,
  canManagePlanning,
  canReadCases,
  canReadReports,
} from "../../../shared/auth/permissions";
import {
  formatDateOnly,
} from "../../../shared/utils/dateOnly";
import { formatCaseStage } from "../../../shared/utils/caseStage";
import { navigateToAppPath } from "../../../shared/routing/appLocation";
import { Button } from "../../../shared/ui/button/Button";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { Checkbox } from "../../../shared/ui/form/Checkbox";
import { Modal } from "../../../shared/ui/modal/Modal";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "../../../shared/ui/table/DataTable";

type DashboardTarget =
  | "all-cases"
  | "assigned-cases"
  | "completed-cases"
  | "delayed-cases"
  | "imports"
  | "new-case"
  | "off-track-cases"
  | "on-track-cases"
  | "planning"
  | "priority-cases"
  | "reports"
  | "running-cases"
  | "update-case";

type DashboardPageProps = {
  onNavigate?: (target: DashboardTarget) => void;
};

type FocusCaseMode = "delayed" | "priority";
type DashboardMetricTarget = Extract<
  DashboardTarget,
  | "all-cases"
  | "completed-cases"
  | "delayed-cases"
  | "off-track-cases"
  | "on-track-cases"
  | "priority-cases"
  | "running-cases"
>;
type CaseSummaryEntity = CaseSummary["byEntity"][number];

const DASHBOARD_TABLE_FETCH_LIMIT = 100;
const DASHBOARD_TABLE_PAGE_SIZE = 10;

const expiryColumns: DataTableColumn<RcPoExpiryRow>[] = [
  {
    key: "entity",
    header: "Entity",
    render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
  },
  {
    key: "contract",
    header: "Contract Description",
    render: (row) =>
      row.sourceCaseId ? (
        <button
          className="dashboard-drilldown-link"
          onClick={(event) => {
            event.stopPropagation();
            navigateToAppPath(`/cases/${row.sourceCaseId}`);
          }}
          type="button"
        >
          <span>{row.tenderDescription ?? row.sourceId}</span>
          <ExternalLink size={13} />
        </button>
      ) : (
        row.tenderDescription ?? row.sourceId
      ),
  },
  {
    key: "contractType",
    header: "Source",
    render: (row) => formatContractType(row.sourceOrigin),
  },
  {
    key: "department",
    header: "User Department",
    render: (row) => row.departmentName ?? "-",
  },
  {
    key: "vendors",
    header: "Vendor Name",
    render: (row) => row.awardedVendors ?? "-",
  },
  {
    key: "daysRemaining",
    header: "Days Remaining for Expiry",
    render: (row) => row.daysToExpiry ?? "-",
  },
  {
    key: "awardDate",
    header: "Award Date",
    render: (row) => formatDateOnly(row.rcPoAwardDate),
  },
  {
    key: "validityDate",
    header: "Validity Date",
    render: (row) => formatDateOnly(row.rcPoValidityDate),
  },
  {
    key: "amount",
    header: "Contract Amount (Rs.) [All Inclusive]",
    render: (row) => formatRupees(row.rcPoAmount),
  },
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
    render: (row) => (
      <StatusBadge tone={urgencyTone(row.urgency)}>{row.urgency}</StatusBadge>
    ),
  },
];

function formatContractType(sourceOrigin: RcPoExpiryRow["sourceOrigin"]) {
  if (sourceOrigin === "tenderdb") return "TenderDB";
  if (sourceOrigin === "bulk_upload") return "Bulk Upload";
  return "Manual Entry";
}

function formatRupees(value: number | null): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "INR",
  }).format(value);
}

function urgencyTone(urgency: RcPoExpiryRow["urgency"]) {
  if (urgency === "expired" || urgency === "critical") return "danger";
  if (urgency === "warning") return "warning";
  return "success";
}

function isCaseOffTrack(
  row: Pick<
    CaseListItem,
    "desiredStageCode" | "isDelayed" | "stageCode" | "status"
  >,
) {
  return Boolean(
    row.status === "running" &&
      !row.isDelayed &&
      row.desiredStageCode != null &&
      row.stageCode < row.desiredStageCode,
  );
}

function isCaseOnTrack(
  row: Pick<
    CaseListItem,
    "desiredStageCode" | "isDelayed" | "stageCode" | "status"
  >,
) {
  return Boolean(
    row.status === "running" &&
      !row.isDelayed &&
      (row.desiredStageCode == null || row.stageCode >= row.desiredStageCode),
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

function dashboardCasePathForTarget(
  target: DashboardMetricTarget,
  entityId?: string,
): string {
  const params = new URLSearchParams();
  if (entityId) params.set("entityIds", entityId);
  if (target === "running-cases") params.set("status", "running");
  if (target === "completed-cases") params.set("status", "completed");
  if (target === "delayed-cases") params.set("trackStatus", "delayed");
  if (target === "off-track-cases") params.set("trackStatus", "off_track");
  if (target === "on-track-cases") params.set("trackStatus", "on_track");
  if (target === "priority-cases") {
    params.set("status", "running");
    params.set("priorityCase", "true");
  }
  const query = params.toString();
  return `/cases${query ? `?${query}` : ""}`;
}

function metricEntityCount(
  entity: CaseSummaryEntity,
  target: DashboardMetricTarget,
): number {
  if (target === "running-cases") return entity.running;
  if (target === "completed-cases") return entity.completed;
  if (target === "delayed-cases") return entity.delayed;
  if (target === "off-track-cases") return entity.offTrack;
  if (target === "on-track-cases") return entity.onTrack;
  if (target === "priority-cases") return entity.priority;
  return entity.total;
}

function entityBreakdownForMetric(
  entities: CaseSummaryEntity[],
  target: DashboardMetricTarget,
) {
  return entities
    .map((entity) => ({
      count: metricEntityCount(entity, target),
      entity,
    }))
    .filter((item) => item.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count ||
        entityDisplayName(left.entity).localeCompare(
          entityDisplayName(right.entity),
        ),
    );
}

function caseFlagLabel(row: CaseListItem): string {
  if (row.isDelayed) return "Delayed";
  if (isCaseOffTrack(row)) return "Off Track";
  if (isCaseOnTrack(row)) return "On Track";
  if (row.priorityCase) return "Priority";
  return "Normal";
}

function uniqueFilterOptions<TRow>(
  rows: TRow[],
  getValue: (row: TRow) => string,
) {
  return [...new Set(rows.map((row) => getValue(row)).filter(Boolean))]
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )
    .map((value) => ({ label: value, value: value.toLowerCase() }));
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "var(--space-4)",
            alignItems: "center",
          }}
        >
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
  const [focusCaseMode, setFocusCaseMode] =
    useState<FocusCaseMode>("priority");
  const [stageAgingCaseId, setStageAgingCaseId] = useState<string | null>(null);
  const { user } = useAuth();
  const hasTenantContext = Boolean(user?.tenantId);
  const hasCaseAccess = hasTenantContext && canReadCases(user);
  const hasCreateAccess = hasTenantContext && canCreateCase(user);
  const hasPlanningAccess = hasTenantContext && canAccessPlanning(user);
  const hasPlanningManageAccess = hasTenantContext && canManagePlanning(user);
  const hasReportAccess = hasTenantContext && canReadReports(user);
  const hasExpiryAccess =
    hasCaseAccess && (hasPlanningManageAccess || hasReportAccess);
  const summary = useQuery({
    enabled: hasCaseAccess,
    queryFn: getCaseSummary,
    queryKey: ["case-summary"],
  });
  const focusedCases = useQuery({
    enabled: hasCaseAccess,
    queryFn: () =>
      listCases(
        focusCaseMode === "delayed"
          ? { limit: DASHBOARD_TABLE_FETCH_LIMIT, trackStatus: "delayed" }
          : {
              limit: DASHBOARD_TABLE_FETCH_LIMIT,
              priorityCase: true,
              status: "running",
            },
      ),
    queryKey: [
      focusCaseMode === "delayed"
        ? "dashboard-delayed-cases"
        : "dashboard-priority-cases",
    ],
  });
  const stageAgingCase = useQuery({
    enabled: Boolean(stageAgingCaseId),
    queryFn: () => getCase(stageAgingCaseId as string),
    queryKey: ["dashboard-stage-aging-case", stageAgingCaseId],
  });
  const expiryRows = useQuery({
    enabled: hasExpiryAccess,
    queryFn: () =>
      listRcPoExpiry({ days: 90, limit: DASHBOARD_TABLE_FETCH_LIMIT }),
    queryKey: ["dashboard-rc-po-expiry"],
  });

  if (hasCaseAccess && summary.error) {
    return (
      <ErrorState
        message={summary.error.message}
        title="Could not load dashboard"
      />
    );
  }

  const metrics = summary.data ?? {
    byEntity: [],
    completed: 0,
    delayed: 0,
    offTrack: 0,
    onTrack: 0,
    priority: 0,
    risk: 0,
    running: 0,
    total: 0,
  };

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
    {
      key: "entity",
      filterOptions: uniqueFilterOptions(focusedCaseRows, entityDisplayName),
      filterValue: entityDisplayName,
      header: "Entity",
      render: entityDisplayName,
    },
    {
      key: "description",
      header: "PR Description",
      render: (row) => row.prDescription ?? row.tenderName ?? "-",
    },
    {
      key: "tenderType",
      filterOptions: uniqueFilterOptions(
        focusedCaseRows,
        (row) => row.tenderTypeName ?? "-",
      ),
      filterValue: (row) => row.tenderTypeName ?? "-",
      header: "Tender Type",
      render: (row) => row.tenderTypeName ?? "-",
    },
    {
      key: "runningAge",
      header: "Running Tender Age",
      render: (row) => formatDays(row.runningAgeDays),
    },
    {
      key: "currentStageAge",
      header: "Current Stage Aging",
      render: (row) => formatDays(row.currentStageAgingDays),
    },
    {
      key: "stage",
      filterOptions: uniqueFilterOptions(focusedCaseRows, (row) =>
        formatCaseStage(row.stageCode),
      ),
      filterValue: (row) => formatCaseStage(row.stageCode),
      header: "Current Tender Stage",
      render: (row) => formatCaseStage(row.stageCode),
    },
    {
      key: "normativeStage",
      filterOptions: uniqueFilterOptions(focusedCaseRows, (row) =>
        row.desiredStageCode == null
          ? "-"
          : formatCaseStage(row.desiredStageCode),
      ),
      filterValue: (row) =>
        row.desiredStageCode == null
          ? "-"
          : formatCaseStage(row.desiredStageCode),
      header: "Normative Tender Stage",
      render: (row) =>
        row.desiredStageCode == null
          ? "-"
          : formatCaseStage(row.desiredStageCode),
    },
    {
      key: "elapsed",
      header: "% Time Elapsed",
      render: (row) =>
        row.percentTimeElapsed == null ? "-" : `${row.percentTimeElapsed}%`,
    },
    {
      key: "owner",
      filterOptions: uniqueFilterOptions(
        focusedCaseRows,
        (row) => row.ownerFullName ?? "-",
      ),
      filterValue: (row) => row.ownerFullName ?? "-",
      header: "Tender Owner",
      render: (row) => row.ownerFullName ?? "-",
    },
    {
      key: "flags",
      filterOptions: uniqueFilterOptions(focusedCaseRows, caseFlagLabel),
      filterValue: caseFlagLabel,
      header: "Flags",
      render: (row) => (
        <div className="row-actions">
          {row.isDelayed ? (
            <StatusBadge tone="danger">Delayed</StatusBadge>
          ) : null}
          {isCaseOffTrack(row) ? (
            <StatusBadge tone="warning">Off Track</StatusBadge>
          ) : null}
          {isCaseOnTrack(row) ? (
            <StatusBadge tone="success">On Track</StatusBadge>
          ) : null}
          {row.priorityCase ? (
            <StatusBadge tone="warning">Priority</StatusBadge>
          ) : null}
          {!isCaseOffTrack(row) && !isCaseOnTrack(row) && !row.isDelayed && !row.priorityCase ? (
            <StatusBadge>Normal</StatusBadge>
          ) : null}
        </div>
      ),
    },
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
      description:
        "Open the case list and update milestones, allocations, or awards.",
      icon: FilePenLine,
      isVisible: hasCaseAccess,
      label: "Update / View Existing Case",
      target: "update-case",
      tone: "neutral",
    },
    {
      description: "Plan upcoming tenders and maintain the tender pipeline.",
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
      group: "Volume",
      icon: FileText,
      label: "Total Cases",
      progress: undefined,
      subLabel: "All procurement records",
      target: "all-cases",
      tone: "neutral",
      value: metrics.total,
    },
    {
      group: "Volume",
      icon: Activity,
      label: "Running",
      progress: runningRate,
      subLabel: `${runningRate}% of total portfolio`,
      target: "running-cases",
      tone: "brand",
      value: metrics.running,
    },
    {
      group: "Volume",
      icon: CheckCircle2,
      label: "Completed",
      progress: completionRate,
      subLabel: `${completionRate}% completion rate`,
      target: "completed-cases",
      tone: "success",
      value: metrics.completed,
    },
    {
      group: "Exceptions",
      icon: AlertTriangle,
      label: "Delayed",
      progress: percentage(metrics.delayed, Math.max(metrics.running, 1)),
      subLabel: "Needs intervention",
      target: "delayed-cases",
      tone: "danger",
      value: metrics.delayed,
    },
    {
      group: "Exceptions",
      icon: Clock3,
      label: "Off Track",
      progress: percentage(metrics.offTrack, Math.max(metrics.running, 1)),
      subLabel: "Form date passed",
      target: "off-track-cases",
      tone: "warning",
      value: metrics.offTrack,
    },
    {
      group: "Exceptions",
      icon: Zap,
      label: "Priority",
      progress: percentage(metrics.priority, Math.max(metrics.running, 1)),
      subLabel: "High attention cases",
      target: "priority-cases",
      tone: "warning",
      value: metrics.priority,
    },
    {
      group: "Health",
      icon: Gauge,
      label: "On Track",
      progress: percentage(metrics.onTrack, Math.max(metrics.running, 1)),
      subLabel: "Within form date",
      target: "on-track-cases",
      tone: "success",
      value: metrics.onTrack,
    },
  ] as const;
  const dashboardMetricGroups = [
    {
      key: "Volume",
      label: "Case Volume",
      metrics: dashboardMetrics.filter((metric) => metric.group === "Volume"),
    },
    {
      key: "Exceptions",
      label: "Exception Queue",
      metrics: dashboardMetrics.filter(
        (metric) => metric.group === "Exceptions",
      ),
    },
    {
      key: "Health",
      label: "Delivery Health",
      metrics: dashboardMetrics.filter((metric) => metric.group === "Health"),
    },
  ];

  return (
    <>
      <section className="dashboard-grid">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-eyebrow">Procurement command center</p>
          <h1>
            {greeting}, {firstName}
          </h1>
          <div className="dashboard-hero-meta" aria-label="Dashboard context">
            <span>{todayFormatted}</span>
            <span>{metrics.running} active cases</span>
            <span>{riskCount} open risk signals</span>
          </div>
          <div
            className="dashboard-metric-groups"
            aria-label="Case summary"
          >
            {dashboardMetricGroups.map((group) => (
              <section className="dashboard-metric-group" key={group.key}>
                <p>{group.label}</p>
                <div className="dashboard-hero-metrics">
                  {group.metrics.map((metric) => {
                    const Icon = metric.icon;
                    const entityBreakdown = entityBreakdownForMetric(
                      metrics.byEntity,
                      metric.target,
                    );
                    return (
                      <article
                        className={`metric-card dashboard-metric-card metric-card-${metric.tone}`}
                        key={metric.label}
                      >
                        <button
                          aria-label={`Open ${metric.label} cases`}
                          className="dashboard-metric-main-button dashboard-metric-card-clickable"
                          disabled={!hasCaseAccess}
                          onClick={() => onNavigate?.(metric.target)}
                          type="button"
                        >
                          <div className="dashboard-metric-topline">
                            <div className="metric-card-icon">
                              <Icon size={15} />
                            </div>
                            {metric.progress != null ? (
                              <span className="dashboard-metric-percent">
                                {metric.progress}%
                              </span>
                            ) : null}
                          </div>
                          <span>{metric.label}</span>
                          <strong>
                            {summary.isLoading ? (
                              <Skeleton height={22} width="60%" />
                            ) : (
                              metric.value
                            )}
                          </strong>
                          <small>{metric.subLabel}</small>
                          {metric.progress != null ? (
                            <span
                              aria-hidden="true"
                              className="dashboard-metric-bar"
                            >
                              <i style={{ width: `${metric.progress}%` }} />
                            </span>
                          ) : null}
                        </button>
                        {!summary.isLoading && entityBreakdown.length ? (
                          <div
                            aria-label={`${metric.label} by entity`}
                            className="dashboard-metric-entity-breakdown"
                          >
                            {entityBreakdown.map(({ count, entity }) => (
                              <button
                                aria-label={`Open ${metric.label} cases for ${entityDisplayName(entity)}`}
                                className="dashboard-metric-entity-chip"
                                disabled={!hasCaseAccess}
                                key={entity.entityId}
                                onClick={() =>
                                  navigateToAppPath(
                                    dashboardCasePathForTarget(
                                      metric.target,
                                      entity.entityId,
                                    ),
                                  )
                                }
                                type="button"
                              >
                                <span>{entityDisplayName(entity)}</span>
                                <strong>{count}</strong>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div
          className="dashboard-hero-card"
          aria-label="Procurement health summary"
        >
          <div className="dashboard-health-overview">
            <div className="dashboard-health-overview-topline">
              <span>
                <Gauge size={17} />
                Portfolio completion
              </span>
              <strong>{summary.isLoading ? "..." : `${completionRate}%`}</strong>
            </div>
            <div className="dashboard-health-progress" aria-hidden="true">
              <i style={{ width: `${completionRate}%` }} />
            </div>
            <p>
              {metrics.completed} of {metrics.total} cases completed
            </p>
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
              <h2>Priority / Delayed Cases</h2>
            </div>
            <div className="dashboard-case-filter-actions">
              <Checkbox
                checked={focusCaseMode === "priority"}
                label="Priority Cases"
                onChange={() => setFocusCaseMode("priority")}
              />
              <Checkbox
                checked={focusCaseMode === "delayed"}
                label="Delayed Cases"
                onChange={() => setFocusCaseMode("delayed")}
              />
              <div
                className={`panel-icon ${focusCaseMode === "delayed" ? "panel-icon-danger" : "panel-icon-warning"}`}
              >
                {focusCaseMode === "delayed" ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Zap size={16} />
                )}
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
              emptyMessage={
                focusCaseMode === "delayed"
                  ? "No delayed running cases."
                  : "No priority running cases."
              }
              getRowKey={(row) => row.id}
              onRowClick={(row) => setStageAgingCaseId(row.id)}
              pagination={{
                pageSize: DASHBOARD_TABLE_PAGE_SIZE,
                pageSizeOptions: [10, 25, 50],
              }}
              rows={focusedCases.data ?? []}
            />
          )}
        </section>
      ) : null}

      {/* RC/PO expiry */}
      {hasExpiryAccess ? (
        <section className="state-panel dashboard-expiry-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">RC / PO</p>
              <h2>Expiring Within 90 Days</h2>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigateToAppPath("/reports/rc-po-expiry")}
            >
              <Clock3 size={15} />
              View Report
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
              pagination={{
                pageSize: DASHBOARD_TABLE_PAGE_SIZE,
                pageSizeOptions: [10, 25, 50],
              }}
              rows={expiryRows.data ?? []}
            />
          )}
        </section>
      ) : null}
      </section>

      <Modal
        isOpen={Boolean(stageAgingCaseId)}
        onClose={() => setStageAgingCaseId(null)}
        size="wide"
        title="Stage Wise Aging"
      >
        {stageAgingCase.isLoading ? (
          <TableSkeleton rows={4} />
        ) : stageAgingCase.error ? (
          <p className="inline-error">{stageAgingCase.error.message}</p>
        ) : stageAgingCase.data ? (
          <StageAgingModalContent kase={stageAgingCase.data} />
        ) : null}
      </Modal>
    </>
  );
}

function entityDisplayName(row: {
  entityCode?: string | null;
  entityId: string;
  entityName?: string | null;
}) {
  return row.entityCode ?? row.entityName ?? row.entityId;
}

function formatDays(value: number | null | undefined) {
  return value == null ? "-" : `${value} days`;
}
