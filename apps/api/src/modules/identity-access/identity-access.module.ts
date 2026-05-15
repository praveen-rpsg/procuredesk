import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { AdminRolesService } from "./application/admin-roles.service.js";
import { AdminSecurityService } from "./application/admin-security.service.js";
import { AdminUsersService } from "./application/admin-users.service.js";
import { IdentityAccessCoreModule } from "./identity-access-core.module.js";
import { AdminRolesController } from "./interfaces/http/admin-roles.controller.js";
import { AdminSecurityController } from "./interfaces/http/admin-security.controller.js";
import { AdminUsersController } from "./interfaces/http/admin-users.controller.js";
import { AuthController } from "./interfaces/http/auth.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule, AuditModule, OutboxModule],
  controllers: [AuthController, AdminUsersController, AdminRolesController, AdminSecurityController],
  providers: [AdminUsersService, AdminRolesService, AdminSecurityService],
  exports: [IdentityAccessCoreModule],
})
export class IdentityAccessModule {}
