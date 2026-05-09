import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { CacheModule } from "../../common/cache/cache.module.js";
import { PrivateFileStorageService } from "../../common/storage/private-file-storage.service.js";
import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessCoreModule } from "../identity-access/identity-access-core.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ReportingService } from "./application/reporting.service.js";
import { ReportingRepository } from "./infrastructure/reporting.repository.js";
import { ReportingController } from "./interfaces/http/reporting.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule, AuditModule, OutboxModule, CacheModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingRepository, PrivateFileStorageService],
})
export class ReportingModule {}
