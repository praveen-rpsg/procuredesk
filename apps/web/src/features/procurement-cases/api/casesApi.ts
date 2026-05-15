import { apiRequest } from "../../../shared/api/client";

export type CaseListItem = {
  approvedAmount: number | null;
  completionFy: string | null;
  currentStageAgingDays: number | null;
  cycleTimeDays: number | null;
  cpcInvolved: boolean | null;
  departmentName: string | null;
  desiredStageCode: number | null;
  entityCode: string | null;
  entityId: string;
  entityName: string | null;
  estimateBenchmark: number | null;
  id: string;
  isDelayed: boolean;
  loiAwarded: boolean | null;
  ownerFullName: string | null;
  percentTimeElapsed: number | null;
  prDescription: string | null;
  prId: string;
  prReceiptDate: string | null;
  prValue: number | null;
  priorityCase: boolean;
  runningAgeDays: number | null;
  savingsWrtEstimate: number | null;
  savingsWrtPr: number | null;
  status: string;
  stageCode: number;
  tenderName: string | null;
  tenderTypeName: string | null;
  tentativeCompletionDate: string | null;
  updatedAt: string;
};

export type DeletedCaseListItem = CaseListItem & {
  deletedAt: string;
  deleteReason: string | null;
};

export type CaseSummary = {
  completed: number;
  delayed: number;
  offTrack: number;
  onTrack: number;
  priority: number;
  risk: number;
  running: number;
  total: number;
};

export type CaseMilestones = {
  bidReceiptDate?: string | null;
  biddersParticipated?: number | null;
  commercialEvaluationDate?: string | null;
  loiIssued?: boolean | null;
  loiIssuedDate?: string | null;
  nfaApprovalDate?: string | null;
  nfaSubmissionDate?: string | null;
  nitApprovalDate?: string | null;
  nitInitiationDate?: string | null;
  nitPublishDate?: string | null;
  qualifiedBidders?: number | null;
  rcPoAwardDate?: string | null;
  rcPoValidity?: string | null;
  technicalEvaluationDate?: string | null;
  [key: string]: boolean | number | string | null | undefined;
};

export type CaseDetail = {
  budgetTypeLabel?: string | null;
  createdAt: string;
  delay: {
    delayExternalDays?: number | null;
    delayReason?: string | null;
  };
  departmentId?: string | null;
  departmentName?: string | null;
  desiredStageCode?: number | null;
  entityId: string;
  cpcInvolved?: boolean | null;
  financials: {
    approvedAmount?: number | null;
    estimateBenchmark?: number | null;
    prValue?: number | null;
    savingsWrtEstimate?: number | null;
    savingsWrtPr?: number | null;
    totalAwardedAmount?: number | null;
  };
  id: string;
  isDelayed: boolean;
  milestones: CaseMilestones;
  natureOfWorkLabel?: string | null;
  ownerFullName?: string | null;
  ownerUserId?: string | null;
  prDescription?: string | null;
  prId: string;
  prReceivingMediumLabel?: string | null;
  prRemarks?: string | null;
  prReceiptDate?: string | null;
  prSchemeNo?: string | null;
  priorityCase: boolean;
  entityCode?: string | null;
  entityName?: string | null;
  stageCode: number;
  status: string;
  tenderName?: string | null;
  tenderNo?: string | null;
  tenderTypeName?: string | null;
  tentativeCompletionDate?: string | null;
  tmRemarks?: string | null;
  updatedAt: string;
};

export function getCaseSummary() {
  return apiRequest<CaseSummary>("/dashboard/summary");
}

export function listCases(params: {
  budgetTypeIds?: string[] | undefined;
  completionFys?: string[] | undefined;
  cpcInvolved?: boolean | undefined;
  cursor?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  departmentIds?: string[] | undefined;
  entityIds?: string[] | undefined;
  isDelayed?: boolean | undefined;
  limit?: number | undefined;
  loiAwarded?: boolean | undefined;
  natureOfWorkIds?: string[] | undefined;
  ownerUserId?: string | undefined;
  priorityCase?: boolean | undefined;
  prReceiptMonths?: string[] | undefined;
  q?: string | undefined;
  status?: string | undefined;
  tenderTypeIds?: string[] | undefined;
  trackStatus?: "delayed" | "off_track" | "on_track" | undefined;
  trackStatuses?: Array<"delayed" | "off_track" | "on_track"> | undefined;
  valueSlab?: string | undefined;
  valueSlabs?: string[] | undefined;
}) {
  const search = new URLSearchParams();
  setCaseListSearchParams(search, params);
  return apiRequest<CaseListItem[]>(`/cases?${search.toString()}`);
}

