import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { CatalogService } from "../../catalog/application/catalog.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import type { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import type {
  CaseCleanupCandidate,
  ProcurementCaseRepository,
} from "../infrastructure/procurement-case.repository.js";
import { ProcurementCaseService, type CreateCaseCommand } from "./procurement-case.service.js";
import type { DatabaseService } from "../../../database/database.service.js";
import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.schema.js";

const baseActor: AuthenticatedUser = {
  accessLevel: "USER",
  email: "owner@example.com",
  entityIds: ["entity-1"],
  fullName: "Tender Owner",
  id: "owner-1",
  isPlatformSuperAdmin: false,
  permissions: ["case.create"],
  tenantId: "tenant-1",
  username: "owner",
};

const cleanupActor: AuthenticatedUser = {
  ...baseActor,
  accessLevel: "GROUP",
  id: "admin-1",
  isPlatformSuperAdmin: false,
  permissions: ["admin.console.access", "case.delete"],
  username: "admin",
};

const baseCommand: CreateCaseCommand = {
  budgetTypeId: "budget-1",
  cpcInvolved: false,
  departmentId: "department-1",
  entityId: "entity-1",
  financials: { prValue: 1000 },
  natureOfWorkId: "nature-1",
  ownerUserId: "owner-1",
  prDescription: "New tender",
  prId: "PR-1",
  prReceiptDate: "2026-05-01",
  priorityCase: false,
  tenderTypeId: "type-1",
};

