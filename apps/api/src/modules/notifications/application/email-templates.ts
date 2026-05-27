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
  preheader: string;
  subject: string;
  textBody: string;
};

type EmailAction = {
  href: string;
  label: string;
};

type EmailTone = "critical" | "danger" | "info" | "neutral" | "success" | "warning";

type EmailKpi = {
  caption?: string | undefined;
  label: string;
  tone?: EmailTone | undefined;
  value: string | number;
};

type EmailTableColumn<Row extends Record<string, unknown>> = {
  align?: "left" | "right" | undefined;
  format?: ((value: unknown, row: Row) => string) | undefined;
  key: keyof Row;
  label: string;
  tone?: ((value: unknown, row: Row) => EmailTone | undefined) | undefined;
};

type EmailTable<Row extends Record<string, unknown>> = {
  columns: Array<EmailTableColumn<Row>>;
  emptyText?: string | undefined;
  maxRows?: number | undefined;
  rows: Row[];
  title?: string | undefined;
};

type ReportLink = {
  href: string;
  label: string;
  summary: string;
};

type EnterpriseEmailInput = {
  actions?: EmailAction[] | undefined;
  alert?: { body: string; tone: EmailTone; title: string } | undefined;
  attachmentNote?: string | undefined;
  details?: EmailDetail[] | undefined;
  detailsTitle?: string | undefined;
  footerNote?: string | undefined;
  generatedAt?: Date | undefined;
  greeting?: string | undefined;
  intro: string;
  kpis?: EmailKpi[] | undefined;
  preheader: string;
  reportLinks?: ReportLink[] | undefined;
  signOff?: string | undefined;
  sections?: EmailSection[] | undefined;
  subject: string;
  support?: EmailSupport | undefined;
  supportHeading?: string | undefined;
  tables?: Array<EmailTable<Record<string, unknown>>> | undefined;
  title: string;
};

type ResolvedEnterpriseEmailInput =
  Required<Pick<EnterpriseEmailInput, "intro" | "preheader" | "subject" | "title">> & {
    actions: EmailAction[];
    alert: EnterpriseEmailInput["alert"] | undefined;
    attachmentNote: string | undefined;
    details: EmailDetail[];
    detailsTitle: string;
    footerNote: string | undefined;
    generatedAt: Date;
    greeting: string | undefined;
    kpis: EmailKpi[] | undefined;
    reportLinks: ReportLink[];
    signOff: string | undefined;
    sections: EmailSection[];
    support: EmailSupport;
    supportHeading: string;
    tables: Array<EmailTable<Record<string, unknown>>>;
  };

export type EmailSupport = {
  email: string;
  name: string;
  phone?: string | undefined;
};

export type TenderUpdateAlertRow = {
  currentStageAgeingDays: number | string;
  daysSinceLastUpdate: number | string;
  description: string;
  entity: string;
  prNumber: string;
  runAgeDays: number | string;
  tenderOwner?: string | undefined;
  tenderStage: string;
};

export type TenderUpdateEntityGroup = {
  entity: string;
  tenders: TenderUpdateAlertRow[];
};

export type RcPoExpiryRow = {
  daysRemaining: number | string;
  entity: string;
  owner: string;
  rcPoAwardDate: string;
  rcPoValidityDate: string;
  rcPoValue: string;
  tenderName: string;
};

export type ProcurementSnapshotInput = {
  appUrl?: string | null | undefined;
  completedTenders?: number | undefined;
  evaluationPendency?: number | undefined;
  fullName: string;
  generatedAt?: Date | undefined;
  pdfAttached?: boolean | undefined;
  runningTenders?: number | undefined;
  scopeLabel?: string | undefined;
  scopeType?: "entity" | "group" | undefined;
  stageAgeingAlerts?: number | undefined;
  support?: EmailSupport | undefined;
};

type RcPoExpiryScopeType = "entity" | "group";

export const DEFAULT_EMAIL_SUPPORT: EmailSupport = {
  email: "santanu.mukherjee@rpsg.in",
  name: "Mr. Santanu Mukherjee",
  phone: "6297445379",
};

const BRAND = {
  appName: "ProcureDesk",
  organization: "RPSG",
  productLine: "Procurement KPI Tracking Portal",
};

export const ENTERPRISE_EMAIL_TEMPLATE_DEFINITIONS = [
  {
    notificationType: "user_welcome",
    rendererKey: "welcome",
    title: "Welcome Email",
  },
  {
    notificationType: "password_reset",
    rendererKey: "password_reset",
    title: "Forgot Password Email",
  },
  {
    notificationType: "manager_daily_snapshot",
    rendererKey: "procurement_snapshot",
    title: "Procurement Snapshot Email",
  },
  {
    notificationType: "stale_tender",
    rendererKey: "pending_tender_update_alert",
    title: "Pending Tender Update Alert",
  },
  {
    notificationType: "entity_monthly_digest",
    rendererKey: "monthly_pending_tender_report",
    title: "Monthly Pending Tender Report",
  },
  {
    notificationType: "rc_po_expiry",
    rendererKey: "rc_po_expiry_alert",
    title: "RC/PO Expiry Alert",
  },
] as const;

export function buildAccountSetupEmail(input: {
  expiresIn: string;
  fullName: string;
  setupUrl: string;
  support?: EmailSupport | undefined;
}): ProcureDeskEmail {
  const firstName = firstNameOf(input.fullName);
  return renderEnterpriseEmail({
    actions: [{ href: input.setupUrl, label: "Set Password" }],
    alert: {
      body: `This secure setup link is valid for ${input.expiresIn}.`,
      title: "Password setup required",
      tone: "info",
    },
    details: [
      { label: "Account Name", value: input.fullName },
      { label: "Link Validity", value: input.expiresIn },
    ],
    detailsTitle: "Account details",
    footerNote: "Use this link only if you were expecting a ProcureDesk account. Do not forward this email.",
    greeting: `Dear ${firstName},`,
    intro:
      "Welcome to the Online Platform for Procurement KPI Monitoring. Your account has been created. To complete the setup process, please set your password using the secure link below.",
    preheader: "Complete your ProcureDesk account setup within 24 hours.",
    sections: [
      {
        body: "After signing in, confirm your role and entity access. If your workspace does not show expected data, contact your administrator to review entity mapping.",
        title: "After setup",
      },
    ],
    signOff: "Regards,\nSystem Admin",
    subject: "Welcome to Procurement KPI Tracking Portal – Complete Your Account Setup",
    support: input.support,
    supportHeading: "Contact for any queries or issues",
    title: "Welcome to ProcureDesk",
  });
}

