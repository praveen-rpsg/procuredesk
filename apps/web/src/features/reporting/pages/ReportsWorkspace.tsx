import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  getExportDownloadUrl,
  refreshReportProjections,
  type ContractExpiryReportRow,
  type ExportJobStatus,
  type ReportCaseRow,
  type ReportingAnalytics,
  type SavedReportView,
  type StageTimeRow,
  type VendorAwardReportRow,
} from "../api/reportingApi";
import { useReportData } from "../hooks/useReportData";
import { useReportExport } from "../hooks/useReportExport";
import { useReportFilters } from "../hooks/useReportFilters";
import {
  amountUnitLabel,
  applySavedView,
  formatAmount,
  formatDecimal,
  formatMonth,
  getReportLabel,
  REPORT_OPTIONS,
  reportPathForKey,
  reportViewFromPath,
  type AmountUnit,
  type ReportViewKey,
} from "../utils/reportUtils";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { canExportReports } from "../../../shared/auth/permissions";
import { Button } from "../../../shared/ui/button/Button";
import { navigateToAppPath, useAppLocation } from "../../../shared/routing/appLocation";
import { Drawer } from "../../../shared/ui/drawer/Drawer";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { CheckboxList } from "../../../shared/ui/form/CheckboxList";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { KpiTile } from "../../../shared/ui/kpi-tile/KpiTile";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { AccessDeniedState, NotFoundState } from "../../../shared/ui/app-states/AppStates";
import { type VirtualTableColumn, VirtualTable } from "../../../shared/ui/table/VirtualTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

