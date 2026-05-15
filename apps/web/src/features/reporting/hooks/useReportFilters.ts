import { useMemo, useState } from "react";

import type { ReportCode, ReportQueryParams } from "../api/reportingApi";
import {
  buildReportFilterPayload,
  buildReportParams,
  type AmountUnit,
  type ReportStatusFilter,
} from "../utils/reportUtils";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";

export type ReportFiltersState = {
  amountUnit: AmountUnit;
  analyticsParams: ReportQueryParams;
  cpcInvolved: "any" | "false" | "true";
  delayStatus: "all" | "delayed" | "on_time";
  deletedOnly: boolean;
  exportFilters: Record<string, unknown>;
  expiryHorizonDays: string;
  includeTenderFloatedOrNotRequired: boolean;
  loiAwarded: "all" | "false" | "true";
  priorityCase: boolean;
  reportParams: ReportQueryParams;
  savedViewFilters: Record<string, unknown>;
  searchTerm: string;
  selectedBudgetTypeIds: string[];
  selectedCompletionFys: string[];
  selectedCompletionMonths: string[];
  selectedDepartmentIds: string[];
  selectedEntityIds: string[];
  selectedNatureOfWorkIds: string[];
  selectedOwnerUserIds: string[];
  selectedPrReceiptMonths: string[];
  selectedStageCodes: string[];
  selectedTenderTypeIds: string[];
  selectedValueSlabs: string[];
  statusFilter: ReportStatusFilter;
  setAmountUnit: (v: AmountUnit) => void;
  setCpcInvolved: (v: "any" | "false" | "true") => void;
  setDelayStatus: (v: "all" | "delayed" | "on_time") => void;
  setDeletedOnly: (v: boolean) => void;
  setExpiryHorizonDays: (v: string) => void;
  setIncludeTenderFloatedOrNotRequired: (v: boolean) => void;
  setLoiAwarded: (v: "all" | "false" | "true") => void;
  setPriorityCase: (v: boolean) => void;
  setSearchTerm: (v: string) => void;
  setSelectedBudgetTypeIds: (v: string[]) => void;
  setSelectedCompletionFys: (v: string[]) => void;
  setSelectedCompletionMonths: (v: string[]) => void;
  setSelectedDepartmentIds: (v: string[]) => void;
  setSelectedEntityIds: (v: string[]) => void;
  setSelectedNatureOfWorkIds: (v: string[]) => void;
  setSelectedOwnerUserIds: (v: string[]) => void;
  setSelectedPrReceiptMonths: (v: string[]) => void;
  setSelectedStageCodes: (v: string[]) => void;
  setSelectedTenderTypeIds: (v: string[]) => void;
  setSelectedValueSlabs: (v: string[]) => void;
  setStatusFilter: (v: ReportStatusFilter) => void;
  clearFilters: () => void;
};

