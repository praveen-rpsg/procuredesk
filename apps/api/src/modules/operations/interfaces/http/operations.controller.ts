import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../../common/auth/current-user.decorator.js";
import { RequirePermissions } from "../../../../common/auth/permissions.decorator.js";
import { AuthGuard } from "../../../identity-access/application/auth.guard.js";
import { PermissionGuard } from "../../../identity-access/application/permission.guard.js";
import type { AuthenticatedUser } from "../../../identity-access/domain/authenticated-user.js";
import { OperationsService } from "../../application/operations.service.js";

@Controller("operations")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("admin.console.access")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("dead-letter-events")
  @RequirePermissions("audit.read")
  listDeadLetters(@CurrentUser() user: AuthenticatedUser) {
    return this.operations.listDeadLetters(user);
  }
}
