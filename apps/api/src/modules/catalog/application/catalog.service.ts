import { BadRequestException, Injectable } from "@nestjs/common";

import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { CatalogCacheService } from "../infrastructure/catalog-cache.service.js";
import {
  CatalogRepository,
  type CatalogSnapshot,
} from "../infrastructure/catalog.repository.js";

@Injectable()
export class CatalogService {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly cache: CatalogCacheService,
  ) {}

  async getCatalog(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    const cached = await this.cache.get<CatalogSnapshot>(tenantId);
    if (cached) {
      return cached;
    }
    return this.cache.set(tenantId, await this.catalog.getSnapshot(tenantId));
  }

  async createReferenceValue(
    actor: AuthenticatedUser,
    input: { categoryCode: string; label: string },
  ) {
    const tenantId = this.requireTenant(actor);
    const result = await this.catalog.createReferenceValue({
      tenantId,
      categoryCode: input.categoryCode,
      label: input.label,
      createdBy: actor.id,
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }

  async createReferenceCategory(
    actor: AuthenticatedUser,
    input: { code: string; name: string },
  ) {
    const tenantId = this.requireTenant(actor);
    const result = await this.catalog.createReferenceCategory({
      tenantId,
      code: input.code,
      name: input.name,
      createdBy: actor.id,
    });
    if (!result) {
      throw new BadRequestException(
        "A choice category with this code already exists. Use a unique lowercase code.",
      );
    }
    await this.cache.invalidateTenant(tenantId);
    return result;
  }

  async updateReferenceCategory(
    actor: AuthenticatedUser,
    input: { categoryId: string; isActive: boolean; name: string },
  ) {
    const tenantId = this.requireTenant(actor);
    const updated = await this.catalog.updateReferenceCategory({
      tenantId,
      categoryId: input.categoryId,
      name: input.name,
      isActive: input.isActive,
      updatedBy: actor.id,
    });
    if (!updated) {
      throw new BadRequestException(
        "Only tenant-created choice categories can be edited. System categories are protected.",
      );
    }
    await this.cache.invalidateTenant(tenantId);
  }

  async deleteReferenceCategory(actor: AuthenticatedUser, categoryId: string) {
    const tenantId = this.requireTenant(actor);
    const valueCount = await this.catalog.countReferenceCategoryValues({
      tenantId,
      categoryId,
    });
    if (valueCount > 0) {
      throw new BadRequestException(
        "This choice category has values. Delete or move its values before removing the category.",
      );
    }
    const deleted = await this.catalog.deleteReferenceCategory({
      deletedBy: actor.id,
      categoryId,
      tenantId,
    });
    if (!deleted) {
      throw new BadRequestException(
        "Only tenant-created choice categories can be deleted. System categories are protected.",
      );
    }
    await this.cache.invalidateTenant(tenantId);
  }

  async updateReferenceValue(
    actor: AuthenticatedUser,
    input: { referenceValueId: string; label: string; isActive: boolean },
  ) {
    const tenantId = this.requireTenant(actor);
    await this.catalog.updateReferenceValue({
      tenantId,
      referenceValueId: input.referenceValueId,
      label: input.label,
      isActive: input.isActive,
      updatedBy: actor.id,
    });
    await this.cache.invalidateTenant(tenantId);
  }

  async deleteReferenceValue(actor: AuthenticatedUser, referenceValueId: string) {
    const tenantId = this.requireTenant(actor);
    const usageCount = await this.catalog.countReferenceValueUsage({
      tenantId,
      referenceValueId,
    });
    if (usageCount > 0) {
      throw new BadRequestException(
        "This choice list value is already used by procurement cases. Deactivate it instead of deleting it.",
      );
    }
    await this.catalog.deleteReferenceValue({
      deletedBy: actor.id,
      referenceValueId,
      tenantId,
    });
    await this.cache.invalidateTenant(tenantId);
  }

  async createTenderType(
    actor: AuthenticatedUser,
    input: {
      completionDays: number;
      name: string;
      requiresFullMilestoneForm: boolean;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    const result = await this.catalog.createTenderType({
      ...input,
      createdBy: actor.id,
      tenantId,
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }

  async updateTenderType(
    actor: AuthenticatedUser,
    input: {
      completionDays: number;
      isActive: boolean;
      name: string;
      requiresFullMilestoneForm: boolean;
      tenderTypeId: string;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    await this.catalog.updateTenderType({
      ...input,
      tenantId,
      updatedBy: actor.id,
    });
    await this.cache.invalidateTenant(tenantId);
  }

  async deleteTenderType(actor: AuthenticatedUser, tenderTypeId: string) {
    const tenantId = this.requireTenant(actor);
    const usageCount = await this.catalog.countTenderTypeUsage({
      tenantId,
      tenderTypeId,
    });
    if (usageCount > 0) {
      throw new BadRequestException(
        "This tender type is already used by procurement cases. Deactivate it instead of deleting it.",
      );
    }
    await this.catalog.deleteTenderType({
      deletedBy: actor.id,
      tenderTypeId,
      tenantId,
    });
    await this.cache.invalidateTenant(tenantId);
  }

  async updateTenderTypeRule(
    actor: AuthenticatedUser,
    input: { ruleId: string; completionDays: number },
  ) {
    const tenantId = this.requireTenant(actor);
    await this.catalog.updateTenderTypeRule({
      tenantId,
      ruleId: input.ruleId,
      completionDays: input.completionDays,
    });
    await this.cache.invalidateTenant(tenantId);
  }

  async upsertTenderTypeRule(
    actor: AuthenticatedUser,
    input: { tenderTypeId: string; completionDays: number },
  ) {
    const tenantId = this.requireTenant(actor);
    const result = await this.catalog.upsertTenderTypeRule({
      tenantId,
      tenderTypeId: input.tenderTypeId,
      completionDays: input.completionDays,
    });
    await this.cache.invalidateTenant(tenantId);
    return result;
  }

  async assertProcurementCaseSelections(input: {
    budgetTypeId?: string | null;
    natureOfWorkId?: string | null;
    prReceivingMediumId?: string | null;
    tenderTypeId?: string | null;
    tenantId: string;
  }) {
    const catalogErrors = await this.catalog.validateProcurementCaseSelections(input);
    if (catalogErrors.length > 0) {
      throw new BadRequestException({
        catalogErrors,
        message: "Catalog validation failed.",
      });
    }
  }

  getTenderTypeCompletionDays(input: { tenantId: string; tenderTypeId: string }) {
    return this.catalog.getTenderTypeCompletionDays(input);
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }
}
