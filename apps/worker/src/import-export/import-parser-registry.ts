import ExcelJS from "exceljs";

import type { ImportParser, ImportParserInput, ParsedImportRow } from "./import-parser.js";

const MAX_IMPORT_ROWS = 10_000;
const TENDER_TEMPLATE_COLUMNS = [
  "Entity",
  "PR Receiving Medium",
  "Tender Owner",
  "PR/Scheme No",
  "PR/Scheme Receipt Date",
  "PR Description",
  "PR Value / Approved Budget (Rs.) [All Inclusive]",
  "CPC Involved?",
  "Nature of Work",
  "User Department",
  "Tender Type",
  "Priority?",
  "PR Remarks",
  "Tender Name",
  "Tender No.",
  "NIT Initiation",
  "NIT Approval",
  "NIT Publish",
  "Bid Receipt",
  "Bidder Participated Count",
  "Commercial Evaluation",
  "Technical Evaluation",
  "Qualified Bidders Count",
  "Estimate / Benchmark (Rs.) [All Inclusive]",
  "NFA Submission",
  "NFA Approval",
  "NFA Approved Amount (Rs.) [All Inclusive]",
  "LOI Awarded?",
  "LOI Award Date",
  "RC/PO Award Date",
  "RC/PO Validity",
] as const;
const PORTAL_USER_TEMPLATE_COLUMNS = [
  "Entity",
  "Full Name",
  "Access Level Required",
  "Access Level Definition",
  "Mail ID",
  "Contact No.",
] as const;
const USER_DEPARTMENT_TEMPLATE_COLUMNS = ["Entity", "User Department"] as const;
const OLD_CONTRACT_TEMPLATE_COLUMNS = [
  "Entity",
  "User Department",
  "Tender Owner",
  "Tender Description",
  "Awarded Vendors (comma separated)",
  "RC/PO Amount (Rs.)",
  "RC/PO Award Date",
  "RC/PO Validity Date",
] as const;
const RC_PO_PLAN_TEMPLATE_COLUMNS = [
  "Entity",
  "User Department",
  "Tender Description",
  "Awarded Vendors (comma separated)",
  "RC/PO Amount (Rs.)",
  "RC/PO Award Date",
  "RC/PO Validity Date",
] as const;
const TEMPLATE_COLUMN_SETS = [
  TENDER_TEMPLATE_COLUMNS,
  PORTAL_USER_TEMPLATE_COLUMNS,
  USER_DEPARTMENT_TEMPLATE_COLUMNS,
  OLD_CONTRACT_TEMPLATE_COLUMNS,
  RC_PO_PLAN_TEMPLATE_COLUMNS,
];

class CsvImportParser implements ImportParser {
  async parse(input: ImportParserInput): Promise<ParsedImportRow[]> {
    const rows = isXlsx(input) ? await parseXlsx(input.data) : parseCsv(input.data.toString("utf8"));

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(
        `Import file exceeds the maximum of 10,000 rows. Found ${rows.length.toLocaleString()} rows.`,
      );
    }

    return rows.map((sourcePayload) => ({
      errors: [],
      normalizedPayload: normalizeImportPayload(input.importType, sourcePayload),
      sourcePayload,
      status: "staged",
    }));
  }
}

export function createImportParserRegistry(): Record<ImportParserInput["importType"], ImportParser> {
  const csv = new CsvImportParser();
  return {
    old_contracts: csv,
    portal_user_mapping: csv,
    rc_po_plan: csv,
    tender_cases: csv,
    user_department_mapping: csv,
  };
}

