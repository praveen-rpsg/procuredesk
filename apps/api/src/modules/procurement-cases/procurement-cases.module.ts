import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ProcurementCaseService } from "./application/procurement-case.service.js";
import { ProcurementCaseRepository } from "./infrastructure/procurement-case.repository.js";
import { ProcurementCaseController } from "./interfaces/http/procurement-case.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessModule, AuditModule, OutboxModule, CatalogModule],
  controllers: [ProcurementCaseController],
  providers: [ProcurementCaseService, ProcurementCaseRepository],
  exports: [ProcurementCaseService],
})
export class ProcurementCasesModule {}
