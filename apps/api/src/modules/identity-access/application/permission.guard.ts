import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  REQUIRED_PERMISSIONS_KEY,
} from "../../../common/auth/permissions.decorator.js";
import type { AuthenticatedRequest } from "../../../common/auth/authenticated-request.js";

const PERMISSION_IMPLICATIONS: Record<string, string[]> = {
  "case.read.all": ["case.read.entity", "case.read.assigned"],
  "case.read.entity": ["case.read.assigned"],
  "case.update.all": ["case.update.entity", "case.update.assigned"],
  "case.update.entity": ["case.update.assigned"],
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

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

    const granted = this.expandPermissions(user.permissions);
    const hasAllRequired = requiredPermissions.every((permission) => granted.has(permission));
    if (!hasAllRequired) {
      throw new ForbiddenException("Missing required permission.");
    }

    return true;
  }

  private expandPermissions(permissions: string[]): Set<string> {
    const granted = new Set(permissions);
    const queue = [...permissions];

    while (queue.length) {
      const permission = queue.shift();
      if (!permission) continue;
      for (const implied of PERMISSION_IMPLICATIONS[permission] ?? []) {
        if (!granted.has(implied)) {
          granted.add(implied);
          queue.push(implied);
        }
      }
    }

    return granted;
  }
}
