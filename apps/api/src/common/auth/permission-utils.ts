export const PERMISSION_IMPLICATIONS: Record<string, string[]> = {
  "case.delay.manage.all": ["case.delay.manage.entity"],
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

type PermissionUser = {
  isPlatformSuperAdmin: boolean;
  permissions: string[];
};

export type EffectiveScope = {
  actorUserId: string;
  assignedOnly: boolean;
  entityIds: string[];
  tenantWide: boolean;
};

type ScopedUser = PermissionUser & {
  accessLevel: "ENTITY" | "GROUP" | "USER";
  entityIds: string[];
  id: string;
};

export function expandPermissions(
  permissions: string[] | undefined,
): Set<string> {
  const granted = new Set(permissions ?? []);
  const queue = [...granted];

  while (queue.length) {
    const permission = queue.shift();
    if (!permission) continue;
    for (const implied of PERMISSION_IMPLICATIONS[permission] ?? []) {
      if (!granted.has(implied)) {
        granted.add(implied);
        queue.push(implied);
      }
    }
  }

  return granted;
}

export function hasExpandedPermission(
  user: PermissionUser,
  permission: string,
): boolean {
  if (user.isPlatformSuperAdmin) return true;
  return expandPermissions(user.permissions).has(permission);
}

export function effectiveCaseReadScope(user: ScopedUser): EffectiveScope {
  if (user.isPlatformSuperAdmin) {
    return tenantWideScope(user.id);
  }

  const permissions = expandPermissions(user.permissions);
  if (user.accessLevel === "GROUP" && permissions.has("case.read.all")) {
    return tenantWideScope(user.id);
  }
  if (user.accessLevel !== "USER" && permissions.has("case.read.entity")) {
    return entityScope(user.id, user.entityIds);
  }
  if (permissions.has("case.read.assigned")) {
    return assignedScope(user.id);
  }
  return emptyScope(user.id);
}

export function effectivePlanningScope(user: ScopedUser): EffectiveScope {
  if (user.isPlatformSuperAdmin || user.accessLevel === "GROUP") {
    return tenantWideScope(user.id);
  }
  if (user.accessLevel === "ENTITY") {
    return entityScope(user.id, user.entityIds);
  }
  return assignedScope(user.id);
}

function tenantWideScope(actorUserId: string): EffectiveScope {
  return { actorUserId, assignedOnly: false, entityIds: [], tenantWide: true };
}

function entityScope(actorUserId: string, entityIds: string[]): EffectiveScope {
  return { actorUserId, assignedOnly: false, entityIds, tenantWide: false };
}

function assignedScope(actorUserId: string): EffectiveScope {
  return { actorUserId, assignedOnly: true, entityIds: [], tenantWide: false };
}

function emptyScope(actorUserId: string): EffectiveScope {
  return { actorUserId, assignedOnly: false, entityIds: [], tenantWide: false };
}
