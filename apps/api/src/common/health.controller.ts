import { Controller, Get, Header, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { DatabaseService } from "../database/database.service.js";
import { MetricsService } from "./metrics/metrics.service.js";

@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("health")
  health() {
    return {
      service: "procuredesk-api",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async ready() {
    await this.db.query("select 1");
    return {
      service: "procuredesk-api",
      status: "ready",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async prometheusMetrics(@Res() reply: FastifyReply): Promise<void> {
    const body = await this.metrics.getMetrics();
    await reply.status(200).send(body);
  }
}
