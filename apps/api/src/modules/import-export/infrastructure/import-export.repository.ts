import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";
import type {
  FileAsset,
  ImportJob,
  ImportJobRow,
} from "../domain/import-export-models.js";

export type CreateFileAssetInput = {
  byteSize?: number | null;
  checksumSha256?: string | null;
  contentType?: string | null;
  createdBy: string;
  originalFilename?: string | null;
  purpose: string;
  storageKey: string;
  tenantId: string;
};

export type CreateUploadedImportJobInput = CreateFileAssetInput & {
  importType: string;
};

export type PortalUserCredentialInput = {
  email: string;
  password: string | null;
  passwordHash: string | null;
};

export type PortalUserCredentialExportRow = {
  action: string;
  email: string;
  emailStatus: string;
  entityCode: string;
  fullName: string;
  password: string;
  role: string;
  username: string;
};

@Injectable()
export class ImportExportRepository {
  constructor(private readonly db: DatabaseService) {}

  async createFileAsset(input: CreateFileAssetInput): Promise<{ id: string }> {
    return this.insertFileAsset(input);
  }

  async attachCredentialExport(input: {
    expiresAt: Date;
    fileAssetId: string;
    importJobId: string;
    tenantId: string;
  }): Promise<void> {
    await this.db.query(
      `
        update ops.import_jobs
        set credential_file_asset_id = $3,
            credential_export_expires_at = $4
        where tenant_id = $1
          and id = $2
      `,
      [input.tenantId, input.importJobId, input.fileAssetId, input.expiresAt],
    );
  }

  async findCredentialExport(input: {
    importJobId: string;
    tenantId: string;
  }): Promise<FileAsset | null> {
    const row = await this.db.one<QueryResultRow & FileAssetRowSql>(
      `
        select f.id, f.storage_key, f.original_filename, f.content_type,
               f.byte_size, f.checksum_sha256, f.purpose
        from ops.import_jobs j
        join ops.file_assets f on f.id = j.credential_file_asset_id
        where j.tenant_id = $1
          and j.id = $2
          and j.import_type = 'portal_user_mapping'
          and j.status = 'committed'
          and (j.credential_export_expires_at is null or j.credential_export_expires_at > now())
          and f.deleted_at is null
      `,
      [input.tenantId, input.importJobId],
    );
    return row ? this.mapFileAsset(row) : null;
  }

  async createUploadedImportJob(
    input: CreateUploadedImportJobInput,
  ): Promise<{ fileAssetId: string; id: string }> {
    return this.db.transaction(async (client) => {
      const fileAsset = await this.insertFileAsset(input, client);
      const row = await this.db.one<QueryResultRow & { id: string }>(
        `
          insert into ops.import_jobs (
            tenant_id, file_asset_id, import_type, created_by, progress_percent, progress_message
          )
          values ($1, $2, $3, $4, 0, 'Queued')
          returning id
        `,
        [input.tenantId, fileAsset.id, input.importType, input.createdBy],
        client,
      );
      if (!row) throw new Error("Failed to create import job.");
      return { fileAssetId: fileAsset.id, id: row.id };
    });
  }

