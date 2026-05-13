import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, ListChecks, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  commitImport,
  importProblemRowsDownloadUrl,
  listImportJobs,
  listImportRows,
  oldContractsTemplateDownloadUrl,
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
import { PageHeader } from "../../../shared/ui/page-header/PageHeader";
import { navigateToAppPath, useAppLocation } from "../../../shared/routing/appLocation";
import { SecondaryNav } from "../../../shared/ui/secondary-nav/SecondaryNav";
import { Skeleton } from "../../../shared/ui/skeleton/Skeleton";
import { StatusBadge } from "../../../shared/ui/status/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../shared/ui/table/DataTable";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type ImportType =
  | "old_contracts"
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
        {row.rejectedRows + row.stagedUnknownEntities + row.stagedUnknownUsers > 0 ? (
          <Button href={importProblemRowsDownloadUrl(row.id)} variant="secondary">
            Problem Rows
          </Button>
        ) : null}
        <Button
          disabled={
            isCommitting ||
            row.status !== "parsed" ||
            row.rejectedRows > 0 ||
            row.stagedUnknownEntities > 0 ||
            row.stagedUnknownUsers > 0
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
  const [activeJobId, setActiveJobId] = useState("");

  const jobs = useQuery({ queryFn: listImportJobs, queryKey: ["import-jobs"] });
  const previewRows = useQuery({
    enabled: Boolean(activeJobId) && activeSection === "jobs",
    queryFn: () => listImportRows(activeJobId),
    queryKey: ["import-job-rows", activeJobId],
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
      setActiveJobId(result.id);
      setSelectedFile(null);
      await queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
      notify({ message: `Import job created: ${result.id}`, tone: "success" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: commitImport,
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
    () => (jobs.data ?? []).find((job) => job.id === activeJobId) ?? null,
    [activeJobId, jobs.data],
  );

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
          <div className="detail-header">
            <div>
              <p className="eyebrow">Import</p>
              <h2>Create Job</h2>
            </div>
            <div className="panel-icon panel-icon-brand">
              <UploadCloud size={16} />
            </div>
          </div>
          <form className="stack-form" onSubmit={onCreateJob}>
            <FormField label="Import Type">
              <select
                className="text-input"
                onChange={(event) => {
                  setImportType(event.target.value as ImportType);
                  setSelectedFile(null);
                }}
                value={importType}
              >
                <option value="tender_cases">Tender Bulk Import</option>
                <option value="portal_user_mapping">Entity - Portal User Mapping</option>
                <option value="user_department_mapping">Entity - User Department Mapping</option>
                <option value="old_contracts">Bulk Upload - Old Contract</option>
                <option value="rc_po_plan">RC/PO Plan</option>
              </select>
            </FormField>
            {selectedTemplateUrl ? (
              <Button href={selectedTemplateUrl} variant="secondary">
                <Download size={16} />
                Download Template
              </Button>
            ) : null}
            <FormField
              helperText={selectedFile ? `${selectedFile.name} · ${Math.ceil(selectedFile.size / 1024)} KB` : undefined}
              label="Import File"
            >
              <input
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="text-input"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                required
                type="file"
              />
            </FormField>
            <Button disabled={createJobMutation.isPending || !selectedFile} type="submit">
              <FileUp size={18} />
              Upload And Queue
            </Button>
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
              columns={columns((jobId) => commitMutation.mutate(jobId), setActiveJobId, commitMutation.isPending)}
              emptyMessage="No import jobs found."
              getRowKey={(row) => row.id}
              rows={jobs.data ?? []}
            />
          )}
          {commitMutation.error ? <p className="inline-error">{commitMutation.error.message}</p> : null}
          {activeJobId ? (
            <section className="import-preview-panel">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Preview</p>
                  <h2>Import impact</h2>
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
              )}
            </section>
          ) : null}
        </section>
        ) : null}
      </section>
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
  if (importType === "rc_po_plan") return "RC/PO Plan";
  return importType;
}

function templateDownloadUrl(importType: ImportType): string | null {
  if (importType === "tender_cases") return tenderCasesTemplateDownloadUrl();
  if (importType === "portal_user_mapping") return portalUserMappingTemplateDownloadUrl();
  if (importType === "user_department_mapping") return userDepartmentMappingTemplateDownloadUrl();
  if (importType === "old_contracts") return oldContractsTemplateDownloadUrl();
  if (importType === "rc_po_plan") return rcPoPlanTemplateDownloadUrl();
  return null;
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
