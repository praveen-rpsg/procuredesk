export type WorkerTemplateVersion = {
  id: string;
  preheaderTemplate: string | null;
  rendererKey: string;
  subjectTemplate: string;
};

export type RenderedNotificationEmail = {
  htmlBody: string;
  subject: string;
  textBody: string;
};

type EmailSupport = {
  email: string;
  name: string;
  phone?: string | undefined;
};

type EmailTone = "danger" | "info" | "neutral" | "success" | "warning";

type EmailKpi = {
  caption?: string | undefined;
  label: string;
  tone?: EmailTone | undefined;
  value: string;
};

type EmailDetail = {
  label: string;
  value: string;
};

type EmailSection = {
  body: string;
  title: string;
};

type EmailTableColumn = {
  align?: "left" | "right" | undefined;
  key: string;
  label: string;
  tone?: ((value: unknown, row: Record<string, unknown>) => EmailTone | undefined) | undefined;
};

type EmailTable = {
  columns: EmailTableColumn[];
  emptyText?: string | undefined;
  maxRows?: number | undefined;
  rows: Array<Record<string, unknown>>;
  title: string;
};

type ReportLink = {
  href: string;
  label: string;
  summary: string;
};

const DEFAULT_APP_URL = process.env.APP_URL ?? "http://localhost:5175";
const DEFAULT_SUPPORT: EmailSupport = {
  email: "santanu.mukherjee@rpsg.in",
  name: "Mr. Santanu Mukherjee",
  phone: "6297445379",
};

export function renderNotificationTemplate(input: {
  fallback: RenderedNotificationEmail;
  notificationType: string;
  payload: Record<string, unknown>;
  templateVersion: WorkerTemplateVersion | null;
}): RenderedNotificationEmail {
  if (!input.templateVersion) return input.fallback;
  const subject = renderSubject(input.templateVersion.subjectTemplate, input.payload) || input.fallback.subject;
  const rendererKey = input.templateVersion.rendererKey;
  if (rendererKey === "procurement_snapshot") {
    return renderSnapshotEmail(subject, input.payload);
  }
  if (rendererKey === "pending_tender_update_alert") {
    return renderPendingTenderEmail(subject, input.payload);
  }
  if (rendererKey === "monthly_pending_tender_report") {
    return renderMonthlyPendingTenderEmail(subject, input.payload);
  }
  if (rendererKey === "rc_po_expiry_alert") {
    return renderRcPoExpiryEmail(subject, input.payload);
  }
  return {
    ...input.fallback,
    subject,
  };
}

function renderSnapshotEmail(subject: string, payload: Record<string, unknown>): RenderedNotificationEmail {
  const isGroupScope = stringValue(payload.scopeType, "entity") === "group";
  const appUrl = stringValue(payload.appUrl, DEFAULT_APP_URL);
  const firstName = firstNameOf(stringValue(payload.fullName, "there"));
  const scopeLabel = stringValue(payload.scopeLabel, "your mapped entities");
  const reportLinks = [
    {
      href: buildAppUrl(appUrl, "/reports/analytics"),
      label: "Analytics",
      summary: "Executive procurement KPIs, savings, ageing, and stage movement.",
    },
    {
      href: buildAppUrl(appUrl, "/reports/running"),
      label: "Running Tenders",
      summary: "Live tender pipeline with current status and ownership.",
    },
    {
      href: buildAppUrl(appUrl, "/reports/completed"),
      label: "Completed Tenders",
      summary: "Closed tender outcomes and award visibility.",
    },
    {
      href: buildAppUrl(appUrl, "/reports/stage-time"),
      label: "Stage Wise Time Lapse",
      summary: "Stage ageing and delay indicators across the procurement cycle.",
    },
    {
      href: buildAppUrl(appUrl, "/reports/technical-evaluation-pendency"),
      label: "Bid Evaluation Pendency",
      summary: "Technical evaluation pendency requiring review.",
    },
  ];
  return renderEnterpriseEmail({
    actionHref: buildAppUrl(appUrl, "/reports/analytics"),
    actionLabel: "Open Analytics",
    attachmentNote: isGroupScope
      ? "Analytics page PDF is attached for offline review."
      : "Analytics page PDF is attached with data filtered to your mapped entity scope.",
    details: [
      { label: "Snapshot Scope", value: isGroupScope ? "Group-wide" : scopeLabel },
      { label: "Source Report", value: "Analytics dashboard" },
    ],
    detailsTitle: "Snapshot Details",
    greeting: isGroupScope ? `Good Morning Mr. ${firstName},` : `Good Morning ${firstName},`,
    intro: isGroupScope
      ? "Please find attached snapshot of procurement function."
      : `Please find attached snapshot of procurement function of ${scopeLabel}.`,
    kpis: [
      {
        caption: "Active procurement cycles",
        label: "Running Tenders",
        tone: "info",
        value: stringValue(payload.runningTenders, "-"),
      },
      {
        caption: "Closed tender outcomes",
        label: "Completed Tenders",
        tone: "success",
        value: stringValue(payload.completedTenders, "-"),
      },
      {
        caption: "Cases breaching ageing thresholds",
        label: "Stage Ageing Alerts",
        tone: "warning",
        value: stringValue(payload.stageAgeingAlerts, "-"),
      },
      {
        caption: "Pending technical evaluation",
        label: "Evaluation Pendency",
        tone: "danger",
        value: stringValue(payload.evaluationPendency, "-"),
      },
    ],
    reportLinks,
    signOff: isGroupScope ? "Regards,\nProcureDesk Support Team" : "Regards,\nSystem Admin",
    subject,
    support: supportFromPayload(payload),
    title: "Procurement Snapshot",
  });
}

