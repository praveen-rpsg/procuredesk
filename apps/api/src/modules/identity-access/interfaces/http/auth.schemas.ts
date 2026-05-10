import { z } from "zod";

export const LoginRequestSchema = z.object({
  tenantCode: z.string().trim().min(1).optional(),
  usernameOrEmail: z.string().trim().min(1),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UpdateOwnProfileRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
});

export type UpdateOwnProfileRequest = z.infer<typeof UpdateOwnProfileRequestSchema>;

export const ChangeOwnPasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

export type ChangeOwnPasswordRequest = z.infer<typeof ChangeOwnPasswordRequestSchema>;
