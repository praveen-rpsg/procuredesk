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
  budgetTypeIds?: string[];
  completionFys?: string[];
  completionMonths?: string[];
  cpcInvolved?: boolean;
  delayStatus?: "delayed" | "on_time";
  deletedOnly?: boolean;
  departmentIds?: string[];
  days?: number;
  entityIds?: string[];
  includeTenderFloatedOrNotRequired?: boolean;
  limit?: number;
  loiAwarded?: boolean;
  natureOfWorkIds?: string[];
  ownerUserIds?: string[];
  prReceiptMonths?: string[];
  priorityCase?: boolean;
  q?: string;
  stageCodes?: number[];
  status?: "completed" | "running";
  tenderTypeIds?: string[];
  trackStatus?: "delayed" | "off_track" | "on_track";
  valueSlabs?: string[];
};

export type ReportingAnalytics = {
  averageBiddersParticipated: number | null;
  averageCycleTimeDays: number | null;
  averageQualifiedBidders: number | null;
  bidderCaseCount: number;
  byDepartmentNatureOfWork: Array<{
    caseCount: number;
    departmentId: string | null;
    departmentName: string;
    natureOfWorkId: string | null;
    natureOfWorkName: string;
  }>;
  byEntity: Array<{
    caseCount: number;
    delayedCount: number;
    offTrackCount: number;
    entityCode: string | null;
    entityId: string;
    entityName: string | null;
    totalAwardedAmount: number;
    totalPrValue: number;
  }>;
  byTenderType: Array<{
    caseCount: number;
    delayedCount: number;
    offTrackCount: number;
    tenderTypeId: string | null;
    tenderTypeName: string;
    totalAwardedAmount: number;
  }>;
  completedCases: number;
  delayedCases: number;
  offTrackCases: number;
  onTrackCases: number;
  runningCases: number;
  savingsWrtEstimate: number;
  savingsWrtPr: number;
  totalApprovedAmount: number;
  totalAwardedAmount: number;
  totalCases: number;
  totalEstimateBenchmark: number;
  totalPrValue: number;
};

export type ReportFilterMetadata = {
  budgetTypes: Array<{ id: string; name: string }>;
  completionFys: string[];
  completionMonths: string[];
  departments: Array<{ entityId?: string | null; id: string; name: string }>;
  entities: Array<{
    code: string | null;
    id: string;
    name: string | null;
  }>;
  entityIds: string[];
  natureOfWorks: Array<{ id: string; name: string }>;
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
  valueSlabs: string[];
  rcPoExpiry?: {
    budgetTypes: Array<{ id: string; name: string }>;
    departments: Array<{ entityId?: string | null; id: string; name: string }>;
    entities: Array<{
      code: string | null;
      id: string;
      name: string | null;
    }>;
    natureOfWorks: Array<{ id: string; name: string }>;
    owners: Array<{
      fullName: string | null;
      id: string;
      username: string | null;
    }>;
    valueSlabs: string[];
  };
};

export type ReportCaseRow = {
  approvedAmount: number | null;
  biddersParticipated: number | null;
  caseId: string;
  completedCycleTimeDays: number | null;
  completionFy: string | null;
  currentStageAgingDays: number | null;
  delayReason: string | null;
  departmentName: string | null;
  desiredStageCode: number | null;
  entityCode: string | null;
  entityId: string;
  entityName: string | null;
  estimateBenchmark: number | null;
  isDelayed: boolean;
  loiAwardDate: string | null;
  loiAwarded: boolean;
  nitPublishDate: string | null;
  ownerFullName: string | null;
  percentTimeElapsed: number | null;
  prId: string;
  prDescription: string | null;
  prReceiptDate: string | null;
  prRemarks: string | null;
  prValue: number | null;
  qualifiedBidders: number | null;
  rcPoAwardDate: string | null;
  runningAgeDays: number | null;
  savingsWrtEstimate: number | null;
  savingsWrtPr: number | null;
  stageCode: number;
  status: string;
  tenderName: string | null;
  tenderNo: string | null;
  tenderTypeName: string | null;
  tmRemarks: string | null;
  totalAwardedAmount: number | null;
  uncontrollableDelayDays: number | null;
};

export type VendorAwardReportRow = {
  approvedAmount: number | null;
  awardId: string;
  caseId: string;
  departmentName: string | null;
  entityCode: string | null;
  entityId: string;
  entityName: string | null;
  ownerFullName: string | null;
  poAwardDate: string | null;
  poNumber: string | null;
  poValue: number | null;
  poValidityDate: string | null;
  prId: string;
  tenderNo: string | null;
  tenderName: string | null;
  vendorCode: string | null;
  vendorName: string;
};

