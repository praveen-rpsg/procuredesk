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
