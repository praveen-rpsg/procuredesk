export class CaseAssignmentPolicy {
  canAssignOwner(input: {
    actorAccessLevel: "ENTITY" | "GROUP" | "USER";
    actorEntityIds: string[];
    actorPermissions: string[];
    actorIsPlatformSuperAdmin: boolean;
    actorUserId: string;
    ownerAccessLevel: "ENTITY" | "GROUP" | "USER";
    ownerEntityIds: string[];
    ownerUserId: string;
    targetEntityId: string;
  }): boolean {
    const ownerCanReceiveTargetEntity =
      input.ownerAccessLevel === "GROUP" || input.ownerEntityIds.includes(input.targetEntityId);
    if (!ownerCanReceiveTargetEntity) {
      return false;
    }

    if (input.actorIsPlatformSuperAdmin || input.actorPermissions.includes("case.update.all")) {
      return true;
    }
    if (input.actorAccessLevel === "GROUP") {
      return true;
    }
    if (input.actorAccessLevel === "ENTITY" && input.actorEntityIds.includes(input.targetEntityId)) {
      return true;
    }
    if (
      input.actorAccessLevel === "USER" &&
      input.actorUserId === input.ownerUserId &&
      input.actorEntityIds.includes(input.targetEntityId)
    ) {
      return true;
    }
    return false;
  }
}
