import { z } from "zod";

export const ImportTypeSchema = z.enum([
  "old_contracts",
  "portal_user_mapping",
  "rc_po_plan",
  "tender_cases",
  "user_department_mapping",
]);

export const CreateFileAssetRequestSchema = z.object({
  byteSize: z.number().int().min(0).nullable().optional(),
  checksumSha256: z.string().trim().max(128).nullable().optional(),
  contentType: z.string().trim().max(200).nullable().optional(),
  originalFilename: z.string().trim().max(500).nullable().optional(),
  purpose: z.enum(["import", "export"]),
  storageKey: z.string().trim().min(1).max(1000),
});

export const CreateImportJobRequestSchema = z.object({
  fileAssetId: z.string().uuid(),
  importType: ImportTypeSchema,
});

export const DryRunImportRequestSchema = z.object({
  rows: z.array(
    z.object({
      normalizedPayload: z.record(z.unknown()).nullable().optional(),
      sourcePayload: z.record(z.unknown()),
      status: z.enum(["accepted", "rejected", "staged"]).optional(),
    }),
  ).max(500),
});

export type CreateFileAssetRequest = z.infer<typeof CreateFileAssetRequestSchema>;
export type CreateImportJobRequest = z.infer<typeof CreateImportJobRequestSchema>;
export type DryRunImportRequest = z.infer<typeof DryRunImportRequestSchema>;
export type ImportType = z.infer<typeof ImportTypeSchema>;