export function useReportFilters(reportCode: ReportCode): ReportFiltersState {
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("lakh");
  const [cpcInvolved, setCpcInvolved] = useState<"any" | "false" | "true">("any");
  const [delayStatus, setDelayStatus] = useState<"all" | "delayed" | "on_time">("all");
  const [deletedOnly, setDeletedOnly] = useState(false);
  const [expiryHorizonDays, setExpiryHorizonDays] = useState("365");
  const [includeTenderFloatedOrNotRequired, setIncludeTenderFloatedOrNotRequired] = useState(false);
  const [loiAwarded, setLoiAwarded] = useState<"all" | "false" | "true">("all");
  const [priorityCase, setPriorityCase] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBudgetTypeIds, setSelectedBudgetTypeIds] = useState<string[]>([]);
  const [selectedCompletionFys, setSelectedCompletionFys] = useState<string[]>([]);
  const [selectedCompletionMonths, setSelectedCompletionMonths] = useState<string[]>([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedNatureOfWorkIds, setSelectedNatureOfWorkIds] = useState<string[]>([]);
  const [selectedOwnerUserIds, setSelectedOwnerUserIds] = useState<string[]>([]);
  const [selectedPrReceiptMonths, setSelectedPrReceiptMonths] = useState<string[]>([]);
  const [selectedStageCodes, setSelectedStageCodes] = useState<string[]>([]);
  const [selectedTenderTypeIds, setSelectedTenderTypeIds] = useState<string[]>([]);
  const [selectedValueSlabs, setSelectedValueSlabs] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);

  const includeStatus = reportCode === "tender_details" || reportCode === "stage_time";
  const includeCompletionFilters = reportCode !== "running" && reportCode !== "rc_po_expiry";
  const isRcPoExpiry = reportCode === "rc_po_expiry";
  const includeCaseWorkflowFilters = !isRcPoExpiry;
  const expiryHorizonDaysParam = isRcPoExpiry
    ? normalizeExpiryHorizonDays(expiryHorizonDays)
    : undefined;

  const filterBase = useMemo(
    () => ({
      completionFys: includeCompletionFilters ? selectedCompletionFys : [],
      completionMonths: includeCompletionFilters ? selectedCompletionMonths : [],
      cpcInvolved:
        includeCaseWorkflowFilters && cpcInvolved !== "any"
          ? cpcInvolved === "true"
          : undefined,
      delayStatus:
        includeCaseWorkflowFilters && delayStatus !== "all"
          ? delayStatus
          : undefined,
      deletedOnly: deletedOnly ? true : undefined,
      departmentIds: selectedDepartmentIds,
      days: expiryHorizonDaysParam,
      entityIds: selectedEntityIds,
      includeTenderFloatedOrNotRequired:
        isRcPoExpiry && includeTenderFloatedOrNotRequired ? true : undefined,
      includeStatus,
      loiAwarded:
        includeCaseWorkflowFilters && loiAwarded !== "all"
          ? loiAwarded === "true"
          : undefined,
      natureOfWorkIds: selectedNatureOfWorkIds,
      ownerUserIds: selectedOwnerUserIds,
      prReceiptMonths: includeCaseWorkflowFilters ? selectedPrReceiptMonths : [],
      priorityCase: includeCaseWorkflowFilters && priorityCase ? true : undefined,
      budgetTypeIds: selectedBudgetTypeIds,
      stageCodes: includeCaseWorkflowFilters ? selectedStageCodes : [],
      status: statusFilter,
      tenderTypeIds: includeCaseWorkflowFilters ? selectedTenderTypeIds : [],
      valueSlabs: selectedValueSlabs,
    }),
    [
      cpcInvolved,
      delayStatus,
      deletedOnly,
      expiryHorizonDaysParam,
      includeTenderFloatedOrNotRequired,
      includeCaseWorkflowFilters,
      isRcPoExpiry,
      loiAwarded,
      priorityCase,
      includeStatus,
      includeCompletionFilters,
      selectedBudgetTypeIds,
      selectedCompletionFys,
      selectedCompletionMonths,
      selectedDepartmentIds,
      selectedEntityIds,
      selectedNatureOfWorkIds,
      selectedOwnerUserIds,
      selectedPrReceiptMonths,
      selectedStageCodes,
      selectedTenderTypeIds,
      selectedValueSlabs,
      statusFilter,
    ],
  );

  const reportParams = useMemo(
    () => buildReportParams({ ...filterBase, limit: 25, q: debouncedSearchTerm }),
    [debouncedSearchTerm, filterBase],
  );

  const analyticsParams = useMemo(
    () => buildReportParams({ ...filterBase, q: debouncedSearchTerm }),
    [debouncedSearchTerm, filterBase],
  );

  const exportFilters = useMemo(
    () => buildReportFilterPayload({ ...filterBase, amountUnit, q: searchTerm }),
    [amountUnit, filterBase, searchTerm],
  );

  const savedViewFilters = useMemo(
    () => buildReportFilterPayload({ ...filterBase, amountUnit, q: searchTerm }),
    [amountUnit, filterBase, searchTerm],
  );

  function clearFilters() {
    setSearchTerm("");
    setAmountUnit("lakh");
    setExpiryHorizonDays("365");
    setIncludeTenderFloatedOrNotRequired(false);
    setSelectedEntityIds([]);
    setSelectedOwnerUserIds([]);
    setSelectedTenderTypeIds([]);
    setSelectedBudgetTypeIds([]);
    setSelectedDepartmentIds([]);
    setSelectedNatureOfWorkIds([]);
    setSelectedValueSlabs([]);
    setCpcInvolved("any");
    setLoiAwarded("all");
    setDelayStatus("all");
    setDeletedOnly(false);
    setPriorityCase(false);
    setSelectedStageCodes([]);
    setSelectedCompletionFys([]);
    setSelectedPrReceiptMonths([]);
    setSelectedCompletionMonths([]);
    setStatusFilter("all");
  }

  return {
    amountUnit,
    analyticsParams,
    cpcInvolved,
    delayStatus,
    deletedOnly,
    exportFilters,
    expiryHorizonDays,
    includeTenderFloatedOrNotRequired,
    loiAwarded,
    priorityCase,
    reportParams,
    savedViewFilters,
    searchTerm,
    selectedBudgetTypeIds,
    selectedCompletionFys,
    selectedCompletionMonths,
    selectedDepartmentIds,
    selectedEntityIds,
    selectedNatureOfWorkIds,
    selectedOwnerUserIds,
    selectedPrReceiptMonths,
    selectedStageCodes,
    selectedTenderTypeIds,
    selectedValueSlabs,
    statusFilter,
    setAmountUnit,
    setCpcInvolved,
    setDelayStatus,
    setDeletedOnly,
    setExpiryHorizonDays,
    setIncludeTenderFloatedOrNotRequired,
    setLoiAwarded,
    setPriorityCase,
    setSearchTerm,
    setSelectedBudgetTypeIds,
    setSelectedCompletionFys,
    setSelectedCompletionMonths,
    setSelectedDepartmentIds,
    setSelectedEntityIds,
    setSelectedNatureOfWorkIds,
    setSelectedOwnerUserIds,
    setSelectedPrReceiptMonths,
    setSelectedStageCodes,
    setSelectedTenderTypeIds,
    setSelectedValueSlabs,
    setStatusFilter,
    clearFilters,
  };
}

function normalizeExpiryHorizonDays(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 730);
}
