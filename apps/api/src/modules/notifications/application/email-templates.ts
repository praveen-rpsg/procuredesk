export type NotificationEmailType =
  | "delayed_case_alert"
  | "entity_monthly_digest"
  | "export_ready"
  | "import_completed"
  | "import_failed"
  | "manager_daily_snapshot"
  | "off_track_case_alert"
  | "password_changed"
  | "password_reset"
  | "rc_po_expiry"
  | "security_alert"
  | "stale_tender"
  | "user_welcome";

export type EmailDetail = {
  label: string;
  value: string | null | undefined;
};

export type EmailSection = {
  body: string;
  title: string;
};

export type ProcureDeskEmail = {
  htmlBody: string;
  subject: string;
  textBody: string;
};

type EmailAction = {
  href: string;
  label: string;
};

export function buildAccountSetupEmail(input: {
  expiresIn: string;
  fullName: string;
  setupUrl: string;
}): ProcureDeskEmail {
  return renderProcureDeskEmail({
    action: { href: input.setupUrl, label: "Set password" },
    details: [
      { label: "Account", value: input.fullName },
      { label: "Link expires", value: input.expiresIn },
    ],
    intro:
      "An administrator created a ProcureDesk account for you. Set your password to finish setup.",
    preheader: "Set your ProcureDesk password to finish account setup.",
    sections: [
      {
        body: "After signing in, confirm that your role and entity access look correct. If your workspace is empty, ask your administrator to check your entity mapping.",
        title: "After setup",
      },
      {
        body: "Use this link only if you were expecting a ProcureDesk account. Do not forward this email.",
        title: "Security note",
      },
    ],
    subject: "Set up your ProcureDesk account",
    title: "Welcome to ProcureDesk",
  });
}

export function buildPasswordResetEmail(input: {
  expiresIn: string;
  fullName: string;
  resetUrl: string;
}): ProcureDeskEmail {
  return renderProcureDeskEmail({
    action: { href: input.resetUrl, label: "Reset password" },
    details: [
      { label: "Account", value: input.fullName },
      { label: "Link expires", value: input.expiresIn },
    ],
    intro:
      "We received a request to reset your ProcureDesk password. Use the secure link below if this request was yours.",
    preheader: "Reset your ProcureDesk password using this secure link.",
    sections: [
      {
        body: "If you did not request this, ignore the link and contact your administrator. Your password is not changed until you choose a new one.",
        title: "If this was not you",
      },
    ],
    subject: "Reset your ProcureDesk password",
    title: "Password Reset",
  });
}

export function buildPasswordChangedEmail(input: {
  appUrl: string;
  changedAt?: Date | undefined;
  fullName: string;
}): ProcureDeskEmail {
  return renderProcureDeskEmail({
    action: { href: buildAppUrl(input.appUrl, "/"), label: "Open ProcureDesk" },
    details: [
      { label: "Account", value: input.fullName },
      { label: "Changed", value: formatEmailDate(input.changedAt ?? new Date()) },
    ],
    intro: "Your ProcureDesk password was changed.",
    preheader: "Your ProcureDesk password was changed.",
    sections: [
      {
        body: "No action is needed if you made this change. To update it again, open ProcureDesk and use My Profile.",
        title: "What to do",
      },
      {
        body: "If this was unexpected, contact your administrator immediately.",
        title: "Security note",
      },
    ],
    subject: "Your ProcureDesk password was changed",
    title: "Password Changed",
  });
}

export function buildNotificationJobEmail(input: {
  actorEmail?: string | null;
  appUrl?: string | null | undefined;
  generatedAt?: Date;
  notificationType: NotificationEmailType | string;
  subject: string;
  textBody?: string | null | undefined;
}): ProcureDeskEmail {
  const meta = notificationMetadata(input.notificationType);
  const generatedAt = input.generatedAt ?? new Date();
  const summary = normalizeBody(input.textBody) ?? meta.summary;
  const action = meta.action
    ? {
        href: buildAppUrl(input.appUrl, meta.action.path),
        label: meta.action.label,
      }
    : undefined;

  return renderProcureDeskEmail({
    action,
    details: [
      { label: "Priority", value: meta.priority },
      { label: "Generated", value: formatEmailDate(generatedAt) },
    ],
    intro: summary,
    preheader: meta.preheader,
    sections: [
      { body: meta.reason, title: "Why this matters" },
      { body: meta.nextStep, title: "What to do" },
    ],
    subject: input.subject,
    title: meta.title,
  });
}

export function renderProcureDeskEmail(input: {
  action?: EmailAction | undefined;
  details?: EmailDetail[];
  intro: string;
  preheader: string;
  sections?: EmailSection[];
  subject: string;
  title: string;
}): ProcureDeskEmail {
  const details = (input.details ?? []).filter((detail) => hasText(detail.value));
  const sections = (input.sections ?? []).filter((section) => section.body.trim());
  const textBody = renderTextBody(input, details, sections);
  const htmlBody = renderHtmlBody(input, details, sections);
  return { htmlBody, subject: input.subject, textBody };
}

