import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessCoreModule } from "../identity-access/identity-access-core.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { NotificationService } from "./application/notification.service.js";
import { MicrosoftGraphEmailAdapter } from "./infrastructure/microsoft-graph-email.adapter.js";
import { NotificationRepository } from "./infrastructure/notification.repository.js";
import { NotificationController } from "./interfaces/http/notification.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessCoreModule, AuditModule, OutboxModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, MicrosoftGraphEmailAdapter],
})
export class NotificationsModule {}