export function buildPasswordResetEmail(input: {
  deviceInfo?: string | undefined;
  expiresIn: string;
  fullName: string;
  ipAddress?: string | undefined;
  requestedAt?: Date | undefined;
  resetUrl: string;
  support?: EmailSupport | undefined;
}): ProcureDeskEmail {
  const details: EmailDetail[] = [
    { label: "Account", value: input.fullName },
    { label: "Link Expires", value: input.expiresIn },
  ];
  if (input.requestedAt) details.push({ label: "Requested At", value: formatEmailDate(input.requestedAt) });
  if (input.ipAddress) details.push({ label: "IP Address", value: input.ipAddress });
  if (input.deviceInfo) details.push({ label: "Device", value: input.deviceInfo });

  return renderEnterpriseEmail({
    actions: [{ href: input.resetUrl, label: "Reset Password" }],
    alert: {
      body: "Your password will not change unless you open the secure link and choose a new password. The link expires automatically.",
      title: "Security confirmation",
      tone: "warning",
    },
    details,
    detailsTitle: "Request details",
    footerNote:
      "Anti-phishing reminder: ProcureDesk will never ask you to share your password, OTP, or reset token by email or phone.",
    greeting: `Hello ${firstNameOf(input.fullName)},`,
    intro:
      "We received a request to reset your ProcureDesk password. If this was you, use the secure button below to choose a new password.",
    preheader: "Use the secure link to reset your ProcureDesk password.",
    sections: [
      {
        body: "If you did not request this reset, ignore this email and contact your administrator immediately. Your current password remains unchanged until the reset link is used.",
        title: "If this was not you",
      },
    ],
    signOff: "Regards,\nProcureDesk Security",
    subject: "Reset your ProcureDesk password",
    support: input.support,
    supportHeading: "Security support",
    title: "Password Reset",
  });
}

export function buildPasswordChangedEmail(input: {
  appUrl: string;
  changedAt?: Date | undefined;
  fullName: string;
  support?: EmailSupport | undefined;
}): ProcureDeskEmail {
  return renderEnterpriseEmail({
    actions: [{ href: buildAppUrl(input.appUrl, "/"), label: "Open ProcureDesk" }],
    alert: {
      body: "No action is needed if you made this change.",
      title: "Password changed successfully",
      tone: "success",
    },
    details: [
      { label: "Account", value: input.fullName },
      { label: "Changed", value: formatEmailDate(input.changedAt ?? new Date()) },
    ],
    detailsTitle: "Security details",
    footerNote: "If this was unexpected, contact your administrator immediately.",
    greeting: `Hello ${firstNameOf(input.fullName)},`,
    intro: "This is a confirmation that your ProcureDesk password was changed successfully.",
    preheader: "Your ProcureDesk password was changed.",
    sections: [
      {
        body: "If you made this change, no action is required. To update it again, open ProcureDesk and use My Profile.",
        title: "What to do",
      },
    ],
    signOff: "Regards,\nProcureDesk Security",
    subject: "Your ProcureDesk password was changed",
    support: input.support,
    supportHeading: "Security support",
    title: "Password Changed",
  });
}

export function buildProcurementSnapshotEmail(input: ProcurementSnapshotInput): ProcureDeskEmail {
  const isGroupScope = input.scopeType === "group";
  const scope = procurementSnapshotScopeLabel(input, isGroupScope);
  const appUrl = input.appUrl ?? "http://localhost:5175";
  return renderEnterpriseEmail({
    actions: [{ href: buildAppUrl(appUrl, "/reports/analytics"), label: "Open Analytics" }],
    attachmentNote: procurementSnapshotAttachmentNote(input.pdfAttached, isGroupScope),
    details: [
      { label: "Scope", value: isGroupScope ? "Group-wide" : scope },
      { label: "Generated", value: formatEmailDate(input.generatedAt ?? new Date()) },
    ],
    detailsTitle: "Snapshot coverage",
    greeting: procurementSnapshotGreeting(input.fullName, isGroupScope),
    intro: procurementSnapshotIntro(scope, isGroupScope),
    kpis: procurementSnapshotKpis(input),
    preheader: "Your procurement dashboard snapshot is ready.",
    reportLinks: defaultReportLinks(appUrl),
    signOff: isGroupScope ? "Regards,\nProcureDesk Support Team" : "Regards,\nSystem Admin",
    subject: "Procurement Dashboard",
    support: input.support,
    title: "Procurement Snapshot",
  });
}

function procurementSnapshotScopeLabel(input: ProcurementSnapshotInput, isGroupScope: boolean): string {
  if (input.scopeLabel?.trim()) return input.scopeLabel.trim();
  return isGroupScope ? "all mapped RPSG entities" : "your mapped entity/entities";
}

function procurementSnapshotAttachmentNote(pdfAttached: boolean | undefined, isGroupScope: boolean): string {
  if (pdfAttached === false) return "Analytics PDF attachment is not available for this run.";
  return isGroupScope
    ? "Analytics page PDF is attached for offline review."
    : "Analytics page PDF is attached with data filtered to your mapped entity scope.";
}

function procurementSnapshotGreeting(fullName: string, isGroupScope: boolean): string {
  const firstName = firstNameOf(fullName);
  return isGroupScope ? `Good Morning Mr. ${firstName},` : `Good Morning ${firstName},`;
}

function procurementSnapshotIntro(scope: string, isGroupScope: boolean): string {
  return isGroupScope
    ? "Please find attached snapshot of procurement function."
    : `Please find attached snapshot of procurement function of ${scope}.`;
}

function procurementSnapshotKpis(input: ProcurementSnapshotInput): EmailKpi[] {
  return [
    { caption: "Active procurement cycles", label: "Running Tenders", value: input.runningTenders ?? "-", tone: "info" },
    { caption: "Closed tender outcomes", label: "Completed Tenders", value: input.completedTenders ?? "-", tone: "success" },
    { caption: "Cases breaching ageing thresholds", label: "Stage Ageing Alerts", value: input.stageAgeingAlerts ?? "-", tone: "warning" },
    { caption: "Pending technical evaluation", label: "Evaluation Pendency", value: input.evaluationPendency ?? "-", tone: "danger" },
  ];
}

