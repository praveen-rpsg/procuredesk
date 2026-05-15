import type { CurrentUser } from "./AuthProvider";

export type Permission =
  | "admin.console.access"
  | "audit.read"
  | "award.manage"
  | "case.create"
  | "case.delay.manage.all"
  | "case.delay.manage.entity"
  | "case.delay.read.all"
  | "case.delete"
  | "case.read.all"
  | "case.read.assigned"
  | "case.read.entity"
  | "case.restore"
  | "case.update.all"
  | "case.update.assigned"
  | "case.update.entity"
  | "catalog.manage"
  | "catalog.read"
  | "entity.manage"
  | "entity.read"
  | "import.manage"
  | "notification.manage"
  | "permission.read"
  | "planning.manage"
  | "report.export"
  | "report.read"
  | "role.manage"
  | "system.config.manage"
  | "tenant.manage"
  | "user.manage"
  | "user.read"
  | "user.read.all"
  | "user.read.entity";

export type WorkspaceKey =
  | "admin"
  | "cases"
  | "dashboard"
  | "imports"
  | "operations"
  | "planning"
  | "reports";

type CaseScope = {
  entityId?: string | null | undefined;
  ownerUserId?: string | null | undefined;
  status?: string | null | undefined;
};

const permissionImplications: Partial<Record<Permission, Permission[]>> = {
  "case.delay.manage.all": ["case.delay.read.all"],
  "case.read.all": ["case.read.entity", "case.read.assigned"],
  "case.read.entity": ["case.read.assigned"],
  "case.update.all": [
    "case.read.all",
    "case.update.entity",
    "case.update.assigned",
  ],
  "case.update.entity": ["case.read.entity", "case.update.assigned"],
  "catalog.manage": ["catalog.read"],
  "entity.manage": ["entity.read"],
  "report.export": ["report.read"],
  "role.manage": ["permission.read"],
  "user.manage": ["user.read.all"],
  "user.read.all": ["user.read.entity"],
  "user.read.entity": ["user.read"],
};

const workspacePermissions: Record<WorkspaceKey, Permission[]> = {
  admin: ["admin.console.access"],
  cases: ["case.read.assigned", "case.read.entity", "case.read.all"],
  dashboard: ["case.read.assigned", "case.read.entity", "case.read.all"],
  imports: ["import.manage"],
  operations: ["admin.console.access"],
  planning: ["planning.manage"],
  reports: ["report.read"],
};

const adminWorkspacePermissions: Permission[] = ["admin.console.access"];

export function expandPermissions(
  permissions: string[] | undefined,
): Set<string> {
  const granted = new Set(permissions ?? []);
  const queue = [...granted];

  while (queue.length) {
    const permission = queue.shift() as Permission | undefined;
    if (!permission) continue;
    for (const implied of permissionImplications[permission] ?? []) {
      if (!granted.has(implied)) {
        granted.add(implied);
        queue.push(implied);
      }
    }
  }

  return granted;
}

export function hasPermission(
  user: CurrentUser | null | undefined,
  permission: Permission,
): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin) return true;
  return expandPermissions(user.permissions).has(permission);
}

export function hasAnyPermission(
  user: CurrentUser | null | undefined,
  permissions: Permission[],
): boolean {
  if (!permissions.length) return Boolean(user);
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasAllPermissions(
  user: CurrentUser | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(user, permission));
}

export function canAccessWorkspace(
  user: CurrentUser | null | undefined,
  workspace: WorkspaceKey,
): boolean {
  if (!user) return false;
  if (workspace === "admin") return canAccessAdminWorkspace(user);
  if (!user.tenantId) return false;
  return hasAnyPermission(user, workspacePermissions[workspace]);
}

export function canAccessAdminWorkspace(
  user: CurrentUser | null | undefined,
): boolean {
  return hasAnyPermission(user, adminWorkspacePermissions);
}

export function canReadCases(user: CurrentUser | null | undefined): boolean {
  return hasAnyPermission(user, [
    "case.read.assigned",
    "case.read.entity",
    "case.read.all",
  ]);
}

export function canReadCase(
  user: CurrentUser | null | undefined,
  kase: CaseScope,
): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin) return true;
  if (user.accessLevel === "GROUP" && hasPermission(user, "case.read.all"))
    return true;
  if (
    user.accessLevel !== "USER" &&
    hasPermission(user, "case.read.entity") &&
    isInUserEntityScope(user, kase.entityId)
  )
    return true;
  return (
    hasPermission(user, "case.read.assigned") && kase.ownerUserId === user.id
  );
}

