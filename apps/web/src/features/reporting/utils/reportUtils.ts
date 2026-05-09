import { BarChart3, BookmarkCheck, CalendarClock, CheckCircle2, FileSpreadsheet, Gauge, Table2, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ReportCode, ReportQueryParams, SavedReportView } from "../api/reportingApi";

export type AmountUnit = "absolute" | "crore" | "lakh";
export type ReportViewKey = ReportCode | "analytics" | "export_jobs" | "saved_views";
export type ReportStatusFilter = "all" | "completed" | "running";

export function buildReportParams(input: {
  completionFys: string[];
  completionMonths: string[];
  dateFrom: string;
  dateTo: string;
  entityIds: string[];
  includeStatus: boolean;
  limit?: number;
  ownerUserIds: string[];
  prReceiptMonths: string[];
  q: string;
  stageCodes: string[];
  status: ReportStatusFilter;
  tenderTypeIds: string[];
}): ReportQueryParams {
  const params: ReportQueryParams = {};
  assignNumberParam(params, "limit", input.limit);
  assignTrimmedStringParam(params, "q", input.q);
  assignStringArrayParam(params, "entityIds", input.entityIds);
  assignStringArrayParam(params, "ownerUserIds", input.ownerUserIds);
  assignStringArrayParam(params, "tenderTypeIds", input.tenderTypeIds);
  assignStageCodesParam(params, input.stageCodes);
  assignStringArrayParam(params, "completionFys", input.completionFys);
  assignStringArrayParam(params, "prReceiptMonths", input.prReceiptMonths);
  assignStringArrayParam(params, "completionMonths", input.completionMonths);
  assignStringParam(params, "dateFrom", input.dateFrom);
  assignStringParam(params, "dateTo", input.dateTo);
  assignStatusParam(params, input.includeStatus, input.status);
  return params;
}

export function buildReportFilterPayload(input: {
  amountUnit: AmountUnit | null;
  completionFys: string[];
  completionMonths: string[];
  dateFrom: string;
  dateTo: string;
  entityIds: string[];
  includeStatus: boolean;
  ownerUserIds: string[];
  prReceiptMonths: string[];
  q: string;
  stageCodes: string[];
  status: ReportStatusFilter;
  tenderTypeIds: string[];
}) {
  const payload: Record<string, unknown> = {};
  assignTrimmedStringParam(payload, "q", input.q);
  assignStringArrayParam(payload, "entityIds", input.entityIds);
  assignStringArrayParam(payload, "ownerUserIds", input.ownerUserIds);
  assignStringArrayParam(payload, "tenderTypeIds", input.tenderTypeIds);
  assignStageCodesParam(payload, input.stageCodes);
  assignStringArrayParam(payload, "completionFys", input.completionFys);
  assignStringArrayParam(payload, "prReceiptMonths", input.prReceiptMonths);
  assignStringArrayParam(payload, "completionMonths", input.completionMonths);
  assignStringParam(payload, "dateFrom", input.dateFrom);
  assignStringParam(payload, "dateTo", input.dateTo);
  assignStatusParam(payload, input.includeStatus, input.status);
  assignAmountUnitParam(payload, input.amountUnit);
  return payload;
}

function assignNumberParam(target: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value != null) target[key] = value;
}

function assignStringParam(target: Record<string, unknown>, key: string, value: string): void {
  if (value) target[key] = value;
}

function assignTrimmedStringParam(target: Record<string, unknown>, key: string, value: string): void {
  const trimmedValue = value.trim();
  if (trimmedValue) target[key] = trimmedValue;
}

function assignStringArrayParam(target: Record<string, unknown>, key: string, value: string[]): void {
  if (value.length) target[key] = value;
}

function assignStageCodesParam(target: Record<string, unknown>, value: string[]): void {
  if (!value.length) return;
  target.stageCodes = value.map(Number).filter((stageCode) => Number.isInteger(stageCode));
}

function assignStatusParam(
  target: Record<string, unknown>,
  includeStatus: boolean,
  status: ReportStatusFilter,
): void {
  if (includeStatus && status !== "all") target.status = status;
}

function assignAmountUnitParam(target: Record<string, unknown>, amountUnit: AmountUnit | null): void {
  if (amountUnit) target.amountUnit = amountUnit;
}