export function buildPendingTenderUpdateAlertEmail(input: {
  appUrl?: string | null | undefined;
  fullName: string;
  generatedAt?: Date | undefined;
  support?: EmailSupport | undefined;
  tenders: TenderUpdateAlertRow[];
  thresholdDays?: number | undefined;
}): ProcureDeskEmail {
  const thresholdDays = input.thresholdDays ?? 10;
  return renderEnterpriseEmail({
    actions: [{ href: buildAppUrl(input.appUrl, "/cases?status=running"), label: "Update Tender Status" }],
    alert: {
      body: `The following running tender(s) have not been updated for more than ${thresholdDays} days.`,
      title: "Tender update pending",
      tone: "warning",
    },
    details: [
      { label: "Threshold", value: `${thresholdDays} days` },
      { label: "Pending Tender Count", value: String(input.tenders.length) },
      { label: "Generated", value: formatEmailDate(input.generatedAt ?? new Date()) },
    ],
    detailsTitle: "Alert criteria",
    greeting: `Hello ${firstNameOf(input.fullName)},`,
    intro: `This is an auto-generated alert to inform you that the following running tender(s) tagged under your ownership have not been updated for more than ${thresholdDays} days.`,
    preheader: "Running tenders under your ownership need progress updates.",
    sections: [
      {
        body: "You are requested to kindly review and update the respective case status in the system at the earliest to ensure timely monitoring and progress tracking.",
        title: "Action required",
      },
    ],
    signOff: "Regards,\nSystem Admin",
    subject: "Alert for Pending Tender Progress Updates",
    support: input.support,
    tables: [
      {
        columns: tenderOwnerColumns(false),
        emptyText: "No pending tender updates found.",
        maxRows: 20,
        rows: input.tenders.map((row) => tenderRowToRecord(row, false)),
        title: "Pending tender updates",
      },
    ],
    title: "Pending Tender Progress Updates",
  });
}

export function buildMonthlyPendingTenderReportEmail(input: {
  appUrl?: string | null | undefined;
  entityGroups?: TenderUpdateEntityGroup[] | undefined;
  fullName: string;
  generatedAt?: Date | undefined;
  scopeLabel?: string | undefined;
  support?: EmailSupport | undefined;
  tenders: TenderUpdateAlertRow[];
  thresholdDays?: number | undefined;
}): ProcureDeskEmail {
  const thresholdDays = input.thresholdDays ?? 10;
  const scope = input.scopeLabel?.trim() || "your reporting scope";
  return renderEnterpriseEmail({
    actions: [{ href: buildAppUrl(input.appUrl, "/cases?status=running"), label: "Review Running Tenders" }],
    alert: {
      body: `There are ${input.tenders.length} running tender case(s) with no update for more than ${thresholdDays} days.`,
      title: "Manager review required",
      tone: "danger",
    },
    details: [
      { label: "Scope", value: scope },
      { label: "Threshold", value: `${thresholdDays} days` },
      { label: "Generated", value: formatEmailDate(input.generatedAt ?? new Date()) },
    ],
    detailsTitle: "Report criteria",
    greeting: `Hello ${firstNameOf(input.fullName)},`,
    intro: `Please find below the consolidated list of running tender case(s) under your reporting team, where no status update has been recorded for more than ${thresholdDays} days.`,
    preheader: "Monthly pending tender progress update report is ready.",
    sections: [
      {
        body: "You are requested to kindly review the pending cases with the respective Tender Owners and ensure timely updates in the system for effective monitoring and progress tracking.",
        title: "Action required",
      },
    ],
    signOff: "Regards,\nSystem Admin",
    subject: "Alert: Pending Tender Progress Updates",
    support: input.support,
    tables: [
      {
        columns: tenderOwnerColumns(true),
        emptyText: "No pending tender updates found.",
        maxRows: 30,
        rows: input.tenders.map((row) => tenderRowToRecord(row, true)),
        title: "Consolidated pending tender case updates",
      },
    ],
    title: "Monthly Pending Tender Report",
  });
}

export function buildRcPoExpiryEmail(input: {
  appUrl?: string | null | undefined;
  excelAttached?: boolean | undefined;
  fullName: string;
  generatedAt?: Date | undefined;
  items: RcPoExpiryRow[];
  scopeLabel?: string | undefined;
  scopeType?: RcPoExpiryScopeType | undefined;
  support?: EmailSupport | undefined;
  thresholdDays?: number | undefined;
}): ProcureDeskEmail {
  const thresholdDays = input.thresholdDays ?? 90;
  const isGroupScope = input.scopeType === "group";
  const sortedItems = input.items.slice().sort((left, right) => Number(left.daysRemaining) - Number(right.daysRemaining));
  return renderEnterpriseEmail({
    actions: [{ href: buildAppUrl(input.appUrl, "/reports/rc-po-expiry"), label: "Open RC/PO Expiry Report" }],
    alert: {
      body: `${sortedItems.length} RC/PO item(s) are scheduled to expire within the next ${thresholdDays} days.`,
      title: "Expiry risk window",
      tone: "warning",
    },
    attachmentNote: input.excelAttached === false
      ? "Excel report attachment is not available for this run."
      : "The attached Excel report contains the details of the upcoming expiries for necessary review and action.",
    details: [
      { label: "Scope", value: isGroupScope ? "Group-wide" : (input.scopeLabel ?? "Mapped entity scope") },
      { label: "Expiry Window", value: `${thresholdDays} days` },
      { label: "Expiry Count", value: String(sortedItems.length) },
      { label: "Generated", value: formatEmailDate(input.generatedAt ?? new Date()) },
    ],
    detailsTitle: "Expiry criteria",
    greeting: isGroupScope ? `Hello Mr. ${firstNameOf(input.fullName)},` : `Hello ${firstNameOf(input.fullName)},`,
    intro: isGroupScope
      ? `This is an auto-generated alert to inform you that the following RC(s)/PO(s) are scheduled to expire within the next ${thresholdDays} days.`
      : `This is an auto-generated alert to inform you that the following RC(s)/PO(s) under your entity are scheduled to expire within the next ${thresholdDays} days.`,
    preheader: "RC/PO contracts are approaching expiry.",
    signOff: "Regards,\nSystem Admin",
    subject: "Alert: RC/PO Expiring in next 90 days",
    support: input.support,
    tables: [
      {
        columns: [
          { key: "entity", label: "Entity" },
          { key: "tenderName", label: "Tender Name" },
          { align: "right", key: "rcPoValue", label: "PO/RC Value" },
          { key: "rcPoAwardDate", label: "PO/RC Award Date" },
          { key: "rcPoValidityDate", label: "PO/RC Validity Date" },
          { key: "owner", label: "Tender Owner" },
          { align: "right", key: "daysRemaining", label: "Days remaining to expire", tone: (value) => expiryTone(value) },
        ],
        emptyText: "No RC/PO expiries found inside the configured window.",
        maxRows: 15,
        rows: sortedItems.map((row) => ({
          daysRemaining: row.daysRemaining,
          entity: row.entity,
          owner: row.owner,
          rcPoAwardDate: row.rcPoAwardDate,
          rcPoValue: row.rcPoValue,
          rcPoValidityDate: row.rcPoValidityDate,
          tenderName: row.tenderName,
        })),
        title: "Upcoming RC/PO expiries preview",
      },
    ],
    title: "RC/PO Expiry Alert",
  });
}