function setCaseListSearchParams(
  search: URLSearchParams,
  params: Parameters<typeof listCases>[0],
): void {
  setArrayParam(search, "budgetTypeIds", params.budgetTypeIds);
  setArrayParam(search, "completionFys", params.completionFys);
  setBooleanParam(search, "cpcInvolved", params.cpcInvolved);
  setStringParam(search, "cursor", params.cursor);
  setStringParam(search, "dateFrom", params.dateFrom);
  setStringParam(search, "dateTo", params.dateTo);
  setArrayParam(search, "departmentIds", params.departmentIds);
  setArrayParam(search, "entityIds", params.entityIds);
  setBooleanParam(search, "isDelayed", params.isDelayed);
  setBooleanParam(search, "loiAwarded", params.loiAwarded);
  setNumberParam(search, "limit", params.limit);
  setArrayParam(search, "natureOfWorkIds", params.natureOfWorkIds);
  setStringParam(search, "ownerUserId", params.ownerUserId);
  setBooleanParam(search, "priorityCase", params.priorityCase);
  setArrayParam(search, "prReceiptMonths", params.prReceiptMonths);
  setStringParam(search, "q", params.q);
  setStringParam(search, "status", params.status);
  setArrayParam(search, "tenderTypeIds", params.tenderTypeIds);
  setStringParam(search, "trackStatus", params.trackStatus);
  setArrayParam(search, "trackStatuses", params.trackStatuses);
  setStringParam(search, "valueSlab", params.valueSlab);
  setArrayParam(search, "valueSlabs", params.valueSlabs);
}

function setArrayParam(
  search: URLSearchParams,
  key: string,
  value: string[] | undefined,
): void {
  if (value?.length) search.set(key, value.join(","));
}

function setBooleanParam(
  search: URLSearchParams,
  key: string,
  value: boolean | undefined,
): void {
  if (typeof value === "boolean") search.set(key, String(value));
}

function setNumberParam(
  search: URLSearchParams,
  key: string,
  value: number | undefined,
): void {
  if (value != null) search.set(key, String(value));
}

function setStringParam(
  search: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value) search.set(key, value);
}

export function createCase(payload: {
  budgetTypeId: string;
  cpcInvolved: boolean;
  departmentId: string;
  entityId: string;
  financials: { prValue: number };
  natureOfWorkId: string;
  ownerUserId: string;
  prDescription: string;
  prId: string;
  prReceiptDate: string;
  priorityCase: boolean;
  tenderTypeId: string;
  tentativeCompletionDate: string;
}) {
  return apiRequest<{ id: string }>("/cases", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function getCase(caseId: string) {
  return apiRequest<CaseDetail>(`/cases/${caseId}`);
}

export function listDeletedCases(params: {
  cursor?: string | undefined;
  limit?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
}) {
  const search = new URLSearchParams();
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  return apiRequest<DeletedCaseListItem[]>(
    `/admin/cases/deleted?${search.toString()}`,
  );
}

export function deleteCase(caseId: string, deleteReason?: string | null) {
  return apiRequest<void>(`/cases/${caseId}`, {
    body: JSON.stringify({ deleteReason: deleteReason || null }),
    method: "DELETE",
  });
}

export function restoreCase(caseId: string) {
  return apiRequest<void>(`/cases/${caseId}/restore`, {
    method: "POST",
  });
}

export function updateCase(caseId: string, payload: Record<string, unknown>) {
  return apiRequest(`/cases/${caseId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function assignCaseOwner(caseId: string, ownerUserId: string) {
  return apiRequest<void>(`/cases/${caseId}/assignment`, {
    body: JSON.stringify({ ownerUserId }),
    method: "PATCH",
  });
}

export function updateMilestones(
  caseId: string,
  payload: Record<string, unknown>,
) {
  return apiRequest(`/cases/${caseId}/milestones`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function updateDelay(caseId: string, payload: Record<string, unknown>) {
  return apiRequest(`/cases/${caseId}/delay`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}
