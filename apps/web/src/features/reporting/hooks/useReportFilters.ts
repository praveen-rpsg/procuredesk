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
  dateFrom: string;
  dateTo: string;
  exportFilters: Record<string, unknown>;
  reportParams: ReportQueryParams;
  savedViewFilters: Record<string, unknown>;
  searchTerm: string;
  selectedCompletionFys: string[];
  selectedCompletionMonths: string[];
  selectedEntityIds: string[];
  selectedOwnerUserIds: string[];
  selectedPrReceiptMonths: string[];
  selectedStageCodes: string[];
  selectedTenderTypeIds: string[];
  statusFilter: ReportStatusFilter;
  setAmountUnit: (v: AmountUnit) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setSearchTerm: (v: string) => void;
  setSelectedCompletionFys: (v: string[]) => void;
  setSelectedCompletionMonths: (v: string[]) => void;
  setSelectedEntityIds: (v: string[]) => void;
  setSelectedOwnerUserIds: (v: string[]) => void;
  setSelectedPrReceiptMonths: (v: string[]) => void;
  setSelectedStageCodes: (v: string[]) => void;
  setSelectedTenderTypeIds: (v: string[]) => void;
  setStatusFilter: (v: ReportStatusFilter) => void;
  clearFilters: () => void;
};

export function useReportFilters(reportCode: ReportCode): ReportFiltersState {
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("crore");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompletionFys, setSelectedCompletionFys] = useState<string[]>([]);
  const [selectedCompletionMonths, setSelectedCompletionMonths] = useState<string[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedOwnerUserIds, setSelectedOwnerUserIds] = useState<string[]>([]);
  const [selectedPrReceiptMonths, setSelectedPrReceiptMonths] = useState<string[]>([]);
  const [selectedStageCodes, setSelectedStageCodes] = useState<string[]>([]);
  const [selectedTenderTypeIds, setSelectedTenderTypeIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);

  const includeStatus = reportCode === "tender_details" || reportCode === "stage_time";

  const filterBase = useMemo(
    () => ({
      completionFys: selectedCompletionFys,
      completionMonths: selectedCompletionMonths,
      dateFrom,
      dateTo,
      entityIds: selectedEntityIds,
      includeStatus,
      ownerUserIds: selectedOwnerUserIds,
      prReceiptMonths: selectedPrReceiptMonths,
      stageCodes: selectedStageCodes,
      status: statusFilter,
      tenderTypeIds: selectedTenderTypeIds,
    }),
    [
      dateFrom,
      dateTo,
      includeStatus,
      selectedCompletionFys,
      selectedCompletionMonths,
      selectedEntityIds,
      selectedOwnerUserIds,
      selectedPrReceiptMonths,
      selectedStageCodes,
      selectedTenderTypeIds,
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
    setSelectedStageCodes([]);
    setSelectedCompletionFys([]);
    setSelectedPrReceiptMonths([]);
    setSelectedCompletionMonths([]);
    setStatusFilter("all");
  }

  return {
    amountUnit,
    analyticsParams,
    dateFrom,
    dateTo,
    exportFilters,
    reportParams,
    savedViewFilters,
    searchTerm,
    selectedCompletionFys,
    selectedCompletionMonths,
    selectedEntityIds,
    selectedOwnerUserIds,
    selectedPrReceiptMonths,
    selectedStageCodes,
    selectedTenderTypeIds,
    statusFilter,
    setAmountUnit,
    setDateFrom,
    setDateTo,
    setSearchTerm,
    setSelectedCompletionFys,
    setSelectedCompletionMonths,
    setSelectedEntityIds,
    setSelectedOwnerUserIds,
    setSelectedPrReceiptMonths,
    setSelectedStageCodes,
    setSelectedTenderTypeIds,
    setStatusFilter,
    clearFilters,
  };
}