function isXlsx(input: ImportParserInput): boolean {
  return (
    input.storageKey.toLowerCase().endsWith(".xlsx") ||
    input.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

async function parseXlsx(data: Buffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  const workbookData = data as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookData);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headerRowNumber = findHeaderRow(sheet);
  const headers = rowValues(sheet.getRow(headerRowNumber)).map((value) => String(value ?? "").trim());
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const values = rowValues(row);
    if (values.every((value) => String(value ?? "").trim() === "")) return;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, normalizeCellValue(values[index])])));
  });
  return rows;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  let bestRow = 1;
  let bestScore = 0;
  let bestRequiredScore = 7;
  sheet.eachRow((row, rowNumber) => {
    const values = rowValues(row).map((value) => String(value ?? "").trim().toLowerCase());
    let score = 0;
    let requiredScore = 7;
    for (const columns of TEMPLATE_COLUMN_SETS) {
      const columnScore = columns.filter((column) => values.includes(column.toLowerCase())).length;
      if (columnScore > score) {
        score = columnScore;
        requiredScore = Math.min(7, columns.length);
      }
    }
    if (score > bestScore) {
      bestRow = rowNumber;
      bestScore = score;
      bestRequiredScore = requiredScore;
    }
  });
  return bestScore >= bestRequiredScore ? bestRow : 1;
}

function rowValues(row: ExcelJS.Row): unknown[] {
  const values = row.values;
  return Array.isArray(values) ? values.slice(1) : [];
}

function normalizeCellValue(value: unknown): unknown {
  if (value && typeof value === "object" && "text" in value) {
    return (value as { text?: unknown }).text ?? "";
  }
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result?: unknown }).result ?? "";
  }
  return value ?? "";
}

