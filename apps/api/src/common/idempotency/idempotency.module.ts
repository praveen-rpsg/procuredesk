import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { IdempotencyInterceptor } from "./idempotency.interceptor.js";

@Module({
  imports: [DatabaseModule],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
