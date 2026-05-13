import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
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
      includeTotal?: boolean;
      limit?: number;
      offset?: number;
      q?: string;
      targetId?: string;
      targetType?: string;
    },
  ) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "audit.read");
    const paging = {
      ...query,
      limit: Math.min(query.limit ?? 50, 100),
      offset: query.offset ?? 0,
      tenantId,
    };
    return query.includeTotal
      ? this.repository.listEventsPage(paging)
      : this.repository.listEvents(paging);
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
    if (!hasExpandedPermission(actor, permission)) {
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
