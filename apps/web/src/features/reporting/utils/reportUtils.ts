import { BarChart3, CalendarClock, CheckCircle2, FileSpreadsheet, Gauge, Table2, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ReportCode, ReportQueryParams, SavedReportView } from "../api/reportingApi";

export type AmountUnit = "absolute" | "crore" | "lakh";
export type ReportViewKey = ReportCode | "analytics" | "export_jobs" | "saved_views";
export type ReportStatusFilter = "all" | "completed" | "running";

export function buildReportParams(input: {
  budgetTypeIds: string[];
  completionFys: string[];
  completionMonths: string[];
  cpcInvolved: boolean | undefined;
  dateFrom: string;
  dateTo: string;
  delayStatus: "delayed" | "on_time" | undefined;
  deletedOnly: boolean | undefined;
  departmentIds: string[];
  entityIds: string[];
  includeStatus: boolean;
  loiAwarded: boolean | undefined;
  natureOfWorkIds: string[];
  limit?: number;
  ownerUserIds: string[];
  prReceiptMonths: string[];
  priorityCase: boolean | undefined;
  q: string;
  stageCodes: string[];
  status: ReportStatusFilter;
  tenderTypeIds: string[];
  valueSlabs: string[];
}): ReportQueryParams {
  const params: ReportQueryParams = {};
  assignNumberParam(params, "limit", input.limit);
  assignStringArrayParam(params, "budgetTypeIds", input.budgetTypeIds);
  assignTrimmedStringParam(params, "q", input.q);
  assignBooleanParam(params, "cpcInvolved", input.cpcInvolved);
  assignStringParam(params, "delayStatus", input.delayStatus ?? "");
  assignBooleanParam(params, "deletedOnly", input.deletedOnly);
  assignStringArrayParam(params, "departmentIds", input.departmentIds);
  assignStringArrayParam(params, "entityIds", input.entityIds);
  assignBooleanParam(params, "loiAwarded", input.loiAwarded);
  assignStringArrayParam(params, "natureOfWorkIds", input.natureOfWorkIds);
  assignStringArrayParam(params, "ownerUserIds", input.ownerUserIds);
  assignBooleanParam(params, "priorityCase", input.priorityCase);
  assignStringArrayParam(params, "tenderTypeIds", input.tenderTypeIds);
  assignStringArrayParam(params, "valueSlabs", input.valueSlabs);
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
  budgetTypeIds: string[];
  completionFys: string[];
  completionMonths: string[];
  cpcInvolved: boolean | undefined;
  dateFrom: string;
  dateTo: string;
  delayStatus: "delayed" | "on_time" | undefined;
  deletedOnly: boolean | undefined;
  departmentIds: string[];
  entityIds: string[];
  includeStatus: boolean;
  loiAwarded: boolean | undefined;
  natureOfWorkIds: string[];
  ownerUserIds: string[];
  prReceiptMonths: string[];
  priorityCase: boolean | undefined;
  q: string;
  stageCodes: string[];
  status: ReportStatusFilter;
  tenderTypeIds: string[];
  valueSlabs: string[];
}) {
  const payload: Record<string, unknown> = {};
  assignStringArrayParam(payload, "budgetTypeIds", input.budgetTypeIds);
  assignTrimmedStringParam(payload, "q", input.q);
  assignBooleanParam(payload, "cpcInvolved", input.cpcInvolved);
  assignStringParam(payload, "delayStatus", input.delayStatus ?? "");
  assignBooleanParam(payload, "deletedOnly", input.deletedOnly);
  assignStringArrayParam(payload, "departmentIds", input.departmentIds);
  assignStringArrayParam(payload, "entityIds", input.entityIds);
  assignBooleanParam(payload, "loiAwarded", input.loiAwarded);
  assignStringArrayParam(payload, "natureOfWorkIds", input.natureOfWorkIds);
  assignStringArrayParam(payload, "ownerUserIds", input.ownerUserIds);
  assignBooleanParam(payload, "priorityCase", input.priorityCase);
  assignStringArrayParam(payload, "tenderTypeIds", input.tenderTypeIds);
  assignStringArrayParam(payload, "valueSlabs", input.valueSlabs);
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

function assignBooleanParam(target: Record<string, unknown>, key: string, value: boolean | undefined): void {
  if (value !== undefined) target[key] = value;
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
  const normalizedValue = Math.abs(value) < 0.005 ? 0 : value;
  if (unit === "absolute") {
    return `INR ${normalizedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (unit === "lakh") {
    return `${(normalizedValue / 100000).toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
  }
  return `${(normalizedValue / 10000000).toLocaleString(undefined, { maximumFractionDigits: 2 })} Cr`;
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
  { code: "running", icon: Gauge, label: "Running Tender", path: "/reports/running" },
  { code: "completed", icon: CheckCircle2, label: "Completed Tender", path: "/reports/completed" },
  { code: "vendor_awards", icon: UsersRound, label: "Vendor Awards", path: "/reports/vendor-awards" },
  { code: "stage_time", icon: CalendarClock, label: "Stage-Time Lapsed", path: "/reports/stage-time" },
  { code: "rc_po_expiry", icon: CalendarClock, label: "RC/PO Expiry", path: "/reports/rc-po-expiry" },
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
    setBudgetTypeIds: (v: string[]) => void;
    setCompletionFys: (v: string[]) => void;
    setCompletionMonths: (v: string[]) => void;
    setCpcInvolved: (v: "any" | "false" | "true") => void;
    setDateFrom: (v: string) => void;
    setDateTo: (v: string) => void;
    setDelayStatus: (v: "all" | "delayed" | "on_time") => void;
    setDeletedOnly: (v: boolean) => void;
    setDepartmentIds: (v: string[]) => void;
    setEntityIds: (v: string[]) => void;
    setLoiAwarded: (v: "all" | "false" | "true") => void;
    setNatureOfWorkIds: (v: string[]) => void;
    setOwnerUserIds: (v: string[]) => void;
    setPrReceiptMonths: (v: string[]) => void;
    setPriorityCase: (v: boolean) => void;
    setSearchTerm: (v: string) => void;
    setStageCodes: (v: string[]) => void;
    setStatusFilter: (v: ReportStatusFilter) => void;
    setTenderTypeIds: (v: string[]) => void;
    setValueSlabs: (v: string[]) => void;
  },
) {
  const filters = view.filters;
  setters.setSearchTerm(typeof filters.q === "string" ? filters.q : "");
  setters.setDateFrom(typeof filters.dateFrom === "string" ? filters.dateFrom : "");
  setters.setDateTo(typeof filters.dateTo === "string" ? filters.dateTo : "");
  setters.setEntityIds(stringArray(filters.entityIds));
  setters.setDepartmentIds(stringArray(filters.departmentIds));
  setters.setOwnerUserIds(stringArray(filters.ownerUserIds));
  setters.setTenderTypeIds(stringArray(filters.tenderTypeIds));
  setters.setBudgetTypeIds(stringArray(filters.budgetTypeIds));
  setters.setNatureOfWorkIds(stringArray(filters.natureOfWorkIds));
  setters.setStageCodes(stringArray(filters.stageCodes));
  setters.setValueSlabs(stringArray(filters.valueSlabs));
  setters.setCompletionFys(stringArray(filters.completionFys));
  setters.setPrReceiptMonths(stringArray(filters.prReceiptMonths));
  setters.setCompletionMonths(stringArray(filters.completionMonths));
  setters.setStatusFilter(toStatusFilter(typeof filters.status === "string" ? filters.status : "all"));
  setters.setDelayStatus(filters.delayStatus === "delayed" || filters.delayStatus === "on_time" ? filters.delayStatus : "all");
  setters.setDeletedOnly(filters.deletedOnly === true);
  setters.setLoiAwarded(typeof filters.loiAwarded === "boolean" ? String(filters.loiAwarded) as "false" | "true" : "all");
  setters.setCpcInvolved(typeof filters.cpcInvolved === "boolean" ? String(filters.cpcInvolved) as "false" | "true" : "any");
  setters.setPriorityCase(filters.priorityCase === true);
  if (isAmountUnit(filters.amountUnit)) {
    setters.setAmountUnit(filters.amountUnit);
  }
}
