import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessCoreModule } from "../identity-access/identity-access-core.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ProcurementCasesModule } from "../procurement-cases/procurement-cases.module.js";
import { CaseAwardService } from "./application/case-award.service.js";
import { CaseAwardRepository } from "./infrastructure/case-award.repository.js";
import { CaseAwardController } from "./interfaces/http/case-award.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule, ProcurementCasesModule, AuditModule, OutboxModule],
  controllers: [CaseAwardController],
  providers: [CaseAwardService, CaseAwardRepository],
})
export class AwardsModule {}
