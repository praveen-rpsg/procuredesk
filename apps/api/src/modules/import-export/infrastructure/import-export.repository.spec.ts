import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../../database/database.service.js";
import { ImportExportRepository } from "./import-export.repository.js";

type CommitTenderCaseRows = {
  commitTenderCaseRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void>;
  validateTenderCaseAcceptedRowsForCommit(
    input: { importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<string[]>;
};

type CommitRcPoRows = {
  commitOldContractRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void>;
  commitRcPoPlanRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void>;
};

describe("ImportExportRepository tender case commit", () => {
  it("derives normative stage before upserting bulk-imported tender cases", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    };
    const repository = new ImportExportRepository(
      db as unknown as DatabaseService,
    ) as unknown as CommitTenderCaseRows;

    await repository.commitTenderCaseRows(
      {
        committedBy: "00000000-0000-0000-0000-000000000001",
        importJobId: "00000000-0000-0000-0000-000000000002",
        tenantId: "00000000-0000-0000-0000-000000000003",
      },
      {} as PoolClient,
    );

    const caseUpsertSql = normalizeSql(String(db.query.mock.calls[0]![0]));

    expect(caseUpsertSql).toContain("derived as");
    expect(caseUpsertSql).toContain("end as desired_stage_code");
    expect(caseUpsertSql).toContain("when r.rc_po_award_date is not null then null");
    expect(caseUpsertSql).toContain("r.desired_stage_code");
    expect(caseUpsertSql).toContain("r.stage_code < r.desired_stage_code");
    expect(caseUpsertSql).not.toContain("r.stage_code, null, false");
  });

  it("guards accepted tender rows against stale invalid normalized payloads", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ message: "Row 21: LOI Awarded? must be Yes or No." }],
      }),
    };
    const repository = new ImportExportRepository(
      db as unknown as DatabaseService,
    ) as unknown as CommitTenderCaseRows;

    const errors = await repository.validateTenderCaseAcceptedRowsForCommit(
      {
        importJobId: "00000000-0000-0000-0000-000000000002",
        tenantId: "00000000-0000-0000-0000-000000000003",
      },
      {} as PoolClient,
    );

    expect(errors).toEqual(["Row 21: LOI Awarded? must be Yes or No."]);
    const guardSql = normalizeSql(String(db.query.mock.calls[0]![0]));
    expect(guardSql).toContain("'LOI Awarded?', 'loiIssued'");
    expect(guardSql).toContain("jsonb_typeof(payload->key) <> 'boolean'");
    expect(guardSql).toContain("^\\d{4}-\\d{2}-\\d{2}$");
  });
});

describe("ImportExportRepository RC/PO expiry imports", () => {
  it("defaults tentative tendering date from validity date minus 120 days", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    };
    const repository = new ImportExportRepository(
      db as unknown as DatabaseService,
    ) as unknown as CommitRcPoRows;
    const input = {
      committedBy: "00000000-0000-0000-0000-000000000001",
      importJobId: "00000000-0000-0000-0000-000000000002",
      tenantId: "00000000-0000-0000-0000-000000000003",
    };

    await repository.commitRcPoPlanRows(input, {} as PoolClient);
    await repository.commitOldContractRows(input, {} as PoolClient);

    for (const call of db.query.mock.calls) {
      const sql = normalizeSql(String(call[0]));

      expect(sql).toContain("rcPoValidityDate', '')::date - 120");
      expect(sql).not.toContain("rcPoAwardDate', '')::date + 120");
    }
  });
});

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
