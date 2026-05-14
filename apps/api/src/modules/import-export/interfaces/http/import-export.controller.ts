import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import path from "node:path";
import type { FastifyRequest } from "fastify";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { stripUndefined } from "../../../../common/utils/strip-undefined.js";
import { ZodValidationPipe } from "../../../../common/validation/zod-validation.pipe.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { ImportExportService } from "../../application/import-export.service.js";
import {
  CreateFileAssetRequestSchema,
  CreateImportJobRequestSchema,
  DryRunImportRequestSchema,
  ImportTypeSchema,
  type CreateFileAssetRequest,
  type CreateImportJobRequest,
  type DryRunImportRequest,
  type ImportType,
} from "./import-export.schemas.js";

type MultipartUploadRequest = FastifyRequest & {
  file: () => Promise<MultipartFile | undefined>;
};

// Allowlist of MIME types accepted for import uploads.
const ALLOWED_MIME_TYPES = new Set([
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // some HTTP clients send this generic type for CSV/XLSX
]);

// Allowlist of file extensions accepted for import uploads.
const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx", ".txt"]);

@Controller("imports")
@UseGuards(AuthGuard, PermissionGuard)
export class ImportExportController {
  constructor(private readonly importExport: ImportExportService) {}

  @Post("upload/:importType")
  @RequirePermissions("import.manage")
  async uploadImportFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("importType", new ZodValidationPipe(ImportTypeSchema)) importType: ImportType,
    @Req() request: MultipartUploadRequest,
  ) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException("Import file is required.");
    }

    // ── MIME type validation ──────────────────────────────────────────────────
    const contentType = (file.mimetype ?? "").split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new BadRequestException(
        `File type '${contentType}' is not allowed. Accepted types: CSV or XLSX.`,
      );
    }

    // ── File extension validation ─────────────────────────────────────────────
    const ext = path.extname(file.filename ?? "").toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `File extension '${ext}' is not allowed. Accepted extensions: .csv or .xlsx.`,
      );
    }

    return this.importExport.uploadImportFile(user, {
      contentType: file.mimetype,
      importType,
      originalFilename: file.filename,
      stream: file.file,
    });
  }

  @Post("file-assets")
  @RequirePermissions("import.manage")
  createFileAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateFileAssetRequestSchema)) body: CreateFileAssetRequest,
  ) {
    return this.importExport.createFileAsset(user, stripUndefined(body));
  }

  @Post("jobs")
  @RequirePermissions("import.manage")
  createImportJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateImportJobRequestSchema)) body: CreateImportJobRequest,
  ) {
    return this.importExport.createImportJob(user, stripUndefined(body));
  }

  @Get("jobs")
  @RequirePermissions("import.manage")
  listImportJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.importExport.listImportJobs(user);
  }

  @Get("templates/tender-cases.xlsx")
  @RequirePermissions("import.manage")
  downloadTenderCasesTemplate(@CurrentUser() user: AuthenticatedUser) {
    return this.importExport.downloadTenderCasesTemplate(user);
  }

  @Get("templates/portal-user-mapping.xlsx")
  @RequirePermissions("import.manage")
  downloadPortalUserMappingTemplate(@CurrentUser() user: AuthenticatedUser) {
    return this.importExport.downloadPortalUserMappingTemplate(user);
  }

  @Get("templates/user-department-mapping.xlsx")
  @RequirePermissions("import.manage")
  downloadUserDepartmentMappingTemplate(@CurrentUser() user: AuthenticatedUser) {
    return this.importExport.downloadUserDepartmentMappingTemplate(user);
  }

  @Get("templates/old-contracts.xlsx")
  @RequirePermissions("import.manage")
  downloadOldContractsTemplate(@CurrentUser() user: AuthenticatedUser) {
    return this.importExport.downloadOldContractsTemplate(user);
  }

  @Get("templates/rc-po-plan.xlsx")
  @RequirePermissions("import.manage")
  downloadRcPoPlanTemplate(@CurrentUser() user: AuthenticatedUser) {
    return this.importExport.downloadRcPoPlanTemplate(user);
  }

  @Get("jobs/:importJobId/rows")
  @RequirePermissions("import.manage")
  listImportRows(@CurrentUser() user: AuthenticatedUser, @Param("importJobId", ParseUUIDPipe) importJobId: string) {
    return this.importExport.listImportRows(user, importJobId);
  }

  @Get("jobs/:importJobId/problem-rows.csv")
  @RequirePermissions("import.manage")
  downloadProblemRows(@CurrentUser() user: AuthenticatedUser, @Param("importJobId", ParseUUIDPipe) importJobId: string) {
    return this.importExport.downloadProblemRows(user, importJobId);
  }

  @Get("jobs/:importJobId/credentials.xlsx")
  @RequirePermissions("import.manage")
  downloadCredentialExport(@CurrentUser() user: AuthenticatedUser, @Param("importJobId", ParseUUIDPipe) importJobId: string) {
    return this.importExport.downloadCredentialExport(user, importJobId);
  }

  @Post("jobs/:importJobId/dry-run")
  @RequirePermissions("import.manage")
  dryRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param("importJobId", ParseUUIDPipe) importJobId: string,
    @Body(new ZodValidationPipe(DryRunImportRequestSchema)) body: DryRunImportRequest,
  ) {
    return this.importExport.dryRun(user, stripUndefined({ importJobId, rows: body.rows }));
  }

  @Post("jobs/:importJobId/commit")
  @RequirePermissions("import.manage")
  commit(@CurrentUser() user: AuthenticatedUser, @Param("importJobId", ParseUUIDPipe) importJobId: string) {
    return this.importExport.commit(user, importJobId);
  }
}
