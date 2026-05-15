import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const requiredDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nullableUuid = z.string().uuid().nullable().optional();
const requiredUuid = z.string().uuid();
const csvUuidList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
  .pipe(z.array(z.string().uuid()).optional());
const csvTextList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
  .pipe(z.array(z.string().trim().min(1)).optional());
const valueSlabValues = ["lt_2l", "2l_5l", "5l_10l", "10l_25l", "25l_50l", "50l_100l", "100l_200l", "gte_200l"] as const;
const trackStatusValues = ["delayed", "off_track", "on_track"] as const;
const csvValueSlabList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
  .pipe(z.array(z.enum(valueSlabValues)).optional());
const queryBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const CaseFinancialsSchema = z.object({
  approvedAmount: z.number().min(0).nullable().optional(),
  estimateBenchmark: z.number().min(0).nullable().optional(),
  prValue: z.number().min(0).nullable().optional(),
});

export const CreateCaseFinancialsSchema = z.object({
  prValue: z.number().min(0),
});

export const CaseMilestonesSchema = z.object({
  bidReceiptDate: dateString,
  biddersParticipated: z.number().int().min(0).nullable().optional(),
  commercialEvaluationDate: dateString,
  loiIssued: z.boolean().optional(),
  loiIssuedDate: dateString,
  nfaApprovalDate: dateString,
  nfaSubmissionDate: dateString,
  nitApprovalDate: dateString,
  nitInitiationDate: dateString,
  nitPublishDate: dateString,
  qualifiedBidders: z.number().int().min(0).nullable().optional(),
  rcPoAwardDate: dateString,
  rcPoValidity: dateString,
  technicalEvaluationDate: dateString,
});

export const CreateCaseRequestSchema = z.object({
  budgetTypeId: requiredUuid,
  cpcInvolved: z.boolean(),
  departmentId: requiredUuid,
  entityId: z.string().uuid(),
  financials: CreateCaseFinancialsSchema,
  natureOfWorkId: requiredUuid,
  ownerUserId: requiredUuid,
  prDescription: z.string().trim().min(1).max(5000),
  prId: z.string().trim().min(1).max(100),
  prReceiptDate: requiredDateString,
  prReceivingMediumId: nullableUuid,
  prRemarks: z.string().trim().max(5000).nullable().optional(),
  prSchemeNo: z.string().trim().max(100).nullable().optional(),
  priorityCase: z.boolean(),
  tenderTypeId: requiredUuid,
  tentativeCompletionDate: requiredDateString,
});

export const UpdateCaseRequestSchema = z.object({
  financials: CaseFinancialsSchema.optional(),
  prDescription: z.string().trim().max(5000).nullable().optional(),
  prRemarks: z.string().trim().max(5000).nullable().optional(),
  prSchemeNo: z.string().trim().max(100).nullable().optional(),
  priorityCase: z.boolean().optional(),
  tenderName: z.string().trim().max(500).nullable().optional(),
  tenderNo: z.string().trim().max(200).nullable().optional(),
  tentativeCompletionDate: requiredDateString.optional(),
  tmRemarks: z.string().trim().max(5000).nullable().optional(),
});

export const AssignOwnerRequestSchema = z.object({
  ownerUserId: z.string().uuid(),
});

export const UpdateDelayRequestSchema = z.object({
  delayExternalDays: z.number().int().min(0).nullable().optional(),
  delayReason: z.string().trim().max(5000).nullable().optional(),
});

export const DeleteCaseRequestSchema = z
  .object({
    deleteReason: z.string().trim().max(1000).nullable().optional(),
  })
  .default({});

export const ListCasesQuerySchema = z.object({
  budgetTypeIds: csvUuidList,
  completionFys: csvTextList,
  cpcInvolved: queryBoolean,
  cursor: z.string().trim().min(1).max(200).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  departmentIds: csvUuidList,
  entityIds: csvUuidList,
  isDelayed: queryBoolean,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  loiAwarded: queryBoolean,
  natureOfWorkIds: csvUuidList,
  ownerUserId: z.string().uuid().optional(),
  priorityCase: queryBoolean,
  prReceiptMonths: csvTextList,
  q: z.string().trim().min(1).optional(),
  status: z.enum(["running", "completed"]).optional(),
  tenderTypeIds: csvUuidList,
  trackStatus: z.enum(trackStatusValues).optional(),
  valueSlab: z.enum(valueSlabValues).optional(),
  valueSlabs: csvValueSlabList,
});

export type AssignOwnerRequest = z.infer<typeof AssignOwnerRequestSchema>;
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;
export type DeleteCaseRequest = z.infer<typeof DeleteCaseRequestSchema>;
export type ListCasesQuery = z.infer<typeof ListCasesQuerySchema>;
export type UpdateCaseRequest = z.infer<typeof UpdateCaseRequestSchema>;
export type UpdateDelayRequest = z.infer<typeof UpdateDelayRequestSchema>;
export type UpdateMilestonesRequest = z.infer<typeof CaseMilestonesSchema>;
