import { describe, expect, it, vi, beforeEach } from "vitest";

// Minimal mock types matching the actual outbox event shape
type OutboxEvent = {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

// ─── Unit tests for retry delay logic ────────────────────────────────────────
// Extract the delay function from the module for isolated testing

function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(attempts - 1, 0), 15 * 60_000);
}

describe("retryDelayMs", () => {
  it("returns 30 000 ms on first failure (attempt 1)", () => {
    expect(retryDelayMs(1)).toBe(30_000);
  });

  it("doubles on each retry (attempt 2 → 60 000 ms)", () => {
    expect(retryDelayMs(2)).toBe(60_000);
  });

  it("caps at 15 minutes (900 000 ms)", () => {
    expect(retryDelayMs(10)).toBe(15 * 60_000);
  });
});

// ─── DLQ promotion logic ─────────────────────────────────────────────────────

const MAX_OUTBOX_ATTEMPTS = 5;

function shouldMoveToDlq(event: OutboxEvent): boolean {
  return event.attempts + 1 >= MAX_OUTBOX_ATTEMPTS;
}

describe("DLQ promotion", () => {
  it("promotes to DLQ when attempts reach MAX_OUTBOX_ATTEMPTS", () => {
    const event: OutboxEvent = {
      id: "evt-1",
      tenant_id: "tenant-1",
      event_type: "procurement_case.created",
      aggregate_id: "case-1",
      payload: {},
      attempts: MAX_OUTBOX_ATTEMPTS - 1,
    };
    expect(shouldMoveToDlq(event)).toBe(true);
  });

  it("does NOT promote before reaching MAX_OUTBOX_ATTEMPTS", () => {
    const event: OutboxEvent = {
      id: "evt-2",
      tenant_id: "tenant-1",
      event_type: "procurement_case.created",
      aggregate_id: "case-1",
      payload: {},
      attempts: MAX_OUTBOX_ATTEMPTS - 2,
    };
    expect(shouldMoveToDlq(event)).toBe(false);
  });
});

// ─── Queue routing ────────────────────────────────────────────────────────────

type MockQueue = { name: string };

function resolveQueue(eventType: string): string {
  if (eventType === "import_job.created") return "imports";
  if (eventType === "export_job.created") return "exports";
  if (
    eventType.startsWith("procurement_case.") ||
    eventType.startsWith("case_award.") ||
    eventType.startsWith("rc_po_plan.")
  ) return "reporting-projections";
  return "notifications";
}

describe("Queue routing", () => {
  it("routes import_job.created to imports queue", () => {
    expect(resolveQueue("import_job.created")).toBe("imports");
  });

  it("routes export_job.created to exports queue", () => {
    expect(resolveQueue("export_job.created")).toBe("exports");
  });

  it("routes procurement_case.* to reporting-projections queue", () => {
    expect(resolveQueue("procurement_case.created")).toBe("reporting-projections");
    expect(resolveQueue("procurement_case.updated")).toBe("reporting-projections");
    expect(resolveQueue("procurement_case.deleted")).toBe("reporting-projections");
  });

  it("routes case_award.* to reporting-projections queue", () => {
    expect(resolveQueue("case_award.created")).toBe("reporting-projections");
  });

  it("routes rc_po_plan.* to reporting-projections queue", () => {
    expect(resolveQueue("rc_po_plan.updated")).toBe("reporting-projections");
  });

  it("routes notification_job.created to notifications queue", () => {
    expect(resolveQueue("notification_job.created")).toBe("notifications");
  });
});
