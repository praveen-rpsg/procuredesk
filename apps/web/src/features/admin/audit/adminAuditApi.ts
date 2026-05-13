import { apiRequest } from "../../../shared/api/client";

export type AuditEvent = {
  action: string;
  actorFullName: string | null;
  actorUsername: string | null;
  actorUserId: string | null;
  details: Record<string, unknown>;
  id: string;
  ipAddress: string | null;
  occurredAt: string;
  requestId: string;
  summary: string;
  targetId: string | null;
  targetType: string;
  userAgent: string | null;
};

export type AuditFilterMetadata = {
  actions: string[];
  targetTypes: string[];
};

export type AuditEventsPage = {
  rows: AuditEvent[];
  total: number;
};

export function listAdminAuditEvents(params: {
  action?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
  targetType?: string | undefined;
} = {}) {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  if (params.action) search.set("action", params.action);
  if (params.q) search.set("q", params.q);
  if (params.targetType) search.set("targetType", params.targetType);
  return apiRequest<AuditEvent[]>(`/audit/events?${search.toString()}`);
}

export function listAdminAuditEventsPage(params: {
  action?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
  targetType?: string | undefined;
} = {}) {
  const search = new URLSearchParams();
  search.set("includeTotal", "true");
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  if (params.action) search.set("action", params.action);
  if (params.q) search.set("q", params.q);
  if (params.targetType) search.set("targetType", params.targetType);
  return apiRequest<AuditEventsPage>(`/audit/events?${search.toString()}`);
}

export function getAdminAuditFilterMetadata() {
  return apiRequest<AuditFilterMetadata>("/audit/filter-metadata");
}
