import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { OrganizationService } from "./application/organization.service.js";
import { OrganizationRepository } from "./infrastructure/organization.repository.js";
import { OrganizationController } from "./interfaces/http/organization.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository],
  exports: [OrganizationService],
})
export class OrganizationModule {}

