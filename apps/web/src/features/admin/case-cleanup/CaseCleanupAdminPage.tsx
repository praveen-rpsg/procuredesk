import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  executeCaseCleanup,
  listCaseCleanupImportJobs,
  listCaseCleanupOwnerOptions,
  previewCaseCleanup,
  type CaseCleanupImportJobOption,
  type CaseCleanupMode,
  type CaseCleanupPreview,
  type CaseCleanupPreviewRow,
} from "../api/adminApi";
import { Button } from "../../../shared/ui/button/Button";
import { ComboboxSelect } from "../../../shared/ui/form/ComboboxSelect";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { Select } from "../../../shared/ui/form/Select";
import { TextArea } from "../../../shared/ui/form/TextArea";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const columns: DataTableColumn<CaseCleanupPreviewRow>[] = [
  { key: "risk", header: "Risk", render: (row) => <RiskBadge risk={row.risk} /> },
  { key: "case", header: "Case ID", render: (row) => row.id },
  { key: "pr", header: "PR ID", render: (row) => row.prId },
  { key: "scheme", header: "PR/Scheme No.", render: (row) => row.prSchemeNo ?? "-" },
  { key: "tender", header: "Tender No.", render: (row) => row.tenderNo ?? "-" },
  { key: "owner", header: "Owner", render: (row) => row.ownerFullName ?? row.ownerUserId ?? "-" },
  { key: "entity", header: "Entity", render: (row) => row.entityCode ?? row.entityName ?? "-" },
  { key: "updated", header: "Updated", render: (row) => formatDateTime(row.updatedAt) },
  {
    key: "reason",
    header: "Review",
    render: (row) => row.reasons.length ? row.reasons.join("; ") : "Ready",
  },
];

