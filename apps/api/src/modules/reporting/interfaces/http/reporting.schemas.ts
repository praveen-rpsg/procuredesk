import { z } from "zod";

export const ReportCodeSchema = z.enum([
  "completed",
  "rc_po_expiry",
  "running",
  "stage_time",
  "tender_details",
  "vendor_awards",
]);

const csvUuidList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
  .pipe(z.array(z.string().uuid()).optional());
const csvIntList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean).map(Number) : undefined))
  .pipe(z.array(z.number().int().min(0).max(8)).optional());
const csvTextList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : undefined))
  .pipe(z.array(z.string().min(1).max(32)).optional());
const trackStatusValues = ["delayed", "off_track", "on_track"] as const;
const csvTrackStatusList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
  .pipe(z.array(z.enum(trackStatusValues)).optional());
const nullableDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const ReportQuerySchema = z.object({
  budgetTypeIds: csvUuidList,
  completionFys: csvTextList,
  completionMonths: csvTextList,
  cpcInvolved: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  delayStatus: z.enum(["delayed", "on_time"]).optional(),
  deletedOnly: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  departmentIds: csvUuidList,
  days: z.coerce.number().int().min(0).max(730).optional(),
  entityIds: csvUuidList,
  includeExpiredContracts: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  includeTenderFloatedOrNotRequired: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  loiAwarded: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  natureOfWorkIds: csvUuidList,
  offset: z.coerce.number().int().min(0).max(100000).optional(),
  ownerUserIds: csvUuidList,
  prReceiptMonths: csvTextList,
  priorityCase: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  q: z.string().trim().min(1).optional(),
  stageCodes: csvIntList,
  status: z.enum(["completed", "running"]).optional(),
  tenderTypeIds: csvUuidList,
  trackStatus: z.enum(trackStatusValues).optional(),
  trackStatuses: csvTrackStatusList,
  valueSlabs: csvTextList,
});

export const CreateSavedViewRequestSchema = z.object({
  columns: z.array(z.unknown()).default([]),
  filters: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false),
  name: z.string().trim().min(1).max(200),
  reportCode: ReportCodeSchema,
});

export const CreateExportJobRequestSchema = z.object({
  filters: z.record(z.unknown()).default({}),
  format: z.enum(["xlsx", "csv"]),
  reportCode: ReportCodeSchema,
});

export const RcPoExpirySourceTypeSchema = z.enum(["case_award", "manual_plan"]);

export const UpdateRcPoExpiryRowRequestSchema = z.object({
  tenderFloatedOrNotRequired: z.boolean().optional(),
  tentativeTenderingDate: nullableDateString,
}).refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const SavedViewsQuerySchema = z.object({
  reportCode: ReportCodeSchema.optional(),
});

export type CreateExportJobRequest = z.infer<typeof CreateExportJobRequestSchema>;
export type CreateSavedViewRequest = z.infer<typeof CreateSavedViewRequestSchema>;
export type ReportQuery = z.infer<typeof ReportQuerySchema>;
export type RcPoExpirySourceType = z.infer<typeof RcPoExpirySourceTypeSchema>;
export type SavedViewsQuery = z.infer<typeof SavedViewsQuerySchema>;
export type UpdateRcPoExpiryRowRequest = z.infer<typeof UpdateRcPoExpiryRowRequestSchema>;
