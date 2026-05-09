import { Module } from "@nestjs/common";

import { PrivateFileStorageService } from "../../common/storage/private-file-storage.service.js";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessCoreModule } from "../identity-access/identity-access-core.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ImportExportService } from "./application/import-export.service.js";
import { ImportExportRepository } from "./infrastructure/import-export.repository.js";
import { ImportExportController } from "./interfaces/http/import-export.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule, AuditModule, OutboxModule],
  controllers: [ImportExportController],
  providers: [ImportExportService, ImportExportRepository, PrivateFileStorageService],
})
export class ImportExportModule {}
