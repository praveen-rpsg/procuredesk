# 05. Security, Operations And Deployment

## 1. Security Model

Security controls:

- Session-based authentication.
- CSRF protection.
- RBAC permission checks.
- Entity scope checks.
- Password policy management.
- Audit logging.
- Rate limiting.
- Startup validation for required secrets.

Sensitive data rules:

- Do not log passwords.
- Do not log session secrets.
- Do not log CSRF secrets.
- Do not commit `.env`.
- Do not expose database or Redis URLs.
- Store imports/exports in private storage.

## 2. RBAC

Authorization model:

- Users have roles.
- Roles have permissions.
- Users can have entity scopes.
- UI hides actions without permission.
- API enforces actual access.

Representative permissions:

- `cases.read`
- `cases.create`
- `cases.update`
- `cases.delete`
- `reports.read`
- `reports.export`
- `imports.manage`
- `planning.manage`
- `operations.read`
- `audit.read`
- `catalog.manage`
- `admin.users.manage`
- `admin.roles.manage`
- `admin.entities.manage`
- `security.manage`

Governance rules:

- Preserve at least one active tenant admin.
- Protect system roles.
- Platform super-admin should be exceptional.
- Review custom roles before production release.

## 3. Audit Logging

Audit should capture:

- Login/logout.
- User changes.
- Role/permission changes.
- Entity/department changes.
- Case create/update/delete/restore.
- Award changes.
- Import create/commit.
- Export create/complete.
- Notification rule changes.
- Catalog changes.

Audit metadata should never contain secrets.

## 4. Secrets Management

Required secrets/config:

- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `CSRF_SECRET`
- `BOOTSTRAP_*`
- `PRIVATE_STORAGE_*`
- `MS_GRAPH_*` when email notifications are enabled.

Production rules:

- Store secrets in managed secret store.
- Rotate after exposure.
- Restart affected services after rotation.
- Validate login, API, worker, imports, exports after rotation.

## 5. Local Deployment

```bash
pnpm install
pnpm docker:up
set -a
source .env
set +a
pnpm db:migrate
pnpm db:bootstrap:local
pnpm dev
```

If using new choice-list category feature:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000006_tenant_choice_categories.sql
```

## 6. Production Deployment

Pre-deployment:

- Confirm release tag.
- Review migrations.
- Back up database.
- Confirm secrets.
- Run typecheck/build/tests.
- Confirm worker compatibility.
- Confirm rollback approach.

Deployment sequence:

1. Put system in maintenance mode if required.
2. Apply migrations.
3. Deploy API image.
4. Deploy worker image.
5. Deploy web image.
6. Reload Nginx/load balancer.
7. Run smoke tests.
8. Monitor logs, metrics, queues, and reports.

Smoke tests:

- Login.
- Open dashboard.
- Open cases.
- Create or edit a test case in staging.
- Open reports analytics.
- Open Admin Choice Lists.
- Queue and download export in staging.
- Confirm audit event creation.

## 7. Rollback

Rollback if:

- Login fails globally.
- Tenant data isolation is compromised.
- API cannot start.
- Migration breaks critical flows.
- Case create/edit is unavailable.
- Reports/imports return widespread 500s.

Application rollback:

1. Stop traffic to bad version.
2. Redeploy previous API/web/worker.
3. Verify health and readiness.
4. Validate login and core workflows.
5. Monitor errors.

Database rollback:

- Prefer forward fix unless a down migration has been tested.
- Restore from backup only with explicit approval and data loss analysis.

## 8. Monitoring

Health endpoints:

- `/api/v1/health`
- `/api/v1/ready`
- `/api/v1/metrics`

Monitor:

- API 5xx rate.
- API latency.
- Database connectivity.
- Redis connectivity.
- Worker heartbeat.
- Queue failures.
- Dead-letter growth.
- Import/export failure rate.
- Login failures.

Queue areas:

- imports.
- exports.
- notifications.
- reporting-projections.

## 9. Operational SOP

Daily:

- Check API health.
- Check worker health.
- Review dead letters.
- Review failed imports/exports.
- Confirm audit events are flowing.

Weekly:

- Review failed jobs.
- Review admin role/user changes.
- Confirm backups.
- Check storage usage.
- Review slow queries/indexes if available.

Monthly:

- Review access.
- Review secrets rotation plan.
- Review technical debt.
- Review documentation accuracy.

## 10. Support And Troubleshooting

Support levels:

| Level | Responsibility |
| --- | --- |
| L1 | User guidance, login triage, basic workflows |
| L2 | Data/config/import/report troubleshooting |
| L3 | Code, database, queue, integration, incident fixes |

Common issue: API startup fails with missing env values.

Fix:

```bash
set -a
source .env
set +a
pnpm dev
```

Common issue: `/api/v1/catalog` returns `500`.

Likely cause: migration missing.

Fix:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000006_tenant_choice_categories.sql
```

Common issue: notifications disabled.

Cause: Microsoft Graph variables missing. Expected locally unless testing email delivery.

