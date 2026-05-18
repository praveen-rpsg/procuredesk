import { describe, expect, it } from "vitest";

import {
  buildAccountSetupEmail,
  buildNotificationJobEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
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
    expect(email.textBody).toContain("Reset password: https://procuredesk.example/reset?token=abc");
    expect(email.htmlBody).toContain("Reset password");
    expect(email.htmlBody).toContain("https://procuredesk.example/reset?token=abc");
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
    expect(email.htmlBody).toContain("Open ProcureDesk");
    expect(email.htmlBody).toContain("https://procuredesk.example/");
    expect(email.htmlBody).not.toContain("Key metrics");
  });

  it("renders account setup with action link", () => {
    const email = buildAccountSetupEmail({
      expiresIn: "24 hours",
      fullName: "Rohan Mehta",
      setupUrl: "https://procuredesk.example/reset?token=abc",
    });

    expect(email.subject).toBe("Set up your ProcureDesk account");
    expect(email.textBody).toContain("Set password: https://procuredesk.example/reset?token=abc");
    expect(email.htmlBody).toContain("Set password");
    expect(email.htmlBody).toContain("https://procuredesk.example/reset?token=abc");
    expect(email.htmlBody).toContain("After setup");
    expect(email.htmlBody).not.toContain("Key metrics");
    expect(email.htmlBody).toContain("Welcome to ProcureDesk");
  });
});
