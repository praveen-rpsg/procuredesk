import { apiBaseUrl, apiRequest } from "../../../shared/api/client";

export type ImportJob = {
  acceptedRows: number;
  createdAt: string;
  id: string;
  importType: string;
  progressMessage: string | null;
  progressPercent: number;
  rejectedRows: number;
  stagedUnknownEntities: number;
  stagedUnknownUsers: number;
  status: string;
  totalRows: number;
};

export type ImportJobRow = {
  errors: unknown[];
  id: string;
  normalizedPayload: Record<string, unknown> | null;
  rowNumber: number;
  sourcePayload: Record<string, unknown>;
  status: "accepted" | "rejected" | "staged";
};

export function uploadImportFile(payload: {
  file: File;
  importType:
    | "old_contracts"
    | "portal_user_mapping"
    | "rc_po_plan"
    | "tender_cases"
    | "user_department_mapping";
}) {
  const formData = new FormData();
  formData.append("file", payload.file);
  return apiRequest<{ fileAssetId: string; id: string }>(
    `/imports/upload/${payload.importType}`,
    {
      body: formData,
      method: "POST",
    },
  );
}

export function createFileAsset(payload: {
  byteSize?: number | null;
  checksumSha256?: string | null;
  contentType?: string | null;
  originalFilename?: string | null;
  purpose: "import" | "export";
  storageKey: string;
}) {
  return apiRequest<{ id: string }>("/imports/file-assets", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function createImportJob(payload: {
  fileAssetId: string;
  importType:
    | "old_contracts"
    | "portal_user_mapping"
    | "rc_po_plan"
    | "tender_cases"
    | "user_department_mapping";
}) {
  return apiRequest<{ id: string }>("/imports/jobs", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function listImportJobs() {
  return apiRequest<ImportJob[]>("/imports/jobs");
}

export function listImportRows(importJobId: string) {
  return apiRequest<ImportJobRow[]>(`/imports/jobs/${importJobId}/rows`);
}

export function commitImport(importJobId: string) {
  return apiRequest<{ committed: boolean }>(`/imports/jobs/${importJobId}/commit`, {
    method: "POST",
  });
}

export function importProblemRowsDownloadUrl(importJobId: string) {
  return `${apiBaseUrl}/imports/jobs/${importJobId}/problem-rows.csv`;
}

export function tenderCasesTemplateDownloadUrl() {
  return `${apiBaseUrl}/imports/templates/tender-cases.xlsx`;
}

export function portalUserMappingTemplateDownloadUrl() {
  return `${apiBaseUrl}/imports/templates/portal-user-mapping.xlsx`;
}

export function userDepartmentMappingTemplateDownloadUrl() {
  return `${apiBaseUrl}/imports/templates/user-department-mapping.xlsx`;
}

export function oldContractsTemplateDownloadUrl() {
  return `${apiBaseUrl}/imports/templates/old-contracts.xlsx`;
}
