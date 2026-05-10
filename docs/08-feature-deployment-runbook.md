# ProcureDesk Feature Deployment Runbook

This runbook is for deploying normal ProcureDesk feature changes after the initial CLM server setup is complete. It assumes ProcureDesk is already installed on the CLM server under `/opt/procuredesk`, served through Nginx on the dry-run port `9443`, and managed by the `procuredesk` Linux user.

Use this process for frontend UI changes, API changes, worker changes, SQL migrations, seeds, and documentation-only releases.

## Current Production-Like Dry-Run Topology

| Item | Value |
| --- | --- |
| Application user | `procuredesk` |
| Repo path | `/opt/procuredesk/app` |
| Env file | `/opt/procuredesk/creds/procuredesk.env` |
| API port | `127.0.0.1:3110` |
| Public dry-run URL | `https://10.40.4.110:9443` |
| Nginx config | `/etc/nginx/conf.d/procuredesk.conf` |
| Web build output | `/opt/procuredesk/app/apps/web/dist` |
| PM2 apps | `procuredesk-api`, `procuredesk-worker` |
| PM2 home | `/opt/procuredesk/.pm2` |
| Database | `procuredesk_prod` |
| Redis | isolated ProcureDesk Redis on `127.0.0.1:6380` |

Do not modify existing CLM production/staging app directories, PM2 processes, Nginx server blocks, or databases unless explicitly planned.

## Release Safety Rules

- Deploy from `main` only after the code is pushed and verified locally.
- Never edit `.env`, secrets, or production credentials in Git.
- Never run destructive SQL without a backup and explicit approval.
- Run SQL migrations one file at a time with `ON_ERROR_STOP=1`.
- Stop on the first error and inspect root cause before continuing.
- Keep ProcureDesk isolated from existing CLM services.
- Always verify both API health and browser login after deployment.
- Keep the rollback commit hash available before pulling.

## Phase 1 - Local Pre-Deployment Checks

Run from the local repo:

```bash
cd "/Users/praveenvishnoi/Desktop/RPSG Projects/procurement/procuredesk-platform"
git status --short --branch
pnpm typecheck
pnpm build
```

If a database migration is included, review it carefully:

```bash
ls -la db/migrations/committed
git diff -- db/migrations db/seeds
```

For a frontend feature, verify the local UI manually:

```bash
pnpm dev
```

Open:

```text
http://localhost:5175
```

Minimum local smoke test:

- Login works.
- Dashboard loads.
- Changed module route loads.
- No console error from the changed flow.
- Tables/forms/drawers touched by the feature are usable.
- Build output succeeds.

## Phase 2 - Commit And Push

Commit the feature:

```bash
git status --short
git add <changed-files>
git commit -m "Describe feature or fix"
git push origin main
git log --oneline -3
```

Record:

- Previous server commit.
- New commit hash.
- Migration files included, if any.
- Feature flags or env changes, if any.

## Phase 3 - Server Pre-Deployment Snapshot

SSH to the CLM server and switch to the ProcureDesk user:

```bash
sudo -iu procuredesk
cd /opt/procuredesk/app
```

Check current state:

```bash
git status --short --branch
git log --oneline -5
pm2 list
curl -k -i https://10.40.4.110:9443/api/v1/health
curl -k -i https://10.40.4.110:9443/api/v1/ready
```

Record the current commit for rollback:

```bash
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "Rollback commit: $CURRENT_COMMIT"
```

Confirm environment is available in the shell:

```bash
set -a
source /opt/procuredesk/creds/procuredesk.env
set +a

echo "$DATABASE_URL" | sed -E 's#(postgres://[^:]+:)[^@]+@#\1***@#'
```

## Phase 4 - Database Backup Before Risky Releases

For UI-only or documentation-only releases, this can be skipped.

For API, migration, import, report, auth, role, or data-model changes, take a database backup first:

```bash
BACKUP_DIR="/mnt/data/procuredesk/backups/releases"
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/procuredesk_prod_$(date +%Y%m%d_%H%M%S)_pre_feature.dump"
pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_FILE"

ls -lh "$BACKUP_FILE"
```

Do not continue if backup fails.

## Phase 5 - Pull Code

