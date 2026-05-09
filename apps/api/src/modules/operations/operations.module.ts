import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { OperationsService } from "./application/operations.service.js";
import { DeadLetterRepository } from "./infrastructure/dead-letter.repository.js";
import { OperationsController } from "./interfaces/http/operations.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessModule],
  controllers: [OperationsController],
  providers: [OperationsService, DeadLetterRepository],
})
export class OperationsModule {}
