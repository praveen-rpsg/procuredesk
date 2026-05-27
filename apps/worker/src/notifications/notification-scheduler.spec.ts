import { describe, expect, it } from "vitest";

import { calculateNextNotificationScheduleRun } from "./notification-scheduler.js";

describe("calculateNextNotificationScheduleRun", () => {
  it("initializes a daily IST schedule to today's run time when still upcoming", () => {
    const nextRun = calculateNextNotificationScheduleRun(
      {
        cadence: "daily",
        day_of_month: null,
        interval_days: null,
        next_run_at: null,
        run_time: "10:00:00",
      },
      new Date("2026-05-25T03:00:00.000Z"),
    );

    expect(nextRun.toISOString()).toBe("2026-05-25T04:30:00.000Z");
  });

  it("moves a daily IST schedule to tomorrow when today's run time has passed", () => {
    const nextRun = calculateNextNotificationScheduleRun(
      {
        cadence: "daily",
        day_of_month: null,
        interval_days: null,
        next_run_at: null,
        run_time: "10:00:00",
      },
      new Date("2026-05-25T06:00:00.000Z"),
    );

    expect(nextRun.toISOString()).toBe("2026-05-26T04:30:00.000Z");
  });

  it("advances every-n-days schedules from the previous scheduled run", () => {
    const nextRun = calculateNextNotificationScheduleRun(
      {
        cadence: "every_n_days",
        day_of_month: null,
        interval_days: 3,
        next_run_at: new Date("2026-05-25T05:30:00.000Z"),
        run_time: "11:00:00",
      },
      new Date("2026-05-25T05:30:01.000Z"),
    );

    expect(nextRun.toISOString()).toBe("2026-05-28T05:30:00.000Z");
  });

  it("schedules monthly runs on day one at the configured IST time", () => {
    const nextRun = calculateNextNotificationScheduleRun(
      {
        cadence: "monthly",
        day_of_month: 1,
        interval_days: null,
        next_run_at: null,
        run_time: "09:30:00",
      },
      new Date("2026-05-25T05:00:00.000Z"),
    );

    expect(nextRun.toISOString()).toBe("2026-06-01T04:00:00.000Z");
  });
});
