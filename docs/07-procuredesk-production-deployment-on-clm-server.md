# 07. ProcureDesk Production Deployment On Existing CLM Server

This runbook is for deploying ProcureDesk on the existing CLM production server without impacting the currently running CLM production and CLM staging applications.

The approach is intentionally conservative:

- Do not modify `/opt/clm/production`.
- Do not modify `/opt/clm/staging`.
- Do not reuse existing CLM PM2 process names.
- Do not reuse existing CLM database.
- Do not reuse existing CLM application directories.
- Do not expose API, PostgreSQL, Redis, or MinIO directly to public users.
- Use `/opt/procuredesk` for application/runtime files.
- Use `/mnt/data/procuredesk` for persistent data, uploads, exports, backups, and future storage.

## 1. Target Architecture

```text
External users
    |
    | 80/443 only
    v
Nginx on DMZ server
    |
    | proxy to localhost only
    v
ProcureDesk Web/API/Worker
    |
    +--> PostgreSQL database: procuredesk_prod
    +--> Redis namespace or separate Redis instance
    +--> /mnt/data/procuredesk/private
    +--> /mnt/data/procuredesk/backups
```

Recommended final URL:

```text
https://procuredesk.<company-domain>
```

Temporary testing URL, only if domain is not ready:

```text
https://10.40.4.110:9443
```

Do not reuse existing staging URL:

```text
https://10.40.4.110:8443/login
```

## 2. Storage Allocation Strategy

Requested server disk layout:

```text
/                 80 GB    OS root
/var              120 GB   logs
/opt              100 GB   application services
/mnt/data         ~700 GB  PostgreSQL data, MinIO, backups, persistent storage
```

ProcureDesk allocation:

```text
/opt/procuredesk/
├── app            application repository
├── logs           PM2/app logs
├── backups        app-level backup scripts
├── ssl            SSL files if managed locally
├── creds          protected env files
└── scripts        deployment/health/backup scripts

/mnt/data/procuredesk/
├── private        private files used by app
├── uploads        import uploads if separated later
├── exports        generated report exports if separated later
├── postgres       optional, only if running a separate PG cluster/container
├── redis          optional, only if running separate Redis persistence
├── minio          future MinIO object storage
└── backups        DB/app backup files
```

## 3. Execution Model

You should execute the commands section by section.

After each checkpoint marked:

```text
STOP AND SHARE OUTPUT
```

pause and share the command output before continuing.

This prevents accidental impact to the existing CLM applications.

## 4. Phase 0 - Confirm Current Server State

Run these commands as `root`.

```bash
hostname
date
whoami
pwd
```

```bash
df -hT
```

```bash
lsblk -f
```

```bash
ss -tulpn
```

```bash
pm2 list
```

```bash
nginx -t
```

```bash
ls -la /opt
ls -la /opt/clm
ls -la /mnt
ls -la /mnt/data
```

STOP AND SHARE OUTPUT

Do not proceed until we confirm:

- `/mnt/data` has enough free space.
- existing CLM ports are known.
- existing PM2 process names are known.
- Nginx config is currently valid.

## 5. Phase 1 - Create Dedicated ProcureDesk User And Directories

This creates a separate Linux user and separate directories. It does not touch `/opt/clm`.

Check if user already exists:

```bash
id procuredesk || true
```

Create user if missing:

```bash
useradd -r -m -d /opt/procuredesk -s /bin/bash procuredesk
```

If the user already exists, skip the `useradd` command.

Create directories:

```bash
mkdir -p /opt/procuredesk/app
mkdir -p /opt/procuredesk/logs
mkdir -p /opt/procuredesk/backups
mkdir -p /opt/procuredesk/ssl
mkdir -p /opt/procuredesk/creds
mkdir -p /opt/procuredesk/scripts
```

Create persistent storage:

```bash
mkdir -p /mnt/data/procuredesk/private
mkdir -p /mnt/data/procuredesk/uploads
mkdir -p /mnt/data/procuredesk/exports
mkdir -p /mnt/data/procuredesk/postgres
mkdir -p /mnt/data/procuredesk/redis
mkdir -p /mnt/data/procuredesk/minio
mkdir -p /mnt/data/procuredesk/backups
```

Set ownership and permissions:

```bash
chown -R procuredesk:procuredesk /opt/procuredesk
chown -R procuredesk:procuredesk /mnt/data/procuredesk
chmod 750 /opt/procuredesk
chmod 700 /opt/procuredesk/creds
chmod 750 /mnt/data/procuredesk
```

Verify:

```bash
ls -ld /opt/procuredesk /opt/procuredesk/creds /mnt/data/procuredesk
find /opt/procuredesk -maxdepth 1 -type d -printf "%M %u %g %p\n"
find /mnt/data/procuredesk -maxdepth 1 -type d -printf "%M %u %g %p\n"
```

