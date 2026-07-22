# AGENTS.md

## Cursor Cloud specific instructions

### Architecture
- **Backend**: Node.js/Express + Socket.IO + Prisma ORM on port 3000 (`Backend/`)
- **Frontend**: React 19 + Vite + TailwindCSS on port 3001 (`Frontend/`)
- **Database**: PostgreSQL with schema `padelpulse`, database `padelpulse_dev`

### Starting services
1. Start PostgreSQL: `sudo pg_ctlcluster 16 main start`
2. Backend: `cd Backend && npm run dev` (nodemon with ts-node, port 3000)
3. Frontend: `cd Frontend && npm run dev` (Vite dev server, port 3001)

Frontend proxies `/api` and `/socket.io/` to backend port 3000 (configured in `vite.config.ts`).

### Database setup (first time only)
After PostgreSQL is running:
```
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb padelpulse_dev
sudo -u postgres psql -d padelpulse_dev -c "CREATE SCHEMA IF NOT EXISTS padelpulse;"
cd Backend && cp env.sample .env
npx prisma migrate dev
```
Set `FALLBACK_CITY_ID` in `Backend/.env` and seed at least one City row for registration to work.

### Prisma migrations
- Never use `npx prisma db push` for schema changes.
- Always create a named migration with `cd Backend && npx prisma migrate dev --name <descriptive_name>`.
- Commit the generated `Backend/prisma/migrations/.../migration.sql` with the Prisma schema change so production `npx prisma migrate deploy` can apply it.

### Key gotchas
- Registration requires a City row in the database and `FALLBACK_CITY_ID` in `.env` pointing to it
- `pg_hba.conf` defaults to `peer` auth on Ubuntu; must change to `md5` for the `postgres` user and reload: `sudo pg_ctlcluster 16 main reload`
- Backend `.env` is gitignored; copy from `env.sample`. Most optional services (Telegram, APNs, FCM, S3, AI) work gracefully when tokens are empty
- Prisma schema is at `Backend/prisma/schema.prisma`; schema changes must be paired with a named migration
- The `test:automated` script (`Backend/scripts/tests/run-all.ts`) runs several QA suites; some require seeded data (e.g. 4+ users for match live scoring)
- Frontend env vars have defaults in `vite.config.ts` so no `.env` file is needed for the frontend

### Lint & test commands
- Backend lint: `cd Backend && npm run lint`
- Frontend lint: `cd Frontend && npm run lint`
- Frontend tests: `cd Frontend && npm run test:live-scoring`
- Backend automated tests: `cd Backend && npm run test:automated`

### Production (deploy, SSH tunnels, prod DB)

See **`docs/PRODUCTION.md`**: CI deploys on push to `master` (no local `./upd.sh` needed); manual `./upd.sh` only as fallback. Also: `Admin/run-ssh.sh` (ports 15432 / 9000), `Admin/serve.sh` → `http://127.0.0.1:9010/` (Admin UI), MCP `bandeja-prod-pg`, `sync-db-from-prod.sh`.

### Mobile app store releases (Android / iOS)

Separate from web deploy — native builds are submitted manually to Google Play and App Store.

- **Unified CLI:** `./scripts/app-release.sh` (bump → build → upload → baseline; resume with `APP_RELEASE_RESUME=1`)
- Baseline marker: **`docs/APP_RELEASE.md`** + **`docs/app-release-baseline.txt`** (last shipped commit)
- Draft **What's new**: `./scripts/app-release-whats-new.sh` (LLM from commits since baseline; raw list: `./scripts/app-release-changes.sh`)
- Headless mark-shipped: `./scripts/app-release-mark-shipped.sh --commit`

Full workflow: **`docs/PRODUCTION.md`** → *Mobile app store releases*.

## Agent skills

### Issue tracker

GitHub Issues on `RelicDragon/bandeja`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — see `docs/agents/domain.md` and `docs/README.md`.