export function buildNotificationJobEmail(input: {
  actorEmail?: string | null;
  appUrl?: string | null | undefined;
  generatedAt?: Date;
  notificationType: NotificationEmailType | string;
  subject: string;
  support?: EmailSupport | undefined;
  textBody?: string | null | undefined;
}): ProcureDeskEmail {
  const meta = notificationMetadata(input.notificationType);
  const generatedAt = input.generatedAt ?? new Date();
  const summary = normalizeBody(input.textBody) ?? meta.summary;
  const action = meta.action
    ? { href: buildAppUrl(input.appUrl, meta.action.path), label: meta.action.label }
    : undefined;

  return renderEnterpriseEmail({
    actions: action ? [action] : undefined,
    alert: meta.priority === "High"
      ? { body: meta.reason, title: "High priority notification", tone: "warning" }
      : undefined,
    details: [
      { label: "Category", value: meta.category },
      { label: "Priority", value: meta.priority },
      { label: "Generated", value: formatEmailDate(generatedAt) },
    ],
    footerNote: input.actorEmail ? `Triggered by ${input.actorEmail}.` : undefined,
    intro: summary,
    preheader: meta.preheader,
    sections: [
      { body: meta.reason, title: "Why this matters" },
      { body: meta.nextStep, title: "What to do" },
    ],
    subject: input.subject,
    support: input.support,
    title: meta.title,
  });
}

