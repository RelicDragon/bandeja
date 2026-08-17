# Production & deployment

Operational reference for Bandeja production: servers, SSH tunnels, deploys, database access, and admin UI.

## Topology

| Role | Host | SSH user | Repo path on server |
|------|------|----------|---------------------|
| Backend API | `back.bandeja.com` | `relic` | `~/src` |
| Frontend static | `front.bandeja.com` | `relic` | `~/src` |
| PostgreSQL | `188.245.101.10` (Hetzner) | `relic` | — |
| Public app | `https://bandeja.me` | — | — |

Backend runs under **pm2** (`pm2 restart backend`). Frontend uses versioned releases (`Frontend/releases/<timestamp>`) with `dist` → latest symlink.

Node **24** on servers (`nvm use 24`).

## Isolated web test environment

The frontend host also runs a production-data test clone at
`https://thisistestfor.bandeja.me`. It is isolated from production:

- Backend: `127.0.0.1:3100`, pm2 process `bandeja-test-backend`
- PostgreSQL 18: local-only database `padelpulse_test`
- Frontend: `/home/relic/bandeja-test/frontend-current`
- Source: `/home/relic/bandeja-test/source`
- nginx: `/etc/nginx/sites-available/bandeja-test.conf`
- Frontend is built with Vite mode `staging` and an explicit `VITE_DEPLOYMENT_ENV=staging`
- Every frontend route has a fixed `BETA · STAGING ENVIRONMENT · NOT PRODUCTION` banner
- Push, Telegram, S3 writes, Redis, AI, and Replicate are disabled in its generated backend environment

Deploy the **current local working tree** (including uncommitted changes):

```bash
./scripts/deploy-test.sh
```

Dependencies are reused until their lockfiles change. Both backend and frontend
are rebuilt; Prisma migrations run against only `padelpulse_test`; the frontend
release is switched atomically.

Replace the test database with a fresh streamed production clone, then deploy:

```bash
./scripts/deploy-test.sh --refresh-db
```

`--refresh-db` is destructive only to `padelpulse_test`; it never writes to the
production database. The production dump is streamed between SSH sessions and
is not stored on disk.

First-time/idempotent provisioning and TLS setup:

```bash
./scripts/deploy-test.sh --provision --refresh-db
./scripts/deploy-test.sh --tls
```

Operational checks:

```bash
ssh -i ~/.ssh/id_hetzner relic@front.bandeja.com
pm2 logs bandeja-test-backend
cat /home/relic/bandeja-test/deployment.txt
```

The cloned database contains production personal data. Treat the server and its
test credentials as production-sensitive even though outbound integrations are
disabled.

## Prerequisites

- SSH key: `~/.ssh/id_hetzner` (passphrase-protected)
- Git remote: `origin/master` is what production tracks
- Commits must be on **`origin/master`** before production updates (servers `git reset --hard origin/master`)

## Deploy

### CI deploy (default)

**Pushing to `master` deploys production automatically.** You do not need to run `./upd.sh` locally after a normal merge/push.

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

1. **On every push/PR to `master`:** `backend` and `frontend` jobs — lint, build, and targeted tests.
2. **On push to `master` only:** `deploy` job runs after both pass.
3. **Deploy runner:** self-hosted (`runs-on: [self-hosted, linux, production]`).
4. **What it runs:** `./upd.sh` with auto-detect (`UPD_BE_HOST=local`, `UPD_FE_HOST=relic@10.0.0.2` over the private network).

**Agent / human flow for a production fix:**

```bash
git push origin master   # enough — wait for CI deploy job
```

Check **Actions → CI → Deploy production**. Do **not** also run `./upd.sh` from your laptop unless CI is down or you are doing an intentional manual deploy.

### Manual deploy: `upd.sh` (escape hatch)

Use only when CI deploy is unavailable, you need a hotfix without waiting for CI, or you are debugging the deploy scripts themselves. Running `./upd.sh` locally while CI is also deploying the same commit causes a **duplicate deploy**.

Override deploy targets if needed:

```bash
UPD_BE_HOST=relic@back.bandeja.com \
UPD_FE_HOST=relic@front.bandeja.com \
UPD_SSH_KEY=$HOME/.ssh/id_hetzner \
./upd.sh
```

From repo root:

