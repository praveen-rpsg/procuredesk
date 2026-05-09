import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { OutboxWriterService } from "./application/outbox-writer.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [OutboxWriterService],
  exports: [OutboxWriterService],
})
export class OutboxModule {}
