export type CaseAward = {
  caseId: string;
  createdAt: string;
  id: string;
  notes: string | null;
  poAwardDate: string | null;
  poNumber: string | null;
  poValue: number | null;
  poValidityDate: string | null;
  tenantId: string;
  updatedAt: string;
  vendorCode: string | null;
  vendorName: string;
};

export type AwardRollup = {
  awardCount: number;
  effectiveValidityDate: string | null;
  firstAwardDate: string | null;
  totalAwardedAmount: number;
};
