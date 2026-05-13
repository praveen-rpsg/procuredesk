import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { createImportParserRegistry } from "./import-parser-registry.js";

const registry = createImportParserRegistry();

// ─── CSV parser ─────────────────────────────────────────────────────────────

describe("CsvImportParser (tender_cases)", () => {
  it("parses a valid CSV into rows", async () => {
    const csv = [
      "pr_id,pr_description,entity_code,owner_username",
      "PR001,Fix roof,HQ,alice",
      "PR002,Buy chairs,HQ,bob",
    ].join("\n");

    const rows = await registry.tender_cases.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "tender_cases",
      storageKey: "tenant/imports/2025/01/file.csv",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]!.normalizedPayload!["prId"]).toBe("PR001");
    expect(rows[1]!.normalizedPayload!["ownerUsername"]).toBe("bob");
  });

  it("returns empty array for CSV with headers only", async () => {
    const csv = "pr_id,pr_description\n";
    const rows = await registry.tender_cases.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "tender_cases",
      storageKey: "tenant/imports/2025/01/file.csv",
    });
    expect(rows).toHaveLength(0);
  });

  it("handles quoted fields with commas inside", async () => {
    const csv = `pr_id,pr_description\nPR003,"Repair, replace, upgrade"`;
    const rows = await registry.tender_cases.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "tender_cases",
      storageKey: "file.csv",
    });
    expect(rows[0]!.normalizedPayload!["prDescription"]).toBe("Repair, replace, upgrade");
  });

  it("maps the exact business-facing tender template labels", async () => {
    const csv = [
      [
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
      ].join(","),
      [
        "LOCAL",
        "Email",
        "tenant.admin",
        "PR-1001",
        "01-05-2026",
        "Annual maintenance",
        "100000",
        "Yes",
        "Services",
        "Mains",
        "Limited",
        "High",
        "Urgent",
        "AMC Tender",
        "TN-1001",
        "02-05-2026",
        "03-05-2026",
        "04-05-2026",
        "10-05-2026",
        "5",
        "12-05-2026",
        "11-05-2026",
        "3",
        "95000",
        "13-05-2026",
        "14-05-2026",
        "90000",
        "Yes",
        "15-05-2026",
        "16-05-2026",
        "16-05-2027",
      ].join(","),
    ].join("\n");

    const rows = await registry.tender_cases.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "tender_cases",
      storageKey: "tenant/imports/tender.csv",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.normalizedPayload).toMatchObject({
      approvedAmount: "90000",
      bidReceiptDate: "10-05-2026",
      biddersParticipated: "5",
      commercialEvaluationDate: "12-05-2026",
      cpcInvolved: "Yes",
      departmentName: "Mains",
      entityCode: "LOCAL",
      estimateBenchmark: "95000",
      loiIssued: "Yes",
      natureOfWork: "Services",
      ownerUsername: "tenant.admin",
      prId: "PR-1001",
      prReceivingMedium: "Email",
      prValue: "100000",
      qualifiedBidders: "3",
      rcPoAwardDate: "16-05-2026",
      rcPoValidityDate: "16-05-2027",
      technicalEvaluationDate: "11-05-2026",
      tenderName: "AMC Tender",
      tenderNo: "TN-1001",
      tenderType: "Limited",
    });
  });
});

