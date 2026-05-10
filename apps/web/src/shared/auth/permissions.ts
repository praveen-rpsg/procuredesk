import type { CurrentUser } from "./AuthProvider";

export type Permission =
  | "audit.read"
  | "award.manage"
  | "case.create"
  | "case.delay.manage.entity"
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
  | "planning.manage"
  | "report.export"
  | "report.read"
  | "role.manage"
  | "tenant.manage"
  | "user.manage"
  | "user.read";

export type WorkspaceKey = "admin" | "cases" | "dashboard" | "imports" | "operations" | "planning" | "reports";

type CaseScope = {
  entityId?: string | null | undefined;
  ownerUserId?: string | null | undefined;
};

const permissionImplications: Partial<Record<Permission, Permission[]>> = {
  "case.read.all": ["case.read.entity", "case.read.assigned"],
  "case.read.entity": ["case.read.assigned"],
  "case.update.all": ["case.read.all", "case.update.entity", "case.update.assigned"],
  "case.update.entity": ["case.read.entity", "case.update.assigned"],
  "catalog.manage": ["catalog.read"],
  "entity.manage": ["entity.read"],
  "user.manage": ["user.read"],
};

const workspacePermissions: Record<WorkspaceKey, Permission[]> = {
  admin: [
    "audit.read",
    "catalog.manage",
    "catalog.read",
    "entity.manage",
    "entity.read",
    "role.manage",
    "tenant.manage",
    "user.manage",
    "user.read",
  ],
  cases: ["case.read.assigned", "case.read.entity", "case.read.all"],
  dashboard: [],
  imports: ["import.manage"],
  operations: ["audit.read", "notification.manage"],
  planning: ["planning.manage"],
  reports: ["report.read"],
};

export function expandPermissions(permissions: string[] | undefined): Set<string> {
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

export function hasPermission(user: CurrentUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin) return true;
  return expandPermissions(user.permissions).has(permission);
}

export function hasAnyPermission(user: CurrentUser | null | undefined, permissions: Permission[]): boolean {
  if (!permissions.length) return Boolean(user);
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasAllPermissions(user: CurrentUser | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(user, permission));
}

export function canAccessWorkspace(user: CurrentUser | null | undefined, workspace: WorkspaceKey): boolean {
  if (workspace === "dashboard") return Boolean(user);
  return hasAnyPermission(user, workspacePermissions[workspace]);
}

export function canReadCases(user: CurrentUser | null | undefined): boolean {
  return hasAnyPermission(user, ["case.read.assigned", "case.read.entity", "case.read.all"]);
}

export function canReadCase(user: CurrentUser | null | undefined, kase: CaseScope): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin || hasPermission(user, "case.read.all")) return true;
  if (hasPermission(user, "case.read.entity") && isInUserEntityScope(user, kase.entityId)) return true;
  return hasPermission(user, "case.read.assigned") && kase.ownerUserId === user.id;
}

export function canCreateCase(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "case.create");
}

export function canUpdateCase(user: CurrentUser | null | undefined, kase: CaseScope): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin || hasPermission(user, "case.update.all")) return true;
  if (hasPermission(user, "case.update.entity") && isInUserEntityScope(user, kase.entityId)) return true;
  return hasPermission(user, "case.update.assigned") && kase.ownerUserId === user.id;
}

export function canPotentiallyUpdateCaseFromList(user: CurrentUser | null | undefined, kase: CaseScope): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin || hasPermission(user, "case.update.all")) return true;
  if (hasPermission(user, "case.update.entity") && isInUserEntityScope(user, kase.entityId)) return true;
  return Boolean(kase.ownerUserId && hasPermission(user, "case.update.assigned") && kase.ownerUserId === user.id);
}

export function canAssignCaseOwner(user: CurrentUser | null | undefined, kase: CaseScope): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin || hasPermission(user, "case.update.all")) return true;
  return (
    isInUserEntityScope(user, kase.entityId) &&
    (hasPermission(user, "case.update.entity") || hasPermission(user, "case.update.assigned"))
  );
}

export function canManageCaseDelay(user: CurrentUser | null | undefined, kase: CaseScope): boolean {
  if (!user) return false;
  if (user.isPlatformSuperAdmin || hasPermission(user, "case.update.all")) return true;
  return hasPermission(user, "case.delay.manage.entity") && isInUserEntityScope(user, kase.entityId);
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

export function canReadAudit(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "audit.read");
}

export function canManageNotifications(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "notification.manage");
}

export function canManagePlanning(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "planning.manage");
}

export function canManageImports(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "import.manage");
}

export function canReadReports(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "report.read");
}

export function canExportReports(user: CurrentUser | null | undefined): boolean {
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

export function canManageEntities(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "entity.manage");
}

export function canReadCatalog(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "catalog.read");
}

export function canManageCatalog(user: CurrentUser | null | undefined): boolean {
  return hasPermission(user, "catalog.manage");
}

export function isInUserEntityScope(user: CurrentUser, entityId: string | null | undefined): boolean {
  return Boolean(entityId && user.entityIds.includes(entityId));
}
