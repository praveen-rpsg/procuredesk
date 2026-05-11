export class CaseAssignmentPolicy {
  canAssignOwner(input: {
    actorEntityIds: string[];
    actorPermissions: string[];
    actorIsPlatformSuperAdmin: boolean;
    ownerEntityIds: string[];
    targetEntityId: string;
  }): boolean {
    if (input.actorIsPlatformSuperAdmin || input.actorPermissions.includes("case.update.all")) {
      return input.ownerEntityIds.includes(input.targetEntityId);
    }
    if (
      !input.actorPermissions.includes("case.update.entity") ||
      !input.actorEntityIds.includes(input.targetEntityId)
    ) {
      return false;
    }
    return input.ownerEntityIds.includes(input.targetEntityId);
  }
}
