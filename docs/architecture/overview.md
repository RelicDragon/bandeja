# Monorepo overview

Bandeja (repo directory: `PadelPulse`). Multisport scheduling, chat, live scoring, club booking. Node 24 (`.nvmrc`, `engines.node` `>=24 <25`). npm 11+. PostgreSQL schema `padelpulse`. Redis optional (Socket.IO adapter + caches). Media on AWS S3 + CloudFront.

Do not copy `CLAUDE.md` enums or file counts. Schema: `Backend/prisma/schema.prisma`. Code map: [code-map.md](./code-map.md).

## Layout

| Path | Role |
|------|------|
| `Backend/` | Express 5 API + Socket.IO + Prisma + cron schedulers. Process entry `src/server.ts`. Queue-only process `src/worker.ts`. |
| `Frontend/` | React 19 + Vite SPA, Capacitor 8 native shell, Playwright e2e. Shared modules live in `Frontend/shared`. |
| `Admin/` | Plain JS dashboard (no bundler). Serve via `./Admin/serve.sh`, never `file://`. |
| `packages/chat-contract` | `@bandeja/chat-contract` — chat sync event types + sentinels. |
| `packages/unread-contract` | `@bandeja/unread-contract` — unread totals, merge, optimistic bump. |
| `packages/app-locale` | `@bandeja/app-locale` — shared UI locale registry + game-text translation policy. |
| `Frontend/shared` | npm package `@bandeja/shared`. FE Vite alias `@shared`. BE imports `@bandeja/shared/...`. Duplicate copies also live in `Backend/src/shared/` (parity tests). |

`Backend/tsconfig.json` has **no** `paths` / `@shared` aliases. Backend resolves shared code through `package.json` `"@bandeja/shared": "file:../Frontend/shared"` and local `Backend/src/shared/*`.

Frontend aliases (`Frontend/vite.config.ts` + `Frontend/tsconfig.json`):

| Alias | Target |
|-------|--------|
| `@` | `Frontend/src` |
| `@shared` | `Frontend/shared` |
| `@bandeja/shared` | `Frontend/shared` |
| `@backend` | `Backend/src` |
| `@bandeja/chat-contract` | `packages/chat-contract/src/index.ts` |
| `@bandeja/unread-contract` | `packages/unread-contract/src/index.ts` |
| `@bandeja/app-locale` | `packages/app-locale/src/index.ts` |

## Ports

| Process | Port | How |
|---------|------|-----|
| Backend HTTP + Socket.IO | **3000** | `PORT` default in `Backend/src/config/env.ts`. Bind `HOST` default `0.0.0.0`. |
| Frontend Vite | **3001** | `Frontend/vite.config.ts` `server.port`. |
| Admin UI | **9010** | `./Admin/serve.sh` (`ADMIN_PORT`). Proxies `/api` → tunnel `:9000` or `--dev` → `:3000`. |
| Prod API SSH tunnel | **9000** | `./Admin/run-ssh.sh` → `back.bandeja.com:3000`. |
| Prod DB SSH tunnel | **15432** | `./Admin/run-ssh.sh` → Postgres. |

## Request flow

```
Browser / Capacitor
  ├─ HTTP  Vite :3001  ──proxy──►  Express :3000
  │         /api                  /api/*  (routes/index.ts)
  │         /socket.io/           Socket.IO path /socket.io/  (Redis adapter if REDIS_URL)
  └─ native Capacitor: Axios base https://bandeja.me/api (no Vite proxy)
```

Web Axios uses relative `/api` (`Frontend/src/api/httpClient.ts` → `getApiAxiosBaseURL()`). Vite proxies `/api` and `/socket.io/` to `http://localhost:3000` (`changeOrigin`, Socket.IO `ws: true`).

```
HTTP:  helmet → CORS → json/urlencoded → compression → e2e ctx → morgan
     → /api rate limit → presence → routes → notFound → errorHandler
     Auth is per-route (authenticate / optionalAuth / requireAdmin), not global.

Socket.IO: JWT on handshake → rooms `game-{id}`, `notify-user-{id}`, `bug-{id}`, `user-chat-{id}`, `group-{id}`, `play-intent-pool:{cityId}`. Not `game:{id}` / `user:{id}`. See [realtime.md](./realtime.md).
           Redis adapter when REDIS_URL or SOCKET_IO_REDIS_URL is set.
```

Non-`/api` HTTP:

- `GET /health` — public liveness (`{ status, timestamp }`).
- `GET /api/health` — same payload via router.
- `GET /api/health/details` — admin JWT or loopback in non-production.
- `GET /games/:gameId` — Open Graph metatags (not the SPA JSON API).
- `/webhooks/*` — Replicate (raw body captured in `express.json` verify).

## Data stores

| Store | Where configured | Use |
|-------|------------------|-----|
| PostgreSQL | `DB_URL` + `DB_SCHEMA` (Prisma adapter default schema **`padelpulse`**) | All durable rows. Prisma 7: URL in `Backend/prisma.config.ts`, not in `schema.prisma`. |
| Redis | `REDIS_URL` / `SOCKET_IO_REDIS_URL` | Socket.IO adapter, translation queue, ads cache, webhook idempotency. In-process fallbacks when unset. |
| S3 | `AWS_*` in `Backend/src/config/env.ts` | Avatars, chat media, stories, results artifacts. CloudFront `AWS_CLOUDFRONT_DOMAIN`. |
| IndexedDB (Dexie) | `Frontend/src/services/chat/chatLocalDb.ts` | Chat messages, outbox, sync seq. **Not** TanStack Query. |

## Processes

| Process | Entry | Does |
|---------|-------|------|
| API | `Backend/src/server.ts` | HTTP, Socket.IO, Telegram bot, push, **all cron schedulers**, `startQueueWorkers()`. |
| Worker | `Backend/src/worker.ts` | Same queue workers only (translation, results artifacts, play-intent queues). Production can run this separately. |
| Vite | `Frontend` `npm run dev` | SPA + proxies. |
| Admin | `Admin/serve.sh` | Static UI + `/api` proxy. |

## Frontend shell

`Frontend/src/main.tsx` → `App.tsx` (`BrowserRouter` + `QueryProvider`). Capacitor: unregister SW, native plugins. Web: register `/sw.js` (PWA). Chat Dexie + background sync start in `main.tsx` before first paint.

Product constraints: `docs/APP_FUNCTIONALITY.md` / `docs/product/`. Ops: `docs/PRODUCTION.md`.
