# 4. Engineering Handover & Operations — ProcureDesk Platform

> Audience: Incoming engineering & operations teams.
> Goal: Equip a new team to own development, deployment, and 24/7 operations of ProcureDesk without further verbal context.

---

## 4.1 Repository Structure

```
procuredesk-platform/
├── apps/
│   ├── api/         NestJS + Fastify HTTP service (port 3100 dev / 3000 prod)
│   │   └── src/
│   │       ├── app.module.ts          Root Nest module wiring all domain modules
│   │       ├── main.ts                Fastify bootstrap: helmet, CSRF, rate limit, multipart
│   │       ├── common/                Cross-cutting: idempotency, metrics, security, tenant ctx, problem-details, storage
│   │       ├── config/env.schema.ts   Zod-validated env (rejects placeholders in non-dev)
│   │       ├── database/              `pg.Pool` provider, tokens, request-scoped tx
│   │       └── modules/               Domain modules — see §4.1.1
│   ├── web/         React 19 + Vite SPA (port 5175 dev)
│   │   └── src/
│   │       ├── app/                   Router shell, providers, layout
│   │       ├── features/              Per-feature screens (admin, auth, awards, dashboard, …)
│   │       ├── shared/                API client, hooks, primitives
│   │       └── styles.css             Tailwind + tokens
│   └── worker/      BullMQ background processor
│       └── src/
│           ├── main.ts                Boot: starts queues, outbox interval, graceful shutdown
│           ├── import-export/         Import job processor
│           ├── exports/               Export job processor
│           ├── notifications/         Microsoft Graph client + notification consumer
│           ├── reporting/             Reporting projection consumer
│           ├── outbox/                Outbox dispatcher (DB poll → enqueue)
│           └── storage/               Pluggable private object storage
├── packages/
│   ├── contracts/      Shared Zod schemas + DTO types (API ⇆ Web)
│   ├── domain-types/   Shared enums, constants
│   ├── ui/             Shared UI primitives
│   ├── config/         Shared runtime helpers
│   ├── eslint-config/  Shared ESLint config
│   └── tsconfig/       Shared tsconfig bases
├── db/
│   ├── migrations/     0001_foundation.sql + committed/000002–000008
│   ├── seeds/          Reference data + local bootstrap + procurement catalog defaults
│   └── docs/           Schema notes
├── infra/
│   ├── docker/         api/web/worker Dockerfiles + local docker-compose
│   ├── deploy/         staging-compose.yml, production-compose.yml, README
│   ├── nginx/          Reverse-proxy config
│   └── monitoring/     Grafana dashboards
├── config/             Shared runtime config (env templates)
├── docs/               Architecture, product, ui-ux, operations docs (incl. handover/)
├── .github/workflows/  ci.yml, deploy-staging.yml, rollback-staging.yml
├── package.json        Root scripts (dev, build, db:*, docker:*)
├── pnpm-workspace.yaml Workspace manifest
└── tsconfig.base.json  Base TS settings (strict)
```

### 4.1.1 API Domain Modules (`apps/api/src/modules/`)

| Module | Owns |
|--------|------|
| `audit` | Append-only audit log services |
| `awards` | Case awards, supplier selection |
| `catalog` | Reference data, tender types, stage policies, completion rules |
| `identity-access` | Tenants, users, sessions, RBAC, password lifecycle, login throttle |
| `import-export` | Excel ingest/egress controllers and request handling |
| `notifications` | Notification rule engine, notification job creation |
| `operations` | Outbox writes, file assets, observability surfaces |
| `organization` | Entities, departments |
| `outbox` | Outbox event helpers used by other modules |
| `planning` | RC/PO plans, tender plan ↔ case linkage |
| `procurement-cases` | Case lifecycle, milestones, financials, delays |
| `reporting` | Case facts, contract-expiry facts, saved views |

---

## 4.2 Local Development Setup

### 4.2.1 Prerequisites