function renderPendingTenderEmail(subject: string, payload: Record<string, unknown>): RenderedNotificationEmail {
  const tenders = arrayPayload(payload.tenders);
  const thresholdDays = stringValue(payload.thresholdDays, 10);
  const appUrl = stringValue(payload.appUrl, DEFAULT_APP_URL);
  return renderEnterpriseEmail({
    actionHref: buildAppUrl(appUrl, "/cases?status=running"),
    actionLabel: "Update Tender Status",
    alert: `The following running tender(s) have not been updated for more than ${thresholdDays} days.`,
    details: [
      { label: "Threshold", value: `${thresholdDays} days` },
      { label: "Pending Tender Count", value: String(tenders.length) },
    ],
    detailsTitle: "Alert Criteria",
    greeting: `Hello ${firstNameOf(stringValue(payload.fullName, "there"))},`,
    headerSubtitle: "Tender progress monitoring alert",
    intro: `This is an auto-generated alert to inform you that the following running tender(s) tagged under your ownership have not been updated for more than ${thresholdDays} days.`,
    sections: [
      {
        body: "You are requested to kindly review and update the respective case status in the system at the earliest to ensure timely monitoring and progress tracking.",
        title: "Action required",
      },
    ],
    signOff: "Regards,\nSystem Admin",
    subject,
    support: supportFromPayload(payload),
    tables: [
      {
        columns: pendingTenderColumns(),
        emptyText: "No pending tender updates found.",
        maxRows: 20,
        rows: tenders,
        title: "Running tender(s) pending update",
      },
    ],
    title: "Pending Tender Progress Updates",
  });
}

function renderMonthlyPendingTenderEmail(subject: string, payload: Record<string, unknown>): RenderedNotificationEmail {
  const tenders = arrayPayload(payload.tenders);
  const thresholdDays = stringValue(payload.thresholdDays, 10);
  const appUrl = stringValue(payload.appUrl, DEFAULT_APP_URL);
  return renderEnterpriseEmail({
    actionHref: buildAppUrl(appUrl, "/cases?status=running"),
    actionLabel: "Review Running Tenders",
    alert: `There are ${tenders.length} running tender case(s) with no update for more than ${thresholdDays} days.`,
    details: [
      { label: "Scope", value: stringValue(payload.scopeLabel, "your reporting scope") },
      { label: "Threshold", value: `${thresholdDays} days` },
      { label: "Pending Tender Count", value: String(tenders.length) },
    ],
    detailsTitle: "Report Criteria",
    greeting: `Hello ${firstNameOf(stringValue(payload.fullName, "there"))},`,
    headerSubtitle: "Monthly tender progress governance report",
    intro: `Please find below the consolidated list of running tender case(s) under your reporting team, where no status update has been recorded for more than ${thresholdDays} days.`,
    sections: [
      {
        body: "You are requested to kindly review the pending cases with the respective Tender Owners and ensure timely updates in the system for effective monitoring and progress tracking.",
        title: "Action required",
      },
    ],
    signOff: "Regards,\nSystem Admin",
    subject,
    support: supportFromPayload(payload),
    tables: [
      {
        columns: pendingTenderColumns(true),
        emptyText: "No pending tender updates found.",
        maxRows: 30,
        rows: tenders,
        title: "Consolidated pending tender case updates",
      },
    ],
    title: "Monthly Pending Tender Report",
  });
}

