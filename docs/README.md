# ProcureDesk Platform Handover Documentation

This folder contains the complete project handover pack for the ProcureDesk enterprise procurement platform. It is intentionally compact: a small set of detailed documents is maintained so a new team can read end-to-end without jumping through many small files.

## Documentation Map

| File | Purpose |
| --- | --- |
| [01-project-overview-and-handover.md](01-project-overview-and-handover.md) | Executive overview, ownership, quick start, handover checklist, KT plan |
| [02-architecture-and-technical-design.md](02-architecture-and-technical-design.md) | System architecture, frontend, backend, worker, tenancy, auth, queues |
| [03-business-modules-and-workflows.md](03-business-modules-and-workflows.md) | Business lifecycle, modules, workflows, roles, UI behavior, edge cases |
| [04-api-database-and-data-model.md](04-api-database-and-data-model.md) | API catalog, database schemas, migrations, ERD, reporting/import data model |
| [05-security-operations-and-deployment.md](05-security-operations-and-deployment.md) | RBAC, sessions, audit, secrets, deployment, rollback, monitoring, support |
| [06-imports-reports-and-roadmap.md](06-imports-reports-and-roadmap.md) | Import ecosystem, reporting engine, exports, known issues, technical debt, roadmap |
| [07-procuredesk-production-deployment-on-clm-server.md](07-procuredesk-production-deployment-on-clm-server.md) | Step-by-step deployment runbook for existing CLM server with isolation and commands |
| [08-feature-deployment-runbook.md](08-feature-deployment-runbook.md) | Repeatable step-by-step runbook for deploying future feature changes, migrations, restarts, smoke tests, and rollback |

## Project Summary

ProcureDesk is a multi-tenant enterprise procurement workflow platform. It manages procurement cases from PR receipt through tender milestones, awards, RC/PO issue, contract validity, reporting, imports, planning, operations, and tenant administration.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript, TanStack Query, shared CSS/UI components |
| Backend | NestJS, Fastify, TypeScript, Zod validation |
| Database | PostgreSQL, SQL migrations, tenant-aware schemas, RLS migrations |
| Cache/Queues | Redis |
| Worker | TypeScript worker for imports, exports, notifications, reporting projections, outbox |
| Infra | Docker Compose, Nginx, Grafana assets |
| Auth | Session cookies, CSRF, RBAC permissions, entity scopes |

## Local Quick Start

```bash
pnpm install
pnpm docker:up
set -a
source .env
set +a
pnpm db:migrate
pnpm db:bootstrap:local
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000006_tenant_choice_categories.sql
pnpm dev
```

Local URLs:

- Web: `http://localhost:5175`
- API: `http://localhost:3100/api/v1`
- Health: `http://localhost:3100/api/v1/health`
- Readiness: `http://localhost:3100/api/v1/ready`
- Metrics: `http://localhost:3100/api/v1/metrics`

## Documentation Governance

- Keep these detailed handover files current.
- Do not create many small docs unless the team explicitly changes documentation strategy.
- Update docs in the same change as code, schema, deployment, permission, workflow, or user-facing behavior changes.
- Never commit real secrets, private production data, screenshots with sensitive values, or customer credentials.