- **Node.js 22+** (Volta or nvm).
- **pnpm 9.15+** via Corepack: `corepack enable && corepack prepare pnpm@9.15.0 --activate`.
- **Docker Desktop / Engine** (for local Postgres + Redis).
- **psql** client (for migrations and seeds).

### 4.2.2 Installation

```bash
git clone <repo-url> procuredesk-platform
cd procuredesk-platform
cp .env.example .env
pnpm install
```

### 4.2.3 Environment

`/.env` is loaded by API, Worker, and Web (via `VITE_*`). The committed `.env.example` is sufficient for local dev. **Never** commit a real `.env`.

### 4.2.4 Bring up infrastructure

```bash
pnpm docker:up                # postgres on :55433, redis on :56379
pnpm db:migrate               # apply foundation schema
# apply committed migrations (run each in order):
for f in db/migrations/committed/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f";
done
pnpm db:seed                  # reference data
pnpm db:bootstrap:local       # local tenant + admin user + catalog defaults
```

Set the initial admin password (creates the bootstrap admin if missing):

```bash
pnpm --filter @procuredesk/api admin:set-password
```

### 4.2.5 Start all services

```bash
pnpm dev   # runs api, web, worker in parallel with hot reload
```

- API: <http://localhost:3100/api/v1/>
- Web: <http://localhost:5175>
- Worker: stdout in same terminal

### 4.2.6 Tear-down

```bash
pnpm docker:down              # stops postgres + redis
docker volume rm procuredesk-platform-postgres-data \
                  procuredesk-platform-redis-data   # full reset
```

For full local-start steps including troubleshooting, see `docs/operations/local-start.md`.

---

## 4.3 Build & Run Instructions

| Target | Build | Run (local prod-mode) |
|--------|-------|----------------------|
| API | `pnpm --filter @procuredesk/api build` | `pnpm --filter @procuredesk/api start` |
| Web | `pnpm --filter @procuredesk/web build` | `pnpm --filter @procuredesk/web preview` |
| Worker | `pnpm --filter @procuredesk/worker build` | `pnpm --filter @procuredesk/worker start` |
| All | `pnpm build` | n/a (use Docker for prod-mode) |

Tests:

```bash
pnpm --filter @procuredesk/api test
pnpm --filter @procuredesk/worker test
pnpm --filter @procuredesk/api test:coverage
```

Quality gates:

```bash
pnpm typecheck
pnpm lint
pnpm format        # prettier --write .
```

---

## 4.4 Environment Variables

> Source of truth: `apps/api/src/config/env.schema.ts` (Zod). The schema enforces presence, types, minimum length, and rejects placeholder values for secrets in staging/production.

