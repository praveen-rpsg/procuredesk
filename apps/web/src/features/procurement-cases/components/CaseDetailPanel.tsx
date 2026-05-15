import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Trash2, Trophy } from "lucide-react";
import { useState } from "react";

import { listAuditEvents } from "../../operations/api/operationsApi";
import { deleteCase, getCase, type CaseDetail } from "../api/casesApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import {
  canDeleteCase,
  canManageCaseAwards,
  canReadAudit,
  canUpdateCase,
  canViewCaseDelay,
} from "../../../shared/auth/permissions";
import { formatCaseStageTransition } from "../../../shared/utils/caseStage";
import {
  formatDateOnly,
  toDateOnlyInputValue,
} from "../../../shared/utils/dateOnly";
import { ActivityFeed } from "../../../shared/ui/activity-feed/ActivityFeed";
import { Button } from "../../../shared/ui/button/Button";
import { ConfirmationDialog } from "../../../shared/ui/confirmation-dialog/ConfirmationDialog";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { TextArea } from "../../../shared/ui/form/TextArea";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { Timeline } from "../../../shared/ui/timeline/Timeline";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type CaseDetailPanelProps = {
  caseId: string | null;
  onAward?: () => void;
  onDeleted?: () => void;
  onEdit?: () => void;
  onOpenFull?: () => void;
};

const milestoneSteps: Array<{ key: string; label: string; stage: number }> = [
  { key: "nitInitiationDate", label: "NIT Initiation", stage: 1 },
  { key: "nitApprovalDate", label: "NIT Approval", stage: 2 },
  { key: "nitPublishDate", label: "NIT Publish", stage: 3 },
  { key: "bidReceiptDate", label: "Bid Receipt", stage: 4 },
  { key: "technicalEvaluationDate", label: "Technical Evaluation", stage: 5 },
  { key: "commercialEvaluationDate", label: "Commercial Evaluation", stage: 5 },
  { key: "nfaSubmissionDate", label: "NFA Submission", stage: 6 },
  { key: "nfaApprovalDate", label: "NFA Approval", stage: 7 },
  { key: "loiIssuedDate", label: "LOI Issued", stage: 7 },
  { key: "rcPoAwardDate", label: "RC/PO Award", stage: 8 },
];

