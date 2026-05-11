import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  CalendarCheck2,
  CalendarClock,
  Clock,
  DollarSign,
  FileText,
  Hash,
  Layers,
  MessageSquare,
  PiggyBank,
  SquarePen,
  Timer,
  Trophy,
  TrendingDown,
  TrendingUp,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listAuditEvents } from "../../operations/api/operationsApi";
import { AwardsPanel } from "../../awards/components/AwardsPanel";
import { UpdateCasePanel } from "../components/UpdateCasePanel";
import { deleteCase, getCase, type CaseDetail } from "../api/casesApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import {
  canAssignCaseOwner,
  canDeleteCase,
  canManageCaseDelay,
  canReadAudit,
  canUpdateCase,
} from "../../../shared/auth/permissions";
import {
  dateOnlyToLocalDate,
  formatDateOnly,
  parseDateOnlyParts,
  todayDateOnlyString,
  toDateOnlyInputValue,
} from "../../../shared/utils/dateOnly";
import { ActivityFeed } from "../../../shared/ui/activity-feed/ActivityFeed";
import { Button } from "../../../shared/ui/button/Button";
import { ConfirmationDialog } from "../../../shared/ui/confirmation-dialog/ConfirmationDialog";
import { ErrorState } from "../../../shared/ui/error-state/ErrorState";
import { TextArea } from "../../../shared/ui/form/TextArea";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { Timeline } from "../../../shared/ui/timeline/Timeline";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type CaseDetailPageProps = {
  caseId: string;
  onBack: () => void;
};

type CaseDetailTabKey = "activity" | "awards" | "overview" | "timeline" | "update";

const caseDetailTabs = [
  { description: "Key case information, PR details, and financial summary.", icon: FileText, key: "overview", label: "Overview" },
  { description: "Update case details, milestone dates, and award readiness.", icon: SquarePen, key: "update", label: "Update" },
  { description: "Track stages, target dates, and delay status.", icon: CalendarClock, key: "timeline", label: "Timeline" },
  { description: "Manage vendor awards, RC/PO values, and savings.", icon: Trophy, key: "awards", label: "Awards" },
  { description: "Review case audit events and operational history.", icon: Activity, key: "activity", label: "Activity" },
] satisfies Array<{
  description: string;
  icon: typeof FileText;
  key: CaseDetailTabKey;
  label: string;
}>;

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