describe("ProcurementCaseService tentative completion date", () => {
  it("rejects future PR receipt dates", async () => {
    const { repository, service } = createService();

    await expect(
      service.createCase(baseActor, {
        ...baseCommand,
        prReceiptDate: "2999-01-01",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createCase).not.toHaveBeenCalled();
  });

  it("rejects tender-owner create requests that tamper with a derived target date", async () => {
    const { repository, service } = createService();

    await expect(
      service.createCase(baseActor, {
        ...baseCommand,
        tentativeCompletionDate: "2026-06-15",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.createCase).not.toHaveBeenCalled();
  });

  it("accepts the derived target date for tender-owner create requests", async () => {
    const { repository, service } = createService();

    await service.createCase(baseActor, {
      ...baseCommand,
      tentativeCompletionDate: "2026-05-31",
    });

    expect(repository.createCase).toHaveBeenCalledWith(
      expect.objectContaining({
        tentativeCompletionDate: "2026-05-31",
      }),
    );
  });

  it("allows entity-level case managers to override the derived target date", async () => {
    const { repository, service } = createService();
    const entityActor: AuthenticatedUser = {
      ...baseActor,
      accessLevel: "ENTITY",
      id: "entity-manager-1",
      permissions: ["case.create", "case.update.entity"],
      username: "entity.manager",
    };

    await service.createCase(entityActor, {
      ...baseCommand,
      ownerUserId: "owner-1",
      tentativeCompletionDate: "2026-06-15",
    });

    expect(repository.createCase).toHaveBeenCalledWith(
      expect.objectContaining({
        tentativeCompletionDate: "2026-06-15",
      }),
    );
  });
});

describe("ProcurementCaseService admin cleanup", () => {
  it("previews only import-created rows as safe", async () => {
    const { repository, service } = createService();
    repository.listCleanupCandidates.mockResolvedValue([
      cleanupCandidate({ id: "case-safe", importAction: "create", prId: "PR-1" }),
      cleanupCandidate({ id: "case-update", importAction: "update", prId: "PR-2" }),
      cleanupCandidate({ awardCount: 1, id: "case-award", importAction: "create", prId: "PR-3" }),
    ]);

    const result = await service.previewCaseCleanup(cleanupActor, {
      importJobId: "00000000-0000-0000-0000-000000000001",
      mode: "import_job",
    });

    expect(result.safeCount).toBe(1);
    expect(result.blockedCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.rows.find((row) => row.id === "case-safe")?.risk).toBe("safe");
    expect(result.rows.find((row) => row.id === "case-update")?.risk).toBe("blocked");
    expect(result.rows.find((row) => row.id === "case-award")?.risk).toBe("warning");
  });

  it("executes cleanup only from the signed safe preview", async () => {
    const { audit, outbox, repository, service } = createService();
    repository.listCleanupCandidates.mockResolvedValue([
      cleanupCandidate({ id: "case-safe", importAction: "create", prId: "PR-1" }),
    ]);
    repository.softDeleteCasesByPreview.mockResolvedValue([{ id: "case-safe", prId: "PR-1" }]);
    const preview = await service.previewCaseCleanup(cleanupActor, {
      importJobId: "00000000-0000-0000-0000-000000000001",
      mode: "import_job",
    });

    const result = await service.executeCaseCleanup(cleanupActor, {
      confirmationText: "DELETE 1 CASES",
      previewToken: preview.previewToken,
      reason: "Wrong committed bulk upload cleanup",
    });

    expect(result.deletedCount).toBe(1);
    expect(repository.softDeleteCasesByPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        cases: [{ id: "case-safe", updatedAt: "2026-06-01T10:00:00.000Z" }],
        deletedBy: "admin-1",
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "case.bulk_cleanup" }));
    expect(outbox.writeMany).toHaveBeenCalledWith([
      expect.objectContaining({
        aggregateId: "case-safe",
        eventType: "procurement_case.deleted",
      }),
    ]);
  });

  it("executes cleanup for all matched preview rows when override is confirmed", async () => {
    const { audit, repository, service } = createService();
    repository.listCleanupCandidates.mockResolvedValue([
      cleanupCandidate({ id: "case-safe", importAction: "create", prId: "PR-1" }),
      cleanupCandidate({ id: "case-update", importAction: "update", prId: "PR-2" }),
      cleanupCandidate({ awardCount: 1, id: "case-award", importAction: "create", prId: "PR-3" }),
    ]);
    repository.softDeleteCasesByPreview.mockResolvedValue([
      { id: "case-safe", prId: "PR-1" },
      { id: "case-update", prId: "PR-2" },
      { id: "case-award", prId: "PR-3" },
    ]);
    const preview = await service.previewCaseCleanup(cleanupActor, {
      importJobId: "00000000-0000-0000-0000-000000000001",
      mode: "import_job",
    });

    const result = await service.executeCaseCleanup(cleanupActor, {
      confirmationText: "DELETE ALL 3 CASES",
      includeAllMatchedRows: true,
      previewToken: preview.previewToken,
      reason: "Wrong committed bulk upload cleanup",
    });

    expect(result).toMatchObject({
      cleanupScope: "all_matched",
      deletedCount: 3,
      requestedCount: 3,
      requestedSafeCount: 1,
      requestedTotalCount: 3,
      skippedCount: 0,
    });
    expect(repository.softDeleteCasesByPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        cases: [
          { id: "case-safe", updatedAt: "2026-06-01T10:00:00.000Z" },
          { id: "case-update", updatedAt: "2026-06-01T10:00:00.000Z" },
          { id: "case-award", updatedAt: "2026-06-01T10:00:00.000Z" },
        ],
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          cleanupScope: "all_matched",
          riskSummary: { blocked: 1, safe: 1, warning: 1 },
          unsafeRequestedCases: [
            expect.objectContaining({ id: "case-update", risk: "blocked" }),
            expect.objectContaining({ id: "case-award", risk: "warning" }),
          ],
        }),
      }),
    );
  });

  it("requires all-matched confirmation text for override cleanup", async () => {
    const { repository, service } = createService();
    repository.listCleanupCandidates.mockResolvedValue([
      cleanupCandidate({ id: "case-safe", importAction: "create", prId: "PR-1" }),
      cleanupCandidate({ id: "case-update", importAction: "update", prId: "PR-2" }),
    ]);
    const preview = await service.previewCaseCleanup(cleanupActor, {
      importJobId: "00000000-0000-0000-0000-000000000001",
      mode: "import_job",
    });

    await expect(
      service.executeCaseCleanup(cleanupActor, {
        confirmationText: "DELETE 1 CASES",
        includeAllMatchedRows: true,
        previewToken: preview.previewToken,
        reason: "Wrong committed bulk upload cleanup",
      }),
    ).rejects.toThrow("Type DELETE ALL 2 CASES to confirm cleanup.");

    expect(repository.softDeleteCasesByPreview).not.toHaveBeenCalled();
  });

  it("fails cleanup when no safe preview cases are actually deleted", async () => {
    const { audit, outbox, repository, service } = createService();
    repository.listCleanupCandidates.mockResolvedValue([
      cleanupCandidate({ id: "case-safe", importAction: "create", prId: "PR-1" }),
    ]);
    repository.softDeleteCasesByPreview.mockResolvedValue([]);
    const preview = await service.previewCaseCleanup(cleanupActor, {
      importJobId: "00000000-0000-0000-0000-000000000001",
      mode: "import_job",
    });

    await expect(
      service.executeCaseCleanup(cleanupActor, {
        confirmationText: "DELETE 1 CASES",
        previewToken: preview.previewToken,
        reason: "Wrong committed bulk upload cleanup",
      }),
    ).rejects.toThrow("No cases were deleted");

    expect(audit.write).not.toHaveBeenCalled();
    expect(outbox.writeMany).not.toHaveBeenCalled();
  });

  it("normalizes case id cleanup criteria before preview", async () => {
    const { repository, service } = createService();
    repository.listCleanupCandidates.mockResolvedValue([
      cleanupCandidate({ id: "case-safe", importAction: null, prId: "PR-1" }),
    ]);

    const result = await service.previewCaseCleanup(cleanupActor, {
      caseIds: ["case-safe", "case-safe"],
      mode: "case_ids",
    });

    expect(result.safeCount).toBe(1);
    expect(repository.listCleanupCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        caseIds: ["case-safe"],
        mode: "case_ids",
      }),
    );
  });

  it("lists cleanup import jobs through cleanup permissions", async () => {
    const { repository, service } = createService();
    repository.listCleanupImportJobs.mockResolvedValue([
      {
        acceptedRows: 10,
        committedAt: "2026-06-01T10:00:00.000Z",
        createdAt: "2026-06-01T09:00:00.000Z",
        id: "job-1",
        rejectedRows: 0,
        totalRows: 10,
      },
    ]);

    const result = await service.listCaseCleanupImportJobs(cleanupActor);

    expect(result).toHaveLength(1);
    expect(repository.listCleanupImportJobs).toHaveBeenCalledWith("tenant-1");
  });
});

