import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Download,
  FileSpreadsheet,
  FileUp,
  FolderKanban,
  ListChecks,
  UploadCloud,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  commitImport,
  importCredentialExportDownloadUrl,
  importProblemRowsDownloadUrl,
  listImportJobs,
  listImportRows,
  portalUserMappingTemplateDownloadUrl,
  rcPoPlanTemplateDownloadUrl,
  type ImportJob,
  type ImportJobRow,
  tenderCasesTemplateDownloadUrl,
  userDepartmentMappingTemplateDownloadUrl,
  uploadImportFile,
} from "../api/importExportApi";
import { Button } from "../../../shared/ui/button/Button";
import { FormField } from "../../../shared/ui/form/FormField";
import { Modal } from "../../../shared/ui/modal/Modal";
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { navigateToAppPath, useAppLocation } from "../../../shared/routing/appLocation";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type ImportType =
  | "portal_user_mapping"
  | "rc_po_plan"
  | "tender_cases"
  | "user_department_mapping";
type ImportSectionKey = "jobs" | "upload";

const importSections = [
  { description: "Upload a source file and queue parsing.", icon: UploadCloud, key: "upload", label: "Upload" },
  { description: "Track parsing, rejected rows, and commits.", icon: ListChecks, key: "jobs", label: "Import Jobs" },
] satisfies Array<{
  description: string;
  icon: typeof UploadCloud;
  key: ImportSectionKey;
  label: string;
}>;

const importSectionPaths: Record<ImportSectionKey, string> = {
  jobs: "/imports/jobs",
  upload: "/imports/upload",
};

const importTypeOptions = [
  {
    description: "Upload procurement case data with tender milestones, budgets, departments, and owners.",
    icon: FolderKanban,
    label: "Tender Bulk Import",
    value: "tender_cases",
  },
  {
    description: "Create or update portal users, roles, entity access, and credential exports.",
    icon: UsersRound,
    label: "Portal Users",
    value: "portal_user_mapping",
  },
  {
    description: "Create missing entities and update department mappings without duplicate case variants.",
    icon: Building2,
    label: "Departments",
    value: "user_department_mapping",
  },
  {
    description: "Upload legacy RC/PO contract records for renewal and expiry tracking.",
    icon: FileSpreadsheet,
    label: "Old Contracts",
    value: "rc_po_plan",
  },
] satisfies Array<{
  description: string;
  icon: LucideIcon;
  label: string;
  value: ImportType;
}>;

const columns = (
  onCommit: (jobId: string) => void,
  onPreview: (jobId: string) => void,
  isCommitting: boolean,
): DataTableColumn<ImportJob>[] => [
  { key: "type", header: "Type", render: (row) => importTypeLabel(row.importType) },
  { key: "status", header: "Status", render: (row) => <StatusBadge>{row.status}</StatusBadge> },
  {
    key: "progress",
    header: "Progress",
    render: (row) => (
      <div className="progress-cell">
        <progress max={100} value={row.progressPercent} />
        <span>{row.progressPercent}%</span>
        {row.progressMessage ? (
          <small className={row.status === "failed" ? "inline-error" : undefined}>
            {jobProgressMessage(row)}
          </small>
        ) : null}
      </div>
    ),
  },
  { key: "rows", header: "Rows", render: (row) => row.totalRows },
  { key: "accepted", header: "Accepted", render: (row) => row.acceptedRows },
  { key: "rejected", header: "Rejected", render: (row) => row.rejectedRows },
  {
    key: "actions",
    header: "",
    render: (row) => (
      <div className="row-actions">
        <Button onClick={() => onPreview(row.id)} variant="secondary">
          Preview
        </Button>
        {row.totalRows > row.acceptedRows ? (
          <Button href={importProblemRowsDownloadUrl(row.id)} variant="secondary">
            Problem Rows
          </Button>
        ) : null}
        {row.credentialExportAvailable ? (
          <Button href={importCredentialExportDownloadUrl(row.id)} variant="secondary">
            Credentials
          </Button>
        ) : null}
        <Button
          disabled={
            isCommitting ||
            row.status !== "parsed" ||
            row.totalRows > row.acceptedRows
          }
          onClick={() => onCommit(row.id)}
        >
          Commit
        </Button>
      </div>
    ),
  },
];

const rowColumns: DataTableColumn<ImportJobRow>[] = [
  { key: "row", header: "Row", render: (row) => row.rowNumber },
  { key: "status", header: "Status", render: (row) => <StatusBadge>{row.status}</StatusBadge> },
  { key: "action", header: "Impact", render: (row) => String(row.normalizedPayload?.importAction ?? "-") },
  { key: "record", header: "Record", render: (row) => previewRecordLabel(row.normalizedPayload) },
  { key: "entity", header: "Entity", render: (row) => String(row.normalizedPayload?.entityCode ?? "-") },
  {
    key: "errors",
    header: "Issues",
    render: (row) => (Array.isArray(row.errors) && row.errors.length ? row.errors.join("; ") : "Ready"),
  },
];

