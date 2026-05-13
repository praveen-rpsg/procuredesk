import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";

export class CaseVisibilityPolicy {
  listScope(user: AuthenticatedUser): {
    assignedOnly: boolean;
    entityIds: string[];
    tenantWide: boolean;
  } {
    if (user.isPlatformSuperAdmin || user.accessLevel === "GROUP") {
      return { assignedOnly: false, entityIds: [], tenantWide: true };
    }
    if (user.accessLevel === "ENTITY") {
      return { assignedOnly: false, entityIds: user.entityIds, tenantWide: false };
    }
    return { assignedOnly: true, entityIds: [], tenantWide: false };
  }

  canReadCase(user: AuthenticatedUser, kase: { entityId: string; ownerUserId: string | null }) {
    if (user.isPlatformSuperAdmin || user.accessLevel === "GROUP") {
      return true;
    }
    if (user.accessLevel === "ENTITY" && user.entityIds.includes(kase.entityId)) {
      return true;
    }
    return kase.ownerUserId === user.id;
  }
}
