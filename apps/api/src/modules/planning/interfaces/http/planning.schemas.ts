import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const nullableUuid = z.string().uuid().nullable().optional();
const amount = z
  .union([z.number(), z.string().trim()])
  .nullable()
  .optional()
  .transform((value, context) => {
    if (value === undefined || value === null) return value;
    const raw = typeof value === "number" ? String(value) : value;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be non-negative with up to two decimals.",
      });
      return z.NEVER;
    }
    const [whole = "", fractional = ""] = raw.split(".");
    return `${whole.replace(/^0+(?=\d)/, "") || "0"}.${fractional.padEnd(2, "0")}`;
  });
const csvUuidList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
  .pipe(z.array(z.string().uuid()).optional());
const queryBoolean = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value == null ? undefined : value === "true"));

export const PlanningListQuerySchema = z.object({
  cpcInvolved: queryBoolean,
  departmentIds: csvUuidList,
  entityIds: csvUuidList,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  natureOfWorkIds: csvUuidList,
  q: z.string().trim().min(1).optional(),
});

export const ExpiryQuerySchema = PlanningListQuerySchema.extend({
  days: z.coerce.number().int().min(0).max(730).optional(),
  includeCompleted: queryBoolean,
});

export const CreateTenderPlanRequestSchema = z.object({
  cpcInvolved: z.boolean().nullable().optional(),
  departmentId: nullableUuid,
  entityId: z.string().uuid(),
  natureOfWorkId: nullableUuid,
  notes: z.string().trim().max(5000).nullable().optional(),
  plannedDate: dateString,
  tenderDescription: z.string().trim().max(5000).nullable().optional(),
  valueRs: amount,
});

export const UpdateTenderPlanRequestSchema =
  CreateTenderPlanRequestSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required.",
  );

export const CreateRcPoPlanRequestSchema = z.object({
  awardedVendors: z.string().trim().max(5000).nullable().optional(),
  departmentId: nullableUuid,
  entityId: z.string().uuid(),
  rcPoAmount: amount,
  rcPoAwardDate: dateString,
  rcPoValidityDate: dateString,
  sourceCaseId: nullableUuid,
  tenderDescription: z.string().trim().max(5000).nullable().optional(),
  tenderFloatedOrNotRequired: z.boolean().optional(),
  tentativeTenderingDate: dateString,
});

export const UpdateRcPoPlanRequestSchema =
  CreateRcPoPlanRequestSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required.",
  );

export type CreateRcPoPlanRequest = z.infer<typeof CreateRcPoPlanRequestSchema>;
export type CreateTenderPlanRequest = z.infer<
  typeof CreateTenderPlanRequestSchema
>;
export type ExpiryQuery = z.infer<typeof ExpiryQuerySchema>;
export type PlanningListQuery = z.infer<typeof PlanningListQuerySchema>;
export type UpdateRcPoPlanRequest = z.infer<typeof UpdateRcPoPlanRequestSchema>;
export type UpdateTenderPlanRequest = z.infer<
  typeof UpdateTenderPlanRequestSchema
>;