describe("XlsxImportParser (tender_cases)", () => {
  it("detects the tender template header row after instructions and field types", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tender Import");
    sheet.getCell("A1").value = "Instructions to fill the table:";
    sheet.getRow(7).values = [
      ,
      "Dropdown",
      "Dropdown",
      "Dropdown",
      "Alphanumeric",
      "DD-MM-YYYY",
      "Text",
      "Number",
      "Dropdown",
    ];
    sheet.getRow(8).values = [
      ,
      "Entity",
      "PR Receiving Medium",
      "Tender Owner",
      "PR/Scheme No",
      "PR/Scheme Receipt Date",
      "PR Description",
      "PR Value / Approved Budget (Rs.) [All Inclusive]",
      "CPC Involved?",
    ];
    sheet.getRow(9).values = [
      ,
      "LOCAL",
      "Portal",
      "tenant.admin",
      "PR-1002",
      "02-05-2026",
      "New tender",
      250000,
      "No",
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const rows = await registry.tender_cases.parse({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: Buffer.from(buffer),
      importType: "tender_cases",
      storageKey: "tenant/imports/tender.xlsx",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.normalizedPayload).toMatchObject({
      cpcInvolved: "No",
      entityCode: "LOCAL",
      ownerUsername: "tenant.admin",
      prDescription: "New tender",
      prId: "PR-1002",
      prReceivingMedium: "Portal",
      prValue: 250000,
    });
  });
});

// ─── rc_po_plan CSV ──────────────────────────────────────────────────────────

describe("CsvImportParser (rc_po_plan)", () => {
  it("maps rc_po_plan columns correctly", async () => {
    const csv = [
      "entity_code,tender_description,rc_po_amount",
      "HQ,New Tender,500000",
    ].join("\n");

    const rows = await registry.rc_po_plan.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "rc_po_plan",
      storageKey: "file.csv",
    });

    expect(rows[0]!.normalizedPayload!["entityCode"]).toBe("HQ");
    expect(rows[0]!.normalizedPayload!["rcPoAmount"]).toBe("500000");
  });

  it("maps the business-facing RC/PO Plan template labels", async () => {
    const csv = [
      "Entity Code (required),User Department,Tender Description,Awarded Vendors (comma separated),RC/PO Amount (Rs.),RC/PO Award Date (YYYY-MM-DD),RC/PO Validity Date (YYYY-MM-DD)",
      "CESC,Mechanical,Sample tender,\"Vendor A, Vendor B\",100000,2026-01-31,2027-01-30",
    ].join("\n");

    const rows = await registry.rc_po_plan.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "rc_po_plan",
      storageKey: "file.csv",
    });

    expect(rows[0]!.normalizedPayload).toMatchObject({
      awardedVendors: "Vendor A, Vendor B",
      departmentName: "Mechanical",
      entityCode: "CESC",
      rcPoAmount: "100000",
      rcPoAwardDate: "2026-01-31",
      rcPoValidityDate: "2027-01-30",
      tenderDescription: "Sample tender",
    });
  });

  it("detects the RC/PO Plan xlsx header row at the top of the sheet", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("RC PO Plan");
    sheet.getRow(1).values = [
      ,
      "Entity Code (required)",
      "User Department",
      "Tender Description",
      "Awarded Vendors (comma separated)",
      "RC/PO Amount (Rs.)",
      "RC/PO Award Date (YYYY-MM-DD)",
      "RC/PO Validity Date (YYYY-MM-DD)",
    ];
    sheet.getRow(2).values = [
      ,
      "CESC",
      "Mechanical",
      "Sample tender",
      "Vendor A, Vendor B",
      100000,
      "2026-01-31",
      "2027-01-30",
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const rows = await registry.rc_po_plan.parse({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: Buffer.from(buffer),
      importType: "rc_po_plan",
      storageKey: "tenant/imports/rc-po-plan.xlsx",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.normalizedPayload).toMatchObject({
      departmentName: "Mechanical",
      entityCode: "CESC",
      rcPoAmount: 100000,
      rcPoAwardDate: "2026-01-31",
      rcPoValidityDate: "2027-01-30",
    });
  });
});

describe("CsvImportParser (enterprise mapping templates)", () => {
  it("maps Entity - Portal User Mapping labels", async () => {
    const csv = [
      "Entity,Full Name,Access Level Required,Access Level Definition,Mail ID,Contact No.",
      "LOCAL,Anita Rao,Approver,Can approve procurement cases,anita@example.com,+91 9999999999",
    ].join("\n");

    const rows = await registry.portal_user_mapping.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "portal_user_mapping",
      storageKey: "portal-users.csv",
    });

    expect(rows[0]!.normalizedPayload).toMatchObject({
      accessLevelDefinition: "Can approve procurement cases",
      accessLevelRequired: "Approver",
      contactNo: "+91 9999999999",
      entityCode: "LOCAL",
      fullName: "Anita Rao",
      mailId: "anita@example.com",
    });
  });

  it("maps Entity - User Department Mapping labels", async () => {
    const csv = ["Entity,User Department", "LOCAL,Finance"].join("\n");

    const rows = await registry.user_department_mapping.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "user_department_mapping",
      storageKey: "departments.csv",
    });

    expect(rows[0]!.normalizedPayload).toMatchObject({
      departmentName: "Finance",
      entityCode: "LOCAL",
    });
  });

  it("maps Bulk Upload - Old Contract labels", async () => {
    const csv = [
      "Entity,User Department,Tender Owner,Tender Description,Awarded Vendors (comma separated),RC/PO Amount (Rs.),RC/PO Award Date,RC/PO Validity Date",
      "LOCAL,Stores,tenant.admin,Legacy AMC,\"Vendor A, Vendor B\",120000,01-04-2026,31-03-2027",
    ].join("\n");

    const rows = await registry.old_contracts.parse({
      contentType: "text/csv",
      data: Buffer.from(csv),
      importType: "old_contracts",
      storageKey: "old-contracts.csv",
    });

    expect(rows[0]!.normalizedPayload).toMatchObject({
      awardedVendors: "Vendor A, Vendor B",
      departmentName: "Stores",
      entityCode: "LOCAL",
      ownerUsername: "tenant.admin",
      rcPoAmount: "120000",
      rcPoAwardDate: "01-04-2026",
      rcPoValidityDate: "31-03-2027",
      tenderDescription: "Legacy AMC",
    });
  });
});