```bash
./upd.sh              # auto-detect backend and/or frontend from server..origin/master diff
./upd.sh be           # backend only
./upd.sh fe           # frontend only
./upd.sh push         # git push (if ahead) + auto deploy
./upd.sh be push      # push + backend only
```

What it does remotely:

1. `cd ~/src && git fetch origin && git reset --hard origin/master`
2. Runs `~/src/scripts/deploy-backend.sh` or `deploy-frontend.sh`

### Backend deploy (`scripts/deploy-backend.sh`)

On `back.bandeja.com`:

```bash
cd Backend
npm ci
npx prisma migrate deploy
npx prisma generate
npm run seed:sticker-packs   # official reactions + padel packs (idempotent)
npm run build
pm2 restart backend
```

Migrations run as part of every backend deploy. Sticker seed upserts catalog rows and uploads/reuses assets under `uploads/stickers/packs/…` when AWS/S3 is configured. Safe to re-run.

### Auth refresh rollout

The hardened refresh flow is backward-compatible, so deploy the backend and database migration before forcing mobile clients to update. Clients that send `X-Refresh-Request-Id` get one-time rotation with idempotent lost-response replay; older clients temporarily keep a stable per-device credential. After the updated iOS/Android builds are available, set a blocking `AppVersionRequirement` for each platform in Admin (`minBuildNumber` = the new build). That is the user-facing force-update control; `MIN_CLIENT_VERSION_FOR_REFRESH` is the separate legacy-JWT issuance floor.

Production startup now refuses an unsafe web-token configuration. Keep these values in `Backend/.env`:

```bash
REFRESH_WEB_HTTPONLY_COOKIE=true
REFRESH_WEB_HTTPONLY_JSON_BODY=false
AUTH_MAX_ACTIVE_SESSIONS_PER_USER=20
AUTH_SESSION_RETENTION_DAYS=30
AUTH_REFRESH_EVENT_RETENTION_DAYS=30
AUTH_REFRESH_ALERT_MIN_ATTEMPTS=20
AUTH_REFRESH_ALERT_FAILURE_PERCENT=20
AUTH_REFRESH_ALERT_COOLDOWN_MINUTES=60
```

The migration adds idempotency state and durable, token-free refresh telemetry. A five-minute production monitor alerts only on infrastructure outcomes (`error`, `refreshBusy`) when the 15-minute rate reaches the configured minimum sample and percentage, with a cooldown so the same window is not re-paged every 5 minutes. Expected client rejects (`refreshInvalid`, `refreshExpired`, `refreshTokenRequired`, `refreshReused`) are counted separately and do not page. Daily maintenance removes expired/revoked session history and old telemetry. Verify `/health/details` after deploy and watch for `Auth refresh degradation` alerts before changing the force-update floor.

**Giphy / Klipy:** paste URL→GIF works without keys (CDN rewrite for direct media). Composer GIF search needs `GIPHY_API_KEY` and/or `KLIPY_API_KEY` in Backend `.env` on the server (Giphy preferred, Klipy fallback); without both, `/giphy/status` is unavailable and the GIF tray/attach entry stays hidden.

### Frontend deploy (`scripts/deploy-frontend.sh`)

On `front.bandeja.com`:

- Builds in a temp dir (includes `packages/chat-contract`)
- Sources `Frontend/build-env.sh` for prod Vite env (`VITE_API_BASE_URL=https://bandeja.me/api`, etc.)
- Moves build to `Frontend/releases/<timestamp>`
- Rotates symlinks: `dist` → new release, previous → `minus1` / `minus2`

### Alternative: GitHub Actions migrations

Workflow: **Actions → Prisma migrate deploy → Run workflow**

Uses secret `DATABASE_URL`. Use when you need migrations without a full backend deploy.

## Mobile app store releases

Web deploy (CI / `upd.sh`) does **not** ship Android or iOS. Native apps are built locally and submitted to Google Play and App Store separately.

### Unified CLI (recommended)

```bash
./scripts/app-release.sh
```

Interactive flow: choose target (**Both** by default, **Android**, or **iOS**), propose version/build, draft What's new (AI, custom, or template), build the selected signed artifact(s), upload to the selected store(s), verify store state, then update baseline. Non-interactive target: `./scripts/app-release.sh --platform android|ios|both`. The iOS upload waits for App Store Connect processing before it writes What's New metadata and optionally submits for review; if Apple is still processing, resume later with `APP_RELEASE_RESUME=1`. Planner-only rehearsal: `APP_RELEASE_DRY_RUN=1`.

