import { describe, expect, it } from "vitest";

import { CaseAssignmentPolicy } from "./case-assignment.policy.js";

const baseInput = {
  actorAccessLevel: "ENTITY" as const,
  actorEntityIds: ["entity-1"],
  actorIsPlatformSuperAdmin: false,
  actorPermissions: [],
  actorUserId: "actor-1",
  ownerAccessLevel: "USER" as const,
  ownerEntityIds: ["entity-1"],
  ownerUserId: "owner-1",
  targetEntityId: "entity-1",
};

describe("CaseAssignmentPolicy", () => {
  it("allows assignment when the owner is mapped to the target entity", () => {
    expect(new CaseAssignmentPolicy().canAssignOwner(baseInput)).toBe(true);
  });

  it("denies assignment when the owner is not mapped to the target entity", () => {
    expect(
      new CaseAssignmentPolicy().canAssignOwner({
        ...baseInput,
        ownerEntityIds: ["entity-2"],
      }),
    ).toBe(false);
  });

  it("does not treat group-level owners as assignable without entity mapping", () => {
    expect(
      new CaseAssignmentPolicy().canAssignOwner({
        ...baseInput,
        ownerAccessLevel: "GROUP",
        ownerEntityIds: [],
      }),
    ).toBe(false);
  });
});