export function formatAmount(value: number | null, unit: AmountUnit) {
  if (value == null) return "-";
  if (unit === "absolute") {
    return `INR ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (unit === "lakh") {
    return `${(value / 100000).toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
  }
  return `${(value / 10000000).toLocaleString(undefined, { maximumFractionDigits: 2 })} Cr`;
}

export function formatDecimal(value: number | null | undefined) {
  return value == null ? "-" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function amountUnitLabel(unit: AmountUnit) {
  if (unit === "absolute") return "INR";
  if (unit === "lakh") return "Lakh";
  return "Crore";
}

export const REPORT_OPTIONS: Array<{ code: ReportViewKey; icon: LucideIcon; label: string; path: string }> = [
  { code: "analytics", icon: BarChart3, label: "Analytics", path: "/reports/analytics" },
  { code: "tender_details", icon: Table2, label: "Tender Details", path: "/reports/tender-details" },
  { code: "running", icon: Gauge, label: "Running", path: "/reports/running" },
  { code: "completed", icon: CheckCircle2, label: "Completed", path: "/reports/completed" },
  { code: "vendor_awards", icon: UsersRound, label: "Vendor Awards", path: "/reports/vendor-awards" },
  { code: "stage_time", icon: CalendarClock, label: "Stage Time", path: "/reports/stage-time" },
  { code: "rc_po_expiry", icon: CalendarClock, label: "RC/PO Expiry", path: "/reports/rc-po-expiry" },
  { code: "saved_views", icon: BookmarkCheck, label: "Saved Views", path: "/reports/saved-views" },
  { code: "export_jobs", icon: FileSpreadsheet, label: "Export Jobs", path: "/reports/export-jobs" },
];

export function getReportLabel(code: ReportViewKey) {
  return REPORT_OPTIONS.find((option) => option.code === code)?.label ?? "Report";
}

export function reportPathForKey(key: ReportViewKey) {
  return REPORT_OPTIONS.find((option) => option.code === key)?.path ?? "/reports/analytics";
}

export function reportViewFromPath(pathname: string): ReportViewKey | null {
  if (pathname === "/reports") return null;
  return REPORT_OPTIONS.find((option) => option.path === pathname)?.code ?? null;
}

export function formatMonth(value: string) {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function toStatusFilter(value: string): ReportStatusFilter {
  return value === "completed" || value === "running" ? value : "all";
}

export function isAmountUnit(value: unknown): value is AmountUnit {
  return value === "absolute" || value === "lakh" || value === "crore";
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export function applySavedView(
  view: SavedReportView,
  setters: {
    setAmountUnit: (v: AmountUnit) => void;
    setCompletionFys: (v: string[]) => void;
    setCompletionMonths: (v: string[]) => void;
    setDateFrom: (v: string) => void;
    setDateTo: (v: string) => void;
    setEntityIds: (v: string[]) => void;
    setOwnerUserIds: (v: string[]) => void;
    setPrReceiptMonths: (v: string[]) => void;
    setSearchTerm: (v: string) => void;
    setStageCodes: (v: string[]) => void;
    setStatusFilter: (v: ReportStatusFilter) => void;
    setTenderTypeIds: (v: string[]) => void;
  },
) {
  const filters = view.filters;
  setters.setSearchTerm(typeof filters.q === "string" ? filters.q : "");
  setters.setDateFrom(typeof filters.dateFrom === "string" ? filters.dateFrom : "");
  setters.setDateTo(typeof filters.dateTo === "string" ? filters.dateTo : "");
  setters.setEntityIds(stringArray(filters.entityIds));
  setters.setOwnerUserIds(stringArray(filters.ownerUserIds));
  setters.setTenderTypeIds(stringArray(filters.tenderTypeIds));
  setters.setStageCodes(stringArray(filters.stageCodes));
  setters.setCompletionFys(stringArray(filters.completionFys));
  setters.setPrReceiptMonths(stringArray(filters.prReceiptMonths));
  setters.setCompletionMonths(stringArray(filters.completionMonths));
  setters.setStatusFilter(toStatusFilter(typeof filters.status === "string" ? filters.status : "all"));
  if (isAmountUnit(filters.amountUnit)) {
    setters.setAmountUnit(filters.amountUnit);
  }
}
