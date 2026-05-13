import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { effectiveCaseReadScope, hasExpandedPermission } from "../../../common/auth/permission-utils.js";

export class CaseVisibilityPolicy {
  listScope(user: AuthenticatedUser): {
    assignedOnly: boolean;
    entityIds: string[];
    tenantWide: boolean;
  } {
    const scope = effectiveCaseReadScope(user);
    return {
      assignedOnly: scope.assignedOnly,
      entityIds: scope.entityIds,
      tenantWide: scope.tenantWide,
    };
  }

  canReadCase(user: AuthenticatedUser, kase: { entityId: string; ownerUserId: string | null }) {
    if (user.isPlatformSuperAdmin) {
      return true;
    }
    if (user.accessLevel === "GROUP" && hasExpandedPermission(user, "case.read.all")) {
      return true;
    }
    if (
      user.accessLevel !== "USER" &&
      hasExpandedPermission(user, "case.read.entity") &&
      user.entityIds.includes(kase.entityId)
    ) {
      return true;
    }
    return hasExpandedPermission(user, "case.read.assigned") && kase.ownerUserId === user.id;
  }
}
