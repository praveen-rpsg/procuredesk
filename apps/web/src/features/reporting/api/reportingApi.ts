import { apiBaseUrl, apiRequest } from "../../../shared/api/client";

export type ReportCode =
  | "completed"
  | "rc_po_expiry"
  | "running"
  | "stage_time"
  | "tender_details"
  | "vendor_awards";

export type ExportFormat = "csv" | "xlsx";

export type ReportQueryParams = {
  completionFys?: string[];
  completionMonths?: string[];
  dateFrom?: string;
  dateTo?: string;
  entityIds?: string[];
  limit?: number;
  ownerUserIds?: string[];
  prReceiptMonths?: string[];
  q?: string;
  stageCodes?: number[];
  status?: "completed" | "running";
  tenderTypeIds?: string[];
};

export type ReportingAnalytics = {
  averageBiddersParticipated: number | null;
  averageQualifiedBidders: number | null;
  bidderCaseCount: number;
  byEntity: Array<{
    caseCount: number;
    delayedCount: number;
    entityCode: string | null;
    entityId: string;
    entityName: string | null;
    totalAwardedAmount: number;
  }>;
  byTenderType: Array<{
    caseCount: number;
    delayedCount: number;
    tenderTypeId: string | null;
    tenderTypeName: string;
    totalAwardedAmount: number;
  }>;
  completedCases: number;
  delayedCases: number;
  runningCases: number;
  savingsWrtPr: number;
  totalAwardedAmount: number;
  totalCases: number;
};

export type ReportFilterMetadata = {
  completionFys: string[];
  completionMonths: string[];
  entities: Array<{
    code: string | null;
    id: string;
    name: string | null;
  }>;
  entityIds: string[];
  owners: Array<{
    fullName: string | null;
    id: string;
    username: string | null;
  }>;
  prReceiptMonths: string[];
  stages: number[];
  statuses: string[];
  tenderTypes: Array<{
    id: string;
    name: string;
  }>;
};

export type ReportCaseRow = {
  caseId: string;
  entityId: string;
  isDelayed: boolean;
  prId: string;
  prReceiptDate: string | null;
  rcPoAwardDate: string | null;
  stageCode: number;
  status: string;
  tenderName: string | null;
  totalAwardedAmount: number | null;
};

export type VendorAwardReportRow = {
  awardId: string;
  caseId: string;
  entityId: string;
  poAwardDate: string | null;
  poNumber: string | null;
  poValue: number | null;
  poValidityDate: string | null;
  prId: string;
  tenderName: string | null;
  vendorName: string;
};

export type StageTimeRow = {
  averageRunningAgeDays: number | null;
  caseCount: number;
  stageCode: number;
};

export type ContractExpiryReportRow = {
  awardedVendors: string | null;
  daysToExpiry: number;
  entityId: string;
  rcPoAmount: number | null;
  rcPoValidityDate: string;
  sourceId: string;
  sourceType: "case_award" | "manual_plan";
  tenderDescription: string | null;
  tenderFloatedOrNotRequired: boolean;
};

export type SavedReportView = {
  columns: unknown[];
  filters: Record<string, unknown>;
  id: string;
  isDefault: boolean;
  name: string;
  reportCode: ReportCode;
};

export type ExportJobStatus = {
  completedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  fileAssetId: string | null;
  format: ExportFormat;
  id: string;
  progressMessage: string | null;
  progressPercent: number;
  reportCode: ReportCode;
  status: string;
};

export function refreshReportProjections() {
  return apiRequest<{ refreshed: boolean }>("/reports/projections/refresh", { method: "POST" });
}

export function getReportingAnalytics(params: ReportQueryParams = {}) {
  return apiRequest<ReportingAnalytics>(`/reports/analytics${buildReportQuery(params)}`);
}

export function getReportFilterMetadata() {
  return apiRequest<ReportFilterMetadata>("/reports/filter-metadata");
}

export function listTenderDetails(params: ReportQueryParams = {}) {
  return apiRequest<ReportCaseRow[]>(`/reports/tender-details${buildReportQuery(params)}`);
}

export function listRunningReport(params: ReportQueryParams = {}) {
  return apiRequest<ReportCaseRow[]>(`/reports/running${buildReportQuery(params)}`);
}

export function listCompletedReport(params: ReportQueryParams = {}) {
  return apiRequest<ReportCaseRow[]>(`/reports/completed${buildReportQuery(params)}`);
}

export function listVendorAwardsReport(params: ReportQueryParams = {}) {
  return apiRequest<VendorAwardReportRow[]>(`/reports/vendor-awards${buildReportQuery(params)}`);
}

export function listStageTimeReport(params: ReportQueryParams = {}) {
  return apiRequest<StageTimeRow[]>(`/reports/stage-time${buildReportQuery(params)}`);
}

export function listRcPoExpiryReport(params: ReportQueryParams = {}) {
  return apiRequest<ContractExpiryReportRow[]>(`/reports/rc-po-expiry${buildReportQuery(params)}`);
}

export function listSavedViews(params: { reportCode?: ReportCode } = {}) {
  const search = new URLSearchParams();
  if (params.reportCode) search.set("reportCode", params.reportCode);
  const query = search.toString();
  return apiRequest<SavedReportView[]>(`/reports/saved-views${query ? `?${query}` : ""}`);
}

export function createSavedView(payload: {
  columns?: unknown[];
  filters?: Record<string, unknown>;
  isDefault?: boolean;
  name: string;
  reportCode: ReportCode;
}) {
  return apiRequest<{ id: string }>("/reports/saved-views", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function createExportJob(payload: {
  filters?: Record<string, unknown>;
  format: ExportFormat;
  reportCode: ReportCode;
}) {
  return apiRequest<{ id: string }>("/reports/export-jobs", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function getExportJob(jobId: string) {
  return apiRequest<ExportJobStatus>(`/reports/export-jobs/${jobId}`);
}

export function getExportDownloadUrl(jobId: string) {
  return `${apiBaseUrl}/reports/export-jobs/${jobId}/download`;
}

function buildReportQuery(params: ReportQueryParams) {
  const search = new URLSearchParams();
  setCsvParam(search, "completionFys", params.completionFys);
  setCsvParam(search, "completionMonths", params.completionMonths);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  setCsvParam(search, "entityIds", params.entityIds);
  if (params.limit != null) search.set("limit", String(params.limit));
  setCsvParam(search, "ownerUserIds", params.ownerUserIds);
  setCsvParam(search, "prReceiptMonths", params.prReceiptMonths);
  if (params.q) search.set("q", params.q);
  setCsvParam(search, "stageCodes", params.stageCodes?.map(String));
  if (params.status) search.set("status", params.status);
  setCsvParam(search, "tenderTypeIds", params.tenderTypeIds);
  const query = search.toString();
  return query ? `?${query}` : "";
}

function setCsvParam(search: URLSearchParams, key: string, values: string[] | undefined) {
  if (values?.length) search.set(key, values.join(","));
}
