import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  deleteRcPoExpiryReportRow,
  getExportDownloadUrl,
  refreshReportProjections,
  updateRcPoExpiryReportRow,
  type ContractExpiryReportRow,
  type ExportJobListItem,
  type ExportJobStatus,
  type ReportCode,
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
import {
  canExportReports,
  canCreateCase,
  canManagePlanning,
  canViewDelayFields,
} from "../../../shared/auth/permissions";
import {
  CreateCaseForm,
  type CreateCaseFormInitialValues,
} from "../../procurement-cases/components/CreateCaseForm";
import { formatCaseStage } from "../../../shared/utils/caseStage";
import { Button } from "../../../shared/ui/button/Button";
import {
  navigateToAppPath,
  useAppLocation,
} from "../../../shared/routing/appLocation";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { Checkbox } from "../../../shared/ui/form/Checkbox";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Modal } from "../../../shared/ui/modal/Modal";
import { Select } from "../../../shared/ui/form/Select";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import {
  AccessDeniedState,
  NotFoundState,
} from "../../../shared/ui/app-states/AppStates";
import {
  type VirtualTableColumn,
  VirtualTable,
} from "../../../shared/ui/table/VirtualTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

export function ReportsWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const location = useAppLocation();
  const reportView = reportViewFromPath(location.pathname);
  const activeReport = reportView ?? "analytics";
  const reportCode =
    activeReport === "analytics" ||
    activeReport === "export_jobs" ||
    activeReport === "saved_views"
      ? "tender_details"
      : activeReport;
  const isAnalyticsView = activeReport === "analytics";
  const isExportJobsView = activeReport === "export_jobs";
  const isSavedViewsView = activeReport === "saved_views";
  const isInvalidReportPath =
    reportView === null && location.pathname !== "/reports";
  const canExport = canExportReports(user);
  const canCreate = canCreateCase(user);
  const canEditRcPoExpiry = canManagePlanning(user);
  const canViewDelay = canViewDelayFields(user);

  const [savedViewName, setSavedViewName] = useState("");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [isSavedViewsOpen, setIsSavedViewsOpen] = useState(false);
  const [rcPoExpiryDrafts, setRcPoExpiryDrafts] = useState<
    Record<string, RcPoExpiryDraft>
  >({});
  const [rcPoPageIndex, setRcPoPageIndex] = useState(0);
  const [rcPoPageSize, setRcPoPageSize] = useState(25);
  const [creatingCaseFromRcPo, setCreatingCaseFromRcPo] =
    useState<CreatingCaseFromRcPo | null>(null);
  const initialExportJobId = useMemo(
    () => new URLSearchParams(location.search).get("jobId") ?? "",
    [location.search],
  );

  const filters = useReportFilters(reportCode);
  const rcPoExpiryParams = useMemo(
    () =>
      reportCode === "rc_po_expiry"
        ? {
            ...filters.reportParams,
            limit: rcPoPageSize + 1,
            offset: rcPoPageIndex * rcPoPageSize,
          }
        : filters.reportParams,
    [filters.reportParams, rcPoPageIndex, rcPoPageSize, reportCode],
  );
  const data = useReportData(
    reportCode,
    rcPoExpiryParams,
    filters.analyticsParams,
  );
  const exportState = useReportExport(
    reportCode,
    filters.exportFilters,
    filters.savedViewFilters,
    savedViewName,
    setSavedViewName,
    {
      enabled: canExport,
      initialExportJobId,
      onExportCreated: (job) =>
        navigateToAppPath(`/reports/export-jobs?jobId=${job.id}`),
    },
  );

  const refreshMutation = useMutation({
    mutationFn: refreshReportProjections,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["report"] });
      await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
      notify({ message: "Report data refreshed.", tone: "success" });
    },
  });
  const updateRcPoExpiryMutation = useMutation({
    mutationFn: (input: {
      draft: RcPoExpiryDraft;
      row: ContractExpiryReportRow;
    }) =>
      updateRcPoExpiryReportRow(
        input.row.sourceType,
        input.row.sourceId,
        input.draft,
      ),
    onSuccess: async (updatedRow) => {
      queryClient.setQueriesData<ContractExpiryReportRow[]>(
        { queryKey: ["report", "rc-po-expiry"] },
        (currentRows) =>
          currentRows?.map((row) =>
            row.sourceType === updatedRow.sourceType &&
            row.sourceId === updatedRow.sourceId
              ? updatedRow
              : row,
          ),
      );
      setRcPoExpiryDrafts((current) => {
        const next = { ...current };
        delete next[rcPoExpiryDraftKey(updatedRow)];
        return next;
      });
      await queryClient.invalidateQueries({
        queryKey: ["report", "rc-po-expiry"],
      });
      notify({
        message: `RC/PO row updated for ${updatedRow.tenderDescription ?? updatedRow.sourceId}.`,
        tone: "success",
      });
    },
  });
  const deleteRcPoExpiryMutation = useMutation({
    mutationFn: (row: ContractExpiryReportRow) =>
      deleteRcPoExpiryReportRow(row.sourceType, row.sourceId),
    onSuccess: async (_result, row) => {
      queryClient.setQueriesData<ContractExpiryReportRow[]>(
        { queryKey: ["report", "rc-po-expiry"] },
        (currentRows) =>
          currentRows?.filter(
            (currentRow) =>
              !(
                currentRow.sourceType === row.sourceType &&
                currentRow.sourceId === row.sourceId
              ),
          ),
      );
      setRcPoExpiryDrafts((current) => {
        const next = { ...current };
        delete next[rcPoExpiryDraftKey(row)];
        return next;
      });
      await queryClient.invalidateQueries({
        queryKey: ["report", "rc-po-expiry"],
      });
      notify({
        message: `RC/PO row deleted for ${row.tenderDescription ?? row.sourceId}.`,
        tone: "success",
      });
    },
  });

  useEffect(() => {
    if (location.pathname === "/reports") {
      navigateToAppPath("/reports/analytics", { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    setRcPoPageIndex(0);
  }, [filters.reportParams, reportCode]);

  const metrics = data.analytics.data;
  const rcPoExpiryRows = data.rcPoExpiry.data ?? [];
  const rcPoVisibleRows = rcPoExpiryRows.slice(0, rcPoPageSize);
  const rcPoHasNextPage = rcPoExpiryRows.length > rcPoPageSize;
  const selectedReportLabel = getReportLabel(activeReport);
  const rcPoMetadata = data.filterMetadata.data?.rcPoExpiry;
  const statusFilterApplies =
    !isExportJobsView &&
    (reportCode === "tender_details" || reportCode === "stage_time");

  const entityOptions = useMemo(
    () =>
      (reportCode === "rc_po_expiry"
        ? (rcPoMetadata?.entities ?? [])
        : (data.filterMetadata.data?.entities ?? [])
      ).map((entity) => ({
        label: entity.code
          ? `${entity.code} - ${entity.name ?? entity.id}`
          : (entity.name ?? entity.id),
        value: entity.id,
      })),
    [data.filterMetadata.data?.entities, rcPoMetadata?.entities, reportCode],
  );
  const ownerOptions = useMemo(
    () =>
      (reportCode === "rc_po_expiry"
        ? (rcPoMetadata?.owners ?? [])
        : (data.filterMetadata.data?.owners ?? [])
      ).map((owner) => ({
        label: owner.fullName
          ? `${owner.fullName} (${owner.username ?? "user"})`
          : (owner.username ?? owner.id),
        value: owner.id,
      })),
    [data.filterMetadata.data?.owners, rcPoMetadata?.owners, reportCode],
  );
  const departmentOptions = useMemo(
    () =>
      (reportCode === "rc_po_expiry"
        ? (rcPoMetadata?.departments ?? [])
        : (data.filterMetadata.data?.departments ?? [])
      ).map((department) => ({
        entityId: department.entityId ?? null,
        label: department.name,
        value: department.id,
      })),
    [data.filterMetadata.data?.departments, rcPoMetadata?.departments, reportCode],
  );
  const tenderTypeOptions = useMemo(
    () =>
      (data.filterMetadata.data?.tenderTypes ?? []).map((type) => ({
        label: type.name,
        value: type.id,
      })),
    [data.filterMetadata.data?.tenderTypes],
  );
  const natureOfWorkOptions = useMemo(
    () =>
      (reportCode === "rc_po_expiry"
        ? (rcPoMetadata?.natureOfWorks ?? [])
        : (data.filterMetadata.data?.natureOfWorks ?? [])
      ).map((item) => ({
        label: item.name,
        value: item.id,
      })),
    [data.filterMetadata.data?.natureOfWorks, rcPoMetadata?.natureOfWorks, reportCode],
  );
  const budgetTypeOptions = useMemo(
    () =>
      (reportCode === "rc_po_expiry"
        ? (rcPoMetadata?.budgetTypes ?? [])
        : (data.filterMetadata.data?.budgetTypes ?? [])
      ).map((item) => ({
        label: item.name,
        value: item.id,
      })),
    [data.filterMetadata.data?.budgetTypes, rcPoMetadata?.budgetTypes, reportCode],
  );
  const stageOptions = useMemo(
    () =>
      (data.filterMetadata.data?.stages ?? []).map((stage) => ({
        label: formatCaseStage(stage),
        value: String(stage),
      })),
    [data.filterMetadata.data?.stages],
  );
  const completionFyOptions = useMemo(
    () =>
      (data.filterMetadata.data?.completionFys ?? []).map((fy) => ({
        label: fy,
        value: fy,
      })),
    [data.filterMetadata.data?.completionFys],
  );
  const prReceiptMonthOptions = useMemo(
    () =>
      (data.filterMetadata.data?.prReceiptMonths ?? []).map((month) => ({
        label: formatMonth(month),
        value: month,
      })),
    [data.filterMetadata.data?.prReceiptMonths],
  );
  const completionMonthOptions = useMemo(
    () =>
      (data.filterMetadata.data?.completionMonths ?? []).map((month) => ({
        label: formatMonth(month),
        value: month,
      })),
    [data.filterMetadata.data?.completionMonths],
  );
  const valueSlabOptions = useMemo(
    () =>
      (reportCode === "rc_po_expiry"
        ? (rcPoMetadata?.valueSlabs ?? [])
        : (data.filterMetadata.data?.valueSlabs ?? [])
      ).map((slab) => ({
        label: formatValueSlabLabel(slab),
        value: slab,
      })),
    [data.filterMetadata.data?.valueSlabs, rcPoMetadata?.valueSlabs, reportCode],
  );

  useEffect(() => {
    if (reportCode !== "rc_po_expiry" || !filters.selectedDepartmentIds.length)
      return;
    const allowedDepartmentIds = new Set(
      departmentOptions.map((department) => department.value),
    );
    const nextDepartmentIds = filters.selectedDepartmentIds.filter((id) =>
      allowedDepartmentIds.has(id),
    );
    if (nextDepartmentIds.length !== filters.selectedDepartmentIds.length) {
      filters.setSelectedDepartmentIds(nextDepartmentIds);
    }
  }, [
    departmentOptions,
    filters.selectedDepartmentIds,
    filters.setSelectedDepartmentIds,
    reportCode,
  ]);

  const includeCompletionFilters = reportCode !== "running" && reportCode !== "rc_po_expiry";
  const includeTrackStatusFilter =
    reportCode !== "completed" &&
    reportCode !== "rc_po_expiry" &&
    reportCode !== "vendor_awards";
  const useBusinessFilterSet =
    reportCode === "completed" || reportCode === "vendor_awards";
  const activeFilterCount = countActiveReportFilters(
    filters,
    statusFilterApplies,
    includeCompletionFilters,
    includeTrackStatusFilter,
    reportCode === "rc_po_expiry",
    useBusinessFilterSet,
  );
  const activeFilterChips = buildActiveReportFilterChips(filters, {
    completionFyOptions,
    completionMonthOptions,
    departmentOptions,
    entityOptions,
    budgetTypeOptions,
    includeCompletionFilters,
    includeTrackStatusFilter,
    isRcPoExpiry: reportCode === "rc_po_expiry",
    useBusinessFilterSet,
    natureOfWorkOptions,
    ownerOptions,
    prReceiptMonthOptions,
    stageOptions,
    statusFilterApplies,
    tenderTypeOptions,
    valueSlabOptions,
  });
  const caseRowsForColumnFilters = useMemo(() => {
    if (reportCode === "running") return data.running.data ?? [];
    if (reportCode === "completed") return data.completed.data ?? [];
    return data.tenderDetails.data ?? [];
  }, [
    data.completed.data,
    data.running.data,
    data.tenderDetails.data,
    reportCode,
  ]);
  const caseColumnFilterOptions = useMemo(
    () => ({
      completionFy: uniqueReportFilterOptions(
        caseRowsForColumnFilters,
        (row) => row.completionFy ?? "-",
      ),
      department: uniqueReportFilterOptions(
        caseRowsForColumnFilters,
        (row) => row.departmentName ?? "-",
      ),
      entity: uniqueReportFilterOptions(
        caseRowsForColumnFilters,
        (row) => row.entityCode ?? row.entityName ?? row.entityId,
      ),
      loi: [
        { label: "Yes", value: "Yes" },
        { label: "No", value: "No" },
      ],
      normativeStage: uniqueReportFilterOptions(
        caseRowsForColumnFilters,
        (row) =>
          row.desiredStageCode == null
            ? "-"
            : formatCaseStage(row.desiredStageCode),
      ),
      owner: uniqueReportFilterOptions(
        caseRowsForColumnFilters,
        (row) => row.ownerFullName ?? "-",
      ),
      stage: uniqueReportFilterOptions(caseRowsForColumnFilters, (row) =>
        formatCaseStage(row.stageCode),
      ),
      status: [
        { label: "Running", value: "running" },
        { label: "Completed", value: "completed" },
      ],
      tenderType: uniqueReportFilterOptions(
        caseRowsForColumnFilters,
        (row) => row.tenderTypeName ?? "-",
      ),
    }),
    [caseRowsForColumnFilters],
  );

  const caseColumns = useMemo<VirtualTableColumn<ReportCaseRow>[]>(
    () => [
      {
        key: "tenderNo",
        header: "Tender No.",
        render: (row) => row.tenderNo ?? row.prId,
      },
      {
        key: "description",
        header: "Tender Description",
        render: (row) => row.prDescription ?? row.tenderName ?? "-",
      },
      {
        key: "entity",
        filterOptions: caseColumnFilterOptions.entity,
        filterValue: (row) => row.entityCode ?? row.entityName ?? row.entityId,
        header: "Entity",
        render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
      },
      {
        key: "department",
        filterOptions: caseColumnFilterOptions.department,
        filterValue: (row) => row.departmentName ?? "-",
        header: "Department",
        render: (row) => row.departmentName ?? "-",
      },
      {
        key: "prValue",
        header: `PR Value / Approved Budget (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) => formatAmount(row.prValue, filters.amountUnit),
      },
      {
        key: "type",
        filterOptions: caseColumnFilterOptions.tenderType,
        filterValue: (row) => row.tenderTypeName ?? "-",
        header: "Tender Type",
        render: (row) => row.tenderTypeName ?? "-",
      },
      {
        key: "stage",
        filterOptions: caseColumnFilterOptions.stage,
        filterValue: (row) => formatCaseStage(row.stageCode),
        header: "Tender Stage",
        render: (row) => formatCaseStage(row.stageCode),
      },
      {
        key: "normativeStage",
        filterOptions: caseColumnFilterOptions.normativeStage,
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
          row.status === "completed" || row.percentTimeElapsed == null
            ? "-"
            : `${row.percentTimeElapsed}%`,
      },
      {
        key: "age",
        header: "Running Tender Age (Days)",
        render: (row) => row.runningAgeDays ?? "-",
      },
      {
        key: "prReceipt",
        header: "PR Receipt Date",
        render: (row) => formatDateCell(row.prReceiptDate),
      },
      {
        key: "nit",
        header: "NIT Publish Date",
        render: (row) => formatDateCell(row.nitPublishDate),
      },
      {
        key: "bidders",
        header: "Bidder Participated Count",
        render: (row) =>
          row.status === "completed" ? (row.biddersParticipated ?? "-") : "-",
      },
      {
        key: "qualified",
        header: "Qualified Bidders Count",
        render: (row) =>
          row.status === "completed" ? (row.qualifiedBidders ?? "-") : "-",
      },
      {
        key: "cycle",
        header: "Completed Cycle Time (Days)",
        render: (row) =>
          row.status === "completed" ? (row.completedCycleTimeDays ?? "-") : "-",
      },
      {
        key: "award",
        header: `NFA Approved Amount (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) =>
          row.status === "completed"
            ? formatAmount(row.approvedAmount, filters.amountUnit)
            : "-",
      },
      {
        key: "savingsPr",
        header: `Savings vs PR Value / Approved Budget (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) =>
          row.status === "completed"
            ? formatAmount(row.savingsWrtPr, filters.amountUnit)
            : "-",
      },
      {
        key: "savingsEstimate",
        header: `Savings vs Estimate / Benchmark (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) =>
          row.status === "completed"
            ? formatAmount(row.savingsWrtEstimate, filters.amountUnit)
            : "-",
      },
      {
        key: "owner",
        filterOptions: caseColumnFilterOptions.owner,
        filterValue: (row) => row.ownerFullName ?? "-",
        header: "Tender Owner",
        render: (row) => row.ownerFullName ?? "-",
      },
      ...(canViewDelay
        ? [
            {
              key: "delay",
              header: "Uncontrollable Delay (Days)",
              render: (row) => row.uncontrollableDelayDays ?? "-",
            } satisfies VirtualTableColumn<ReportCaseRow>,
          ]
        : []),
      {
        key: "loi",
        filterOptions: caseColumnFilterOptions.loi,
        filterValue: (row) => (row.loiAwarded ? "Yes" : "No"),
        header: "LOI Awarded?",
        render: (row) => (row.loiAwarded ? "Yes" : "No"),
      },
      {
        key: "loiDate",
        header: "LOI Award Date",
        render: (row) => formatDateCell(row.loiAwardDate),
      },
      {
        key: "tmRemarks",
        header: "Tender Owner's Remarks",
        render: (row) => row.tmRemarks ?? "-",
      },
      {
        key: "status",
        filterOptions: caseColumnFilterOptions.status,
        filterValue: (row) => row.status,
        header: "Status",
        render: (row) => (
          <StatusBadge
            tone={row.status === "completed" ? "success" : "warning"}
          >
            {row.status}
          </StatusBadge>
        ),
      },
      {
        key: "completionFy",
        filterOptions: caseColumnFilterOptions.completionFy,
        filterValue: (row) => row.completionFy ?? "-",
        header: "Completion FY",
        render: (row) => row.completionFy ?? "-",
      },
    ],
    [canViewDelay, caseColumnFilterOptions, filters.amountUnit],
  );
  const runningColumns = useMemo<VirtualTableColumn<ReportCaseRow>[]>(
    () => [
      {
        key: "tenderNo",
        header: "Tender No.",
        render: (row) => row.tenderNo ?? row.prId,
      },
      {
        key: "tenderName",
        header: "Tender Name",
        render: (row) => row.tenderName ?? row.prDescription ?? "-",
      },
      {
        key: "prReceiptDate",
        header: "PR Receipt Date",
        render: (row) => formatDateCell(row.prReceiptDate),
      },
      {
        key: "prValue",
        header: `PR Value / Approved Budget (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) => formatAmount(row.prValue, filters.amountUnit),
      },
      {
        key: "owner",
        filterOptions: caseColumnFilterOptions.owner,
        filterValue: (row) => row.ownerFullName ?? "-",
        header: "Tender Owner",
        render: (row) => row.ownerFullName ?? "-",
      },
      {
        key: "entity",
        filterOptions: caseColumnFilterOptions.entity,
        filterValue: (row) => row.entityCode ?? row.entityName ?? row.entityId,
        header: "Entity",
        render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
      },
      {
        key: "department",
        filterOptions: caseColumnFilterOptions.department,
        filterValue: (row) => row.departmentName ?? "-",
        header: "User Department",
        render: (row) => row.departmentName ?? "-",
      },
      {
        key: "stage",
        filterOptions: caseColumnFilterOptions.stage,
        filterValue: (row) => formatCaseStage(row.stageCode),
        header: "Tender Stage",
        render: (row) => formatCaseStage(row.stageCode),
      },
      {
        key: "normativeStage",
        filterOptions: caseColumnFilterOptions.normativeStage,
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
        key: "age",
        header: "Running Tender Age",
        render: (row) => row.runningAgeDays ?? "-",
      },
      {
        key: "currentStageAge",
        header: "Current Stage Aging (Days)",
        render: (row) => row.currentStageAgingDays ?? "-",
      },
      ...(canViewDelay
        ? [
            {
              key: "delay",
              header: "Uncontrollable Delay (Days)",
              render: (row) => row.uncontrollableDelayDays ?? "-",
            } satisfies VirtualTableColumn<ReportCaseRow>,
            {
              key: "delayReason",
              header: "Reasons for Delay",
              render: (row) => row.delayReason ?? "-",
            } satisfies VirtualTableColumn<ReportCaseRow>,
          ]
        : []),
      {
        key: "loi",
        filterOptions: caseColumnFilterOptions.loi,
        filterValue: (row) => (row.loiAwarded ? "Yes" : "No"),
        header: "LOI Awarded?",
        render: (row) => (row.loiAwarded ? "Yes" : "No"),
      },
      {
        key: "loiDate",
        header: "LOI Award Date",
        render: (row) => formatDateCell(row.loiAwardDate),
      },
    ],
    [canViewDelay, caseColumnFilterOptions, filters.amountUnit],
  );
  const completedColumns = useMemo<VirtualTableColumn<ReportCaseRow>[]>(
    () => [
      {
        key: "tenderNo",
        header: "Tender No.",
        render: (row) => row.tenderNo ?? row.prId,
      },
      {
        key: "tenderName",
        header: "Tender Name",
        render: (row) => row.tenderName ?? row.prDescription ?? "-",
      },
      {
        key: "owner",
        filterOptions: caseColumnFilterOptions.owner,
        filterValue: (row) => row.ownerFullName ?? "-",
        header: "Tender Owner",
        render: (row) => row.ownerFullName ?? "-",
      },
      {
        key: "entity",
        filterOptions: caseColumnFilterOptions.entity,
        filterValue: (row) => row.entityCode ?? row.entityName ?? row.entityId,
        header: "Entity",
        render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
      },
      {
        key: "department",
        filterOptions: caseColumnFilterOptions.department,
        filterValue: (row) => row.departmentName ?? "-",
        header: "User Department",
        render: (row) => row.departmentName ?? "-",
      },
      {
        key: "prValue",
        header: `PR Value / Approved Budget (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) => formatAmount(row.prValue, filters.amountUnit),
      },
      {
        key: "estimateBenchmark",
        header: `Estimate / Benchmark (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) =>
          formatAmount(row.estimateBenchmark, filters.amountUnit),
      },
      {
        key: "award",
        header: `Award Value (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) =>
          formatAmount(row.totalAwardedAmount, filters.amountUnit),
      },
      {
        key: "cycle",
        header: "Cycle Time",
        render: (row) => row.completedCycleTimeDays ?? "-",
      },
      ...(canViewDelay
        ? [
            {
              key: "delay",
              header: "Uncontrollable Delay (Days)",
              render: (row) => row.uncontrollableDelayDays ?? "-",
            } satisfies VirtualTableColumn<ReportCaseRow>,
            {
              key: "delayReason",
              header: "Reasons for Delay",
              render: (row) => row.delayReason ?? "-",
            } satisfies VirtualTableColumn<ReportCaseRow>,
          ]
        : []),
      {
        key: "savingsPr",
        header: `Savings wrt PR Value / Approved Budget (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) => formatAmount(row.savingsWrtPr, filters.amountUnit),
      },
      {
        key: "savingsEstimate",
        header: `Savings wrt Estimate / Benchmark (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) =>
          formatAmount(row.savingsWrtEstimate, filters.amountUnit),
      },
      {
        key: "loi",
        filterOptions: caseColumnFilterOptions.loi,
        filterValue: (row) => (row.loiAwarded ? "Yes" : "No"),
        header: "LOI Awarded?",
        render: (row) => (row.loiAwarded ? "Yes" : "No"),
      },
      {
        key: "loiDate",
        header: "LOI Award Date",
        render: (row) => formatDateCell(row.loiAwardDate),
      },
    ],
    [canViewDelay, caseColumnFilterOptions, filters.amountUnit],
  );
  const vendorColumns = useMemo<
    VirtualTableColumn<VendorAwardReportRow>[]
  >(() => {
    const entityOptions = uniqueReportFilterOptions(
      data.vendorAwards.data ?? [],
      (row) => row.entityCode ?? row.entityName ?? row.entityId,
    );
    const departmentOptions = uniqueReportFilterOptions(
      data.vendorAwards.data ?? [],
      (row) => row.departmentName ?? "-",
    );
    const ownerOptions = uniqueReportFilterOptions(
      data.vendorAwards.data ?? [],
      (row) => row.ownerFullName ?? "-",
    );
    const vendorOptions = uniqueReportFilterOptions(
      data.vendorAwards.data ?? [],
      (row) => row.vendorName,
    );
    const poOptions = uniqueReportFilterOptions(
      data.vendorAwards.data ?? [],
      (row) => row.poNumber ?? "-",
    );
    return [
      {
        key: "tenderNo",
        header: "Tender No.",
        render: (row) => row.tenderNo ?? row.prId,
      },
      {
        key: "tenderName",
        header: "Tender Name",
        render: (row) => row.tenderName ?? "-",
      },
      {
        key: "entity",
        filterOptions: entityOptions,
        filterValue: (row) => row.entityCode ?? row.entityName ?? row.entityId,
        header: "Entity",
        render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
      },
      {
        key: "department",
        filterOptions: departmentOptions,
        filterValue: (row) => row.departmentName ?? "-",
        header: "User Department",
        render: (row) => row.departmentName ?? "-",
      },
      {
        key: "owner",
        filterOptions: ownerOptions,
        filterValue: (row) => row.ownerFullName ?? "-",
        header: "Tender Owner",
        render: (row) => row.ownerFullName ?? "-",
      },
      {
        key: "approved",
        header: "NFA Approved Amount (Lakhs) [All Inclusive]",
        render: (row) => formatAmount(row.approvedAmount, "lakh"),
      },
      {
        key: "vendorCode",
        header: "Vendor Code",
        render: (row) => row.vendorCode ?? "-",
      },
      {
        key: "vendor",
        filterOptions: vendorOptions,
        filterValue: (row) => row.vendorName,
        header: "Vendor Name",
        render: (row) => row.vendorName,
      },
      {
        key: "po",
        filterOptions: poOptions,
        filterValue: (row) => row.poNumber ?? "-",
        header: "RC/PO No.",
        render: (row) => row.poNumber ?? "-",
      },
      {
        key: "value",
        header: "RC/PO Value (Lakhs)",
        render: (row) => formatAmount(row.poValue, "lakh"),
      },
      {
        key: "awardDate",
        header: "Award Date",
        render: (row) => row.poAwardDate ?? "-",
      },
      {
        key: "validity",
        header: "Validity Date",
        render: (row) => row.poValidityDate ?? "-",
      },
    ];
  }, [data.vendorAwards.data]);
  const stageColumns = useMemo<VirtualTableColumn<StageTimeRow>[]>(() => {
    const rows = data.stageTime.data ?? [];
    const entityOptions = uniqueReportFilterOptions(
      rows,
      (row) => row.entityCode ?? row.entityName ?? row.entityId,
    );
    const priorityOptions = [
      { label: "Priority", value: "Priority" },
      { label: "Normal", value: "Normal" },
    ];
    const tenderTypeOptions = uniqueReportFilterOptions(
      rows,
      (row) => row.tenderTypeName ?? "-",
    );
    const ownerOptions = uniqueReportFilterOptions(
      rows,
      (row) => row.ownerFullName ?? "-",
    );
    const stageOptions = uniqueReportFilterOptions(rows, (row) =>
      formatCaseStage(row.stageCode),
    );
    const loiOptions = [
      { label: "Yes", value: "Yes" },
      { label: "No", value: "No" },
    ];
    return [
      { key: "caseId", header: "Case ID", render: (row) => row.prId },
      { key: "prNo", header: "PR No.", render: (row) => row.tenderNo ?? "-" },
      {
        key: "tenderName",
        header: "Tender Name",
        render: (row) => row.tenderName ?? "-",
      },
      {
        key: "entity",
        filterOptions: entityOptions,
        filterValue: (row) => row.entityCode ?? row.entityName ?? row.entityId,
        header: "Entity",
        render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
      },
      {
        key: "priority",
        filterOptions: priorityOptions,
        filterValue: (row) => (row.priorityCase ? "Priority" : "Normal"),
        header: "Priority",
        render: (row) =>
          row.priorityCase ? (
            <StatusBadge tone="warning">Priority</StatusBadge>
          ) : (
            "-"
          ),
      },
      {
        key: "tenderType",
        filterOptions: tenderTypeOptions,
        filterValue: (row) => row.tenderTypeName ?? "-",
        header: "Tender Type",
        render: (row) => row.tenderTypeName ?? "-",
      },
      {
        key: "owner",
        filterOptions: ownerOptions,
        filterValue: (row) => row.ownerFullName ?? "-",
        header: "Tender Owner",
        render: (row) => row.ownerFullName ?? "-",
      },
      {
        key: "stage",
        filterOptions: stageOptions,
        filterValue: (row) => formatCaseStage(row.stageCode),
        header: "Tender Stage",
        render: (row) => formatCaseStage(row.stageCode),
      },
      {
        key: "runningAge",
        header: "Running Tender Age",
        render: (row) => formatNullableDays(row.runningAgeDays),
      },
      {
        key: "currentStageAging",
        header: "Current Stage Aging",
        render: (row) => formatNullableDays(row.currentStageAgingDays),
      },
      {
        key: "cycleTime",
        header: "Cycle Time",
        render: (row) => formatNullableDays(row.cycleTimeDays),
      },
      {
        key: "prReview",
        header: "PR Review Time",
        render: (row) => formatNullableDays(row.prReviewTimeDays),
      },
      {
        key: "nitPublish",
        header: "NIT Publish Time",
        render: (row) => formatNullableDays(row.nitPublishTimeDays),
      },
      {
        key: "bidReceipt",
        header: "Bid Receipt Time",
        render: (row) => formatNullableDays(row.bidReceiptTimeDays),
      },
      {
        key: "bidEvaluation",
        header: "Bid Evaluation Time",
        render: (row) => formatNullableDays(row.bidEvaluationTimeDays),
      },
      {
        key: "negotiation",
        header: "Negotiation & NFA Submission Time",
        render: (row) =>
          formatNullableDays(row.negotiationNfaSubmissionTimeDays),
      },
      {
        key: "nfaApproval",
        header: "NFA Approval Time",
        render: (row) => formatNullableDays(row.nfaApprovalTimeDays),
      },
      {
        key: "contractIssuance",
        header: "Post NFA Contract Issuance Time",
        render: (row) => formatNullableDays(row.contractIssuanceTimeDays),
      },
      {
        key: "loi",
        filterOptions: loiOptions,
        filterValue: (row) => (row.loiAwarded ? "Yes" : "No"),
        header: "LOI Awarded?",
        render: (row) =>
          row.loiAwarded ? <StatusBadge tone="info">Yes</StatusBadge> : "No",
      },
    ];
  }, [data.stageTime.data]);
  const setRcPoExpiryDraft = (
    row: ContractExpiryReportRow,
    patch: Partial<RcPoExpiryDraft>,
  ) => {
    setRcPoExpiryDrafts((current) => {
      const key = rcPoExpiryDraftKey(row);
      const currentDraft = current[key] ?? rcPoExpiryDraftFromRow(row);
      const nextDraft = { ...currentDraft, ...patch };
      if (isRcPoExpiryDraftUnchanged(row, nextDraft)) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: nextDraft };
    });
  };

  const openCreateCaseFromRcPo = useCallback((row: ContractExpiryReportRow) => {
    const prReceiptDate =
      row.tentativeTenderingDate ?? row.rcPoAwardDate ?? "";
    setCreatingCaseFromRcPo({
      initialValues: {
        departmentId: row.departmentId ?? "",
        entityId: row.entityId,
        natureOfWorkId: row.natureOfWorkId ?? "",
        ownerUserId: row.ownerUserId ?? "",
        prDescription: row.tenderDescription ?? "",
        prReceiptDate,
        prValue: row.rcPoAmount == null ? "" : String(row.rcPoAmount),
        tentativeCompletionDate: row.rcPoValidityDate,
      },
      row,
    });
  }, []);

  const rcPoColumns = useMemo<VirtualTableColumn<ContractExpiryReportRow>[]>(
    () => [
      {
        key: "source",
        header: "Source",
        render: (row) =>
          row.sourceType === "manual_plan" ? (
            <StatusBadge tone="warning">Bulk Upload</StatusBadge>
          ) : (
            <StatusBadge>TenderDB</StatusBadge>
          ),
      },
      {
        key: "tender",
        header: "Tender Description",
        render: (row) => row.tenderDescription ?? "-",
      },
      {
        key: "entity",
        header: "Entity",
        render: (row) => row.entityCode ?? row.entityName ?? row.entityId,
      },
      {
        key: "department",
        header: "Department",
        render: (row) => row.departmentName ?? "-",
      },
      {
        key: "natureOfWork",
        header: "Nature of Work",
        render: (row) => row.natureOfWorkName || "-",
      },
      {
        key: "amount",
        header: `RC/PO Amount (${amountUnitLabel(filters.amountUnit)}) [All Inclusive]`,
        render: (row) => formatAmount(row.rcPoAmount, filters.amountUnit),
      },
      {
        key: "awardDate",
        header: "Award Date",
        render: (row) => formatDateCell(row.rcPoAwardDate),
      },
      {
        key: "validity",
        header: "Validity Date",
        render: (row) => row.rcPoValidityDate,
      },
      {
        key: "owner",
        header: "Owner",
        render: (row) => row.ownerFullName ?? "-",
      },
      {
        key: "vendors",
        header: "Awarded Vendors",
        render: (row) => row.awardedVendors ?? "-",
      },
      {
        key: "tentativeTenderingDate",
        header: "Tentative Tendering Date",
        render: (row) => {
          const draft =
            rcPoExpiryDrafts[rcPoExpiryDraftKey(row)] ??
            rcPoExpiryDraftFromRow(row);
          return canEditRcPoExpiry ? (
            <TextInput
              aria-label={`Tentative tendering date for ${row.tenderDescription ?? row.sourceId}`}
              onChange={(event) =>
                setRcPoExpiryDraft(row, {
                  tentativeTenderingDate: event.target.value || null,
                })
              }
              type="date"
              value={draft.tentativeTenderingDate ?? ""}
            />
          ) : (
            formatDateCell(row.tentativeTenderingDate)
          );
        },
      },
      {
        key: "floated",
        filterOptions: [
          { label: "Yes", value: "Yes" },
          { label: "No", value: "No" },
        ],
        filterValue: (row) => (row.tenderFloatedOrNotRequired ? "Yes" : "No"),
        header: "Tender Floated?",
        render: (row) => {
          const draft =
            rcPoExpiryDrafts[rcPoExpiryDraftKey(row)] ??
            rcPoExpiryDraftFromRow(row);
          return canEditRcPoExpiry ? (
            <Checkbox
              aria-label={`Tender floated or not required for ${row.tenderDescription ?? row.sourceId}`}
              checked={draft.tenderFloatedOrNotRequired}
              label=""
              onChange={(event) =>
                setRcPoExpiryDraft(row, {
                  tenderFloatedOrNotRequired: event.target.checked,
                })
              }
            />
          ) : row.tenderFloatedOrNotRequired ? (
            "Yes"
          ) : (
            "No"
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => {
          const key = rcPoExpiryDraftKey(row);
          const draft = rcPoExpiryDrafts[key];
          const isSaving =
            updateRcPoExpiryMutation.isPending &&
            updateRcPoExpiryMutation.variables?.row.sourceId === row.sourceId;
          const canDeleteRow = row.sourceType === "manual_plan";
          const isDeleting =
            deleteRcPoExpiryMutation.isPending &&
            deleteRcPoExpiryMutation.variables?.sourceId === row.sourceId;
          if (!canCreate && !canEditRcPoExpiry) return "-";
          return (
            <div className="report-row-actions">
              {canCreate ? (
                <Button
                  disabled={isSaving || isDeleting}
                  onClick={() => openCreateCaseFromRcPo(row)}
                  size="sm"
                  variant="secondary"
                >
                  <FilePlus2 aria-hidden="true" size={16} />
                  Create Case
                </Button>
              ) : null}
              {canEditRcPoExpiry ? (
                <Button
                  disabled={!draft || isSaving || isDeleting}
                  onClick={() => {
                    if (draft) updateRcPoExpiryMutation.mutate({ draft, row });
                  }}
                  size="sm"
                  variant={draft ? "primary" : "secondary"}
                >
                  <Save aria-hidden="true" size={16} />
                  {isSaving ? "Saving" : "Save"}
                </Button>
              ) : null}
              {canEditRcPoExpiry && canDeleteRow ? (
                <Button
                  disabled={isDeleting || isSaving}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this bulk-upload RC/PO row? TenderDB rows are not affected.",
                      )
                    ) {
                      deleteRcPoExpiryMutation.mutate(row);
                    }
                  }}
                  size="sm"
                  variant="danger"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  {isDeleting ? "Deleting" : "Delete"}
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      canEditRcPoExpiry,
      canCreate,
      filters.amountUnit,
      openCreateCaseFromRcPo,
      rcPoExpiryDrafts,
      deleteRcPoExpiryMutation,
      updateRcPoExpiryMutation,
    ],
  );

  function handleApplySavedView(view: SavedReportView) {
    navigateToAppPath(reportPathForKey(view.reportCode as ReportViewKey));
    applySavedView(view, {
      setAmountUnit: filters.setAmountUnit,
      setBudgetTypeIds: filters.setSelectedBudgetTypeIds,
      setCompletionFys: filters.setSelectedCompletionFys,
      setCompletionMonths: filters.setSelectedCompletionMonths,
      setCpcInvolved: filters.setCpcInvolved,
      setDelayStatus: filters.setDelayStatus,
      setDeletedOnly: filters.setDeletedOnly,
      setDepartmentIds: filters.setSelectedDepartmentIds,
      setExpiryHorizonDays: filters.setExpiryHorizonDays,
      setEntityIds: filters.setSelectedEntityIds,
      setIncludeExpiredContracts: filters.setIncludeExpiredContracts,
      setIncludeTenderFloatedOrNotRequired:
        filters.setIncludeTenderFloatedOrNotRequired,
      setLoiAwarded: filters.setLoiAwarded,
      setNatureOfWorkIds: filters.setSelectedNatureOfWorkIds,
      setOwnerUserIds: filters.setSelectedOwnerUserIds,
      setPrReceiptMonths: filters.setSelectedPrReceiptMonths,
      setPriorityCase: filters.setPriorityCase,
      setSearchTerm: filters.setSearchTerm,
      setStageCodes: filters.setSelectedStageCodes,
      setStatusFilter: filters.setStatusFilter,
      setTenderTypeIds: filters.setSelectedTenderTypeIds,
      setTrackStatus: filters.setTrackStatus,
      setValueSlabs: filters.setSelectedValueSlabs,
    });
    notify({ message: `Applied view: ${view.name}`, tone: "success" });
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
            <Button
              disabled
              title="Scheduled report delivery is coming soon."
              variant="ghost"
            >
              <CalendarClock size={18} />
              Schedule
            </Button>
            {canExport &&
            !isAnalyticsView &&
            !isExportJobsView &&
            !isSavedViewsView ? (
              <Button
                disabled={exportState.exportMutation.isPending}
                onClick={() => exportState.exportMutation.mutate()}
              >
                <Download size={18} />
                {`Export ${exportState.exportFormat.toUpperCase()}`}
              </Button>
            ) : null}
          </>
        }
        eyebrow="Reports"
        title={isAnalyticsView ? "Report Analytics" : selectedReportLabel}
      >
        Filter, review, save, and export procurement reporting views across
        tender, award, stage, and RC/PO workflows.
      </PageHeader>

      <section className="report-command-panel">
        <div className="report-command-topline">
          <SecondaryNav
            activeKey={activeReport}
            ariaLabel="Report type"
            items={REPORT_OPTIONS.filter(
              (option) => canExport || option.code !== "export_jobs",
            ).map((option) => ({
              description: option.description,
              icon: option.icon,
              key: option.code,
              label: option.label,
            }))}
            onChange={(key) =>
              navigateToAppPath(reportPathForKey(key as ReportViewKey))
            }
          />
        </div>

        {!isExportJobsView && !isSavedViewsView ? (
          <div className="report-smart-filter-bar">
            <div className="report-search-control">
              <Search aria-hidden="true" size={17} />
              <TextInput
                aria-label="Search reports"
                onChange={(event) => filters.setSearchTerm(event.target.value)}
                placeholder={
                  reportCode === "rc_po_expiry"
                    ? "Search tender, vendor"
                    : "Search Case ID, tender, vendor"
                }
                value={filters.searchTerm}
              />
            </div>
            {statusFilterApplies ? (
              <select
                aria-label="Status"
                className="text-input report-compact-select"
                onChange={(event) =>
                  filters.setStatusFilter(
                    event.target.value as "all" | "running" | "completed",
                  )
                }
                value={filters.statusFilter}
              >
                <option value="all">All</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
              </select>
            ) : activeReport === "running" || activeReport === "completed" ? (
              <span className="report-scope-chip">
                {activeReport === "completed"
                  ? "Completed cases only"
                  : "Running cases only"}
              </span>
            ) : null}
            <Button
              aria-expanded={isAdvancedFiltersOpen}
              className={isAdvancedFiltersOpen ? "button-secondary-active" : ""}
              onClick={() => setIsAdvancedFiltersOpen((value) => !value)}
              variant="secondary"
            >
              <SlidersHorizontal size={17} />
              {isAdvancedFiltersOpen ? "Hide Filters" : "More Filters"}
              {activeFilterCount ? (
                <span className="button-count-badge">{activeFilterCount}</span>
              ) : null}
            </Button>
            <Button
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              variant="secondary"
            >
              <RefreshCw size={17} />
              {refreshMutation.isPending ? "Refreshing..." : "Refresh Report Data"}
            </Button>
            <Button
              onClick={() => setIsSavedViewsOpen((value) => !value)}
              variant="secondary"
            >
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
          <div
            className="report-active-filter-strip"
            aria-label="Active filters"
          >
            {activeFilterChips.slice(0, 7).map((chip) => (
              <span className="report-filter-chip" key={chip}>
                {chip}
              </span>
            ))}
            {activeFilterChips.length > 7 ? (
              <span className="report-filter-chip">
                +{activeFilterChips.length - 7} more
              </span>
            ) : null}
            <button onClick={filters.clearFilters} type="button">
              Clear all
            </button>
          </div>
        ) : null}

        {!isExportJobsView && !isSavedViewsView && isSavedViewsOpen ? (
          <section className="report-saved-view-row">
            <form
              className="report-save-view-inline"
              onSubmit={(event) => {
                event.preventDefault();
                if (savedViewName.trim())
                  exportState.savedViewMutation.mutate();
              }}
            >
              <FormField label="Saved View">
                <Select
                  disabled={data.savedViews.isLoading}
                  onChange={(event) => {
                    const view = (data.savedViews.data ?? []).find(
                      (item) => item.id === event.target.value,
                    );
                    if (view) handleApplySavedView(view);
                  }}
                  options={(data.savedViews.data ?? []).map((view) => ({
                    label: view.name,
                    value: view.id,
                  }))}
                  placeholder={
                    data.savedViews.isLoading
                      ? "Loading views..."
                      : "Select Saved View"
                  }
                  value=""
                />
              </FormField>
              {data.savedViews.error ? (
                <p className="inline-error">{data.savedViews.error.message}</p>
              ) : null}
              <TextInput
                aria-label="Saved view name"
                onChange={(event) => setSavedViewName(event.target.value)}
                placeholder="View name"
                value={savedViewName}
              />
              <Button
                disabled={
                  exportState.savedViewMutation.isPending ||
                  !savedViewName.trim()
                }
                type="submit"
              >
                <Save size={16} />
                Save
              </Button>
            </form>
          </section>
        ) : null}
        {!isExportJobsView && !isSavedViewsView && isAdvancedFiltersOpen ? (
          <ReportFilterPanel
            activeFilterCount={activeFilterCount}
            budgetTypeOptions={budgetTypeOptions}
            completionFyOptions={completionFyOptions}
            completionMonthOptions={completionMonthOptions}
            dataIsLoading={data.filterMetadata.isLoading}
            departmentOptions={departmentOptions}
            entityOptions={entityOptions}
            exportFormat={exportState.exportFormat}
            filters={filters}
            natureOfWorkOptions={natureOfWorkOptions}
            onClose={() => setIsAdvancedFiltersOpen(false)}
            ownerOptions={ownerOptions}
            prReceiptMonthOptions={prReceiptMonthOptions}
            reportCode={reportCode}
            setExportFormat={exportState.setExportFormat}
            stageOptions={stageOptions}
            tenderTypeOptions={tenderTypeOptions}
            valueSlabOptions={valueSlabOptions}
          />
        ) : null}
      </section>

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
            exportJobs={exportState.exportJobs.data ?? []}
            exportJobsError={exportState.exportJobs.error}
            exportJobsIsLoading={exportState.exportJobs.isLoading}
            exportStatus={exportState.exportStatus.data}
            exportStatusError={exportState.exportStatus.error}
            exportStatusIsLoading={exportState.exportStatus.isLoading}
            onExportJobIdChange={exportState.setExportJobId}
            reportLabel="any report"
          />
        </section>
      ) : isAnalyticsView ? (
        <>
          {data.analytics.isLoading ? (
            <section className="state-panel">
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  flexWrap: "wrap",
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} height={52} width="11%" />
                ))}
              </div>
            </section>
          ) : data.analytics.error ? (
            <ErrorState
              message={data.analytics.error.message}
              title="Could not load analytics"
            />
          ) : (
            <ReportAnalyticsDashboard
              activeFilterCount={activeFilterCount}
              amountUnit={filters.amountUnit}
              metrics={metrics}
              stageError={data.stageTime.error}
              stageIsLoading={data.stageTime.isLoading}
              stageRows={data.stageTime.data}
            />
          )}
        </>
      ) : (
        <section className="report-detail-workspace">
          <section className="state-panel report-main-panel">
            {reportCode === "tender_details" ? (
              <>
                <TenderDetailsKpis
                  amountUnit={filters.amountUnit}
                  metrics={metrics}
                />
                <ReportTable
                  columns={caseColumns}
                  data={data.tenderDetails.data}
                  emptyMessage="No tender details match the current filters."
                  error={data.tenderDetails.error}
                  getRowKey={(row) => row.caseId}
                  isLoading={data.tenderDetails.isLoading}
                />
              </>
            ) : null}
            {reportCode === "running" ? (
              <ReportTable
                columns={runningColumns}
                data={data.running.data}
                emptyMessage="No running tenders match the current filters."
                error={data.running.error}
                getRowKey={(row) => row.caseId}
                isLoading={data.running.isLoading}
              />
            ) : null}
            {reportCode === "completed" ? (
              <ReportTable
                columns={completedColumns}
                data={data.completed.data}
                emptyMessage="No completed tenders match the current filters."
                error={data.completed.error}
                getRowKey={(row) => row.caseId}
                isLoading={data.completed.isLoading}
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
              />
            ) : null}
            {reportCode === "stage_time" ? (
              <ReportTable
                columns={stageColumns}
                data={data.stageTime.data}
                emptyMessage="No stage aging rows match the current filters."
                error={data.stageTime.error}
                getRowKey={(row) => row.caseId}
                isLoading={data.stageTime.isLoading}
              />
            ) : null}
            {reportCode === "rc_po_expiry" ? (
              <>
                <ReportTable
                  columns={rcPoColumns}
                  data={rcPoVisibleRows}
                  emptyMessage="No RC/PO expiry rows match the current filters."
                  error={data.rcPoExpiry.error}
                  getRowKey={(row) => row.sourceId}
                  isLoading={data.rcPoExpiry.isLoading}
                  pagination={false}
                />
                {!data.rcPoExpiry.isLoading && !data.rcPoExpiry.error ? (
                  <RcPoExpiryPagination
                    hasNextPage={rcPoHasNextPage}
                    isDisabled={data.rcPoExpiry.isFetching}
                    onPageChange={setRcPoPageIndex}
                    onPageSizeChange={(nextPageSize) => {
                      setRcPoPageSize(nextPageSize);
                      setRcPoPageIndex(0);
                    }}
                    pageIndex={rcPoPageIndex}
                    pageSize={rcPoPageSize}
                    rowCount={rcPoVisibleRows.length}
                  />
                ) : null}
              </>
            ) : null}
          </section>
        </section>
      )}

      <Modal
        isOpen={Boolean(creatingCaseFromRcPo)}
        onClose={() => setCreatingCaseFromRcPo(null)}
        size="wide"
        title="Create Case"
      >
        {creatingCaseFromRcPo ? (
          <CreateCaseForm
            initialValues={creatingCaseFromRcPo.initialValues}
            onCreated={(caseId) => {
              setCreatingCaseFromRcPo(null);
              navigateToAppPath(`/cases/${caseId}`);
            }}
          />
        ) : null}
      </Modal>
    </section>
  );
}