export function canCreateCase(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "case.create");
}

export function canUpdateCase(
  user: CurrentUser | null | undefined,
  kase: CaseScope,
): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin) return true;
  if (
    user.accessLevel === "GROUP" &&
    hasPermission(user, "case.delay.manage.all")
  )
    return true;
  if (user.accessLevel === "GROUP" && hasPermission(user, "case.update.all"))
    return true;
  if (
    user.accessLevel === "ENTITY" &&
    hasPermission(user, "case.update.entity") &&
    isInUserEntityScope(user, kase.entityId)
  )
    return true;
  return (
    hasPermission(user, "case.update.assigned") && kase.ownerUserId === user.id
  );
}

export function canPotentiallyUpdateCaseFromList(
  user: CurrentUser | null | undefined,
  kase: CaseScope,
): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin) return true;
  if (user.accessLevel === "GROUP" && hasPermission(user, "case.update.all"))
    return true;
  if (
    user.accessLevel === "ENTITY" &&
    hasPermission(user, "case.update.entity") &&
    isInUserEntityScope(user, kase.entityId)
  )
    return true;
  return Boolean(
    kase.ownerUserId &&
    hasPermission(user, "case.update.assigned") &&
    kase.ownerUserId === user.id,
  );
}

export function canAssignCaseOwner(
  user: CurrentUser | null | undefined,
  kase: CaseScope,
): boolean {
  return canEditEntityManagedCaseFields(user, kase);
}

export function canEditEntityManagedCaseFields(
  user: CurrentUser | null | undefined,
  kase: CaseScope,
): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin) return true;
  if (user.accessLevel === "GROUP" && hasPermission(user, "case.update.all")) {
    return true;
  }
  return (
    user.accessLevel === "ENTITY" &&
    isInUserEntityScope(user, kase.entityId) &&
    hasPermission(user, "case.update.entity")
  );
}

export function canManageCaseDelay(
  user: CurrentUser | null | undefined,
  _kase: CaseScope,
): boolean {
  return Boolean(user?.isPlatformSuperAdmin);
}

export function canViewCaseDelay(
  user: CurrentUser | null | undefined,
  _kase: CaseScope,
): boolean {
  return canViewDelayFields(user);
}

export function canViewDelayFields(
  user: CurrentUser | null | undefined,
): boolean {
  return Boolean(user?.isPlatformSuperAdmin);
}

export function canDeleteCase(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "case.delete");
}

export function canRestoreCase(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "case.restore");
}

export function canManageAwards(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "award.manage");
}

export function canManageCaseAwards(
  user: CurrentUser | null | undefined,
  kase: CaseScope,
): boolean {
  if (
    !user ||
    kase.status !== "completed" ||
    !hasPermission(user, "award.manage")
  )
    return false;
  if (user.isPlatformSuperAdmin) return true;
  if (user.accessLevel === "GROUP" && hasPermission(user, "case.update.all"))
    return true;
  if (
    user.accessLevel === "ENTITY" &&
    hasPermission(user, "case.update.entity") &&
    isInUserEntityScope(user, kase.entityId)
  )
    return true;
  return (
    hasPermission(user, "case.update.assigned") && kase.ownerUserId === user.id
  );
}

export function canReadAudit(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "audit.read");
}

export function canManageNotifications(
  user: CurrentUser | null | undefined,
): boolean {
  return hasPermission(user, "notification.manage");
}

export function canManagePlanning(
  user: CurrentUser | null | undefined,
): boolean {
  return hasPermission(user, "planning.manage");
}

export function canManageImports(
  user: CurrentUser | null | undefined,
): boolean {
  return hasPermission(user, "import.manage");
}

export function canReadReports(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "report.read");
}

export function canExportReports(
  user: CurrentUser | null | undefined,
): boolean {
  return hasPermission(user, "report.export");
}

export function canReadUsers(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "user.read");
}

export function canManageUsers(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "user.manage");
}

export function canManageRoles(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "role.manage");
}

export function canReadEntities(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "entity.read");
}

export function canManageEntities(
  user: CurrentUser | null | undefined,
): boolean {
  return hasPermission(user, "entity.manage");
}

export function canReadCatalog(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "catalog.read");
}

export function canManageCatalog(
  user: CurrentUser | null | undefined,
): boolean {
  return hasPermission(user, "catalog.manage");
}

export function isInUserEntityScope(
  user: CurrentUser,
  entityId: string | null | undefined,
): boolean {
  return Boolean(entityId && user.entityIds.includes(entityId));
}