Store credentials (`Backend/.env` or shell): `PLAY_STORE_JSON_KEY_PATH` (or `GOOGLE_PLAY_JSON_KEY`), `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`. Fastlane: `cd Frontend && bundle install`.

Full reference, signing setup, and internal-track smoke test: **`docs/APP_RELEASE.md`**.

### Baseline marker

After each store release, the baseline is updated automatically from native version files + `HEAD` (by the CLI after store verification, or manually via mark-shipped):

| File | Purpose |
|------|---------|
| `docs/APP_RELEASE.md` | Version, build, date, history table |
| `docs/app-release-baseline.txt` | One line: full commit SHA of last shipped release |

Current baseline: see **`docs/APP_RELEASE.md`**.

### Headless fallback

1. `./scripts/app-release-whats-new.sh` — draft What's new
2. Bump versions in Gradle + Xcode, commit
3. Build and submit manually
4. `./scripts/app-release-mark-shipped.sh --commit`

Pushing to `master` still updates the web app immediately; mobile users get new features on their next app update from the stores.

## SSH tunnels: `Admin/run-ssh.sh`

Production DB and admin API are not exposed publicly. Use local port forwards.

```bash
# Foreground (Ctrl+C stops tunnels)
./Admin/run-ssh.sh

# Background (for agents / long sessions)
./Admin/run-ssh.sh &
```

Creates two tunnels:

| Local | Remote | Purpose |
|-------|--------|---------|
| `127.0.0.1:15432` | `188.245.101.10:5432` | PostgreSQL |
| `127.0.0.1:9000` | `back.bandeja.com:3000` | Prod API via `relic` SSH (Admin UI is local `./Admin/serve.sh` on `:9010`) |

Script loads `~/.ssh/id_hetzner` into `ssh-agent` (macOS: keychain). Keeps tunnels alive with `ServerAliveInterval=60`.

**Agent rule:** Before using MCP `bandeja-prod-pg`, confirm DB access works. If MCP fails, start `Admin/run-ssh.sh` in the background and keep it running until done.

### Manual tunnel (DB only)

```bash
ssh -N \
  -o IdentitiesOnly=yes \
  -o IdentityFile=$HOME/.ssh/id_hetzner \
  -L 127.0.0.1:15432:127.0.0.1:5432 \
  relic@188.245.101.10
```

### Direct server SSH

```bash
ssh -i ~/.ssh/id_hetzner relic@back.bandeja.com   # backend
ssh -i ~/.ssh/id_hetzner relic@front.bandeja.com  # frontend
ssh -i ~/.ssh/id_hetzner root@back.bandeja.com    # admin tunnel target (root)
ssh -i ~/.ssh/id_hetzner relic@188.245.101.10     # DB host
```

## Database

### Schema

- Database name on prod: configured in server `Backend/.env` (not in repo)
- Schema: `padelpulse` (`DB_SCHEMA=padelpulse`)
- Dev names: `padelpulse_dev`, `padelpulse_shadow` — **never** run destructive scripts against prod

### MCP (Cursor): `bandeja-prod-pg`

Read-only SQL via MCP. Requires **DB tunnel on port 15432** (`Admin/run-ssh.sh`).

1. Start tunnel
2. Use MCP tool `query` with SQL
3. Stop tunnel when finished (or leave background job running for the session)

Dev DB MCP: `bandeja-dev-pg` — local PostgreSQL, no tunnel.

### psql via tunnel

With tunnel up, connect using credentials from prod `Backend/.env` on the server (or your local secret store):

```bash
PGPASSWORD='…' psql -h 127.0.0.1 -p 15432 -U <user> -d <dbname>
```

Example introspection:

```sql
SET search_path TO padelpulse;
SELECT COUNT(*) FROM "User";
```

### Sync prod data → local dev

**Data only** (preserves local schema / migrations):

```bash
cd Backend
./sync-db-from-prod.sh
```

Uses SSH to `relic@back.bandeja.com`, `pg_dump --data-only` on prod, restores into local `Backend/.env` database. Preserves local `city.telegramChannelId` values.

## Admin panel

1. Start tunnels: `./Admin/run-ssh.sh`
2. Start same-origin UI: `./Admin/serve.sh` (proxies `/api` → tunnel `:9000`)
3. Open **`http://127.0.0.1:9010/`** — login API URL **`/api`**
4. Admin credentials: prod admin user (phone + password)

