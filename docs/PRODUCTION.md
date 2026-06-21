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

## Prerequisites

- SSH key: `~/.ssh/id_hetzner` (passphrase-protected)
- Git remote: `origin/master` is what production tracks
- Local commits must be **pushed** before deploy (servers `git reset --hard origin/master`)

Override deploy targets if needed:

```bash
UPD_BE_HOST=relic@back.bandeja.com \
UPD_FE_HOST=relic@front.bandeja.com \
UPD_SSH_KEY=$HOME/.ssh/id_hetzner \
./upd.sh
```

## Deploy: `upd.sh`

From repo root:

```bash
./upd.sh              # backend + frontend
./upd.sh be           # backend only
./upd.sh fe           # frontend only
./upd.sh push         # git push (if ahead) + backend + frontend
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
npm run build
pm2 restart backend
```

Migrations run as part of every backend deploy.

### Frontend deploy (`scripts/deploy-frontend.sh`)

On `front.bandeja.com`:

- Builds in a temp dir (includes `packages/chat-contract`)
- Sources `Frontend/build-env.sh` for prod Vite env (`VITE_API_BASE_URL=https://bandeja.me/api`, etc.)
- Moves build to `Frontend/releases/<timestamp>`
- Rotates symlinks: `dist` → new release, previous → `minus1` / `minus2`

### Alternative: GitHub Actions migrations

Workflow: **Actions → Prisma migrate deploy → Run workflow**

Uses secret `DATABASE_URL`. Use when you need migrations without a full backend deploy.

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
| `127.0.0.1:9000` | `back.bandeja.com:8080` | Admin static UI + proxied API |

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
2. Open `Admin/index.html` in a browser (file:// or simple static server)
3. Login: API URL **Production via SSH Tunnel (localhost:9000)**
4. Admin credentials: prod admin user (phone + password)

Default API URL in `Admin/app.js`: `http://localhost:9000/api`

## Safety guardrails

Code treats these as **production-like** DB URLs (`Backend/src/utils/dbEnvironment.ts`):

- Host markers: `bandeja.com`, `back.bandeja.com`, `thepadel`, `rds.amazonaws`, `hetzner`, `.prod.`, `/prod`

E2E tests refuse prod hosts and require `padelpulse_dev` (`Frontend/e2e/env-guard.ts`).

Non-production blocks push/Telegram to real users unless whitelisted (`TEST_USER_IDS`, `TEST_USER_PHONES` in `Backend/.env`).

**Do not:** run E2E against prod, `prisma migrate dev` on prod, or truncate prod tables.

## Agent checklist

| Task | Steps |
|------|--------|
| Deploy fix | Commit → `./upd.sh push` (or `be` / `fe`) |
| Read prod DB | `./Admin/run-ssh.sh &` → MCP `bandeja-prod-pg` |
| Run admin action | Tunnels up → `Admin/index.html` → localhost:9000 |
| Debug backend logs | `ssh relic@back.bandeja.com` → `pm2 logs backend` |
| Migrate only | GitHub Actions **Prisma migrate deploy** or backend deploy |
| Refresh local data | `Backend/sync-db-from-prod.sh` |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| MCP prod query fails | Start `Admin/run-ssh.sh`; verify `lsof -iTCP:15432 -sTCP:LISTEN` |
| Tunnel exits immediately | Check key: `ssh-add -l`; re-run script to unlock |
| Deploy didn't pick up commit | `./upd.sh push` or push manually first |
| Backend 502 after deploy | SSH to back → `pm2 logs backend`; check migrate/build errors |
| Admin login fails | Confirm tunnel on 9000; API URL = `http://localhost:9000/api` |
