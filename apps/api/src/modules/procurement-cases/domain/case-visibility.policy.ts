import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";

export class CaseVisibilityPolicy {
  listScope(user: AuthenticatedUser): {
    assignedOnly: boolean;
    entityIds: string[];
    tenantWide: boolean;
  } {
    if (user.isPlatformSuperAdmin || user.permissions.includes("case.read.all")) {
      return { assignedOnly: false, entityIds: [], tenantWide: true };
    }
    if (user.permissions.includes("case.read.entity")) {
      return { assignedOnly: false, entityIds: user.entityIds, tenantWide: false };
    }
    return { assignedOnly: true, entityIds: [], tenantWide: false };
  }

  canReadCase(user: AuthenticatedUser, kase: { entityId: string; ownerUserId: string | null }) {
    if (user.isPlatformSuperAdmin || user.permissions.includes("case.read.all")) return true;
    if (user.permissions.includes("case.read.entity") && user.entityIds.includes(kase.entityId)) {
      return true;
    }
    return user.permissions.includes("case.read.assigned") && kase.ownerUserId === user.id;
  }
}

