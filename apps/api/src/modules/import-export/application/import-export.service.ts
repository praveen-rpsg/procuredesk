import { Readable as ReadableStream, type Readable } from "node:stream";

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  StreamableFile,
} from "@nestjs/common";
import ExcelJS from "exceljs";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import { PrivateFileStorageService } from "../../../common/storage/private-file-storage.service.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import { PasswordPolicyRepository } from "../../identity-access/infrastructure/password-policy.repository.js";
import { PasswordService } from "../../identity-access/application/password.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import {
  ImportExportRepository,
  type CreateFileAssetInput,
} from "../infrastructure/import-export.repository.js";
import type { ImportType } from "../interfaces/http/import-export.schemas.js";

@Injectable()
export class ImportExportService {
  constructor(
    private readonly repository: ImportExportRepository,
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly passwordPolicies: PasswordPolicyRepository,
    private readonly passwords: PasswordService,
    private readonly storage: PrivateFileStorageService,
  ) {}

  async uploadImportFile(
    actor: AuthenticatedUser,
    input: {
      contentType?: string | null;
      importType: ImportType;
      originalFilename?: string | null;
      stream: Readable;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    this.assertAllowedImportFile(
      input.importType,
      input.originalFilename,
      input.contentType,
    );

    const stored = await this.storage.writeImportFile({
      filename: input.originalFilename ?? null,
      stream: input.stream,
      tenantId,
    });
    return this.db.transaction(async () => {
      const result = await this.repository.createUploadedImportJob({
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        contentType: input.contentType ?? null,
        createdBy: actor.id,
        importType: input.importType,
        originalFilename: input.originalFilename ?? null,
        purpose: "import",
        storageKey: stored.storageKey,
        tenantId,
      });
      await this.outbox.write({
        aggregateId: result.id,
        aggregateType: "import_job",
        eventType: "import_job.created",
        payload: { actorUserId: actor.id, importType: input.importType },
        tenantId,
      });
      await this.audit.write({
        action: "import_job.upload",
        actorUserId: actor.id,
        details: {
          byteSize: stored.byteSize,
          contentType: input.contentType ?? null,
          filename: input.originalFilename ?? null,
          importType: input.importType,
        },
        summary: "Uploaded import file and created import job",
        targetId: result.id,
        targetType: "import_job",
        tenantId,
      });
      return {
        fileAssetId: result.fileAssetId,
        id: result.id,
      };
    });
  }

  async createFileAsset(
    actor: AuthenticatedUser,
    input: Omit<CreateFileAssetInput, "createdBy" | "tenantId">,
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return this.db.transaction(async () => {
      const result = await this.repository.createFileAsset({
        ...input,
        createdBy: actor.id,
        tenantId,
      });
      await this.audit.write({
        action: "file_asset.create",
        actorUserId: actor.id,
        summary: "Registered import file asset",
        targetId: result.id,
        targetType: "file_asset",
        tenantId,
      });
      return result;
    });
  }

  async createImportJob(
    actor: AuthenticatedUser,
    input: { fileAssetId: string; importType: string },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return this.db.transaction(async () => {
      const result = await this.repository.createImportJob({
        ...input,
        createdBy: actor.id,
        tenantId,
      });
      await this.outbox.write({
        aggregateId: result.id,
        aggregateType: "import_job",
        eventType: "import_job.created",
        payload: { actorUserId: actor.id, importType: input.importType },
        tenantId,
      });
      await this.audit.write({
        action: "import_job.create",
        actorUserId: actor.id,
        summary: "Created import job",
        targetId: result.id,
        targetType: "import_job",
        tenantId,
      });
      return result;
    });
  }

  listImportJobs(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return this.repository.listImportJobs(tenantId);
  }

  listImportRows(actor: AuthenticatedUser, importJobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return this.repository.listImportRows(tenantId, importJobId);
  }

  async downloadTenderCasesTemplate(actor: AuthenticatedUser) {
    this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    const workbook = await this.buildTenderCasesTemplate();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return new StreamableFile(ReadableStream.from([buffer]), {
      disposition:
        'attachment; filename="procuredesk-tender-cases-template.xlsx"',
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async downloadPortalUserMappingTemplate(actor: AuthenticatedUser) {
    this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return await this.templateFile(
      this.buildSimpleSampleTemplate({
        columns: portalUserTemplateColumns(),
        sampleRows: portalUserTemplateSampleRows(),
        sheetName: "Portal User Mapping",
      }),
      "procuredesk-portal-user-mapping-template.xlsx",
    );
  }

  async downloadUserDepartmentMappingTemplate(actor: AuthenticatedUser) {
    this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return await this.templateFile(
      this.buildSimpleSampleTemplate({
        columns: userDepartmentTemplateColumns(),
        sampleRows: userDepartmentTemplateSampleRows(),
        sheetName: "User Department Mapping",
      }),
      "procuredesk-user-department-mapping-template.xlsx",
    );
  }

  async downloadOldContractsTemplate(actor: AuthenticatedUser) {
    this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return await this.templateFile(
      this.buildSimpleSampleTemplate({
        columns: oldContractTemplateColumns(),
        sampleRows: oldContractTemplateSampleRows(),
        sheetName: "Old Contracts",
      }),
      "procuredesk-old-contracts-template.xlsx",
    );
  }

  async downloadRcPoPlanTemplate(actor: AuthenticatedUser) {
    this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    return await this.templateFile(
      this.buildSimpleSampleTemplate({
        columns: rcPoPlanTemplateColumns(),
        sampleRows: rcPoPlanTemplateSampleRows(),
        sheetName: "Old Contracts",
      }),
      "procuredesk-bulk-upload-old-contract-template.xlsx",
    );
  }

  async downloadProblemRows(actor: AuthenticatedUser, importJobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    const rows = await this.repository.listProblemRows(tenantId, importJobId);
    const csv = this.problemRowsCsv(rows);
    return new StreamableFile(ReadableStream.from([csv]), {
      disposition: `attachment; filename="import-${importJobId}-problem-rows.csv"`,
      type: "text/csv; charset=utf-8",
    });
  }

  async downloadCredentialExport(actor: AuthenticatedUser, importJobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    const file = await this.repository.findCredentialExport({ importJobId, tenantId });
    if (!file) {
      throw new BadRequestException("Credential export is not available for this import job.");
    }
    return new StreamableFile(await this.storage.read(file.storageKey), {
      disposition: `attachment; filename="${file.originalFilename ?? `import-${importJobId}-credentials.xlsx`}"`,
      type: file.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async dryRun(
    actor: AuthenticatedUser,
    input: {
      importJobId: string;
      rows: Array<{
        normalizedPayload?: Record<string, unknown> | null;
        sourcePayload: Record<string, unknown>;
        status?: "accepted" | "rejected" | "staged";
      }>;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    await this.db.transaction(async () => {
      await this.repository.stageDryRunRows({
        importJobId: input.importJobId,
        rows: input.rows.map((row) => ({
          errors:
            row.status === "rejected" ? ["Row rejected during dry run."] : [],
          normalizedPayload: row.normalizedPayload ?? row.sourcePayload,
          sourcePayload: row.sourcePayload,
          status: row.status ?? "staged",
        })),
        tenantId,
      });
      await this.audit.write({
        action: "import_job.dry_run",
        actorUserId: actor.id,
        details: { rowCount: input.rows.length },
        summary: "Staged import dry-run rows",
        targetId: input.importJobId,
        targetType: "import_job",
        tenantId,
      });
    });
    return { stagedRows: input.rows.length };
  }

  async commit(actor: AuthenticatedUser, importJobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "import.manage");
    const importType = await this.repository.getImportJobType({ importJobId, tenantId });
    const portalUserCredentials =
      importType === "portal_user_mapping"
        ? await this.generatePortalUserCredentials(tenantId, importJobId)
        : [];
    let credentialRows: Awaited<ReturnType<ImportExportRepository["commitImportJob"]>>["credentialRows"] = [];
    try {
      await this.db.transaction(async () => {
        const commitResult = await this.repository.commitImportJob({
          committedBy: actor.id,
          importJobId,
          portalUserCredentials,
          tenantId,
        });
        credentialRows = commitResult.credentialRows;
        if (!commitResult.committed) {
          throw new BadRequestException(
            "Import job must be parsed with zero rejected or staged unknown rows before commit.",
          );
        }
        await this.audit.write({
          action: "import_job.commit",
          actorUserId: actor.id,
          summary: "Committed import job",
          targetId: importJobId,
          targetType: "import_job",
          tenantId,
        });
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        "Import commit failed. Review the accepted rows and master data, then try again. If the file was parsed before a recent fix, upload it again and commit the new job.",
      );
    }
    if (importType === "portal_user_mapping" && credentialRows.length) {
      await this.writePortalUserCredentialExport({
        actorUserId: actor.id,
        importJobId,
        rows: credentialRows,
        tenantId,
      });
    }
    return { committed: true };
  }

  private async generatePortalUserCredentials(
    tenantId: string,
    importJobId: string,
  ) {
    const rows = await this.repository.listAcceptedPortalUserRows({ importJobId, tenantId });
    if (!rows.length) return [];
    const policy = await this.passwordPolicies.findByTenantId(tenantId);
    return Promise.all(
      rows
        .filter((row) => !row.isExisting)
        .map(async (row) => {
          const password = this.passwords.generate(policy);
          return {
            email: row.email,
            password,
            passwordHash: await this.passwords.hash(password),
          };
        }),
    );
  }

  private async writePortalUserCredentialExport(input: {
    actorUserId: string;
    importJobId: string;
    rows: Array<{
      action: string;
      email: string;
      emailStatus: string;
      entityCode: string;
      fullName: string;
      password: string;
      role: string;
      username: string;
    }>;
    tenantId: string;
  }): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ProcureDesk";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("User Credentials", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });
    sheet.columns = [
      { header: "Email", key: "email", width: 32 },
      { header: "Username", key: "username", width: 28 },
      { header: "Full Name", key: "fullName", width: 28 },
      { header: "Entities", key: "entityCode", width: 28 },
      { header: "Role", key: "role", width: 24 },
      { header: "Generated Password", key: "password", width: 24 },
      { header: "Action", key: "action", width: 16 },
      { header: "Email Status", key: "emailStatus", width: 18 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      fgColor: { argb: "FF0070C0" },
      pattern: "solid",
      type: "pattern",
    };
    input.rows.forEach((row) => sheet.addRow(row));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `procuredesk-import-${input.importJobId}-credentials.xlsx`;
    const stored = await this.storage.writeGeneratedFile({
      data: buffer,
      filename,
      folder: "exports",
      tenantId: input.tenantId,
    });
    const fileAsset = await this.repository.createFileAsset({
      byteSize: stored.byteSize,
      checksumSha256: stored.checksumSha256,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      createdBy: input.actorUserId,
      originalFilename: filename,
      purpose: "export",
      storageKey: stored.storageKey,
      tenantId: input.tenantId,
    });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.repository.attachCredentialExport({
      expiresAt,
      fileAssetId: fileAsset.id,
      importJobId: input.importJobId,
      tenantId: input.tenantId,
    });
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!hasExpandedPermission(actor, permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }

  private assertAllowedImportFile(
    importType: ImportType,
    filename?: string | null,
    contentType?: string | null,
  ): void {
    const extension = filename?.toLowerCase().split(".").pop() ?? "";
    const normalizedContentType = contentType?.toLowerCase() ?? "";
    const spreadsheetExtensions = new Set(["csv", "xlsx"]);
    const spreadsheetContentTypes = new Set([
      "application/octet-stream",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ]);

    if (
      spreadsheetExtensions.has(extension) ||
      spreadsheetContentTypes.has(normalizedContentType)
    ) {
      return;
    }

    throw new BadRequestException(
      "Spreadsheet imports must use a CSV or XLSX file.",
    );
  }

  private problemRowsCsv(
    rows: Array<{
      errors: unknown[];
      normalizedPayload: Record<string, unknown> | null;
      rowNumber: number;
      sourcePayload: Record<string, unknown>;
      status: string;
    }>,
  ): string {
    const header = [
      "row_number",
      "status",
      "errors",
      "normalized_payload",
      "source_payload",
    ];
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.rowNumber,
          row.status,
          JSON.stringify(row.errors),
          JSON.stringify(row.normalizedPayload ?? {}),
          JSON.stringify(row.sourcePayload),
        ]
          .map((value) => this.csvCell(value))
          .join(","),
      ),
    ];
    return `${lines.join("\n")}\n`;
  }

  private csvCell(value: unknown): string {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  private async templateFile(
    workbook: ExcelJS.Workbook,
    filename: string,
  ): Promise<StreamableFile> {
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return new StreamableFile(ReadableStream.from([buffer]), {
      disposition: `attachment; filename="${filename}"`,
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  private async buildTenderCasesTemplate(): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ProcureDesk";
    workbook.created = new Date();
    const template = workbook.addWorksheet("Tender Import", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });

    const columns = tenderTemplateColumns();
    template.getRow(1).values = columns.map((column) => column.label);
    template.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    template.getRow(1).fill = {
      fgColor: { argb: "FF0070C0" },
      pattern: "solid",
      type: "pattern",
    };
    template.getRow(1).alignment = { vertical: "middle", wrapText: true };
    template.autoFilter = {
      from: "A1",
      to: `${template.getColumn(columns.length).letter}1`,
    };
    template.getRow(2).values = tenderTemplateSampleRow();

    columns.forEach((column, index) => {
      const worksheetColumn = template.getColumn(index + 1);
      worksheetColumn.width = column.width;
      if (column.type === "DD-MM-YYYY") worksheetColumn.numFmt = "dd-mm-yyyy";
    });

    return workbook;
  }

  private async buildImportTemplate(input: {
    columns: TenderTemplateColumn[];
    filename: string;
    instructions: string[];
    metadataName: string;
    sampleRows?: ExcelJS.CellValue[][];
    sheetName: string;
    tenantId: string;
  }): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ProcureDesk";
    workbook.created = new Date();
    const template = workbook.addWorksheet(input.sheetName, {
      views: [{ state: "frozen", xSplit: 0, ySplit: 3 }],
    });
    const lookups = workbook.addWorksheet("Master Lookups");
    const metadata = workbook.addWorksheet("_metadata");
    metadata.state = "veryHidden";

    template.getCell("A1").value = "Instructions to fill the table:";
    template.getCell("A1").font = {
      bold: true,
      color: { argb: "FFFF0000" },
      italic: true,
    };
    input.instructions.forEach((line, index) => {
      const cell = template.getCell(index + 2, 1);
      cell.value = line;
      cell.font = { color: { argb: "FFFF0000" } };
    });

    const headerRow = Math.max(4, input.instructions.length + 3);
    template.getRow(headerRow - 1).values = input.columns.map(
      (column) => column.type,
    );
    template.getRow(headerRow).values = input.columns.map(
      (column) => column.label,
    );
    template.getRow(headerRow - 1).font = {
      bold: true,
      color: { argb: "FFFFB26B" },
    };
    template.getRow(headerRow).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    template.getRow(headerRow).fill = {
      fgColor: { argb: "FF0070C0" },
      pattern: "solid",
      type: "pattern",
    };
    template.getRow(headerRow).alignment = {
      vertical: "middle",
      wrapText: true,
    };
    template.views = [{ state: "frozen", xSplit: 0, ySplit: headerRow }];
    template.autoFilter = {
      from: `A${headerRow}`,
      to: `${template.getColumn(input.columns.length).letter}${headerRow}`,
    };
    input.sampleRows?.forEach((row, index) => {
      template.getRow(headerRow + index + 1).values = row;
    });

    input.columns.forEach((column, index) => {
      const worksheetColumn = template.getColumn(index + 1);
      worksheetColumn.width = column.width;
      if (column.type === "DD-MM-YYYY") worksheetColumn.numFmt = "dd-mm-yyyy";
    });

    const lookupData = await this.loadTemplateLookups(input.tenantId);
    this.populateLookupSheet(lookups, lookupData);
    this.populateMetadataSheet(
      metadata,
      input.columns,
      input.metadataName,
      headerRow,
    );
    this.applyTemplateValidations(
      template,
      input.columns,
      lookupData,
      headerRow + 1,
    );
    return workbook;
  }

  private buildSimpleSampleTemplate(input: {
    columns: TenderTemplateColumn[];
    sampleRows: ExcelJS.CellValue[][];
    sheetName: string;
  }): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ProcureDesk";
    workbook.created = new Date();
    const template = workbook.addWorksheet(input.sheetName, {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });

    template.getRow(1).values = input.columns.map((column) => column.label);
    template.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    template.getRow(1).fill = {
      fgColor: { argb: "FF0070C0" },
      pattern: "solid",
      type: "pattern",
    };
    template.getRow(1).alignment = { vertical: "middle", wrapText: true };
    template.autoFilter = {
      from: "A1",
      to: `${template.getColumn(input.columns.length).letter}1`,
    };
    input.sampleRows.forEach((row, index) => {
      template.getRow(index + 2).values = row;
    });

    input.columns.forEach((column, index) => {
      const worksheetColumn = template.getColumn(index + 1);
      worksheetColumn.width = column.width;
      if (column.type === "DD-MM-YYYY") worksheetColumn.numFmt = "dd-mm-yyyy";
    });

    return workbook;
  }

  private async buildRcPoPlanTemplate(
    tenantId: string,
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ProcureDesk";
    workbook.created = new Date();
    const template = workbook.addWorksheet("Old Contracts", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });
    const lookups = workbook.addWorksheet("Master Lookups");
    const metadata = workbook.addWorksheet("_metadata");
    metadata.state = "veryHidden";

    const columns = rcPoPlanTemplateColumns();
    template.getRow(1).values = columns.map((column) => column.label);
    template.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    template.getRow(1).fill = {
      fgColor: { argb: "FF0070C0" },
      pattern: "solid",
      type: "pattern",
    };
    template.getRow(1).alignment = { vertical: "middle", wrapText: true };
    template.autoFilter = {
      from: "A1",
      to: `${template.getColumn(columns.length).letter}1`,
    };
    rcPoPlanTemplateSampleRows().forEach((row, index) => {
      template.getRow(index + 2).values = row;
    });

    columns.forEach((column, index) => {
      const worksheetColumn = template.getColumn(index + 1);
      worksheetColumn.width = column.width;
      if (column.type === "YYYY-MM-DD") worksheetColumn.numFmt = "yyyy-mm-dd";
    });

    const lookupData = await this.loadTemplateLookups(tenantId);
    const rcPoLookupData = {
      ...lookupData,
      "Entity Code (required)": lookupData.Entity ?? [],
      "Nature of Work": ["Supply", "Service", "Composite"],
    };
    this.populateLookupSheet(lookups, rcPoLookupData);
    this.populateMetadataSheet(metadata, columns, "ProcureDesk Bulk Upload - Old Contract", 1);
    this.applyTemplateValidations(template, columns, rcPoLookupData, 2);
    return workbook;
  }

  private async loadTemplateLookups(
    tenantId: string,
  ): Promise<Record<string, string[]>> {
    const [entities, departments, users, roles, references, tenderTypes] =
      await Promise.all([
        this.db.query<{ code: string }>(
          "select code::text from org.entities where tenant_id = $1 and deleted_at is null and is_active = true order by code",
          [tenantId],
        ),
        this.db.query<{ key: string }>(
          `
          select distinct d.name as key
          from org.departments d
          join org.entities e on e.id = d.entity_id
          where d.tenant_id = $1 and d.deleted_at is null and d.is_active = true
            and e.deleted_at is null and e.is_active = true
          order by d.name
        `,
          [tenantId],
        ),
        this.db.query<{ key: string }>(
          "select username as key from iam.users where tenant_id = $1 and deleted_at is null and status = 'active' order by username",
          [tenantId],
        ),
        this.db.query<{ definition: string | null; key: string }>(
          `
          select name as key, description as definition
          from iam.roles
          where (tenant_id = $1 or tenant_id is null)
            and deleted_at is null
            and code <> 'platform_super_admin'
          order by name
        `,
          [tenantId],
        ),
        this.db.query<{ category_code: string; label: string }>(
          `
          select c.code as category_code, v.label
          from catalog.reference_values v
          join catalog.reference_categories c on c.id = v.category_id
          where v.tenant_id = $1 and v.deleted_at is null and v.is_active = true
          order by c.code, v.display_order, v.label
        `,
          [tenantId],
        ),
        this.db.query<{ name: string }>(
          "select name from catalog.tender_types where tenant_id = $1 and deleted_at is null and is_active = true order by name",
          [tenantId],
        ),
      ]);
    const byCategory = (category: string) =>
      references.rows
        .filter((row) => row.category_code === category)
        .map((row) => row.label);
    return {
      "CPC Involved?": ["Yes", "No"],
      Entity: entities.rows.map((row) => row.code),
      "Access Level Definition": roles.rows.map((row) => row.definition ?? ""),
      "Access Level Required": roles.rows.map((row) => row.key),
      "LOI Awarded?": ["Yes", "No"],
      "Nature of Work": byCategory("nature_of_work"),
      "PR Receiving Medium": byCategory("pr_receiving_medium"),
      "Priority?": ["Yes", "No"],
      "Tender Owner": users.rows.map((row) => row.key),
      "Tender Type": tenderTypes.rows.map((row) => row.name),
      "User Department": departments.rows.map((row) => row.key),
    };
  }

  private populateLookupSheet(
    worksheet: ExcelJS.Worksheet,
    lookupData: Record<string, string[]>,
  ): void {
    const entries = Object.entries(lookupData);
    entries.forEach(([label, values], index) => {
      const column = index + 1;
      worksheet.getCell(1, column).value = label;
      worksheet.getCell(1, column).font = { bold: true };
      values.forEach((value, rowIndex) => {
        worksheet.getCell(rowIndex + 2, column).value = value;
      });
      worksheet.getColumn(column).width = Math.max(18, label.length + 2);
    });
  }

  private populateMetadataSheet(
    worksheet: ExcelJS.Worksheet,
    columns: TenderTemplateColumn[],
    templateName = "ProcureDesk Tender Cases",
    headerRow = 8,
  ): void {
    worksheet.addRow(["Template", templateName]);
    worksheet.addRow(["Version", "2026.05"]);
    worksheet.addRow(["Header Row", headerRow]);
    worksheet.addRow([]);
    worksheet.addRow(["Column", "Type"]);
    columns.forEach((column) => worksheet.addRow([column.label, column.type]));
  }

  private applyTemplateValidations(
    worksheet: ExcelJS.Worksheet,
    columns: TenderTemplateColumn[],
    lookupData: Record<string, string[]>,
    startRow = 9,
  ): void {
    columns.forEach((column, index) => {
      if (column.type !== "Dropdown") return;
      const values = lookupData[column.label] ?? [];
      if (!values.length) return;
      const formula = `"${values.slice(0, 40).join(",")}"`;
      for (let row = startRow; row < startRow + 500; row += 1) {
        worksheet.getCell(row, index + 1).dataValidation = {
          allowBlank: true,
          formulae: [formula],
          type: "list",
        };
      }
    });
  }
}

type TenderTemplateColumn = {
  label: string;
  type:
    | "Alphanumeric"
    | "Auto-fetched / Readonly"
    | "DD-MM-YYYY"
    | "Dropdown"
    | "Email"
    | "Number"
    | "Text"
    | "YYYY-MM-DD";
  width: number;
};

function portalUserTemplateColumns(): TenderTemplateColumn[] {
  return [
    { label: "Entity", type: "Dropdown", width: 18 },
    { label: "Full Name", type: "Text", width: 28 },
    { label: "Access Level Required", type: "Dropdown", width: 24 },
    {
      label: "Access Level Definition",
      type: "Auto-fetched / Readonly",
      width: 34,
    },
    { label: "Mail ID", type: "Email", width: 30 },
    { label: "Contact No.", type: "Text", width: 18 },
  ];
}

function userDepartmentTemplateColumns(): TenderTemplateColumn[] {
  return [
    { label: "Entity", type: "Dropdown", width: 18 },
    { label: "User Department", type: "Text", width: 30 },
  ];
}

function oldContractTemplateColumns(): TenderTemplateColumn[] {
  return [
    { label: "Entity", type: "Dropdown", width: 18 },
    { label: "User Department", type: "Dropdown", width: 24 },
    { label: "Tender Owner", type: "Dropdown", width: 24 },
    { label: "Nature of Work", type: "Dropdown", width: 20 },
    { label: "Tender Description", type: "Text", width: 38 },
    { label: "Awarded Vendors (comma separated)", type: "Text", width: 36 },
    { label: "RC/PO Amount (Rs.) [All Inclusive]", type: "Number", width: 26 },
    { label: "RC/PO Award Date", type: "DD-MM-YYYY", width: 18 },
    { label: "RC/PO Validity Date", type: "DD-MM-YYYY", width: 20 },
  ];
}

function rcPoPlanTemplateColumns(): TenderTemplateColumn[] {
  return [
    { label: "Entity", type: "Dropdown", width: 18 },
    { label: "User Department", type: "Dropdown", width: 24 },
    { label: "Nature of Work", type: "Dropdown", width: 20 },
    { label: "Tender Description", type: "Text", width: 32 },
    { label: "Awarded Vendors (comma separated)", type: "Text", width: 36 },
    { label: "RC/PO Amount (Rs.) [All Inclusive]", type: "Number", width: 26 },
    { label: "RC/PO Award Date", type: "DD-MM-YYYY", width: 18 },
    { label: "RC/PO Validity Date", type: "DD-MM-YYYY", width: 20 },
  ];
}

function portalUserTemplateSampleRows(): ExcelJS.CellValue[][] {
  return [
    [
      "CPDL",
      "Anshul Varshney",
      "Tender Owner",
      "Procurement user who manages assigned tenders.",
      "Anshul.Varshney@rpsg.in",
      "",
    ],
  ];
}

function userDepartmentTemplateSampleRows(): ExcelJS.CellValue[][] {
  return [["CPDL", "IT"]];
}

function oldContractTemplateSampleRows(): ExcelJS.CellValue[][] {
  return [["CPDL", "IT", "tenant.admin", ...rcPoPlanTemplateSampleRow().slice(2)]];
}

function rcPoPlanTemplateSampleRows(): ExcelJS.CellValue[][] {
  return [rcPoPlanTemplateSampleRow()];
}

function rcPoPlanTemplateSampleRow(): ExcelJS.CellValue[] {
  return [
    "CPDL",
    "IT",
    "Service",
    "CPDL-IT-Tender Description Test 1",
    "Vendor 1, Vendor 2",
    1_000_000,
    "15-05-2025",
    "11-11-2025",
  ];
}

function tenderTemplateSampleRow(): ExcelJS.CellValue[] {
  return [
      "CESC-RAJ",
      "Email",
      "jashodipta.sengupta@rpsg.in",
      "",
      "01-02-2026",
      "PR Description Bulk 3",
      15_000_000,
      "Yes",
      "Supply",
      "Civil",
      "Open",
      "Yes",
      "Sample priority procurement",
      "Tender Name bulk 3",
      "Tender Number bulk 3",
      "08-02-2026",
      "11-02-2026",
      "14-02-2026",
      "24-02-2026",
      8,
      "03-03-2026",
      "05-03-2026",
      8,
      16_500_000,
      "15-03-2026",
      "18-03-2026",
      16_000_000,
      "Yes",
      "20-03-2026",
      "22-03-2026",
      "22-03-2027",
  ];
}

function tenderTemplateColumns(): TenderTemplateColumn[] {
  return [
    { label: "Entity", type: "Dropdown", width: 18 },
    { label: "PR Receiving Medium", type: "Dropdown", width: 22 },
    { label: "Tender Owner", type: "Dropdown", width: 24 },
    { label: "PR/Scheme No", type: "Alphanumeric", width: 20 },
    { label: "PR/Scheme Receipt Date", type: "DD-MM-YYYY", width: 22 },
    { label: "PR Description", type: "Text", width: 34 },
    {
      label: "PR Value / Approved Budget (Rs.) [All Inclusive]",
      type: "Number",
      width: 26,
    },
    { label: "CPC Involved?", type: "Dropdown", width: 16 },
    { label: "Nature of Work", type: "Dropdown", width: 20 },
    { label: "User Department", type: "Dropdown", width: 22 },
    { label: "Tender Type", type: "Dropdown", width: 20 },
    { label: "Priority?", type: "Dropdown", width: 16 },
    { label: "PR Remarks", type: "Text", width: 28 },
    { label: "Tender Name", type: "Text", width: 32 },
    { label: "Tender No.", type: "Alphanumeric", width: 20 },
    { label: "NIT Initiation", type: "DD-MM-YYYY", width: 16 },
    { label: "NIT Approval", type: "DD-MM-YYYY", width: 16 },
    { label: "NIT Publish", type: "DD-MM-YYYY", width: 16 },
    { label: "Bid Receipt", type: "DD-MM-YYYY", width: 16 },
    { label: "Bidder Participated Count", type: "Number", width: 20 },
    { label: "Commercial Evaluation", type: "DD-MM-YYYY", width: 20 },
    { label: "Technical Evaluation", type: "DD-MM-YYYY", width: 20 },
    { label: "Qualified Bidders Count", type: "Number", width: 20 },
    {
      label: "Estimate / Benchmark (Rs.) [All Inclusive]",
      type: "Number",
      width: 26,
    },
    { label: "NFA Submission", type: "DD-MM-YYYY", width: 16 },
    { label: "NFA Approval", type: "DD-MM-YYYY", width: 16 },
    {
      label: "NFA Approved Amount (Rs.) [All Inclusive]",
      type: "Number",
      width: 26,
    },
    { label: "LOI Awarded?", type: "Dropdown", width: 16 },
    { label: "LOI Award Date", type: "DD-MM-YYYY", width: 16 },
    { label: "RC/PO Award Date", type: "DD-MM-YYYY", width: 18 },
    { label: "RC/PO Validity", type: "DD-MM-YYYY", width: 18 },
  ];
}