export function ImportExportWorkspace() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const location = useAppLocation();
  const activeSection = importSectionFromPath(location.pathname) ?? "upload";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<ImportType>("tender_cases");
  const [jobStatusFilter, setJobStatusFilter] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("");
  const [previewJobId, setPreviewJobId] = useState("");

  const jobs = useQuery({ queryFn: listImportJobs, queryKey: ["import-jobs"] });
  const previewRows = useQuery({
    enabled: Boolean(previewJobId),
    queryFn: () => listImportRows(previewJobId),
    queryKey: ["import-job-rows", previewJobId],
  });

  useEffect(() => {
    if (location.pathname === "/imports") {
      navigateToAppPath(importSectionPaths.upload, { replace: true });
    }
  }, [location.pathname]);

  const createJobMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error("Choose a file before creating an import job.");
      }
      return uploadImportFile({ file: selectedFile, importType });
    },
    onSuccess: async (result) => {
      setSelectedFile(null);
      await queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
      navigateToAppPath(importSectionPaths.jobs);
      notify({ message: `Import job created: ${result.id}`, tone: "success" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: commitImport,
    onError: (error) => {
      notify({
        message: error instanceof Error ? error.message : "Import commit failed.",
        tone: "danger",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
      notify({ message: "Import committed.", tone: "success" });
    },
  });

  const onCreateJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) return;
    createJobMutation.mutate();
  };
  const selectedTemplateUrl = templateDownloadUrl(importType);
  const activeJob = useMemo(
    () => (jobs.data ?? []).find((job) => job.id === previewJobId) ?? null,
    [previewJobId, jobs.data],
  );
  const visibleJobs = useMemo(() => {
    return (jobs.data ?? []).filter((job) => {
      if (jobTypeFilter && job.importType !== jobTypeFilter) return false;
      if (jobStatusFilter && job.status !== jobStatusFilter) return false;
      return true;
    });
  }, [jobStatusFilter, jobTypeFilter, jobs.data]);

  return (
    <section className="workspace-section">
      <PageHeader eyebrow="Operations" title="Imports And Exports">
        Upload private import files, create parsing jobs, preview staged rows, and commit accepted imports.
      </PageHeader>

      <section className="module-subnav-shell">
        <SecondaryNav
          activeKey={activeSection}
          ariaLabel="Import sections"
          items={importSections}
          onChange={(key) => navigateToAppPath(importSectionPaths[key])}
        />
      </section>

      <section className="module-content-area">
        {activeSection === "upload" ? (
        <section className="state-panel module-focus-panel module-focus-panel-narrow">
          <form className="import-create-form" onSubmit={onCreateJob}>
            <fieldset className="import-type-picker">
              <legend>Import Type</legend>
              <div className="import-type-card-grid">
                {importTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = importType === option.value;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`import-type-card${isSelected ? " import-type-card-selected" : ""}`}
                      key={option.value}
                      onClick={() => {
                        setImportType(option.value);
                        setSelectedFile(null);
                      }}
                      type="button"
                    >
                      <span className="import-type-card-icon">
                        <Icon size={18} />
                      </span>
                      <span className="import-type-card-copy">
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <FormField
              label="Import File"
            >
              <label className={selectedFile ? "import-file-dropzone has-file" : "import-file-dropzone"}>
                <input
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
                <span className="import-file-icon">
                  {selectedFile ? <FileSpreadsheet size={22} /> : <UploadCloud size={22} />}
                </span>
                <span className="import-file-copy">
                  <strong>{selectedFile ? selectedFile.name : "Choose CSV or XLSX file"}</strong>
                  <small>
                    {selectedFile
                      ? `${formatFileSize(selectedFile.size)} selected`
                      : "Use the matching template before uploading."}
                  </small>
                </span>
                {selectedFile ? (
                  <button
                    aria-label="Clear selected import file"
                    className="import-file-clear"
                    onClick={(event) => {
                      event.preventDefault();
                      setSelectedFile(null);
                    }}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </label>
            </FormField>
            <div className="import-create-actions">
              {selectedTemplateUrl ? (
                <Button href={selectedTemplateUrl} variant="secondary">
                  <Download size={16} />
                  Download Template
                </Button>
              ) : null}
              <Button disabled={createJobMutation.isPending || !selectedFile} type="submit">
                <FileUp size={18} />
                {createJobMutation.isPending ? "Uploading" : "Upload And Queue"}
              </Button>
            </div>
          </form>
          {createJobMutation.error ? <p className="inline-error">{createJobMutation.error.message}</p> : null}
        </section>
        ) : null}

        {activeSection === "jobs" ? (
        <section className="state-panel module-focus-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow">Jobs</p>
              <h2>Import Jobs</h2>
            </div>
          </div>
          <div className="import-job-toolbar">
            <label>
              Type
              <select
                className="text-input"
                onChange={(event) => setJobTypeFilter(event.target.value)}
                value={jobTypeFilter}
              >
                <option value="">All import types</option>
                {importTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                className="text-input"
                onChange={(event) => setJobStatusFilter(event.target.value)}
                value={jobStatusFilter}
              >
                <option value="">All statuses</option>
                <option value="queued">Queued</option>
                <option value="parsing">Parsing</option>
                <option value="parsed">Parsed</option>
                <option value="committed">Committed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <Button
              disabled={!jobTypeFilter && !jobStatusFilter}
              onClick={() => {
                setJobTypeFilter("");
                setJobStatusFilter("");
              }}
              variant="secondary"
            >
              Clear Filters
            </Button>
          </div>
          {jobs.isLoading ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
                  <Skeleton height={13} width="14%" />
                  <Skeleton height={13} width="12%" />
                  <Skeleton height={13} width="20%" />
                  <Skeleton height={13} width="8%" />
                  <Skeleton height={13} width="8%" />
                  <Skeleton height={13} width="8%" />
                </div>
              ))}
            </div>
          ) : jobs.error ? (
            <p className="inline-error">{jobs.error.message}</p>
          ) : (
            <DataTable
              columns={columns((jobId) => commitMutation.mutate(jobId), setPreviewJobId, commitMutation.isPending)}
              emptyMessage={jobs.data?.length ? "No import jobs match the selected filters." : "No import jobs found."}
              getRowKey={(row) => row.id}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50] }}
              rows={visibleJobs}
            />
          )}
          {commitMutation.error ? <p className="inline-error">{commitMutation.error.message}</p> : null}
        </section>
        ) : null}
      </section>
      <Modal
        isOpen={Boolean(previewJobId)}
        onClose={() => setPreviewJobId("")}
        size="wide"
        title="Import Preview"
      >
        <div className="import-preview-modal">
          <div className="import-preview-summary">
            <div>
              <p className="eyebrow">Type</p>
              <strong>{activeJob ? importTypeLabel(activeJob.importType) : "-"}</strong>
            </div>
            <div>
              <p className="eyebrow">Status</p>
              {activeJob ? <StatusBadge>{activeJob.status}</StatusBadge> : <span>-</span>}
            </div>
            <div>
              <p className="eyebrow">Rows</p>
              <strong>{activeJob?.totalRows ?? "-"}</strong>
            </div>
            <div>
              <p className="eyebrow">Accepted</p>
              <strong>{activeJob?.acceptedRows ?? "-"}</strong>
            </div>
            <div>
              <p className="eyebrow">Rejected</p>
              <strong>{activeJob?.rejectedRows ?? "-"}</strong>
            </div>
          </div>
          {activeJob?.status === "failed" ? (
            <p className="inline-error">{failedJobMessage(activeJob)}</p>
          ) : null}
          {previewRows.isLoading ? (
            <Skeleton height={18} />
          ) : previewRows.error ? (
            <p className="inline-error">{previewRows.error.message}</p>
          ) : (
            <div className="import-preview-table">
              <DataTable
                columns={rowColumns}
                emptyMessage={
                  activeJob?.status === "failed"
                    ? "No row preview is available because the import failed before rows could be staged."
                    : "No staged rows found for this job."
                }
                getRowKey={(row) => row.id}
                rows={previewRows.data ?? []}
              />
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}

function importSectionFromPath(pathname: string): ImportSectionKey | null {
  const match = Object.entries(importSectionPaths).find(([, path]) => pathname === path);
  return match?.[0] as ImportSectionKey | null;
}

function importTypeLabel(importType: string): string {
  if (importType === "tender_cases") return "Tender Bulk Import";
  if (importType === "portal_user_mapping") return "Entity - Portal User Mapping";
  if (importType === "user_department_mapping") return "Entity - User Department Mapping";
  if (importType === "old_contracts") return "Bulk Upload - Old Contract";
  if (importType === "rc_po_plan") return "Bulk Upload - Old Contract";
  return importType;
}

function templateDownloadUrl(importType: ImportType): string | null {
  if (importType === "tender_cases") return tenderCasesTemplateDownloadUrl();
  if (importType === "portal_user_mapping") return portalUserMappingTemplateDownloadUrl();
  if (importType === "user_department_mapping") return userDepartmentMappingTemplateDownloadUrl();
  if (importType === "rc_po_plan") return rcPoPlanTemplateDownloadUrl();
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

function jobProgressMessage(row: ImportJob): string {
  if (row.status === "failed") return failedJobMessage(row);
  return row.progressMessage ?? "";
}

function failedJobMessage(row: ImportJob): string {
  const message = row.progressMessage?.trim();
  if (!message) {
    return "Import failed before row validation finished. Download the template, check the file format, and upload again.";
  }
  if (message.includes("maximum of 10,000 rows")) {
    return message;
  }
  if (message.includes("Unknown entity")) {
    return "One or more rows use an entity code that does not exist or is outside your access.";
  }
  return message;
}

function previewRecordLabel(payload: Record<string, unknown> | null): string {
  if (!payload) return "-";
  return String(
    payload.prId ??
      payload.mailId ??
      payload.departmentName ??
      payload.tenderDescription ??
      payload.tenderName ??
      "-",
  );
}