Pull the latest `main`:

```bash
cd /opt/procuredesk/app
git fetch origin main
git pull --ff-only
git log --oneline -5
```

If `git pull --ff-only` fails, stop. Do not merge manually on the server. Fix Git state outside production deployment flow.

## Phase 6 - Install Dependencies If Needed

If `package.json`, workspace package manifests, or `pnpm-lock.yaml` changed:

```bash
pnpm install --frozen-lockfile
```

If dependencies did not change, skip this step.

## Phase 7 - Build

Build all packages:

```bash
pnpm build
```

If only API changed and a full build is too slow, API-only build is acceptable:

```bash
pnpm --filter @procuredesk/api build
```

If only worker changed:

```bash
pnpm --filter @procuredesk/worker build
```

If only web changed:

```bash
pnpm --filter @procuredesk/web build
```

Preferred default for release safety:

```bash
pnpm build
```

## Phase 8 - Apply Migrations

Only run migrations that are new for this release.

Check files:

```bash
ls -la db/migrations/committed
```

Run each migration individually:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/<migration-file>.sql
```

For seed changes, run only the relevant seed:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/<seed-file>.sql
```

Do not rerun local-only bootstrap seed in production-like dry run:

```text
db/seeds/0002_local_bootstrap.sql
```

That seed hardcodes local tenant values and should not be used for the deployed `PROD` tenant.

Migration verification examples:

```bash
psql "$DATABASE_URL" -c "\dn"
psql "$DATABASE_URL" -c "select code, name, status from iam.tenants order by created_at;"
psql "$DATABASE_URL" -c "select count(*) from iam.permissions;"
```

For login/auth changes:

```bash
psql "$DATABASE_URL" -c "select t.code, u.email, u.status, u.password_hash is not null as has_password from iam.users u left join iam.tenants t on t.id = u.tenant_id order by u.created_at;"
```

## Phase 9 - Restart ProcureDesk Services

ProcureDesk PM2 environment must include values from `/opt/procuredesk/creds/procuredesk.env`. The deployed PM2 ecosystem config should inline the env values and must be protected.

Check ecosystem file:

```bash
ls -l /opt/procuredesk/app/ecosystem.procuredesk.config.cjs
```

Restart:

```bash
pm2 restart procuredesk-api --update-env
pm2 restart procuredesk-worker --update-env
pm2 save
pm2 list
```

If environment changes were made or PM2 env looks stale, fully recreate ProcureDesk PM2 apps:

```bash
pm2 delete procuredesk-api procuredesk-worker
pm2 start /opt/procuredesk/app/ecosystem.procuredesk.config.cjs
pm2 save
pm2 list
```

Verify the API process has `DATABASE_URL`:

```bash
API_PID=$(pm2 pid procuredesk-api)
tr '\0' '\n' < /proc/$API_PID/environ | grep '^DATABASE_URL=' | sed -E 's#(postgres://[^:]+:)[^@]+@#\1***@#'
```

Expected database:

```text
procuredesk_prod
```

## Phase 10 - Nginx And Static Frontend Validation

Nginx serves the built frontend directly from:

```text
/opt/procuredesk/app/apps/web/dist
```

Validate Nginx syntax:

```bash
nginx -t
```

Reload only if Nginx config changed:

```bash
systemctl reload nginx
```

Check static frontend and API proxy:

```bash
curl -k -I https://10.40.4.110:9443/
curl -k -i https://10.40.4.110:9443/api/v1/health
curl -k -i https://10.40.4.110:9443/api/v1/ready
```

Expected:

- `/` returns `200`.
- `/api/v1/health` returns `status: ok`.
- `/api/v1/ready` returns `status: ready`.

If frontend returns `500`, inspect:

```bash
tail -80 /var/log/nginx/procuredesk.error.log
namei -l /opt/procuredesk/app/apps/web/dist/index.html
```

Nginx needs traverse access to `/opt/procuredesk`:

```bash
chmod o+x /opt/procuredesk
```

Do not make secret directories world-readable.

## Phase 11 - Functional Smoke Test

Browser URL:

```text
https://10.40.4.110:9443
```

Dry-run login:

```text
Tenant code: PROD
Email: tenant.admin@procuredesk.local
```

