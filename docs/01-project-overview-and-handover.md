# 01. Project Overview And Handover

## 1. Executive Summary

ProcureDesk is an enterprise procurement management platform for tracking procurement cases, tender milestones, planning, reporting, imports, administrative configuration, audit activity, and operational reliability. It is built as a TypeScript monorepo with a React frontend, NestJS API, PostgreSQL database, Redis-backed runtime services, and a separate worker process.

The platform is designed for multi-tenant enterprise procurement teams. It supports tenant admins, scoped entity users, tender owners, reporting users, operations users, and platform-level administrators. The business model is centered on procurement cases and their lifecycle from PR receipt to RC/PO award and validity monitoring.

## 2. Product Scope

The current platform covers:

- Dashboard and executive procurement health overview.
- Procurement cases with preview, edit, milestones, owner assignment, delay tracking, and awards.
- Planning for tender plans and RC/PO expiry.
- Reports for analytics, tender details, running/completed tenders, vendor awards, stage time, and RC/PO expiry.
- Report saved views and asynchronous exports.
- Import system for tender cases, old contracts, portal user mapping, and user department mapping.
- Operations views for audit, notifications, dead letters, and queue/worker health.
- Admin management for users, roles, permissions, entities, departments, choice lists, tender rules, and password policy.

## 3. Repository Structure

| Path | Purpose |
| --- | --- |
| `apps/web` | React/Vite frontend |
| `apps/api` | NestJS API |
| `apps/worker` | Background worker process |
| `packages` | Shared package placeholders/contracts/config/types/UI |
| `db/migrations` | PostgreSQL migrations |
| `db/seeds` | Local/reference seed data |
| `infra/docker` | Dockerfiles and local Docker Compose |
| `infra/deploy` | Staging/production compose templates |
| `infra/nginx` | Nginx config |
| `infra/monitoring` | Grafana dashboard and alert assets |
| `docs` | This compact handover pack |

## 4. Local Development

Use the project root `.env` for local variables. Do not copy secret values into documentation, tickets, screenshots, or chat.

Start local services:

```bash
pnpm install
pnpm docker:up
set -a
source .env
set +a
pnpm dev
```

If the API fails on missing environment variables, it means `.env` was not loaded. Start with:

```bash
set -a
source .env
set +a
pnpm dev
```

If `/api/v1/catalog` returns `500` after choice-list changes, apply:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000006_tenant_choice_categories.sql
```

## 5. Important Runtime URLs

| Area | URL |
| --- | --- |
| Web | `http://localhost:5175` |
| API base | `http://localhost:3100/api/v1` |
| Health | `http://localhost:3100/api/v1/health` |
| Readiness | `http://localhost:3100/api/v1/ready` |
| Metrics | `http://localhost:3100/api/v1/metrics` |

## 6. Ownership And Contacts

These values must be filled during formal client handover.

| Function | Primary Owner | Backup | Contact |
| --- | --- | --- | --- |
| Product owner | TBD | TBD | TBD |
| Engineering owner | TBD | TBD | TBD |
| DevOps owner | TBD | TBD | TBD |
| Database owner | TBD | TBD | TBD |
| Security owner | TBD | TBD | TBD |
| Business SME | TBD | TBD | TBD |
| Support owner | TBD | TBD | TBD |

## 7. Handover Checklist

Code and repository:

- [ ] Repository access granted.
- [ ] Branching strategy explained.
- [ ] Package manager and Node version confirmed.
- [ ] Build commands verified.
- [ ] Typecheck/test commands verified.
- [ ] Documentation strategy explained.

Environment:

- [ ] Local setup completed by receiving team.
- [ ] Dev environment access granted.
- [ ] QA/UAT environment access granted.
- [ ] Production access process documented.
- [ ] Secret management process explained.
- [ ] Database backup/restore process reviewed.

Product:

- [ ] Procurement lifecycle explained.
- [ ] Dashboard demonstrated.
- [ ] Cases lifecycle demonstrated.
- [ ] Planning module demonstrated.
- [ ] Reports and exports demonstrated.
- [ ] Import templates and preview flow demonstrated.
- [ ] Admin/RBAC demonstrated.
- [ ] Operations/audit demonstrated.

Operations:

- [ ] Deployment runbook reviewed.
- [ ] Rollback process reviewed.
- [ ] Monitoring reviewed.
- [ ] Incident response flow reviewed.
- [ ] Known issues reviewed.
- [ ] Technical debt reviewed.

## 8. KT Plan

Recommended KT sessions:

| Session | Topic | Audience | Duration |
| --- | --- | --- | --- |
| 1 | Product overview and procurement lifecycle | Product, support, engineering | 60 min |
| 2 | Architecture and codebase | Engineering | 90 min |
| 3 | Database and migrations | Engineering, DBA | 60 min |
| 4 | Frontend UX and modules | Frontend, product | 60 min |
| 5 | API, RBAC, security | Backend, security | 90 min |
| 6 | Imports and reporting | Product, support, engineering | 90 min |
| 7 | Deployment and operations | DevOps, engineering | 90 min |
| 8 | Support scenarios and troubleshooting | Support, engineering | 60 min |

Exit criteria:

- Receiving team can run the project locally.
- Receiving team can explain the tenant/entity/user model.
- Receiving team can deploy and rollback.
- Receiving team can triage import, export, login, and catalog issues.
- Receiving team can safely update roles, users, entities, and choice lists.

## 9. Release Readiness Checklist

Before each release:

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] API tests pass.
- [ ] Worker tests pass.
- [ ] Migrations reviewed.
- [ ] Security/RBAC changes reviewed.
- [ ] UI smoke test completed.
- [ ] Import/report smoke test completed.
- [ ] Rollback note documented.
- [ ] This documentation updated.

## 10. Current Known Operational Notes

- Microsoft Graph email delivery is disabled unless `MS_GRAPH_*` variables are configured.
- Choice-list category support requires migration `000006_tenant_choice_categories.sql`.
- Swagger/Postman generation is not automated yet.
- Production contacts, support SLAs, and secret ownership must be finalized during handover.

