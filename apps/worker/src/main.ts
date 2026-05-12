import { Queue, Worker } from "bullmq";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Redis } from "ioredis";
import pino from "pino";
import { Pool } from "pg";

import { processExportJob, type ExportJobPayload } from "./exports/export-worker.js";
import { processImportJob, type ImportJobPayload } from "./import-export/import-worker.js";
import { dispatchPendingOutbox } from "./outbox/outbox-dispatcher.js";
import { MicrosoftGraphClient } from "./notifications/microsoft-graph-client.js";
import { processNotificationJob, type NotificationJobPayload } from "./notifications/notification-worker.js";
import { processReportingProjection, type ReportingProjectionPayload } from "./reporting/reporting-projection-worker.js";
import { createPrivateObjectStorageFromEnv } from "./storage/private-object-storage.js";

loadEnvFiles([".env", "../../.env"]);

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

const OUTBOX_POLLING_INTERVAL_MS = Number(process.env.OUTBOX_POLLING_INTERVAL_MS ?? 10_000);

function start(): void {
  logger.info({ event: "worker.start" }, "procuredesk-worker ready");

  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl) {
    logger.warn(
      { event: "worker.config_missing" },
      "DATABASE_URL or REDIS_URL missing — queue workers are not started in this process.",
    );
    return;
  }

  const graphConfig = optionalGraphConfig();

  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const exportsQueue = new Queue("exports", { connection });
  const importsQueue = new Queue("imports", { connection });
  const notificationsQueue = new Queue("notifications", { connection });
  const reportingQueue = new Queue("reporting-projections", { connection });
  const storage = createPrivateObjectStorageFromEnv(process.env);

  const workerOpts = { connection };

  new Worker<ImportJobPayload>(
    "imports",
    async (job) => {
      logger.info({ event: "job.start", queue: "imports", jobId: job.id }, "Processing import job");
      return processImportJob(job.data, { pool, storage });
    },
    workerOpts,
  );

  new Worker<ExportJobPayload>(
    "exports",
    async (job) => {
      logger.info({ event: "job.start", queue: "exports", jobId: job.id }, "Processing export job");
      return processExportJob(job.data, { pool, storage });
    },
    workerOpts,
  );

  if (graphConfig) {
    const graph = new MicrosoftGraphClient(graphConfig);
    new Worker<NotificationJobPayload>(
      "notifications",
      async (job) => {
        logger.info({ event: "job.start", queue: "notifications", jobId: job.id }, "Processing notification job");
        return processNotificationJob(job.data, { graph, pool });
      },
      workerOpts,
    );
    logger.info({ event: "worker.notifications_enabled" }, "Notification delivery worker enabled");
  } else {
    logger.warn(
      { event: "worker.notifications_disabled" },
      "Microsoft Graph env vars not configured — notification delivery worker is disabled.",
    );
  }

  new Worker<ReportingProjectionPayload>(
    "reporting-projections",
    async (job) => {
      logger.debug({ event: "job.start", queue: "reporting-projections", jobId: job.id }, "Processing projection");
      return processReportingProjection(job.data, { pool });
    },
    workerOpts,
  );

  windowedInterval(async () => {
    const count = await dispatchPendingOutbox({
      exportsQueue,
      importsQueue,
      notificationsQueue,
      pool,
      reportingQueue,
      logger,
    });
    if (count > 0) {
      logger.info({ event: "outbox.dispatched", count }, `Dispatched ${count} outbox event(s).`);
    }
  }, OUTBOX_POLLING_INTERVAL_MS);

  logger.info(
    {
      event: "worker.queues_registered",
      queues: ["imports", "exports", "notifications", "reporting-projections"],
      pollingIntervalMs: OUTBOX_POLLING_INTERVAL_MS,
    },
    "All queues registered",
  );
}

function optionalGraphConfig():
  | {
      clientId: string;
      clientSecret: string;
      senderMailbox: string;
      tenantId: string;
    }
  | null {
  const keys = [
    "MS_GRAPH_CLIENT_ID",
    "MS_GRAPH_CLIENT_SECRET",
    "MS_GRAPH_SENDER_MAILBOX",
    "MS_GRAPH_TENANT_ID",
  ] as const;
  const values = Object.fromEntries(keys.map((key) => [key, process.env[key]?.trim()]));
  const hasAnyValue = keys.some((key) => Boolean(values[key]));
  if (!hasAnyValue) {
    return null;
  }

  const missing = keys.filter((key) => !values[key]);
  if (missing.length) {
    throw new Error(`${missing.join(", ")} must be configured together for notification delivery.`);
  }

  return {
    clientId: values.MS_GRAPH_CLIENT_ID as string,
    clientSecret: values.MS_GRAPH_CLIENT_SECRET as string,
    senderMailbox: values.MS_GRAPH_SENDER_MAILBOX as string,
    tenantId: values.MS_GRAPH_TENANT_ID as string,
  };
}

function windowedInterval(task: () => Promise<void>, intervalMs: number): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    task()
      .catch((error: unknown) => {
        logger.error(
          { event: "worker.interval_error", error: error instanceof Error ? error.message : String(error) },
          "Worker interval failed",
        );
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}

start();

function loadEnvFiles(paths: string[]): void {
  for (const path of paths) {
    const resolved = resolve(process.cwd(), path);
    if (!existsSync(resolved)) continue;
    const contents = readFileSync(resolved, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}
