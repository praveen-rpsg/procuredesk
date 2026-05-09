import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessCoreModule } from "../identity-access/identity-access-core.module.js";
import { AuditQueryService } from "./application/audit-query.service.js";
import { AuditWriterService } from "./application/audit-writer.service.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import { AuditController } from "./interfaces/http/audit.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule],
  controllers: [AuditController],
  providers: [AuditWriterService, AuditQueryService, AuditRepository],
  exports: [AuditWriterService],
})
export class AuditModule {}