function renderRcPoExpiryEmail(subject: string, payload: Record<string, unknown>): RenderedNotificationEmail {
  const items = arrayPayload(payload.items).sort((left, right) => Number(left.daysRemaining) - Number(right.daysRemaining));
  const thresholdDays = stringValue(payload.thresholdDays, 90);
  const isGroupScope = stringValue(payload.scopeType, "entity") === "group";
  const appUrl = stringValue(payload.appUrl, DEFAULT_APP_URL);
  return renderEnterpriseEmail({
    actionHref: buildAppUrl(appUrl, "/reports/rc-po-expiry"),
    actionLabel: "Open RC/PO Expiry Report",
    alert: `${items.length} RC/PO item(s) are scheduled to expire within the next ${thresholdDays} days.`,
    attachmentNote: "The attached Excel report contains the details of the upcoming expiries for necessary review and action.",
    details: [
      { label: "Scope", value: isGroupScope ? "Group-wide" : stringValue(payload.scopeLabel, "Mapped entity scope") },
      { label: "Expiry Window", value: `${thresholdDays} days` },
      { label: "Expiry Count", value: String(items.length) },
    ],
    detailsTitle: "Expiry Criteria",
    greeting: isGroupScope
      ? `Hello Mr. ${firstNameOf(stringValue(payload.fullName, "there"))},`
      : `Hello ${firstNameOf(stringValue(payload.fullName, "there"))},`,
    headerSubtitle: "RC/PO validity monitoring alert",
    intro: isGroupScope
      ? `This is an auto-generated alert to inform you that the following RC(s)/PO(s) are scheduled to expire within the next ${thresholdDays} days.`
      : `This is an auto-generated alert to inform you that the following RC(s)/PO(s) under your entity are scheduled to expire within the next ${thresholdDays} days.`,
    signOff: "Regards,\nSystem Admin",
    subject,
    support: supportFromPayload(payload),
    tables: [
      {
        columns: rcPoExpiryColumns(),
        emptyText: "No RC/PO expiries found inside the configured window.",
        maxRows: 15,
        rows: items,
        title: "Upcoming RC/PO expiries preview",
      },
    ],
    title: "RC/PO Expiry Alert",
  });
}