type ReportOption = { entityId?: string | null; label: string; value: string };
type RcPoExpiryDraft = {
  tenderFloatedOrNotRequired: boolean;
  tentativeTenderingDate: string | null;
};

type CreatingCaseFromRcPo = {
  initialValues: CreateCaseFormInitialValues;
  row: ContractExpiryReportRow;
};

function rcPoExpiryDraftKey(row: ContractExpiryReportRow): string {
  return `${row.sourceType}:${row.sourceId}`;
}

function rcPoExpiryDraftFromRow(row: ContractExpiryReportRow): RcPoExpiryDraft {
  return {
    tenderFloatedOrNotRequired: row.tenderFloatedOrNotRequired,
    tentativeTenderingDate: row.tentativeTenderingDate,
  };
}

function isRcPoExpiryDraftUnchanged(
  row: ContractExpiryReportRow,
  draft: RcPoExpiryDraft,
): boolean {
  return (
    draft.tenderFloatedOrNotRequired === row.tenderFloatedOrNotRequired &&
    (draft.tentativeTenderingDate ?? null) ===
      (row.tentativeTenderingDate ?? null)
  );
}

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
          <p>
            Use the Views button on a report tab to save the current filters as
            a reusable preset.
          </p>
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
                {view.isDefault ? (
                  <StatusBadge tone="success">Default</StatusBadge>
                ) : null}
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

