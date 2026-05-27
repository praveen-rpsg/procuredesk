import { describe, expect, it } from "vitest";

import { renderNotificationTemplate } from "./notification-template-renderer.js";

const fallback = {
  htmlBody: "<p>fallback</p>",
  subject: "Fallback subject",
  textBody: "fallback",
};

describe("notification template renderer", () => {
  it("renders scheduled email content from the published template version metadata", () => {
    const email = renderNotificationTemplate({
      fallback,
      notificationType: "manager_daily_snapshot",
      payload: {
        completedTenders: 8,
        evaluationPendency: 3,
        fullName: "Asha Rao",
        runningTenders: 12,
        scopeLabel: "CESC",
        stageAgeingAlerts: 2,
      },
      templateVersion: {
        id: "template-version-id",
        preheaderTemplate: "Snapshot ready",
        rendererKey: "procurement_snapshot",
        subjectTemplate: "Daily Procurement Snapshot for {{scopeLabel}}",
      },
    });

    expect(email.subject).toBe("Daily Procurement Snapshot for CESC");
    expect(email.textBody).toContain("Good Morning Asha,");
    expect(email.textBody).toContain("Please find attached snapshot of procurement function of CESC.");
    expect(email.textBody).toContain("Running Tenders: 12");
    expect(email.textBody).toContain("Analytics:");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Procurement Snapshot");
    expect(email.htmlBody).toContain("Analytics page PDF is attached");
    expect(email.htmlBody).toContain('href="http://localhost:5175/reports/analytics" target="_blank"');
    expect(email.htmlBody).toContain('href="http://localhost:5175/reports/running" target="_blank"');
    expect(email.htmlBody).toContain('display:block;padding:15px 16px;text-decoration:none;');
    expect(email.htmlBody).toContain("pd-footer-left");
    expect(email.htmlBody).toContain("pd-footer-right");
    expect(email.htmlBody).toContain("System-generated notification. Please do not reply to this email.");
    expect(email.htmlBody).not.toContain("Secure procurement communication from ProcureDesk");
    expect(email.htmlBody).not.toContain("fallback");
  });

  it("renders group viewer snapshot with approved group wording", () => {
    const email = renderNotificationTemplate({
      fallback,
      notificationType: "manager_daily_snapshot",
      payload: {
        completedTenders: 18,
        evaluationPendency: 4,
        fullName: "Praveen Vishnoi",
        runningTenders: 42,
        scopeLabel: "All RPSG entities",
        scopeType: "group",
        stageAgeingAlerts: 7,
      },
      templateVersion: {
        id: "template-version-id",
        preheaderTemplate: "Snapshot ready",
        rendererKey: "procurement_snapshot",
        subjectTemplate: "Procurement Dashboard",
      },
    });

    expect(email.subject).toBe("Procurement Dashboard");
    expect(email.textBody).toContain("Good Morning Mr. Praveen,");
    expect(email.textBody).toContain("Please find attached snapshot of procurement function.");
    expect(email.textBody).toContain("Analytics:");
    expect(email.textBody).toContain("Regards,\nProcureDesk Support Team");
    expect(email.htmlBody).toContain("Analytics page PDF is attached for offline review.");
  });

  it("renders pending tender owner alert with a structured severity table", () => {
    const email = renderNotificationTemplate({
      fallback,
      notificationType: "stale_tender",
      payload: {
        appUrl: "https://procuredesk.rpsg.in",
        fullName: "Rohan Mehta",
        tenders: [
          {
            currentStageAgeingDays: 16,
            daysSinceLastUpdate: 22,
            description: "Transformer maintenance service",
            entity: "CESC",
            prNumber: "PR-1001",
            runAgeDays: 44,
            tenderStage: "Technical Evaluation",
          },
        ],
        thresholdDays: 10,
      },
      templateVersion: {
        id: "template-version-id",
        preheaderTemplate: null,
        rendererKey: "pending_tender_update_alert",
        subjectTemplate: "Alert for Pending Tender Progress Updates",
      },
    });

    expect(email.subject).toBe("Alert for Pending Tender Progress Updates");
    expect(email.textBody).toContain("Hello Rohan,");
    expect(email.textBody).toContain("tagged under your ownership have not been updated for more than 10 days.");
    expect(email.textBody).toContain("PR Number | PR Description | Tender Stage | Run Age (Days)");
    expect(email.textBody).toContain("You are requested to kindly review and update the respective case status in the system");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Running tender(s) pending update");
    expect(email.htmlBody).toContain("PR-1001");
    expect(email.htmlBody).toContain("Update Tender Status");
    expect(email.htmlBody).not.toContain("Analytics snapshot attached");
  });

  it("renders monthly pending tender reports without attachments", () => {
    const email = renderNotificationTemplate({
      fallback,
      notificationType: "entity_monthly_digest",
      payload: {
        appUrl: "https://procuredesk.rpsg.in",
        fullName: "Mira Sen",
        scopeLabel: "CESC and Haldia",
        tenders: [
          {
            currentStageAgeingDays: 11,
            daysSinceLastUpdate: 22,
            description: "Civil works",
            entity: "Haldia",
            prNumber: "PR-2200",
            runAgeDays: 60,
            tenderOwner: "Rohan Mehta",
            tenderStage: "Commercial Evaluation",
          },
        ],
        thresholdDays: 10,
      },
      templateVersion: {
        id: "template-version-id",
        preheaderTemplate: null,
        rendererKey: "monthly_pending_tender_report",
        subjectTemplate: "Alert: Pending Tender Progress Updates",
      },
    });

    expect(email.subject).toBe("Alert: Pending Tender Progress Updates");
    expect(email.textBody).toContain("Hello Mira,");
    expect(email.textBody).toContain("under your reporting team, where no status update has been recorded for more than 10 days.");
    expect(email.textBody).toContain("Consolidated pending tender case updates");
    expect(email.textBody).toContain("Tender Owner");
    expect(email.textBody).toContain("Rohan Mehta");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Consolidated pending tender case updates");
    expect(email.htmlBody).toContain("Review Running Tenders");
    expect(email.htmlBody).not.toContain("Excel report is attached");
  });

  it("renders group viewer RC/PO expiry reports with Excel attachment note", () => {
    const email = renderNotificationTemplate({
      fallback,
      notificationType: "rc_po_expiry",
      payload: {
        appUrl: "https://procuredesk.rpsg.in",
        fullName: "Praveen Vishnoi",
        items: [
          {
            daysRemaining: 45,
            entity: "CESC",
            owner: "Asha Rao",
            rcPoAwardDate: "2025-01-10",
            rcPoValidityDate: "2026-07-09",
            rcPoValue: "INR 12,00,000",
            tenderName: "Annual maintenance",
          },
          {
            daysRemaining: 9,
            entity: "Haldia",
            owner: "Rohan Mehta",
            rcPoAwardDate: "2025-02-20",
            rcPoValidityDate: "2026-06-03",
            rcPoValue: "INR 4,50,000",
            tenderName: "Safety audit",
          },
        ],
        scopeLabel: "All RPSG entities",
        scopeType: "group",
        thresholdDays: 90,
      },
      templateVersion: {
        id: "template-version-id",
        preheaderTemplate: null,
        rendererKey: "rc_po_expiry_alert",
        subjectTemplate: "Alert: RC/PO Expiring in next 90 days",
      },
    });

    expect(email.subject).toBe("Alert: RC/PO Expiring in next 90 days");
    expect(email.textBody).toContain("Hello Mr. Praveen,");
    expect(email.textBody).toContain("RC(s)/PO(s) are scheduled to expire within the next 90 days.");
    expect(email.textBody).toContain("The attached Excel report contains the details of the upcoming expiries");
    expect(email.textBody).toContain("PO/RC Award Date");
    expect(email.textBody).toContain("Days remaining to expire");
    expect(email.textBody.indexOf("Safety audit")).toBeLessThan(email.textBody.indexOf("Annual maintenance"));
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Group-wide");
    expect(email.htmlBody).toContain("Open RC/PO Expiry Report");
    expect(email.htmlBody).toContain("Excel report attached");
    expect(email.htmlBody).toContain("XLSX");
  });

  it("falls back safely when a template version is unavailable", () => {
    const email = renderNotificationTemplate({
      fallback,
      notificationType: "stale_tender",
      payload: {},
      templateVersion: null,
    });

    expect(email).toEqual(fallback);
  });
});