export function CaseCleanupAdminPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [mode, setMode] = useState<CaseCleanupMode>("import_job");
  const [caseText, setCaseText] = useState("");
  const [importJobId, setImportJobId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [prText, setPrText] = useState("");
  const [reason, setReason] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [preview, setPreview] = useState<CaseCleanupPreview | null>(null);

  const prIds = useMemo(
    () =>
      prText
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    [prText],
  );
  const caseIds = useMemo(
    () =>
      caseText
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    [caseText],
  );
  const invalidCaseIds = useMemo(
    () => caseIds.filter((caseId) => !uuidPattern.test(caseId)),
    [caseIds],
  );
  const caseIdError =
    mode === "case_ids" && invalidCaseIds.length
      ? "Case ID List accepts internal UUIDs only. Use PR/Scheme No. List for PR values like RPSG_CESC..."
      : undefined;

  const cleanupCriteria = useMemo(() => {
    const payload: {
      caseIds?: string[];
      importJobId?: string;
      mode: CaseCleanupMode;
      prIds?: string[];
    } = { mode };
    if (mode === "case_ids") payload.caseIds = caseIds;
    if (mode === "import_job") payload.importJobId = importJobId.trim();
    if (mode === "pr_ids") payload.prIds = prIds;
    return payload;
  }, [caseIds, importJobId, mode, prIds]);

  const hasCleanupCriteria =
    (mode === "case_ids" && caseIds.length > 0 && invalidCaseIds.length === 0) ||
    (mode === "import_job" && Boolean(importJobId.trim())) ||
    (mode === "pr_ids" && prIds.length > 0);

  const ownerOptionsQuery = useQuery({
    enabled: hasCleanupCriteria,
    queryFn: () => listCaseCleanupOwnerOptions(cleanupCriteria),
    queryKey: ["case-cleanup-owner-options", cleanupCriteria],
  });
  const importJobsQuery = useQuery({
    queryFn: listCaseCleanupImportJobs,
    queryKey: ["case-cleanup-import-jobs"],
  });

  const importJobOptions = useMemo(
    () =>
      (importJobsQuery.data ?? []).map((job) => ({
        description: `${job.acceptedRows}/${job.totalRows} accepted · ${shortId(job.id)}`,
        label: importJobLabel(job),
        value: job.id,
      })),
    [importJobsQuery.data],
  );

  const ownerOptions = useMemo(
    () => [
      {
        description: hasCleanupCriteria ? "Do not narrow by owner" : "Enter cleanup criteria first",
        label: "All matching owners",
        value: "",
      },
      ...(ownerOptionsQuery.data ?? [])
        .filter((owner) => owner.ownerUserId)
        .map((owner) => ({
          description: `${owner.caseCount} matching case${owner.caseCount === 1 ? "" : "s"}`,
          label: owner.fullName ?? owner.username ?? owner.email ?? owner.ownerUserId ?? "Unknown owner",
          value: owner.ownerUserId ?? "",
        })),
    ],
    [hasCleanupCriteria, ownerOptionsQuery.data],
  );

  useEffect(() => {
    if (!ownerUserId || ownerOptions.some((option) => option.value === ownerUserId)) return;
    setOwnerUserId("");
    setPreview(null);
  }, [ownerOptions, ownerUserId]);

  const previewMutation = useMutation({
    mutationFn: () => {
      const payload: {
        caseIds?: string[];
        importJobId?: string;
        mode: CaseCleanupMode;
        ownerUserId?: string;
        prIds?: string[];
      } = { mode };
      if (mode === "case_ids") payload.caseIds = caseIds;
      if (mode === "import_job") payload.importJobId = importJobId.trim();
      if (mode === "pr_ids") payload.prIds = prIds;
      if (ownerUserId.trim()) payload.ownerUserId = ownerUserId.trim();
      return previewCaseCleanup(payload);
    },
    onError: (error) => {
      notify({
        message: error instanceof Error ? error.message : "Cleanup preview failed.",
        tone: "danger",
      });
    },
    onSuccess: (result) => {
      setPreview(result);
      setConfirmationText("");
      notify({ message: `Preview ready: ${result.safeCount} safe cases.`, tone: "success" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Run preview before cleanup.");
      return executeCaseCleanup({
        confirmationText,
        previewToken: preview.previewToken,
        reason,
      });
    },
    onError: (error) => {
      notify({
        message: error instanceof Error ? error.message : "Cleanup failed.",
        tone: "danger",
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deleted-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]);
      notify({
        message: `Cleanup complete: ${result.deletedCount} deleted, ${result.skippedCount} skipped.`,
        tone: "success",
      });
      setPreview(null);
      setConfirmationText("");
    },
  });

  const expectedConfirmation = preview ? `DELETE ${preview.safeCount} CASES` : "";
  const canPreview =
    hasCleanupCriteria &&
    !previewMutation.isPending;
  const canExecute =
    Boolean(preview?.safeCount) &&
    reason.trim().length >= 10 &&
    confirmationText === expectedConfirmation &&
    !executeMutation.isPending;

  const onPreview = (event: FormEvent) => {
    event.preventDefault();
    setPreview(null);
    previewMutation.mutate();
  };

  return (
    <section className="admin-section admin-grid-wide">
      <PageHeader eyebrow="Admin" title="Case Cleanup">
        Preview and soft-delete confirmed cases without hard deletion.
      </PageHeader>

      <form className="case-cleanup-form" onSubmit={onPreview}>
        <div className="case-cleanup-controls">
          <FormField label="Cleanup Mode" required>
            <Select
              onChange={(event) => {
                setMode(event.target.value as CaseCleanupMode);
                setOwnerUserId("");
                setPreview(null);
              }}
              options={[
                { label: "Import Job", value: "import_job" },
                { label: "PR/Scheme No. List", value: "pr_ids" },
                { label: "Case UUID List", value: "case_ids" },
              ]}
              value={mode}
            />
          </FormField>
          <FormField label="Owner">
            <ComboboxSelect
              disabled={!hasCleanupCriteria || ownerOptionsQuery.isLoading}
              emptyMessage="No matching owners found."
              onChange={(value) => {
                setOwnerUserId(value);
                setPreview(null);
              }}
              options={ownerOptions}
              placeholder={ownerOptionsQuery.isLoading ? "Loading owners..." : "All matching owners"}
              searchPlaceholder="Search owner..."
              value={ownerUserId}
            />
          </FormField>
          <div className="form-actions case-cleanup-actions">
            <Button disabled={!canPreview} type="submit">
              <Search size={16} />
              Preview
            </Button>
          </div>
        </div>
        <div className="case-cleanup-criteria">
          {mode === "import_job" ? (
            <FormField label="Import Job" required>
              <ComboboxSelect
                disabled={importJobsQuery.isLoading}
                emptyMessage="No committed tender import jobs found."
                onChange={(value) => {
                  setImportJobId(value);
                  setOwnerUserId("");
                  setPreview(null);
                }}
                options={importJobOptions}
                placeholder={importJobsQuery.isLoading ? "Loading import jobs..." : "Select committed tender import"}
                searchPlaceholder="Search by date, rows, or job id..."
                value={importJobId}
              />
            </FormField>
          ) : mode === "case_ids" ? (
            <FormField
              error={caseIdError}
              helperText="Use the internal UUID shown in the Case ID column. For RPSG_CESC... values, select PR/Scheme No. List."
              label="Case UUID List"
              required
            >
              <TextArea
                onChange={(event) => {
                  setCaseText(event.target.value);
                  setOwnerUserId("");
                  setPreview(null);
                }}
                placeholder="One case UUID per line"
                rows={5}
                value={caseText}
              />
            </FormField>
          ) : (
            <FormField label="PR/Scheme No. List" required>
              <TextArea
                onChange={(event) => {
                  setPrText(event.target.value);
                  setOwnerUserId("");
                  setPreview(null);
                }}
                placeholder="One PR/Scheme No. per line"
                rows={5}
                value={prText}
              />
            </FormField>
          )}
        </div>
      </form>

      {preview ? (
        <section className="admin-section-panel">
          <div className="cleanup-summary-grid">
            <SummaryTile label="Total" value={preview.totalCount} />
            <SummaryTile label="Safe" value={preview.safeCount} />
            <SummaryTile label="Warnings" value={preview.warningCount} />
            <SummaryTile label="Blocked" value={preview.blockedCount} />
          </div>
          {preview.warningCount || preview.blockedCount ? (
            <p className="inline-warning">
              <AlertTriangle size={14} />
              Only safe rows are eligible for cleanup. Warning and blocked rows are skipped.
            </p>
          ) : null}
          <DataTable
            columns={columns}
            emptyMessage="No active cases matched the cleanup criteria."
            getRowKey={(row) => row.id}
            pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100] }}
            rows={preview.rows}
          />
          <div className="admin-form-grid">
            <FormField label="Delete Reason" required>
              <TextArea
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                value={reason}
              />
            </FormField>
            <FormField label="Confirmation" required>
              <TextInput
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={expectedConfirmation}
                value={confirmationText}
              />
            </FormField>
            <div className="form-actions">
              <Button
                disabled={!canExecute}
                onClick={() => executeMutation.mutate()}
                variant="danger"
              >
                <Trash2 size={16} />
                Soft Delete Safe Cases
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function RiskBadge({ risk }: { risk: CaseCleanupPreviewRow["risk"] }) {
  if (risk === "safe") return <StatusBadge tone="success">Safe</StatusBadge>;
  if (risk === "warning") return <StatusBadge tone="warning">Warning</StatusBadge>;
  return <StatusBadge tone="danger">Blocked</StatusBadge>;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="cleanup-summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function importJobLabel(job: CaseCleanupImportJobOption) {
  const date = formatDateTime(job.committedAt ?? job.createdAt);
  return `Tender Bulk Import · ${date} · ${job.totalRows} row${job.totalRows === 1 ? "" : "s"}`;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