function renderTextBody(
  input: Parameters<typeof renderProcureDeskEmail>[0],
  details: EmailDetail[],
  sections: EmailSection[],
): string {
  const lines = [input.title, "", input.intro, ""];

  if (details.length) {
    for (const detail of details) {
      lines.push(`${detail.label}: ${detail.value ?? ""}`);
    }
    lines.push("");
  }

  for (const section of sections) {
    lines.push(section.title);
    lines.push(section.body, "");
  }

  if (input.action) {
    lines.push(`${input.action.label}: ${input.action.href}`, "");
  }

  lines.push("ProcureDesk", "This is an automated notification. Do not reply to this email.");
  return lines.join("\n");
}

function renderHtmlBody(
  input: Parameters<typeof renderProcureDeskEmail>[0],
  details: EmailDetail[],
  sections: EmailSection[],
): string {
  const detailsHtml = details.length
    ? `
      <div style="margin-top:18px;padding:12px 14px;background:#f8fafc;border:1px solid #d7dee8;border-radius:8px;">
        ${details
          .map(
            (detail) => `
              <p style="margin:0 0 6px 0;font-size:13px;line-height:19px;color:#172033;">
                <strong style="color:#536174;">${escapeHtml(detail.label)}:</strong>
                ${escapeHtml(String(detail.value ?? ""))}
              </p>`,
          )
          .join("")}
      </div>`
    : "";
  const sectionsHtml = sections
    .map(
      (section) => `
        <div style="margin-top:18px;">
          <h2 style="margin:0 0 6px 0;font-size:15px;line-height:21px;color:#172033;">${escapeHtml(section.title)}</h2>
          <p style="margin:0;font-size:14px;line-height:22px;color:#243047;">${escapeHtml(section.body)}</p>
        </div>`,
    )
    .join("");
  const actionHtml = input.action
    ? `
      <table role="presentation" style="border-collapse:collapse;margin-top:22px;">
        <tr>
          <td style="background:#155eef;border-radius:6px;">
            <a href="${escapeAttribute(input.action.href)}" style="display:inline-block;padding:11px 16px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(input.action.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" style="border-collapse:collapse;background:#eef2f7;padding:0;margin:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" style="max-width:640px;border-collapse:collapse;background:#ffffff;border:1px solid #d7dee8;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#172033;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b8c7dc;font-weight:700;">ProcureDesk</div>
                <h1 style="margin:7px 0 0 0;font-size:22px;line-height:28px;color:#ffffff;">${escapeHtml(input.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0;font-size:15px;line-height:23px;color:#243047;">${escapeHtml(input.intro)}</p>
                ${detailsHtml}
                ${sectionsHtml}
                ${actionHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:15px 24px;background:#f8fafc;border-top:1px solid #d7dee8;font-size:12px;line-height:18px;color:#536174;">
                This is an automated ProcureDesk notification. Do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

type NotificationMetadata = {
  action?: { label: string; path: string } | undefined;
  category: string;
  nextStep: string;
  preheader: string;
  priority: string;
  reason: string;
  summary: string;
  title: string;
};

function notificationMetadata(type: string): NotificationMetadata {
  const fallback: NotificationMetadata = {
    action: { label: "Open ProcureDesk", path: "/" },
    category: "Operations",
    nextStep: "Open ProcureDesk and review the related item.",
    preheader: "A ProcureDesk notification is ready for review.",
    priority: "Normal",
    reason: "A configured ProcureDesk rule generated this notification for an item in your scope.",
    summary: "A ProcureDesk notification was generated for your review.",
    title: "ProcureDesk Notification",
  };
  const map: Record<string, NotificationMetadata> = {
    delayed_case_alert: {
      action: { label: "Review delayed cases", path: "/cases?trackStatus=delayed" },
      category: "Cases",
      nextStep: "Check the case owner, latest milestone, and delay reason. Update the case or escalate the blocker if action is pending.",
      preheader: "A procurement case is delayed and needs attention.",
      priority: "High",
      reason: "A running procurement case has crossed the configured delay rule.",
      summary: "A procurement case is delayed and needs review.",
      title: "Delayed Case Alert",
    },
    entity_monthly_digest: {
      action: { label: "Open analytics", path: "/reports/analytics" },
      category: "Reports",
      nextStep: "Review the monthly position, then focus on delayed work, high-value awards, and upcoming renewals.",
      preheader: "Your monthly procurement summary is ready.",
      priority: "Normal",
      reason: "You receive this summary because you have entity-level procurement visibility.",
      summary: "Your monthly procurement summary is ready for review.",
      title: "Monthly Procurement Digest",
    },
    export_ready: {
      action: { label: "Open export jobs", path: "/reports/export-jobs" },
      category: "Reports",
      nextStep: "Download the export before it expires. Store and share the file according to your organisation's data policy.",
      preheader: "Your ProcureDesk export is ready to download.",
      priority: "Normal",
      reason: "A report export requested from ProcureDesk has finished processing.",
      summary: "Your report export is ready to download.",
      title: "Export Ready",
    },
    import_completed: {
      action: { label: "Open import jobs", path: "/imports/jobs" },
      category: "Imports",
      nextStep: "Spot-check the imported records and confirm the expected rows are available in the relevant module.",
      preheader: "A ProcureDesk import completed successfully.",
      priority: "Normal",
      reason: "An import job completed and accepted rows were committed to live data.",
      summary: "An import job completed successfully.",
      title: "Import Completed",
    },
    import_failed: {
      action: { label: "Review import job", path: "/imports/jobs" },
      category: "Imports",
      nextStep: "Download the problem rows, correct the file, and upload it again.",
      preheader: "A ProcureDesk import failed and needs correction.",
      priority: "High",
      reason: "The uploaded file had validation or processing errors, so invalid rows were not committed.",
      summary: "An import job failed and needs correction.",
      title: "Import Failed",
    },
    manager_daily_snapshot: {
      action: { label: "Open dashboard", path: "/" },
      category: "Dashboard",
      nextStep: "Start with delayed and off-track cases, then review priority cases and contracts nearing expiry.",
      preheader: "Your daily procurement snapshot is ready.",
      priority: "Normal",
      reason: "You receive this daily snapshot because you have manager-level procurement visibility.",
      summary: "Your daily procurement snapshot is ready.",
      title: "Daily Procurement Snapshot",
    },
    off_track_case_alert: {
      action: { label: "Review off-track cases", path: "/cases?trackStatus=off_track" },
      category: "Cases",
      nextStep: "Confirm whether the case has progressed offline. If it has, update the missing milestone or owner remarks.",
      preheader: "A procurement case is off track.",
      priority: "High",
      reason: "A case is behind the expected stage or target marker and may become delayed if no action is taken.",
      summary: "A procurement case is off track and needs follow-up.",
      title: "Off-Track Case Alert",
    },
    password_changed: {
      action: { label: "Open ProcureDesk", path: "/" },
      category: "Security",
      nextStep:
        "No action is needed if you changed it. To update it again, open ProcureDesk and use My Profile. If this was unexpected, contact your administrator immediately.",
      preheader: "Your ProcureDesk password was changed.",
      priority: "High",
      reason: "ProcureDesk sends this confirmation whenever your account password changes.",
      summary: "Your ProcureDesk password was changed.",
      title: "Password Changed",
    },
    password_reset: {
      action: { label: "Open sign in", path: "/" },
      category: "Security",
      nextStep:
        "Use the secure reset email only if you requested it. If the reset link is missing or expired, open sign in and request a new reset link.",
      preheader: "A password reset was requested for your ProcureDesk account.",
      priority: "High",
      reason: "A forgot-password request was submitted for your account.",
      summary: "A password reset was requested for your ProcureDesk account.",
      title: "Password Reset Requested",
    },
    rc_po_expiry: {
      action: { label: "Open RC/PO expiry", path: "/reports/rc-po-expiry" },
      category: "Planning",
      nextStep: "Review the contract validity, create a tender plan or procurement case, and mark tender floated when renewal starts.",
      preheader: "A contract or PO is approaching expiry.",
      priority: "High",
      reason: "A contract or purchase order is inside the configured expiry reminder window.",
      summary: "A contract or PO is approaching expiry.",
      title: "RC/PO Expiry Reminder",
    },
    security_alert: {
      action: { label: "Open audit logs", path: "/admin/audit-logs" },
      category: "Security",
      nextStep: "Review the activity. If it looks unfamiliar, contact your administrator and secure the affected account.",
      preheader: "A ProcureDesk security event needs review.",
      priority: "High",
      reason: "ProcureDesk detected security-sensitive activity that should be reviewed.",
      summary: "A security event needs review.",
      title: "Security Alert",
    },
    stale_tender: {
      action: { label: "Review running cases", path: "/cases?status=running" },
      category: "Cases",
      nextStep: "Open the case and add the latest milestone, status, or owner remarks.",
      preheader: "A running procurement case has no recent update.",
      priority: "Medium",
      reason: "A running case has not been updated within the configured reminder threshold.",
      summary: "A running procurement case needs an update.",
      title: "No Recent Update Reminder",
    },
    user_welcome: {
      action: { label: "Open sign in", path: "/" },
      category: "Account Setup",
      nextStep:
        "Use the secure setup email to set your password. If the setup link is missing or expired, ask your administrator to resend it.",
      preheader: "Your ProcureDesk account is ready.",
      priority: "Normal",
      reason: "An administrator created or invited your ProcureDesk account.",
      summary: "Your ProcureDesk account is ready for setup.",
      title: "Welcome to ProcureDesk",
    },
  };
  return map[type] ?? fallback;
}

function buildAppUrl(appUrl: string | null | undefined, path: string): string {
  const baseUrl = appUrl?.trim() || "http://localhost:5175";
  return new URL(path, baseUrl).toString();
}

function formatEmailDate(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

function normalizeBody(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
