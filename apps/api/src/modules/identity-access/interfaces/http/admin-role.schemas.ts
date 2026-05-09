import { z } from "zod";

const permissionCodes = z.array(z.string().trim().min(1).max(120)).max(100).default([]);

export const CreateRoleRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "Role code must use lowercase letters, numbers, and underscores."),
  description: z.string().trim().max(500).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  permissionCodes,
});

export const UpdateRoleRequestSchema = z.object({
  description: z.string().trim().max(500).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  permissionCodes,
});

export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequestSchema>;
