export type ReportCode =
  | "completed"
  | "rc_po_expiry"
  | "running"
  | "stage_time"
  | "tender_details"
  | "vendor_awards";

export type ReportCaseRow = {
  approvedAmount: number | null;
  biddersParticipated: number | null;
  completedCycleTimeDays: number | null;
  completionFy: string | null;
  departmentName: string | null;
  desiredStageCode: number | null;
  caseId: string;
  entityId: string;
  entityCode: string | null;
  entityName: string | null;
  isDelayed: boolean;
  loiAwarded: boolean;
  loiAwardDate: string | null;
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
  totalAwardedAmount: number | null;
  uncontrollableDelayDays: number | null;
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
