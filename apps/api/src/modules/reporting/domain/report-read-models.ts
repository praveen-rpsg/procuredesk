export type ReportCode =
  | "completed"
  | "rc_po_expiry"
  | "running"
  | "stage_time"
  | "tender_details"
  | "vendor_awards";

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
