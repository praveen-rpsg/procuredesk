export type ImportParserInput = {
  data: Buffer;
  contentType?: string | null;
  importType:
    | "old_contracts"
    | "portal_user_mapping"
    | "rc_po_plan"
    | "tender_cases"
    | "user_department_mapping";
  storageKey: string;
};

export type ParsedImportRow = {
  errors: string[];
  normalizedPayload: Record<string, unknown> | null;
  sourcePayload: Record<string, unknown>;
  status: "accepted" | "rejected" | "staged";
};

export interface ImportParser {
  parse(input: ImportParserInput): Promise<ParsedImportRow[]>;
}