STOP AND SHARE OUTPUT

## 6. Phase 2 - Confirm Required Packages

Check installed tooling:

```bash
node -v || true
npm -v || true
pnpm -v || true
git --version || true
psql --version || true
redis-cli --version || true
nginx -v || true
pm2 -v || true
```

If `pnpm` is missing:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v
```

If `pm2` is missing:

```bash
npm install -g pm2
pm2 -v
```

STOP AND SHARE OUTPUT

Do not install or upgrade Node without confirming the current CLM apps compatibility. Existing CLM apps may depend on the current Node runtime.

## 7. Phase 3 - Database Isolation Plan

Best practice is to use a dedicated database and dedicated user:

```text
Database: procuredesk_prod
User:     procuredesk_user
```

First identify PostgreSQL access method. Try:

```bash
sudo -u postgres psql -c "select version();"
```

If that fails, check running Postgres process/container:

```bash
ps aux | grep -i '[p]ostgres'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || true
```

STOP AND SHARE OUTPUT

After PostgreSQL access is confirmed, create DB/user. Replace `CHANGE_ME_STRONG_PASSWORD` with a generated strong password and save it securely.

```bash
sudo -u postgres psql <<'SQL'
CREATE USER procuredesk_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE procuredesk_prod OWNER procuredesk_user;
GRANT ALL PRIVILEGES ON DATABASE procuredesk_prod TO procuredesk_user;
SQL
```

Validate:

```bash
sudo -u postgres psql -c "\l procuredesk_prod"
sudo -u postgres psql -c "\du procuredesk_user"
```

STOP AND SHARE OUTPUT

## 8. Phase 4 - Redis Isolation Plan

Option A, preferred if current Redis supports DB indexes:

```text
REDIS_URL=redis://127.0.0.1:6379/3
```

Option B, stronger isolation:

```text
Run a separate Redis instance for ProcureDesk on 127.0.0.1:6380.
```

First check current Redis:

```bash
redis-cli ping || true
redis-cli INFO server | head -20 || true
```

Check if Redis is containerized:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -i redis || true
```

STOP AND SHARE OUTPUT

For safest initial deployment, use Redis DB index `3` if Redis is shared:

```text
REDIS_URL=redis://127.0.0.1:6379/3
```

Do not run `FLUSHALL` or `FLUSHDB` on shared Redis.

## 9. Phase 5 - Clone ProcureDesk Repository

Run as root or switch to the application user. Preferred:

```bash
sudo -iu procuredesk
```

Clone:

```bash
cd /opt/procuredesk/app
git clone https://github.com/praveen-rpsg/procuredesk.git .
```

Verify:

```bash
git status --short --branch
git log --oneline -3
ls -la
```

STOP AND SHARE OUTPUT

## 10. Phase 6 - Create Production Environment File

Create:

```text
/opt/procuredesk/creds/procuredesk.env
```

Use this template. Replace all placeholders.

```bash
cat > /opt/procuredesk/creds/procuredesk.env <<'EOF'
NODE_ENV=production
APP_ENV=production

# Replace with final DNS name when available.
APP_URL=https://procuredesk.example.com
API_URL=https://procuredesk.example.com
VITE_API_URL=https://procuredesk.example.com/api/v1

PORT=3110

DATABASE_URL=postgres://procuredesk_user:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/procuredesk_prod
REDIS_URL=redis://127.0.0.1:6379/3

SESSION_SECRET=CHANGE_ME_64_PLUS_CHAR_RANDOM_SECRET
CSRF_SECRET=CHANGE_ME_64_PLUS_CHAR_RANDOM_SECRET
SESSION_COOKIE_NAME=procuredesk_session
CSRF_COOKIE_NAME=procuredesk_csrf
SESSION_TTL_HOURS=8
SESSION_IDLE_TIMEOUT_MINUTES=30

LOGIN_RATE_LIMIT_ATTEMPTS=10
LOGIN_RATE_LIMIT_WINDOW_MINUTES=15
LOGIN_RATE_LIMIT_LOCKOUT_MINUTES=15

BOOTSTRAP_TENANT_NAME=ProcureDesk
BOOTSTRAP_TENANT_CODE=PROD
BOOTSTRAP_TENANT_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_PLATFORM_ADMIN_EMAIL=platform@example.com

PRIVATE_STORAGE_DRIVER=local
PRIVATE_STORAGE_ROOT=/mnt/data/procuredesk/private
IMPORT_MAX_FILE_BYTES=26214400

# Optional email notifications. Leave blank until Microsoft Graph is ready.
MS_GRAPH_TENANT_ID=
MS_GRAPH_CLIENT_ID=
MS_GRAPH_CLIENT_SECRET=
MS_GRAPH_SENDER_MAILBOX=

OUTBOX_MAX_ATTEMPTS=5
OUTBOX_POLLING_INTERVAL_MS=10000
EOF
```

