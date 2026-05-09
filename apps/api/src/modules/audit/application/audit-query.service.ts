import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { AuditRepository } from "../infrastructure/audit.repository.js";

@Injectable()
export class AuditQueryService {
  constructor(private readonly repository: AuditRepository) {}

  listEvents(
    actor: AuthenticatedUser,
    query: {
      action?: string;
      actorUserId?: string;
      limit?: number;
      offset?: number;
      q?: string;
      targetId?: string;
      targetType?: string;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "audit.read");
    return this.repository.listEvents({
      ...query,
      limit: Math.min(query.limit ?? 50, 100),
      offset: query.offset ?? 0,
      tenantId,
    });
  }

  async getEvent(actor: AuthenticatedUser, eventId: string) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "audit.read");
    const event = await this.repository.getEvent(tenantId, eventId);
    if (!event) throw new NotFoundException("Audit event not found.");
    return event;
  }

  getFilterMetadata(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "audit.read");
    return this.repository.getFilterMetadata(tenantId);
  }

  private requirePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.isPlatformSuperAdmin && !actor.permissions.includes(permission)) {
      throw new ForbiddenException("Missing required permission.");
    }
  }

  private requireTenant(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new BadRequestException("Tenant context is required.");
    }
    return actor.tenantId;
  }
}
