import { BadRequestException, Injectable } from "@nestjs/common";

import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { OrganizationRepository } from "../infrastructure/organization.repository.js";

@Injectable()
export class OrganizationService {
  constructor(private readonly organization: OrganizationRepository) {}

  listEntities(actor: AuthenticatedUser) {
    return this.organization.listEntities(this.requireTenant(actor));
  }

  createEntity(actor: AuthenticatedUser, input: { code: string; departments?: string[] | undefined; name: string }) {
    return this.organization.createEntity({
      tenantId: this.requireTenant(actor),
      code: input.code,
      departments: input.departments ?? [],
      name: input.name,
      createdBy: actor.id,
    });
  }

  updateEntity(
    actor: AuthenticatedUser,
    input: { entityId: string; code: string; departments?: string[] | undefined; name: string; isActive: boolean },
  ) {
    return this.organization.updateEntity({
      tenantId: this.requireTenant(actor),
      entityId: input.entityId,
      code: input.code,
      departments: input.departments,
      name: input.name,
      isActive: input.isActive,
      updatedBy: actor.id,
    });
  }

  async deleteEntity(actor: AuthenticatedUser, entityId: string) {
    const tenantId = this.requireTenant(actor);
    const tenderCount = await this.organization.countEntityTenders(tenantId, entityId);
    if (tenderCount > 0) {
      throw new BadRequestException("Entity cannot be deleted while active tenders reference it.");
    }
    return this.organization.deleteEntity({
      tenantId,
      entityId,
      deletedBy: actor.id,
    });
  }

  listDepartments(actor: AuthenticatedUser, entityId: string) {
    return this.organization.listDepartments(this.requireTenant(actor), entityId);
  }

  createDepartment(actor: AuthenticatedUser, input: { entityId: string; name: string }) {
    return this.organization.createDepartment({
      tenantId: this.requireTenant(actor),
      entityId: input.entityId,
      name: input.name,
      createdBy: actor.id,
    });
  }

  updateDepartment(
    actor: AuthenticatedUser,
    input: { departmentId: string; name: string; isActive: boolean },
  ) {
    return this.organization.updateDepartment({
      tenantId: this.requireTenant(actor),
      departmentId: input.departmentId,
      name: input.name,
      isActive: input.isActive,
      updatedBy: actor.id,
    });
  }

  async deleteDepartment(actor: AuthenticatedUser, departmentId: string) {
    const tenantId = this.requireTenant(actor);
    const tenderCount = await this.organization.countDepartmentTenders(tenantId, departmentId);
    if (tenderCount > 0) {
      throw new BadRequestException("Department cannot be deleted while active tenders reference it.");
    }
    return this.organization.deleteDepartment({
      tenantId,
      departmentId,
      deletedBy: actor.id,
    });
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }
}