function createService() {
  const repository = {
    createCase: vi.fn().mockResolvedValue({ id: "case-1" }),
    getCaseOwnerAssignmentProfile: vi.fn().mockResolvedValue({
      accessLevel: "USER",
      entityIds: ["entity-1"],
      userId: "owner-1",
    }),
    listCleanupImportJobs: vi.fn().mockResolvedValue([]),
    listCleanupCandidates: vi.fn().mockResolvedValue([]),
    softDeleteCasesByPreview: vi.fn().mockResolvedValue([]),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const db = {
    transaction: vi.fn(async (handler: () => Promise<unknown>) => handler()),
  };
  const outbox = {
    write: vi.fn().mockResolvedValue(undefined),
    writeMany: vi.fn().mockResolvedValue(undefined),
  };
  const catalog = {
    assertProcurementCaseSelections: vi.fn().mockResolvedValue(undefined),
    getTenderTypeCompletionDays: vi.fn().mockResolvedValue(30),
  };
  const config = {
    getOrThrow: vi.fn().mockReturnValue("x".repeat(32)),
  };

  const service = new ProcurementCaseService(
    repository as unknown as ProcurementCaseRepository,
    audit as unknown as AuditWriterService,
    db as unknown as DatabaseService,
    outbox as unknown as OutboxWriterService,
    catalog as unknown as CatalogService,
    config as unknown as ConfigService<EnvConfig, true>,
  );

  return { audit, outbox, repository, service };
}

function cleanupCandidate(
  overrides: Partial<CaseCleanupCandidate> & {
    id: string;
    prId: string;
  },
): CaseCleanupCandidate {
  const base: CaseCleanupCandidate = {
    awardCount: 0,
    createdAt: "2026-06-01T09:00:00.000Z",
    delayCount: 0,
    entityCode: "CESC",
    entityName: "CESC",
    id: overrides.id,
    importAction: "create",
    importCommittedAt: "2026-06-01T10:00:01.000Z",
    importJobId: "00000000-0000-0000-0000-000000000001",
    importJobStatus: "committed",
    importType: "tender_cases",
    ownerFullName: "Owner",
    ownerUserId: "owner-1",
    prId: overrides.prId,
    prSchemeNo: overrides.prId,
    rowNumber: 1,
    status: "running",
    tenderName: "Tender",
    tenderNo: null,
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
  return {
    ...base,
    ...overrides,
    id: overrides.id,
    prId: overrides.prId,
  };
}
