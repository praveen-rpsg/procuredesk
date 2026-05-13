import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { hasExpandedPermission } from "../../../common/auth/permission-utils.js";
import type { AuthenticatedUser } from "../../identity-access/domain/authenticated-user.js";
import { DeadLetterRepository } from "../infrastructure/dead-letter.repository.js";

@Injectable()
export class OperationsService {
  constructor(private readonly deadLetters: DeadLetterRepository) {}

  listDeadLetters(actor: AuthenticatedUser) {
    const tenantId = this.requireTenant(actor);
    this.requirePermission(actor, "audit.read");
    return this.deadLetters.list(tenantId);
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