export function ReportsWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const location = useAppLocation();
  const reportView = reportViewFromPath(location.pathname);
  const activeReport = reportView ?? "analytics";
  const reportCode =
    activeReport === "analytics" || activeReport === "export_jobs" || activeReport === "saved_views"
      ? "tender_details"
      : activeReport;
  const isAnalyticsView = activeReport === "analytics";
  const isExportJobsView = activeReport === "export_jobs";
  const isSavedViewsView = activeReport === "saved_views";
  const isInvalidReportPath = reportView === null && location.pathname !== "/reports";
  const canExport = canExportReports(user);

  const [savedViewName, setSavedViewName] = useState("");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [isSavedViewsOpen, setIsSavedViewsOpen] = useState(false);
  const [selectedRowsByReport, setSelectedRowsByReport] = useState<Record<string, string[]>>({});
  const initialExportJobId = useMemo(() => new URLSearchParams(location.search).get("jobId") ?? "", [location.search]);

  const filters = useReportFilters(reportCode);
  const selectedExportIds = selectedRowsByReport[activeReport] ?? [];
  const data = useReportData(reportCode, filters.reportParams, filters.analyticsParams);
  const exportState = useReportExport(
    reportCode,
    filters.exportFilters,
    filters.savedViewFilters,
    selectedExportIds,
    savedViewName,
    setSavedViewName,
    {
      initialExportJobId,
      onExportCreated: (job) => navigateToAppPath(`/reports/export-jobs?jobId=${job.id}`),
    },
  );

  const refreshMutation = useMutation({
    mutationFn: refreshReportProjections,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["report"] });
      notify({ message: "Report projections refreshed.", tone: "success" });
    },
  });

  useEffect(() => {
    if (location.pathname === "/reports") {
      navigateToAppPath("/reports/analytics", { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    setSelectedRowsByReport((current) => ({ ...current, [activeReport]: [] }));
  }, [activeReport, filters.reportParams]);

  const metrics = data.analytics.data;
  const selectedReportLabel = getReportLabel(activeReport);
  const statusFilterApplies = !isExportJobsView && (reportCode === "tender_details" || reportCode === "stage_time");

  const entityOptions = useMemo(
    () =>
      (data.filterMetadata.data?.entities ?? []).map((entity) => ({
        label: entity.code ? `${entity.code} - ${entity.name ?? entity.id}` : entity.name ?? entity.id,
        value: entity.id,
      })),
    [data.filterMetadata.data?.entities],
  );
  const ownerOptions = useMemo(
    () =>
      (data.filterMetadata.data?.owners ?? []).map((owner) => ({
        label: owner.fullName ? `${owner.fullName} (${owner.username ?? "user"})` : owner.username ?? owner.id,
        value: owner.id,
      })),
    [data.filterMetadata.data?.owners],
  );
  const tenderTypeOptions = useMemo(
    () => (data.filterMetadata.data?.tenderTypes ?? []).map((type) => ({ label: type.name, value: type.id })),
    [data.filterMetadata.data?.tenderTypes],
  );
  const stageOptions = useMemo(
    () =>
      (data.filterMetadata.data?.stages ?? []).map((stage) => ({ label: `Stage ${stage}`, value: String(stage) })),
    [data.filterMetadata.data?.stages],
  );
  const completionFyOptions = useMemo(
    () => (data.filterMetadata.data?.completionFys ?? []).map((fy) => ({ label: fy, value: fy })),
    [data.filterMetadata.data?.completionFys],
  );
  const prReceiptMonthOptions = useMemo(
    () =>
      (data.filterMetadata.data?.prReceiptMonths ?? []).map((month) => ({ label: formatMonth(month), value: month })),
    [data.filterMetadata.data?.prReceiptMonths],
  );
  const completionMonthOptions = useMemo(
    () =>
      (data.filterMetadata.data?.completionMonths ?? []).map((month) => ({ label: formatMonth(month), value: month })),
    [data.filterMetadata.data?.completionMonths],
  );
  const activeFilterCount = countActiveReportFilters(filters, statusFilterApplies);
  const activeFilterChips = buildActiveReportFilterChips(filters, {
    completionFyOptions,
    completionMonthOptions,
    entityOptions,
    ownerOptions,
    prReceiptMonthOptions,
    stageOptions,
    statusFilterApplies,
    tenderTypeOptions,
  });

  const caseColumns = useMemo<VirtualTableColumn<ReportCaseRow>[]>(
    () => [
      { key: "pr", header: "PR", render: (row) => row.prId },
      { key: "tender", header: "Tender", render: (row) => row.tenderName ?? "-" },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusBadge tone={row.status === "completed" ? "success" : "warning"}>{row.status}</StatusBadge>
        ),
      },
      { key: "stage", header: "Stage", render: (row) => `Stage ${row.stageCode}` },
      {
        key: "award",
        header: "Awarded",
        render: (row) => formatAmount(row.totalAwardedAmount, filters.amountUnit),
      },
    ],
    [filters.amountUnit],
  );
  const vendorColumns = useMemo<VirtualTableColumn<VendorAwardReportRow>[]>(
    () => [
      { key: "vendor", header: "Vendor", render: (row) => row.vendorName },
      { key: "pr", header: "PR", render: (row) => row.prId },
      { key: "po", header: "PO", render: (row) => row.poNumber ?? "-" },
      { key: "value", header: "Value", render: (row) => formatAmount(row.poValue, filters.amountUnit) },
      { key: "awardDate", header: "Award Date", render: (row) => row.poAwardDate ?? "-" },
      { key: "validity", header: "Validity", render: (row) => row.poValidityDate ?? "-" },
    ],
    [filters.amountUnit],
  );
  const stageColumns = useMemo<VirtualTableColumn<StageTimeRow>[]>(
    () => [
      { key: "stage", header: "Stage", render: (row) => `Stage ${row.stageCode}` },
      { key: "count", header: "Cases", render: (row) => row.caseCount },
      {
        key: "age",
        header: "Avg Running Age",
        render: (row) =>
          row.averageRunningAgeDays == null ? "-" : `${Math.round(row.averageRunningAgeDays)}d`,
      },
    ],
    [],
  );
  const rcPoColumns = useMemo<VirtualTableColumn<ContractExpiryReportRow>[]>(
    () => [
      { key: "tender", header: "Tender", render: (row) => row.tenderDescription ?? "-" },
      { key: "vendors", header: "Vendors", render: (row) => row.awardedVendors ?? "-" },
      { key: "amount", header: "Amount", render: (row) => formatAmount(row.rcPoAmount, filters.amountUnit) },
      { key: "validity", header: "Validity", render: (row) => row.rcPoValidityDate },
      {
        key: "days",
        header: "Days",
        render: (row) => (
          <StatusBadge tone={row.daysToExpiry <= 30 ? "danger" : row.daysToExpiry <= 90 ? "warning" : "neutral"}>
            {row.daysToExpiry}
          </StatusBadge>
        ),
      },
      {
        key: "floated",
        header: "Floated",
        render: (row) => (row.tenderFloatedOrNotRequired ? "Yes" : "No"),
      },
    ],
    [filters.amountUnit],
  );

  function handleApplySavedView(view: SavedReportView) {
    navigateToAppPath(reportPathForKey(view.reportCode as ReportViewKey));
    applySavedView(view, {
      setAmountUnit: filters.setAmountUnit,
      setCompletionFys: filters.setSelectedCompletionFys,
      setCompletionMonths: filters.setSelectedCompletionMonths,
      setDateFrom: filters.setDateFrom,
      setDateTo: filters.setDateTo,
      setEntityIds: filters.setSelectedEntityIds,
      setOwnerUserIds: filters.setSelectedOwnerUserIds,
      setPrReceiptMonths: filters.setSelectedPrReceiptMonths,
      setSearchTerm: filters.setSearchTerm,
      setStageCodes: filters.setSelectedStageCodes,
      setStatusFilter: filters.setStatusFilter,
      setTenderTypeIds: filters.setSelectedTenderTypeIds,
    });
    notify({ message: `Applied view: ${view.name}`, tone: "success" });
  }

  function setSelectedReportRows(rowIds: string[]) {
    setSelectedRowsByReport((current) => ({ ...current, [activeReport]: rowIds }));
  }

  if (isInvalidReportPath) {
    return <NotFoundState />;
  }

  if (isExportJobsView && !canExport) {
    return <AccessDeniedState />;
  }

  return (
    <section className="workspace-section">
      <PageHeader
        actions={
          <>
            <Button disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()} variant="secondary">
              <RefreshCw size={18} />
              Refresh
            </Button>
            <Button disabled title="Scheduled report delivery is coming soon." variant="secondary">
              <CalendarClock size={18} />
              Schedule
            </Button>
            {canExport && !isAnalyticsView && !isExportJobsView && !isSavedViewsView ? (
              <Button
                disabled={exportState.exportMutation.isPending}
                onClick={() => exportState.exportMutation.mutate()}
              >
                <Download size={18} />
                {exportState.selectedExportCount
                  ? `Export ${exportState.selectedExportCount} selected`
                  : `Export ${exportState.exportFormat.toUpperCase()}`}
              </Button>
            ) : null}
          </>
        }
        eyebrow="Reports"
        title={isAnalyticsView ? "Report Analytics" : selectedReportLabel}
      >
        Filter, review, save, and export procurement reporting views across tender, award, stage, and RC/PO workflows.
      </PageHeader>

      <section className="report-command-panel">
        <div className="report-command-topline">
          <SecondaryNav
            activeKey={activeReport}
            ariaLabel="Report type"
            items={REPORT_OPTIONS.filter((option) => canExport || option.code !== "export_jobs").map((option) => ({
              icon: option.icon,
              key: option.code,
              label: option.label,
            }))}
            onChange={(key) => navigateToAppPath(reportPathForKey(key as ReportViewKey))}
          />
          <span className="report-command-timestamp">
            Updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {!isExportJobsView && !isSavedViewsView ? (
        <div className="report-smart-filter-bar">
          <div className="report-search-control">
            <Search aria-hidden="true" size={17} />
            <TextInput
              aria-label="Search reports"
              onChange={(event) => filters.setSearchTerm(event.target.value)}
              placeholder="Search PR, tender, vendor"
              value={filters.searchTerm}
            />
          </div>
          {statusFilterApplies ? (
            <select
              aria-label="Status"
              className="text-input report-compact-select"
              onChange={(event) => filters.setStatusFilter(event.target.value as "all" | "running" | "completed")}
              value={filters.statusFilter}
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
            </select>
          ) : activeReport === "running" || activeReport === "completed" ? (
            <span className="report-scope-chip">
              {activeReport === "completed" ? "Completed cases only" : "Running cases only"}
            </span>
          ) : null}
          <TextInput
            aria-label="From date"
            className="report-date-control"
            onChange={(event) => filters.setDateFrom(event.target.value)}
            type="date"
            value={filters.dateFrom}
          />
          <TextInput
            aria-label="To date"
            className="report-date-control"
            onChange={(event) => filters.setDateTo(event.target.value)}
            type="date"
            value={filters.dateTo}
          />
          <Button onClick={() => setIsAdvancedFiltersOpen(true)} variant="secondary">
            <SlidersHorizontal size={17} />
            More Filters
            {activeFilterCount ? <span className="button-count-badge">{activeFilterCount}</span> : null}
          </Button>
          <Button onClick={() => setIsSavedViewsOpen((value) => !value)} variant="secondary">
            <Star size={17} />
            Views
          </Button>
          <Button onClick={filters.clearFilters} variant="ghost">
            <X size={17} />
            Reset
          </Button>
        </div>
        ) : null}

        {!isExportJobsView && !isSavedViewsView && activeFilterChips.length ? (
          <div className="report-active-filter-strip" aria-label="Active filters">
            {activeFilterChips.slice(0, 7).map((chip) => (
              <span className="report-filter-chip" key={chip}>{chip}</span>
            ))}
            {activeFilterChips.length > 7 ? (
              <span className="report-filter-chip">+{activeFilterChips.length - 7} more</span>
            ) : null}
            <button onClick={filters.clearFilters} type="button">Clear all</button>
          </div>
        ) : null}

        {!isExportJobsView && !isSavedViewsView && isSavedViewsOpen ? (
          <section className="report-saved-views-popover">
            <div>
              <p className="eyebrow">Saved Views</p>
              <h2>Reusable report presets</h2>
            </div>
            <form
              className="report-save-view-inline"
              onSubmit={(event) => {
                event.preventDefault();
                if (savedViewName.trim()) exportState.savedViewMutation.mutate();
              }}
            >
              <TextInput
                aria-label="Saved view name"
                onChange={(event) => setSavedViewName(event.target.value)}
                placeholder="View name"
                value={savedViewName}
              />
              <Button disabled={exportState.savedViewMutation.isPending || !savedViewName.trim()} type="submit">
                <Save size={16} />
                Save
              </Button>
            </form>
            {data.savedViews.isLoading ? (
              <Skeleton height={20} />
            ) : data.savedViews.error ? (
              <p className="inline-error">{data.savedViews.error.message}</p>
            ) : (
              <div className="saved-view-list">
                {(data.savedViews.data ?? []).map((view) => (
                  <button
                    className="saved-view-chip"
                    key={view.id}
                    onClick={() => handleApplySavedView(view)}
                    type="button"
                  >
                    {view.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </section>

      {!isExportJobsView && !isSavedViewsView ? (
      <ReportFilterDrawer
        activeFilterCount={activeFilterCount}
        completionFyOptions={completionFyOptions}
        completionMonthOptions={completionMonthOptions}
        dataIsLoading={data.filterMetadata.isLoading}
        entityOptions={entityOptions}
        exportFormat={exportState.exportFormat}
        filters={filters}
        isOpen={isAdvancedFiltersOpen}
        onClose={() => setIsAdvancedFiltersOpen(false)}
        ownerOptions={ownerOptions}
        prReceiptMonthOptions={prReceiptMonthOptions}
        setExportFormat={exportState.setExportFormat}
        stageOptions={stageOptions}
        tenderTypeOptions={tenderTypeOptions}
      />
      ) : null}

      {isSavedViewsView ? (
        <ReportSavedViewsWorkspace
          error={data.allSavedViews.error}
          isLoading={data.allSavedViews.isLoading}
          onApply={handleApplySavedView}
          views={data.allSavedViews.data ?? []}
        />
      ) : isExportJobsView ? (
        <section className="report-export-jobs-workspace">
          <ReportExportStatusPanel
            canDownloadExport={exportState.canDownloadExport}
            exportJobId={exportState.exportJobId}
            exportStatus={exportState.exportStatus.data}
            exportStatusError={exportState.exportStatus.error}
            exportStatusIsLoading={exportState.exportStatus.isLoading}
            onExportJobIdChange={exportState.setExportJobId}
            reportLabel="any report"
          />
        </section>
      ) : isAnalyticsView ? (
        <>
          <div className="report-section-heading">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>Procurement reporting health</h2>
            </div>
            <span>{activeFilterCount ? `${activeFilterCount} filters applied` : "Default view"}</span>
          </div>

          {data.analytics.isLoading ? (
            <section className="state-panel">
              <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} height={52} width="11%" />
                ))}
              </div>
            </section>
          ) : data.analytics.error ? (
            <ErrorState message={data.analytics.error.message} title="Could not load analytics" />
          ) : (
            <section className="grid report-kpi-grid">
              <KpiTile label="Total" value={metrics?.totalCases ?? 0} />
              <KpiTile label="Running" value={metrics?.runningCases ?? 0} />
              <KpiTile label="Completed" value={metrics?.completedCases ?? 0} />
              <KpiTile label="Delayed" value={metrics?.delayedCases ?? 0} tone="danger" />
              <KpiTile label="Awarded" value={formatAmount(metrics?.totalAwardedAmount ?? 0, filters.amountUnit)} />
              <KpiTile
                label="Savings WRT PR"
                tone="success"
                value={formatAmount(metrics?.savingsWrtPr ?? 0, filters.amountUnit)}
              />
              <KpiTile label="Avg Bidders" value={formatDecimal(metrics?.averageBiddersParticipated)} />
              <KpiTile label="Avg Qualified" value={formatDecimal(metrics?.averageQualifiedBidders)} />
            </section>
          )}

          <ReportAnalyticsDashboard
            amountUnit={filters.amountUnit}
            metrics={metrics}
            stageError={data.stageTime.error}
            stageIsLoading={data.stageTime.isLoading}
            stageRows={data.stageTime.data}
          />
        </>
      ) : (
        <section className="report-detail-workspace">
          <section className="state-panel report-main-panel">
            <div className="detail-header">
              <div>
                <p className="eyebrow">Active Report</p>
                <h2>{selectedReportLabel}</h2>
              </div>
            </div>
            {reportCode === "tender_details" ? (
              <ReportTable
                columns={caseColumns}
                data={data.tenderDetails.data}
                emptyMessage="No tender details match the current filters."
                error={data.tenderDetails.error}
                getRowKey={(row) => row.caseId}
                isLoading={data.tenderDetails.isLoading}
                isSelectionEnabled={canExport}
                onSelectedRowIdsChange={setSelectedReportRows}
                selectedRowIds={selectedExportIds}
              />
            ) : null}
            {reportCode === "running" ? (
              <ReportTable
                columns={caseColumns}
                data={data.running.data}
                emptyMessage="No running tenders match the current filters."
                error={data.running.error}
                getRowKey={(row) => row.caseId}
                isLoading={data.running.isLoading}
                isSelectionEnabled={canExport}
                onSelectedRowIdsChange={setSelectedReportRows}
                selectedRowIds={selectedExportIds}
              />
            ) : null}
            {reportCode === "completed" ? (
              <ReportTable
                columns={caseColumns}
                data={data.completed.data}
                emptyMessage="No completed tenders match the current filters."
                error={data.completed.error}
                getRowKey={(row) => row.caseId}
                isLoading={data.completed.isLoading}
                isSelectionEnabled={canExport}
                onSelectedRowIdsChange={setSelectedReportRows}
                selectedRowIds={selectedExportIds}
              />
            ) : null}
            {reportCode === "vendor_awards" ? (
              <ReportTable
                columns={vendorColumns}
                data={data.vendorAwards.data}
                emptyMessage="No vendor awards match the current filters."
                error={data.vendorAwards.error}
                getRowKey={(row) => row.awardId}
                isLoading={data.vendorAwards.isLoading}
                isSelectionEnabled={canExport}
                onSelectedRowIdsChange={setSelectedReportRows}
                selectedRowIds={selectedExportIds}
              />
            ) : null}
            {reportCode === "stage_time" ? (
              <ReportTable
                columns={stageColumns}
                data={data.stageTime.data}
                emptyMessage="No stage aging rows match the current filters."
                error={data.stageTime.error}
                getRowKey={(row) => String(row.stageCode)}
                isLoading={data.stageTime.isLoading}
                isSelectionEnabled={canExport}
                onSelectedRowIdsChange={setSelectedReportRows}
                selectedRowIds={selectedExportIds}
              />
            ) : null}
            {reportCode === "rc_po_expiry" ? (
              <ReportTable
                columns={rcPoColumns}
                data={data.rcPoExpiry.data}
                emptyMessage="No RC/PO expiry rows match the current filters."
                error={data.rcPoExpiry.error}
                getRowKey={(row) => row.sourceId}
                isLoading={data.rcPoExpiry.isLoading}
                isSelectionEnabled={canExport}
                onSelectedRowIdsChange={setSelectedReportRows}
                selectedRowIds={selectedExportIds}
              />
            ) : null}
          </section>
        </section>
      )}
    </section>
  );
}

type ReportOption = { label: string; value: string };

function ReportSavedViewsWorkspace({
  error,
  isLoading,
  onApply,
  views,
}: {
  error: Error | null;
  isLoading: boolean;
  onApply: (view: SavedReportView) => void;
  views: SavedReportView[];
}) {
  return (
    <section className="state-panel report-saved-views-workspace">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Saved Views</p>
          <h2>Report presets</h2>
        </div>
      </div>
      {isLoading ? (
        <div className="report-saved-view-grid">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} height={108} />
          ))}
        </div>
      ) : error ? (
        <p className="inline-error">{error.message}</p>
      ) : views.length === 0 ? (
        <div className="report-export-empty">
          <Star aria-hidden="true" size={22} />
          <strong>No saved views yet</strong>
          <p>Use the Views button on a report tab to save the current filters as a reusable preset.</p>
        </div>
      ) : (
        <div className="report-saved-view-grid">
          {views.map((view) => (
            <article className="report-saved-view-card" key={view.id}>
              <div>
                <p className="eyebrow">{getReportLabel(view.reportCode)}</p>
                <h3>{view.name}</h3>
              </div>
              <div className="report-saved-view-meta">
                <span>{Object.keys(view.filters ?? {}).length} filters</span>
                {view.isDefault ? <StatusBadge tone="success">Default</StatusBadge> : null}
              </div>
              <Button onClick={() => onApply(view)} variant="secondary">
                Apply View
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ReportAnalyticsDashboard({
  amountUnit,
  metrics,
  stageError,
  stageIsLoading,
  stageRows,
}: {
  amountUnit: AmountUnit;
  metrics: ReportingAnalytics | undefined;
  stageError: Error | null;
  stageIsLoading: boolean;
  stageRows: StageTimeRow[] | undefined;
}) {
  const statusRows = [
    { label: "Running", tone: "warning" as const, value: metrics?.runningCases ?? 0 },
    { label: "Completed", tone: "success" as const, value: metrics?.completedCases ?? 0 },
    { label: "Delayed", tone: "danger" as const, value: metrics?.delayedCases ?? 0 },
  ];
  const entityRows = (metrics?.byEntity ?? []).map((row) => ({
    amount: row.totalAwardedAmount,
    label: row.entityCode ?? row.entityName ?? row.entityId,
    secondaryValue: row.delayedCount,
    value: row.caseCount,
  }));
  const tenderTypeRows = (metrics?.byTenderType ?? []).map((row) => ({
    amount: row.totalAwardedAmount,
    label: row.tenderTypeName,
    secondaryValue: row.delayedCount,
    value: row.caseCount,
  }));
  const stageChartRows = (stageRows ?? []).map((row) => ({
    label: `Stage ${row.stageCode}`,
    value: row.caseCount,
  }));
  const completedRatio = metrics?.totalCases ? Math.round(((metrics.completedCases ?? 0) / metrics.totalCases) * 100) : 0;
  const delayedRatio = metrics?.totalCases ? Math.round(((metrics.delayedCases ?? 0) / metrics.totalCases) * 100) : 0;

  return (
    <section className="report-analytics-dashboard">
      <section className="state-panel report-analytics-hero">
        <div className="report-analytics-hero-copy">
          <p className="eyebrow">Analytics Summary</p>
          <h2>How procurement is performing</h2>
          <p>
            Start with workload status, then scan where cases and award value are concentrated.
          </p>
          <div className="report-analytics-hero-metrics">
            <div>
              <span>Completion</span>
              <strong>{completedRatio}%</strong>
            </div>
            <div>
              <span>Delayed</span>
              <strong>{delayedRatio}%</strong>
            </div>
            <div>
              <span>Awarded</span>
              <strong>{formatAmount(metrics?.totalAwardedAmount ?? 0, amountUnit)}</strong>
            </div>
          </div>
        </div>
        <div className="report-analytics-hero-chart">
          <ReportDonutChart rows={statusRows} total={metrics?.totalCases ?? 0} />
        </div>
      </section>

      <section className="state-panel report-analytics-card">
        <ReportChartHeader
          eyebrow="Where work sits"
          subtitle={`${entityRows.length} reporting groups`}
          title="Cases by entity"
        />
        <ReportPremiumBarChart rows={entityRows} amountUnit={amountUnit} />
      </section>

      <section className="state-panel report-analytics-card">
        <ReportChartHeader
          eyebrow="Type breakdown"
          subtitle={`${tenderTypeRows.length} tender types`}
          title="Tender type split"
        />
        <ReportPremiumBarChart rows={tenderTypeRows} amountUnit={amountUnit} />
      </section>

      <section className="state-panel report-analytics-card report-analytics-wide">
        <ReportChartHeader
          eyebrow="Process stage"
          subtitle={stageIsLoading ? "Loading stages" : `${stageChartRows.length} active stages`}
          title="Stage distribution"
        />
        {stageIsLoading ? (
          <Skeleton height={180} />
        ) : stageError ? (
          <p className="inline-error">{stageError.message}</p>
        ) : (
          <ReportStageBreakdown rows={stageChartRows} />
        )}
      </section>
    </section>
  );
}

function ReportChartHeader({ eyebrow, subtitle, title }: { eyebrow: string; subtitle: string; title: string }) {
  return (
    <div className="report-chart-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span>{subtitle}</span>
    </div>
  );
}

function ReportPremiumBarChart({
  amountUnit,
  rows,
}: {
  amountUnit: AmountUnit;
  rows: Array<{ amount: number; label: string; secondaryValue: number; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0) {
    return <p className="hero-copy">No chart data for the current filters.</p>;
  }

  return (
    <div className="report-premium-bar-list">
      {rows.map((row, index) => (
        <div className="report-premium-bar-row" key={row.label}>
          <div className="report-premium-bar-rank">{index + 1}</div>
          <div className="report-premium-bar-body">
            <div className="report-premium-bar-label">
              <strong>{row.label}</strong>
              <span>{formatAmount(row.amount, amountUnit)} awarded</span>
            </div>
            <div className="report-premium-bar-track">
              <span style={{ width: `${Math.max(5, (row.value / max) * 100)}%` }} />
            </div>
          </div>
          <div className="report-premium-bar-values">
            <strong>{row.value}</strong>
            <span>{row.secondaryValue} delayed</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportStageBreakdown({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (rows.length === 0) {
    return <p className="hero-copy">No stage data for the current filters.</p>;
  }

  return (
    <div className="report-stage-breakdown">
      {rows.map((row) => (
        <div className="report-stage-row" key={row.label}>
          <div>
            <strong>{row.label}</strong>
            <span>{total > 0 ? Math.round((row.value / total) * 100) : 0}% of cases</span>
          </div>
          <div className="report-stage-track" aria-label={`${row.label}: ${row.value} cases`}>
            <span style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }} />
          </div>
          <div className="report-stage-count">
            <strong>{row.value}</strong>
            <span>{row.value === 1 ? "case" : "cases"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportAnalyticsPanel({
  metrics,
  stageError,
  stageIsLoading,
  stageRows,
}: {
  metrics: ReportingAnalytics | undefined;
  stageError: Error | null;
  stageIsLoading: boolean;
  stageRows: StageTimeRow[] | undefined;
}) {
  const statusRows = [
    { label: "Running", tone: "warning" as const, value: metrics?.runningCases ?? 0 },
    { label: "Completed", tone: "success" as const, value: metrics?.completedCases ?? 0 },
    { label: "Delayed", tone: "danger" as const, value: metrics?.delayedCases ?? 0 },
  ];
  const entityRows = (metrics?.byEntity ?? []).map((row) => ({
    label: row.entityCode ?? row.entityName ?? row.entityId,
    value: row.caseCount,
  }));
  const tenderTypeRows = (metrics?.byTenderType ?? []).map((row) => ({
    label: row.tenderTypeName,
    value: row.caseCount,
  }));

  return (
    <section className="state-panel report-analytics-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Distribution</h2>
        </div>
        <BarChart3 aria-hidden="true" className="report-panel-icon" size={18} />
      </div>

      <ReportDonutChart rows={statusRows} total={metrics?.totalCases ?? 0} />

      <div className="report-chart-card">
        <div>
          <p className="report-chart-title">By Entity</p>
          <span>{entityRows.length} groups</span>
        </div>
        <ReportBarChart rows={entityRows} />
      </div>

      <div className="report-chart-card">
        <div>
          <p className="report-chart-title">By Tender Type</p>
          <span>{tenderTypeRows.length} groups</span>
        </div>
        <ReportBarChart rows={tenderTypeRows} />
      </div>

      <div className="report-chart-card">
        <div>
          <p className="report-chart-title">By Stage</p>
          <span>{stageRows?.length ?? 0} stages</span>
        </div>
        {stageIsLoading ? (
          <Skeleton height={20} />
        ) : stageError ? (
          <p className="inline-error">{stageError.message}</p>
        ) : (
          <ReportBarChart
            rows={(stageRows ?? []).map((row) => ({
              label: `Stage ${row.stageCode}`,
              value: row.caseCount,
            }))}
          />
        )}
      </div>
    </section>
  );
}

function ReportDonutChart({
  rows,
  total,
}: {
  rows: Array<{ label: string; tone: "danger" | "success" | "warning"; value: number }>;
  total: number;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="report-donut-card">
      <div className="report-donut-visual" aria-label={`Status distribution total ${total}`} role="img">
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle className="report-donut-track" cx="48" cy="48" r={radius} />
          {rows.map((row) => {
            const length = total > 0 ? (row.value / total) * circumference : 0;
            const dashOffset = offset;
            offset -= length;
            return (
              <circle
                className={`report-donut-segment report-donut-${row.tone}`}
                cx="48"
                cy="48"
                key={row.label}
                r={radius}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div>
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="report-donut-legend">
        {rows.map((row) => (
          <div key={row.label}>
            <span className={`report-legend-dot report-legend-${row.tone}`} />
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportExportStatusPanel({
  canDownloadExport,
  exportJobId,
  exportStatus,
  exportStatusError,
  exportStatusIsLoading,
  onExportJobIdChange,
  reportLabel,
}: {
  canDownloadExport: boolean;
  exportJobId: string;
  exportStatus: ExportJobStatus | undefined;
  exportStatusError: Error | null;
  exportStatusIsLoading: boolean;
  onExportJobIdChange: (jobId: string) => void;
  reportLabel: string;
}) {
  return (
    <section className="state-panel report-export-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Exports</p>
          <h2>Export Status</h2>
        </div>
        <FileSpreadsheet aria-hidden="true" className="report-panel-icon" size={18} />
      </div>
      <FormField label="Export Job ID">
        <TextInput
          onChange={(event) => onExportJobIdChange(event.target.value)}
          placeholder="Paste an export job ID"
          value={exportJobId}
        />
      </FormField>
      {exportStatusIsLoading ? (
        <div className="report-export-skeleton">
          <Skeleton height={18} />
          <Skeleton height={72} />
        </div>
      ) : exportStatusError ? (
        <p className="inline-error">{exportStatusError.message}</p>
      ) : exportStatus ? (
        <div className="report-export-status-card">
          <div className="report-export-status-head">
            <CheckCircle2 aria-hidden="true" size={18} />
            <div>
              <strong>{exportStatus.status}</strong>
              <span>{exportStatus.progressMessage ?? "Export job is being processed."}</span>
            </div>
          </div>
          <div className="report-export-progress">
            <div>
              <span>Progress</span>
              <strong>{exportStatus.progressPercent}%</strong>
            </div>
            <progress max={100} value={exportStatus.progressPercent} />
          </div>
          <dl className="report-export-meta">
            <div>
              <dt>Format</dt>
              <dd>{exportStatus.format.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{exportStatus.expiresAt ? new Date(exportStatus.expiresAt).toLocaleDateString() : "-"}</dd>
            </div>
          </dl>
          {exportStatus.status === "queued" || exportStatus.status === "running" ? (
            <p className="report-export-help">
              This page refreshes automatically while the worker prepares the file. The download button appears after
              the export reaches Completed.
            </p>
          ) : null}
          {exportStatus.status === "failed" ? (
            <p className="inline-error">
              Export failed. Check the worker logs, then run the export again after the issue is resolved.
            </p>
          ) : null}
          {canDownloadExport ? (
            <Button className="report-download-link" href={getExportDownloadUrl(exportJobId)} variant="secondary">
              <Download size={16} />
              Download File
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="report-export-empty">
          <FileSpreadsheet aria-hidden="true" size={22} />
          <strong>No export selected</strong>
          <p>Run an export for {reportLabel}, then track progress and download the file here.</p>
        </div>
      )}
    </section>
  );
}

function ReportFilterDrawer({
  activeFilterCount,
  completionFyOptions,
  completionMonthOptions,
  dataIsLoading,
  entityOptions,
  exportFormat,
  filters,
  isOpen,
  onClose,
  ownerOptions,
  prReceiptMonthOptions,
  setExportFormat,
  stageOptions,
  tenderTypeOptions,
}: {
  activeFilterCount: number;
  completionFyOptions: ReportOption[];
  completionMonthOptions: ReportOption[];
  dataIsLoading: boolean;
  entityOptions: ReportOption[];
  exportFormat: "csv" | "xlsx";
  filters: ReturnType<typeof useReportFilters>;
  isOpen: boolean;
  onClose: () => void;
  ownerOptions: ReportOption[];
  prReceiptMonthOptions: ReportOption[];
  setExportFormat: (format: "csv" | "xlsx") => void;
  stageOptions: ReportOption[];
  tenderTypeOptions: ReportOption[];
}) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Report Filters">
      <div className="report-filter-drawer">
        <div className="report-filter-drawer-summary">
          <Filter aria-hidden="true" size={18} />
          <span>{activeFilterCount} active filters</span>
        </div>
        <section aria-label="Advanced report filters" className="report-filter-matrix report-filter-matrix-compact">
          <FormField label="Entities">
            <CheckboxList
              ariaLabel="Entity report filter"
              disabled={dataIsLoading}
              emptyMessage="No entities found."
              onChange={filters.setSelectedEntityIds}
              options={entityOptions}
              searchPlaceholder="Search entities..."
              value={filters.selectedEntityIds}
            />
          </FormField>
          <FormField label="Tender Owners">
            <CheckboxList
              ariaLabel="Tender owner report filter"
              disabled={dataIsLoading}
              emptyMessage="No owners found."
              onChange={filters.setSelectedOwnerUserIds}
              options={ownerOptions}
              searchPlaceholder="Search owners..."
              value={filters.selectedOwnerUserIds}
            />
          </FormField>
          <FormField label="Tender Types">
            <CheckboxList
              ariaLabel="Tender type report filter"
              disabled={dataIsLoading}
              emptyMessage="No tender types found."
              onChange={filters.setSelectedTenderTypeIds}
              options={tenderTypeOptions}
              searchPlaceholder="Search tender types..."
              value={filters.selectedTenderTypeIds}
            />
          </FormField>
          <FormField label="Stages">
            <CheckboxList
              ariaLabel="Stage report filter"
              disabled={dataIsLoading}
              emptyMessage="No stages found."
              onChange={filters.setSelectedStageCodes}
              options={stageOptions}
              searchPlaceholder="Search stages..."
              value={filters.selectedStageCodes}
            />
          </FormField>
          <FormField label="Completion FY">
            <CheckboxList
              ariaLabel="Completion financial year report filter"
              disabled={dataIsLoading}
              emptyMessage="No completion years found."
              onChange={filters.setSelectedCompletionFys}
              options={completionFyOptions}
              searchPlaceholder="Search FY..."
              value={filters.selectedCompletionFys}
            />
          </FormField>
          <FormField label="PR Receipt Month">
            <CheckboxList
              ariaLabel="PR receipt month report filter"
              disabled={dataIsLoading}
              emptyMessage="No receipt months found."
              onChange={filters.setSelectedPrReceiptMonths}
              options={prReceiptMonthOptions}
              searchPlaceholder="Search months..."
              value={filters.selectedPrReceiptMonths}
            />
          </FormField>
          <FormField label="Completion Month">
            <CheckboxList
              ariaLabel="Completion month report filter"
              disabled={dataIsLoading}
              emptyMessage="No completion months found."
              onChange={filters.setSelectedCompletionMonths}
              options={completionMonthOptions}
              searchPlaceholder="Search months..."
              value={filters.selectedCompletionMonths}
            />
          </FormField>
        </section>
        <div className="report-actions-row report-drawer-actions">
          <div aria-label="Amount display unit" className="segmented-control" role="group">
            {(["absolute", "lakh", "crore"] as AmountUnit[]).map((unit) => (
              <button
                className={filters.amountUnit === unit ? "segmented-control-active" : ""}
                key={unit}
                onClick={() => filters.setAmountUnit(unit)}
                type="button"
              >
                {amountUnitLabel(unit)}
              </button>
            ))}
          </div>
          <div aria-label="Export format" className="segmented-control" role="group">
            {(["xlsx", "csv"] as const).map((format) => (
              <button
                className={exportFormat === format ? "segmented-control-active" : ""}
                key={format}
                onClick={() => setExportFormat(format)}
                type="button"
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={filters.clearFilters}>
            <X size={18} />
            Clear
          </Button>
          <Button onClick={onClose}>Apply Filters</Button>
        </div>
      </div>
    </Drawer>
  );
}

function ReportTable<TRow>({
  columns,
  data,
  emptyMessage,
  error,
  getRowKey,
  isLoading,
  isSelectionEnabled,
  onSelectedRowIdsChange,
  selectedRowIds,
}: {
  columns: VirtualTableColumn<TRow>[];
  data: TRow[] | undefined;
  emptyMessage: string;
  error: Error | null;
  getRowKey: (row: TRow) => string;
  isLoading: boolean;
  isSelectionEnabled: boolean;
  onSelectedRowIdsChange: (rowIds: string[]) => void;
  selectedRowIds: string[];
}) {
  const [tableSearch, setTableSearch] = useState("");
  const [density, setDensity] = useState<"comfortable" | "dense">("comfortable");
  const rows = useMemo(
    () => filterTableRows(data ?? [], tableSearch),
    [data, tableSearch],
  );
  const selectedSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const visibleRowIds = useMemo(() => rows.map((row) => getRowKey(row)), [getRowKey, rows]);
  const selectedVisibleCount = isSelectionEnabled ? visibleRowIds.filter((rowId) => selectedSet.has(rowId)).length : 0;
  const selectionColumns = useMemo<VirtualTableColumn<TRow>[]>(
    () => [
      {
        key: "select",
        header: "Select",
        render: (row) => {
          const rowId = getRowKey(row);
          return (
            <input
              aria-label={`Select row ${rowId}`}
              checked={selectedSet.has(rowId)}
              className="report-row-checkbox"
              onChange={(event) => {
                if (event.target.checked) {
                  onSelectedRowIdsChange([...selectedRowIds, rowId]);
                  return;
                }
                onSelectedRowIdsChange(selectedRowIds.filter((selectedId) => selectedId !== rowId));
              }}
              type="checkbox"
            />
          );
        },
      },
      ...columns,
    ],
    [columns, getRowKey, onSelectedRowIdsChange, selectedRowIds, selectedSet],
  );

  function selectVisibleRows() {
    onSelectedRowIdsChange([...new Set([...selectedRowIds, ...visibleRowIds])]);
  }

  if (isLoading) {
    return (
      <div className="report-table-skeleton">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <Skeleton height={13} width="10%" />
            <Skeleton height={13} width="35%" />
            <Skeleton height={13} width="12%" />
            <Skeleton height={13} width="12%" />
            <Skeleton height={13} width="14%" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <p className="inline-error">{error.message}</p>;
  }
  return (
    <div className={`report-table-suite report-table-${density}`}>
      <div className="report-table-toolbar">
        <div className="report-search-control report-table-search">
          <Search aria-hidden="true" size={16} />
          <TextInput
            aria-label="Search within table"
            onChange={(event) => setTableSearch(event.target.value)}
            placeholder="Search table"
            value={tableSearch}
          />
        </div>
        <div className="segmented-control" role="group" aria-label="Table density">
          {(["comfortable", "dense"] as const).map((value) => (
            <button
              className={density === value ? "segmented-control-active" : ""}
              key={value}
              onClick={() => setDensity(value)}
              type="button"
            >
              {value === "comfortable" ? "Comfortable" : "Dense"}
            </button>
          ))}
        </div>
      </div>
      {isSelectionEnabled ? (
        <div className="report-selection-toolbar">
          <span>
            {selectedRowIds.length
              ? `${selectedRowIds.length} selected${selectedVisibleCount ? ` (${selectedVisibleCount} visible)` : ""}`
              : "Select rows to export only those records."}
          </span>
          <div>
            <Button disabled={visibleRowIds.length === 0} onClick={selectVisibleRows} variant="secondary">
              Select visible
            </Button>
            <Button disabled={selectedRowIds.length === 0} onClick={() => onSelectedRowIdsChange([])} variant="ghost">
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}
      <VirtualTable
        columns={isSelectionEnabled ? selectionColumns : columns}
        emptyMessage={emptyMessage}
        getRowKey={getRowKey}
        maxHeight={density === "dense" ? 560 : 520}
        rowHeight={density === "dense" ? 40 : 48}
        rows={rows}
      />
    </div>
  );
}

function filterTableRows<TRow>(rows: TRow[], query: string): TRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return rows;
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(normalizedQuery));
}

function ReportBarChart({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) {
    return <p className="hero-copy">No distribution data for the current filters.</p>;
  }
  return (
    <div className="report-bar-list">
      {rows.map((row) => (
        <div className="report-bar-row" key={row.label}>
          <span>{row.label}</span>
          <div className="report-bar-track">
            <div
              className="report-bar-fill"
              style={{ width: row.value === 0 ? "0%" : `${Math.max(4, (row.value / max) * 100)}%` }}
            />
          </div>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function countActiveReportFilters(
  filters: ReturnType<typeof useReportFilters>,
  statusFilterApplies: boolean,
): number {
  return [
    filters.searchTerm,
    filters.dateFrom,
    filters.dateTo,
    statusFilterApplies && filters.statusFilter !== "all" ? filters.statusFilter : "",
    ...filters.selectedEntityIds,
    ...filters.selectedOwnerUserIds,
    ...filters.selectedTenderTypeIds,
    ...filters.selectedStageCodes,
    ...filters.selectedCompletionFys,
    ...filters.selectedPrReceiptMonths,
    ...filters.selectedCompletionMonths,
  ].filter(Boolean).length;
}

function buildActiveReportFilterChips(
  filters: ReturnType<typeof useReportFilters>,
  options: {
    completionFyOptions: ReportOption[];
    completionMonthOptions: ReportOption[];
    entityOptions: ReportOption[];
    ownerOptions: ReportOption[];
    prReceiptMonthOptions: ReportOption[];
    stageOptions: ReportOption[];
    statusFilterApplies: boolean;
    tenderTypeOptions: ReportOption[];
  },
): string[] {
  return [
    filters.searchTerm ? `Search: ${filters.searchTerm}` : "",
    options.statusFilterApplies && filters.statusFilter !== "all" ? `Status: ${filters.statusFilter}` : "",
    filters.dateFrom ? `From: ${filters.dateFrom}` : "",
    filters.dateTo ? `To: ${filters.dateTo}` : "",
    ...labelsForSelection("Entity", filters.selectedEntityIds, options.entityOptions),
    ...labelsForSelection("Owner", filters.selectedOwnerUserIds, options.ownerOptions),
    ...labelsForSelection("Type", filters.selectedTenderTypeIds, options.tenderTypeOptions),
    ...labelsForSelection("Stage", filters.selectedStageCodes, options.stageOptions),
    ...labelsForSelection("FY", filters.selectedCompletionFys, options.completionFyOptions),
    ...labelsForSelection("PR Month", filters.selectedPrReceiptMonths, options.prReceiptMonthOptions),
    ...labelsForSelection("Completion", filters.selectedCompletionMonths, options.completionMonthOptions),
  ].filter(Boolean);
}

function labelsForSelection(prefix: string, values: string[], options: ReportOption[]): string[] {
  const byValue = new Map(options.map((option) => [option.value, option.label]));
  return values.map((value) => `${prefix}: ${byValue.get(value) ?? value}`);
}
