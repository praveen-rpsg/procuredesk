import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";

import { RedisCacheService } from "../../../common/cache/redis-cache.service.js";
import { PrivateFileStorageService } from "../../../common/storage/private-file-storage.service.js";
import { DatabaseService } from "../../../database/database.service.js";
import { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import type { ReportCode } from "../domain/report-read-models.js";
import {
  ReportingRepository,
  type ReportFilters,
  type ReportScope,
} from "../infrastructure/reporting.repository.js";

@Injectable()
export class ReportingService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly audit: AuditWriterService,
    private readonly cache: RedisCacheService,
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
    private readonly storage: PrivateFileStorageService,
  ) {}

  async refreshProjections(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    await this.repository.refreshCaseFacts(tenantId);
    await this.repository.refreshContractExpiryFacts(tenantId);
    return { refreshed: true };
  }

  analytics(actor: AuthenticatedUser, filters: ReportFilters) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.analytics(tenantId, this.scope(actor), this.limitFilters(filters));
  }

  tenderDetails(actor: AuthenticatedUser, filters: ReportFilters) {
    return this.caseReport(actor, filters);
  }

  running(actor: AuthenticatedUser, filters: ReportFilters) {
    return this.caseReport(actor, filters, "running");
  }

  completed(actor: AuthenticatedUser, filters: ReportFilters) {
    return this.caseReport(actor, filters, "completed");
  }

  vendorAwards(actor: AuthenticatedUser, filters: ReportFilters) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.vendorAwards({
      filters: this.limitFilters(filters),
      scope: this.scope(actor),
      tenantId,
    });
  }

  stageTime(actor: AuthenticatedUser, filters: ReportFilters) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.stageTime(tenantId, this.scope(actor), this.limitFilters(filters));
  }

  rcPoExpiry(actor: AuthenticatedUser, filters: ReportFilters) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.rcPoExpiry({
      filters: this.limitFilters(filters),
      scope: this.scope(actor),
      tenantId,
    });
  }

  async updateRcPoExpiryRow(
    actor: AuthenticatedUser,
    sourceType: "case_award" | "manual_plan",
    sourceId: string,
    input: {
      tenderFloatedOrNotRequired?: boolean | undefined;
      tentativeTenderingDate?: string | null | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "planning.manage");
    const target = await this.repository.rcPoExpiryEditTarget(tenantId, sourceType, sourceId);
    if (!target) throw new NotFoundException("RC/PO expiry row not found.");
    this.assertRcPoEditAllowed(actor, target.entityId);
    const row = await this.repository.updateRcPoExpiryRow({
      ...input,
      actorUserId: actor.id,
      sourceId,
      sourceType,
      tenantId,
    });
    if (!row) throw new NotFoundException("RC/PO expiry row not found.");
    await this.audit.write({
      action: "report.rc_po_expiry.update",
      actorUserId: actor.id,
      details: {
        sourceType,
        tenderFloatedOrNotRequired: input.tenderFloatedOrNotRequired,
        tentativeTenderingDate: input.tentativeTenderingDate,
      },
      summary: "Updated RC/PO expiry row",
      targetId: sourceId,
      targetType: sourceType,
      tenantId,
    });
    return row;
  }

  async filterMetadata(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    const scope = this.scope(actor);
    const cacheKey = this.filterMetadataCacheKey(tenantId, scope);
    const cached =
      await this.cache.getJson<Awaited<ReturnType<ReportingRepository["filterMetadata"]>>>(cacheKey);
    if (cached) return cached;
    return this.cache.setJson(cacheKey, await this.repository.filterMetadata(tenantId, scope), 120);
  }

  listSavedViews(actor: AuthenticatedUser, reportCode?: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.listSavedViews(tenantId, actor.id, reportCode);
  }

  createSavedView(
    actor: AuthenticatedUser,
    input: {
      columns: unknown[];
      filters: Record<string, unknown>;
      isDefault: boolean;
      name: string;
      reportCode: ReportCode;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.createSavedView({
      ...input,
      tenantId,
      userId: actor.id,
    });
  }

  async createExportJob(
    actor: AuthenticatedUser,
    input: {
      filters: Record<string, unknown>;
      format: "csv" | "xlsx";
      reportCode: ReportCode;
      selectedIds?: string[] | undefined;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.export");
    return this.db.transaction(async () => {
      const filters = input.selectedIds?.length
        ? { ...input.filters, selectedIds: input.selectedIds }
        : input.filters;
      const result = await this.repository.createExportJob({
        ...input,
        filters,
        createdBy: actor.id,
        tenantId,
      });
      await this.outbox.write({
        aggregateId: result.id,
        aggregateType: "export_job",
        eventType: "export_job.created",
        payload: { actorUserId: actor.id, format: input.format, reportCode: input.reportCode },
        tenantId,
      });
      await this.audit.write({
        action: "export_job.create",
        actorUserId: actor.id,
        details: { format: input.format, reportCode: input.reportCode },
        summary: "Created export job",
        targetId: result.id,
        targetType: "export_job",
        tenantId,
      });
      return result;
    });
  }

  async getExportJob(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.export");
    const job = await this.repository.getExportJob(tenantId, actor.id, jobId);
    if (!job) throw new NotFoundException("Export job not found.");
    return {
      completedAt: job.completed_at?.toISOString() ?? null,
      createdAt: job.created_at.toISOString(),
      expiresAt: job.expires_at?.toISOString() ?? null,
      fileAssetId: job.file_asset_id,
      format: job.format,
      id: job.id,
      progressMessage: job.progress_message,
      progressPercent: job.progress_percent,
      reportCode: job.report_code,
      status: job.status,
    };
  }

  async listExportJobs(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.export");
    const result = await this.repository.listExportJobs(tenantId, actor.id);
    return result.rows.map((job) => ({
      completedAt: job.completed_at?.toISOString() ?? null,
      createdAt: job.created_at.toISOString(),
      expiresAt: job.expires_at?.toISOString() ?? null,
      fileAssetId: job.file_asset_id,
      format: job.format,
      id: job.id,
      progressMessage: job.progress_message,
      progressPercent: job.progress_percent,
      reportCode: job.report_code,
      selectedCount: job.selected_count,
      status: job.status,
    }));
  }

  async getExportDownload(actor: AuthenticatedUser, jobId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.export");
    const file = await this.repository.getExportFile(tenantId, actor.id, jobId);
    if (!file) {
      throw new NotFoundException("Export file is not available yet.");
    }
    return new StreamableFile(await this.storage.read(file.storage_key), {
      disposition: `attachment; filename="${file.original_filename ?? "export"}"`,
      type: file.content_type ?? "application/octet-stream",
    });
  }

  private caseReport(
    actor: AuthenticatedUser,
    filters: ReportFilters,
    status?: "completed" | "running",
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "report.read");
    return this.repository.caseReport({
      filters: this.limitFilters(filters),
      scope: this.scope(actor),
      tenantId,
      ...(status ? { status } : {}),
    });
  }

  private scope(actor: AuthenticatedUser) {
    if (actor.isPlatformSuperAdmin || actor.accessLevel === "GROUP") {
      return { actorUserId: actor.id, assignedOnly: false, entityIds: [], tenantWide: true };
    }
    if (actor.accessLevel === "ENTITY") {
      return {
        actorUserId: actor.id,
        assignedOnly: false,
        entityIds: actor.entityIds,
        tenantWide: false,
      };
    }
    return { actorUserId: actor.id, assignedOnly: true, entityIds: [], tenantWide: false };
  }

  private filterMetadataCacheKey(tenantId: string, scope: ReportScope): string {
    if (scope.tenantWide) return `report:filter-metadata:v2:${tenantId}:tenant-wide`;
    if (scope.assignedOnly) return `report:filter-metadata:v2:${tenantId}:assigned:${scope.actorUserId}`;
    return `report:filter-metadata:v2:${tenantId}:entities:${[...scope.entityIds].sort().join(",")}`;
  }

  private limitFilters(filters: ReportFilters): ReportFilters {
    return {
      ...filters,
      limit: Math.min(filters.limit ?? 50, 100),
    };
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.isPlatformSuperAdmin && !actor.permissions.includes(permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private assertRcPoEditAllowed(actor: AuthenticatedUser, entityId: string) {
    if (actor.isPlatformSuperAdmin || actor.permissions.includes("case.update.all")) return;
    if (actor.entityIds.includes(entityId)) return;
    throw new ForbiddenException("RC/PO expiry updates are restricted to mapped entities.");
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }
}