export function CaseDetailPanel({
  caseId,
  onAward,
  onDeleted,
  onEdit,
  onOpenFull,
}: CaseDetailPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const canDelete = canDeleteCase(user);
  const hasAuditAccess = canReadAudit(user);
  const detail = useQuery({
    enabled: Boolean(caseId),
    queryFn: () => getCase(caseId as string),
    queryKey: ["case", caseId],
  });
  const activity = useQuery({
    enabled: Boolean(caseId) && hasAuditAccess,
    queryFn: () =>
      listAuditEvents({
        limit: 8,
        targetId: caseId as string,
        targetType: "procurement_case",
      }),
    queryKey: ["case-activity", caseId],
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCase(caseId as string, deleteReason.trim() || null),
    onSuccess: async () => {
      notify({ message: "Case deleted.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      await queryClient.invalidateQueries({
        queryKey: ["case-activity", caseId],
      });
      await queryClient.invalidateQueries({ queryKey: ["deleted-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-recent-cases"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-assigned-cases"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-delayed-cases"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-priority-cases"],
      });
      setIsDeleteOpen(false);
      setDeleteReason("");
      onDeleted?.();
    },
  });

  if (!caseId) {
    return (
      <ErrorState
        message="Select a case from the list."
        title="No case selected"
      />
    );
  }

  if (detail.isLoading) {
    return (
      <section className="state-panel">
        <Skeleton height={20} width="40%" />
        <Skeleton height={16} />
        <Skeleton height={16} />
      </section>
    );
  }

  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error?.message ?? "Case not found."} />;
  }

  const kase = detail.data;
  const canEdit = canUpdateCase(user, kase);
  const canAward = canManageCaseAwards(user, kase);
  const canViewDelay = canViewCaseDelay(user, kase);
  const trackStatus = caseTrackStatus(kase);
  return (
    <section className="case-preview-panel">
      <div className="case-preview-hero">
        <div>
          <p className="eyebrow">Case Detail</p>
          <h2>{kase.tenderName || kase.prDescription || kase.prId}</h2>
        </div>
        <div className="case-preview-actions">
          <div className="row-actions">
            <StatusBadge
              tone={kase.status === "completed" ? "success" : "warning"}
            >
              {kase.status}
            </StatusBadge>
            {trackStatus ? (
              <StatusBadge tone={trackStatus.tone}>{trackStatus.label}</StatusBadge>
            ) : null}
            {kase.priorityCase ? (
              <StatusBadge tone="warning">Priority</StatusBadge>
            ) : null}
          </div>
          {onEdit && canEdit ? (
            <Button onClick={onEdit} variant="secondary">
              <Pencil size={16} />
              Edit
            </Button>
          ) : null}
          {onAward ? (
            <Button
              disabled={!canAward}
              onClick={onAward}
              title={
                canAward
                  ? "Manage awards"
                  : "Awards are enabled after completion"
              }
              variant={canAward ? "primary" : "secondary"}
            >
              <Trophy size={16} />
              Award
            </Button>
          ) : null}
          {onOpenFull ? (
            <Button onClick={onOpenFull} variant="secondary">
              <ExternalLink size={16} />
              Open
            </Button>
          ) : null}
          {canDelete ? (
            <Button onClick={() => setIsDeleteOpen(true)} variant="danger">
              <Trash2 size={18} />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="detail-grid case-preview-metrics">
        <Metric label="Case ID" value={kase.prId} />
        <Metric
          label="Stage"
          value={formatCaseStageTransition(
            kase.stageCode,
            kase.desiredStageCode,
          )}
        />
        <Metric label="PR Receipt" value={formatDate(kase.prReceiptDate)} />
        <Metric
          label="Target"
          value={formatDate(kase.tentativeCompletionDate)}
        />
        <Metric
          label="PR Value / Approved Budget [All Inclusive]"
          value={formatMoney(kase.financials.prValue)}
        />
        <Metric
          label="NFA Approved Amount (Rs.) [All Inclusive]"
          value={formatMoney(kase.financials.approvedAmount)}
        />
        <Metric
          label="Awarded [All Inclusive]"
          value={formatMoney(kase.financials.totalAwardedAmount)}
        />
        <Metric
          label={`Savings wrt PR Value/Approved Budget (Rs) ${formatSavingsPctBracket(
            kase.financials.savingsWrtPr,
            kase.financials.prValue,
          )}`}
          value={formatMoney(kase.financials.savingsWrtPr)}
        />
      </dl>

      <div className="case-preview-sections">
        <section className="case-preview-section">
          <p className="eyebrow">PR Details</p>
          <dl className="compact-detail-list">
            <CompactMetric
              label="Description"
              value={kase.prDescription ?? "-"}
            />
            <CompactMetric label="Scheme" value={kase.prSchemeNo ?? "-"} />
            <CompactMetric label="Tender No" value={kase.tenderNo ?? "-"} />
            <CompactMetric
              label="CPC"
              value={
                kase.cpcInvolved == null ? "-" : kase.cpcInvolved ? "Yes" : "No"
              }
            />
            <CompactMetric label="PR Remarks" value={kase.prRemarks ?? "-"} />
            <CompactMetric
              label="Tender Owner's Remarks"
              value={kase.tmRemarks ?? "-"}
            />
          </dl>
        </section>

        {canViewDelay ? (
          <section className="case-preview-section">
            <p className="eyebrow">Delay</p>
            <dl className="compact-detail-list">
              <CompactMetric
                label="Track Status"
                value={trackStatus?.label ?? "-"}
              />
              <CompactMetric
                label="External Days"
                value={String(kase.delay.delayExternalDays ?? 0)}
              />
              <CompactMetric
                label="Reason"
                value={kase.delay.delayReason ?? "-"}
              />
            </dl>
          </section>
        ) : null}
      </div>

      <section className="case-preview-section case-preview-timeline-section">
        <p className="eyebrow">Milestone Timeline</p>
        <Timeline
          steps={milestoneSteps.map((step) => ({
            date: formatDate(milestoneDate(kase, step.key)),
            isComplete: Boolean(milestoneDate(kase, step.key)),
            label: step.label,
            stage: step.stage,
          }))}
        />
      </section>

      <section className="case-preview-section">
        <p className="eyebrow">Activity</p>
        {!hasAuditAccess ? (
          <p className="hero-copy">
            Activity is available to users with audit access.
          </p>
        ) : activity.isLoading ? (
          <Skeleton height={18} />
        ) : activity.error ? (
          <p className="inline-error">{activity.error.message}</p>
        ) : (
          <ActivityFeed
            emptyMessage="No case activity yet."
            items={(activity.data ?? []).map((event) => ({
              id: event.id,
              meta: new Date(event.occurredAt).toLocaleString(),
              summary: event.summary,
              tone: activityTone(event.action),
            }))}
          />
        )}
      </section>

      <ConfirmationDialog
        confirmLabel="Delete Case"
        description={
          <span>
            This soft-deletes the selected procurement case. Admin users with
            restore permission can recover it later.
          </span>
        }
        isOpen={isDeleteOpen}
        isPending={deleteMutation.isPending}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Case"
        tone="danger"
      >
        <TextArea
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder="Reason for deletion"
          value={deleteReason}
        />
        {deleteMutation.error ? (
          <p className="inline-error">{deleteMutation.error.message}</p>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  return formatDateOnly(value, "-");
}

function formatSavingsPctBracket(
  savings: number | null | undefined,
  base: number | null | undefined,
) {
  if (savings == null || !base) return "";
  const pct = (savings / base) * 100;
  return `[${pct.toFixed(1)}%]`;
}

function milestoneDate(kase: CaseDetail, key: string) {
  const value = kase.milestones[key];
  return typeof value === "string" ? toDateOnlyInputValue(value) || null : null;
}

function activityTone(
  action: string,
): "danger" | "neutral" | "success" | "warning" {
  if (action.includes("delete")) return "danger";
  if (action.includes("restore") || action.includes("create")) return "success";
  if (action.includes("delay")) return "warning";
  return "neutral";
}

function caseTrackStatus(
  kase: CaseDetail,
): { label: "Delayed" | "Off Track" | "On Track"; tone: "danger" | "success" | "warning" } | null {
  if (kase.status !== "running") return null;
  if (kase.isDelayed) return { label: "Delayed", tone: "danger" };
  if (
    kase.desiredStageCode != null &&
    kase.stageCode < kase.desiredStageCode
  ) {
    return { label: "Off Track", tone: "warning" };
  }
  return { label: "On Track", tone: "success" };
}