| Variable | Required | Sensitivity | Default | Purpose |
|----------|---------|-------------|---------|---------|
| `NODE_ENV` | yes | low | `development` | One of `development \| test \| staging \| production` |
| `APP_ENV` | yes | low | `local` | Free-form environment label |
| `APP_URL` | yes | low | `http://localhost:5175` | SPA origin for CORS / CSP |
| `API_URL` | yes | low | `http://localhost:3100` | Self-URL of API |
| `VITE_API_URL` | web only | low | `http://localhost:3100/api/v1` | API base from the SPA |
| `PORT` | yes | low | `3100` | API listen port |
| `DATABASE_URL` | yes | **secret** | — | Postgres DSN (`postgres://user:pwd@host:port/db`) |
| `REDIS_URL` | yes | **secret** | — | Redis DSN |
| `SESSION_SECRET` | yes | **secret** | — | ≥ 32 chars; signs session cookies; rejected if placeholder |
| `SESSION_HMAC_KEY` | optional | secret | — | Optional auxiliary HMAC key |
| `CSRF_SECRET` | yes | **secret** | — | ≥ 32 chars; CSRF tokens; rejected if placeholder |
| `SESSION_COOKIE_NAME` | yes | low | `procuredesk_session` | Session cookie name |
| `CSRF_COOKIE_NAME` | yes | low | `procuredesk_csrf` | CSRF cookie name |
| `SESSION_TTL_HOURS` | yes | low | `2` | Absolute session lifetime |
| `SESSION_IDLE_TIMEOUT_MINUTES` | yes | low | `30` | Idle timeout |
| `LOGIN_RATE_LIMIT_ATTEMPTS` | yes | low | `10` | Per window |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | yes | low | `15` | Login throttle window |
| `LOGIN_RATE_LIMIT_LOCKOUT_MINUTES` | yes | low | `15` | Lockout duration |
| `BOOTSTRAP_TENANT_NAME` | yes | low | — | Seeds first tenant |
| `BOOTSTRAP_TENANT_CODE` | yes | low | — | Tenant short-code |
| `BOOTSTRAP_TENANT_ADMIN_EMAIL` | yes | low | — | First tenant admin user |
| `BOOTSTRAP_PLATFORM_ADMIN_EMAIL` | yes | low | — | First platform admin user |
| `MS_GRAPH_TENANT_ID` | prod | **secret** | — | Azure AD tenant for Graph |
| `MS_GRAPH_CLIENT_ID` | prod | **secret** | — | App registration client ID |
| `MS_GRAPH_CLIENT_SECRET` | prod | **secret** | — | Client secret (rotate ≤ 12 months) |
| `MS_GRAPH_SENDER_MAILBOX` | prod | low | — | From-address mailbox |
| `PRIVATE_STORAGE_DRIVER` | yes | low | `local` | `local` \| `azure_blob` |
| `PRIVATE_STORAGE_ROOT` | local only | low | `/var/lib/procuredesk/private` | Local FS root |
| `AZURE_BLOB_CONNECTION_STRING` | prod | **secret** | — | Required when driver = `azure_blob` |
| `AZURE_BLOB_CONTAINER_NAME` | prod | low | `procuredesk-private` | Container name |
| `IMPORT_MAX_FILE_BYTES` | yes | low | `26214400` | Upload size cap (25 MiB default) |
| `OUTBOX_MAX_ATTEMPTS` | yes | low | `5` | Worker retry cap before DLQ |
| `OUTBOX_POLLING_INTERVAL_MS` | yes | low | `10000` | Outbox dispatcher interval |

> The Graph block is **all-or-nothing** — partial Graph config fails fast at boot. Notification delivery is silently disabled if no Graph keys are present.

---

## 4.5 Service Dependencies

| Dependency | Owner | Purpose | Failure impact |
|------------|-------|---------|---------------|
| PostgreSQL 16 | Internal | System of record | API readiness fails; full outage |
| Redis 7 | Internal | Queues + rate-limit | Queue processing halts; global rate limit fails open |
| Azure Blob Storage | Microsoft | Private file assets | Imports/exports degraded |
| Microsoft Graph | Microsoft | Email delivery | Notifications queue, eventually DLQ |
| GitHub Container Registry | GitHub | Image distribution | New deploys blocked; running prod unaffected |
| Let's Encrypt | ISRG | TLS certificates | Cert renewal blocked; serving traffic unaffected until expiry |

---

## 4.6 Operational Runbooks

> Each runbook follows: **Symptom → Detect → Diagnose → Mitigate → Resolve → Postmortem**.

### 4.6.1 Deployment Failure

- **Symptom**: Compose `up -d` fails, or `/api/v1/ready` does not return 200 within 2 min.
- **Detect**: Healthcheck unhealthy in `docker compose ps`; Grafana shows missing scrape target.
- **Diagnose**: `docker compose logs api --tail 200`. Look for env-validation errors (Zod), DB connect errors, port conflicts.
- **Mitigate**: If env-validation, fix `/etc/procuredesk/.env.production` and re-up. If image issue, redeploy prior `:sha`.
- **Resolve**: Confirm `/healthz` and `/ready` return 200; run smoke tests.
- **Postmortem**: Capture root cause; if config drift, formalise change-control.

### 4.6.2 Database Issue

