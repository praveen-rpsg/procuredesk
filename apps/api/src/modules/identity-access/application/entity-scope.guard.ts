import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  REQUIRED_ENTITY_PARAM_KEY,
} from "../../../common/auth/entity-scope.decorator.js";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request.js";

@Injectable()
export class EntityScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const entityParam = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_ENTITY_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!entityParam) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const params = request.params as Record<string, unknown> | undefined;
    const entityId = params?.[entityParam];

    if (!user || typeof entityId !== "string") {
      throw new ForbiddenException("Entity scope cannot be verified.");
    }
    if (
      user.isPlatformSuperAdmin ||
      user.permissions.includes("case.read.all") ||
      user.permissions.includes("case.update.all") ||
      user.entityIds.includes(entityId)
    ) {
      return true;
    }

    throw new ForbiddenException("Entity scope denied.");
  }
}
