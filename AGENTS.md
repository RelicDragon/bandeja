# AGENTS.md

**Must follow [`docs/agents/RULES.md`](docs/agents/RULES.md).** That file is the contract for Cursor, Claude Code, Codex, Copilot, Gemini, and Cloud.

Map: [`docs/README.md`](docs/README.md). Skills looking for CONTEXT/ADRs: [`CONTEXT-MAP.md`](CONTEXT-MAP.md) (do not treat root `CONTEXT.md` as the product glossary; do not create `docs/adr/`).

- Glossary: `docs/product/glossary.md`
- Constraints: `docs/product/constraints.md`
- Code map: `docs/architecture/code-map.md`
- Investigate: `docs/agents/how-to-investigate.md`

`Game.status` is `ANNOUNCED|STARTED|FINISHED|ARCHIVED`. Only `PLAYING` fills slots. Trainer is `Game.trainerId`. Chat events: `MESSAGE_CREATED`. Socket rooms: `game-{id}`, `notify-user-{id}`.

## Cursor Cloud

### Architecture

- **Backend**: Node.js/Express + Socket.IO + Prisma on port 3000 (`Backend/`)
- **Frontend**: React 19 + Vite + TailwindCSS on port 3001 (`Frontend/`)
- **Database**: PostgreSQL schema `padelpulse`, database `padelpulse_dev`

### Starting services

1. Start PostgreSQL: `sudo pg_ctlcluster 16 main start`
2. Backend: `cd Backend && npm run dev` (port 3000)
3. Frontend: `cd Frontend && npm run dev` (port 3001)

Frontend proxies `/api` and `/socket.io/` to backend port 3000 (`vite.config.ts`).

### Heavy command serialization

- Builds, tests, type checks, Prisma generation, and Playwright must never run concurrently within the same frontend or backend lane.
- One frontend and one backend heavy command may run simultaneously because they use separate locks.
- Use serialized npm scripts, or `./scripts/run-heavy …` for unwrapped commands.
- Never invoke `tsc`, `vite build`, Vitest, Playwright, backend test runners, or Prisma generation directly.
- Lint may run without the heavy-task lock.

### Database setup (first time only)

After PostgreSQL is running:

```
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb padelpulse_dev
sudo -u postgres psql -d padelpulse_dev -c "CREATE SCHEMA IF NOT EXISTS padelpulse;"
cd Backend && cp env.sample .env
npx prisma migrate dev
```

Set `FALLBACK_CITY_ID` in `Backend/.env` and seed at least one City row for registration.

### Prisma migrations

- Never `npx prisma db push`.
- Named migration: `cd Backend && npm run prisma:migrate` (or `npx prisma migrate dev --name <name>` via the heavy lock).
- Commit `Backend/prisma/migrations/.../migration.sql` with the schema change so production `npx prisma migrate deploy` can apply it.

### Key gotchas

- Registration requires a City row and `FALLBACK_CITY_ID`
- Ubuntu `pg_hba.conf` may need `md5` for `postgres` then `sudo pg_ctlcluster 16 main reload`
- Backend `.env` is gitignored; copy `env.sample`. Optional services degrade when tokens are empty
- Frontend env defaults live in `vite.config.ts`
- `test:automated` needs seeded data for some suites (e.g. 4+ users for live scoring)

### Lint and test

- Backend lint: `cd Backend && npm run lint`
- Frontend lint: `cd Frontend && npm run lint`
- Frontend tests: `cd Frontend && npm run test:live-scoring` (and other `test:*` scripts)
- Backend: `cd Backend && npm run test:automated`

### Production

**`docs/PRODUCTION.md`**: CI deploys on push to `master`; `./upd.sh` only as fallback. `Admin/run-ssh.sh` (15432 / 9000), `Admin/serve.sh` → `http://127.0.0.1:9010/`, MCP `bandeja-prod-pg`, `sync-db-from-prod.sh`.

### Mobile store releases

Web deploy does not ship stores. `./scripts/app-release.sh`. Baseline: `docs/APP_RELEASE.md` + `docs/app-release-baseline.txt`. See `docs/PRODUCTION.md` → *Mobile app store releases*.

## Agent skills

- Issues: GitHub `RelicDragon/bandeja` — `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- How skills consume docs: `docs/agents/domain.md`