- **Symptom**: 5xx burst, `/api/v1/ready` failing.
- **Detect**: Alert "DB connections > 80%" or "API 5xx burst".
- **Diagnose**: `docker exec postgres psql -U procuredesk -c 'select state, count(*) from pg_stat_activity group by 1;'` — look for `idle in transaction` or long-running queries.
- **Mitigate**: Kill rogue queries (`pg_terminate_backend`); restart API to release connections.
- **Resolve**: Tune `pg.Pool.max` or query indexing if pattern recurs.
- **Postmortem**: Add a query plan to `db/docs/`.

### 4.6.3 Queue Backlog

- **Symptom**: `bullmq_queue_waiting{queue=...}` grows.
- **Detect**: Grafana queue panel; user complaints about delayed exports/notifications.
- **Diagnose**: `docker compose logs worker --tail 500` — repeated job failures? Graph token expired?
- **Mitigate**: Scale worker horizontally; if Graph creds expired, rotate `MS_GRAPH_CLIENT_SECRET`.
- **Resolve**: Replay DLQ rows with `ops.dead_letter_events` once underlying issue fixed.

### 4.6.4 High CPU

- **Symptom**: API or worker container CPU pegged.
- **Detect**: Grafana CPU panel.
- **Diagnose**: Identify heaviest endpoint (`http_request_duration_seconds`). Inspect logs for runaway loops or large imports.
- **Mitigate**: Throttle the offending tenant via global rate limit; pause queue if import-related.
- **Resolve**: Patch hot code path; re-enable.

### 4.6.5 Memory Leak

- **Symptom**: RSS grows monotonically across hours.
- **Detect**: Grafana process memory panel.
- **Diagnose**: Capture heap snapshot (`kill -USR2 <pid>` if `--inspect` enabled in non-prod). Inspect with Chrome DevTools.
- **Mitigate**: Rolling restart (compose `up -d --force-recreate api`).
- **Resolve**: Identify retained refs (often event-listener leaks).

### 4.6.6 API Latency

- **Symptom**: p95 > 800 ms.
- **Detect**: Latency alert.
- **Diagnose**: `pg_stat_statements` for slow queries; check `/metrics` for slow endpoint.
- **Mitigate**: Add index (commit a new migration in `db/migrations/committed/`).
- **Resolve**: Verify p95 returns to baseline.

### 4.6.7 Auth Issue

- **Symptom**: Users cannot log in; 423 Locked, 401 Unauthorised, 403 CSRF.
- **Detect**: Spike in 401/403 in Grafana.
- **Diagnose**: Inspect `ops.login_rate_limits` for affected user. Verify `SESSION_SECRET`/`CSRF_SECRET` unchanged across rolling deploys (rotation invalidates sessions and CSRF tokens — by design).
- **Mitigate**: Clear lockout row for affected user; or wait `LOGIN_RATE_LIMIT_LOCKOUT_MINUTES`.
- **Resolve**: If secret rotation, communicate forced sign-out to users.

### 4.6.8 Incident Response

```mermaid
flowchart LR
    A[Page received] --> B[Acknowledge < 5 min]
    B --> C[Triage severity SEV1-3]
    C -- SEV1 --> D[Open incident channel<br/>+ status page]
    D --> E[Mitigate first<br/>then investigate]
    E --> F[Comms every 30 min]
    F --> G[Resolution]
    G --> H[Postmortem within 5 days]
    C -- SEV2/3 --> I[Ticket + scheduled fix]
```

---

## 4.7 Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Boot fails with `SESSION_SECRET … weak placeholder` | Placeholder in non-dev env | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| API returns 403 on every POST | CSRF cookie missing | Ensure SPA seeded the CSRF cookie (visit any GET first) |
| `/api/v1/ready` fails | Postgres or Redis not reachable | Check container health; inspect `DATABASE_URL` / `REDIS_URL` |
| `MS_GRAPH_*` boot error | Partial Graph config | Set all four `MS_GRAPH_*` vars or none |
| Excel import "stuck" | Worker not running or queue starved | Check worker container; check `bullmq` queue depth |
| Cross-tenant data visible | RLS not engaged for query | Verify `set_config('app.tenant_id', …, true)` runs at request boundary |
| Login locked | Throttle hit | Wait `LOGIN_RATE_LIMIT_LOCKOUT_MINUTES` or clear `ops.login_rate_limits` row |