function parseCsv(source: string): Record<string, unknown>[] {
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = splitCsvLine(lines[0] ?? "").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeImportPayload(
  importType: ImportParserInput["importType"],
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (importType === "rc_po_plan") {
    return {
      awardedVendors: first(row, ["Awarded Vendors (comma separated)", "awarded_vendors", "Awarded Vendors", "vendor", "Vendor"]),
      departmentName: first(row, ["User Department", "department", "Department"]),
      entityCode: first(row, ["Entity Code (required)", "entity_code", "Entity Code", "entity", "Entity"]),
      rcPoAmount: first(row, ["RC/PO Amount (Rs.)", "RC/PO Amount (Rs.) [All Inclusive]", "rc_po_amount", "RC/PO Amount", "amount", "Amount"]),
      rcPoAwardDate: first(row, ["RC/PO Award Date (YYYY-MM-DD)", "rc_po_award_date", "RC/PO Award Date", "Award Date", "award_date"]),
      rcPoValidityDate: first(row, ["RC/PO Validity Date (YYYY-MM-DD)", "rc_po_validity_date", "RC/PO Validity Date", "Validity Date", "validity_date"]),
      tenderDescription: first(row, ["tender_description", "Tender Description", "description"]),
      tentativeTenderingDate: first(row, ["tentative_tendering_date", "Tentative Tendering Date"]),
    };
  }

  if (importType === "old_contracts") {
    return {
      awardedVendors: first(row, ["Awarded Vendors (comma separated)", "awarded_vendors", "Awarded Vendors", "vendor", "Vendor"]),
      departmentName: first(row, ["User Department", "department", "Department"]),
      entityCode: first(row, ["Entity", "entity_code", "Entity Code", "entity"]),
      ownerUsername: first(row, ["Tender Owner", "owner_username", "Owner Username", "owner", "Owner"]),
      rcPoAmount: first(row, ["RC/PO Amount (Rs.)", "RC/PO Amount (Rs.) [All Inclusive]", "rc_po_amount", "RC/PO Amount", "amount", "Amount"]),
      rcPoAwardDate: first(row, ["RC/PO Award Date", "rc_po_award_date", "Award Date", "award_date"]),
      rcPoValidityDate: first(row, ["RC/PO Validity Date", "rc_po_validity_date", "Validity Date", "validity_date"]),
      tenderDescription: first(row, ["Tender Description", "tender_description", "description"]),
    };
  }

  if (importType === "portal_user_mapping") {
    return {
      accessLevelDefinition: first(row, ["Access Level Definition", "access_level_definition"]),
      accessLevelRequired: first(row, ["Access Level Required", "access_level_required", "role", "Role"]),
      contactNo: first(row, ["Contact No.", "Contact No", "contact_no", "phone", "Phone"]),
      entityCode: first(row, ["Entity", "entity_code", "Entity Code", "entity"]),
      fullName: first(row, ["Full Name", "full_name", "name", "Name"]),
      mailId: first(row, ["Mail ID", "Mail Id", "mail_id", "email", "Email"]),
    };
  }

  if (importType === "user_department_mapping") {
    return {
      departmentName: first(row, ["User Department", "department", "Department"]),
      entityCode: first(row, ["Entity", "entity_code", "Entity Code", "entity"]),
    };
  }

  return {
    approvedAmount: first(row, [
      "NFA Approved Amount (Rs.) [All Inclusive]",
      "approved_amount",
      "Approved Amount",
    ]),
    budgetType: first(row, ["budget_type", "Budget Type"]),
    biddersParticipated: first(row, ["Bidder Participated Count", "bidders_participated"]),
    bidReceiptDate: first(row, ["Bid Receipt", "bid_receipt_date"]),
    commercialEvaluationDate: first(row, ["Commercial Evaluation", "commercial_evaluation_date"]),
    cpcInvolved: first(row, ["CPC Involved?", "cpc_involved", "CPC Involved"]),
    departmentName: first(row, ["User Department", "department", "Department"]),
    entityCode: first(row, ["entity_code", "Entity Code", "entity", "Entity"]),
    estimateBenchmark: first(row, [
      "Estimate / Benchmark (Rs.) [All Inclusive]",
      "estimate_benchmark",
      "Estimate Benchmark",
    ]),
    loiIssued: first(row, ["LOI Awarded?", "loi_issued", "LOI Awarded"]),
    loiIssuedDate: first(row, ["LOI Award Date", "loi_issued_date", "LOI Award Date"]),
    natureOfWork: first(row, ["Nature of Work", "nature_of_work", "Nature Of Work"]),
    nfaApprovalDate: first(row, ["NFA Approval", "nfa_approval_date"]),
    nfaSubmissionDate: first(row, ["NFA Submission", "nfa_submission_date"]),
    nitApprovalDate: first(row, ["NIT Approval", "nit_approval_date"]),
    nitInitiationDate: first(row, ["NIT Initiation", "nit_initiation_date"]),
    nitPublishDate: first(row, ["NIT Publish", "nit_publish_date"]),
    ownerUsername: first(row, ["Tender Owner", "owner_username", "Owner Username", "allocated_to", "Allocated To", "owner", "Owner"]),
    prDescription: first(row, ["pr_description", "PR Description", "description"]),
    priority: first(row, ["Priority?", "priority", "Priority"]),
    prId: first(row, ["PR/Scheme No", "pr_id", "PR ID", "PR"]),
    prRemarks: first(row, ["PR Remarks", "pr_remarks"]),
    prReceivingMedium: first(row, ["pr_receiving_medium", "PR Receiving Medium"]),
    prReceiptDate: first(row, ["PR/Scheme Receipt Date", "pr_receipt_date", "PR Receipt Date"]),
    prSchemeNo: first(row, ["PR/Scheme No", "pr_scheme_no", "PR Scheme No"]),
    prValue: first(row, [
      "PR Value / Approved Budget (Rs.) [All Inclusive]",
      "pr_value",
      "PR Value",
    ]),
    qualifiedBidders: first(row, ["Qualified Bidders Count", "qualified_bidders"]),
    rcPoAwardDate: first(row, ["RC/PO Award Date", "rc_po_award_date"]),
    rcPoValidityDate: first(row, ["RC/PO Validity", "rc_po_validity", "rc_po_validity_date"]),
    technicalEvaluationDate: first(row, ["Technical Evaluation", "technical_evaluation_date"]),
    tenderDescription: first(row, ["Tender Name", "tender_description", "Tender Description"]),
    tenderName: first(row, ["Tender Name", "tender_name"]),
    tenderNo: first(row, ["Tender No.", "Tender No", "tender_no"]),
    tenderType: first(row, ["tender_type", "Tender Type"]),
  };
}

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}
