import { z } from "zod";

const OptionalTenantCodeSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const LoginRequestSchema = z.object({
  tenantCode: OptionalTenantCodeSchema,
  usernameOrEmail: z.string().trim().min(1),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().trim().email(),
  tenantCode: OptionalTenantCodeSchema,
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  newPassword: z.string().min(1).max(1024),
  token: z.string().trim().min(32).max(512),
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const UpdateOwnProfileRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
});

export type UpdateOwnProfileRequest = z.infer<
  typeof UpdateOwnProfileRequestSchema
>;

export const ChangeOwnPasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

export type ChangeOwnPasswordRequest = z.infer<
  typeof ChangeOwnPasswordRequestSchema
>;
