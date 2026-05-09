export type RcPoPlan = {
  awardedVendors: string | null;
  departmentId: string | null;
  entityId: string;
  id: string;
  rcPoAmount: number | null;
  rcPoAwardDate: string | null;
  rcPoValidityDate: string | null;
  sourceCaseId: string | null;
  tenderDescription: string | null;
  tenderFloatedOrNotRequired: boolean;
  tentativeTenderingDate: string | null;
};

export type RcPoExpiryRow = {
  awardedVendors: string | null;
  daysToExpiry: number | null;
  departmentId: string | null;
  entityId: string;
  ownerUserId: string | null;
  rcPoAmount: number | null;
  rcPoAwardDate: string | null;
  rcPoValidityDate: string;
  sourceCaseId: string | null;
  sourceId: string;
  sourceType: "case_award" | "manual_plan";
  tenderDescription: string | null;
  tenderFloatedOrNotRequired: boolean;
  tentativeTenderingDate: string | null;
  urgency: "expired" | "critical" | "warning" | "normal";
};
