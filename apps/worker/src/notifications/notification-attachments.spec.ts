import { describe, expect, it } from "vitest";

import { createAnalyticsSnapshotPdf, createSimplePdf, createWelcomeManualPdf } from "./notification-attachments.js";

describe("notification attachments", () => {
  it("creates a minimal valid PDF buffer", () => {
    const pdf = createSimplePdf(["ProcureDesk Procurement Snapshot", "Running Tenders: 42"]);

    expect(pdf.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
    expect(pdf.toString("utf8")).toContain("ProcureDesk Procurement Snapshot");
    expect(pdf.toString("utf8")).toContain("%%EOF");
  });

  it("escapes PDF text control characters", () => {
    const pdf = createSimplePdf(["RC/PO (critical) \\ renewal"]);

    expect(pdf.toString("utf8")).toContain("RC/PO \\(critical\\) \\\\ renewal");
  });

  it("creates the welcome user manual PDF with support details", () => {
    const pdf = createWelcomeManualPdf({
      support: {
        email: "support@example.com",
        name: "ProcureDesk Support",
        phone: "+91 99999 99999",
      },
    });

    const content = pdf.toString("utf8");
    expect(content).toContain("ProcureDesk User Manual");
    expect(content).toContain("ProcureDesk Support");
    expect(content).toContain("support@example.com");
  });

  it("creates a role-scoped analytics snapshot PDF", () => {
    const pdf = createAnalyticsSnapshotPdf({
      averages: {
        biddersParticipated: 4.8,
        cycleTimeDays: 96.3,
        qualifiedBidders: 4.1,
        runningTenderAgeDays: 64,
      },
      departmentRows: [
        {
          caseCount: 16,
          departmentName: "Mains",
          entityName: "CESC-KOL-DIST",
          natureOfWorkName: "Supply",
        },
      ],
      entityRows: [
        {
          caseCount: 28,
          completedCount: 14,
          delayedCount: 14,
          entityName: "CESC-KOL-DIST",
          offTrackCount: 13,
          onTrackCount: 1,
          prValue: 190163000,
          priorityCount: 2,
          runningCount: 14,
        },
      ],
      generatedAt: new Date("2026-05-26T04:42:00.000Z"),
      kpis: {
        completedCases: 16,
        delayedCases: 13,
        evaluationPendency: 12,
        offTrackCases: 13,
        onTrackCases: 1,
        priorityCases: 10,
        runningCases: 27,
        savingsWrtEstimate: 8443000,
        savingsWrtPr: 32212000,
        stageAgeingAlerts: 19,
        totalApprovedAmount: 85261000,
        totalCases: 43,
        totalPrValue: 309306000,
      },
      quickLinks: [{ label: "Analytics", path: "/reports/analytics" }],
      recipientName: "Praveen Vishnoi",
      scopeLabel: "CESC-KOL-DIST",
      scopeType: "entity",
      stageRows: [{ caseCount: 7, stageCode: 0 }],
      tenderTypeRows: [
        {
          caseCount: 36,
          delayedCount: 10,
          offTrackCount: 11,
          onTrackCount: 15,
          tenderTypeName: "Limited",
        },
      ],
    });

    const content = pdf.toString("utf8");
    expect(content).toContain("Procurement Dashboard");
    expect(content).toContain("Scope: Entity Manager / Viewer -");
    expect(content).toContain("CESC-KOL-DIST");
    expect(content).toContain("Case portfolio tiles");
    expect(content).toContain("Tender Track Analysis");
    expect(content).toContain("Stage 0 - PR under review by Buyer");
    expect(content).toContain("%%EOF");
  });
});
