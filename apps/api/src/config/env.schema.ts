import { z } from "zod";

export const envValidationSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  APP_ENV: z.string().default("local"),
  APP_URL: z.string().url().default("http://localhost:5175"),
  API_URL: z.string().url().default("http://localhost:3100"),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_HMAC_KEY: z.string().min(32).optional(),
  CSRF_SECRET: z.string().min(32),
  CSRF_COOKIE_NAME: z.string().min(1).default("procuredesk_csrf"),
  SESSION_COOKIE_NAME: z.string().min(1).default("procuredesk_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(2),         // reduced from 8h → 2h
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_LIMIT_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  BOOTSTRAP_TENANT_NAME: z.string().min(1),
  BOOTSTRAP_TENANT_CODE: z.string().min(1),
  BOOTSTRAP_TENANT_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL: z.string().email(),
  MS_GRAPH_TENANT_ID: z.string().optional(),
  MS_GRAPH_CLIENT_ID: z.string().optional(),
  MS_GRAPH_CLIENT_SECRET: z.string().optional(),
  MS_GRAPH_SENDER_MAILBOX: z.string().email().optional(),
  PRIVATE_STORAGE_DRIVER: z.enum(["local", "azure_blob"]).default("local"),
  PRIVATE_STORAGE_ROOT: z.string().default("/var/lib/procuredesk/private"),
  AZURE_BLOB_CONNECTION_STRING: z.string().optional(),
  AZURE_BLOB_CONTAINER_NAME: z.string().default("procuredesk-private"),
  IMPORT_MAX_FILE_BYTES: z.coerce.number().int().positive().default(26214400),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OUTBOX_POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
}).superRefine((config, context) => {
  // ── Reject placeholder/weak secrets in staging and production ────────────────
  // Developers must set real cryptographically-random values before deploying.
  const WEAK_PATTERNS = ["change-me", "replace-with", "local-", "example", "placeholder", "your-"];
  const SECRET_FIELDS = ["SESSION_SECRET", "CSRF_SECRET"] as const;
  if (config.NODE_ENV !== "development" && config.NODE_ENV !== "test") {
    for (const field of SECRET_FIELDS) {
      const value = config[field].toLowerCase();
      if (WEAK_PATTERNS.some((p) => value.includes(p))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `${field} contains a weak placeholder value. ` +
            `Generate a random secret: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
          path: [field],
        });
      }
    }
  }

  // ── Microsoft Graph: require all keys together ──────────────────────────────
  const graphKeys = [
    "MS_GRAPH_TENANT_ID",
    "MS_GRAPH_CLIENT_ID",
    "MS_GRAPH_CLIENT_SECRET",
    "MS_GRAPH_SENDER_MAILBOX",
  ] as const;
  const hasAnyGraphConfig = graphKeys.some((key) => Boolean(config[key]));
  if (!hasAnyGraphConfig && config.NODE_ENV !== "production") return;

  for (const key of graphKeys) {
    if (!config[key]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key} is required when Microsoft Graph notifications are enabled.`,
        path: [key],
      });
    }
  }

  if (config.PRIVATE_STORAGE_DRIVER === "azure_blob" && !config.AZURE_BLOB_CONNECTION_STRING) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "AZURE_BLOB_CONNECTION_STRING is required when PRIVATE_STORAGE_DRIVER=azure_blob.",
      path: ["AZURE_BLOB_CONNECTION_STRING"],
    });
  }
});

export type EnvConfig = z.infer<typeof envValidationSchema>;
