export type FileAsset = {
  byteSize: number | null;
  checksumSha256: string | null;
  contentType: string | null;
  id: string;
  originalFilename: string | null;
  purpose: string;
  storageKey: string;
};

export type ImportJob = {
  acceptedRows: number;
  credentialExportAvailable: boolean;
  credentialExportExpiresAt: string | null;
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
