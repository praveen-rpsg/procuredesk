import { z } from "zod";

export const PasswordPolicyRequestSchema = z.object({
  minLength: z.number().int().min(8).max(128),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSpecialCharacter: z.boolean(),
  passwordHistoryCount: z.number().int().min(0).max(24),
  lockoutAttempts: z.number().int().min(3).max(20),
  lockoutMinutes: z.number().int().min(1).max(1440),
  forcePeriodicExpiry: z.boolean(),
  expiryDays: z.number().int().min(1).max(730).nullable(),
});

export const SetUserPasswordRequestSchema = z.object({
  password: z.string().min(1).max(1024),
});

export type PasswordPolicyRequest = z.infer<typeof PasswordPolicyRequestSchema>;
export type SetUserPasswordRequest = z.infer<typeof SetUserPasswordRequestSchema>;
