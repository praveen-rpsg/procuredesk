import { z } from "zod";

export const AuditListQuerySchema = z.object({
  action: z.string().trim().min(1).optional(),
  actorUserId: z.string().uuid().optional(),
  includeTotal: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  targetId: z.string().uuid().optional(),
  targetType: z.string().trim().min(1).optional(),
});

export type AuditListQuery = z.infer<typeof AuditListQuerySchema>;