function renderEnterpriseEmail(input: {
  actionHref: string;
  actionLabel: string;
  alert?: string | undefined;
  attachmentNote?: string | undefined;
  details?: EmailDetail[] | undefined;
  detailsTitle?: string | undefined;
  greeting?: string | undefined;
  headerSubtitle?: string | undefined;
  intro: string;
  kpis?: EmailKpi[] | undefined;
  reportLinks?: ReportLink[] | undefined;
  sections?: EmailSection[] | undefined;
  signOff?: string | undefined;
  subject: string;
  support?: EmailSupport | undefined;
  tables?: EmailTable[] | undefined;
  title: string;
}): RenderedNotificationEmail {
  const support = input.support ?? DEFAULT_SUPPORT;
  const details = input.details ?? [];
  const kpis = input.kpis ?? [];
  const reportLinks = input.reportLinks ?? [];
  const sections = input.sections ?? [];
  const tables = input.tables ?? [];
  const textBody = renderEnterpriseTextBody({
    ...input,
    details,
    kpis,
    reportLinks,
    sections,
    support,
    tables,
  });
  const bodyContent = renderEnterpriseBodyContent({
    ...input,
    details,
    kpis,
    reportLinks,
    sections,
    tables,
  });
  const htmlBody = `<!doctype html>
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
        .pd-stack { display: block !important; width: 100% !important; }
        .pd-kpi-cell { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .pd-link-cell { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .pd-button a { display: block !important; text-align: center !important; }
        .pd-header-right { text-align: left !important; padding-top: 12px !important; }
        .pd-title { font-size: 23px !important; line-height: 29px !important; }
        .pd-footer-left, .pd-footer-right { display: block !important; width: 100% !important; padding-right: 0 !important; }
        .pd-footer-right { padding-top: 14px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#edf2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#edf2f7;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" class="pd-shell" style="width:720px;max-width:720px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #d6e1ec;border-radius:12px;overflow:hidden;">
            ${renderHeader(input.title)}
            <tr>
              <td class="pd-px" style="padding:30px 36px 32px 36px;background:#ffffff;">
                ${bodyContent}
              </td>
            </tr>
            ${renderFooter(input.signOff, support)}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { htmlBody, subject: input.subject, textBody };
}

function renderEnterpriseTextBody(input: {
  actionHref: string;
  actionLabel: string;
  alert?: string | undefined;
  attachmentNote?: string | undefined;
  details: EmailDetail[];
  detailsTitle?: string | undefined;
  greeting?: string | undefined;
  intro: string;
  kpis: EmailKpi[];
  reportLinks: ReportLink[];
  sections: EmailSection[];
  signOff?: string | undefined;
  support: EmailSupport;
  tables: EmailTable[];
  title: string;
}): string {
  const lines = [input.title, "", ...optionalLine(input.greeting), input.intro, ""];
  if (input.alert) lines.push("Alert", input.alert, "");
  if (input.details.length) lines.push(input.detailsTitle ?? "Details", ...input.details.map(renderTextDetail), "");
  if (input.kpis.length) lines.push("Key Metrics", ...input.kpis.map(renderTextKpi), "");
  lines.push(...input.tables.flatMap((table) => renderTextEmailTable(table)));
  lines.push(...input.sections.flatMap((section) => [section.title, section.body, ""]));
  if (input.reportLinks.length) lines.push("Quick Report Links", ...input.reportLinks.map(renderTextReportLink), "");
  if (input.attachmentNote) lines.push("Attachment", input.attachmentNote, "");
  lines.push(`${input.actionLabel}: ${input.actionHref}`, "");
  if (input.signOff) lines.push(...input.signOff.split("\n"), "");
  lines.push("ProcureDesk | RPSG", renderTextSupport(input.support));
  lines.push("This is a system-generated email. Please do not reply to this email.");
  return lines.join("\n");
}

function renderEnterpriseBodyContent(input: {
  actionHref: string;
  actionLabel: string;
  alert?: string | undefined;
  attachmentNote?: string | undefined;
  details: EmailDetail[];
  detailsTitle?: string | undefined;
  greeting?: string | undefined;
  intro: string;
  kpis: EmailKpi[];
  reportLinks: ReportLink[];
  sections: EmailSection[];
  tables: EmailTable[];
}): string {
  return [
    input.greeting
      ? `<p style="margin:0 0 8px 0;font-size:17px;line-height:25px;color:#14233a;font-weight:800;">${escapeHtml(input.greeting)}</p>`
      : "",
    `<p style="margin:0;font-size:15px;line-height:25px;color:#34445c;">${escapeHtml(input.intro)}</p>`,
    input.alert ? renderAlert(input.alert) : "",
    renderDetails(input.details, input.detailsTitle ?? "Details"),
    renderKpiHtml(input.kpis),
    input.tables.map(renderTable).join(""),
    input.sections.map(renderSection).join(""),
    renderReportLinks(input.reportLinks),
    input.attachmentNote ? renderAttachmentNote(input.attachmentNote) : "",
    renderAction(input.actionHref, input.actionLabel),
  ].join("");
}

function optionalLine(value: string | undefined): string[] {
  return value ? [value] : [];
}

function renderTextDetail(detail: EmailDetail): string {
  return `${detail.label}: ${detail.value}`;
}

function renderTextKpi(kpi: EmailKpi): string {
  return `${kpi.label}: ${kpi.value}`;
}

function renderTextReportLink(link: ReportLink): string {
  return `${link.label}: ${link.href}`;
}

function renderTextSupport(support: EmailSupport): string {
  return `Support: ${support.name}${support.phone ? ` | ${support.phone}` : ""} | ${support.email}`;
}

function renderHeader(title: string): string {
  return `
    <tr>
      <td class="pd-px" style="padding:20px 36px 22px 36px;background:#0d233a;color:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td class="pd-stack" style="vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="width:34px;vertical-align:middle;">
                    <div style="width:34px;height:34px;background:#ffffff;color:#0d233a;font-size:13px;line-height:34px;text-align:center;font-weight:800;border-radius:8px;">PD</div>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <div style="font-size:10px;line-height:14px;color:#b9cbe0;text-transform:uppercase;font-weight:800;">RPSG Procurement</div>
                    <div style="margin-top:1px;font-size:18px;line-height:23px;color:#ffffff;font-weight:800;">ProcureDesk</div>
                  </td>
                </tr>
              </table>
            </td>
            <td align="right" class="pd-stack pd-header-right" style="vertical-align:top;font-size:12px;line-height:18px;color:#d8e5f4;">
              <span style="display:inline-block;color:#dce8f6;font-weight:700;">Procurement KPI Tracking Portal</span>
            </td>
          </tr>
        </table>
        <h1 class="pd-title" style="margin:18px 0 0 0;font-size:25px;line-height:31px;color:#ffffff;font-weight:800;">${escapeHtml(title)}</h1>
      </td>
    </tr>`;
}

function renderAlert(value: string): string {
  return `<div style="margin-top:18px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:20px;font-weight:700;border-radius:8px;">${escapeHtml(value)}</div>`;
}

function renderDetails(details: EmailDetail[], title: string): string {
  if (!details.length) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-top:20px;background:#f8fafc;border:1px solid #dbe4ef;border-radius:10px;">
      <tr>
        <td colspan="2" style="padding:14px 16px 7px 16px;font-size:13px;line-height:18px;color:#172033;font-weight:800;">${escapeHtml(title)}</td>
      </tr>
      ${details
        .map(
          (detail, index) => `
            <tr>
              <td style="padding:11px 16px;border-top:1px solid #e7edf5;font-size:12px;line-height:18px;color:#62718a;font-weight:800;text-transform:uppercase;width:34%;">${escapeHtml(detail.label)}</td>
              <td style="padding:11px 16px;border-top:1px solid #e7edf5;font-size:14px;line-height:20px;color:#172033;font-weight:800;">${escapeHtml(detail.value)}</td>
            </tr>`,
        )
        .join("")}
    </table>`;
}