Secure it:

```bash
chown procuredesk:procuredesk /opt/procuredesk/creds/procuredesk.env
chmod 600 /opt/procuredesk/creds/procuredesk.env
ls -l /opt/procuredesk/creds/procuredesk.env
```

Generate strong secrets if needed:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

STOP AND SHARE OUTPUT

Important:

- Do not paste real secrets into chat.
- If sharing output, mask passwords and secrets.

## 11. Phase 7 - Install Dependencies And Build

Run as `procuredesk`:

```bash
sudo -iu procuredesk
cd /opt/procuredesk/app
```

Install:

```bash
pnpm install --frozen-lockfile
```

Build:

```bash
pnpm build
```

Verify build artifacts:

```bash
ls -la apps/api/dist
ls -la apps/worker/dist
ls -la apps/web/dist
```

STOP AND SHARE OUTPUT

## 12. Phase 8 - Run Database Migrations

Load environment:

```bash
set -a
source /opt/procuredesk/creds/procuredesk.env
set +a
```

Run migrations:

```bash
cd /opt/procuredesk/app
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_foundation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000002_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000003_idempotency.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000004_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000005_import_extensions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/committed/000006_tenant_choice_categories.sql
```

Seed reference/bootstrap data only if this is a fresh ProcureDesk database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/0001_reference_data.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/0002_local_bootstrap.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/0003_procurement_catalog_defaults.sql
```

Validate:

```bash
psql "$DATABASE_URL" -c "\dn"
psql "$DATABASE_URL" -c "select count(*) as tenants from iam.tenants;"
psql "$DATABASE_URL" -c "select code, name from iam.tenants;"
```

STOP AND SHARE OUTPUT

## 13. Phase 9 - Create PM2 Ecosystem File

Create PM2 config:

```bash
cat > /opt/procuredesk/app/ecosystem.procuredesk.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: "procuredesk-api",
      cwd: "/opt/procuredesk/app/apps/api",
      script: "dist/main.js",
      interpreter: "node",
      env_file: "/opt/procuredesk/creds/procuredesk.env",
      out_file: "/opt/procuredesk/logs/api.out.log",
      error_file: "/opt/procuredesk/logs/api.err.log",
      merge_logs: true,
      max_memory_restart: "700M"
    },
    {
      name: "procuredesk-worker",
      cwd: "/opt/procuredesk/app/apps/worker",
      script: "dist/main.js",
      interpreter: "node",
      env_file: "/opt/procuredesk/creds/procuredesk.env",
      out_file: "/opt/procuredesk/logs/worker.out.log",
      error_file: "/opt/procuredesk/logs/worker.err.log",
      merge_logs: true,
      max_memory_restart: "700M"
    }
  ]
};
EOF
```

Start API and worker:

```bash
pm2 start /opt/procuredesk/app/ecosystem.procuredesk.config.cjs
pm2 save
pm2 list
```

Validate local API:

```bash
curl -i http://127.0.0.1:3110/api/v1/health
curl -i http://127.0.0.1:3110/api/v1/ready
```

STOP AND SHARE OUTPUT

Important:

- This starts only `procuredesk-api` and `procuredesk-worker`.
- It does not touch current CLM PM2 processes.

## 14. Phase 10 - Serve Frontend With Nginx

Recommended best practice: serve static built frontend directly with Nginx instead of running Vite preview in production.

Frontend build path:

```text
/opt/procuredesk/app/apps/web/dist
```

Create Nginx config for temporary port `9443` first, to avoid touching current 443 virtual hosts.

```bash
cat > /etc/nginx/conf.d/procuredesk.conf <<'EOF'
server {
    listen 9443 ssl http2;
    server_name _;

    ssl_certificate     /opt/procuredesk/ssl/fullchain.pem;
    ssl_certificate_key /opt/procuredesk/ssl/privkey.pem;

    client_max_body_size 50m;

    access_log /var/log/nginx/procuredesk.access.log;
    error_log  /var/log/nginx/procuredesk.error.log;

    root /opt/procuredesk/app/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:3110/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
    }
}
EOF
```

If SSL certificates are not ready, do not reload Nginx yet. First share:

```bash
ls -l /opt/procuredesk/ssl
nginx -t
```

STOP AND SHARE OUTPUT

After SSL cert files are present and `nginx -t` passes:

```bash
systemctl reload nginx
```

Test:

```bash
curl -k -I https://127.0.0.1:9443/
curl -k -I https://127.0.0.1:9443/api/v1/health
```

STOP AND SHARE OUTPUT

## 15. Phase 11 - Firewall And DMZ Exposure

Final external exposure:

```text
Allow public/VPN as approved:
80/tcp   Nginx only, redirect to HTTPS
443/tcp  Nginx only

