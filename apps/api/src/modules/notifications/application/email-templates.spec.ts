import { describe, expect, it } from "vitest";

import {
  buildAccountSetupEmail,
  buildMonthlyPendingTenderReportEmail,
  buildNotificationJobEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildPendingTenderUpdateAlertEmail,
  buildProcurementSnapshotEmail,
  buildRcPoExpiryEmail,
  type NotificationEmailType,
} from "./email-templates.js";

const notificationTypes: NotificationEmailType[] = [
  "delayed_case_alert",
  "entity_monthly_digest",
  "export_ready",
  "import_completed",
  "import_failed",
  "manager_daily_snapshot",
  "off_track_case_alert",
  "password_changed",
  "password_reset",
  "rc_po_expiry",
  "security_alert",
  "stale_tender",
  "user_welcome",
];

describe("email templates", () => {
  it.each(notificationTypes)("renders a concise transactional template for %s", (notificationType) => {
    const email = buildNotificationJobEmail({
      appUrl: "https://procuredesk.example",
      actorEmail: "admin@example.com",
      notificationType,
      subject: `Subject for ${notificationType}`,
      textBody: "Review the attached ProcureDesk context.",
    });

    expect(email.subject).toBe(`Subject for ${notificationType}`);
    expect(email.textBody).toContain("Priority:");
    expect(email.textBody).toContain("Why this matters");
    expect(email.textBody).toContain("What to do");
    expect(email.textBody).not.toContain("Key metrics");
    expect(email.htmlBody).toContain("ProcureDesk");
    expect(email.htmlBody).toContain("Why this matters");
    expect(email.htmlBody).toContain("What to do");
    expect(email.htmlBody).not.toContain("Useful Details");
    expect(email.htmlBody).not.toContain("Best data to include");
  });

  it("adds a useful action button for operational notifications", () => {
    const email = buildNotificationJobEmail({
      appUrl: "https://procuredesk.example",
      notificationType: "rc_po_expiry",
      subject: "RC/PO expiry reminder",
    });

    expect(email.textBody).toContain("Open RC/PO expiry: https://procuredesk.example/reports/rc-po-expiry");
    expect(email.htmlBody).toContain("Open RC/PO expiry");
    expect(email.htmlBody).toContain("https://procuredesk.example/reports/rc-po-expiry");
  });

  it("adds safe account actions for generic security notifications", () => {
    const passwordChanged = buildNotificationJobEmail({
      appUrl: "https://procuredesk.example",
      notificationType: "password_changed",
      subject: "Password changed",
    });
    const passwordReset = buildNotificationJobEmail({
      appUrl: "https://procuredesk.example",
      notificationType: "password_reset",
      subject: "Password reset requested",
    });
    const userWelcome = buildNotificationJobEmail({
      appUrl: "https://procuredesk.example",
      notificationType: "user_welcome",
      subject: "Welcome",
    });

    expect(passwordChanged.textBody).toContain("Open ProcureDesk: https://procuredesk.example/");
    expect(passwordChanged.textBody).toContain("use My Profile");
    expect(passwordReset.textBody).toContain("Open sign in: https://procuredesk.example/");
    expect(passwordReset.textBody).toContain("request a new reset link");
    expect(userWelcome.textBody).toContain("Open sign in: https://procuredesk.example/");
    expect(userWelcome.textBody).toContain("ask your administrator to resend it");
  });

  it("renders password reset with action link and escaped HTML", () => {
    const email = buildPasswordResetEmail({
      expiresIn: "1 hour",
      fullName: "<Praveen>",
      resetUrl: "https://procuredesk.example/reset?token=abc",
    });

    expect(email.subject).toBe("Reset your ProcureDesk password");
    expect(email.textBody).toContain("Reset Password: https://procuredesk.example/reset?token=abc");
    expect(email.textBody).toContain("Security support: Mr. Santanu Mukherjee");
    expect(email.textBody).toContain("Regards,\nProcureDesk Security");
    expect(email.htmlBody).toContain("Reset Password");
    expect(email.htmlBody).toContain("https://procuredesk.example/reset?token=abc");
    expect(email.htmlBody).toContain("Request details");
    expect(email.htmlBody).toContain("If this was not you");
    expect(email.htmlBody).not.toContain("Key metrics");
    expect(email.htmlBody).toContain("&lt;Praveen&gt;");
    expect(email.htmlBody).not.toContain("<Praveen>");
  });

  it("renders password changed confirmation with a safe app action", () => {
    const email = buildPasswordChangedEmail({
      appUrl: "https://procuredesk.example",
      changedAt: new Date("2026-05-18T09:30:00.000Z"),
      fullName: "Praveen Vishnoi",
    });

    expect(email.subject).toBe("Your ProcureDesk password was changed");
    expect(email.textBody).toContain("Open ProcureDesk: https://procuredesk.example/");
    expect(email.textBody).toContain("If this was unexpected");
    expect(email.textBody).toContain("Security details");
    expect(email.htmlBody).toContain("Open ProcureDesk");
    expect(email.htmlBody).toContain("https://procuredesk.example/");
    expect(email.htmlBody).toContain("Password changed successfully");
    expect(email.htmlBody).not.toContain("Key metrics");
  });

  it("renders account setup with action link", () => {
    const email = buildAccountSetupEmail({
      expiresIn: "24 hours",
      fullName: "Rohan Mehta",
      setupUrl: "https://procuredesk.example/reset?token=abc",
    });

    expect(email.subject).toBe("Welcome to Procurement KPI Tracking Portal – Complete Your Account Setup");
    expect(email.textBody).toContain("Set Password: https://procuredesk.example/reset?token=abc");
    expect(email.textBody).toContain("Contact for any queries or issues: Mr. Santanu Mukherjee | 6297445379 | santanu.mukherjee@rpsg.in");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Set Password");
    expect(email.htmlBody).toContain("https://procuredesk.example/reset?token=abc");
    expect(email.htmlBody).toContain("After setup");
    expect(email.htmlBody).toContain("Contact for any queries or issues");
    expect(email.htmlBody).toContain("Regards,<br>System Admin");
    expect(email.htmlBody).toContain("pd-footer-left");
    expect(email.htmlBody).toContain("pd-footer-right");
    expect(email.htmlBody).toContain("System-generated notification. Please do not reply to this email.");
    expect(email.htmlBody).not.toContain("Secure procurement communication from ProcureDesk");
    expect(email.htmlBody).not.toContain("Key metrics");
    expect(email.htmlBody).toContain("Welcome to ProcureDesk");
  });

  it("renders procurement snapshot with executive KPIs and report links", () => {
    const email = buildProcurementSnapshotEmail({
      appUrl: "https://procuredesk.example",
      completedTenders: 18,
      evaluationPendency: 4,
      fullName: "Asha Rao",
      pdfAttached: true,
      runningTenders: 42,
      scopeLabel: "CESC",
      stageAgeingAlerts: 7,
    });

    expect(email.subject).toBe("Procurement Dashboard");
    expect(email.textBody).toContain("Running Tenders: 42");
    expect(email.textBody).toContain("Good Morning Asha,");
    expect(email.textBody).toContain("Please find attached snapshot of procurement function of CESC.");
    expect(email.textBody).toContain("Analytics: https://procuredesk.example/reports/analytics");
    expect(email.textBody).toContain("Analytics page PDF is attached with data filtered to your mapped entity scope.");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Procurement Snapshot");
    expect(email.htmlBody).toContain("Bid Evaluation Pendency");
    expect(email.htmlBody).toContain('href="https://procuredesk.example/reports/analytics" target="_blank"');
    expect(email.htmlBody).toContain('href="https://procuredesk.example/reports/running" target="_blank"');
    expect(email.htmlBody).toContain('display:block;padding:15px 16px;text-decoration:none;');
  });

  it("renders group viewer procurement snapshot with support-team sign-off", () => {
    const email = buildProcurementSnapshotEmail({
      appUrl: "https://procuredesk.rpsg.in",
      completedTenders: 18,
      evaluationPendency: 4,
      fullName: "Praveen Vishnoi",
      runningTenders: 42,
      scopeLabel: "All RPSG entities",
      scopeType: "group",
      stageAgeingAlerts: 7,
    });

    expect(email.subject).toBe("Procurement Dashboard");
    expect(email.textBody).toContain("Good Morning Mr. Praveen,");
    expect(email.textBody).toContain("Please find attached snapshot of procurement function.");
    expect(email.textBody).toContain("Analytics: https://procuredesk.rpsg.in/reports/analytics");
    expect(email.textBody).toContain("Regards,\nProcureDesk Support Team");
    expect(email.htmlBody).toContain("Group-wide");
    expect(email.htmlBody).toContain("ProcureDesk Support Team");
  });

  it("renders pending tender owner alert with required table columns", () => {
    const email = buildPendingTenderUpdateAlertEmail({
      appUrl: "https://procuredesk.example",
      fullName: "Rohan Mehta",
      tenders: [
        {
          currentStageAgeingDays: 12,
          daysSinceLastUpdate: 16,
          description: "Transformer maintenance service",
          entity: "CESC",
          prNumber: "PR-1001",
          runAgeDays: 44,
          tenderStage: "Technical Evaluation",
        },
      ],
      thresholdDays: 10,
    });

    expect(email.subject).toBe("Alert for Pending Tender Progress Updates");
    expect(email.textBody).toContain("Hello Rohan,");
    expect(email.textBody).toContain("tagged under your ownership have not been updated for more than 10 days.");
    expect(email.textBody).toContain("PR Number | PR Description | Tender Stage | Run Age (Days)");
    expect(email.textBody).toContain("PR-1001");
    expect(email.textBody).toContain("You are requested to kindly review and update the respective case status in the system");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Days Since Last Update");
    expect(email.htmlBody).toContain("Update Tender Status");
    expect(email.htmlBody).not.toContain("Attachment included");
  });

  it("renders monthly pending tender report with tender owner column", () => {
    const email = buildMonthlyPendingTenderReportEmail({
      appUrl: "https://procuredesk.example",
      entityGroups: [
        {
          entity: "Haldia",
          tenders: [
            {
              currentStageAgeingDays: 15,
              daysSinceLastUpdate: 22,
              description: "Civil works",
              entity: "Haldia",
              prNumber: "PR-2200",
              runAgeDays: 60,
              tenderOwner: "Rohan Mehta",
              tenderStage: "Commercial Evaluation",
            },
          ],
        },
      ],
      fullName: "Mira Sen",
      scopeLabel: "CESC and Haldia",
      tenders: [
        {
          currentStageAgeingDays: 15,
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
    });

    expect(email.subject).toBe("Alert: Pending Tender Progress Updates");
    expect(email.textBody).toContain("Hello Mira,");
    expect(email.textBody).toContain("under your reporting team, where no status update has been recorded for more than 10 days.");
    expect(email.textBody).toContain("Consolidated pending tender case updates");
    expect(email.textBody).toContain("Tender Owner");
    expect(email.textBody).toContain("Rohan Mehta");
    expect(email.textBody).toContain("You are requested to kindly review the pending cases with the respective Tender Owners");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.htmlBody).toContain("Manager review required");
    expect(email.htmlBody).not.toContain("Excel report is attached");
  });

  it("renders entity RC/PO expiry alert sorted by days remaining with Excel note", () => {
    const email = buildRcPoExpiryEmail({
      appUrl: "https://procuredesk.example",
      excelAttached: true,
      fullName: "Mira Sen",
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
      scopeLabel: "CESC and Haldia",
      scopeType: "entity",
      thresholdDays: 90,
    });

    expect(email.subject).toBe("Alert: RC/PO Expiring in next 90 days");
    expect(email.textBody).toContain("Hello Mira,");
    expect(email.textBody).toContain("under your entity are scheduled to expire within the next 90 days.");
    expect(email.textBody).toContain("The attached Excel report contains the details of the upcoming expiries");
    expect(email.textBody).toContain("PO/RC Award Date");
    expect(email.textBody).toContain("Days remaining to expire");
    expect(email.textBody).toContain("Regards,\nSystem Admin");
    expect(email.textBody.indexOf("Safety audit")).toBeLessThan(email.textBody.indexOf("Annual maintenance"));
    expect(email.htmlBody).toContain("Open RC/PO Expiry Report");
    expect(email.htmlBody).toContain("Excel report attached");
    expect(email.htmlBody).toContain("XLSX");
  });

  it("renders group viewer RC/PO expiry alert with Mr greeting", () => {
    const email = buildRcPoExpiryEmail({
      appUrl: "https://procuredesk.example",
      excelAttached: true,
      fullName: "Praveen Vishnoi",
      items: [
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
    });

    expect(email.subject).toBe("Alert: RC/PO Expiring in next 90 days");
    expect(email.textBody).toContain("Hello Mr. Praveen,");
    expect(email.textBody).toContain("RC(s)/PO(s) are scheduled to expire within the next 90 days.");
    expect(email.textBody).not.toContain("under your entity");
    expect(email.htmlBody).toContain("Group-wide");
    expect(email.htmlBody).toContain("Excel report attached");
    expect(email.htmlBody).toContain("System Admin");
  });
});
