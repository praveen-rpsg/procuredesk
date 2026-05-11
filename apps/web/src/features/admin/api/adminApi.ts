import { apiRequest } from "../../../shared/api/client";

export type AdminUser = {
  createdAt: string;
  email: string;
  entityCodes: string[];
  entityIds: string[];
  entityNames: string[];
  fullName: string;
  id: string;
  isPlatformSuperAdmin: boolean;
  roleCodes: string[];
  roleIds: string[];
  roleNames: string[];
  status: "active" | "inactive" | "locked" | "pending_password_setup";
  tenantId: string | null;
  username: string;
};

export type AdminRole = {
  code: string;
  description: string | null;
  id: string;
  isSystemRole: boolean;
  name: string;
  permissionCodes: string[];
  userCount: number;
};

export type AdminPermission = {
  code: string;
  description: string | null;
  name: string;
};

export type AdminEntity = {
  code: string;
  departmentCount: number;
  departments: string[];
  id: string;
  isActive: boolean;
  name: string;
  tenderCount: number;
};

export type AdminDepartment = {
  entityId: string;
  id: string;
  isActive: boolean;
  name: string;
  tenderCount: number;
};

export type AssignableOwner = {
  email: string;
  fullName: string;
  id: string;
  username: string;
};

export type CatalogReferenceValue = {
  categoryCode: string;
  id: string;
  isActive: boolean;
  label: string;
  usageCount: number;
};

export type CatalogReferenceCategory = {
  code: string;
  id: string;
  isActive: boolean;
  isSystemCategory: boolean;
  name: string;
  usageCount: number;
  valueCount: number;
};

export type TenderTypeRule = {
  completionDays: number | null;
  id: string;
  isActive: boolean;
  name: string;
  requiresFullMilestoneForm: boolean;
  ruleId: string | null;
  usageCount: number;
};

export type CatalogSnapshot = {
  referenceCategories: CatalogReferenceCategory[];
  referenceValues: CatalogReferenceValue[];
  tenderTypes: TenderTypeRule[];
};

export type PasswordPolicy = {
  expiryDays: number | null;
  forcePeriodicExpiry: boolean;
  lockoutAttempts: number;
  lockoutMinutes: number;
  minLength: number;
  passwordHistoryCount: number;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialCharacter: boolean;
  requireUppercase: boolean;
  tenantId: string;
};

export function listAdminUsers() {
  return apiRequest<AdminUser[]>("/admin/users");
}

