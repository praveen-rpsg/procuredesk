import "reflect-metadata";

import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Redis } from "ioredis";

import { AppModule } from "./app.module.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import { runWithRequestContext } from "./common/request/request-context.js";
import { verifyCsrfToken } from "./common/security/csrf.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        ...(process.env.NODE_ENV !== "production"
          ? { transport: { target: "pino-pretty", options: { colorize: true } } }
          : {}),
        serializers: {
          req(request: { method: string; url: string; id: string }) {
            return { method: request.method, url: request.url, requestId: request.id };
          },
        },
      },
      trustProxy: true,
      // 1 MB JSON body limit; multipart uploads have their own limit via @fastify/multipart
      bodyLimit: 1_048_576,
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT", 3100);
  const allowedOrigin = config.get<string>("APP_URL", "http://localhost:5175");

  // ── Security headers ────────────────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        baseUri: ["'self'"],
        connectSrc: ["'self'", allowedOrigin],
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
  });

  // ── Global rate limiting ─────────────────────────────────────────────────────
  // Distributed counter via Redis so limits are shared across all API replicas.
  // Kept as an app hook to avoid Fastify plugin-version drift with Nest's adapter.
  const rateLimitRedis = new Redis(config.getOrThrow<string>("REDIS_URL"), {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  app.getHttpAdapter().getInstance().addHook("preHandler", async (request, reply) => {
    const key = `rate-limit:${request.ip ?? "unknown"}`;
    try {
      const count = await rateLimitRedis.incr(key);
      if (count === 1) {
        await rateLimitRedis.expire(key, 60);
      }
      if (count > 120) {
        const ttlMs = await rateLimitRedis.pttl(key);
        await reply.status(429).send({
          type: "https://procuredesk.local/problems/429",
          title: "Too Many Requests",
          status: 429,
          detail: `Rate limit exceeded. Try again in ${Math.max(1, Math.ceil(ttlMs / 1000))} seconds.`,
        });
      }
    } catch {
      // Do not fail closed on a transient Redis issue; login-specific throttling is DB-backed.
    }
  });

  // ── Cookies ─────────────────────────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: config.getOrThrow<string>("SESSION_SECRET"),
  });

  // ── Multipart uploads ────────────────────────────────────────────────────────
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.get<number>("IMPORT_MAX_FILE_BYTES", 26_214_400),
      files: 1,
      fields: 10,          // prevent form-field-bomb attacks
      headerPairs: 100,    // limit header-pair count
    },
  });

  // ── Request context (IP, requestId, userAgent) ───────────────────────────────
  app.getHttpAdapter().getInstance().addHook("preHandler", (request, _reply, done) => {
    runWithRequestContext(
      {
        ipAddress: request.ip ?? null,
        requestId: request.id ? String(request.id) : null,
        userAgent: singleHeader(request.headers["user-agent"]) ?? null,
      },
      done,
    );
  });

  // ── CSRF validation for mutating requests ────────────────────────────────────
  app.getHttpAdapter().getInstance().addHook("preHandler", (request, reply, done) => {
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      done();
      return;
    }
    if (request.url.split("?")[0]?.endsWith("/auth/logout")) {
      done();
      return;
    }

    const sessionCookieName = config.get<string>("SESSION_COOKIE_NAME", "procuredesk_session");
    const csrfCookieName = config.get<string>("CSRF_COOKIE_NAME", "procuredesk_csrf");
    const sessionCookie = request.cookies?.[sessionCookieName];
    if (!sessionCookie) {
      done();
      return;
    }

    const headerValue = request.headers["x-csrf-token"];
    const csrfHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const csrfCookie = request.cookies?.[csrfCookieName];
    if (
      !csrfHeader ||
      csrfHeader !== csrfCookie ||
      !verifyCsrfToken(csrfHeader, config.getOrThrow<string>("CSRF_SECRET"))
    ) {
      void reply.status(403).send({
        type: "https://procuredesk.local/problems/403",
        title: "Request Failed",
        status: 403,
        detail: "CSRF token validation failed.",
        instance: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    done();
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({
    credentials: true,
    origin: allowedOrigin,
    methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 3600,
  });
  await app.listen(port, "0.0.0.0");
}

void bootstrap();

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