export type StageTimeRow = {
  bidEvaluationTimeDays: number | null;
  bidReceiptTimeDays: number | null;
  caseId: string;
  contractIssuanceTimeDays: number | null;
  currentStageAgingDays: number | null;
  cycleTimeDays: number | null;
  entityCode: string | null;
  entityId: string;
  entityName: string | null;
  loiAwarded: boolean;
  negotiationNfaSubmissionTimeDays: number | null;
  nfaApprovalTimeDays: number | null;
  nitPublishTimeDays: number | null;
  ownerFullName: string | null;
  prId: string;
  prReviewTimeDays: number | null;
  priorityCase: boolean;
  runningAgeDays: number | null;
  stageCode: number;
  tenderName: string | null;
  tenderNo: string | null;
  tenderTypeName: string | null;
};

export type ContractExpiryReportRow = {
  awardedVendors: string | null;
  budgetTypeId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  daysToExpiry: number;
  entityCode: string | null;
  entityId: string;
  entityName: string | null;
  ownerFullName: string | null;
  ownerUserId: string | null;
  natureOfWorkId: string | null;
  rcPoAwardDate: string | null;
  rcPoAmount: number | null;
  rcPoValidityDate: string;
  sourceCaseId: string | null;
  sourceId: string;
  sourceType: "case_award" | "manual_plan";
  tenderDescription: string | null;
  tenderFloatedOrNotRequired: boolean;
  tentativeTenderingDate: string | null;
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

export type ExportJobListItem = ExportJobStatus;

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

export function updateRcPoExpiryReportRow(
  sourceType: ContractExpiryReportRow["sourceType"],
  sourceId: string,
  payload: {
    tenderFloatedOrNotRequired?: boolean | undefined;
    tentativeTenderingDate?: string | null | undefined;
  },
) {
  return apiRequest<ContractExpiryReportRow>(`/reports/rc-po-expiry/${sourceType}/${sourceId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteRcPoExpiryReportRow(
  sourceType: ContractExpiryReportRow["sourceType"],
  sourceId: string,
) {
  return apiRequest<{ deleted: boolean }>(`/reports/rc-po-expiry/${sourceType}/${sourceId}`, {
    method: "DELETE",
  });
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

export function listExportJobs() {
  return apiRequest<ExportJobListItem[]>("/reports/export-jobs");
}

export function getExportDownloadUrl(jobId: string) {
  return `${apiBaseUrl}/reports/export-jobs/${jobId}/download`;
}

function buildReportQuery(params: ReportQueryParams) {
  const search = new URLSearchParams();
  setCsvParam(search, "budgetTypeIds", params.budgetTypeIds);
  setCsvParam(search, "completionFys", params.completionFys);
  setCsvParam(search, "completionMonths", params.completionMonths);
  setBooleanParam(search, "cpcInvolved", params.cpcInvolved);
  if (params.delayStatus) search.set("delayStatus", params.delayStatus);
  setBooleanParam(search, "deletedOnly", params.deletedOnly);
  setCsvParam(search, "departmentIds", params.departmentIds);
  if (params.days != null) search.set("days", String(params.days));
  setCsvParam(search, "entityIds", params.entityIds);
  setBooleanParam(
    search,
    "includeTenderFloatedOrNotRequired",
    params.includeTenderFloatedOrNotRequired,
  );
  if (params.limit != null) search.set("limit", String(params.limit));
  setBooleanParam(search, "loiAwarded", params.loiAwarded);
  setCsvParam(search, "natureOfWorkIds", params.natureOfWorkIds);
  setCsvParam(search, "ownerUserIds", params.ownerUserIds);
  setCsvParam(search, "prReceiptMonths", params.prReceiptMonths);
  setBooleanParam(search, "priorityCase", params.priorityCase);
  if (params.q) search.set("q", params.q);
  setCsvParam(search, "stageCodes", params.stageCodes?.map(String));
  if (params.status) search.set("status", params.status);
  setCsvParam(search, "tenderTypeIds", params.tenderTypeIds);
  if (params.trackStatus) search.set("trackStatus", params.trackStatus);
  setCsvParam(search, "valueSlabs", params.valueSlabs);
  const query = search.toString();
  return query ? `?${query}` : "";
}

function setCsvParam(search: URLSearchParams, key: string, values: string[] | undefined) {
  if (values?.length) search.set(key, values.join(","));
}

function setBooleanParam(search: URLSearchParams, key: string, value: boolean | undefined) {
  if (value !== undefined) search.set(key, String(value));
}
