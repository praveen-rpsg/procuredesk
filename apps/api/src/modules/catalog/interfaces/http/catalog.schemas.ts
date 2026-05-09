import { z } from "zod";

const ReferenceCategoryCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, "Category code must use lowercase letters, numbers, and underscores.");

export const CreateReferenceCategoryRequestSchema = z.object({
  code: ReferenceCategoryCodeSchema,
  name: z.string().trim().min(1).max(160),
});

export const UpdateReferenceCategoryRequestSchema = z.object({
  isActive: z.boolean(),
  name: z.string().trim().min(1).max(160),
});

export const CreateReferenceValueRequestSchema = z.object({
  categoryCode: ReferenceCategoryCodeSchema,
  label: z.string().trim().min(1).max(200),
});

export const UpdateReferenceValueRequestSchema = z.object({
  label: z.string().trim().min(1).max(200),
  isActive: z.boolean(),
});

export const UpdateTenderTypeRuleRequestSchema = z.object({
  completionDays: z.number().int().min(0),
});

export const CreateTenderTypeRequestSchema = z.object({
  completionDays: z.number().int().min(0),
  name: z.string().trim().min(1).max(200),
  requiresFullMilestoneForm: z.boolean(),
});

export const UpdateTenderTypeRequestSchema = CreateTenderTypeRequestSchema.extend({
  isActive: z.boolean(),
});

export type CreateReferenceValueRequest = z.infer<
  typeof CreateReferenceValueRequestSchema
>;
export type CreateReferenceCategoryRequest = z.infer<
  typeof CreateReferenceCategoryRequestSchema
>;
export type UpdateReferenceCategoryRequest = z.infer<
  typeof UpdateReferenceCategoryRequestSchema
>;
export type UpdateReferenceValueRequest = z.infer<
  typeof UpdateReferenceValueRequestSchema
>;
export type UpdateTenderTypeRuleRequest = z.infer<
  typeof UpdateTenderTypeRuleRequestSchema
>;
export type CreateTenderTypeRequest = z.infer<
  typeof CreateTenderTypeRequestSchema
>;
export type UpdateTenderTypeRequest = z.infer<
  typeof UpdateTenderTypeRequestSchema
>;
