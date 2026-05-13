import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { REQUIRED_PERMISSIONS_KEY } from "../../../common/auth/permissions.decorator.js";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request.js";
import { expandPermissions } from "../../../common/auth/permission-utils.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const classPermissions =
      this.reflector.get<string[]>(
        REQUIRED_PERMISSIONS_KEY,
        context.getClass(),
      ) ?? [];
    const handlerPermissions =
      this.reflector.get<string[]>(
        REQUIRED_PERMISSIONS_KEY,
        context.getHandler(),
      ) ?? [];
    const requiredPermissions = Array.from(
      new Set([...classPermissions, ...handlerPermissions]),
    );

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Missing authenticated user.");
    }
    if (user.isPlatformSuperAdmin) {
      return true;
    }

    const granted = expandPermissions(user.permissions);
    const hasAllRequired = requiredPermissions.every((permission) =>
      granted.has(permission),
    );
    if (!hasAllRequired) {
      throw new ForbiddenException("Missing required permission.");
    }

    return true;
  }
}
