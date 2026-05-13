import { apiRequest } from "../../../shared/api/client";

export type EntityOption = {
  code: string;
  id: string;
  isActive: boolean;
  name: string;
};

export type TenderPlanCase = {
  cpcInvolved: boolean | null;
  departmentId: string | null;
  entityId: string;
  id: string;
  notes: string | null;
  plannedDate: string | null;
  tenderDescription: string | null;
  valueRs: number | null;
};

export type RcPoExpiryRow = {
  awardedVendors: string | null;
  daysToExpiry: number | null;
  departmentId: string | null;
  departmentName: string | null;
  entityCode: string | null;
  entityId: string;
  entityName: string | null;
  ownerFullName: string | null;
  ownerUserId: string | null;
  rcPoAmount: number | null;
  rcPoAwardDate: string | null;
  rcPoValidityDate: string;
  sourceCaseId: string | null;
  sourceId: string;
  sourceOrigin: "bulk_upload" | "manual_entry" | "tenderdb";
  sourceType: "case_award" | "manual_plan";
  tenderDescription: string | null;
  tenderFloatedOrNotRequired: boolean;
  tentativeTenderingDate: string | null;
  urgency: "expired" | "critical" | "warning" | "normal";
};

export function listEntities() {
  return apiRequest<EntityOption[]>("/entities");
}

export function listTenderPlans(
  params: {
    departmentIds?: string[] | undefined;
    entityIds?: string[] | undefined;
    limit?: number | undefined;
    q?: string | undefined;
  } = {},
) {
  const search = new URLSearchParams();
  if (params.departmentIds?.length)
    search.set("departmentIds", params.departmentIds.join(","));
  if (params.entityIds?.length)
    search.set("entityIds", params.entityIds.join(","));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.q) search.set("q", params.q);
  return apiRequest<TenderPlanCase[]>(
    `/planning/tender-plans?${search.toString()}`,
  );
}

export function createTenderPlan(payload: {
  cpcInvolved?: boolean | null;
  departmentId?: string | null;
  entityId: string;
  plannedDate?: string | null;
  tenderDescription?: string | null;
  valueRs?: string | null;
}) {
  return apiRequest<{ id: string }>("/planning/tender-plans", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateTenderPlan(
  planId: string,
  payload: Record<string, unknown>,
) {
  return apiRequest<void>(`/planning/tender-plans/${planId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function createRcPoPlan(payload: {
  awardedVendors?: string | null;
  departmentId?: string | null;
  entityId: string;
  rcPoAmount?: string | null;
  rcPoAwardDate?: string | null;
  rcPoValidityDate?: string | null;
  tenderDescription?: string | null;
  tentativeTenderingDate?: string | null;
}) {
  return apiRequest<{ id: string }>("/planning/rc-po-plans", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateRcPoPlan(
  planId: string,
  payload: Record<string, unknown>,
) {
  return apiRequest<void>(`/planning/rc-po-plans/${planId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function listRcPoExpiry(
  params: {
    days?: number | undefined;
    departmentIds?: string[] | undefined;
    entityIds?: string[] | undefined;
    includeCompleted?: boolean | undefined;
    limit?: number | undefined;
    q?: string | undefined;
  } = {},
) {
  const search = new URLSearchParams();
  if (params.days) search.set("days", String(params.days));
  if (params.departmentIds?.length)
    search.set("departmentIds", params.departmentIds.join(","));
  if (params.entityIds?.length)
    search.set("entityIds", params.entityIds.join(","));
  if (typeof params.includeCompleted === "boolean")
    search.set("includeCompleted", String(params.includeCompleted));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.q) search.set("q", params.q);
  return apiRequest<RcPoExpiryRow[]>(
    `/planning/rc-po-expiry?${search.toString()}`,
  );
}