export function CaseDetailPage({ caseId, onBack }: CaseDetailPageProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notify } = useToast();
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CaseDetailTabKey>("overview");

  const canDelete = canDeleteCase(user);
  const hasAuditAccess = canReadAudit(user);

  const detail = useQuery({
    enabled: Boolean(caseId),
    queryFn: () => getCase(caseId),
    queryKey: ["case", caseId],
  });

  const activity = useQuery({
    enabled: Boolean(caseId) && hasAuditAccess,
    queryFn: () =>
      listAuditEvents({ limit: 10, targetId: caseId, targetType: "procurement_case" }),
    queryKey: ["case-activity", caseId],
  });
  const canOpenUpdate = Boolean(
    detail.data &&
      (canUpdateCase(user, detail.data) ||
        canManageCaseDelay(user, detail.data) ||
        canAssignCaseOwner(user, detail.data)),
  );
  const visibleTabs = useMemo(
    () =>
      caseDetailTabs.filter((tab) => {
        if (tab.key === "activity") return hasAuditAccess;
        if (tab.key === "update") return canOpenUpdate;
        return true;
      }),
    [canOpenUpdate, hasAuditAccess],
  );

  useEffect(() => {
    if (!detail.data) return;
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, detail.data, visibleTabs]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteCase(caseId, deleteReason.trim() || null),
    onSuccess: async () => {
      notify({ message: "Case deleted.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      await queryClient.invalidateQueries({ queryKey: ["deleted-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-recent-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-assigned-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-delayed-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-priority-cases"] });
      setIsDeleteOpen(false);
      setDeleteReason("");
      onBack();
    },
  });

  if (detail.isLoading) {
    return (
      <div className="case-page">
        <div className="case-page-topbar">
          <button className="case-page-back-btn" onClick={onBack} type="button">
            <ArrowLeft size={15} />
            Cases
          </button>
          <div className="case-page-topbar-title">
            <Skeleton height={13} width={80} />
            <Skeleton height={20} width={260} />
          </div>
        </div>
        <div className="case-kpi-strip">
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="case-kpi-card" key={i}>
              <Skeleton height={11} width="60%" />
              <div style={{ marginTop: 6 }}><Skeleton height={22} width="80%" /></div>
            </div>
          ))}
        </div>
        <div className="case-page-body">
          <div className="case-page-main">
            {[1, 2, 3].map((i) => (
              <div className="case-section-card" key={i}>
                <Skeleton height={14} width="30%" />
                <div style={{ marginTop: "var(--space-4)", display: "grid", gap: "var(--space-3)" }}>
                  <Skeleton height={13} />
                  <Skeleton height={13} width="80%" />
                  <Skeleton height={13} width="65%" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <div className="case-page">
        <div className="case-page-topbar">
          <button className="case-page-back-btn" onClick={onBack} type="button">
            <ArrowLeft size={15} />
            Cases
          </button>
        </div>
        <div style={{ padding: "var(--space-8)" }}>
          <ErrorState message={detail.error?.message ?? "Case not found."} />
        </div>
      </div>
    );
  }

  const kase = detail.data;
  const caseTitle = kase.tenderName || kase.prDescription || `Case #${kase.prId}`;
  const overdue = isOverdue(kase);
  const age = runningAgeDays(kase.prReceiptDate);
  const elapsed = timeElapsedPct(kase.prReceiptDate, kase.tentativeCompletionDate);
  const fy = completionFY(kase.tentativeCompletionDate);

  return (
    <div className="case-page">
      {/* ── Sticky top bar ─────────────────────────────────────── */}
      <div className="case-page-topbar">
        <button className="case-page-back-btn" onClick={onBack} type="button">
          <ArrowLeft size={15} />
          Cases
        </button>

        <div className="case-page-topbar-divider" />

        <div className="case-page-topbar-title">
          <span className="case-page-topbar-eyebrow">
            {kase.entityId} · PR #{kase.prId}
          </span>
          <h1 className="case-page-topbar-name">{caseTitle}</h1>
        </div>

        <div className="case-page-topbar-badges">
          <StatusBadge tone={kase.status === "completed" ? "success" : "warning"}>
            {kase.status}
          </StatusBadge>
          {overdue && (
            <StatusBadge tone="danger">
              <TriangleAlert size={11} />
              Overdue
            </StatusBadge>
          )}
          {kase.isDelayed && !overdue && <StatusBadge tone="danger">Delayed</StatusBadge>}
          {kase.priorityCase && <StatusBadge tone="warning">Priority</StatusBadge>}
          {kase.cpcInvolved && <StatusBadge>CPC</StatusBadge>}
        </div>

        {kase.desiredStageCode != null && (
          <div className="case-page-topbar-stage">
            <span className="case-topbar-stage-label">Target Stage</span>
            <span className="case-topbar-stage-value">{kase.desiredStageCode}</span>
          </div>
        )}

        <div className="case-page-topbar-spacer" />

        {canDelete && (
          <Button className="button-danger" onClick={() => setIsDeleteOpen(true)}>
            <Trash2 size={15} />
            Delete
          </Button>
        )}
      </div>

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="case-kpi-strip">
        {/* Time / Progress group */}
        <div className="case-kpi-group">
          <span className="case-kpi-group-label">Progress</span>
          <div className="case-kpi-group-cards">
            <KpiCard
              icon={Clock}
              label="Running Age"
              unit="days"
              value={age}
              tone="neutral"
            />
            <KpiCard
              icon={Timer}
              label="Time Elapsed"
              value={elapsed}
              tone={elapsedTone(elapsed)}
            />
            <KpiCard
              icon={kase.status === "completed" ? CalendarCheck2 : CalendarClock}
              label={kase.status === "completed" ? "Completed" : "Target Date"}
              value={formatDate(kase.tentativeCompletionDate)}
              tone={overdue ? "danger" : "neutral"}
            />
          </div>
        </div>

        <div className="case-kpi-divider" />

        {/* Stage group */}
        <div className="case-kpi-group">
          <span className="case-kpi-group-label">Stage</span>
          <div className="case-kpi-group-cards">
            <KpiCard
              icon={Layers}
              label="Current → Target"
              value={
                kase.desiredStageCode != null
                  ? `${kase.stageCode} → ${kase.desiredStageCode}`
                  : String(kase.stageCode)
              }
              tone="brand"
            />
            <KpiCard
              icon={Hash}
              label="Completion FY"
              value={fy}
              tone="neutral"
            />
          </div>
        </div>

        <div className="case-kpi-divider" />

        {/* Financials group */}
        <div className="case-kpi-group">
          <span className="case-kpi-group-label">Financials</span>
          <div className="case-kpi-group-cards">
            <KpiCard
              icon={DollarSign}
              label="PR Value"
              value={formatMoney(kase.financials.prValue)}
              tone="neutral"
            />
            <KpiCard
              icon={TrendingUp}
              label="Savings vs PR"
              value={formatMoney(kase.financials.savingsWrtPr)}
              tone={savingsTone(kase.financials.savingsWrtPr)}
            />
            <KpiCard
              icon={PiggyBank}
              label="Savings vs Estimate"
              value={formatMoney(kase.financials.savingsWrtEstimate)}
              tone={savingsTone(kase.financials.savingsWrtEstimate)}
            />
          </div>
        </div>
      </div>

      <div className="case-page-subnav-shell">
        <SecondaryNav
          activeKey={activeTab}
          ariaLabel="Case detail sections"
          items={visibleTabs}
          onChange={setActiveTab}
        />
      </div>

      <div className="case-page-tab-body">
        {activeTab === "overview" ? (
          <div className="case-page-main case-page-main-contained">
            <SectionCard title="PR Details">
              <div className="case-info-list">
                <InfoRow label="PR ID" value={String(kase.prId)} />
                <InfoRow label="Entity" value={kase.entityId} />
                {kase.departmentName && <InfoRow label="Department" value={kase.departmentName} />}
                {kase.ownerFullName && <InfoRow label="Case Owner" value={kase.ownerFullName} />}
                <InfoRow label="PR Receipt Date" value={formatDate(kase.prReceiptDate)} />
                <InfoRow label="Tentative Completion" value={formatDate(kase.tentativeCompletionDate)} />
                <InfoRow label="PR Scheme No." value={kase.prSchemeNo ?? "—"} />
                {kase.prReceivingMediumLabel && <InfoRow label="PR Receiving Medium" value={kase.prReceivingMediumLabel} />}
                {kase.budgetTypeLabel && <InfoRow label="Budget Type" value={kase.budgetTypeLabel} />}
                {kase.natureOfWorkLabel && <InfoRow label="Nature of Work" value={kase.natureOfWorkLabel} />}
                <InfoRow label="Tender Name" value={kase.tenderName ?? "—"} />
                <InfoRow label="Tender No." value={kase.tenderNo ?? "—"} />
                {kase.tenderTypeName && <InfoRow label="Tender Type" value={kase.tenderTypeName} />}
                <InfoRow label="CPC Involved" value={kase.cpcInvolved == null ? "—" : kase.cpcInvolved ? "Yes" : "No"} />
                <InfoRow label="Priority Case" value={kase.priorityCase ? "Yes" : "No"} />
                {kase.prDescription && <InfoRow label="Description" value={kase.prDescription} />}
              </div>
            </SectionCard>

            <SectionCard title="Financial Summary">
              <div className="case-financials-grid">
                <FinancialCell label="PR Value" value={formatMoney(kase.financials.prValue)} sub="Requested budget" />
                <FinancialCell label="Estimate / Benchmark" value={formatMoney(kase.financials.estimateBenchmark)} sub="Internal estimate" />
                <FinancialCell label="Approved Amount" value={formatMoney(kase.financials.approvedAmount)} sub="NFA approved" />
                <FinancialCell label="Total Awarded" value={formatMoney(kase.financials.totalAwardedAmount)} sub="RC/PO value" />
                <FinancialCell
                  label="Savings vs PR"
                  value={formatMoney(kase.financials.savingsWrtPr)}
                  sub={formatSavingsPct(kase.financials.savingsWrtPr, kase.financials.prValue)}
                  tone={savingsTone(kase.financials.savingsWrtPr)}
                />
                <FinancialCell
                  label="Savings vs Estimate"
                  value={formatMoney(kase.financials.savingsWrtEstimate)}
                  sub={formatSavingsPct(kase.financials.savingsWrtEstimate, kase.financials.estimateBenchmark)}
                  tone={savingsTone(kase.financials.savingsWrtEstimate)}
                />
              </div>
            </SectionCard>

            {(kase.prRemarks || kase.tmRemarks) && (
              <SectionCard icon={MessageSquare} title="Remarks">
                <div className="case-info-list">
                  {kase.prRemarks && <InfoRow label="PR Remarks" value={kase.prRemarks} />}
                  {kase.tmRemarks && (
                    <InfoRow
                      label="Tender Owner's Remarks"
                      value={kase.tmRemarks}
                    />
                  )}
                </div>
              </SectionCard>
            )}
          </div>
        ) : null}

        {activeTab === "update" ? (
          <div className="case-page-update-panel">
            <UpdateCasePanel caseId={caseId} />
          </div>
        ) : null}

        {activeTab === "timeline" ? (
          <div className="case-page-main case-page-main-contained">
            <SectionCard
              title="Milestone Timeline"
              badge={
                <span className="case-stage-badge">
                  Stage {kase.stageCode}
                  {kase.desiredStageCode != null ? ` → ${kase.desiredStageCode}` : ""}
                </span>
              }
            >
              <Timeline
                steps={milestoneSteps.map((step) => ({
                  date: milestoneDate(kase, step.key),
                  isComplete: Boolean(milestoneDate(kase, step.key)),
                  label: step.label,
                  stage: step.stage,
                }))}
              />
            </SectionCard>

            <SectionCard
              title="Delay Tracking"
              badge={
                kase.isDelayed ? (
                  <StatusBadge tone="danger">
                    <TriangleAlert size={11} />
                    {kase.delay.delayExternalDays ? `${kase.delay.delayExternalDays}d delay` : "Delayed"}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="success">On Track</StatusBadge>
                )
              }
            >
              <div className="case-info-list">
                <InfoRow label="External Delay Days" value={String(kase.delay.delayExternalDays ?? 0)} />
                <InfoRow label="Delay Reason" value={kase.delay.delayReason ?? "—"} />
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === "awards" ? (
          <div className="case-page-awards-section">
            <AwardsPanel caseId={caseId} />
          </div>
        ) : null}

        {activeTab === "activity" ? (
          <div className="case-page-main case-page-main-contained">
            <SectionCard title="Activity">
              {!hasAuditAccess ? (
                <p className="hero-copy">Activity is available to users with audit access.</p>
              ) : activity.isLoading ? (
                <Skeleton height={16} />
              ) : activity.error ? (
                <p className="inline-error">{activity.error.message}</p>
              ) : (
                <ActivityFeed
                  emptyMessage="No case activity yet."
                  items={(activity.data ?? []).map((event) => ({
                    id: event.id,
                    meta: new Date(event.occurredAt).toLocaleString("en-IN", {
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      year: "numeric",
                    }),
                    summary: event.summary,
                    tone: activityTone(event.action),
                  }))}
                />
              )}
            </SectionCard>
          </div>
        ) : null}
      </div>

      {/* ── Timestamps footer ──────────────────────────────────── */}
      <div className="case-page-footer">
        <span>Case ID: {caseId}</span>
        {kase.createdAt && (
          <span>Created: {formatDateTime(kase.createdAt)}</span>
        )}
        {kase.updatedAt && (
          <span>Last updated: {formatDateTime(kase.updatedAt)}</span>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmationDialog
        confirmLabel="Delete Case"
        description="This soft-deletes the selected procurement case. Admin users with restore permission can recover it later."
        isOpen={isDeleteOpen}
        isPending={deleteMutation.isPending}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Case"
        tone="danger"
      >
        <TextArea
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder="Reason for deletion (optional)"
          value={deleteReason}
        />
        {deleteMutation.error ? <p className="inline-error">{deleteMutation.error.message}</p> : null}
      </ConfirmationDialog>
    </div>
  );
}

// ── Section card wrapper ────────────────────────────────────────────────────

function SectionCard({
  badge,
  children,
  icon: Icon,
  title,
}: {
  badge?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ElementType;
  title: string;
}) {
  return (
    <div className="case-section-card">
      <div className="case-section-card-header">
        <p className="eyebrow">
          {Icon && <Icon size={13} />}
          {title}
        </p>
        {badge && <div>{badge}</div>}
      </div>
      {children}
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────

type KpiTone = "neutral" | "brand" | "success" | "danger" | "warning";

function KpiCard({
  icon: Icon,
  label,
  tone = "neutral",
  unit,
  value,
}: {
  icon: React.ElementType;
  label: string;
  tone?: KpiTone;
  unit?: string;
  value: string;
}) {
  return (
    <div className={`case-kpi-card case-kpi-card-${tone}`}>
      <dt>
        <Icon size={12} />
        {label}
      </dt>
      <dd>
        {value}
        {unit && <span className="case-kpi-unit"> {unit}</span>}
      </dd>
    </div>
  );
}

// ── Financial cell ─────────────────────────────────────────────────────────

function FinancialCell({
  label,
  sub,
  tone,
  value,
}: {
  label: string;
  sub?: string;
  tone?: KpiTone;
  value: string;
}) {
  return (
    <div className={`case-financial-cell${tone ? ` case-financial-cell-${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub && <span>{sub}</span>}
    </div>
  );
}

// ── Info row ───────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="case-info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ── Utilities ──────────────────────────────────────────────────────────────

function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  return formatDateOnly(value, "—");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function formatSavingsPct(savings: number | null | undefined, base: number | null | undefined) {
  if (savings == null || !base) return "";
  const pct = Math.round((savings / base) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% of base`;
}

function runningAgeDays(prReceiptDate: string | null | undefined): string {
  const start = dateOnlyToLocalDate(prReceiptDate);
  if (!start) return "—";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return days >= 0 ? String(days) : "—";
}

function timeElapsedPct(
  prReceiptDate: string | null | undefined,
  targetDate: string | null | undefined,
): string {
  const startDate = dateOnlyToLocalDate(prReceiptDate);
  const endDate = dateOnlyToLocalDate(targetDate);
  if (!startDate || !endDate) return "—";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = startDate.getTime();
  const end = endDate.getTime();
  const total = end - start;
  if (total <= 0) return "—";
  const pct = Math.round(((today - start) / total) * 100);
  return `${Math.max(0, Math.min(pct, 999))}%`;
}

function completionFY(targetDate: string | null | undefined): string {
  const parts = parseDateOnlyParts(toDateOnlyInputValue(targetDate));
  if (!parts) return "—";
  const fyStart = parts.month >= 4 ? parts.year : parts.year - 1;
  return `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

function elapsedTone(elapsed: string): KpiTone {
  const n = parseInt(elapsed);
  if (isNaN(n)) return "neutral";
  if (n >= 100) return "danger";
  if (n >= 80) return "warning";
  return "neutral";
}

function savingsTone(value: number | null | undefined): KpiTone {
  if (value == null) return "neutral";
  if (value > 0) return "success";
  if (value < 0) return "danger";
  return "neutral";
}

function milestoneDate(kase: CaseDetail, key: string) {
  const value = kase.milestones[key];
  return typeof value === "string" ? toDateOnlyInputValue(value) || null : null;
}

function activityTone(action: string): "danger" | "neutral" | "success" | "warning" {
  if (action.includes("delete")) return "danger";
  if (action.includes("restore") || action.includes("create")) return "success";
  if (action.includes("delay")) return "warning";
  return "neutral";
}

function isOverdue(kase: CaseDetail) {
  const targetDate = toDateOnlyInputValue(kase.tentativeCompletionDate);
  return Boolean(
    kase.status === "running" &&
      targetDate &&
      targetDate < todayDateOnlyString(),
  );
}
