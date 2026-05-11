import { apiRequest } from "../../../shared/api/client";

export type CaseListItem = {
  cpcInvolved: boolean | null;
  entityId: string;
  id: string;
  isDelayed: boolean;
  prDescription: string | null;
  prId: string;
  prReceiptDate: string | null;
  priorityCase: boolean;
  status: string;
  stageCode: number;
  tenderName: string | null;
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
  priority: number;
  running: number;
  total: number;
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
  milestones: Record<string, unknown>;
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
  cpcInvolved?: boolean | undefined;
  cursor?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  departmentIds?: string[] | undefined;
  entityIds?: string[] | undefined;
  isDelayed?: boolean | undefined;
  limit?: number | undefined;
  natureOfWorkIds?: string[] | undefined;
  ownerUserId?: string | undefined;
  priorityCase?: boolean | undefined;
  q?: string | undefined;
  status?: string | undefined;
  tenderTypeIds?: string[] | undefined;
  valueSlab?: string | undefined;
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
  setBooleanParam(search, "cpcInvolved", params.cpcInvolved);
  setStringParam(search, "cursor", params.cursor);
  setStringParam(search, "dateFrom", params.dateFrom);
  setStringParam(search, "dateTo", params.dateTo);
  setArrayParam(search, "departmentIds", params.departmentIds);
  setArrayParam(search, "entityIds", params.entityIds);
  setBooleanParam(search, "isDelayed", params.isDelayed);
  setNumberParam(search, "limit", params.limit);
  setArrayParam(search, "natureOfWorkIds", params.natureOfWorkIds);
  setStringParam(search, "ownerUserId", params.ownerUserId);
  setBooleanParam(search, "priorityCase", params.priorityCase);
  setStringParam(search, "q", params.q);
  setStringParam(search, "status", params.status);
  setArrayParam(search, "tenderTypeIds", params.tenderTypeIds);
  setStringParam(search, "valueSlab", params.valueSlab);
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
  budgetTypeId?: string | null | undefined;
  cpcInvolved?: boolean | null | undefined;
  departmentId?: string | null | undefined;
  entityId: string;
  financials: { prValue?: number | null };
  natureOfWorkId?: string | null | undefined;
  ownerUserId?: string | null | undefined;
  prDescription?: string | null;
  prId: string;
  prReceiptDate?: string | null;
  priorityCase?: boolean;
  tenderTypeId?: string | null | undefined;
  tentativeCompletionDate?: string | null;
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
