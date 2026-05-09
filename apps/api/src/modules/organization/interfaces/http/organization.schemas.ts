import { z } from "zod";

export const CreateEntityRequestSchema = z.object({
  code: z.string().trim().min(1).max(32),
  departments: z.array(z.string().trim().min(2).max(200)).max(100).optional(),
  name: z.string().trim().min(2).max(200),
});

export const UpdateEntityRequestSchema = CreateEntityRequestSchema.extend({
  isActive: z.boolean(),
});

export const CreateDepartmentRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
});

export const UpdateDepartmentRequestSchema = CreateDepartmentRequestSchema.extend({
  isActive: z.boolean(),
});

export type CreateEntityRequest = z.infer<typeof CreateEntityRequestSchema>;
export type UpdateEntityRequest = z.infer<typeof UpdateEntityRequestSchema>;
export type CreateDepartmentRequest = z.infer<typeof CreateDepartmentRequestSchema>;
export type UpdateDepartmentRequest = z.infer<typeof UpdateDepartmentRequestSchema>;
