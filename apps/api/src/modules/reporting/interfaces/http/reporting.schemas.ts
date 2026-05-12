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
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const ReportQuerySchema = z.object({
  budgetTypeIds: csvUuidList,
  completionFys: csvTextList,
  completionMonths: csvTextList,
  cpcInvolved: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  dateFrom: dateString,
  dateTo: dateString,
  delayStatus: z.enum(["delayed", "on_time"]).optional(),
  departmentIds: csvUuidList,
  entityIds: csvUuidList,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  loiAwarded: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  natureOfWorkIds: csvUuidList,
  ownerUserIds: csvUuidList,
  prReceiptMonths: csvTextList,
  priorityCase: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
  q: z.string().trim().min(1).optional(),
  stageCodes: csvIntList,
  status: z.enum(["completed", "running"]).optional(),
  tenderTypeIds: csvUuidList,
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
  selectedIds: z.array(z.string().trim().min(1).max(100)).max(500).optional(),
});

export const SavedViewsQuerySchema = z.object({
  reportCode: ReportCodeSchema.optional(),
});

export type CreateExportJobRequest = z.infer<typeof CreateExportJobRequestSchema>;
export type CreateSavedViewRequest = z.infer<typeof CreateSavedViewRequestSchema>;
export type ReportQuery = z.infer<typeof ReportQuerySchema>;
export type SavedViewsQuery = z.infer<typeof SavedViewsQuerySchema>;