---

## 4.8 Logging Guide

- **Where**: `docker compose logs <service>` on host; ship via Promtail/Fluent Bit in production.
- **Format**: pino JSON in production. Each line includes `time`, `level`, `requestId`, `event`, plus context fields.
- **Trace a request**: grab `requestId` from the response header (or user-reported error), then `grep` across api+worker logs.
- **Sensitive data**: never log password hashes, full session tokens, or full Graph tokens. Audit before adding new log lines.

---

## 4.9 Monitoring Guide

- Prometheus scrapes `GET /api/v1/metrics`.
- Grafana dashboards (`infra/monitoring/grafana`) include: HTTP RED, queue depth, outbox lag, DB connections, process memory.
- Alert routing target: on-call rotation (PagerDuty / Opsgenie).
- Threshold tuning: every quarter, review SLOs vs. realised performance.

---

## 4.10 Scaling Operations

| Indicator | Action |
|-----------|--------|
| API CPU > 70% sustained | Add API replica |
| API memory > 80% | Raise `deploy.resources.limits.memory` or split workload |
| `bullmq_queue_waiting` rising | Add worker replica or raise concurrency for that queue |
| DB connections > 80% of `max` | Add PgBouncer; reduce `pg.Pool.max` per replica |
| Redis memory > 80% | Scale Redis vertically; review key growth |
| p95 latency > 800 ms | Index hot query; cache catalog reads |

---

## 4.11 Security Operations

- **Secret rotation**:
  - `SESSION_SECRET` / `CSRF_SECRET`: rotate quarterly; rotation forces global sign-out.
  - `MS_GRAPH_CLIENT_SECRET`: rotate annually or on suspected exposure.
  - `AZURE_BLOB_CONNECTION_STRING`: rotate on personnel change or annually.
  - DB passwords: rotate annually.
- **Credential management**: never commit; use platform secret store; scrub from logs.
- **Access control**: SSH to host only via bastion + key. Production env file is root-owned 0600.
- **Audit handling**: `ops.audit_events` is append-only; export to long-term storage quarterly for compliance.

---

## 4.12 Known Limitations

1. **Single Postgres primary** — no automatic failover today.
2. **Single Redis** — no Sentinel/Cluster.
3. **No distributed tracing** — only correlation via `requestId`.
4. **Worker = monolith** — all queues run in one process by default; recommended split for production scale.
5. **Outbox dispatcher is a polling loop** — 10 s polling interval gives an upper bound on async latency.
6. **No automated migration rollback** — forward-only; relies on backward-compatible migrations.
7. **Imports are memory-bound** — large workbooks may pressure worker memory.
8. **Grafana dashboards** are scaffolded but not yet exhaustive.
9. **AI features** are out of scope (architecture leaves a clean seam).

---

## 4.13 Operational Flow Diagram

```mermaid
flowchart TB
    M[Monitoring alert] --> O[On-call ack]
    O --> R{Runbook exists?}
    R -- yes --> RB[Follow runbook §4.6]
    R -- no --> AH[Ad-hoc diagnosis]
    RB --> Mit[Mitigate]
    AH --> Mit
    Mit --> Ver[Verify recovery via /healthz, /ready, Grafana]
    Ver -- ok --> PM[Postmortem within 5 days]
    Ver -- fail --> Esc[Escalate to engineering lead]
    Esc --> War[War-room until green]
    War --> PM
```

## 4.14 Support Escalation

```mermaid
flowchart LR
    L1[L1 Support<br/>Ticket triage] -->|cannot resolve| L2[L2 On-call Engineer]
    L2 -->|architecture change needed| L3[L3 Backend Lead]
    L3 -->|infra change| L4[DevOps Lead]
    L3 -->|security incident| L5[Security Lead]
    L4 --> CTO
    L5 --> CTO
```

---

*End of Engineering Handover & Operations.*