Run feature-specific smoke checks:

- Login succeeds.
- Dashboard loads.
- Changed route loads.
- API calls for changed feature return success.
- No browser console error.
- No failed asset or API request in DevTools Network.
- Imports/exports still queue if touched.
- Reports still load if reporting changed.
- Admin role/entity/choice-list screens still load if admin changed.

Server log checks:

```bash
pm2 logs procuredesk-api --lines 80 --nostream
pm2 logs procuredesk-worker --lines 80 --nostream
tail -80 /var/log/nginx/procuredesk.error.log
```

If logs show old historical errors, compare timestamps with current `date`.

## Phase 12 - Rollback

Rollback strategy depends on release type.

### Code-Only Rollback

If no migrations were applied:

```bash
cd /opt/procuredesk/app
git reset --hard "$CURRENT_COMMIT"
pnpm build
pm2 delete procuredesk-api procuredesk-worker
pm2 start /opt/procuredesk/app/ecosystem.procuredesk.config.cjs
pm2 save
```

Validate:

```bash
curl -k -i https://10.40.4.110:9443/api/v1/ready
curl -k -I https://10.40.4.110:9443/
```

### Migration Rollback

If migrations were applied, do not blindly reset code only. Decide one of:

- Apply a forward-fix migration.
- Restore the pre-release database backup.
- Manually reverse only the safe schema/data change after review.

Restore example for full DB rollback:

```bash
systemctl stop pm2-procuredesk
pg_restore --clean --if-exists --dbname "$DATABASE_URL" "$BACKUP_FILE"
systemctl start pm2-procuredesk
```

Only use full restore if approved. It can remove data created after the backup.

## Phase 13 - Post-Deployment Record

Record these in the deployment note or ticket:

- Deployment date/time.
- Deployed commit hash.
- Previous commit hash.
- Person deploying.
- Migrations/seeds run.
- Backup file path, if created.
- PM2 status.
- Health/ready result.
- Browser smoke result.
- Known issues or follow-ups.

Useful commands:

```bash
git log --oneline -3
pm2 list
systemctl status pm2-procuredesk --no-pager
ss -tulpn | egrep ':(9443|3110|6380)\b' || true
```

## Common Failure Patterns

### API Starts But Login Fails

Check API process env:

```bash
API_PID=$(pm2 pid procuredesk-api)
tr '\0' '\n' < /proc/$API_PID/environ | grep '^DATABASE_URL=' | sed -E 's#(postgres://[^:]+:)[^@]+@#\1***@#'
```

If missing, recreate PM2 apps using the ecosystem config that inlines env values.

### Frontend Loads Forever

Check browser DevTools Network:

- JS/CSS asset blocked or 404.
- API request failed.
- Certificate warning not accepted.
- CORS/CSP error.

Check from server:

```bash
curl -k -I https://10.40.4.110:9443/
curl -k -i https://10.40.4.110:9443/api/v1/ready
tail -f /var/log/nginx/procuredesk.access.log
```

### Port Not Reachable From Laptop

Check server listener:

```bash
ss -tulpn | grep 9443
firewall-cmd --query-port=9443/tcp
```

Open dry-run port only when approved:

```bash
firewall-cmd --add-port=9443/tcp --permanent
firewall-cmd --reload
```

From laptop:

```bash
nc -vz 10.40.4.110 9443
curl -k -I https://10.40.4.110:9443/
```

### PM2 Startup Service Fails

Check:

```bash
systemctl status pm2-procuredesk --no-pager
journalctl -u pm2-procuredesk --no-pager -n 120
sudo -iu procuredesk pm2 list
```

If generated PM2 startup unit has PID/protocol issues, use a `Type=simple` unit with:

```text
ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect --no-daemon
```

## Final Production Notes

For real production exposure:

- Replace self-signed SSL with CA-issued certs.
- Replace `.local` dry-run admin identities with real operational users.
- Rotate dry-run passwords and secrets.
- Move from temporary `9443` to approved `443` routing.
- Ensure SSH remains VPN/IP-whitelisted.
- Confirm DMZ/network team ACLs.
- Confirm backup and restore schedule.
- Confirm monitoring and alert ownership.
