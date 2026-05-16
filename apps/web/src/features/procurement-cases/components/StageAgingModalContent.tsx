import { ExternalLink } from "lucide-react";

import { navigateToAppPath } from "../../../shared/routing/appLocation";
import { Button } from "../../../shared/ui/button/Button";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "../../../shared/ui/table/DataTable";
import { formatCaseStage } from "../../../shared/utils/caseStage";
import {
  dateOnlyToLocalDate,
  formatDateOnly,
  todayDateOnlyString,
} from "../../../shared/utils/dateOnly";
import type { CaseDetail } from "../api/casesApi";

type StageAgingRow = {
  agingDays: number | null;
  endDate: string | null;
  stage: string;
  startDate: string | null;
  status: "Active" | "Completed" | "Pending";
};

export function StageAgingModalContent({ kase }: { kase: CaseDetail }) {
  const rows = buildStageAgingRows(kase);
  const columns: DataTableColumn<StageAgingRow>[] = [
    { key: "stage", header: "Stage", render: (row) => row.stage },
    {
      key: "start",
      header: "Start Date",
      render: (row) => formatDateOnly(row.startDate),
    },
    {
      key: "end",
      header: "End Date / Current",
      render: (row) => (row.endDate ? formatDateOnly(row.endDate) : row.status),
    },
    {
      key: "aging",
      header: "Aging Days",
      render: (row) => formatDays(row.agingDays),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          tone={
            row.status === "Active"
              ? "warning"
              : row.status === "Completed"
                ? "success"
                : "neutral"
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="dashboard-stage-aging-modal">
      <div className="dashboard-stage-aging-toolbar">
        <div>
          <span>Case</span>
          <strong>{kase.prId}</strong>
        </div>
        <Button onClick={() => navigateToAppPath(`/cases/${kase.id}`)}>
          <ExternalLink aria-hidden="true" size={16} />
          Open Case
        </Button>
      </div>
      <div className="dashboard-stage-aging-summary">
        <div>
          <span>Entity</span>
          <strong>{entityDisplayName(kase)}</strong>
        </div>
        <div>
          <span>PR Description</span>
          <strong>{kase.prDescription ?? "-"}</strong>
        </div>
        <div>
          <span>Tender Type</span>
          <strong>{kase.tenderTypeName ?? "-"}</strong>
        </div>
        <div>
          <span>Tender Owner</span>
          <strong>{kase.ownerFullName ?? "-"}</strong>
        </div>
      </div>
      <DataTable
        columns={columns}
        emptyMessage="No stage aging data available."
        getRowKey={(row) => row.stage}
        rows={rows}
      />
    </div>
  );
}

function buildStageAgingRows(kase: CaseDetail): StageAgingRow[] {
  const today = todayDateOnlyString();
  const milestones = kase.milestones;
  const starts = [
    kase.prReceiptDate,
    milestones.nitInitiationDate ?? null,
    milestones.nitApprovalDate ?? null,
    milestones.nitPublishDate ?? null,
    milestones.bidReceiptDate ?? null,
    latestDateOnly(
      milestones.commercialEvaluationDate,
      milestones.technicalEvaluationDate,
    ),
    milestones.nfaSubmissionDate ?? null,
    milestones.nfaApprovalDate ?? null,
    milestones.rcPoAwardDate ?? null,
  ];

  return starts.map((rawStartDate, stageCode) => {
    const startDate = rawStartDate ?? null;
    const nextStartDate = starts.slice(stageCode + 1).find(Boolean) ?? null;
    const status =
      stageCode === kase.stageCode && kase.status === "running"
        ? "Active"
        : stageCode < kase.stageCode || (stageCode === 8 && Boolean(startDate))
          ? "Completed"
          : "Pending";
    const endDate =
      status === "Active" ? today : status === "Completed" ? nextStartDate : null;
    return {
      agingDays:
        startDate && endDate ? diffDateOnlyDays(endDate, startDate) : null,
      endDate,
      stage: formatCaseStage(stageCode),
      startDate,
      status,
    };
  });
}

function entityDisplayName(row: {
  entityCode?: string | null;
  entityId: string;
  entityName?: string | null;
}) {
  return row.entityCode ?? row.entityName ?? row.entityId;
}

function formatDays(value: number | null | undefined) {
  return value == null ? "-" : `${value} days`;
}

function latestDateOnly(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left > right ? left : right;
}

function diffDateOnlyDays(to: string, from: string) {
  const toDate = dateOnlyToLocalDate(to);
  const fromDate = dateOnlyToLocalDate(from);
  if (!toDate || !fromDate) return null;
  return Math.max(
    0,
    Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000),
  );
}
