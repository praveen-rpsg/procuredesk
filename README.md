# ProcureDesk Platform

ProcureDesk is the clean rebuild of the procurement workstation as a production-grade, multi-tenant procurement command center.

This repository is intentionally separate from the legacy Flask application. The legacy application is a feature reference only.

## Architecture

- Modular monolith backend
- PostgreSQL primary database
- Redis for queues, cache, and coordination
- React API-first frontend
- Background worker process for imports, exports, notifications, and projections
- Microsoft Graph email delivery for notifications

## Workspace Layout

```text
apps/
  api/      NestJS API service
  web/      React/Vite frontend
  worker/   Background job processors
packages/
  contracts/      Shared API contracts and DTO schemas
  domain-types/   Shared domain constants and types
  ui/             Shared UI primitives
  config/         Shared configuration helpers
db/
  migrations/     PostgreSQL migrations
  seeds/          Reference data and bootstrap seeds
infra/
  docker/         Dockerfiles and compose files
  nginx/          Reverse proxy configuration
docs/
  architecture/   Architecture decisions and diagrams
  product/        Product and feature documentation
  ui-ux/          Design system and UX documentation
  operations/     Deployment and runbook documentation
```

## First Milestone

Phase 1 establishes the platform foundation only:

- monorepo structure
- API shell
- web shell
- worker shell
- shared packages
- strict TypeScript configuration
- local Docker stack
- environment template

Business modules are implemented in later phases according to `../PROCUREDESK_FULL_REBUILD_TODO_PLAN.md`.

## Local Start

Use [docs/operations/local-start.md](docs/operations/local-start.md) for the full local setup flow.
