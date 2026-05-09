import { z } from "zod";

export const LoginRequestSchema = z.object({
  tenantCode: z.string().trim().min(1).optional(),
  usernameOrEmail: z.string().trim().min(1),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

