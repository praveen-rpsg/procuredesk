import { describe, expect, it } from "vitest";

import { validateTenderCaseDbSafePayload } from "./import-worker.js";

describe("validateTenderCaseDbSafePayload", () => {
  it("rejects a date value in LOI Awarded?", () => {
    const errors: string[] = [];

    validateTenderCaseDbSafePayload(errors, {
      loiIssued: new Date("2026-05-19T00:00:00.000Z"),
      loiIssuedDate: "2026-05-19",
    });

    expect(errors).toContain("LOI Awarded? must be Yes or No.");
  });

  it("rejects invalid typed tender case values before commit", () => {
    const errors: string[] = [];

    validateTenderCaseDbSafePayload(errors, {
      biddersParticipated: 1.5,
      cpcInvolved: "Maybe",
      prReceiptDate: "2026-05-19T00:00:00.000Z",
      prValue: "not-a-number",
      qualifiedBidders: -1,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "PR/Scheme Receipt Date must be a valid date.",
        "PR Value / Approved Budget must be a number.",
        "Bidder Participated Count must be a non-negative integer.",
        "Qualified Bidders Count must be a non-negative integer.",
        "CPC Involved? must be Yes or No.",
      ]),
    );
  });
});
