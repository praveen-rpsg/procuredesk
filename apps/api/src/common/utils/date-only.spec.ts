import { afterEach, describe, expect, it } from "vitest";

import {
  addDaysToDateOnly,
  diffDateOnlyDays,
  isDateOnlyString,
  todayDateOnlyString,
  toDateOnlyString,
} from "./date-only.js";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone == null) {
    delete process.env.TZ;
    return;
  }
  process.env.TZ = originalTimeZone;
});

describe("date-only utilities", () => {
  it("keeps local midnight calendar dates unchanged in Asia/Kolkata", () => {
    process.env.TZ = "Asia/Kolkata";
    const localMidnight = new Date(2026, 4, 11);

    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-05-10");
    expect(toDateOnlyString(localMidnight)).toBe("2026-05-11");
  });

  it("validates real calendar dates without ISO round trips", () => {
    expect(isDateOnlyString("2026-02-28")).toBe(true);
    expect(isDateOnlyString("2026-02-29")).toBe(false);
    expect(isDateOnlyString("2026-13-01")).toBe(false);
  });

  it("normalizes date-prefixed strings for date input payloads", () => {
    expect(toDateOnlyString("2026-05-11T00:00:00.000Z")).toBe("2026-05-11");
  });

  it("adds days without changing the date through timezone conversion", () => {
    expect(addDaysToDateOnly("2026-05-11", 30)).toBe("2026-06-10");
  });

  it("uses the local calendar date for today", () => {
    process.env.TZ = "Asia/Kolkata";

    expect(todayDateOnlyString(new Date("2026-05-10T18:30:00.000Z"))).toBe("2026-05-11");
  });

  it("compares date-only values as whole calendar days", () => {
    expect(diffDateOnlyDays("2026-05-11", "2026-05-01")).toBe(10);
  });
});
