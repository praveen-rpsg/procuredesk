import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../../database/database.service.js";

export type EntityRecord = {
  id: string;
  code: string;
  name: string;
  departmentCount: number;
  departments: string[];
  isActive: boolean;
  tenderCount: number;
};

export type DepartmentRecord = {
  id: string;
  entityId: string;
  name: string;
  isActive: boolean;
  tenderCount: number;
};

@Injectable()
export class OrganizationRepository {
  constructor(private readonly db: DatabaseService) {}

  async listEntities(tenantId: string): Promise<EntityRecord[]> {
    const result = await this.db.query<
      QueryResultRow & {
        code: string;
        department_count: number;
        departments: string[];
        id: string;
        is_active: boolean;
        name: string;
        tender_count: number;
      }
    >(
      `
        with department_summary as (
          select
            entity_id,
            count(*)::int as department_count,
            coalesce(array_agg(name order by name), array[]::text[]) as departments
          from org.departments
          where tenant_id = $1
            and deleted_at is null
            and is_active = true
          group by entity_id
        ),
        tender_summary as (
          select entity_id, count(*)::int as tender_count
          from procurement.cases
          where tenant_id = $1
            and deleted_at is null
          group by entity_id
        )
        select
          e.id,
          e.code::text as code,
          e.name,
          e.is_active,
          coalesce(ds.department_count, 0)::int as department_count,
          coalesce(ds.departments, array[]::text[]) as departments,
          coalesce(ts.tender_count, 0)::int as tender_count
        from org.entities e
        left join department_summary ds on ds.entity_id = e.id
        left join tender_summary ts on ts.entity_id = e.id
        where e.tenant_id = $1
          and e.deleted_at is null
        order by e.code asc
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      departmentCount: row.department_count,
      departments: row.departments,
      isActive: row.is_active,
      tenderCount: row.tender_count,
    }));
  }

  async createEntity(input: {
    tenantId: string;
    code: string;
    departments: string[];
    name: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    return this.db.transaction(async (client) => {
      const row = await this.db.one<QueryResultRow & { id: string }>(
        `
          insert into org.entities (tenant_id, code, name, created_by, updated_by)
          values ($1, $2, $3, $4, $4)
          returning id
        `,
        [input.tenantId, input.code.toUpperCase(), input.name, input.createdBy],
        client,
      );
      if (!row) {
        throw new Error("Failed to create entity.");
      }
      await this.replaceEntityDepartments({
        actorId: input.createdBy,
        departmentNames: input.departments,
        entityId: row.id,
        tenantId: input.tenantId,
      });
      return { id: row.id };
    });
  }

  async updateEntity(input: {
    tenantId: string;
    entityId: string;
    code: string;
    departments?: string[] | undefined;
    name: string;
    isActive: boolean;
    updatedBy: string;
  }): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.query(
        `
          update org.entities
          set code = $3,
              name = $4,
              is_active = $5,
              updated_at = now(),
              updated_by = $6
          where tenant_id = $1
            and id = $2
            and deleted_at is null
        `,
        [
          input.tenantId,
          input.entityId,
          input.code.toUpperCase(),
          input.name,
          input.isActive,
          input.updatedBy,
        ],
      );

      if (input.departments) {
        await this.replaceEntityDepartments({
          actorId: input.updatedBy,
          departmentNames: input.departments,
          entityId: input.entityId,
          tenantId: input.tenantId,
        });
      }
    });
  }

  async countEntityTenders(tenantId: string, entityId: string): Promise<number> {
    const row = await this.db.one<QueryResultRow & { tender_count: number }>(
      `
        select count(*)::int as tender_count
        from procurement.cases
        where tenant_id = $1
          and entity_id = $2
          and deleted_at is null
      `,
      [tenantId, entityId],
    );
    return row?.tender_count ?? 0;
  }

  async deleteEntity(input: {
    tenantId: string;
    entityId: string;
    deletedBy: string;
  }): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.query(
        `
          update org.entities
          set is_active = false,
              deleted_at = now(),
              deleted_by = $3,
              updated_at = now(),
              updated_by = $3
          where tenant_id = $1
            and id = $2
            and deleted_at is null
        `,
        [input.tenantId, input.entityId, input.deletedBy],
      );

      await this.db.query(
        `
          update org.departments
          set is_active = false,
              deleted_at = now(),
              deleted_by = $3,
              updated_at = now(),
              updated_by = $3
          where tenant_id = $1
            and entity_id = $2
            and deleted_at is null
        `,
        [input.tenantId, input.entityId, input.deletedBy],
      );

      await this.db.query(
        `
          delete from iam.user_entity_scopes
          where entity_id = $1
        `,
        [input.entityId],
      );
    });
  }

  async listDepartments(tenantId: string, entityId: string): Promise<DepartmentRecord[]> {
    const result = await this.db.query<
      QueryResultRow & {
        id: string;
        entity_id: string;
        name: string;
        is_active: boolean;
        tender_count: number;
      }
    >(
      `
        with tender_summary as (
          select department_id, count(*)::int as tender_count
          from procurement.cases
          where tenant_id = $1
            and entity_id = $2
            and department_id is not null
            and deleted_at is null
          group by department_id
        )
        select
          d.id,
          d.entity_id,
          d.name,
          d.is_active,
          coalesce(ts.tender_count, 0)::int as tender_count
        from org.departments d
        left join tender_summary ts on ts.department_id = d.id
        where d.tenant_id = $1
          and d.entity_id = $2
          and d.deleted_at is null
        order by d.name asc
      `,
      [tenantId, entityId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      name: row.name,
      isActive: row.is_active,
      tenderCount: row.tender_count,
    }));
  }

  async createDepartment(input: {
    tenantId: string;
    entityId: string;
    name: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const row = await this.db.one<QueryResultRow & { id: string }>(
      `
        insert into org.departments (
          tenant_id, entity_id, name, created_by, updated_by
        )
        values ($1, $2, $3, $4, $4)
        returning id
      `,
      [input.tenantId, input.entityId, input.name, input.createdBy],
    );
    if (!row) {
      throw new Error("Failed to create department.");
    }
    return { id: row.id };
  }

  async updateDepartment(input: {
    tenantId: string;
    departmentId: string;
    name: string;
    isActive: boolean;
    updatedBy: string;
  }): Promise<void> {
    await this.db.query(
      `
        update org.departments
        set name = $3,
            is_active = $4,
            updated_at = now(),
            updated_by = $5
        where tenant_id = $1
          and id = $2
          and deleted_at is null
      `,
      [input.tenantId, input.departmentId, input.name, input.isActive, input.updatedBy],
    );
  }

  async deleteDepartment(input: {
    tenantId: string;
    departmentId: string;
    deletedBy: string;
  }): Promise<void> {
    await this.db.query(
      `
        update org.departments
        set is_active = false,
            deleted_at = now(),
            deleted_by = $3,
            updated_at = now(),
            updated_by = $3
        where tenant_id = $1
          and id = $2
          and deleted_at is null
      `,
      [input.tenantId, input.departmentId, input.deletedBy],
    );
  }

  async countDepartmentTenders(tenantId: string, departmentId: string): Promise<number> {
    const row = await this.db.one<QueryResultRow & { tender_count: number }>(
      `
        select count(*)::int as tender_count
        from procurement.cases
        where tenant_id = $1
          and department_id = $2
          and deleted_at is null
      `,
      [tenantId, departmentId],
    );
    return row?.tender_count ?? 0;
  }

  private async replaceEntityDepartments(input: {
    actorId: string;
    departmentNames: string[];
    entityId: string;
    tenantId: string;
  }): Promise<void> {
    const names = normalizeNames(input.departmentNames);
    const existing = await this.db.query<QueryResultRow & { id: string; name_key: string }>(
      `
        select id, lower(name) as name_key
        from org.departments
        where tenant_id = $1
          and entity_id = $2
          and deleted_at is null
      `,
      [input.tenantId, input.entityId],
    );
    const existingByName = new Map(existing.rows.map((row) => [row.name_key, row.id]));
    const nameKeys = names.map((name) => name.toLowerCase());

    await this.db.query(
      `
        update org.departments
        set is_active = false,
            deleted_at = now(),
            deleted_by = $3,
            updated_at = now(),
            updated_by = $3
        where tenant_id = $1
          and entity_id = $2
          and deleted_at is null
          and not (lower(name) = any($4::text[]))
      `,
      [input.tenantId, input.entityId, input.actorId, nameKeys],
    );

    for (const name of names) {
      const existingId = existingByName.get(name.toLowerCase());
      if (existingId) {
        await this.db.query(
          `
            update org.departments
            set name = $4,
                is_active = true,
                updated_at = now(),
                updated_by = $5
            where tenant_id = $1
              and entity_id = $2
              and id = $3
              and deleted_at is null
          `,
          [input.tenantId, input.entityId, existingId, name, input.actorId],
        );
        continue;
      }

      await this.db.query(
        `
          insert into org.departments (
            tenant_id, entity_id, name, created_by, updated_by
          )
          values ($1, $2, $3, $4, $4)
        `,
        [input.tenantId, input.entityId, name, input.actorId],
      );
    }
  }
}

function normalizeNames(names: string[]): string[] {
  const normalized = new Map<string, string>();
  for (const name of names) {
    const trimmedName = name.trim();
    if (trimmedName) {
      normalized.set(trimmedName.toLowerCase(), trimmedName);
    }
  }
  return [...normalized.values()];
}