  private async insertFileAsset(
    input: CreateFileAssetInput,
    client?: PoolClient,
  ): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into ops.file_assets (
          tenant_id, storage_key, original_filename, content_type,
          byte_size, checksum_sha256, purpose, created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning id
      `,
      [
        input.tenantId,
        input.storageKey,
        input.originalFilename ?? null,
        input.contentType ?? null,
        input.byteSize ?? null,
        input.checksumSha256 ?? null,
        input.purpose,
        input.createdBy,
      ],
      client,
    );
    if (!row) throw new Error("Failed to create file asset.");
    return { id: row.id };
  }

  async createImportJob(input: {
    createdBy: string;
    fileAssetId: string;
    importType: string;
    tenantId: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into ops.import_jobs (
          tenant_id, file_asset_id, import_type, created_by, progress_percent, progress_message
        )
        values ($1, $2, $3, $4, 0, 'Queued')
        returning id
      `,
      [input.tenantId, input.fileAssetId, input.importType, input.createdBy],
    );
    if (!row) throw new Error("Failed to create import job.");
    return { id: row.id };
  }

  async listImportJobs(tenantId: string): Promise<ImportJob[]> {
    const result = await this.db.query<QueryResultRow & ImportJobRowSql>(
      `
        select
          id, import_type, status, progress_percent, progress_message,
          total_rows, accepted_rows, rejected_rows,
          staged_unknown_users, staged_unknown_entities, created_at,
          credential_file_asset_id is not null
            and (credential_export_expires_at is null or credential_export_expires_at > now())
            as credential_export_available,
          credential_export_expires_at
        from ops.import_jobs
        where tenant_id = $1
        order by created_at desc
        limit 50
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.mapImportJob(row));
  }

  async listImportRows(
    tenantId: string,
    importJobId: string,
  ): Promise<ImportJobRow[]> {
    const result = await this.db.query<QueryResultRow & ImportJobRowRowSql>(
      `
        select r.id, r.row_number, r.status, r.source_payload, r.normalized_payload, r.errors
        from ops.import_job_rows r
        join ops.import_jobs j on j.id = r.import_job_id
        where j.tenant_id = $1
          and j.id = $2
        order by r.row_number asc
        limit 500
      `,
      [tenantId, importJobId],
    );
    return result.rows.map((row) => ({
      errors: row.errors,
      id: row.id,
      normalizedPayload: row.normalized_payload,
      rowNumber: row.row_number,
      sourcePayload: row.source_payload,
      status: row.status,
    }));
  }

  async listProblemRows(
    tenantId: string,
    importJobId: string,
  ): Promise<ImportJobRow[]> {
    const result = await this.db.query<QueryResultRow & ImportJobRowRowSql>(
      `
        select r.id, r.row_number, r.status, r.source_payload, r.normalized_payload, r.errors
        from ops.import_job_rows r
        join ops.import_jobs j on j.id = r.import_job_id
        where j.tenant_id = $1
          and j.id = $2
          and r.status in ('rejected', 'staged')
        order by r.row_number asc
      `,
      [tenantId, importJobId],
    );
    return result.rows.map((row) => ({
      errors: row.errors,
      id: row.id,
      normalizedPayload: row.normalized_payload,
      rowNumber: row.row_number,
      sourcePayload: row.source_payload,
      status: row.status,
    }));
  }

  async getImportJobType(input: {
    importJobId: string;
    tenantId: string;
  }): Promise<string | null> {
    const row = await this.db.one<QueryResultRow & { import_type: string }>(
      `
        select import_type
        from ops.import_jobs
        where tenant_id = $1
          and id = $2
      `,
      [input.tenantId, input.importJobId],
    );
    return row?.import_type ?? null;
  }

  async listAcceptedPortalUserRows(input: {
    importJobId: string;
    tenantId: string;
  }): Promise<
    Array<{
      email: string;
      isExisting: boolean;
    }>
  > {
    const result = await this.db.query<
      QueryResultRow & {
        email: string;
        is_existing: boolean;
      }
    >(
      `
        select
          lower(r.normalized_payload->>'mailId') as email,
          u.id is not null as is_existing
        from ops.import_job_rows r
        join ops.import_jobs j on j.id = r.import_job_id
        left join iam.users u
          on u.tenant_id = j.tenant_id
         and u.deleted_at is null
         and lower(u.email::text) = lower(r.normalized_payload->>'mailId')
        where j.tenant_id = $1
          and j.id = $2
          and j.import_type = 'portal_user_mapping'
          and r.status = 'accepted'
      `,
      [input.tenantId, input.importJobId],
    );
    return result.rows.map((row) => ({
      email: row.email,
      isExisting: row.is_existing,
    }));
  }

  async stageDryRunRows(input: {
    importJobId: string;
    rows: Array<{
      errors?: unknown[];
      normalizedPayload?: Record<string, unknown> | null;
      sourcePayload: Record<string, unknown>;
      status: "accepted" | "rejected" | "staged";
    }>;
    tenantId: string;
  }): Promise<void> {
    await this.db.transaction(async (client) => {
      await this.db.query(
        "delete from ops.import_job_rows where import_job_id = $1",
        [input.importJobId],
        client,
      );

      for (const [index, row] of input.rows.entries()) {
        await this.insertImportRow(input.importJobId, index + 1, row, client);
      }

      const accepted = input.rows.filter(
        (row) => row.status === "accepted",
      ).length;
      const rejected = input.rows.filter(
        (row) => row.status === "rejected",
      ).length;
      const stagedUnknownEntities = input.rows.filter(
        (row) => row.status === "staged",
      ).length;
      const stagedUnknownUsers = 0;
      await this.db.query(
        `
          update ops.import_jobs
          set status = 'parsed',
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
          input.tenantId,
          input.importJobId,
          input.rows.length,
          accepted,
          rejected,
          stagedUnknownEntities,
          stagedUnknownUsers,
        ],
        client,
      );
    });
  }

  async commitImportJob(input: {
    committedBy: string;
    importJobId: string;
    portalUserCredentials?: PortalUserCredentialInput[];
    tenantId: string;
  }): Promise<{ credentialRows: PortalUserCredentialExportRow[]; committed: boolean }> {
    return this.db.transaction(async (client) => {
      const job = await this.db.one<QueryResultRow & { import_type: string }>(
        `
          select import_type
          from ops.import_jobs
          where tenant_id = $1
            and id = $2
            and status = 'parsed'
            and rejected_rows = 0
            and staged_unknown_entities = 0
            and staged_unknown_users = 0
          for update
        `,
        [input.tenantId, input.importJobId],
        client,
      );
      if (!job) return { committed: false, credentialRows: [] };

      let credentialRows: PortalUserCredentialExportRow[] = [];
      if (job.import_type === "old_contracts") {
        await this.commitOldContractRows(input, client);
      } else if (job.import_type === "portal_user_mapping") {
        credentialRows = await this.commitPortalUserRows(input, client);
      } else if (job.import_type === "rc_po_plan") {
        await this.commitRcPoPlanRows(input, client);
      } else if (job.import_type === "tender_cases") {
        await this.commitTenderCaseRows(input, client);
      } else if (job.import_type === "user_department_mapping") {
        await this.commitUserDepartmentRows(input, client);
      }

      const result = await this.db.query(
        `
          update ops.import_jobs
          set status = 'committed',
              progress_percent = 100,
              progress_message = 'Committed',
              committed_at = now(),
              committed_by = $3
          where tenant_id = $1
            and id = $2
        `,
        [input.tenantId, input.importJobId, input.committedBy],
        client,
      );
      return { committed: (result.rowCount ?? 0) > 0, credentialRows };
    });
  }

  private async commitRcPoPlanRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        with inserted as (
          insert into procurement.rc_po_plans (
          tenant_id, entity_id, department_id, nature_of_work_id, tender_description, awarded_vendors, rc_po_amount,
          rc_po_award_date, rc_po_validity_date, tentative_tendering_date,
          uploaded_by, uploaded_at, created_by, updated_by
          )
          select
            $1,
            e.id,
            d.id,
            nowv.id,
            r.normalized_payload->>'tenderDescription',
            r.normalized_payload->>'awardedVendors',
            nullif(r.normalized_payload->>'rcPoAmount', '')::numeric,
            nullif(r.normalized_payload->>'rcPoAwardDate', '')::date,
            nullif(r.normalized_payload->>'rcPoValidityDate', '')::date,
            coalesce(
              nullif(r.normalized_payload->>'tentativeTenderingDate', '')::date,
              nullif(r.normalized_payload->>'rcPoAwardDate', '')::date + 150
            ),
            $3,
            now(),
            $3::uuid,
            $3::uuid
          from ops.import_job_rows r
          join org.entities e
            on e.tenant_id = $1
           and lower(e.code::text) = lower(r.normalized_payload->>'entityCode')
           and e.deleted_at is null
          left join org.departments d
            on d.tenant_id = $1
           and d.entity_id = e.id
           and lower(d.name) = lower(r.normalized_payload->>'departmentName')
           and d.deleted_at is null
          left join catalog.reference_values nowv
            on nowv.tenant_id = $1
           and lower(nowv.label) = lower(r.normalized_payload->>'natureOfWork')
           and nowv.deleted_at is null
           and nowv.category_id = (select id from catalog.reference_categories where code = 'nature_of_work')
          where r.import_job_id = $2
            and r.status = 'accepted'
          returning
            tenant_id, id, source_case_id, entity_id, department_id, owner_user_id,
            nature_of_work_id, tender_description, awarded_vendors, rc_po_amount, rc_po_award_date,
            rc_po_validity_date, tentative_tendering_date, tender_floated_or_not_required
        )
        insert into reporting.contract_expiry_facts (
          tenant_id, rc_po_plan_id, case_id, entity_id, department_id,
          owner_user_id, budget_type_id, nature_of_work_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
          tentative_tendering_date, tender_floated_or_not_required,
          source_deleted_at, source_type, updated_at
        )
        select
          tenant_id, id, source_case_id, entity_id, department_id,
          owner_user_id, null::uuid, nature_of_work_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date,
          rc_po_validity_date, tentative_tendering_date,
          tender_floated_or_not_required, null::timestamptz, 'manual_plan',
          now()
        from inserted
        where rc_po_validity_date is not null
      `,
      [input.tenantId, input.importJobId, input.committedBy],
      client,
    );
  }

  private async commitOldContractRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        with inserted as (
          insert into procurement.rc_po_plans (
          tenant_id, entity_id, department_id, owner_user_id, nature_of_work_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
          tentative_tendering_date,
          uploaded_by, uploaded_at, created_by, updated_by
          )
          select
            $1,
            e.id,
            d.id,
            u.id,
            nowv.id,
            r.normalized_payload->>'tenderDescription',
            r.normalized_payload->>'awardedVendors',
            nullif(r.normalized_payload->>'rcPoAmount', '')::numeric,
            nullif(r.normalized_payload->>'rcPoAwardDate', '')::date,
            nullif(r.normalized_payload->>'rcPoValidityDate', '')::date,
            nullif(r.normalized_payload->>'rcPoAwardDate', '')::date + 150,
            $3,
            now(),
            $3,
            $3
          from ops.import_job_rows r
          join org.entities e
            on e.tenant_id = $1
           and lower(e.code::text) = lower(r.normalized_payload->>'entityCode')
           and e.deleted_at is null
          left join org.departments d
            on d.tenant_id = $1
           and d.entity_id = e.id
           and lower(d.name) = lower(r.normalized_payload->>'departmentName')
           and d.deleted_at is null
          left join iam.users u
            on u.tenant_id = $1
           and (lower(u.username) = lower(r.normalized_payload->>'ownerUsername') or lower(u.email) = lower(r.normalized_payload->>'ownerUsername'))
           and u.deleted_at is null
          left join catalog.reference_values nowv
            on nowv.tenant_id = $1
           and lower(nowv.label) = lower(r.normalized_payload->>'natureOfWork')
           and nowv.deleted_at is null
           and nowv.category_id = (select id from catalog.reference_categories where code = 'nature_of_work')
          where r.import_job_id = $2
            and r.status = 'accepted'
            and coalesce(r.normalized_payload->>'importAction', '') <> 'existing'
          returning
            tenant_id, id, source_case_id, entity_id, department_id, owner_user_id,
            nature_of_work_id, tender_description, awarded_vendors, rc_po_amount, rc_po_award_date,
            rc_po_validity_date, tentative_tendering_date, tender_floated_or_not_required
        )
        insert into reporting.contract_expiry_facts (
          tenant_id, rc_po_plan_id, case_id, entity_id, department_id,
          owner_user_id, budget_type_id, nature_of_work_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date, rc_po_validity_date,
          tentative_tendering_date, tender_floated_or_not_required,
          source_deleted_at, source_type, updated_at
        )
        select
          tenant_id, id, source_case_id, entity_id, department_id,
          owner_user_id, null::uuid, nature_of_work_id, tender_description,
          awarded_vendors, rc_po_amount, rc_po_award_date,
          rc_po_validity_date, tentative_tendering_date,
          tender_floated_or_not_required, null::timestamptz, 'manual_plan',
          now()
        from inserted
        where rc_po_validity_date is not null
      `,
      [input.tenantId, input.importJobId, input.committedBy],
      client,
    );
  }

  private async commitUserDepartmentRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        with normalized as (
          select
            min(trim(r.normalized_payload->>'entityCode')) as entity_value,
            lower(trim(r.normalized_payload->>'entityCode')) as entity_key,
            min(trim(r.normalized_payload->>'departmentName')) as department_name,
            lower(trim(r.normalized_payload->>'departmentName')) as department_key
          from ops.import_job_rows r
          where r.import_job_id = $2
            and r.status = 'accepted'
            and nullif(trim(r.normalized_payload->>'entityCode'), '') is not null
            and nullif(trim(r.normalized_payload->>'departmentName'), '') is not null
          group by
            lower(trim(r.normalized_payload->>'entityCode')),
            lower(trim(r.normalized_payload->>'departmentName'))
        ),
        entity_values as (
          select min(entity_value) as entity_value, entity_key
          from normalized
          group by entity_key
        ),
        existing_entities as (
          select distinct on (ev.entity_key) e.id, ev.entity_value, ev.entity_key
          from entity_values ev
          join org.entities e
            on e.tenant_id = $1
           and e.deleted_at is null
           and (
             lower(e.code::text) = lower(ev.entity_value)
             or lower(e.name) = lower(ev.entity_value)
           )
          order by ev.entity_key, case when lower(e.code::text) = ev.entity_key then 0 else 1 end
        ),
        updated_existing_entities as (
          update org.entities e
          set is_active = true,
              updated_at = now(),
              updated_by = $3
          from existing_entities ee
          where e.id = ee.id
            and e.tenant_id = $1
            and e.deleted_at is null
          returning e.id, ee.entity_key
        ),
        inserted_entities as (
          insert into org.entities (tenant_id, code, name, created_by, updated_by)
          select
            $1,
            upper(ev.entity_value),
            ev.entity_value,
            $3,
            $3
          from entity_values ev
          where not exists (
            select 1
            from existing_entities ee
            where ee.entity_key = ev.entity_key
          )
          on conflict (tenant_id, code) where deleted_at is null
          do update set
            is_active = true,
            updated_at = now(),
            updated_by = $3::uuid
          returning id, lower(code::text) as entity_key
        ),
        effective_entities as (
          select id, entity_key from updated_existing_entities
          union all
          select id, entity_key from inserted_entities
        )
        insert into org.departments (tenant_id, entity_id, name, created_by, updated_by)
        select
          $1,
          e.id,
          n.department_name,
          $3,
          $3
        from normalized n
        join effective_entities e
          on e.entity_key = n.entity_key
        on conflict (tenant_id, entity_id, lower(name)) where deleted_at is null
        do update set
          is_active = true,
          name = excluded.name,
          updated_at = now(),
          updated_by = $3
      `,
      [input.tenantId, input.importJobId, input.committedBy],
      client,
    );
  }

  private async commitPortalUserRows(
    input: {
      committedBy: string;
      importJobId: string;
      portalUserCredentials?: PortalUserCredentialInput[];
      tenantId: string;
    },
    client: PoolClient,
  ): Promise<PortalUserCredentialExportRow[]> {
    const result = await this.db.query<
      QueryResultRow & {
        action: string;
        email: string;
        email_status: string;
        entity_code: string;
        full_name: string;
        generated_password: string | null;
        role: string;
        username: string;
      }
    >(
      `
        with credential_input as (
          select *
          from jsonb_to_recordset($4::jsonb) as c(
            email text,
            password text,
            "passwordHash" text
          )
        ),
        normalized as (
          select
            r.normalized_payload,
            lower(r.normalized_payload->>'mailId') as email,
            lower(coalesce(nullif(r.normalized_payload->>'username', ''), r.normalized_payload->>'mailId')) as username,
            r.normalized_payload->>'fullName' as full_name,
            r.normalized_payload->>'contactNo' as contact_no,
            r.normalized_payload->>'entityCode' as entity_code,
            coalesce(r.normalized_payload->'entityIds', '[]'::jsonb) as entity_ids,
            r.normalized_payload->>'accessLevelRequired' as access_level,
            case
              when coalesce(r.normalized_payload->>'dataAccessLevel', '') in ('GROUP', 'ENTITY', 'USER')
                then r.normalized_payload->>'dataAccessLevel'
              when lower(r.normalized_payload->>'accessLevelRequired') in ('group', 'group manager', 'group_manager', 'administration manager', 'administration_manager', 'group viewer', 'group_viewer', 'tenant admin', 'tenant_admin', 'report viewer', 'report_viewer') then 'GROUP'
              when lower(r.normalized_payload->>'accessLevelRequired') in ('entity', 'entity manager', 'entity_manager', 'entity viewer', 'entity_viewer') then 'ENTITY'
              else 'USER'
            end as data_access_level
          from ops.import_job_rows r
          where r.import_job_id = $2
            and r.status = 'accepted'
        ),
        upserted_users as (
          insert into iam.users (
            tenant_id, email, username, full_name, contact_no,
            access_level, password_hash, status, password_changed_at, created_by, updated_by
          )
          select
            $1,
            n.email,
            n.username,
            n.full_name,
            nullif(n.contact_no, ''),
            n.data_access_level,
            ci."passwordHash",
            case when ci."passwordHash" is null then 'pending_password_setup' else 'active' end,
            case when ci."passwordHash" is null then null else now() end,
            $3,
            $3
          from normalized n
          left join credential_input ci on lower(ci.email) = n.email
          on conflict (tenant_id, email) where deleted_at is null and tenant_id is not null
          do update set
            username = excluded.username,
            full_name = excluded.full_name,
            contact_no = excluded.contact_no,
            access_level = excluded.access_level,
            password_hash = coalesce(excluded.password_hash, iam.users.password_hash),
            status = case when excluded.password_hash is null then iam.users.status else 'active' end,
            failed_login_count = case when excluded.password_hash is null then iam.users.failed_login_count else 0 end,
            locked_until = case when excluded.password_hash is null then iam.users.locked_until else null end,
            password_changed_at = case when excluded.password_hash is null then iam.users.password_changed_at else now() end,
            updated_at = now(),
            updated_by = $3
          returning id, email, username, full_name, xmax = 0 as inserted
        )
        select
          case when u.inserted then 'create' else 'update' end as action,
          u.email,
          n.entity_code,
          u.full_name,
          ci.password as generated_password,
          n.access_level as role,
          u.username,
          'not_sent' as email_status
        from normalized n
        join upserted_users u on u.email = n.email
        left join credential_input ci on lower(ci.email) = n.email
        order by u.email
      `,
      [
        input.tenantId,
        input.importJobId,
        input.committedBy,
        JSON.stringify(input.portalUserCredentials ?? []),
      ],
      client,
    );
    await this.replacePortalUserEntityScopes(input, client);
    await this.replacePortalUserRoles(input, client);
    return result.rows.map((row) => ({
      action: row.action,
      email: row.email,
      emailStatus: row.email_status,
      entityCode: row.entity_code,
      fullName: row.full_name,
      password: row.generated_password ?? "",
      role: row.role,
      username: row.username,
    }));
  }

  private async replacePortalUserEntityScopes(
    input: {
      committedBy: string;
      importJobId: string;
      tenantId: string;
    },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        with imported_users as (
          select u.id
          from ops.import_job_rows r
          join iam.users u
            on u.tenant_id = $1
           and u.deleted_at is null
           and lower(u.email::text) = lower(r.normalized_payload->>'mailId')
          where r.import_job_id = $2
            and r.status = 'accepted'
        )
        delete from iam.user_entity_scopes s
        using imported_users u
        where s.user_id = u.id
      `,
      [input.tenantId, input.importJobId],
      client,
    );

    await this.db.query(
      `
        insert into iam.user_entity_scopes (user_id, entity_id, assigned_by)
        select distinct u.id, entity_ids.entity_id::uuid, $3::uuid
        from ops.import_job_rows r
        join iam.users u
          on u.tenant_id = $1
         and u.deleted_at is null
         and lower(u.email::text) = lower(r.normalized_payload->>'mailId')
        cross join lateral jsonb_array_elements_text(
          coalesce(r.normalized_payload->'entityIds', '[]'::jsonb)
        ) as entity_ids(entity_id)
        join org.entities e
          on e.id = entity_ids.entity_id::uuid
         and e.tenant_id = $1
         and e.deleted_at is null
        where r.import_job_id = $2
          and r.status = 'accepted'
        on conflict (user_id, entity_id) do nothing
      `,
      [input.tenantId, input.importJobId, input.committedBy],
      client,
    );
  }

  private async replacePortalUserRoles(
    input: {
      committedBy: string;
      importJobId: string;
      tenantId: string;
    },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        with imported_users as (
          select u.id
          from ops.import_job_rows r
          join iam.users u
            on u.tenant_id = $1
           and u.deleted_at is null
           and lower(u.email::text) = lower(r.normalized_payload->>'mailId')
          where r.import_job_id = $2
            and r.status = 'accepted'
        )
        delete from iam.user_roles ur
        using imported_users u
        where ur.user_id = u.id
      `,
      [input.tenantId, input.importJobId],
      client,
    );

    await this.db.query(
      `
        insert into iam.user_roles (user_id, role_id, assigned_by)
        select distinct u.id, role_match.id, $3::uuid
        from ops.import_job_rows r
        join iam.users u
          on u.tenant_id = $1
         and u.deleted_at is null
         and lower(u.email::text) = lower(r.normalized_payload->>'mailId')
        join lateral (
          select role.id
          from iam.roles role
          where (role.tenant_id = $1 or role.tenant_id is null)
            and role.deleted_at is null
            and role.code <> 'platform_super_admin'
            and (
              lower(role.name) = lower(r.normalized_payload->>'accessLevelRequired')
              or lower(role.code::text) = lower(r.normalized_payload->>'accessLevelRequired')
            )
          order by case when role.tenant_id = $1 then 0 else 1 end
          limit 1
        ) role_match on true
        where r.import_job_id = $2
          and r.status = 'accepted'
        on conflict (user_id, role_id) do nothing
      `,
      [input.tenantId, input.importJobId, input.committedBy],
      client,
    );
  }

  private async commitTenderCaseRows(
    input: { committedBy: string; importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        with normalized as (
          select
            r.normalized_payload,
            r.normalized_payload->>'prId' as pr_id,
            r.normalized_payload->>'prSchemeNo' as pr_scheme_no,
            r.normalized_payload->>'entityCode' as entity_code,
            r.normalized_payload->>'departmentName' as department_name,
            r.normalized_payload->>'tenderType' as tender_type,
            r.normalized_payload->>'prReceivingMedium' as pr_receiving_medium,
            r.normalized_payload->>'budgetType' as budget_type,
            r.normalized_payload->>'natureOfWork' as nature_of_work,
            r.normalized_payload->>'ownerUsername' as owner_username,
            r.normalized_payload->>'prDescription' as pr_description,
            r.normalized_payload->>'prRemarks' as pr_remarks,
            r.normalized_payload->>'tenderName' as tender_name,
            r.normalized_payload->>'tenderNo' as tender_no,
            nullif(r.normalized_payload->>'prReceiptDate', '')::date as pr_receipt_date,
            nullif(r.normalized_payload->>'tentativeCompletionDate', '')::date as tentative_completion_date,
            coalesce((r.normalized_payload->>'priorityCase')::boolean, false) as priority_case,
            case when r.normalized_payload ? 'cpcInvolved' then (r.normalized_payload->>'cpcInvolved')::boolean else null end as cpc_involved,
            nullif(r.normalized_payload->>'prValue', '')::numeric as pr_value,
            nullif(r.normalized_payload->>'estimateBenchmark', '')::numeric as estimate_benchmark,
            nullif(r.normalized_payload->>'approvedAmount', '')::numeric as approved_amount,
            nullif(r.normalized_payload->>'nitInitiationDate', '')::date as nit_initiation_date,
            nullif(r.normalized_payload->>'nitApprovalDate', '')::date as nit_approval_date,
            nullif(r.normalized_payload->>'nitPublishDate', '')::date as nit_publish_date,
            nullif(r.normalized_payload->>'bidReceiptDate', '')::date as bid_receipt_date,
            nullif(r.normalized_payload->>'biddersParticipated', '')::integer as bidders_participated,
            nullif(r.normalized_payload->>'commercialEvaluationDate', '')::date as commercial_evaluation_date,
            nullif(r.normalized_payload->>'technicalEvaluationDate', '')::date as technical_evaluation_date,
            nullif(r.normalized_payload->>'qualifiedBidders', '')::integer as qualified_bidders,
            nullif(r.normalized_payload->>'nfaSubmissionDate', '')::date as nfa_submission_date,
            nullif(r.normalized_payload->>'nfaApprovalDate', '')::date as nfa_approval_date,
            coalesce((r.normalized_payload->>'loiIssued')::boolean, false) as loi_issued,
            nullif(r.normalized_payload->>'loiIssuedDate', '')::date as loi_issued_date,
            nullif(r.normalized_payload->>'rcPoAwardDate', '')::date as rc_po_award_date,
            nullif(r.normalized_payload->>'rcPoValidityDate', '')::date as rc_po_validity
          from ops.import_job_rows r
          where r.import_job_id = $2
            and r.status = 'accepted'
        ),
        resolved as (
          select
            n.*,
            e.id as entity_id,
            d.id as department_id,
            tt.id as tender_type_id,
            prm.id as pr_receiving_medium_id,
            btv.id as budget_type_id,
            nowv.id as nature_of_work_id,
            u.id as owner_user_id,
            case
              when n.rc_po_award_date is not null then 8
              when n.nfa_approval_date is not null then 7
              when n.nfa_submission_date is not null then 6
              when n.commercial_evaluation_date is not null and n.technical_evaluation_date is not null then 5
              when n.bid_receipt_date is not null then 4
              when n.nit_publish_date is not null then 3
              when n.nit_approval_date is not null then 2
              when n.nit_initiation_date is not null then 1
              else 0
            end as stage_code
          from normalized n
          join org.entities e
            on e.tenant_id = $1
           and lower(e.code::text) = lower(n.entity_code)
           and e.deleted_at is null
          left join org.departments d
            on d.tenant_id = $1
           and d.entity_id = e.id
           and lower(d.name) = lower(n.department_name)
           and d.deleted_at is null
          left join catalog.tender_types tt
            on tt.tenant_id = $1
           and lower(tt.name) = lower(n.tender_type)
           and tt.deleted_at is null
          left join catalog.reference_values prm
            on prm.tenant_id = $1
           and lower(prm.label) = lower(n.pr_receiving_medium)
           and prm.deleted_at is null
           and prm.category_id = (select id from catalog.reference_categories where code = 'pr_receiving_medium')
          left join catalog.reference_values btv
            on btv.tenant_id = $1
           and lower(btv.label) = lower(n.budget_type)
           and btv.deleted_at is null
           and btv.category_id = (select id from catalog.reference_categories where code = 'budget_type')
          left join catalog.reference_values nowv
            on nowv.tenant_id = $1
           and lower(nowv.label) = lower(n.nature_of_work)
           and nowv.deleted_at is null
           and nowv.category_id = (select id from catalog.reference_categories where code = 'nature_of_work')
          left join iam.users u
            on u.tenant_id = $1
           and (lower(u.username) = lower(n.owner_username) or lower(u.email) = lower(n.owner_username))
           and u.deleted_at is null
        ),
        upserted as (
          insert into procurement.cases (
            tenant_id, pr_id, entity_id, department_id, tender_type_id,
            pr_receiving_medium_id, budget_type_id, nature_of_work_id, owner_user_id,
            created_by, updated_by, status, stage_code, desired_stage_code,
            is_delayed, priority_case, cpc_involved, pr_scheme_no,
            pr_receipt_date, pr_description, pr_remarks, tender_name, tender_no,
            tentative_completion_date
          )
          select
            $1, r.pr_id, r.entity_id, r.department_id, r.tender_type_id,
            r.pr_receiving_medium_id, r.budget_type_id, r.nature_of_work_id, r.owner_user_id,
            $3, $3,
            case when r.rc_po_award_date is not null then 'completed' else 'running' end,
            r.stage_code,
            null,
            false,
            r.priority_case,
            r.cpc_involved,
            r.pr_scheme_no,
            r.pr_receipt_date,
            r.pr_description,
            r.pr_remarks,
            r.tender_name,
            r.tender_no,
            r.tentative_completion_date
          from resolved r
          on conflict (tenant_id, pr_id) where deleted_at is null
          do update set
            entity_id = excluded.entity_id,
            department_id = excluded.department_id,
            tender_type_id = excluded.tender_type_id,
            pr_receiving_medium_id = excluded.pr_receiving_medium_id,
            budget_type_id = excluded.budget_type_id,
            nature_of_work_id = excluded.nature_of_work_id,
            owner_user_id = excluded.owner_user_id,
            status = excluded.status,
            stage_code = excluded.stage_code,
            desired_stage_code = excluded.desired_stage_code,
            is_delayed = excluded.is_delayed,
            priority_case = excluded.priority_case,
            cpc_involved = excluded.cpc_involved,
            pr_scheme_no = excluded.pr_scheme_no,
            pr_receipt_date = excluded.pr_receipt_date,
            pr_description = excluded.pr_description,
            pr_remarks = excluded.pr_remarks,
            tender_name = excluded.tender_name,
            tender_no = excluded.tender_no,
            tentative_completion_date = excluded.tentative_completion_date,
            version = procurement.cases.version + 1,
            updated_at = now(),
            updated_by = $3
          returning id, pr_id
        )
        insert into procurement.case_financials (
          case_id, tenant_id, pr_value, estimate_benchmark, approved_amount, savings_wrt_pr, savings_wrt_estimate, updated_at
        )
        select
          u.id,
          $1,
          r.pr_value,
          r.estimate_benchmark,
          r.approved_amount,
          case
            when r.pr_value is null or r.approved_amount is null then null
            else r.pr_value - r.approved_amount
          end,
          case
            when r.estimate_benchmark is null or r.approved_amount is null then null
            else r.estimate_benchmark - r.approved_amount
          end,
          now()
        from upserted u
        join resolved r on r.pr_id = u.pr_id
        on conflict (case_id) do update set
          pr_value = excluded.pr_value,
          estimate_benchmark = excluded.estimate_benchmark,
          approved_amount = excluded.approved_amount,
          savings_wrt_pr = excluded.savings_wrt_pr,
          savings_wrt_estimate = excluded.savings_wrt_estimate,
          updated_at = now()
      `,
      [input.tenantId, input.importJobId, input.committedBy],
      client,
    );

    await this.db.query(
      `
        with normalized as (
          select
            r.normalized_payload->>'prId' as pr_id,
            nullif(r.normalized_payload->>'nitInitiationDate', '')::date as nit_initiation_date,
            nullif(r.normalized_payload->>'nitApprovalDate', '')::date as nit_approval_date,
            nullif(r.normalized_payload->>'nitPublishDate', '')::date as nit_publish_date,
            nullif(r.normalized_payload->>'bidReceiptDate', '')::date as bid_receipt_date,
            nullif(r.normalized_payload->>'biddersParticipated', '')::integer as bidders_participated,
            nullif(r.normalized_payload->>'commercialEvaluationDate', '')::date as commercial_evaluation_date,
            nullif(r.normalized_payload->>'technicalEvaluationDate', '')::date as technical_evaluation_date,
            nullif(r.normalized_payload->>'qualifiedBidders', '')::integer as qualified_bidders,
            coalesce((r.normalized_payload->>'loiIssued')::boolean, false) as loi_issued,
            nullif(r.normalized_payload->>'loiIssuedDate', '')::date as loi_issued_date,
            nullif(r.normalized_payload->>'rcPoAwardDate', '')::date as rc_po_award_date,
            nullif(r.normalized_payload->>'rcPoValidityDate', '')::date as rc_po_validity
          from ops.import_job_rows r
          where r.import_job_id = $2
            and r.status = 'accepted'
        )
        insert into procurement.case_milestones (
          case_id, tenant_id, nit_initiation_date, nit_approval_date, nit_publish_date,
          bid_receipt_date, bidders_participated, commercial_evaluation_date,
          technical_evaluation_date, qualified_bidders, nfa_submission_date,
          nfa_approval_date, loi_issued, loi_issued_date, rc_po_award_date,
          rc_po_validity, updated_at
        )
        select
          c.id, $1, n.nit_initiation_date, n.nit_approval_date, n.nit_publish_date,
          n.bid_receipt_date, n.bidders_participated, n.commercial_evaluation_date,
          n.technical_evaluation_date, n.qualified_bidders,
          nullif(r.normalized_payload->>'nfaSubmissionDate', '')::date,
          nullif(r.normalized_payload->>'nfaApprovalDate', '')::date,
          n.loi_issued, n.loi_issued_date, n.rc_po_award_date, n.rc_po_validity, now()
        from normalized n
        join ops.import_job_rows r on r.import_job_id = $2 and r.normalized_payload->>'prId' = n.pr_id
        join procurement.cases c on c.tenant_id = $1 and c.pr_id = n.pr_id and c.deleted_at is null
        on conflict (case_id) do update set
          nit_initiation_date = excluded.nit_initiation_date,
          nit_approval_date = excluded.nit_approval_date,
          nit_publish_date = excluded.nit_publish_date,
          bid_receipt_date = excluded.bid_receipt_date,
          bidders_participated = excluded.bidders_participated,
          commercial_evaluation_date = excluded.commercial_evaluation_date,
          technical_evaluation_date = excluded.technical_evaluation_date,
          qualified_bidders = excluded.qualified_bidders,
          nfa_submission_date = excluded.nfa_submission_date,
          nfa_approval_date = excluded.nfa_approval_date,
          loi_issued = excluded.loi_issued,
          loi_issued_date = excluded.loi_issued_date,
          rc_po_award_date = excluded.rc_po_award_date,
          rc_po_validity = excluded.rc_po_validity,
          updated_at = now()
      `,
      [input.tenantId, input.importJobId],
      client,
    );

    await this.refreshTenderCaseFactsForImport(input, client);
  }

  private async refreshTenderCaseFactsForImport(
    input: { importJobId: string; tenantId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
      `
        insert into reporting.case_facts (
          case_id, tenant_id, entity_id, department_id, owner_user_id,
          tender_type_id, status, stage_code, desired_stage_code, is_delayed,
          priority_case, cpc_involved, pr_receipt_date, rc_po_award_date,
          completion_fy, value_slab, rc_po_value_slab, running_age_days,
          completed_age_days, current_stage_aging_days, pr_value,
          estimate_benchmark, approved_amount, total_awarded_amount,
          savings_wrt_pr, savings_wrt_estimate, updated_at
        )
        select
          c.id,
          c.tenant_id,
          c.entity_id,
          c.department_id,
          c.owner_user_id,
          c.tender_type_id,
          c.status,
          c.stage_code,
          c.desired_stage_code,
          case
            when c.status = 'running'
              and c.tentative_completion_date is not null
              and c.tentative_completion_date < current_date
            then true
            else false
          end,
          c.priority_case,
          c.cpc_involved,
          c.pr_receipt_date,
          m.rc_po_award_date,
          case
            when m.rc_po_award_date is null then null
            when extract(month from m.rc_po_award_date) >= 4
              then extract(year from m.rc_po_award_date)::int || '-' || (extract(year from m.rc_po_award_date)::int + 1)
            else (extract(year from m.rc_po_award_date)::int - 1) || '-' || extract(year from m.rc_po_award_date)::int
          end,
          case
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) is null then null
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 200000 then 'lt_2l'
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 500000 then '2l_5l'
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 1000000 then '5l_10l'
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 2500000 then '10l_25l'
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 5000000 then '25l_50l'
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 10000000 then '50l_100l'
            when (case when c.status = 'completed' then f.approved_amount else f.pr_value end) < 20000000 then '100l_200l'
            else 'gte_200l'
          end,
          case
            when f.total_awarded_amount is null then null
            when f.total_awarded_amount < 200000 then 'lt_2l'
            when f.total_awarded_amount < 500000 then '2l_5l'
            when f.total_awarded_amount < 1000000 then '5l_10l'
            when f.total_awarded_amount < 2500000 then '10l_25l'
            when f.total_awarded_amount < 5000000 then '25l_50l'
            when f.total_awarded_amount < 10000000 then '50l_100l'
            when f.total_awarded_amount < 20000000 then '100l_200l'
            else 'gte_200l'
          end,
          case
            when c.status = 'running' and c.pr_receipt_date is not null
              then current_date - c.pr_receipt_date
            else null
          end,
          case
            when c.status = 'completed' and c.pr_receipt_date is not null and m.rc_po_award_date is not null
              then m.rc_po_award_date - c.pr_receipt_date
            else null
          end,
          case
            when c.pr_receipt_date is not null then current_date - c.pr_receipt_date
            else null
          end,
          f.pr_value,
          f.estimate_benchmark,
          f.approved_amount,
          f.total_awarded_amount,
          case
            when f.pr_value is null or f.approved_amount is null then null
            else f.pr_value - f.approved_amount
          end,
          case
            when f.estimate_benchmark is null or f.approved_amount is null then null
            else f.estimate_benchmark - f.approved_amount
          end,
          now()
        from ops.import_job_rows r
        join procurement.cases c
          on c.tenant_id = $1
         and c.pr_id = r.normalized_payload->>'prId'
         and c.deleted_at is null
        left join procurement.case_financials f on f.case_id = c.id
        left join procurement.case_milestones m on m.case_id = c.id
        where r.import_job_id = $2
          and r.status = 'accepted'
        on conflict (case_id) do update
        set entity_id = excluded.entity_id,
            department_id = excluded.department_id,
            owner_user_id = excluded.owner_user_id,
            tender_type_id = excluded.tender_type_id,
            status = excluded.status,
            stage_code = excluded.stage_code,
            desired_stage_code = excluded.desired_stage_code,
            is_delayed = excluded.is_delayed,
            priority_case = excluded.priority_case,
            cpc_involved = excluded.cpc_involved,
            pr_receipt_date = excluded.pr_receipt_date,
            rc_po_award_date = excluded.rc_po_award_date,
            completion_fy = excluded.completion_fy,
            value_slab = excluded.value_slab,
            rc_po_value_slab = excluded.rc_po_value_slab,
            running_age_days = excluded.running_age_days,
            completed_age_days = excluded.completed_age_days,
            current_stage_aging_days = excluded.current_stage_aging_days,
            pr_value = excluded.pr_value,
            estimate_benchmark = excluded.estimate_benchmark,
            approved_amount = excluded.approved_amount,
            total_awarded_amount = excluded.total_awarded_amount,
            savings_wrt_pr = excluded.savings_wrt_pr,
            savings_wrt_estimate = excluded.savings_wrt_estimate,
            updated_at = now()
      `,
      [input.tenantId, input.importJobId],
      client,
    );
  }

  private async insertImportRow(
    importJobId: string,
    rowNumber: number,
    row: {
      errors?: unknown[];
      normalizedPayload?: Record<string, unknown> | null;
      sourcePayload: Record<string, unknown>;
      status: "accepted" | "rejected" | "staged";
    },
    client: PoolClient,
  ): Promise<void> {
    await this.db.query(
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
        JSON.stringify(row.errors ?? []),
      ],
      client,
    );
  }

  private mapImportJob(row: ImportJobRowSql): ImportJob {
    return {
      acceptedRows: row.accepted_rows,
      credentialExportAvailable: row.credential_export_available === true,
      credentialExportExpiresAt: toIsoString(row.credential_export_expires_at),
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      id: row.id,
      importType: row.import_type,
      progressMessage: row.progress_message,
      progressPercent: row.progress_percent,
      rejectedRows: row.rejected_rows,
      stagedUnknownEntities: row.staged_unknown_entities,
      stagedUnknownUsers: row.staged_unknown_users,
      status: row.status,
      totalRows: row.total_rows,
    };
  }

  private mapFileAsset(row: FileAssetRowSql): FileAsset {
    return {
      byteSize: row.byte_size == null ? null : Number(row.byte_size),
      checksumSha256: row.checksum_sha256,
      contentType: row.content_type,
      id: row.id,
      originalFilename: row.original_filename,
      purpose: row.purpose,
      storageKey: row.storage_key,
    };
  }
}

type FileAssetRowSql = {
  byte_size: string | number | null;
  checksum_sha256: string | null;
  content_type: string | null;
  id: string;
  original_filename: string | null;
  purpose: string;
  storage_key: string;
};

type ImportJobRowSql = {
  accepted_rows: number;
  credential_export_available: boolean;
  credential_export_expires_at: Date | string | null;
  created_at: Date | string;
  id: string;
  import_type: string;
  progress_message: string | null;
  progress_percent: number;
  rejected_rows: number;
  staged_unknown_entities: number;
  staged_unknown_users: number;
  status: string;
  total_rows: number;
};

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type ImportJobRowRowSql = {
  errors: unknown[];
  id: string;
  normalized_payload: Record<string, unknown> | null;
  row_number: number;
  source_payload: Record<string, unknown>;
  status: "accepted" | "rejected" | "staged";
};
