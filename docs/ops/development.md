# Local development

Node **24** (`.nvmrc`, `package.json` engines `>=24 <25`). npm **11+**.

## Run

```
cp Backend/env.sample Backend/.env   # then set FALLBACK_CITY_ID + DB_URL
cd Backend && npm run dev            # :3000 (nodemon src/server.ts)
cd Frontend && npm run dev           # :3001 (Vite; proxies /api and /socket.io)
cd Backend && npm run worker         # translation / results-artifact queues
```

Bind: Backend `PORT` default 3000, `HOST` default `0.0.0.0`. Frontend Vite `port: 3001`.

## Env

- Backend: copy `Backend/env.sample`. Gitignored `.env`.
- **Registration / city:** `FALLBACK_CITY_ID` must be a real `City.id`. IP geo then this fallback (`user-city-bootstrap.service.ts`). Empty + no City row → registration/login city assign fails.
- DB: `DB_URL` / `DB_NAME=padelpulse_dev`, schema `padelpulse`. Shadow: `SHADOW_DB_URL`. Ubuntu `pg_hba` may need `md5` for `postgres` (see `AGENTS.md`).
- Auth knobs: `JWT_*`, `REFRESH_*`, `AUTH_MAX_ACTIVE_SESSIONS_PER_USER` — [architecture/auth.md](../architecture/auth.md).
- Telegram/OAuth/APNs/FCM/S3/AI: empty tokens degrade; Google/Apple client ids in `env.sample`.
- **Frontend:** no `.env` required. Defaults in `Frontend/vite.config.ts`:
  - Dev: `VITE_API_BASE_URL=http://localhost:3000/api`, `VITE_MEDIA_BASE_URL=http://localhost:3000`
  - Prod build: `https://bandeja.me/api` / `https://bandeja.me`
  - Also: `VITE_APP_SEMVER`, `VITE_DEPLOYMENT_ENV`, `VITE_ACCESS_REFRESH_LEEWAY_SECONDS` (default 120), `VITE_WEB_REFRESH_HTTPONLY_COOKIE`, sport flags.

## Prisma

Use serialized npm scripts (never concurrent with other Backend heavy tasks):

```
cd Backend
npm run prisma:generate    # scripts/run-heavy prisma generate
npm run prisma:migrate     # scripts/run-heavy prisma migrate dev
```

Unwrapped Prisma/tsc/vitest/playwright/backend tests: `./scripts/run-heavy …`. **Never** `npx prisma db push`. Named migrations; commit `Backend/prisma/migrations/`.

## Heavy-command lock

Lanes: frontend / backend / shared (`scripts/run-heavy`). Same lane never concurrent (builds, tests, typecheck, Prisma, Playwright). One FE + one BE heavy command may run together. Lint does **not** take the lock.

## Admin UI locally

`./Admin/serve.sh --dev` → http://127.0.0.1:9010/ (not `file://`). See [domains/admin.md](../domains/admin.md).

Prod deploy / tunnels: [ops/production.md](./production.md) → [PRODUCTION.md](../PRODUCTION.md).