Temporary testing only:
9443/tcp Nginx ProcureDesk temporary listener

Restricted:
22/tcp   VPN/IP whitelist only

Do not expose:
3110/tcp API direct
5432/tcp PostgreSQL
6379/tcp Redis
9000/9001 MinIO unless explicitly planned and protected
```

Check current firewall:

```bash
firewall-cmd --list-all || true
iptables -S || true
```

STOP AND SHARE OUTPUT

Do not open ports until network/security team confirms DMZ rules.

## 16. Phase 12 - Final Smoke Test

Browser:

```text
https://10.40.4.110:9443
```

API:

```bash
curl -k https://10.40.4.110:9443/api/v1/health
curl -k https://10.40.4.110:9443/api/v1/ready
```

App checks:

- Login page opens.
- Login works.
- Dashboard opens.
- Cases page opens.
- Reports page opens.
- Admin > Choice Lists opens.
- Import template download works.
- Export job can be queued in staging/test only.

Server checks:

```bash
pm2 list
pm2 logs procuredesk-api --lines 50
pm2 logs procuredesk-worker --lines 50
tail -100 /var/log/nginx/procuredesk.error.log
tail -100 /var/log/nginx/procuredesk.access.log
```

STOP AND SHARE OUTPUT

## 17. Backup Strategy

Create backup script:

```bash
cat > /opt/procuredesk/scripts/backup-procuredesk.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

set -a
source /opt/procuredesk/creds/procuredesk.env
set +a

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/mnt/data/procuredesk/backups/$STAMP"
mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" > "$BACKUP_DIR/procuredesk_prod.sql"
tar -czf "$BACKUP_DIR/procuredesk_private_storage.tar.gz" -C /mnt/data/procuredesk private

find /mnt/data/procuredesk/backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -print -exec rm -rf {} \;

echo "Backup completed: $BACKUP_DIR"
EOF
```

Secure:

```bash
chmod 750 /opt/procuredesk/scripts/backup-procuredesk.sh
chown procuredesk:procuredesk /opt/procuredesk/scripts/backup-procuredesk.sh
```

Test manually:

```bash
/opt/procuredesk/scripts/backup-procuredesk.sh
ls -lah /mnt/data/procuredesk/backups
```

STOP AND SHARE OUTPUT

Add cron only after manual backup succeeds.

## 18. Rollback Plan

This rollback only disables ProcureDesk. It does not touch CLM.

```bash
pm2 stop procuredesk-api procuredesk-worker
pm2 save
mv /etc/nginx/conf.d/procuredesk.conf /etc/nginx/conf.d/procuredesk.conf.disabled
nginx -t
systemctl reload nginx
```

Verify CLM still works:

```bash
pm2 list
curl -k -I https://10.40.4.110:8443/login
```

## 19. Final Production Cutover From 9443 To 443

Only do this after:

- DNS is ready.
- SSL certificate is ready.
- Business smoke test passes on `9443`.
- Existing CLM Nginx server blocks are reviewed.

Change Nginx from:

```nginx
listen 9443 ssl http2;
server_name _;
```

to:

```nginx
listen 443 ssl http2;
server_name procuredesk.example.com;
```

Also update:

```text
APP_URL=https://procuredesk.example.com
API_URL=https://procuredesk.example.com
VITE_API_URL=https://procuredesk.example.com/api/v1
```

Rebuild web after changing `VITE_API_URL`:

```bash
sudo -iu procuredesk
cd /opt/procuredesk/app
set -a
source /opt/procuredesk/creds/procuredesk.env
set +a
pnpm --filter @procuredesk/web build
pm2 restart procuredesk-api procuredesk-worker --update-env
exit
nginx -t
systemctl reload nginx
```

## 20. What You Should Share With Me During Execution

Share outputs after these checkpoints:

1. Phase 0 server state.
2. Phase 1 directories and permissions.
3. Phase 2 tooling versions.
4. Phase 3 PostgreSQL access.
5. Phase 4 Redis access.
6. Phase 5 git clone verification.
7. Phase 6 env file permissions only, not secret contents.
8. Phase 7 build output.
9. Phase 8 migration/seed output.
10. Phase 9 PM2 and health output.
11. Phase 10 Nginx test and curl output.
12. Phase 12 final smoke test output.

Do not share real passwords, secrets, tokens, private keys, or full `.env` contents.