Local backend instead of tunnel: `./Admin/serve.sh --dev` (proxies → `:3000`).

**Do not** open `Admin/index.html` via `file://` — prod CORS rejects `Origin: null` (#310). The serve proxy keeps Admin same-origin so Admin does not depend on CORS allowlisting.

CORS allowlist (app clients, HTTP + Socket.IO): `https://bandeja.me`, `https://www.bandeja.me`, Capacitor `https://localhost` + `capacitor://localhost`. Dev also allows Vite `:3001` and Admin serve `:9010`. Optional extras: `CORS_ALLOWED_ORIGINS`.

### Trust proxy & client IP

Express `trust proxy` defaults to **1 hop** (`TRUST_PROXY`). Rate limits and `getClientIp` use trusted `req.ip` only — never raw `X-Forwarded-For` / `cf-connecting-ip` from the client.

The edge (Cloudflare / nginx) **must overwrite** client-supplied `X-Forwarded-For` with the real client IP for the trusted hop. Misconfigured hops make rate-limit buckets spoofable. Set `TRUST_PROXY=false` only when the API is reached with no reverse proxy.

### Replicate webhooks

Set both `REPLICATE_WEBHOOK_URL` and `REPLICATE_WEBHOOK_SECRET` (from Replicate default webhook signing secret). URL without secret → webhooks are not registered (poll-only). Inbound `/webhooks/replicate` verifies signature + timestamp and dedupes `webhook-id` via Redis `SET NX` when `REDIS_URL` is set (required for multi-node); single-node falls back to in-process cache. Claims are released if apply fails so Replicate retries can succeed.

## Safety guardrails

Code treats these as **production-like** DB URLs (`Backend/src/utils/dbEnvironment.ts`):

- Host markers: `bandeja.com`, `back.bandeja.com`, `thepadel`, `rds.amazonaws`, `hetzner`, `.prod.`, `/prod`

E2E tests refuse prod hosts and require `padelpulse_dev` (`Frontend/e2e/env-guard.ts`).

Non-production blocks push/Telegram to real users unless whitelisted (`TEST_USER_IDS`, `TEST_USER_PHONES` in `Backend/.env`).

### Global API rate limit

Per-IP limiter on `/api/` (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_SKIP_PATH_PREFIXES`). Production default max is **3000** / 15 min; Default skips (pathname prefix on `req.path` only): admin log stream, auth refresh, chat sync, unread-objects — each already has dedicated protection. See `Backend/env.sample` and #313.

**Do not:** run E2E against prod, `prisma migrate dev` on prod, or truncate prod tables.

## Agent checklist

| Task | Steps |
|------|--------|
| Deploy fix | Commit → push/merge to `master` → CI deploy job (do not run `./upd.sh` unless CI is down) |
| Manual deploy | `./upd.sh` or `./upd.sh be` / `fe` — only when CI unavailable |
| Draft app What's new | `./scripts/app-release-whats-new.sh` → see `docs/APP_RELEASE.md` |
| Ship mobile app update | `./scripts/app-release.sh` (or headless: bump → submit → `./scripts/app-release-mark-shipped.sh --commit`) |
| Read prod DB | `./Admin/run-ssh.sh &` → MCP `bandeja-prod-pg` |
| Run admin action | Tunnels up → `./Admin/serve.sh` → `http://127.0.0.1:9010/` (API `/api`) |
| Debug backend logs | `ssh relic@back.bandeja.com` → `pm2 logs backend` |
| Migrate only | GitHub Actions **Prisma migrate deploy** or backend deploy |
| Refresh local data | `Backend/sync-db-from-prod.sh` |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| MCP prod query fails | Start `Admin/run-ssh.sh`; verify `lsof -iTCP:15432 -sTCP:LISTEN` |
| Tunnel exits immediately | Check key: `ssh-add -l`; re-run script to unlock |
| Deploy didn't pick up commit | Confirm push reached `origin/master`; check Actions → CI → Deploy production; manual fallback: `./upd.sh` |
| Backend 502 after deploy | SSH to back → `pm2 logs backend`; check migrate/build errors |
| Admin login fails | Confirm tunnel on 9000 + `./Admin/serve.sh`; open **`http://127.0.0.1:9010/`** (not `file://`); API URL = `/api` |
