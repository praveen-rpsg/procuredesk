export type CaseFinancials = {
  approvedAmount?: number | null;
  estimateBenchmark?: number | null;
  prValue?: number | null;
  savingsWrtEstimate?: number | null;
  savingsWrtPr?: number | null;
  totalAwardedAmount?: number | null;
};

export type CaseMilestones = {
  bidReceiptDate?: string | null;
  biddersParticipated?: number | null;
  commercialEvaluationDate?: string | null;
  loiIssued?: boolean;
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
};

export type CaseDelay = {
  delayExternalDays?: number | null;
  delayReason?: string | null;
};

export type ProcurementCaseAggregate = {
  id: string;
  tenantId: string;
  prId: string;
  entityId: string;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string | null;
  ownerFullName: string | null;
  status: "running" | "completed";
  stageCode: number;
  desiredStageCode: number | null;
  isDelayed: boolean;
  priorityCase: boolean;
  cpcInvolved: boolean | null;
  prDescription: string | null;
  prRemarks: string | null;
  prSchemeNo: string | null;
  prReceiptDate: string | null;
  tenderName: string | null;
  tenderNo: string | null;
  tentativeCompletionDate: string | null;
  tmRemarks: string | null;
  budgetTypeLabel: string | null;
  natureOfWorkLabel: string | null;
  prReceivingMediumLabel: string | null;
  tenderTypeName: string | null;
  createdAt: string;
  updatedAt: string;
  financials: CaseFinancials;
  milestones: CaseMilestones;
  delay: CaseDelay;
};
