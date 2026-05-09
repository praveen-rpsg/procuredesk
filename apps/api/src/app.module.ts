import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthController } from "./common/health.controller.js";
import { IdempotencyModule } from "./common/idempotency/idempotency.module.js";
import { MetricsModule } from "./common/metrics/metrics.module.js";
import { envValidationSchema } from "./config/env.schema.js";
import { DatabaseModule } from "./database/database.module.js";
import { AwardsModule } from "./modules/awards/awards.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { IdentityAccessModule } from "./modules/identity-access/identity-access.module.js";
import { ImportExportModule } from "./modules/import-export/import-export.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { OrganizationModule } from "./modules/organization/organization.module.js";
import { OperationsModule } from "./modules/operations/operations.module.js";
import { PlanningModule } from "./modules/planning/planning.module.js";
import { ProcurementCasesModule } from "./modules/procurement-cases/procurement-cases.module.js";
import { ReportingModule } from "./modules/reporting/reporting.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envValidationSchema.parse(config),
    }),
    DatabaseModule,
    IdempotencyModule,
    MetricsModule,
    IdentityAccessModule,
    OrganizationModule,
    CatalogModule,
    ProcurementCasesModule,
    AwardsModule,
    PlanningModule,
    ReportingModule,
    ImportExportModule,
    NotificationsModule,
    OperationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
