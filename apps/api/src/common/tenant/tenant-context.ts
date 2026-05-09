import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/authenticated-request.js";

/**
 * Parameter decorator that extracts the current tenant ID from the authenticated
 * request and throws UnauthorizedException if it is absent.
 *
 * Usage:
 *   async myMethod(@CurrentTenant() tenantId: string) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException("Tenant context is required for this operation.");
    }
    return tenantId;
  },
);