export function buildTemplatePreviewEmail(input: {
  appUrl?: string | null | undefined;
  notificationType: NotificationEmailType | string;
  rendererKey: string;
  samplePayload?: Record<string, unknown> | null | undefined;
  subject?: string | null | undefined;
  support?: EmailSupport | undefined;
}): ProcureDeskEmail {
  const payload = input.samplePayload ?? {};
  const appUrl = input.appUrl ?? "http://localhost:5175";
  if (input.rendererKey === "welcome") {
    return buildAccountSetupEmail({
      expiresIn: stringPayload(payload.expiresIn, "24 hours"),
      fullName: stringPayload(payload.fullName, "Asha Rao"),
      setupUrl: buildAppUrl(appUrl, "/reset-password?token=preview"),
      support: input.support,
    });
  }
  if (input.rendererKey === "password_reset") {
    return buildPasswordResetEmail({
      expiresIn: stringPayload(payload.expiresIn, "1 hour"),
      fullName: stringPayload(payload.fullName, "Asha Rao"),
      resetUrl: buildAppUrl(appUrl, "/reset-password?token=preview"),
      support: input.support,
    });
  }
  if (input.rendererKey === "password_changed") {
    return buildPasswordChangedEmail({
      appUrl,
      fullName: stringPayload(payload.fullName, "Asha Rao"),
      support: input.support,
    });
  }
  if (input.rendererKey === "procurement_snapshot") {
    return buildProcurementSnapshotEmail({
      appUrl,
      completedTenders: numberPayload(payload.completedTenders, 18),
      evaluationPendency: numberPayload(payload.evaluationPendency, 4),
      fullName: stringPayload(payload.fullName, "Asha Rao"),
      pdfAttached: true,
      runningTenders: numberPayload(payload.runningTenders, 42),
      scopeLabel: stringPayload(payload.scopeLabel, "CESC"),
      stageAgeingAlerts: numberPayload(payload.stageAgeingAlerts, 7),
      support: input.support,
    });
  }
  if (input.rendererKey === "pending_tender_update_alert") {
    return buildPendingTenderUpdateAlertEmail({
      appUrl,
      fullName: stringPayload(payload.fullName, "Asha Rao"),
      support: input.support,
      tenders: sampleTenderRows(),
      thresholdDays: numberPayload(payload.thresholdDays, 10),
    });
  }
  if (input.rendererKey === "monthly_pending_tender_report") {
    return buildMonthlyPendingTenderReportEmail({
      appUrl,
      fullName: stringPayload(payload.fullName, "Mira Sen"),
      scopeLabel: stringPayload(payload.scopeLabel, "Mapped entities"),
      support: input.support,
      tenders: sampleTenderRows(true),
      thresholdDays: numberPayload(payload.thresholdDays, 10),
    });
  }
  if (input.rendererKey === "rc_po_expiry_alert") {
    return buildRcPoExpiryEmail({
      appUrl,
      excelAttached: true,
      fullName: stringPayload(payload.fullName, "Mira Sen"),
      items: sampleRcPoRows(),
      scopeLabel: stringPayload(payload.scopeLabel, "Mapped entities"),
      scopeType: stringPayload(payload.scopeType, "entity") === "group" ? "group" : "entity",
      support: input.support,
      thresholdDays: numberPayload(payload.thresholdDays, 90),
    });
  }
  return buildNotificationJobEmail({
    appUrl,
    notificationType: input.notificationType,
    subject: input.subject ?? "ProcureDesk Notification",
    support: input.support,
    textBody: "This preview uses the generic ProcureDesk notification layout.",
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
  return renderEnterpriseEmail({
    actions: input.action ? [input.action] : undefined,
    details: input.details,
    intro: input.intro,
    preheader: input.preheader,
    sections: input.sections,
    subject: input.subject,
    title: input.title,
  });
}

function renderEnterpriseEmail(input: EnterpriseEmailInput): ProcureDeskEmail {
  const details = (input.details ?? []).filter((detail) => hasText(detail.value));
  const sections = (input.sections ?? []).filter((section) => section.body.trim());
  const actions = input.actions ?? [];
  const reportLinks = input.reportLinks ?? [];
  const tables = input.tables ?? [];
  const support = input.support ?? DEFAULT_EMAIL_SUPPORT;
  const generatedAt = input.generatedAt ?? new Date();
  const resolved: ResolvedEnterpriseEmailInput = {
    actions,
    alert: input.alert,
    attachmentNote: input.attachmentNote,
    details,
    detailsTitle: input.detailsTitle ?? "Details",
    footerNote: input.footerNote,
    generatedAt,
    greeting: input.greeting,
    intro: input.intro,
    kpis: input.kpis,
    preheader: input.preheader,
    reportLinks,
    signOff: input.signOff,
    sections,
    subject: input.subject,
    support,
    supportHeading: input.supportHeading ?? "Support",
    tables,
    title: input.title,
  };

  return {
    htmlBody: renderHtmlBody(resolved),
    preheader: input.preheader,
    subject: input.subject,
    textBody: renderTextBody(resolved),
  };
}

function renderTextBody(input: ResolvedEnterpriseEmailInput): string {
  const lines = [input.title, ""];
  appendTextIntro(lines, input);
  appendTextAlert(lines, input.alert);
  appendTextDetails(lines, input.details, input.detailsTitle);
  appendTextKpis(lines, input.kpis ?? []);
  appendTextTables(lines, input.tables);
  appendTextSections(lines, input.sections);
  appendTextReportLinks(lines, input.reportLinks);
  appendTextActions(lines, input);
  appendTextFooter(lines, input);
  return lines.join("\n");
}

function appendTextIntro(lines: string[], input: ResolvedEnterpriseEmailInput): void {
  if (input.greeting) lines.push(input.greeting, "");
  lines.push(input.intro, "");
}

function appendTextAlert(lines: string[], alert: ResolvedEnterpriseEmailInput["alert"]): void {
  if (alert) lines.push(alert.title, alert.body, "");
}

function appendTextDetails(lines: string[], details: EmailDetail[], title: string): void {
  if (!details.length) return;
  lines.push(title);
  for (const detail of details) {
    lines.push(`${detail.label}: ${detail.value ?? ""}`);
  }
  lines.push("");
}

function appendTextKpis(lines: string[], kpis: EmailKpi[]): void {
  if (!kpis.length) return;
  lines.push("Key metrics");
  for (const kpi of kpis) {
    lines.push(`${kpi.label}: ${kpi.value}${kpi.caption ? ` - ${kpi.caption}` : ""}`);
  }
  lines.push("");
}

function appendTextSections(lines: string[], sections: EmailSection[]): void {
  for (const section of sections) {
    lines.push(section.title, section.body, "");
  }
}

function appendTextReportLinks(lines: string[], reportLinks: ReportLink[]): void {
  if (!reportLinks.length) return;
  lines.push("Quick Report Links");
  for (const link of reportLinks) {
    lines.push(`${link.label}: ${link.href}`, link.summary);
  }
  lines.push("");
}

function appendTextTables(lines: string[], tables: Array<EmailTable<Record<string, unknown>>>): void {
  for (const table of tables) {
    appendTextTable(lines, table);
  }
}

function appendTextTable(lines: string[], table: EmailTable<Record<string, unknown>>): void {
  lines.push(table.title ?? "Details");
  if (!table.rows.length) {
    lines.push(table.emptyText ?? "No records.", "");
    return;
  }
  const rows = table.rows.slice(0, table.maxRows ?? table.rows.length);
  lines.push(table.columns.map((column) => column.label).join(" | "));
  for (const row of rows) {
    lines.push(table.columns.map((column) => formatTableCell(column, row)).join(" | "));
  }
  if (table.rows.length > rows.length) lines.push(`+ ${table.rows.length - rows.length} more row(s) in ProcureDesk.`);
  lines.push("");
}

function appendTextActions(lines: string[], input: ResolvedEnterpriseEmailInput): void {
  if (input.attachmentNote) lines.push("Attachment", input.attachmentNote, "");
  for (const action of input.actions) {
    lines.push(`${action.label}: ${action.href}`, "");
  }
}

function appendTextFooter(lines: string[], input: ResolvedEnterpriseEmailInput): void {
  if (input.footerNote) lines.push(input.footerNote, "");
  if (input.signOff) lines.push(...input.signOff.split("\n"), "");
  lines.push(
    `${BRAND.appName} | ${BRAND.organization}`,
    `${input.supportHeading}: ${input.support.name}${input.support.phone ? ` | ${input.support.phone}` : ""} | ${input.support.email}`,
    "This is a system-generated email. Please do not reply to this email.",
  );
}

function renderHtmlBody(input: ResolvedEnterpriseEmailInput): string {
  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(input.subject)}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .pd-shell { width: 100% !important; }
        .pd-px { padding-left: 20px !important; padding-right: 20px !important; }
        .pd-py { padding-top: 22px !important; padding-bottom: 22px !important; }
        .pd-stack { display: block !important; width: 100% !important; }
        .pd-header-right { text-align: left !important; padding-top: 12px !important; }
        .pd-title { font-size: 23px !important; line-height: 29px !important; }
        .pd-kpi-cell { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .pd-link-cell { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .pd-footer-left, .pd-footer-right { display: block !important; width: 100% !important; padding-right: 0 !important; }
        .pd-footer-right { padding-top: 14px !important; }
        .pd-button a { display: block !important; text-align: center !important; }
        .pd-detail-label { width: 100% !important; display: block !important; padding-bottom: 2px !important; }
        .pd-detail-value { width: 100% !important; display: block !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#edf2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#edf2f7;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:34px 12px;">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" class="pd-shell" style="border-collapse:separate;border-spacing:0;width:720px;max-width:720px;background:#ffffff;border:1px solid #d7e0ea;border-radius:12px;overflow:hidden;box-shadow:0 18px 42px rgba(15,35,63,0.12);">
            ${renderHeaderHtml(input.title)}
            <tr>
              <td class="pd-px pd-py" style="padding:30px 36px 32px 36px;background:#ffffff;">
                ${input.greeting ? `<p style="margin:0 0 12px 0;font-size:16px;line-height:24px;color:#132238;font-weight:700;">${escapeHtml(input.greeting)}</p>` : ""}
                <p style="margin:0;font-size:15px;line-height:25px;color:#34445c;">${escapeHtml(input.intro)}</p>
                ${renderDetailsHtml(input.details, input.detailsTitle)}
                ${input.alert ? renderAlertHtml(input.alert) : ""}
                ${renderKpisHtml(input.kpis ?? [])}
                ${input.tables.map(renderTableHtml).join("")}
                ${input.sections.map(renderSectionHtml).join("")}
                ${renderReportLinksHtml(input.reportLinks)}
                ${input.attachmentNote ? renderAttachmentNoteHtml(input.attachmentNote) : ""}
                ${renderActionsHtml(input.actions)}
              </td>
            </tr>
            ${renderSupportHtml(input.support, input.footerNote, input.supportHeading, input.signOff)}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderHeaderHtml(title: string): string {
  return `
    <tr>
      <td class="pd-px" style="padding:20px 36px 22px 36px;background:#0d233a;color:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td class="pd-stack" style="vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;width:34px;">
                    <div style="width:34px;height:34px;border-radius:8px;background:#ffffff;color:#0d233a;font-size:13px;line-height:34px;text-align:center;font-weight:800;">PD</div>
                  </td>
                  <td style="vertical-align:middle;padding-left:10px;">
                    <div style="font-size:10px;line-height:14px;text-transform:uppercase;color:#b9cbe0;font-weight:800;">${BRAND.organization} Procurement</div>
                    <div style="margin-top:1px;font-size:18px;line-height:23px;color:#ffffff;font-weight:800;">${BRAND.appName}</div>
                  </td>
                </tr>
              </table>
            </td>
            <td align="right" class="pd-stack pd-header-right" style="vertical-align:top;font-size:12px;line-height:18px;color:#c8d6e6;">
              <span style="display:inline-block;color:#dce8f6;font-weight:700;">${BRAND.productLine}</span>
            </td>
          </tr>
        </table>
        <h1 class="pd-title" style="margin:18px 0 0 0;font-size:25px;line-height:31px;color:#ffffff;font-weight:800;">${escapeHtml(title)}</h1>
      </td>
    </tr>`;
}

function renderAlertHtml(alert: { body: string; tone: EmailTone; title: string }): string {
  const tone = toneColors(alert.tone);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-top:20px;background:${tone.background};border:1px solid ${tone.border};border-radius:10px;">
      <tr>
        <td style="padding:15px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="width:34px;vertical-align:top;">
                <div style="width:26px;height:26px;border-radius:999px;background:#ffffff;color:${tone.text};font-size:14px;line-height:26px;text-align:center;font-weight:800;">!</div>
              </td>
              <td style="vertical-align:top;">
                <div style="font-size:13px;line-height:18px;color:${tone.text};font-weight:800;">${escapeHtml(alert.title)}</div>
                <div style="margin-top:4px;font-size:13px;line-height:20px;color:${tone.text};">${escapeHtml(alert.body)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderDetailsHtml(details: EmailDetail[], title: string): string {
  if (!details.length) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-top:22px;background:#f8fafc;border:1px solid #d9e3ef;border-radius:10px;">
      <tr>
        <td colspan="2" style="padding:14px 16px 8px 16px;font-size:13px;line-height:18px;color:#172033;font-weight:800;">${escapeHtml(title)}</td>
      </tr>
      ${details
        .map(
          (detail) => `
            <tr>
              <td class="pd-detail-label" style="padding:10px 16px;border-top:1px solid #e7edf5;font-size:12px;line-height:18px;color:#617089;width:38%;font-weight:700;text-transform:uppercase;">${escapeHtml(detail.label)}</td>
              <td class="pd-detail-value" style="padding:10px 16px;border-top:1px solid #e7edf5;font-size:14px;line-height:20px;color:#172033;font-weight:700;">${escapeHtml(String(detail.value ?? ""))}</td>
            </tr>`,
        )
        .join("")}
    </table>`;
}

function renderKpisHtml(kpis: EmailKpi[]): string {
  if (!kpis.length) return "";
  const cells = kpis.map((kpi) => {
      const tone = toneColors(kpi.tone ?? "neutral");
      return `
        <td class="pd-kpi-cell" width="50%" style="width:50%;padding:6px;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:${tone.background};border:1px solid ${tone.border};border-radius:10px;">
            <tr>
              <td style="padding:15px 16px;">
                <div style="font-size:12px;line-height:16px;color:#607089;font-weight:700;">${escapeHtml(kpi.label)}</div>
                <div style="margin-top:6px;font-size:25px;line-height:31px;color:${tone.text};font-weight:800;">${escapeHtml(String(kpi.value))}</div>
                ${kpi.caption ? `<div style="margin-top:4px;font-size:12px;line-height:17px;color:#607089;">${escapeHtml(kpi.caption)}</div>` : ""}
              </td>
            </tr>
          </table>
        </td>`;
    });
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">
      <tr>
        <td style="font-size:14px;line-height:20px;color:#172033;font-weight:700;padding-bottom:6px;">Key metrics</td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${chunkHtmlCells(cells, 2)}
          </table>
        </td>
      </tr>
    </table>`;
}

function renderSectionHtml(section: EmailSection): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px;">
      <tr>
        <td style="padding-left:12px;border-left:3px solid #155eef;">
          <h2 style="margin:0 0 6px 0;font-size:15px;line-height:21px;color:#172033;font-weight:800;">${escapeHtml(section.title)}</h2>
          <p style="margin:0;font-size:14px;line-height:22px;color:#34445c;">${escapeHtml(section.body)}</p>
        </td>
      </tr>
    </table>`;
}

function renderReportLinksHtml(links: ReportLink[]): string {
  if (!links.length) return "";
  const cells = links.map(
    (link) => `
      <td class="pd-link-cell" width="50%" style="width:50%;padding:6px;vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #dbe3ee;border-radius:10px;">
          <tr>
            <td>
              <a href="${escapeAttribute(link.href)}" target="_blank" style="display:block;padding:15px 16px;text-decoration:none;">
                <span style="display:block;font-size:14px;line-height:20px;color:#155eef;font-weight:800;">${escapeHtml(link.label)}</span>
                <span style="display:block;margin-top:5px;font-size:12px;line-height:18px;color:#607089;">${escapeHtml(link.summary)}</span>
                <span style="display:block;margin-top:9px;font-size:12px;line-height:18px;color:#155eef;font-weight:800;">Open report</span>
              </a>
            </td>
          </tr>
        </table>
      </td>`,
  );
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">
      <tr>
        <td style="font-size:14px;line-height:20px;color:#172033;font-weight:700;padding-bottom:8px;">Quick Report Links</td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-left:-6px;margin-right:-6px;">
            ${chunkHtmlCells(cells, 2)}
          </table>
        </td>
      </tr>
    </table>`;
}

function renderTableHtml(table: EmailTable<Record<string, unknown>>): string {
  const rows = table.rows.slice(0, table.maxRows ?? table.rows.length);
  const body = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              ${table.columns
                .map(
                  (column) => `
                    <td style="padding:9px 8px;border-bottom:1px solid #e8eef6;font-size:12px;line-height:17px;color:#27364f;text-align:${column.align ?? "left"};vertical-align:top;">
                      ${renderTableCellValue(column, row)}
                    </td>`,
                )
                .join("")}
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="${table.columns.length}" style="padding:16px 10px;border-bottom:1px solid #e8eef6;font-size:13px;line-height:20px;color:#607089;text-align:center;">${escapeHtml(table.emptyText ?? "No records.")}</td></tr>`;
  const moreCount = table.rows.length - rows.length;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">
      ${table.title ? `<tr><td style="font-size:14px;line-height:20px;color:#172033;font-weight:700;padding-bottom:8px;">${escapeHtml(table.title)}</td></tr>` : ""}
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe3ee;border-radius:8px;overflow:hidden;">
            <tr>
              ${table.columns
                .map(
                  (column) => `
                    <th align="${column.align ?? "left"}" style="padding:9px 8px;background:#f1f5f9;border-bottom:1px solid #dbe3ee;font-size:11px;line-height:15px;color:#52637a;text-align:${column.align ?? "left"};font-weight:700;">
                      ${escapeHtml(column.label)}
                    </th>`,
                )
                .join("")}
            </tr>
            ${body}
          </table>
          ${moreCount > 0 ? `<div style="padding-top:8px;font-size:12px;line-height:18px;color:#607089;">+ ${moreCount} more row(s) available in ProcureDesk.</div>` : ""}
        </td>
      </tr>
    </table>`;
}

function renderAttachmentNoteHtml(note: string): string {
  const noteLower = note.toLowerCase();
  const isPdf = noteLower.includes("pdf");
  const isExcel = noteLower.includes("excel") || noteLower.includes("xlsx");
  const badge = isPdf ? "PDF" : isExcel ? "XLSX" : "FILE";
  const title = isPdf ? "Analytics snapshot attached" : isExcel ? "Excel report attached" : "Attachment included";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-top:20px;background:#f5f9ff;border:1px solid #bfd7ff;border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="width:52px;vertical-align:top;">
                <div style="width:40px;height:40px;background:#155eef;color:#ffffff;font-size:11px;line-height:40px;text-align:center;font-weight:800;border-radius:8px;">${badge}</div>
              </td>
              <td style="vertical-align:top;">
                <div style="font-size:13px;line-height:18px;color:#172033;font-weight:800;">${title}</div>
                <div style="margin-top:4px;font-size:13px;line-height:20px;color:#27364f;">${escapeHtml(note)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderActionsHtml(actions: EmailAction[]): string {
  if (!actions.length) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
      <tr>
        ${actions
          .map(
            (action) => `
              <td class="pd-button" style="background:#155eef;border-radius:8px;box-shadow:0 8px 16px rgba(21,94,239,0.22);">
                <a href="${escapeAttribute(action.href)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;line-height:18px;font-weight:800;border-radius:8px;">${escapeHtml(action.label)}</a>
              </td>`,
          )
          .join('<td style="width:8px;">&nbsp;</td>')}
      </tr>
    </table>`;
}

function renderSupportHtml(
  support: EmailSupport,
  footerNote?: string,
  supportHeading = "Support",
  signOff?: string,
): string {
  return `
    <tr>
      <td class="pd-px" style="padding:22px 36px 26px 36px;background:#f8fafc;border-top:1px solid #dbe4ef;">
        ${footerNote ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;"><tr><td style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12px;line-height:18px;color:#9a3412;">${escapeHtml(footerNote)}</td></tr></table>` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td class="pd-footer-left" width="50%" style="width:50%;vertical-align:top;padding-right:16px;">
              ${signOff ? `<p style="margin:0;font-size:13px;line-height:20px;color:#34445c;">${escapeHtml(signOff).replace(/\n/g, "<br>")}</p>` : ""}
              <p style="margin:${signOff ? "14px" : "0"} 0 0 0;font-size:11px;line-height:17px;color:#728198;white-space:nowrap;">System-generated notification. Please do not reply to this email.</p>
              <p style="margin:8px 0 0 0;font-size:11px;line-height:17px;color:#728198;">${escapeHtml(BRAND.appName)} | ${escapeHtml(BRAND.organization)}</p>
            </td>
            <td class="pd-footer-right" width="50%" style="width:50%;vertical-align:top;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border-left:3px solid #155eef;border-top:1px solid #e3ebf4;border-right:1px solid #e3ebf4;border-bottom:1px solid #e3ebf4;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px 12px 16px;">
                    <div style="font-size:11px;line-height:15px;color:#607089;text-transform:uppercase;font-weight:800;letter-spacing:0;">${escapeHtml(supportHeading === "Support" ? "Need help?" : supportHeading)}</div>
                    <div style="margin-top:5px;font-size:13px;line-height:18px;color:#172033;font-weight:800;">${escapeHtml(support.name)}</div>
                    <div style="margin-top:3px;font-size:12px;line-height:18px;color:#44546a;">
                      ${support.phone ? `<span>Mob: ${escapeHtml(support.phone)}</span><span style="color:#c2ccda;"> &nbsp;|&nbsp; </span>` : ""}<a href="mailto:${escapeAttribute(support.email)}" style="color:#155eef;text-decoration:none;font-weight:700;">${escapeHtml(support.email)}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

type NotificationMetadata = {
  action?: { label: string; path: string } | undefined;
  category: string;
  nextStep: string;
  preheader: string;
  priority: "High" | "Medium" | "Normal";
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
      action: { label: "Review running tenders", path: "/cases?status=running" },
      category: "Reports",
      nextStep: "Review the consolidated list and follow up with Tender Owners where updates are pending.",
      preheader: "Monthly pending tender update report is ready.",
      priority: "High",
      reason: "Running tender cases in your reporting scope have not been updated within the configured threshold.",
      summary: "Monthly pending tender progress update report is ready.",
      title: "Monthly Pending Tender Report",
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
      action: { label: "Open analytics", path: "/reports/analytics" },
      category: "Dashboard",
      nextStep: "Start with ageing and evaluation pendency, then review running tenders where ownership or milestone updates are pending.",
      preheader: "Your procurement dashboard snapshot is ready.",
      priority: "Normal",
      reason: "You receive this snapshot because you have manager or viewer level procurement visibility.",
      summary: "Your procurement dashboard snapshot is ready.",
      title: "Procurement Snapshot",
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
      preheader: "RC/PO contracts are approaching expiry.",
      priority: "High",
      reason: "A contract or purchase order is inside the configured expiry reminder window.",
      summary: "RC/PO contracts are approaching expiry.",
      title: "RC/PO Expiry Alert",
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
      preheader: "Running tenders under your ownership need progress updates.",
      priority: "High",
      reason: "A running tender case has not been updated within the configured reminder threshold.",
      summary: "Running tender cases need progress updates.",
      title: "Pending Tender Progress Updates",
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

function defaultReportLinks(appUrl: string | null | undefined): ReportLink[] {
  return [
    { href: buildAppUrl(appUrl, "/reports/analytics"), label: "Analytics", summary: "Executive procurement KPIs and savings visibility." },
    { href: buildAppUrl(appUrl, "/reports/running"), label: "Running Tenders", summary: "Live view of active tender cases." },
    { href: buildAppUrl(appUrl, "/reports/completed"), label: "Completed Tenders", summary: "Completed tender and award tracking." },
    { href: buildAppUrl(appUrl, "/reports/stage-time"), label: "Stage Wise Time Lapse", summary: "Stage ageing and cycle-time analysis." },
    { href: buildAppUrl(appUrl, "/reports/technical-evaluation-pendency"), label: "Bid Evaluation Pendency", summary: "Technical and commercial evaluation pendency." },
  ];
}

function sampleTenderRows(includeOwner = false): TenderUpdateAlertRow[] {
  return [
    {
      currentStageAgeingDays: 18,
      daysSinceLastUpdate: 22,
      description: "Transformer maintenance service",
      entity: "CESC",
      prNumber: "PR-1001",
      runAgeDays: 44,
      tenderOwner: includeOwner ? "Rohan Mehta" : undefined,
      tenderStage: "Technical Evaluation",
    },
    {
      currentStageAgeingDays: 31,
      daysSinceLastUpdate: 35,
      description: "Civil works package",
      entity: "Haldia",
      prNumber: "PR-2200",
      runAgeDays: 67,
      tenderOwner: includeOwner ? "Asha Rao" : undefined,
      tenderStage: "Commercial Evaluation",
    },
  ];
}

function sampleRcPoRows(): RcPoExpiryRow[] {
  return [
    {
      daysRemaining: 9,
      entity: "Haldia",
      owner: "Rohan Mehta",
      rcPoAwardDate: "20 Feb 2025",
      rcPoValidityDate: "3 Jun 2026",
      rcPoValue: "INR 4,50,000",
      tenderName: "Safety audit",
    },
    {
      daysRemaining: 45,
      entity: "CESC",
      owner: "Asha Rao",
      rcPoAwardDate: "10 Jan 2025",
      rcPoValidityDate: "9 Jul 2026",
      rcPoValue: "INR 12,00,000",
      tenderName: "Annual maintenance",
    },
  ];
}

function tenderOwnerColumns(includeOwner: boolean): Array<EmailTableColumn<Record<string, unknown>>> {
  const columns: Array<EmailTableColumn<Record<string, unknown>>> = [
    { key: "entity", label: "Entity" },
    { key: "prNumber", label: "PR Number" },
    { key: "description", label: "PR Description" },
    { key: "tenderStage", label: "Tender Stage" },
    { align: "right", key: "runAgeDays", label: "Run Age (Days)" },
    {
      align: "right",
      key: "currentStageAgeingDays",
      label: "Current Stage Ageing (Days)",
      tone: (value) => ageingTone(value),
    },
    {
      align: "right",
      key: "daysSinceLastUpdate",
      label: "Days Since Last Update",
      tone: (value) => ageingTone(value),
    },
  ];
  if (includeOwner) {
    columns.splice(1, 0, { key: "tenderOwner", label: "Tender Owner" });
  }
  return columns;
}

function tenderRowToRecord(row: TenderUpdateAlertRow, includeOwner: boolean): Record<string, unknown> {
  return {
    currentStageAgeingDays: row.currentStageAgeingDays,
    daysSinceLastUpdate: row.daysSinceLastUpdate,
    description: row.description,
    entity: row.entity,
    prNumber: row.prNumber,
    runAgeDays: row.runAgeDays,
    tenderOwner: includeOwner ? (row.tenderOwner ?? "-") : undefined,
    tenderStage: row.tenderStage,
  };
}

function renderTableCellValue<Row extends Record<string, unknown>>(
  column: EmailTableColumn<Row>,
  row: Row,
): string {
  const value = formatTableCell(column, row);
  const tone = column.tone?.(row[column.key], row);
  if (!tone) return escapeHtml(value);
  return renderStatusBadgeHtml(value, tone);
}

function formatTableCell<Row extends Record<string, unknown>>(column: EmailTableColumn<Row>, row: Row): string {
  return column.format?.(row[column.key], row) ?? stringifyCell(row[column.key]);
}

function renderStatusBadgeHtml(value: string, tone: EmailTone): string {
  const colors = toneColors(tone);
  return `<span style="display:inline-block;padding:3px 7px;background:${colors.background};border:1px solid ${colors.border};color:${colors.text};font-size:11px;line-height:14px;font-weight:700;">${escapeHtml(value)}</span>`;
}

function ageingTone(value: unknown): EmailTone | undefined {
  const days = Number(value);
  if (!Number.isFinite(days)) return undefined;
  if (days >= 30) return "danger";
  if (days >= 15) return "warning";
  if (days >= 10) return "info";
  return undefined;
}

function expiryTone(value: unknown): EmailTone | undefined {
  const days = Number(value);
  if (!Number.isFinite(days)) return undefined;
  if (days <= 15) return "danger";
  if (days <= 30) return "warning";
  return "info";
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

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

function normalizeBody(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return formatEmailDate(value);
  return String(value);
}

function stringPayload(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberPayload(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function chunkHtmlCells(cells: string[], chunkSize: number): string {
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += chunkSize) {
    rows.push(`<tr>${cells.slice(index, index + chunkSize).join("")}</tr>`);
  }
  return rows.join("");
}

function toneColors(tone: EmailTone): { background: string; border: string; text: string } {
  const colors: Record<EmailTone, { background: string; border: string; text: string }> = {
    critical: { background: "#fef2f2", border: "#fecaca", text: "#991b1b" },
    danger: { background: "#fff1f2", border: "#fecdd3", text: "#9f1239" },
    info: { background: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
    neutral: { background: "#f8fafc", border: "#dbe3ee", text: "#172033" },
    success: { background: "#ecfdf5", border: "#bbf7d0", text: "#047857" },
    warning: { background: "#fffbeb", border: "#fde68a", text: "#92400e" },
  };
  return colors[tone];
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
