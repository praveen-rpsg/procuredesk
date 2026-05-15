import type { Pool, PoolClient } from "pg";

import { createImportParserRegistry } from "./import-parser-registry.js";
import type { ImportParserInput, ParsedImportRow } from "./import-parser.js";
import type { PrivateObjectStorage } from "../storage/private-object-storage.js";

export type ImportJobPayload = {
  actorUserId?: string;
  importJobId: string;
  tenantId: string;
};

const UNKNOWN_ENTITY_ERROR = "Unknown entity code.";
const UNKNOWN_USER_ERROR = "Unknown owner user.";
const UNKNOWN_DEPARTMENT_ERROR =
  "Unknown or inactive user department for entity.";

export async function processImportJob(
  payload: ImportJobPayload,
  dependencies: { pool: Pool; storage: PrivateObjectStorage },
): Promise<void> {
  const client = await dependencies.pool.connect();
  try {
    await client.query("begin");
    const jobResult = await client.query<{
      content_type: string | null;
      import_type: ImportParserInput["importType"];
      storage_key: string;
    }>(
      `
        select j.import_type, f.storage_key, f.content_type
        from ops.import_jobs j
        join ops.file_assets f on f.id = j.file_asset_id
        where j.tenant_id = $1
          and j.id = $2
          and j.status in ('uploaded', 'failed')
        for update
      `,
      [payload.tenantId, payload.importJobId],
    );
    const job = jobResult.rows[0];
    if (!job) {
      await client.query("rollback");
      return;
    }
    await client.query(
      `
        update ops.import_jobs
        set status = 'parsing',
            progress_percent = 10,
            progress_message = 'Reading import file'
        where tenant_id = $1
          and id = $2
      `,
      [payload.tenantId, payload.importJobId],
    );
    await client.query("commit");

    const data = await dependencies.storage.read(job.storage_key);
    await updateImportProgress(dependencies.pool, payload, 25, "Parsing rows");
    const parser = createImportParserRegistry()[job.import_type];
    const parsedRows = await parser.parse({
      contentType: job.content_type,
      data,
      importType: job.import_type,
      storageKey: job.storage_key,
    });
    await updateImportProgress(
      dependencies.pool,
      payload,
      55,
      "Validating rows",
    );
    const validatedRows = await validateRows(
      payload.tenantId,
      job.import_type,
      parsedRows,
      dependencies.pool,
      payload.actorUserId,
    );
    await updateImportProgress(
      dependencies.pool,
      payload,
      80,
      "Saving staged rows",
    );
    await persistRows(
      payload.tenantId,
      payload.importJobId,
      validatedRows,
      dependencies.pool,
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    await dependencies.pool.query(
      `
        update ops.import_jobs
        set status = 'failed',
            progress_message = $3,
            completed_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [
        payload.tenantId,
        payload.importJobId,
        error instanceof Error ? error.message : "Import parsing failed",
      ],
    );
    await dependencies.pool.query(
      `
        insert into ops.audit_events (
          tenant_id, action, target_type, target_id, summary, details
        )
        values ($1, 'import_job.failed', 'import_job', $2, $3, $4)
      `,
      [
        payload.tenantId,
        payload.importJobId,
        "Import parsing failed",
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      ],
    );
    throw error;
  } finally {
    client.release();
  }
}

async function updateImportProgress(
  pool: Pool,
  payload: ImportJobPayload,
  progressPercent: number,
  progressMessage: string,
): Promise<void> {
  await pool.query(
    `
      update ops.import_jobs
      set progress_percent = $3,
          progress_message = $4
      where tenant_id = $1
        and id = $2
        and status = 'parsing'
    `,
    [payload.tenantId, payload.importJobId, progressPercent, progressMessage],
  );
}

async function validateRows(
  tenantId: string,
  importType: ImportParserInput["importType"],
  rows: ParsedImportRow[],
  pool: Pool,
  actorUserId?: string,
): Promise<ParsedImportRow[]> {
  const shouldLoadExistingUsers = importType === "portal_user_mapping";
  const [
    entityScope,
    catalog,
    users,
    departments,
    existingCases,
    roles,
    existingUsers,
    existingOldContracts,
  ] = await Promise.all([
    loadEntityScope(tenantId, pool, actorUserId),
    loadCatalogLookups(tenantId, pool),
    loadUserLookups(tenantId, pool),
    loadDepartmentLookups(tenantId, pool),
    loadExistingCaseLookups(tenantId, pool),
    loadRoleLookups(tenantId, pool),
    shouldLoadExistingUsers
      ? loadExistingUserLookups(tenantId, pool)
      : Promise.resolve({
          emails: new Set<string>(),
          phoneOwners: new Map<string, string>(),
        }),
    loadExistingOldContractLookups(tenantId, pool),
  ]);

  const seenPrIds = new Set<string>();
  const seenTenderNos = new Set<string>();
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenDepartments = new Set<string>();
  const seenContracts = new Set<string>();
  return rows.map((row) =>
    validateImportRow({
      catalog,
      departments,
      entityScope,
      existingCases,
      existingOldContracts,
      existingUsers,
      importType,
      roles,
      row,
      seenContracts,
      seenDepartments,
      seenEmails,
      seenPhones,
      seenPrIds,
      seenTenderNos,
      users,
    }),
  );
}

function validateImportRow(input: ValidateImportRowInput): ParsedImportRow {
  const {
    catalog,
    departments,
    entityScope,
    existingCases,
    existingOldContracts,
    existingUsers,
    importType,
    roles,
    row,
    seenContracts,
    seenDepartments,
    seenEmails,
    seenPhones,
    seenPrIds,
    seenTenderNos,
    users,
  } = input;
  const normalizedPayload = normalizeValidatedPayload(
    row.normalizedPayload ?? {},
  );
  const entityCode = textValue(normalizedPayload.entityCode).toLowerCase();
  const entity = entityCode
    ? entityScope.entitiesByCode.get(entityCode)
    : undefined;
  const errors = [...row.errors];

  if (importType === "portal_user_mapping") {
    // Portal user imports validate comma-separated entity scopes after role resolution.
  } else if (importType === "user_department_mapping") {
    validateUserDepartmentEntityScope(
      errors,
      normalizedPayload.entityCode,
      entity,
      entityScope.allowedEntityIds,
    );
  } else {
    validateEntityScope(errors, entity, entityScope.allowedEntityIds);
  }
  const moduleRow = validateSpecializedImportRow({
    departments,
    entityId: entity?.id,
    entityScope,
    errors,
    existingOldContracts,
    existingUsers,
    importType,
    normalizedPayload,
    roles,
    row,
    seenContracts,
    seenDepartments,
    seenEmails,
    seenPhones,
    users,
  });
  if (moduleRow) {
    return moduleRow;
  }

  validateCatalogFields(errors, normalizedPayload, catalog);
  normalizeTenderOwner(errors, normalizedPayload, entity?.id, users);
  validateDepartment(
    errors,
    normalizedPayload.departmentName,
    entity?.id,
    departments,
  );
  validateTenderIdentifiers(
    errors,
    normalizedPayload,
    existingCases,
    seenPrIds,
    seenTenderNos,
  );
  validateRequiredText(
    errors,
    normalizedPayload.tenderName ??
      normalizedPayload.tenderDescription ??
      normalizedPayload.prDescription,
    "Tender Name is required.",
  );
  validateOptionalDates(errors, normalizedPayload, entity?.id, catalog);
  validateChronology(errors, normalizedPayload);
  validateOptionalNumber(
    errors,
    normalizedPayload.rcPoAmount,
    "RC/PO amount is invalid.",
  );
  validatePositiveMoney(
    errors,
    normalizedPayload.prValue,
    "PR Value / Approved Budget must be a positive number.",
  );
  validatePositiveMoney(
    errors,
    normalizedPayload.estimateBenchmark,
    "Estimate / Benchmark must be a positive number.",
  );
  validatePositiveMoney(
    errors,
    normalizedPayload.approvedAmount,
    "NFA Approved Amount must be a positive number.",
  );
  validateInteger(
    errors,
    normalizedPayload.biddersParticipated,
    "Bidder Participated Count must be a non-negative integer.",
  );
  validateInteger(
    errors,
    normalizedPayload.qualifiedBidders,
    "Qualified Bidders Count must be a non-negative integer.",
  );
  validateBidderCounts(errors, normalizedPayload);
  validateControlledBoolean(
    errors,
    normalizedPayload.cpcInvolved,
    "CPC Involved? must be Yes or No.",
  );
  validatePriority(errors, normalizedPayload.priority);
  validateLoiAndRcPo(errors, normalizedPayload);

  return buildValidatedRow(
    row,
    normalizedPayload,
    errors,
    existingCases.prIds.has(textValue(normalizedPayload.prId).toLowerCase())
      ? "update"
      : "create",
  );
}

function validateSpecializedImportRow(input: {
  departments: Awaited<ReturnType<typeof loadDepartmentLookups>>;
  entityId: string | undefined;
  entityScope: Awaited<ReturnType<typeof loadEntityScope>>;
  errors: string[];
  existingOldContracts: Awaited<
    ReturnType<typeof loadExistingOldContractLookups>
  >;
  existingUsers: Awaited<ReturnType<typeof loadExistingUserLookups>>;
  importType: ImportParserInput["importType"];
  normalizedPayload: Record<string, unknown>;
  roles: Awaited<ReturnType<typeof loadRoleLookups>>;
  row: ParsedImportRow;
  seenContracts: Set<string>;
  seenDepartments: Set<string>;
  seenEmails: Set<string>;
  seenPhones: Set<string>;
  users: Awaited<ReturnType<typeof loadUserLookups>>;
}): ParsedImportRow | null {
  const payload = input.normalizedPayload;
  if (input.importType === "portal_user_mapping") {
    validatePortalUserMapping(
      input.errors,
      payload,
      input.entityScope,
      input.roles,
      input.existingUsers,
      input.seenEmails,
      input.seenPhones,
    );
    return buildValidatedRow(
      input.row,
      payload,
      input.errors,
      userImportAction(payload, input.existingUsers),
    );
  }
  if (input.importType === "user_department_mapping") {
    validateUserDepartmentMapping(
      input.errors,
      payload,
      input.entityId,
      input.departments,
      input.seenDepartments,
    );
    return buildValidatedRow(
      input.row,
      payload,
      input.errors,
      departmentImportAction(payload, input.entityId, input.departments),
    );
  }
  if (input.importType === "rc_po_plan") {
    validateRcPoPlan(
      input.errors,
      payload,
      input.entityId,
      input.departments,
      input.existingOldContracts,
      input.seenContracts,
    );
    return buildValidatedRow(
      input.row,
      payload,
      input.errors,
      oldContractImportAction(
        payload,
        input.entityId,
        input.existingOldContracts,
      ),
    );
  }
  if (input.importType === "old_contracts") {
    validateOldContract(
      input.errors,
      payload,
      input.entityId,
      input.users,
      input.departments,
      input.existingOldContracts,
      input.seenContracts,
    );
    return buildValidatedRow(
      input.row,
      payload,
      input.errors,
      oldContractImportAction(
        payload,
        input.entityId,
        input.existingOldContracts,
      ),
    );
  }
  return null;
}

type ValidateImportRowInput = {
  catalog: Awaited<ReturnType<typeof loadCatalogLookups>>;
  departments: Awaited<ReturnType<typeof loadDepartmentLookups>>;
  entityScope: Awaited<ReturnType<typeof loadEntityScope>>;
  existingCases: Awaited<ReturnType<typeof loadExistingCaseLookups>>;
  existingOldContracts: Awaited<
    ReturnType<typeof loadExistingOldContractLookups>
  >;
  existingUsers: Awaited<ReturnType<typeof loadExistingUserLookups>>;
  importType: ImportParserInput["importType"];
  roles: Awaited<ReturnType<typeof loadRoleLookups>>;
  row: ParsedImportRow;
  seenContracts: Set<string>;
  seenDepartments: Set<string>;
  seenEmails: Set<string>;
  seenPhones: Set<string>;
  seenPrIds: Set<string>;
  seenTenderNos: Set<string>;
  users: Awaited<ReturnType<typeof loadUserLookups>>;
};

function buildValidatedRow(
  row: ParsedImportRow,
  normalizedPayload: Record<string, unknown>,
  errors: string[],
  importAction: string,
): ParsedImportRow {
  return {
    ...row,
    normalizedPayload: { ...normalizedPayload, importAction },
    errors,
    status: statusForRow(row.status, errors),
  };
}

function validateEntityScope(
  errors: string[],
  entity: { id: string } | undefined,
  allowedEntityIds: Set<string> | null,
): void {
  if (!entity) {
    errors.push(UNKNOWN_ENTITY_ERROR);
    return;
  }
  if (allowedEntityIds?.has(entity.id) === false) {
    errors.push("Actor is not allowed to import rows for this entity.");
  }
}

function validateUserDepartmentEntityScope(
  errors: string[],
  entityValue: unknown,
  entity: { id: string } | undefined,
  allowedEntityIds: Set<string> | null,
): void {
  validateRequiredText(errors, entityValue, "Entity is required.");
  if (!entity) return;
  if (allowedEntityIds?.has(entity.id) === false) {
    errors.push("Actor is not allowed to import rows for this entity.");
  }
}

function validateCatalogFields(
  errors: string[],
  payload: Record<string, unknown>,
  catalog: Awaited<ReturnType<typeof loadCatalogLookups>>,
): void {
  validateCatalogValue(
    errors,
    catalog.referenceValues,
    "budget_type",
    payload.budgetType,
    "Unknown budget type.",
  );
  validateCatalogValue(
    errors,
    catalog.referenceValues,
    "nature_of_work",
    payload.natureOfWork,
    "Unknown nature of work.",
  );
  validateCatalogValue(
    errors,
    catalog.referenceValues,
    "pr_receiving_medium",
    payload.prReceivingMedium,
    "Unknown PR receiving medium.",
  );
  if (
    hasValue(payload.tenderType) &&
    !catalog.tenderTypes.has(textValue(payload.tenderType).toLowerCase())
  ) {
    errors.push("Unknown tender type.");
  }
}

function validateOptionalDates(
  errors: string[],
  payload: Record<string, unknown>,
  entityId: string | undefined,
  catalog: Awaited<ReturnType<typeof loadCatalogLookups>>,
): void {
  const dateFields = [
    ["PR/Scheme Receipt Date", "prReceiptDate"],
    ["NIT Initiation", "nitInitiationDate"],
    ["NIT Approval", "nitApprovalDate"],
    ["NIT Publish", "nitPublishDate"],
    ["Bid Receipt", "bidReceiptDate"],
    ["Commercial Evaluation", "commercialEvaluationDate"],
    ["Technical Evaluation", "technicalEvaluationDate"],
    ["NFA Submission", "nfaSubmissionDate"],
    ["NFA Approval", "nfaApprovalDate"],
    ["LOI Award Date", "loiIssuedDate"],
    ["RC/PO Award Date", "rcPoAwardDate"],
    ["RC/PO Validity", "rcPoValidityDate"],
    ["Tentative tendering date", "tentativeTenderingDate"],
  ] as const;
  for (const [label, key] of dateFields) {
    if (hasValue(payload[key]) && !parseImportDate(payload[key])) {
      errors.push(`${label} must be a valid date in DD-MM-YYYY format.`);
    }
  }
  if (isFutureDate(payload.prReceiptDate)) {
    errors.push("PR/Scheme Receipt Date cannot be in the future.");
  }
  const tenderType = catalog.tenderTypesByName.get(
    textValue(payload.tenderType).toLowerCase(),
  );
  if (
    !payload.tentativeCompletionDate &&
    tenderType?.completionDays != null &&
    payload.prReceiptDate
  ) {
    const receipt = parseImportDate(payload.prReceiptDate);
    if (receipt && entityId) {
      payload.tentativeCompletionDate = addDays(
        receipt,
        tenderType.completionDays,
      );
    }
  }
}

async function loadEntityScope(
  tenantId: string,
  pool: Pool,
  actorUserId?: string,
): Promise<{
  allowedEntityIds: Set<string> | null;
  entitiesByCode: Map<string, { id: string }>;
}> {
  const entities = await pool.query<{ code: string; id: string; name: string }>(
    "select id::text as id, lower(code::text) as code, lower(name) as name from org.entities where tenant_id = $1 and deleted_at is null and is_active = true",
    [tenantId],
  );
  const entitiesByCode = new Map<string, { id: string }>();
  for (const row of entities.rows) {
    entitiesByCode.set(row.code, { id: row.id });
    if ("name" in row && typeof row.name === "string") {
      entitiesByCode.set(row.name, { id: row.id });
    }
  }

  if (!actorUserId) {
    return { allowedEntityIds: null, entitiesByCode };
  }

  const actor = await pool.query<{
    access_level: "ENTITY" | "GROUP" | "USER";
    entity_ids: string[] | null;
    is_platform_super_admin: boolean;
    permissions: string[] | null;
  }>(
    `
      select
        u.access_level,
        u.is_platform_super_admin,
        coalesce(array_agg(distinct rp.permission_code::text) filter (where rp.permission_code is not null), '{}') as permissions,
        coalesce(array_agg(distinct ues.entity_id::text) filter (where ues.entity_id is not null), '{}') as entity_ids
      from iam.users u
      left join iam.user_roles ur on ur.user_id = u.id
      left join iam.roles r on r.id = ur.role_id and r.deleted_at is null
      left join iam.role_permissions rp on rp.role_id = r.id
      left join iam.user_entity_scopes ues on ues.user_id = u.id
      where u.tenant_id = $1
        and u.id = $2
        and u.deleted_at is null
      group by u.id
    `,
    [tenantId, actorUserId],
  );
  const actorRow = actor.rows[0];
  if (!actorRow) {
    return { allowedEntityIds: new Set(), entitiesByCode };
  }

  const permissions = new Set(actorRow.permissions ?? []);
  const canImportAllEntities =
    actorRow.is_platform_super_admin ||
    actorRow.access_level === "GROUP" ||
    permissions.has("case.update.all") ||
    permissions.has("entity.manage");

  return {
    allowedEntityIds: canImportAllEntities
      ? null
      : new Set(actorRow.entity_ids ?? []),
    entitiesByCode,
  };
}

async function loadCatalogLookups(
  tenantId: string,
  pool: Pool,
): Promise<{
  referenceValues: Map<string, Set<string>>;
  tenderTypes: Set<string>;
  tenderTypesByName: Map<string, { completionDays: number | null }>;
}> {
  const referenceValues = await pool.query<{
    category_code: string;
    key: string;
  }>(
    `
      select c.code::text as category_code, lower(v.label) as key
      from catalog.reference_values v
      join catalog.reference_categories c on c.id = v.category_id
      where v.tenant_id = $1
        and v.deleted_at is null
        and v.is_active = true
      union
      select c.code::text as category_code, lower(v.code::text) as key
      from catalog.reference_values v
      join catalog.reference_categories c on c.id = v.category_id
      where v.tenant_id = $1
        and v.deleted_at is null
        and v.is_active = true
        and v.code is not null
    `,
    [tenantId],
  );
  const referenceValueMap = new Map<string, Set<string>>();
  for (const row of referenceValues.rows) {
    if (!referenceValueMap.has(row.category_code))
      referenceValueMap.set(row.category_code, new Set());
    referenceValueMap.get(row.category_code)?.add(row.key);
  }

  const tenderTypes = await pool.query<{
    completion_days: number | null;
    key: string;
  }>(
    `
      select lower(tt.name) as key, tcr.completion_days
      from catalog.tender_types tt
      left join catalog.tender_type_completion_rules tcr on tcr.tender_type_id = tt.id
      where tt.tenant_id = $1
        and tt.deleted_at is null
        and tt.is_active = true
    `,
    [tenantId],
  );

  return {
    referenceValues: referenceValueMap,
    tenderTypes: new Set(tenderTypes.rows.map((row) => row.key)),
    tenderTypesByName: new Map(
      tenderTypes.rows.map((row) => [
        row.key,
        { completionDays: row.completion_days },
      ]),
    ),
  };
}

async function loadDepartmentLookups(
  tenantId: string,
  pool: Pool,
): Promise<Map<string, Set<string>>> {
  const result = await pool.query<{ entity_id: string; name: string }>(
    `
      select entity_id::text, lower(name) as name
      from org.departments
      where tenant_id = $1
        and deleted_at is null
        and is_active = true
    `,
    [tenantId],
  );
  const departments = new Map<string, Set<string>>();
  for (const row of result.rows) {
    if (!departments.has(row.entity_id))
      departments.set(row.entity_id, new Set());
    departments.get(row.entity_id)?.add(row.name);
  }
  return departments;
}

async function loadExistingCaseLookups(
  tenantId: string,
  pool: Pool,
): Promise<{ prIds: Set<string>; tenderNos: Map<string, string> }> {
  const result = await pool.query<{ pr_id: string; tender_no: string | null }>(
    `
      select lower(pr_id) as pr_id, lower(tender_no) as tender_no
      from procurement.cases
      where tenant_id = $1
        and deleted_at is null
    `,
    [tenantId],
  );
  return {
    prIds: new Set(result.rows.map((row) => row.pr_id)),
    tenderNos: new Map(
      result.rows
        .filter((row) => row.tender_no)
        .map((row) => [row.tender_no as string, row.pr_id]),
    ),
  };
}

async function loadExistingOldContractLookups(
  tenantId: string,
  pool: Pool,
): Promise<Set<string>> {
  const result = await pool.query<{ key: string }>(
    `
      select lower(
        e.id::text || '|' ||
        coalesce(d.name, '') || '|' ||
        coalesce(p.tender_description, '') || '|' ||
        coalesce(p.awarded_vendors, '')
      ) as key
      from procurement.rc_po_plans p
      join org.entities e on e.id = p.entity_id
      left join org.departments d on d.id = p.department_id
      where p.tenant_id = $1
        and p.deleted_at is null
    `,
    [tenantId],
  );
  return new Set(result.rows.map((row) => row.key));
}

async function loadRoleLookups(
  tenantId: string,
  pool: Pool,
): Promise<Map<string, { code: string; description: string | null; id: string; name: string }>> {
  const result = await pool.query<{
    code: string;
    description: string | null;
    id: string;
    key: string;
    name: string;
  }>(
    `
      select id::text, code::text, name, lower(name) as key, description
      from iam.roles
      where (tenant_id = $1 or tenant_id is null)
        and deleted_at is null
        and code <> 'platform_super_admin'
      union
      select id::text, code::text, name, lower(code::text) as key, description
      from iam.roles
      where (tenant_id = $1 or tenant_id is null)
        and deleted_at is null
        and code <> 'platform_super_admin'
    `,
    [tenantId],
  );
  return new Map(
    result.rows.map((row) => [
      row.key,
      { code: row.code, description: row.description, id: row.id, name: row.name },
    ]),
  );
}

async function loadExistingUserLookups(
  tenantId: string,
  pool: Pool,
): Promise<{ emails: Set<string>; phoneOwners: Map<string, string> }> {
  const result = await pool.query<{ contact_no: string | null; email: string }>(
    `
      select lower(email::text) as email, contact_no
      from iam.users
      where tenant_id = $1
        and deleted_at is null
    `,
    [tenantId],
  );
  return {
    emails: new Set(result.rows.map((row) => row.email)),
    phoneOwners: new Map(
      result.rows
        .map((row) => [normalizePhone(row.contact_no), row.email] as const)
        .filter(([phone]) => Boolean(phone)),
    ),
  };
}

async function loadUserLookups(
  tenantId: string,
  pool: Pool,
): Promise<Map<string, { entityIds: Set<string>; id: string }>> {
  const result = await pool.query<{
    email: string;
    entity_ids: string[] | null;
    id: string;
    username: string;
  }>(
    `
      select
        u.id::text as id,
        lower(u.username::text) as username,
        lower(u.email::text) as email,
        coalesce(array_agg(distinct ues.entity_id::text) filter (where ues.entity_id is not null), '{}') as entity_ids
      from iam.users u
      left join iam.user_entity_scopes ues on ues.user_id = u.id
      where u.tenant_id = $1
        and u.deleted_at is null
        and u.status = 'active'
      group by u.id
    `,
    [tenantId],
  );
  const users = new Map<string, { entityIds: Set<string>; id: string }>();
  for (const row of result.rows) {
    const user = { entityIds: new Set(row.entity_ids ?? []), id: row.id };
    users.set(row.username, user);
    users.set(row.email, user);
  }
  return users;
}

function validateCatalogValue(
  errors: string[],
  referenceValues: Map<string, Set<string>>,
  categoryCode: string,
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) return;
  if (!referenceValues.get(categoryCode)?.has(textValue(value).toLowerCase())) {
    errors.push(message);
  }
}

function validateOwner(
  errors: string[],
  value: unknown,
  entityId: string | undefined,
  users: Map<string, { entityIds: Set<string>; id: string }>,
): void {
  if (!hasValue(value)) return;
  const user = users.get(textValue(value).toLowerCase());
  if (!user) {
    errors.push(UNKNOWN_USER_ERROR);
    return;
  }
  if (entityId && !user.entityIds.has(entityId)) {
    errors.push("Owner user is not mapped to the row entity.");
  }
}

function normalizeTenderOwner(
  errors: string[],
  payload: Record<string, unknown>,
  entityId: string | undefined,
  users: Map<string, { entityIds: Set<string>; id: string }>,
): void {
  if (!hasValue(payload.ownerUsername)) return;
  const user = users.get(textValue(payload.ownerUsername).toLowerCase());
  if (!user) {
    errors.push(UNKNOWN_USER_ERROR);
    return;
  }
  if (entityId && !user.entityIds.has(entityId)) {
    payload.ownerUsername = null;
  }
}

function validatePortalUserMapping(
  errors: string[],
  payload: Record<string, unknown>,
  entityScope: Awaited<ReturnType<typeof loadEntityScope>>,
  roles: Map<string, { code: string; description: string | null; id: string; name: string }>,
  existingUsers: { emails: Set<string>; phoneOwners: Map<string, string> },
  seenEmails: Set<string>,
  seenPhones: Set<string>,
): void {
  validateRequiredText(errors, payload.fullName, "Full Name is required.");
  validateRequiredText(errors, payload.mailId, "Mail ID is required.");
  validateRequiredText(
    errors,
    payload.accessLevelRequired,
    "Access Level Required is required.",
  );
  validatePortalUserEmail(errors, payload, seenEmails);
  validatePortalUserPhone(
    errors,
    payload.contactNo,
    payload.mailId,
    existingUsers,
    seenPhones,
  );
  const role = roles.get(textValue(payload.accessLevelRequired).toLowerCase());
  if (!role)
    errors.push("Access Level Required is not available in role master.");
  validatePortalUserEntities(errors, payload, role, entityScope);
  payload.accessLevelDefinition =
    role?.description ?? payload.accessLevelDefinition ?? "";
}

function validatePortalUserEntities(
  errors: string[],
  payload: Record<string, unknown>,
  role: { code: string; name: string } | undefined,
  entityScope: Awaited<ReturnType<typeof loadEntityScope>>,
): void {
  const accessLevel = accessLevelForRole(role);
  payload.dataAccessLevel = accessLevel;
  if (accessLevel === "GROUP") {
    payload.entityCodes = [];
    return;
  }

  const entityValues = splitEntityValues(payload.entityCode);
  if (!entityValues.length) {
    errors.push("Entity is required for this access level.");
    return;
  }

  const resolved = new Map<string, { id: string; label: string }>();
  for (const value of entityValues) {
    const entity = entityScope.entitiesByCode.get(value.toLowerCase());
    if (!entity) {
      errors.push(`Unknown entity: ${value}.`);
      continue;
    }
    if (entityScope.allowedEntityIds?.has(entity.id) === false) {
      errors.push(`Actor is not allowed to import users for entity: ${value}.`);
      continue;
    }
    resolved.set(entity.id, { id: entity.id, label: value });
  }
  payload.entityCodes = [...resolved.values()].map((entity) => entity.label);
  payload.entityIds = [...resolved.keys()];
}

function validatePortalUserEmail(
  errors: string[],
  payload: Record<string, unknown>,
  seenEmails: Set<string>,
): void {
  const email = textValue(payload.mailId).toLowerCase();
  if (!email) return;
  payload.mailId = email;
  payload.username = email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push("Mail ID must be a valid email address.");
  if (seenEmails.has(email))
    errors.push("Duplicate Mail ID exists within this import file.");
  seenEmails.add(email);
}

function validatePortalUserPhone(
  errors: string[],
  value: unknown,
  mailId: unknown,
  existingUsers: { emails: Set<string>; phoneOwners: Map<string, string> },
  seenPhones: Set<string>,
): void {
  const phone = normalizePhone(value);
  if (!phone) return;
  if (phone.length < 8 || phone.length > 15)
    errors.push("Contact No. must be 8 to 15 digits including country code.");
  if (seenPhones.has(phone))
    errors.push("Duplicate Contact No. exists within this import file.");
  seenPhones.add(phone);
  const existingOwnerEmail = existingUsers.phoneOwners.get(phone);
  if (
    existingOwnerEmail &&
    existingOwnerEmail !== textValue(mailId).toLowerCase()
  ) {
    errors.push("Contact No. already exists for another user.");
  }
}

function validateUserDepartmentMapping(
  errors: string[],
  payload: Record<string, unknown>,
  entityId: string | undefined,
  departments: Map<string, Set<string>>,
  seenDepartments: Set<string>,
): void {
  validateRequiredText(
    errors,
    payload.departmentName,
    "User Department is required.",
  );
  const department = textValue(payload.departmentName);
  const entityKey = entityId ?? textValue(payload.entityCode).toLowerCase();
  const key = `${entityKey}|${department.toLowerCase()}`;
  if (key.endsWith("|")) return;
  if (seenDepartments.has(key))
    errors.push("Duplicate User Department exists within this import file.");
  seenDepartments.add(key);
  if (entityId && departments.get(entityId)?.has(department.toLowerCase())) {
    payload.importAction = "existing";
  }
}

function validateOldContract(
  errors: string[],
  payload: Record<string, unknown>,
  entityId: string | undefined,
  users: Map<string, { entityIds: Set<string>; id: string }>,
  departments: Map<string, Set<string>>,
  existingOldContracts: Set<string>,
  seenContracts: Set<string>,
): void {
  validateDepartment(errors, payload.departmentName, entityId, departments);
  validateOwner(errors, payload.ownerUsername, entityId, users);
  validateRequiredText(
    errors,
    payload.tenderDescription,
    "Tender Description is required.",
  );
  validateRequiredText(
    errors,
    payload.awardedVendors,
    "Awarded Vendors (comma separated) is required.",
  );
  validatePositiveMoney(
    errors,
    payload.rcPoAmount,
    "RC/PO Amount must be a positive number.",
  );
  validateOldContractDates(errors, payload);
  const vendorList = splitVendors(payload.awardedVendors);
  if (!vendorList.length)
    errors.push("Awarded Vendors must include at least one vendor.");
  if (
    vendorList.length !==
    new Set(vendorList.map((vendor) => vendor.toLowerCase())).size
  ) {
    errors.push("Awarded Vendors contains duplicate vendor names.");
  }
  const key = oldContractKey(payload, entityId);
  if (key) {
    if (seenContracts.has(key))
      errors.push("Duplicate old contract exists within this import file.");
    seenContracts.add(key);
    if (existingOldContracts.has(key)) payload.importAction = "existing";
  }
}

function validateRcPoPlan(
  errors: string[],
  payload: Record<string, unknown>,
  entityId: string | undefined,
  departments: Map<string, Set<string>>,
  existingOldContracts: Set<string>,
  seenContracts: Set<string>,
): void {
  validateDepartment(errors, payload.departmentName, entityId, departments);
  validateRequiredText(
    errors,
    payload.tenderDescription,
    "Tender Description is required.",
  );
  validateRequiredText(
    errors,
    payload.awardedVendors,
    "Awarded Vendors (comma separated) is required.",
  );
  validatePositiveMoney(
    errors,
    payload.rcPoAmount,
    "RC/PO Amount must be a positive number.",
  );
  validateRcPoPlanDates(errors, payload);
  const vendorList = splitVendors(payload.awardedVendors);
  if (!vendorList.length)
    errors.push("Awarded Vendors must include at least one vendor.");
  if (
    vendorList.length !==
    new Set(vendorList.map((vendor) => vendor.toLowerCase())).size
  ) {
    errors.push("Awarded Vendors contains duplicate vendor names.");
  }
  const key = oldContractKey(payload, entityId);
  if (key) {
    if (seenContracts.has(key))
      errors.push("Duplicate RC/PO plan exists within this import file.");
    seenContracts.add(key);
    if (existingOldContracts.has(key)) payload.importAction = "existing";
  }
}

function validateDepartment(
  errors: string[],
  value: unknown,
  entityId: string | undefined,
  departments: Map<string, Set<string>>,
): void {
  if (!hasValue(value)) return;
  if (
    !entityId ||
    !departments.get(entityId)?.has(textValue(value).toLowerCase())
  ) {
    errors.push(UNKNOWN_DEPARTMENT_ERROR);
  }
}

function validateTenderIdentifiers(
  errors: string[],
  payload: Record<string, unknown>,
  existingCases: { prIds: Set<string>; tenderNos: Map<string, string> },
  seenPrIds: Set<string>,
  seenTenderNos: Set<string>,
): void {
  validateRequiredText(errors, payload.prId, "PR/Scheme No is required.");
  const prId = textValue(payload.prId).toLowerCase();
  if (prId) {
    if (seenPrIds.has(prId))
      errors.push("Duplicate PR/Scheme No exists within this import file.");
    seenPrIds.add(prId);
  }
  const tenderNo = textValue(payload.tenderNo).toLowerCase();
  if (tenderNo) {
    if (seenTenderNos.has(tenderNo))
      errors.push("Duplicate Tender No. exists within this import file.");
    seenTenderNos.add(tenderNo);
    const existingPrId = existingCases.tenderNos.get(tenderNo);
    if (existingPrId && existingPrId !== prId) {
      errors.push("Tender No. already exists against another PR/Scheme No.");
    }
  }
}

function validateChronology(
  errors: string[],
  payload: Record<string, unknown>,
): void {
  const chain = [
    ["PR/Scheme Receipt Date", payload.prReceiptDate],
    ["NIT Initiation", payload.nitInitiationDate],
    ["NIT Approval", payload.nitApprovalDate],
    ["NIT Publish", payload.nitPublishDate],
    ["Bid Receipt", payload.bidReceiptDate],
    ["NFA Submission", payload.nfaSubmissionDate],
    ["NFA Approval", payload.nfaApprovalDate],
    ["LOI Award Date", payload.loiIssuedDate],
    ["RC/PO Award Date", payload.rcPoAwardDate],
    ["RC/PO Validity", payload.rcPoValidityDate],
  ] as const;
  let previousLabel: string | null = null;
  let previousDate: string | null = null;
  for (const [label, rawValue] of chain) {
    const date = parseImportDate(rawValue);
    if (!date) continue;
    if (previousDate && date < previousDate) {
      errors.push(`${label} cannot be before ${previousLabel}.`);
    }
    previousLabel = label;
    previousDate = date;
  }
  const bidReceipt = parseImportDate(payload.bidReceiptDate);
  const nfaSubmission = parseImportDate(payload.nfaSubmissionDate);
  for (const [label, value] of [
    ["Commercial Evaluation", payload.commercialEvaluationDate],
    ["Technical Evaluation", payload.technicalEvaluationDate],
  ] as const) {
    const date = parseImportDate(value);
    if (date && bidReceipt && date < bidReceipt)
      errors.push(`${label} must be on or after Bid Receipt.`);
    if (date && nfaSubmission && nfaSubmission < date)
      errors.push("NFA Submission cannot be before evaluation dates.");
  }
}

function validateBidderCounts(
  errors: string[],
  payload: Record<string, unknown>,
): void {
  const participated = numberValue(payload.biddersParticipated);
  const qualified = numberValue(payload.qualifiedBidders);
  if (participated != null && qualified != null && qualified > participated) {
    errors.push(
      "Qualified Bidders Count cannot exceed Bidder Participated Count.",
    );
  }
}

function validateControlledBoolean(
  errors: string[],
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) return;
  if (booleanValue(value) == null) errors.push(message);
}

function validatePriority(errors: string[], value: unknown): void {
  if (!hasValue(value)) return;
  const normalized = textValue(value).toLowerCase();
  if (
    ![
      "low",
      "medium",
      "high",
      "critical",
      "yes",
      "no",
      "true",
      "false",
    ].includes(normalized)
  ) {
    errors.push("Priority? must be Low, Medium, High, Critical, Yes, or No.");
  }
}

function validateLoiAndRcPo(
  errors: string[],
  payload: Record<string, unknown>,
): void {
  const loiIssued = booleanValue(payload.loiIssued);
  if (loiIssued && !parseImportDate(payload.loiIssuedDate)) {
    errors.push("LOI Award Date is mandatory when LOI Awarded? is Yes.");
  }
  const loiDate = parseImportDate(payload.loiIssuedDate);
  const rcPoAward = parseImportDate(payload.rcPoAwardDate);
  const rcPoValidity = parseImportDate(payload.rcPoValidityDate);
  if (loiDate && rcPoAward && rcPoAward < loiDate) {
    errors.push("RC/PO Award Date cannot precede LOI Award Date.");
  }
  if (rcPoAward && rcPoValidity && rcPoValidity < rcPoAward) {
    errors.push("RC/PO Validity must be on or after RC/PO Award Date.");
  }
}

function validateRequiredText(
  errors: string[],
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) {
    errors.push(message);
  }
}

function validateOptionalDate(
  errors: string[],
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) return;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return;
  const parsed = Date.parse(textValue(value));
  if (Number.isNaN(parsed)) {
    errors.push(message);
  }
}

function validateOldContractDates(
  errors: string[],
  payload: Record<string, unknown>,
): void {
  for (const [label, value] of [
    ["RC/PO Award Date", payload.rcPoAwardDate],
    ["RC/PO Validity Date", payload.rcPoValidityDate],
  ] as const) {
    if (hasValue(value) && !parseImportDate(value)) {
      errors.push(`${label} must be a valid date in DD-MM-YYYY or DD/MM/YYYY format.`);
    }
  }
  const awardDate = parseImportDate(payload.rcPoAwardDate);
  const validityDate = parseImportDate(payload.rcPoValidityDate);
  if (awardDate && validityDate && validityDate < awardDate) {
    errors.push("RC/PO Validity Date must be on or after RC/PO Award Date.");
  }
}

function validateRcPoPlanDates(
  errors: string[],
  payload: Record<string, unknown>,
): void {
  for (const [label, value] of [
    ["RC/PO Award Date", payload.rcPoAwardDate],
    ["RC/PO Validity Date", payload.rcPoValidityDate],
  ] as const) {
    if (hasValue(value) && !parseImportDate(value)) {
      errors.push(
        `${label} must be a valid date in YYYY-MM-DD, DD-MM-YYYY, or DD/MM/YYYY format.`,
      );
    }
  }
  const awardDate = parseImportDate(payload.rcPoAwardDate);
  const validityDate = parseImportDate(payload.rcPoValidityDate);
  if (awardDate && validityDate && validityDate < awardDate) {
    errors.push("RC/PO Validity Date must be on or after RC/PO Award Date.");
  }
}

function userImportAction(
  payload: Record<string, unknown>,
  existingUsers: { emails: Set<string>; phoneOwners: Map<string, string> },
): string {
  const email = textValue(payload.mailId).toLowerCase();
  if (email && existingUsers.emails.has(email)) return "update-access";
  return "create";
}

function departmentImportAction(
  payload: Record<string, unknown>,
  entityId: string | undefined,
  departments: Map<string, Set<string>>,
): string {
  if (!entityId) return "create";
  return departments
    .get(entityId)
    ?.has(textValue(payload.departmentName).toLowerCase())
    ? "existing"
    : "create";
}

function accessLevelForRole(role: { code: string; name: string } | undefined): "ENTITY" | "GROUP" | "USER" {
  const value = `${role?.code ?? ""} ${role?.name ?? ""}`.toLowerCase();
  if (
    [
      "administration_manager",
      "administration manager",
      "group_manager",
      "group manager",
      "group_viewer",
      "group viewer",
      "tenant_admin",
      "tenant admin",
      "report_viewer",
      "report viewer",
    ].some((token) => value.includes(token))
  ) {
    return "GROUP";
  }
  if (
    [
      "entity_manager",
      "entity manager",
      "entity_viewer",
      "entity viewer",
      "entity",
    ].some((token) => value.includes(token))
  ) {
    return "ENTITY";
  }
  return "USER";
}

function splitEntityValues(value: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of textValue(value).split(",")) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.toLowerCase() === "all") continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function oldContractImportAction(
  payload: Record<string, unknown>,
  entityId: string | undefined,
  existingOldContracts: Set<string>,
): string {
  const key = oldContractKey(payload, entityId);
  return key && existingOldContracts.has(key) ? "existing" : "create";
}

function oldContractKey(
  payload: Record<string, unknown>,
  entityId: string | undefined,
): string {
  if (!entityId) return "";
  return [
    entityId,
    textValue(payload.departmentName).toLowerCase(),
    textValue(payload.tenderDescription).toLowerCase(),
    splitVendors(payload.awardedVendors).join("|").toLowerCase(),
  ].join("|");
}

function splitVendors(value: unknown): string[] {
  return textValue(value)
    .split(",")
    .map((vendor) => vendor.trim())
    .filter(Boolean);
}

function validateOptionalNumber(
  errors: string[],
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) return;
  if (numberValue(value) == null) {
    errors.push(message);
  }
}

function isFutureDate(value: unknown): boolean {
  const parsed = parseImportDate(value);
  return Boolean(parsed && parsed > todayDateString());
}

function validatePositiveMoney(
  errors: string[],
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) return;
  const numeric = numberValue(value);
  if (numeric == null || numeric < 0) errors.push(message);
}

function validateInteger(
  errors: string[],
  value: unknown,
  message: string,
): void {
  if (!hasValue(value)) return;
  const numeric = numberValue(value);
  if (numeric == null || numeric < 0 || !Number.isInteger(numeric))
    errors.push(message);
}

function statusForRow(
  currentStatus: ParsedImportRow["status"],
  errors: string[],
): ParsedImportRow["status"] {
  if (currentStatus === "rejected") return "rejected";
  if (!errors.length) return "accepted";
  const stagedReferenceErrors = new Set([
    UNKNOWN_ENTITY_ERROR,
    UNKNOWN_USER_ERROR,
  ]);
  const hasOnlyStagedReferenceErrors = errors.every((error) =>
    stagedReferenceErrors.has(error),
  );
  return hasOnlyStagedReferenceErrors ? "staged" : "rejected";
}

function hasValue(value: unknown): boolean {
  return textValue(value).length > 0;
}

function textValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return dateToDateOnlyString(value) ?? "";
  return String(value).trim();
}

function normalizeValidatedPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...payload };
  for (const key of [
    "prReceiptDate",
    "nitInitiationDate",
    "nitApprovalDate",
    "nitPublishDate",
    "bidReceiptDate",
    "commercialEvaluationDate",
    "technicalEvaluationDate",
    "nfaSubmissionDate",
    "nfaApprovalDate",
    "loiIssuedDate",
    "rcPoAwardDate",
    "rcPoValidityDate",
    "tentativeCompletionDate",
  ]) {
    const parsed = parseImportDate(normalized[key]);
    if (parsed) normalized[key] = parsed;
  }
  for (const key of [
    "approvedAmount",
    "biddersParticipated",
    "estimateBenchmark",
    "prValue",
    "qualifiedBidders",
    "rcPoAmount",
  ]) {
    const numeric = numberValue(normalized[key]);
    if (numeric != null) normalized[key] = numeric;
  }
  const cpc = booleanValue(normalized.cpcInvolved);
  if (cpc != null) normalized.cpcInvolved = cpc;
  const loi = booleanValue(normalized.loiIssued);
  if (loi != null) normalized.loiIssued = loi;
  normalized.priorityCase = priorityValue(normalized.priority);
  normalized.tenderDescription =
    normalized.tenderName ??
    normalized.tenderDescription ??
    normalized.prDescription;
  return normalized;
}

function parseImportDate(value: unknown): string | null {
  if (!hasValue(value)) return null;
  if (value instanceof Date) return dateToDateOnlyString(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDateToDateOnlyString(value);
  }
  const text = textValue(value);
  const ddmmyyyy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1];
    const mm = ddmmyyyy[2];
    const yyyy = ddmmyyyy[3];
    if (!dd || !mm || !yyyy) return null;
    const normalized = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    return isValidIsoDate(normalized) ? normalized : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso && isValidIsoDate(text)) return text;
  return null;
}

function excelSerialDateToDateOnlyString(value: number): string | null {
  if (!Number.isInteger(value) || value <= 0) return null;
  const milliseconds = Math.round((value - 25569) * 86400 * 1000);
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateOnlyParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function isValidIsoDate(value: string): boolean {
  const parts = parseIsoDateParts(value);
  if (!parts) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

function numberValue(value: unknown): number | null {
  if (!hasValue(value)) return null;
  const numeric = Number(textValue(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function booleanValue(value: unknown): boolean | null {
  if (!hasValue(value)) return null;
  const normalized = textValue(value).toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

function normalizePhone(value: unknown): string {
  return textValue(value).replace(/[^\d]/g, "");
}

function priorityValue(value: unknown): boolean {
  const normalized = textValue(value).toLowerCase();
  return ["yes", "true", "high", "critical"].includes(normalized);
}

function todayDateString(): string {
  return dateToDateOnlyString(new Date()) ?? "";
}

function addDays(value: string, days: number): string {
  const parts = parseIsoDateParts(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function dateToDateOnlyString(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null;
  return formatDateOnlyParts(
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
  );
}

function parseIsoDateParts(
  value: string,
): { day: number; month: number; year: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function formatDateOnlyParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function persistRows(
  tenantId: string,
  importJobId: string,
  rows: ParsedImportRow[],
  pool: Pool,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from ops.import_job_rows where import_job_id = $1",
      [importJobId],
    );
    for (const [index, row] of rows.entries()) {
      await insertRow(client, importJobId, index + 1, row);
    }
    const accepted = rows.filter((row) => row.status === "accepted").length;
    const rejected = rows.filter((row) => row.status === "rejected").length;
    const stagedUnknownEntities = rows.filter((row) =>
      row.errors.includes(UNKNOWN_ENTITY_ERROR),
    ).length;
    const stagedUnknownUsers = rows.filter((row) =>
      row.errors.includes(UNKNOWN_USER_ERROR),
    ).length;
    await client.query(
      `
        update ops.import_jobs
        set status = 'parsed',
            progress_percent = 100,
            progress_message = $8,
            total_rows = $3,
            accepted_rows = $4,
            rejected_rows = $5,
            staged_unknown_entities = $6,
            staged_unknown_users = $7,
            completed_at = now()
        where tenant_id = $1
          and id = $2
      `,
      [
        tenantId,
        importJobId,
        rows.length,
        accepted,
        rejected,
        stagedUnknownEntities,
        stagedUnknownUsers,
        rejected > 0 || stagedUnknownEntities > 0 || stagedUnknownUsers > 0
          ? "Parsed with rows requiring review"
          : "Ready to commit",
      ],
    );
    await client.query(
      `
        insert into ops.audit_events (
          tenant_id, action, target_type, target_id, summary, details
        )
        values ($1, 'import_job.parsed', 'import_job', $2, $3, $4)
      `,
      [
        tenantId,
        importJobId,
        "Import parsing completed",
        JSON.stringify({
          accepted,
          rejected,
          stagedUnknownEntities,
          stagedUnknownUsers,
          total: rows.length,
        }),
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertRow(
  client: PoolClient,
  importJobId: string,
  rowNumber: number,
  row: ParsedImportRow,
): Promise<void> {
  await client.query(
    `
      insert into ops.import_job_rows (
        import_job_id, row_number, status, source_payload, normalized_payload, errors
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      importJobId,
      rowNumber,
      row.status,
      JSON.stringify(row.sourcePayload),
      row.normalizedPayload ? JSON.stringify(row.normalizedPayload) : null,
      JSON.stringify(row.errors),
    ],
  );
}
