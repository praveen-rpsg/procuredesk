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
  currentStageAgingDays: number | null;
  delayReason: string | null;
  departmentName: string | null;
  desiredStageCode: number | null;
  caseId: string;
  entityId: string;
  entityCode: string | null;
  entityName: string | null;
  estimateBenchmark: number | null;
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
