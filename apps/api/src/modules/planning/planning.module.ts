import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessCoreModule } from "../identity-access/identity-access-core.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { PlanningService } from "./application/planning.service.js";
import { PlanningRepository } from "./infrastructure/planning.repository.js";
import { PlanningController } from "./interfaces/http/planning.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule, AuditModule, OutboxModule],
  controllers: [PlanningController],
  providers: [PlanningService, PlanningRepository],
})
export class PlanningModule {}
