import { z } from "zod";

export const UserAccessLevelSchema = z.enum(["ENTITY", "GROUP", "USER"]);

export const CreateUserRequestSchema = z.object({
  accessLevel: UserAccessLevelSchema.default("USER"),
  email: z.string().email(),
  username: z.string().trim().min(2).max(80),
  fullName: z.string().trim().min(2).max(200),
  entityIds: z.array(z.string().uuid()).default([]),
  password: z.string().min(1).max(1024).optional(),
  roleIds: z.array(z.string().uuid()).default([]),
  sendSetupEmail: z.boolean().optional(),
  status: z.enum(["active", "inactive", "pending_password_setup"]).optional(),
});

export const UpdateUserProfileRequestSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(2).max(80),
  fullName: z.string().trim().min(2).max(200),
});

export const UpdateUserStatusRequestSchema = z.object({
  status: z.enum(["active", "inactive", "locked", "pending_password_setup"]),
});

export const UpdateUserAccessLevelRequestSchema = z.object({
  accessLevel: UserAccessLevelSchema,
});

export const AssignableOwnersQuerySchema = z.object({
  entityId: z.string().uuid(),
});

export const ReplaceUserRolesRequestSchema = z.object({
  roleIds: z.array(z.string().uuid()).default([]),
});

export const ReplaceUserEntityScopesRequestSchema = z.object({
  entityIds: z.array(z.string().uuid()).default([]),
});

export const ReplaceUserAccessAssignmentRequestSchema = z.object({
  accessLevel: UserAccessLevelSchema,
  entityIds: z.array(z.string().uuid()).default([]),
  roleIds: z.array(z.string().uuid()).default([]),
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserProfileRequest = z.infer<typeof UpdateUserProfileRequestSchema>;
export type AssignableOwnersQuery = z.infer<typeof AssignableOwnersQuerySchema>;
export type UpdateUserAccessLevelRequest = z.infer<typeof UpdateUserAccessLevelRequestSchema>;
export type UpdateUserStatusRequest = z.infer<typeof UpdateUserStatusRequestSchema>;
export type ReplaceUserRolesRequest = z.infer<typeof ReplaceUserRolesRequestSchema>;
export type ReplaceUserEntityScopesRequest = z.infer<
  typeof ReplaceUserEntityScopesRequestSchema
>;
export type ReplaceUserAccessAssignmentRequest = z.infer<
  typeof ReplaceUserAccessAssignmentRequestSchema
>;
