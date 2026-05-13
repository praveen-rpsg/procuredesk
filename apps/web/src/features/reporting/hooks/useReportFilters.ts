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
  dateFrom: string;
  dateTo: string;
  delayStatus: "all" | "delayed" | "on_time";
  deletedOnly: boolean;
  exportFilters: Record<string, unknown>;
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
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setDelayStatus: (v: "all" | "delayed" | "on_time") => void;
  setDeletedOnly: (v: boolean) => void;
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [delayStatus, setDelayStatus] = useState<"all" | "delayed" | "on_time">("all");
  const [deletedOnly, setDeletedOnly] = useState(false);
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
  const includeCompletionFilters = reportCode !== "running";

  const filterBase = useMemo(
    () => ({
      completionFys: includeCompletionFilters ? selectedCompletionFys : [],
      completionMonths: includeCompletionFilters ? selectedCompletionMonths : [],
      cpcInvolved: cpcInvolved === "any" ? undefined : cpcInvolved === "true",
      dateFrom,
      dateTo,
      delayStatus: delayStatus === "all" ? undefined : delayStatus,
      deletedOnly: deletedOnly ? true : undefined,
      departmentIds: selectedDepartmentIds,
      entityIds: selectedEntityIds,
      includeStatus,
      loiAwarded: loiAwarded === "all" ? undefined : loiAwarded === "true",
      natureOfWorkIds: selectedNatureOfWorkIds,
      ownerUserIds: selectedOwnerUserIds,
      prReceiptMonths: selectedPrReceiptMonths,
      priorityCase: priorityCase ? true : undefined,
      budgetTypeIds: selectedBudgetTypeIds,
      stageCodes: selectedStageCodes,
      status: statusFilter,
      tenderTypeIds: selectedTenderTypeIds,
      valueSlabs: selectedValueSlabs,
    }),
    [
      cpcInvolved,
      dateFrom,
      dateTo,
      delayStatus,
      deletedOnly,
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
    () => buildReportFilterPayload({ ...filterBase, amountUnit: null, q: searchTerm }),
    [filterBase, searchTerm],
  );

  const savedViewFilters = useMemo(
    () => buildReportFilterPayload({ ...filterBase, amountUnit, q: searchTerm }),
    [amountUnit, filterBase, searchTerm],
  );

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setSearchTerm("");
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
    dateFrom,
    dateTo,
    delayStatus,
    deletedOnly,
    exportFilters,
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
    setDateFrom,
    setDateTo,
    setDelayStatus,
    setDeletedOnly,
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