export function createAdminUser(payload: {
  email: string;
  entityIds?: string[];
  fullName: string;
  password?: string;
  roleIds?: string[];
  status?: "active" | "inactive" | "pending_password_setup";
  username: string;
}) {
  return apiRequest<{ id: string }>("/admin/users", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateAdminUserProfile(
  userId: string,
  payload: { email: string; fullName: string; username: string },
) {
  return apiRequest<void>(`/admin/users/${userId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function updateAdminUserStatus(
  userId: string,
  status: AdminUser["status"],
) {
  return apiRequest<void>(`/admin/users/${userId}/status`, {
    body: JSON.stringify({ status }),
    method: "PATCH",
  });
}

export function listAdminRoles() {
  return apiRequest<AdminRole[]>("/admin/roles");
}

export function listAdminPermissions() {
  return apiRequest<AdminPermission[]>("/admin/permissions");
}

export function createAdminRole(payload: {
  code: string;
  description?: string | null;
  name: string;
  permissionCodes: string[];
}) {
  return apiRequest<{ id: string }>("/admin/roles", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateAdminRole(
  roleId: string,
  payload: {
    description?: string | null;
    name: string;
    permissionCodes: string[];
  },
) {
  return apiRequest<void>(`/admin/roles/${roleId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteAdminRole(roleId: string) {
  return apiRequest<void>(`/admin/roles/${roleId}`, {
    method: "DELETE",
  });
}

export function replaceAdminUserRoles(userId: string, roleIds: string[]) {
  return apiRequest<void>(`/admin/users/${userId}/roles`, {
    body: JSON.stringify({ roleIds }),
    method: "PUT",
  });
}

export function listAdminEntities() {
  return apiRequest<AdminEntity[]>("/entities");
}

export function createAdminEntity(payload: {
  code: string;
  departments: string[];
  name: string;
}) {
  return apiRequest<{ id: string }>("/admin/entities", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateAdminEntity(
  entityId: string,
  payload: {
    code: string;
    departments?: string[];
    isActive: boolean;
    name: string;
  },
) {
  return apiRequest<void>(`/admin/entities/${entityId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteAdminEntity(entityId: string) {
  return apiRequest<void>(`/admin/entities/${entityId}`, {
    method: "DELETE",
  });
}

export function replaceAdminUserEntityScopes(
  userId: string,
  entityIds: string[],
) {
  return apiRequest<void>(`/admin/users/${userId}/entity-scopes`, {
    body: JSON.stringify({ entityIds }),
    method: "PUT",
  });
}

export function listAdminDepartments(entityId: string) {
  return apiRequest<AdminDepartment[]>(`/entities/${entityId}/departments`);
}

export function listAssignableOwners(entityId: string) {
  const search = new URLSearchParams({ entityId });
  return apiRequest<AssignableOwner[]>(
    `/admin/users/assignable-owners?${search.toString()}`,
  );
}

export function createAdminDepartment(
  entityId: string,
  payload: { name: string },
) {
  return apiRequest<{ id: string }>(`/admin/entities/${entityId}/departments`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateAdminDepartment(
  departmentId: string,
  payload: { isActive: boolean; name: string },
) {
  return apiRequest<void>(`/admin/departments/${departmentId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteAdminDepartment(departmentId: string) {
  return apiRequest<void>(`/admin/departments/${departmentId}`, {
    method: "DELETE",
  });
}

export function getCatalogSnapshot() {
  return apiRequest<CatalogSnapshot>("/catalog");
}

export function createCatalogReferenceValue(payload: {
  categoryCode: string;
  label: string;
}) {
  return apiRequest<{ id: string }>("/admin/catalog/reference-values", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function createCatalogReferenceCategory(payload: {
  code: string;
  name: string;
}) {
  return apiRequest<{ id: string }>("/admin/catalog/reference-categories", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateCatalogReferenceCategory(
  categoryId: string,
  payload: { isActive: boolean; name: string },
) {
  return apiRequest<void>(`/admin/catalog/reference-categories/${categoryId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteCatalogReferenceCategory(categoryId: string) {
  return apiRequest<void>(`/admin/catalog/reference-categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function updateCatalogReferenceValue(
  referenceValueId: string,
  payload: { isActive: boolean; label: string },
) {
  return apiRequest<void>(
    `/admin/catalog/reference-values/${referenceValueId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
  );
}

export function deleteCatalogReferenceValue(referenceValueId: string) {
  return apiRequest<void>(
    `/admin/catalog/reference-values/${referenceValueId}`,
    {
      method: "DELETE",
    },
  );
}

export function createTenderType(payload: {
  completionDays: number;
  name: string;
  requiresFullMilestoneForm: boolean;
}) {
  return apiRequest<{ id: string }>("/admin/catalog/tender-types", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateTenderType(
  tenderTypeId: string,
  payload: {
    completionDays: number;
    isActive: boolean;
    name: string;
    requiresFullMilestoneForm: boolean;
  },
) {
  return apiRequest<void>(`/admin/catalog/tender-types/${tenderTypeId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteTenderType(tenderTypeId: string) {
  return apiRequest<void>(`/admin/catalog/tender-types/${tenderTypeId}`, {
    method: "DELETE",
  });
}

export function updateTenderTypeCompletionRule(
  ruleId: string,
  completionDays: number,
) {
  return apiRequest<void>(`/admin/catalog/tender-type-rules/${ruleId}`, {
    body: JSON.stringify({ completionDays }),
    method: "PATCH",
  });
}

export function upsertTenderTypeCompletionRule(
  tenderTypeId: string,
  completionDays: number,
) {
  return apiRequest<{ id: string }>(
    `/admin/catalog/tender-types/${tenderTypeId}/completion-rule`,
    {
      body: JSON.stringify({ completionDays }),
      method: "PATCH",
    },
  );
}

export function getPasswordPolicy() {
  return apiRequest<PasswordPolicy>("/admin/security/password-policy");
}

export function updatePasswordPolicy(
  payload: Omit<PasswordPolicy, "tenantId">,
) {
  return apiRequest<PasswordPolicy>("/admin/security/password-policy", {
    body: JSON.stringify(payload),
    method: "PUT",
  });
}

export function setAdminUserPassword(userId: string, password: string) {
  return apiRequest<{ updated: true }>(
    `/admin/security/users/${userId}/password`,
    {
      body: JSON.stringify({ password }),
      method: "PUT",
    },
  );
}