function TenderDetailsKpis({
  amountUnit,
  metrics,
}: {
  amountUnit: AmountUnit;
  metrics: ReportingAnalytics | undefined;
}) {
  return (
    <section className="report-tender-kpi-grid">
      <article>
        <span>Total Tenders</span>
        <strong>{formatInteger(metrics?.totalCases ?? 0)}</strong>
        <small>
          {formatInteger(metrics?.runningCases ?? 0)} running /{" "}
          {formatInteger(metrics?.completedCases ?? 0)} completed
        </small>
      </article>
      <article>
        <span>
          PR Value / Approved Budget ({amountUnitLabel(amountUnit)}) [All
          Inclusive]
        </span>
        <strong>{formatAmount(metrics?.totalPrValue ?? 0, amountUnit)}</strong>
      </article>
      <article>
        <span>
          NFA Approved Amount ({amountUnitLabel(amountUnit)}) [All Inclusive]
        </span>
        <strong>
          {formatAmount(metrics?.totalApprovedAmount ?? 0, amountUnit)}
        </strong>
      </article>
      <article className="report-tender-kpi-positive">
        <span>
          Savings wrt PR Value/Approved Budget ({amountUnitLabel(amountUnit)})
          [All Inclusive]
        </span>
        <strong>{formatAmount(metrics?.savingsWrtPr ?? 0, amountUnit)}</strong>
        <small>
          {formatSavingsPercent(metrics?.savingsWrtPr, metrics?.completedPrValue)}
        </small>
      </article>
      <article className="report-tender-kpi-positive">
        <span>
          Savings wrt Estimate/Benchmark ({amountUnitLabel(amountUnit)}) [All
          Inclusive]
        </span>
        <strong>
          {formatAmount(metrics?.savingsWrtEstimate ?? 0, amountUnit)}
        </strong>
        <small>
          {formatSavingsPercent(
            metrics?.savingsWrtEstimate,
            metrics?.completedEstimateBenchmark,
          )}
        </small>
      </article>
    </section>
  );
}