function renderKpiHtml(kpis: EmailKpi[]): string {
  if (!kpis.length) return "";
  const cells = kpis.map((kpi) => {
    const tone = toneColors(kpi.tone ?? "neutral");
    return `
      <td class="pd-kpi-cell" width="50%" style="width:50%;padding:6px;vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:${tone.background};border:1px solid ${tone.border};border-radius:10px;">
          <tr>
            <td style="padding:16px 16px 15px 16px;">
              <div style="font-size:12px;line-height:16px;color:#62718a;font-weight:800;">${escapeHtml(kpi.label)}</div>
              <div style="margin-top:7px;font-size:30px;line-height:35px;color:${tone.text};font-weight:800;">${escapeHtml(kpi.value)}</div>
              ${kpi.caption ? `<div style="margin-top:5px;font-size:12px;line-height:18px;color:#62718a;">${escapeHtml(kpi.caption)}</div>` : ""}
            </td>
          </tr>
        </table>
      </td>`;
  });
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px;">
      <tr>
        <td style="padding-bottom:8px;font-size:14px;line-height:20px;color:#172033;font-weight:800;">Dashboard summary</td>
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

function renderSection(section: EmailSection): string {
  return `<div style="margin-top:20px;"><h2 style="margin:0 0 6px;font-size:15px;line-height:21px;color:#172033;">${escapeHtml(section.title)}</h2><p style="margin:0;font-size:13px;line-height:21px;color:#27364f;">${multilineHtml(section.body)}</p></div>`;
}

function renderTable(table: EmailTable): string {
  const rows = table.rows.slice(0, table.maxRows ?? table.rows.length);
  const body = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              ${table.columns
                .map((column) => {
                  const rawValue = row[column.key];
                  const tone = column.tone?.(rawValue, row);
                  return `
                    <td style="padding:10px 8px;border-bottom:1px solid #e8eef6;font-size:12px;line-height:17px;color:#27364f;text-align:${column.align ?? "left"};vertical-align:top;">
                      ${tone ? renderStatusBadge(stringValue(rawValue, "-"), tone) : escapeHtml(stringValue(rawValue, "-"))}
                    </td>`;
                })
                .join("")}
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="${table.columns.length}" style="padding:18px 10px;border-bottom:1px solid #e8eef6;font-size:13px;line-height:20px;color:#62718a;text-align:center;">${escapeHtml(table.emptyText ?? "No records.")}</td></tr>`;
  const moreCount = table.rows.length - rows.length;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px;">
      <tr>
        <td style="padding-bottom:8px;font-size:14px;line-height:20px;color:#172033;font-weight:800;">${escapeHtml(table.title)}</td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe4ef;border-radius:8px;overflow:hidden;">
            <tr>
              ${table.columns
                .map(
                  (column) => `
                    <th align="${column.align ?? "left"}" style="padding:10px 8px;background:#fff7ed;border-bottom:1px solid #fed7aa;font-size:11px;line-height:15px;color:#9a3412;text-align:${column.align ?? "left"};font-weight:800;">
                      ${escapeHtml(column.label)}
                    </th>`,
                )
                .join("")}
            </tr>
            ${body}
          </table>
          ${moreCount > 0 ? `<div style="padding-top:8px;font-size:12px;line-height:18px;color:#62718a;">+ ${moreCount} more row(s) available in ProcureDesk.</div>` : ""}
        </td>
      </tr>
    </table>`;
}

function renderReportLinks(links: ReportLink[]): string {
  if (!links.length) return "";
  const cells = links.map(
    (link) => `
      <td class="pd-link-cell" width="50%" style="width:50%;padding:6px;vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #dbe4ef;border-radius:10px;">
          <tr>
            <td>
              <a href="${escapeAttribute(link.href)}" target="_blank" style="display:block;padding:15px 16px;text-decoration:none;">
                <span style="display:block;font-size:14px;line-height:20px;color:#155eef;font-weight:800;">${escapeHtml(link.label)}</span>
                <span style="display:block;margin-top:5px;font-size:12px;line-height:18px;color:#62718a;">${escapeHtml(link.summary)}</span>
                <span style="display:block;margin-top:9px;font-size:12px;line-height:18px;color:#155eef;font-weight:800;">Open report</span>
              </a>
            </td>
          </tr>
        </table>
      </td>`,
  );
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px;">
      <tr>
        <td style="padding-bottom:8px;font-size:14px;line-height:20px;color:#172033;font-weight:800;">Quick report links</td>
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

function renderAttachmentNote(note: string): string {
  const noteLower = note.toLowerCase();
  const isPdf = noteLower.includes("pdf");
  const isExcel = noteLower.includes("excel") || noteLower.includes("xlsx");
  const badge = isPdf ? "PDF" : isExcel ? "XLSX" : "FILE";
  const title = isPdf ? "Analytics snapshot attached" : isExcel ? "Excel report attached" : "Attachment included";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-top:22px;background:#f5f9ff;border:1px solid #bfd7ff;border-radius:10px;">
      <tr>
        <td style="padding:15px 16px;">
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

function renderAction(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
      <tr>
        <td class="pd-button" style="background:#155eef;border-radius:8px;">
          <a href="${escapeAttribute(href)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;line-height:18px;font-weight:800;border-radius:8px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

function renderFooter(signOff: string | undefined, support: EmailSupport): string {
  return `
    <tr>
      <td class="pd-px" style="padding:22px 36px 26px 36px;background:#f8fafc;border-top:1px solid #dbe4ef;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td class="pd-footer-left" width="50%" style="width:50%;vertical-align:top;padding-right:16px;">
              ${signOff ? `<p style="margin:0;font-size:13px;line-height:20px;color:#34445c;">${escapeHtml(signOff).replace(/\n/g, "<br>")}</p>` : ""}
              <p style="margin:${signOff ? "14px" : "0"} 0 0 0;font-size:11px;line-height:17px;color:#728198;white-space:nowrap;">System-generated notification. Please do not reply to this email.</p>
              <p style="margin:8px 0 0 0;font-size:11px;line-height:17px;color:#728198;">ProcureDesk | RPSG</p>
            </td>
            <td class="pd-footer-right" width="50%" style="width:50%;vertical-align:top;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border-left:3px solid #155eef;border-top:1px solid #e3ebf4;border-right:1px solid #e3ebf4;border-bottom:1px solid #e3ebf4;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px 12px 16px;">
                    <div style="font-size:11px;line-height:15px;color:#62718a;text-transform:uppercase;font-weight:800;letter-spacing:0;">Need help?</div>
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

function chunkHtmlCells(cells: string[], perRow: number): string {
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += perRow) {
    rows.push(`<tr>${cells.slice(index, index + perRow).join("")}</tr>`);
  }
  return rows.join("");
}

function toneColors(tone: EmailTone): { background: string; border: string; text: string } {
  if (tone === "danger") return { background: "#fff7f7", border: "#fecaca", text: "#b42318" };
  if (tone === "info") return { background: "#f5f9ff", border: "#bfdbfe", text: "#155eef" };
  if (tone === "success") return { background: "#f6fef9", border: "#bbf7d0", text: "#15803d" };
  if (tone === "warning") return { background: "#fffbeb", border: "#fde68a", text: "#b45309" };
  return { background: "#f8fafc", border: "#dbe4ef", text: "#172033" };
}

function renderStatusBadge(value: string, tone: EmailTone): string {
  const colors = toneColors(tone);
  return `<span style="display:inline-block;padding:3px 7px;background:${colors.background};border:1px solid ${colors.border};color:${colors.text};font-size:11px;line-height:14px;font-weight:800;border-radius:999px;">${escapeHtml(value)}</span>`;
}

function multilineHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function renderTextEmailTable(table: EmailTable): string[] {
  const lines = [table.title];
  if (!table.rows.length) {
    lines.push(table.emptyText ?? "No records.", "");
    return lines;
  }
  const rows = table.rows.slice(0, table.maxRows ?? table.rows.length);
  lines.push(table.columns.map((column) => column.label).join(" | "));
  for (const row of rows) {
    lines.push(table.columns.map((column) => stringValue(row[column.key], "-")).join(" | "));
  }
  if (table.rows.length > rows.length) lines.push(`+ ${table.rows.length - rows.length} more row(s) in ProcureDesk.`);
  lines.push("");
  return lines;
}

function renderTextTable(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (!rows.length) return "No records.";
  const header = columns.map(labelize).join(" | ");
  const body = rows.slice(0, 30).map((row) => columns.map((column) => stringValue(row[column], "-")).join(" | "));
  const overflow = rows.length > 30 ? [`+ ${rows.length - 30} more row(s) in ProcureDesk.`] : [];
  return [header, ...body, ...overflow].join("\n");
}

function pendingTenderColumns(includeOwner = false): EmailTableColumn[] {
  const columns: EmailTableColumn[] = [
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

function rcPoExpiryColumns(): EmailTableColumn[] {
  return [
    { key: "entity", label: "Entity" },
    { key: "tenderName", label: "Tender Name" },
    { align: "right", key: "rcPoValue", label: "PO/RC Value" },
    { key: "rcPoAwardDate", label: "PO/RC Award Date" },
    { key: "rcPoValidityDate", label: "PO/RC Validity Date" },
    { key: "owner", label: "Tender Owner" },
    {
      align: "right",
      key: "daysRemaining",
      label: "Days remaining to expire",
      tone: (value) => expiryTone(value),
    },
  ];
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

function supportFromPayload(payload: Record<string, unknown>): EmailSupport {
  const rawSupport = payload.support;
  const hasSupport = isRecord(rawSupport);
  const support = hasSupport ? rawSupport : {};
  const hasPhone = Object.prototype.hasOwnProperty.call(support, "phone");
  const phone = hasPhone || hasSupport ? stringValue(support.phone, "") : DEFAULT_SUPPORT.phone;
  return {
    email: stringValue(support.email, DEFAULT_SUPPORT.email),
    name: stringValue(support.name, DEFAULT_SUPPORT.name),
    phone: phone || undefined,
  };
}

function renderSubject(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => stringValue(payload[key], ""));
}

function arrayPayload(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string | number): string {
  if (value === null || value === undefined || value === "") return String(fallback);
  return String(value);
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function buildAppUrl(appUrl: string, path: string): string {
  try {
    return new URL(path, appUrl).toString();
  } catch {
    return `${appUrl.replace(/\/+$/, "")}${path}`;
  }
}

function labelize(value: string): string {
  return value.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase());
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
