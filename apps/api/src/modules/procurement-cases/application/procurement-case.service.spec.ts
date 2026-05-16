import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuditWriterService } from "../../audit/application/audit-writer.service.js";
import type { CatalogService } from "../../catalog/application/catalog.service.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import type { OutboxWriterService } from "../../outbox/application/outbox-writer.service.js";
import type { ProcurementCaseRepository } from "../infrastructure/procurement-case.repository.js";
import { ProcurementCaseService, type CreateCaseCommand } from "./procurement-case.service.js";
import type { DatabaseService } from "../../../database/database.service.js";

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

function createService() {
  const repository = {
    createCase: vi.fn().mockResolvedValue({ id: "case-1" }),
    getCaseOwnerAssignmentProfile: vi.fn().mockResolvedValue({
      accessLevel: "USER",
      entityIds: ["entity-1"],
      userId: "owner-1",
    }),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const db = {
    transaction: vi.fn(async (handler: () => Promise<unknown>) => handler()),
  };
  const outbox = { write: vi.fn().mockResolvedValue(undefined) };
  const catalog = {
    assertProcurementCaseSelections: vi.fn().mockResolvedValue(undefined),
    getTenderTypeCompletionDays: vi.fn().mockResolvedValue(30),
  };

  const service = new ProcurementCaseService(
    repository as unknown as ProcurementCaseRepository,
    audit as unknown as AuditWriterService,
    db as unknown as DatabaseService,
    outbox as unknown as OutboxWriterService,
    catalog as unknown as CatalogService,
  );

  return { repository, service };
}