function ReportAnalyticsDashboard({
  activeFilterCount,
  amountUnit,
  metrics,
  stageError,
  stageIsLoading,
  stageRows,
}: {
  activeFilterCount: number;
  amountUnit: AmountUnit;
  metrics: ReportingAnalytics | undefined;
  stageError: Error | null;
  stageIsLoading: boolean;
  stageRows: StageTimeRow[] | undefined;
}) {
  const statusRows = [
    {
      label: "On-Track",
      tone: "success" as const,
      value: metrics?.onTrackCases ?? 0,
    },
    {
      label: "Off-Track",
      tone: "warning" as const,
      value: metrics?.offTrackCases ?? 0,
    },
    {
      label: "Delayed",
      tone: "danger" as const,
      value: metrics?.delayedCases ?? 0,
    },
  ];
  const entityRows = (metrics?.byEntity ?? []).map((row) => ({
    amount: row.totalAwardedAmount,
    label: row.entityCode ?? row.entityName ?? row.entityId,
    secondaryValue: row.delayedCount,
    tertiaryValue: row.offTrackCount,
    value: row.caseCount,
  }));
  const entityPrRows = (metrics?.byEntity ?? []).map((row) => ({
    label: row.entityCode ?? row.entityName ?? row.entityId,
    value: row.totalPrValue,
  }));
  const departmentNatureRows = buildDepartmentNatureChartRows(
    metrics?.byDepartmentNatureOfWork ?? [],
  );
  const tenderTypeRows = (metrics?.byTenderType ?? []).map((row) => ({
    amount: row.totalAwardedAmount,
    id: row.tenderTypeId,
    label: row.tenderTypeName,
    secondaryValue: row.delayedCount,
    tertiaryValue: row.offTrackCount,
    value: row.caseCount,
  }));
  const stageChartRows = buildStageBreakdownRows(stageRows ?? []);
  const completedRatio = metrics?.totalCases
    ? Math.round(((metrics.completedCases ?? 0) / metrics.totalCases) * 100)
    : 0;
  const delayedRatio = metrics?.runningCases
    ? Math.round(((metrics.delayedCases ?? 0) / metrics.runningCases) * 100)
    : 0;
  const offTrackRatio = metrics?.runningCases
    ? Math.round(((metrics.offTrackCases ?? 0) / metrics.runningCases) * 100)
    : 0;
  const onTrackRatio = metrics?.runningCases
    ? Math.round(((metrics.onTrackCases ?? 0) / metrics.runningCases) * 100)
    : 0;
  const kpiTiles = [
    {
      label: "Tenders Count",
      meta: `${formatInteger(metrics?.runningCases ?? 0)} running / ${formatInteger(metrics?.completedCases ?? 0)} completed`,
      tone: "neutral",
      value: formatInteger(metrics?.totalCases ?? 0),
    },
    {
      label: `Tender Value (${amountUnitLabel(amountUnit)}) [All Inclusive]`,
      meta: "",
      tone: "brand",
      value: formatAmount(metrics?.totalPrValue ?? 0, amountUnit),
    },
    {
      label: `NFA Approved Amount (${amountUnitLabel(amountUnit)}) [All Inclusive]`,
      meta: "",
      tone: "success",
      value: formatAmount(metrics?.totalApprovedAmount ?? 0, amountUnit),
    },
    {
      label: `Savings wrt PR Value/Approved Budget (${amountUnitLabel(amountUnit)}) [All Inclusive]`,
      meta: formatSavingsPercent(metrics?.savingsWrtPr, metrics?.completedPrValue),
      tone: "success",
      value: formatAmount(metrics?.savingsWrtPr ?? 0, amountUnit),
    },
    {
      label: `Savings wrt Estimate/Benchmark (${amountUnitLabel(amountUnit)}) [All Inclusive]`,
      meta: formatSavingsPercent(
        metrics?.savingsWrtEstimate,
        metrics?.completedEstimateBenchmark,
      ),
      tone: "success",
      value: formatAmount(metrics?.savingsWrtEstimate ?? 0, amountUnit),
    },
    {
      label: "Avg Bidder Participation (Open + Limited, Completed)",
      meta: "",
      tone: "warning",
      value: formatNullableDecimal(metrics?.averageBiddersParticipated),
    },
    {
      label: "Avg Qualified Bidders Count (Open + Limited, Completed)",
      meta: "",
      tone: "brand",
      value: formatNullableDecimal(metrics?.averageQualifiedBidders),
    },
    {
      label: "Avg Cycle Time (Days)",
      meta: metrics?.completedCases != null ? `${metrics.completedCases} completed` : "",
      tone: delayedRatio > 0 ? "danger" : "success",
      value: formatNullableDecimal(metrics?.averageCycleTimeDays),
    },
    {
      label: "Avg Running Tender Age",
      meta: metrics?.runningCases != null ? `${metrics.runningCases} running` : "",
      tone: "warning",
      value: formatNullableDecimal(metrics?.averageRunningCycleTimeDays),
    },
  ];
  const filterLabel = activeFilterCount
    ? `${activeFilterCount} filters applied`
    : "Default view";

  return (
    <section className="report-analytics-dashboard">
      <section className="state-panel report-analytics-overview">
        <div className="report-analytics-overview-heading">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Procurement reporting health</h2>
          </div>
          <span>{filterLabel}</span>
        </div>
        <div className="report-analytics-overview-grid">
          <div className="report-analytics-kpi-strip">
            {kpiTiles.map((tile) => (
              <article
                className={`report-analytics-kpi report-analytics-kpi-${tile.tone}`}
                key={tile.label}
              >
                <div>
                  <span>{tile.label}</span>
                  <strong>{tile.value}</strong>
                  {tile.meta ? <small>{tile.meta}</small> : null}
                </div>
              </article>
            ))}
          </div>
          <aside className="report-analytics-status-panel">
            <ReportChartHeader
              eyebrow="Running Workload"
              subtitle={`${metrics?.runningCases ?? 0} running cases`}
              title="Delay indicator"
            />
            <ReportDonutChart
              rows={statusRows}
              total={metrics?.runningCases ?? 0}
            />
            <div className="report-analytics-status-rates">
              <div>
                <span>On-Track</span>
                <strong>{onTrackRatio}%</strong>
              </div>
              <div>
                <span>Off-Track</span>
                <strong>{offTrackRatio}%</strong>
              </div>
              <div>
                <span>Delayed</span>
                <strong>{delayedRatio}%</strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="state-panel report-analytics-card">
        <ReportChartHeader
          eyebrow="PR value mix"
          subtitle={`${entityPrRows.length} reporting groups`}
          title="Entity-wise PR value distribution"
        />
        <ReportEntityPrValueDonut
          amountUnit={amountUnit}
          rows={entityPrRows}
          total={metrics?.totalPrValue ?? 0}
        />
      </section>

      <section className="state-panel report-analytics-card">
        <ReportChartHeader
          eyebrow="Where work sits"
          subtitle={`${entityRows.length} reporting groups`}
          title="Cases by entity"
        />
        <ReportEntityRankedList rows={entityRows} amountUnit={amountUnit} />
      </section>

      <section className="state-panel report-analytics-card report-analytics-wide">
        <ReportChartHeader
          eyebrow="Department workload"
          subtitle={`${departmentNatureRows.length} department(s)`}
          title="User department case count by nature of work"
        />
        <ReportDepartmentNatureStackedBar rows={departmentNatureRows} />
      </section>

      <section className="state-panel report-analytics-card report-analytics-wide report-analytics-tender-type-card">
        <ReportChartHeader
          eyebrow="Type breakdown"
          subtitle={`${tenderTypeRows.length} tender types`}
          title="Tender type split"
        />
        <ReportTenderTypeStackedChart
          rows={tenderTypeRows}
          onTenderTypeClick={(tenderTypeId) => {
            const params = new URLSearchParams();
            params.set("tenderTypeIds", tenderTypeId);
            navigateToAppPath(`/cases?${params.toString()}`);
          }}
          onTenderTypeStatusClick={(tenderTypeId, trackStatus) => {
            const params = new URLSearchParams();
            params.set("tenderTypeIds", tenderTypeId);
            params.set("trackStatus", trackStatus);
            navigateToAppPath(`/cases?${params.toString()}`);
          }}
        />
      </section>

      <section className="state-panel report-analytics-card report-analytics-wide">
        <ReportChartHeader
          eyebrow="Process stage"
          subtitle={
            stageIsLoading
              ? "Loading stages"
              : `${stageChartRows.length} active stages`
          }
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

function buildStageBreakdownRows(rows: StageTimeRow[]) {
  const counts = new Map<number, number>();
  rows.forEach((row) =>
    counts.set(row.stageCode, (counts.get(row.stageCode) ?? 0) + 1),
  );
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([stageCode, value]) => ({
      label: formatCaseStage(stageCode),
      value,
    }));
}

function buildDepartmentNatureChartRows(
  rows: ReportingAnalytics["byDepartmentNatureOfWork"],
) {
  const departments = new Map<string, {
    departmentName: string;
    total: number;
    values: Map<string, number>;
  }>();
  const natureNames = new Set<string>();

  rows.forEach((row) => {
    const departmentKey = row.departmentId ?? row.departmentName;
    const natureName = row.natureOfWorkName || "Unspecified";
    const department = departments.get(departmentKey) ?? {
      departmentName: row.departmentName || "Unspecified",
      total: 0,
      values: new Map<string, number>(),
    };
    department.total += row.caseCount;
    department.values.set(natureName, (department.values.get(natureName) ?? 0) + row.caseCount);
    departments.set(departmentKey, department);
    natureNames.add(natureName);
  });

  const natures = [...natureNames].sort((left, right) => left.localeCompare(right));
  const departmentRows = [...departments.values()]
    .sort((left, right) => right.total - left.total || left.departmentName.localeCompare(right.departmentName))
    .slice(0, 10)
    .map((department) => ({
      departmentName: department.departmentName,
      segments: natures.map((nature) => ({
        label: nature,
        value: department.values.get(nature) ?? 0,
      })),
      total: department.total,
    }));

  return departmentRows;
}

function formatInteger(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatValueSlabLabel(value: string) {
  if (value === "lt_2l") return "Below Rs. 2 Lakhs";
  if (value === "2l_5l") return "Rs. 2 - <5 Lakhs";
  if (value === "5l_10l") return "Rs. 5 - <10 Lakhs";
  if (value === "10l_25l") return "Rs. 10 - <25 Lakhs";
  if (value === "25l_50l") return "Rs. 25 - <50 Lakhs";
  if (value === "50l_100l") return "Rs. 50 - <100 Lakhs";
  if (value === "100l_200l") return "Rs. 100 - <200 Lakhs";
  if (value === "gte_200l") return ">= Rs. 200 Lakhs";
  return value;
}

function trackStatusLabel(value: "all" | "delayed" | "off_track" | "on_track") {
  if (value === "delayed") return "Delayed";
  if (value === "off_track") return "Off Track";
  if (value === "on_track") return "On Track";
  return "All";
}

function formatSavingsPercent(
  savings: number | null | undefined,
  base: number | null | undefined,
) {
  if (savings == null || !base) return "[-]";
  return `[${((savings / base) * 100).toFixed(1)}%]`;
}

function formatNullableDecimal(value: number | null | undefined) {
  return value == null ? "-" : formatDecimal(value);
}

function formatNullableDays(value: number | null | undefined) {
  if (value == null) return "-";
  const days = Object.is(Math.round(value), -0) ? 0 : Math.round(value);
  return `${days.toLocaleString()}d`;
}

function formatDateCell(value: string | null | undefined) {
  return value ?? "-";
}

function toggleReportFilterValue(
  values: string[],
  value: string,
  checked: boolean,
): string[] {
  return checked
    ? [...new Set([...values, value])]
    : values.filter((item) => item !== value);
}

function selectedReportFilterLabel(
  values: string[],
  options: ReportOption[],
): string {
  if (!values.length) return "All";
  if (values.length === options.length && options.length > 0)
    return "All selected";
  const labels = values.map(
    (selected) =>
      options.find((option) => option.value === selected)?.label ?? selected,
  );
  if (labels.length > 2) return `${labels.length} selected`;
  return labels.join(", ");
}

function ReportChartHeader({
  eyebrow,
  subtitle,
  title,
}: {
  eyebrow: string;
  subtitle: string;
  title: string;
}) {
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
  rows: Array<{
    amount: number;
    label: string;
    secondaryValue: number;
    tertiaryValue?: number;
    value: number;
  }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (rows.length === 0) {
    return <p className="hero-copy">No chart data for the current filters.</p>;
  }

  return (
    <div className="report-distribution-card-grid">
      {rows.map((row, index) => (
        <article className="report-distribution-card" key={row.label}>
          <div
            className="report-distribution-ring"
            style={
              {
                "--progress": `${total > 0 ? Math.round((row.value / total) * 100) : 0}%`,
              } as CSSProperties
            }
          >
            <strong>
              {total > 0 ? Math.round((row.value / total) * 100) : 0}%
            </strong>
          </div>
          <div className="report-distribution-content">
            <div className="report-distribution-heading">
              <span>#{index + 1}</span>
              <strong>{row.label}</strong>
            </div>
            <p>{formatAmount(row.amount, amountUnit)} awarded</p>
            <div className="report-distribution-meter">
              <span
                style={{ width: `${Math.max(7, (row.value / max) * 100)}%` }}
              />
            </div>
            <dl>
              <div>
                <dt>Cases</dt>
                <dd>{row.value}</dd>
              </div>
              <div>
                <dt>Delayed</dt>
                <dd>{row.secondaryValue}</dd>
              </div>
              <div>
                <dt>Off Track</dt>
                <dd>{row.tertiaryValue ?? 0}</dd>
              </div>
            </dl>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReportEntityRankedList({
  amountUnit,
  rows,
}: {
  amountUnit: AmountUnit;
  rows: Array<{
    amount: number;
    label: string;
    secondaryValue: number;
    tertiaryValue?: number;
    value: number;
  }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0) {
    return <p className="hero-copy">No entity data for the current filters.</p>;
  }

  return (
    <div className="report-entity-ranked-list">
      {rows.map((row, index) => {
        const delayed = row.secondaryValue;
        const offTrack = row.tertiaryValue ?? 0;
        const onTrack = Math.max(row.value - delayed - offTrack, 0);
        return (
          <article className="report-entity-ranked-row" key={row.label}>
            <span className="report-entity-rank">#{index + 1}</span>
            <div className="report-entity-ranked-main">
              <div className="report-entity-ranked-title">
                <strong>{row.label}</strong>
                <span>{formatAmount(row.amount, amountUnit)} awarded</span>
              </div>
              <div className="report-entity-ranked-meter">
                <span style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }} />
              </div>
            </div>
            <div className="report-entity-ranked-metrics">
              <strong>{row.value}</strong>
              <span className="report-status-pill report-status-pill-success">{onTrack}</span>
              <span className="report-status-pill report-status-pill-warning">{offTrack}</span>
              <span className="report-status-pill report-status-pill-danger">{delayed}</span>
            </div>
          </article>
        );
      })}
      <div className="report-entity-ranked-legend">
        <span>Total</span>
        <span>On-Track</span>
        <span>Off-Track</span>
        <span>Delayed</span>
      </div>
    </div>
  );
}

function ReportEntityPrValueDonut({
  amountUnit,
  rows,
  total,
}: {
  amountUnit: AmountUnit;
  rows: Array<{ label: string; value: number }>;
  total: number;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const visibleRows = rows
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);

  if (visibleRows.length === 0) {
    return <p className="hero-copy">No PR value data for the current filters.</p>;
  }

  return (
    <div className="report-entity-value-donut">
      <div
        aria-label={`Entity PR value distribution total ${formatAmount(total, amountUnit)}`}
        className="report-entity-value-donut-visual"
        role="img"
      >
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle className="report-donut-track" cx="48" cy="48" r={radius} />
          {visibleRows.map((row, index) => {
            const length = total > 0 ? (row.value / total) * circumference : 0;
            const dashOffset = offset;
            offset -= length;
            return (
              <circle
                className="report-entity-value-donut-segment"
                cx="48"
                cy="48"
                key={row.label}
                r={radius}
                stroke={analyticsPaletteColor(index)}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div>
          <strong>{formatAmount(total, amountUnit)}</strong>
          <span>Total PR value</span>
        </div>
      </div>
      <div className="report-entity-value-legend">
        {visibleRows.map((row, index) => {
          const share = total > 0 ? (row.value / total) * 100 : 0;
          return (
            <div key={row.label}>
              <span
                className="report-entity-value-dot"
                style={{ background: analyticsPaletteColor(index) }}
              />
              <strong>{row.label}</strong>
              <span>{formatAmount(row.value, amountUnit)}</span>
              <em>{share.toFixed(1)}%</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportDepartmentNatureStackedBar({
  rows,
}: {
  rows: Array<{
    departmentName: string;
    segments: Array<{ label: string; value: number }>;
    total: number;
  }>;
}) {
  const legend = Array.from(
    new Set(rows.flatMap((row) => row.segments.filter((segment) => segment.value > 0).map((segment) => segment.label))),
  );
  const max = Math.max(1, ...rows.map((row) => row.total));

  if (rows.length === 0) {
    return <p className="hero-copy">No department data for the current filters.</p>;
  }

  return (
    <div className="report-department-nature-chart">
      <div className="report-department-nature-legend">
        {legend.map((label, index) => (
          <span key={label}>
            <i style={{ background: analyticsPaletteColor(index) }} />
            {label}
          </span>
        ))}
      </div>
      <div className="report-department-nature-rows">
        {rows.map((row) => (
          <div className="report-department-nature-row" key={row.departmentName}>
            <div className="report-department-nature-label">
              <strong>{row.departmentName}</strong>
              <span>{row.total} case{row.total === 1 ? "" : "s"}</span>
            </div>
            <div className="report-department-nature-track">
              <div
                className="report-department-nature-stack"
                style={{ width: `${Math.max(8, (row.total / max) * 100)}%` }}
              >
                {legend.map((label, index) => {
                  const value = row.segments.find((segment) => segment.label === label)?.value ?? 0;
                  return value > 0 ? (
                    <span
                      key={label}
                      style={{
                        background: analyticsPaletteColor(index),
                        flexBasis: `${(value / row.total) * 100}%`,
                      }}
                    />
                  ) : null;
                })}
              </div>
            </div>
            <strong className="report-department-nature-total">{row.total}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportTenderTypeStackedChart({
  onTenderTypeClick,
  onTenderTypeStatusClick,
  rows,
}: {
  onTenderTypeClick?: (tenderTypeId: string) => void;
  onTenderTypeStatusClick?: (
    tenderTypeId: string,
    trackStatus: "delayed" | "off_track" | "on_track",
  ) => void;
  rows: Array<{
    amount: number;
    id: string | null;
    label: string;
    secondaryValue: number;
    tertiaryValue?: number;
    value: number;
  }>;
}) {
  const sortedRows = [...rows].sort(
    (left, right) =>
      right.value - left.value || left.label.localeCompare(right.label),
  );
  const max = Math.max(1, ...sortedRows.map((row) => row.value));
  const total = sortedRows.reduce((sum, row) => sum + row.value, 0);
  const tickCount = Math.min(4, max);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    Math.round((max / tickCount) * (tickCount - index)),
  );

  if (sortedRows.length === 0) {
    return (
      <p className="hero-copy">No tender type data for the current filters.</p>
    );
  }

  return (
    <div className="report-tender-type-stacked-chart">
      <div className="report-tender-type-legend">
        <span>
          <i className="report-legend-on-track" /> On-Track
        </span>
        <span>
          <i className="report-legend-off-track" /> Off-Track
        </span>
        <span>
          <i className="report-legend-delayed" /> Delayed
        </span>
      </div>
      <div className="report-tender-type-plot">
        <div className="report-tender-type-y-title">Case count</div>
        <div className="report-tender-type-y-axis">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div
          className="report-tender-type-bars"
          style={{ "--bar-count": sortedRows.length } as CSSProperties}
        >
          {ticks.map((tick) => (
            <span
              className="report-tender-type-gridline"
              key={`grid-${tick}`}
              style={{ bottom: `${(tick / max) * 100}%` }}
            />
          ))}
          {sortedRows.map((row) => {
            const delayed = Math.min(row.secondaryValue, row.value);
            const offTrack = Math.min(row.tertiaryValue ?? 0, Math.max(row.value - delayed, 0));
            const onTrack = Math.max(row.value - delayed - offTrack, 0);
            const share = total > 0 ? Math.round((row.value / total) * 100) : 0;
            const totalHeight = Math.max(4, (row.value / max) * 100);
            const onTrackShare =
              row.value > 0 ? (onTrack / row.value) * 100 : 0;
            const offTrackShare =
              row.value > 0 ? (offTrack / row.value) * 100 : 0;
            const delayedShare =
              row.value > 0 ? (delayed / row.value) * 100 : 0;
            const canDrillDown = Boolean(row.id && onTenderTypeClick);
            const drillIntoStatus = (
              event: MouseEvent<HTMLSpanElement>,
              trackStatus: "delayed" | "off_track" | "on_track",
            ) => {
              event.stopPropagation();
              if (row.id) onTenderTypeStatusClick?.(row.id, trackStatus);
            };
            return (
              <div
                className="report-tender-type-bar-item"
                key={row.label}
                onClick={() => {
                  if (row.id) onTenderTypeClick?.(row.id);
                }}
                onKeyDown={(event) => {
                  if (!canDrillDown) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (row.id) onTenderTypeClick?.(row.id);
                  }
                }}
                role={canDrillDown ? "button" : undefined}
                tabIndex={canDrillDown ? 0 : undefined}
                title={canDrillDown ? `Open ${row.label} cases` : undefined}
              >
                <div className="report-tender-type-bar-value">{row.value}</div>
                <div
                  aria-label={`${row.label}: ${row.value} cases, ${delayed} delayed, ${offTrack} off track, ${onTrack} on track`}
                  className="report-tender-type-bar"
                  role="img"
                  style={
                    {
                      "--delayed-share": `${delayedShare}%`,
                      "--off-track-share": `${offTrackShare}%`,
                      "--on-track-share": `${onTrackShare}%`,
                      "--total-height": `${totalHeight}%`,
                    } as CSSProperties
                  }
                >
                  {onTrack > 0 ? (
                    <span
                      className="report-tender-type-bar-on-track"
                      onClick={(event) => drillIntoStatus(event, "on_track")}
                      title={`Open ${row.label} on-track cases`}
                    />
                  ) : null}
                  {offTrack > 0 ? (
                    <span
                      className="report-tender-type-bar-off-track"
                      onClick={(event) => drillIntoStatus(event, "off_track")}
                      title={`Open ${row.label} off-track cases`}
                    />
                  ) : null}
                  {delayed > 0 ? (
                    <span
                      className="report-tender-type-bar-delayed"
                      onClick={(event) => drillIntoStatus(event, "delayed")}
                      title={`Open ${row.label} delayed cases`}
                    />
                  ) : null}
                </div>
                <div className="report-tender-type-x-label">
                  <strong>{row.label}</strong>
                  <span>{share}% share</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="report-tender-type-x-title">Tender type</div>
    </div>
  );
}

function analyticsPaletteColor(index: number) {
  const colors = [
    "#147484",
    "#2f9e8f",
    "#f59e0b",
    "#dc2626",
    "#64748b",
    "#7c3aed",
    "#0891b2",
    "#16a34a",
  ];
  return colors[index % colors.length];
}

function ReportStageBreakdown({
  rows,
}: {
  rows: Array<{ label: string; value: number }>;
}) {
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
            <span>
              {total > 0 ? Math.round((row.value / total) * 100) : 0}% of cases
            </span>
          </div>
          <div
            className="report-stage-track"
            aria-label={`${row.label}: ${row.value} cases`}
          >
            <span
              style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }}
            />
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
    {
      label: "Running",
      tone: "warning" as const,
      value: metrics?.runningCases ?? 0,
    },
    {
      label: "Completed",
      tone: "success" as const,
      value: metrics?.completedCases ?? 0,
    },
    {
      label: "Delayed",
      tone: "danger" as const,
      value: metrics?.delayedCases ?? 0,
    },
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
          <span>{buildStageBreakdownRows(stageRows ?? []).length} stages</span>
        </div>
        {stageIsLoading ? (
          <Skeleton height={20} />
        ) : stageError ? (
          <p className="inline-error">{stageError.message}</p>
        ) : (
          <ReportBarChart rows={buildStageBreakdownRows(stageRows ?? [])} />
        )}
      </div>
    </section>
  );
}

function ReportDonutChart({
  rows,
  total,
}: {
  rows: Array<{
    label: string;
    tone: "danger" | "success" | "warning";
    value: number;
  }>;
  total: number;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="report-donut-card">
      <div
        className="report-donut-visual"
        aria-label={`Status distribution total ${total}`}
        role="img"
      >
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
  exportJobs,
  exportJobsError,
  exportJobsIsLoading,
  exportStatus,
  exportStatusError,
  exportStatusIsLoading,
  onExportJobIdChange,
  reportLabel,
}: {
  canDownloadExport: boolean;
  exportJobId: string;
  exportJobs: ExportJobListItem[];
  exportJobsError: Error | null;
  exportJobsIsLoading: boolean;
  exportStatus: ExportJobStatus | undefined;
  exportStatusError: Error | null;
  exportStatusIsLoading: boolean;
  onExportJobIdChange: (jobId: string) => void;
  reportLabel: string;
}) {
  const [isExportDetailsOpen, setIsExportDetailsOpen] = useState(false);
  const selectedExportJob =
    exportStatus ?? exportJobs.find((job) => job.id === exportJobId);
  const openExportDetails = (jobId: string) => {
    onExportJobIdChange(jobId);
    setIsExportDetailsOpen(true);
  };
  const columns = useMemo<VirtualTableColumn<ExportJobListItem>[]>(
    () => [
      {
        enableFilter: true,
        enableSort: true,
        filterOptions: reportFilterOptions([
          "Tender Details",
          "Running Tender",
          "Completed Tender",
          "Vendor Awards",
          "Stage-Time Lapsed",
          "RC/PO Expiry",
        ]),
        filterValue: (job) => getReportLabel(job.reportCode),
        header: "Report",
        key: "report",
        render: (job) => getReportLabel(job.reportCode),
        sortValue: (job) => getReportLabel(job.reportCode),
      },
      {
        enableFilter: true,
        enableSort: true,
        filterOptions: reportFilterOptions(["XLSX", "CSV"]),
        filterValue: (job) => job.format.toUpperCase(),
        header: "Format",
        key: "format",
        render: (job) => job.format.toUpperCase(),
        sortValue: (job) => job.format,
      },
      {
        enableFilter: true,
        enableSort: true,
        filterOptions: reportFilterOptions([
          "queued",
          "running",
          "completed",
          "failed",
          "expired",
        ]),
        filterValue: (job) => job.status,
        header: "Status",
        key: "status",
        render: (job) => (
          <StatusBadge tone={exportStatusTone(job.status)}>
            {job.status}
          </StatusBadge>
        ),
        sortValue: (job) => job.status,
      },
      {
        enableSort: true,
        header: "Progress",
        key: "progress",
        render: (job) => `${job.progressPercent}%`,
        sortValue: (job) => job.progressPercent,
      },
      {
        enableSort: true,
        header: "Created",
        key: "created",
        render: (job) => formatDateTime(job.createdAt),
        sortValue: (job) => job.createdAt,
      },
      {
        enableSort: true,
        header: "Expires",
        key: "expires",
        render: (job) => (job.expiresAt ? formatDateTime(job.expiresAt) : "-"),
        sortValue: (job) => job.expiresAt ?? "",
      },
      {
        header: "Actions",
        key: "actions",
        render: (job) => (
          <div className="report-export-grid-actions">
            <Button
              onClick={(event) => {
                event.stopPropagation();
                openExportDetails(job.id);
              }}
              size="sm"
              variant={job.id === exportJobId ? "primary" : "secondary"}
            >
              View
            </Button>
            {job.status === "completed" && job.fileAssetId ? (
              <Button
                href={getExportDownloadUrl(job.id)}
                onClick={(event) => event.stopPropagation()}
                size="sm"
                variant="secondary"
              >
                <Download size={14} />
                Download
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [exportJobId],
  );

  return (
    <section className="state-panel report-export-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Exports</p>
          <h2>Export jobs</h2>
        </div>
        <FileSpreadsheet
          aria-hidden="true"
          className="report-panel-icon"
          size={18}
        />
      </div>
      <div className="report-export-list-panel">
        {exportJobsIsLoading ? (
          <div className="report-table-skeleton">
            {[1, 2, 3].map((item) => (
              <div key={item}>
                <Skeleton height={13} width="16%" />
                <Skeleton height={13} width="10%" />
                <Skeleton height={13} width="18%" />
                <Skeleton height={13} width="12%" />
              </div>
            ))}
          </div>
        ) : exportJobsError ? (
          <p className="inline-error">{exportJobsError.message}</p>
        ) : exportJobs.length ? (
          <VirtualTable
            columns={columns}
            emptyMessage="No export jobs found."
            getRowKey={(job) => job.id}
            maxHeight={640}
            onRowClick={(job) => openExportDetails(job.id)}
            rowHeight={48}
            rows={exportJobs}
          />
        ) : (
          <div className="report-export-empty">
            <FileSpreadsheet aria-hidden="true" size={22} />
            <strong>No exports yet</strong>
            <p>
              Run an export for {reportLabel}. Your XLSX and CSV jobs will
              appear here.
            </p>
          </div>
        )}
      </div>
      <Modal
        isOpen={isExportDetailsOpen}
        onClose={() => setIsExportDetailsOpen(false)}
        title="Export Details"
      >
        {exportStatusIsLoading ? (
          <div className="report-export-skeleton">
            <Skeleton height={18} />
            <Skeleton height={72} />
          </div>
        ) : exportStatusError ? (
          <p className="inline-error">{exportStatusError.message}</p>
        ) : selectedExportJob ? (
          <div className="report-export-status-card">
            <div className="report-export-status-head">
              <CheckCircle2 aria-hidden="true" size={18} />
              <div>
                <strong>{getReportLabel(selectedExportJob.reportCode)}</strong>
                <span>
                  {selectedExportJob.progressMessage ??
                    "Export job is being processed."}
                </span>
              </div>
            </div>
            <div className="report-export-progress">
              <div>
                <span>Progress</span>
                <strong>{selectedExportJob.progressPercent}%</strong>
              </div>
              <progress max={100} value={selectedExportJob.progressPercent} />
            </div>
            <dl className="report-export-meta">
              <div>
                <dt>Status</dt>
                <dd>{selectedExportJob.status}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{selectedExportJob.format.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(selectedExportJob.createdAt)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>
                  {selectedExportJob.completedAt
                    ? formatDateTime(selectedExportJob.completedAt)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>
                  {selectedExportJob.expiresAt
                    ? formatDateTime(selectedExportJob.expiresAt)
                    : "-"}
                </dd>
              </div>
            </dl>
            {selectedExportJob.status === "queued" ||
            selectedExportJob.status === "running" ? (
              <p className="report-export-help">
                This page refreshes automatically while the worker prepares the
                file. The download button appears after the export reaches
                Completed.
              </p>
            ) : null}
            {selectedExportJob.status === "failed" ? (
              <p className="inline-error">
                Export failed. Check the worker logs, then run the export again
                after the issue is resolved.
              </p>
            ) : null}
            <div className="report-export-modal-actions">
              {canDownloadExport ? (
                <Button
                  className="report-download-link"
                  href={getExportDownloadUrl(exportJobId)}
                  variant="secondary"
                >
                  <Download size={16} />
                  Download File
                </Button>
              ) : null}
              <Button
                onClick={() => setIsExportDetailsOpen(false)}
                variant="ghost"
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="report-export-empty">
            <FileSpreadsheet aria-hidden="true" size={22} />
            <strong>No export selected</strong>
            <p>
              Select a row to inspect progress and download the completed file.
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}

function ReportFilterPanel({
  activeFilterCount,
  budgetTypeOptions,
  completionFyOptions,
  completionMonthOptions,
  dataIsLoading,
  departmentOptions,
  entityOptions,
  exportFormat,
  filters,
  natureOfWorkOptions,
  onClose,
  ownerOptions,
  prReceiptMonthOptions,
  reportCode,
  setExportFormat,
  stageOptions,
  tenderTypeOptions,
  valueSlabOptions,
}: {
  activeFilterCount: number;
  budgetTypeOptions: ReportOption[];
  completionFyOptions: ReportOption[];
  completionMonthOptions: ReportOption[];
  dataIsLoading: boolean;
  departmentOptions: ReportOption[];
  entityOptions: ReportOption[];
  exportFormat: "csv" | "xlsx";
  filters: ReturnType<typeof useReportFilters>;
  natureOfWorkOptions: ReportOption[];
  onClose: () => void;
  ownerOptions: ReportOption[];
  prReceiptMonthOptions: ReportOption[];
  reportCode: ReportCode;
  setExportFormat: (format: "csv" | "xlsx") => void;
  stageOptions: ReportOption[];
  tenderTypeOptions: ReportOption[];
  valueSlabOptions: ReportOption[];
}) {
  const showCompletionFilters = reportCode !== "running";
  const useBusinessFilterSet =
    reportCode === "completed" || reportCode === "vendor_awards";
  const showTrackStatusFilter =
    reportCode !== "completed" && reportCode !== "vendor_awards";
  if (reportCode === "rc_po_expiry") {
    return (
      <RcPoReportFilterPanel
        activeFilterCount={activeFilterCount}
        budgetTypeOptions={budgetTypeOptions}
        dataIsLoading={dataIsLoading}
        departmentOptions={departmentOptions}
        entityOptions={entityOptions}
        exportFormat={exportFormat}
        filters={filters}
        natureOfWorkOptions={natureOfWorkOptions}
        onClose={onClose}
        ownerOptions={ownerOptions}
        setExportFormat={setExportFormat}
        valueSlabOptions={valueSlabOptions}
      />
    );
  }
  return (
    <section
      className="report-filter-panel"
      aria-label="Advanced report filters"
    >
      <div className="report-filter-panel-header">
        <div>
          <p className="eyebrow">Filters</p>
          <h2>Refine report data</h2>
        </div>
        <div className="report-filter-panel-summary">
          <Filter aria-hidden="true" size={18} />
          <span>{activeFilterCount} active</span>
        </div>
      </div>
      <div className="report-filter-panel-body">
        <section className="report-filter-matrix report-filter-matrix-compact">
          {showCompletionFilters ? (
            <ReportMultiSelectFilter
              disabled={dataIsLoading}
              label="Completion FY"
              onChange={filters.setSelectedCompletionFys}
              options={completionFyOptions}
              value={filters.selectedCompletionFys}
            />
          ) : null}
          {showCompletionFilters ? (
            <ReportMultiSelectFilter
              disabled={dataIsLoading}
              label="Completion Month"
              onChange={filters.setSelectedCompletionMonths}
              options={completionMonthOptions}
              value={filters.selectedCompletionMonths}
            />
          ) : null}
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Entity"
            onChange={filters.setSelectedEntityIds}
            options={entityOptions}
            value={filters.selectedEntityIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="User Department"
            onChange={filters.setSelectedDepartmentIds}
            options={departmentOptions}
            value={filters.selectedDepartmentIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Tender Type"
            onChange={filters.setSelectedTenderTypeIds}
            options={tenderTypeOptions}
            value={filters.selectedTenderTypeIds}
          />
          {!useBusinessFilterSet ? (
            <ReportMultiSelectFilter
              disabled={dataIsLoading}
              label="Tender Stage"
              onChange={filters.setSelectedStageCodes}
              options={stageOptions}
              value={filters.selectedStageCodes}
            />
          ) : null}
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Tender Owner"
            onChange={filters.setSelectedOwnerUserIds}
            options={ownerOptions}
            value={filters.selectedOwnerUserIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="PR Receipt Month"
            onChange={filters.setSelectedPrReceiptMonths}
            options={prReceiptMonthOptions}
            value={filters.selectedPrReceiptMonths}
          />
          <FormField label="LOI Awarded?">
            <Select
              onChange={(event) =>
                filters.setLoiAwarded(
                  event.target.value as "all" | "false" | "true",
                )
              }
              options={[
                { label: "Yes", value: "true" },
                { label: "No", value: "false" },
              ]}
              placeholder="All"
              value={filters.loiAwarded === "all" ? "" : filters.loiAwarded}
            />
          </FormField>
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Nature of Work"
            onChange={filters.setSelectedNatureOfWorkIds}
            options={natureOfWorkOptions}
            value={filters.selectedNatureOfWorkIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Budget Type"
            onChange={filters.setSelectedBudgetTypeIds}
            options={budgetTypeOptions}
            value={filters.selectedBudgetTypeIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Value Slab"
            onChange={filters.setSelectedValueSlabs}
            options={valueSlabOptions}
            value={filters.selectedValueSlabs}
          />
          {showTrackStatusFilter ? (
            <FormField label="Delay Indicator">
              <Select
                onChange={(event) =>
                  filters.setTrackStatus(
                    (event.target.value || "all") as
                      | "all"
                      | "delayed"
                      | "off_track"
                      | "on_track",
                  )
                }
                options={[
                  { label: "Delayed", value: "delayed" },
                  { label: "Off Track", value: "off_track" },
                  { label: "On Track", value: "on_track" },
                ]}
                placeholder="All"
                value={filters.trackStatus === "all" ? "" : filters.trackStatus}
              />
            </FormField>
          ) : null}
          <FormField label="Routed Through CPC">
            <Select
              onChange={(event) =>
                filters.setCpcInvolved(
                  (event.target.value || "any") as "any" | "false" | "true",
                )
              }
              options={[
                { label: "Yes", value: "true" },
                { label: "No", value: "false" },
              ]}
              placeholder="All"
              value={filters.cpcInvolved === "any" ? "" : filters.cpcInvolved}
            />
          </FormField>
          {!useBusinessFilterSet ? (
            <label className="report-inline-check">
              <input
                checked={filters.priorityCase}
                onChange={(event) =>
                  filters.setPriorityCase(event.target.checked)
                }
                type="checkbox"
              />
              <span>Priority cases only</span>
            </label>
          ) : null}
          <label className="report-inline-check report-deletion-flag">
            <input
              checked={filters.deletedOnly}
              onChange={(event) => filters.setDeletedOnly(event.target.checked)}
              type="checkbox"
            />
            <span>Show deleted cases only</span>
          </label>
          {useBusinessFilterSet ? (
            <FormField label="Currency Unit">
              <div
                aria-label="Currency unit"
                className="segmented-control"
                role="group"
              >
                {([
                  ["rupees", "Rupees"],
                  ["lakh", "Rs. Lakhs"],
                ] as const).map(([unit, label]) => (
                  <button
                    className={
                      filters.amountUnit === unit ? "segmented-control-active" : ""
                    }
                    key={unit}
                    onClick={() => filters.setAmountUnit(unit)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
          ) : null}
        </section>
        <div className="report-actions-row report-drawer-actions">
          {!useBusinessFilterSet ? (
            <div
              aria-label="Export format"
              className="segmented-control"
              role="group"
            >
              {(["xlsx", "csv"] as const).map((format) => (
                <button
                  className={
                    exportFormat === format ? "segmented-control-active" : ""
                  }
                  key={format}
                  onClick={() => setExportFormat(format)}
                  type="button"
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          ) : null}
          <Button variant="ghost" onClick={filters.clearFilters}>
            <X size={18} />
            Clear
          </Button>
          <Button onClick={onClose}>Apply Filters</Button>
        </div>
      </div>
    </section>
  );
}

function RcPoReportFilterPanel({
  activeFilterCount,
  budgetTypeOptions,
  dataIsLoading,
  departmentOptions,
  entityOptions,
  exportFormat,
  filters,
  natureOfWorkOptions,
  onClose,
  ownerOptions,
  setExportFormat,
  valueSlabOptions,
}: {
  activeFilterCount: number;
  budgetTypeOptions: ReportOption[];
  dataIsLoading: boolean;
  departmentOptions: ReportOption[];
  entityOptions: ReportOption[];
  exportFormat: "csv" | "xlsx";
  filters: ReturnType<typeof useReportFilters>;
  natureOfWorkOptions: ReportOption[];
  onClose: () => void;
  ownerOptions: ReportOption[];
  setExportFormat: (format: "csv" | "xlsx") => void;
  valueSlabOptions: ReportOption[];
}) {
  const selectedEntityIds = new Set(filters.selectedEntityIds);
  const filteredDepartmentOptions = selectedEntityIds.size
    ? departmentOptions.filter(
        (department) =>
          department.entityId == null || selectedEntityIds.has(department.entityId),
      )
    : departmentOptions;

  function setEntityIds(entityIds: string[]) {
    filters.setSelectedEntityIds(entityIds);
    if (!entityIds.length) return;
    const allowedEntityIds = new Set(entityIds);
    const allowedDepartmentIds = new Set(
      departmentOptions
        .filter(
          (department) =>
            department.entityId == null || allowedEntityIds.has(department.entityId),
        )
        .map((department) => department.value),
    );
    filters.setSelectedDepartmentIds(
      filters.selectedDepartmentIds.filter((id) => allowedDepartmentIds.has(id)),
    );
  }

  return (
    <section
      className="report-filter-panel"
      aria-label="RC/PO expiry filters"
    >
      <div className="report-filter-panel-header">
        <div>
          <p className="eyebrow">RC/PO Filters</p>
          <h2>Refine expiry data</h2>
        </div>
        <div className="report-filter-panel-summary">
          <Filter aria-hidden="true" size={18} />
          <span>{activeFilterCount} active</span>
        </div>
      </div>
      <div className="report-filter-panel-body">
        <section className="report-filter-matrix report-filter-matrix-compact">
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Entity"
            onChange={setEntityIds}
            options={entityOptions}
            value={filters.selectedEntityIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="User Department"
            onChange={filters.setSelectedDepartmentIds}
            options={filteredDepartmentOptions}
            value={filters.selectedDepartmentIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Tender Owner"
            onChange={filters.setSelectedOwnerUserIds}
            options={ownerOptions}
            value={filters.selectedOwnerUserIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Nature of Work"
            onChange={filters.setSelectedNatureOfWorkIds}
            options={natureOfWorkOptions}
            value={filters.selectedNatureOfWorkIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Budget Type"
            onChange={filters.setSelectedBudgetTypeIds}
            options={budgetTypeOptions}
            value={filters.selectedBudgetTypeIds}
          />
          <ReportMultiSelectFilter
            disabled={dataIsLoading}
            label="Value Slab"
            onChange={filters.setSelectedValueSlabs}
            options={valueSlabOptions}
            value={filters.selectedValueSlabs}
          />
          <FormField label="Horizon (Days)">
            <TextInput
              inputMode="numeric"
              max={730}
              min={0}
              onChange={(event) =>
                filters.setExpiryHorizonDays(event.target.value)
              }
              type="number"
              value={filters.expiryHorizonDays}
            />
          </FormField>
          <FormField label="Currency Unit">
            <div
              aria-label="Currency unit"
              className="segmented-control"
              role="group"
            >
              {([
                ["lakh", "Rs. Lakhs"],
                ["rupees", "Rupees"],
              ] as const).map(([unit, label]) => (
                <button
                  className={
                    filters.amountUnit === unit ? "segmented-control-active" : ""
                  }
                  key={unit}
                  onClick={() => filters.setAmountUnit(unit)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>
          <label className="report-inline-check report-deletion-flag">
            <input
              checked={filters.deletedOnly}
              onChange={(event) => filters.setDeletedOnly(event.target.checked)}
              type="checkbox"
            />
            <span>Show deleted cases only</span>
          </label>
          <label className="report-inline-check">
            <input
              checked={filters.includeExpiredContracts}
              onChange={(event) =>
                filters.setIncludeExpiredContracts(event.target.checked)
              }
              type="checkbox"
            />
            <span>Include already Expired Contracts</span>
          </label>
          <label className="report-inline-check">
            <input
              checked={filters.includeTenderFloatedOrNotRequired}
              onChange={(event) =>
                filters.setIncludeTenderFloatedOrNotRequired(
                  event.target.checked,
                )
              }
              type="checkbox"
            />
            <span>Include tender floated / not required</span>
          </label>
        </section>
        <div className="report-actions-row report-drawer-actions">
          <div
            aria-label="Export format"
            className="segmented-control"
            role="group"
          >
            {(["xlsx", "csv"] as const).map((format) => (
              <button
                className={
                  exportFormat === format ? "segmented-control-active" : ""
                }
                key={format}
                onClick={() => setExportFormat(format)}
                type="button"
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={filters.clearFilters}>
            <X size={18} />
            Clear
          </Button>
          <Button onClick={onClose}>Apply Filters</Button>
        </div>
      </div>
    </section>
  );
}

function ReportMultiSelectFilter({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string[]) => void;
  options: ReportOption[];
  value: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLabel = selectedReportFilterLabel(value, options);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) =>
        option.label.toLowerCase().includes(normalizedQuery),
      )
    : options;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <FormField label={label}>
      <div className="multi-select-dropdown report-filter-dropdown">
        <button
          aria-expanded={isOpen}
          className="multi-select-trigger"
          disabled={disabled}
          onBlur={(event) => {
            if (
              !event.currentTarget.parentElement?.contains(
                event.relatedTarget as Node | null,
              )
            ) {
              setIsOpen(false);
            }
          }}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <span>{selectedLabel}</span>
          <ChevronDown size={16} />
        </button>
        {isOpen ? (
          <div
            className="multi-select-menu report-filter-dropdown-menu"
            onBlur={(event) => {
              if (
                !event.currentTarget.parentElement?.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setIsOpen(false);
              }
            }}
          >
            <div className="multi-select-menu-actions">
              <button
                disabled={options.length === 0}
                onClick={() => onChange(options.map((option) => option.value))}
                type="button"
              >
                Select all
              </button>
              <button
                disabled={value.length === 0}
                onClick={() => onChange([])}
                type="button"
              >
                Clear
              </button>
              <span>{value.length ? `${value.length} selected` : "All"}</span>
            </div>
            {options.length > 6 ? (
              <TextInput
                autoFocus
                aria-label={`Search ${label}`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                value={query}
              />
            ) : null}
            <div className="multi-select-options">
              {visibleOptions.length ? (
                visibleOptions.map((option) => (
                  <Checkbox
                    checked={value.includes(option.value)}
                    key={option.value}
                    label={option.label}
                    onChange={(event) =>
                      onChange(
                        toggleReportFilterValue(
                          value,
                          option.value,
                          event.target.checked,
                        ),
                      )
                    }
                  />
                ))
              ) : (
                <span className="multi-select-empty">No options found.</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </FormField>
  );
}

function RcPoExpiryPagination({
  hasNextPage,
  isDisabled,
  onPageChange,
  onPageSizeChange,
  pageIndex,
  pageSize,
  rowCount,
}: {
  hasNextPage: boolean;
  isDisabled: boolean;
  onPageChange: (updater: (current: number) => number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageIndex: number;
  pageSize: number;
  rowCount: number;
}) {
  const rangeStart = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = pageIndex * pageSize + rowCount;

  return (
    <div className="pagination-bar table-pagination-bar">
      <span className="pagination-info">
        Showing {rangeStart} - {rangeEnd}
      </span>
      <label className="pagination-size-control">
        Rows
        <select
          aria-label="Rows per page"
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={pageSize}
        >
          {[25, 50].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <Button
        aria-label="Previous page"
        disabled={isDisabled || pageIndex === 0}
        onClick={() => onPageChange((current) => Math.max(0, current - 1))}
        size="sm"
        variant="secondary"
      >
        <ChevronLeft aria-hidden="true" size={15} />
        Previous
      </Button>
      <span className="pagination-page-pill">Page {pageIndex + 1}</span>
      <Button
        aria-label="Next page"
        disabled={isDisabled || !hasNextPage}
        onClick={() => onPageChange((current) => current + 1)}
        size="sm"
        variant="secondary"
      >
        Next
        <ChevronRight aria-hidden="true" size={15} />
      </Button>
    </div>
  );
}

function ReportTable<TRow>({
  columns,
  data,
  emptyMessage,
  error,
  getRowKey,
  isLoading,
  pagination = true,
}: {
  columns: VirtualTableColumn<TRow>[];
  data: TRow[] | undefined;
  emptyMessage: string;
  error: Error | null;
  getRowKey: (row: TRow) => string;
  isLoading: boolean;
  pagination?: boolean;
}) {
  const rows = data ?? [];

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
    <div className="report-table-suite">
      <VirtualTable
        columns={columns}
        emptyMessage={emptyMessage}
        getRowKey={getRowKey}
        maxHeight={520}
        pagination={pagination}
        rowHeight={48}
        rows={rows}
      />
    </div>
  );
}

function ReportBarChart({
  rows,
}: {
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) {
    return (
      <p className="hero-copy">No distribution data for the current filters.</p>
    );
  }
  return (
    <div className="report-bar-list">
      {rows.map((row) => (
        <div className="report-bar-row" key={row.label}>
          <span>{row.label}</span>
          <div className="report-bar-track">
            <div
              className="report-bar-fill"
              style={{
                width:
                  row.value === 0
                    ? "0%"
                    : `${Math.max(4, (row.value / max) * 100)}%`,
              }}
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
  includeCompletionFilters: boolean,
  includeTrackStatusFilter: boolean,
  isRcPoExpiry: boolean,
  useBusinessFilterSet: boolean,
): number {
  if (isRcPoExpiry) {
    return [
      filters.searchTerm,
      filters.deletedOnly ? "deleted" : "",
      filters.includeExpiredContracts ? "include-expired" : "",
      filters.includeTenderFloatedOrNotRequired ? "include-floated" : "",
      filters.amountUnit !== "lakh" ? filters.amountUnit : "",
      filters.expiryHorizonDays ? filters.expiryHorizonDays : "",
      ...filters.selectedEntityIds,
      ...filters.selectedDepartmentIds,
      ...filters.selectedOwnerUserIds,
      ...filters.selectedNatureOfWorkIds,
      ...filters.selectedBudgetTypeIds,
      ...filters.selectedValueSlabs,
    ].filter(Boolean).length;
  }
  return [
    filters.searchTerm,
    statusFilterApplies && filters.statusFilter !== "all"
      ? filters.statusFilter
      : "",
    includeTrackStatusFilter && filters.trackStatus !== "all" ? filters.trackStatus : "",
    filters.deletedOnly ? "deleted" : "",
    filters.loiAwarded !== "all" ? filters.loiAwarded : "",
    filters.cpcInvolved !== "any" ? filters.cpcInvolved : "",
    !useBusinessFilterSet && filters.priorityCase ? "priority" : "",
    ...filters.selectedEntityIds,
    ...filters.selectedDepartmentIds,
    ...filters.selectedOwnerUserIds,
    ...filters.selectedTenderTypeIds,
    ...filters.selectedNatureOfWorkIds,
    ...filters.selectedBudgetTypeIds,
    ...filters.selectedValueSlabs,
    ...(!useBusinessFilterSet ? filters.selectedStageCodes : []),
    ...(includeCompletionFilters ? filters.selectedCompletionFys : []),
    ...filters.selectedPrReceiptMonths,
    ...(includeCompletionFilters ? filters.selectedCompletionMonths : []),
  ].filter(Boolean).length;
}

function buildActiveReportFilterChips(
  filters: ReturnType<typeof useReportFilters>,
  options: {
    completionFyOptions: ReportOption[];
    completionMonthOptions: ReportOption[];
    departmentOptions: ReportOption[];
    entityOptions: ReportOption[];
    budgetTypeOptions: ReportOption[];
    includeCompletionFilters: boolean;
    includeTrackStatusFilter: boolean;
    isRcPoExpiry: boolean;
    useBusinessFilterSet: boolean;
    natureOfWorkOptions: ReportOption[];
    ownerOptions: ReportOption[];
    prReceiptMonthOptions: ReportOption[];
    stageOptions: ReportOption[];
    statusFilterApplies: boolean;
    tenderTypeOptions: ReportOption[];
    valueSlabOptions: ReportOption[];
  },
): string[] {
  if (options.isRcPoExpiry) {
    return [
      filters.searchTerm ? `Search: ${filters.searchTerm}` : "",
      filters.deletedOnly ? "Deletion Flag: deleted only" : "",
      filters.includeExpiredContracts ? "Include expired contracts" : "",
      filters.includeTenderFloatedOrNotRequired
        ? "Includes floated/not-required"
        : "",
      filters.amountUnit !== "lakh"
        ? `Currency: ${amountUnitLabel(filters.amountUnit)}`
        : "",
      filters.expiryHorizonDays
        ? `Horizon: ${filters.expiryHorizonDays} days`
        : "",
      ...labelsForSelection(
        "Entity",
        filters.selectedEntityIds,
        options.entityOptions,
      ),
      ...labelsForSelection(
        "Department",
        filters.selectedDepartmentIds,
        options.departmentOptions,
      ),
      ...labelsForSelection(
        "Owner",
        filters.selectedOwnerUserIds,
        options.ownerOptions,
      ),
      ...labelsForSelection(
        "Nature",
        filters.selectedNatureOfWorkIds,
        options.natureOfWorkOptions,
      ),
      ...labelsForSelection(
        "Budget",
        filters.selectedBudgetTypeIds,
        options.budgetTypeOptions,
      ),
      ...labelsForSelection(
        "Value",
        filters.selectedValueSlabs,
        options.valueSlabOptions,
      ),
    ].filter(Boolean);
  }
  return [
    filters.searchTerm ? `Search: ${filters.searchTerm}` : "",
    options.statusFilterApplies && filters.statusFilter !== "all"
      ? `Status: ${filters.statusFilter}`
      : "",
    options.includeTrackStatusFilter && filters.trackStatus !== "all"
      ? `Delay Indicator: ${trackStatusLabel(filters.trackStatus)}`
      : "",
    filters.deletedOnly ? "Deletion Flag: deleted only" : "",
    filters.loiAwarded !== "all"
      ? `LOI: ${filters.loiAwarded === "true" ? "Yes" : "No"}`
      : "",
    filters.cpcInvolved !== "any"
      ? `CPC: ${filters.cpcInvolved === "true" ? "Yes" : "No"}`
      : "",
    !options.useBusinessFilterSet && filters.priorityCase ? "Priority cases" : "",
    ...labelsForSelection(
      "Entity",
      filters.selectedEntityIds,
      options.entityOptions,
    ),
    ...labelsForSelection(
      "Department",
      filters.selectedDepartmentIds,
      options.departmentOptions,
    ),
    ...labelsForSelection(
      "Owner",
      filters.selectedOwnerUserIds,
      options.ownerOptions,
    ),
    ...labelsForSelection(
      "Type",
      filters.selectedTenderTypeIds,
      options.tenderTypeOptions,
    ),
    ...labelsForSelection(
      "Nature",
      filters.selectedNatureOfWorkIds,
      options.natureOfWorkOptions,
    ),
    ...labelsForSelection(
      "Budget",
      filters.selectedBudgetTypeIds,
      options.budgetTypeOptions,
    ),
    ...labelsForSelection(
      "Value",
      filters.selectedValueSlabs,
      options.valueSlabOptions,
    ),
    ...(!options.useBusinessFilterSet
      ? labelsForSelection(
          "Stage",
          filters.selectedStageCodes,
          options.stageOptions,
        )
      : []),
    ...(options.includeCompletionFilters
      ? labelsForSelection(
          "FY",
          filters.selectedCompletionFys,
          options.completionFyOptions,
        )
      : []),
    ...labelsForSelection(
      "PR Month",
      filters.selectedPrReceiptMonths,
      options.prReceiptMonthOptions,
    ),
    ...(options.includeCompletionFilters
      ? labelsForSelection(
          "Completion",
          filters.selectedCompletionMonths,
          options.completionMonthOptions,
        )
      : []),
  ].filter(Boolean);
}

function labelsForSelection(
  prefix: string,
  values: string[],
  options: ReportOption[],
): string[] {
  const byValue = new Map(
    options.map((option) => [option.value, option.label]),
  );
  return values.map((value) => `${prefix}: ${byValue.get(value) ?? value}`);
}

function uniqueReportFilterOptions<TRow>(
  rows: TRow[],
  getValue: (row: TRow) => string,
): ReportOption[] {
  return [...new Set(rows.map((row) => getValue(row)).filter(Boolean))]
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )
    .map((value) => ({ label: value, value }));
}

function reportFilterOptions(values: string[]): ReportOption[] {
  return values.map((value) => ({ label: value, value }));
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function exportStatusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed" || status === "expired") return "danger" as const;
  if (status === "running" || status === "queued") return "warning" as const;
  return "neutral" as const;
}
