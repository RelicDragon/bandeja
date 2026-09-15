# Backend

Express **5.2**, TypeScript **6.0.3**, Prisma **7.8**, Socket.IO **4.8** with `@socket.io/redis-adapter`.

Pattern: **route → controller → service → Prisma**. Controllers call `next(error)`. Services throw `ApiError`.

## Process entries

| File | Role |
|------|------|
| `Backend/src/app.ts` | Express app, middleware, mounts `/api`, `/health`, `/webhooks`, OG `GET /games/:gameId`. |
| `Backend/src/server.ts` | DB connect, Telegram + push, **cron schedulers**, HTTP server, Socket.IO, `startQueueWorkers()`, graceful shutdown. |
| `Backend/src/worker.ts` | DB connect + `startQueueWorkers()` only. |
| `Backend/src/workers/startQueueWorkers.ts` | Queue worker start/stop. |

`npm run dev` = nodemon `src/server.ts`. `npm run worker` = `ts-node src/worker.ts`. `npm run start` = `node dist/server.js`.

## Middleware order (`app.ts`)

1. `app.set('trust proxy', config.trustProxy)` — default 1 hop (`TRUST_PROXY`).
2. `helmet` — `crossOriginEmbedderPolicy: false`, CORP `cross-origin`.
3. OPTIONS preflight — `reflectCorsOrigin` (allowlist only, never reflect arbitrary / `null`).
4. `cors` — credentials, methods GET/POST/PUT/DELETE/PATCH/OPTIONS. Extra headers: `X-Client-Version`, `X-Client-Platform`, `X-Refresh-Request-Id`, `X-E2E-Test`, `X-Klikteren-Cookie`. Exposed: `ETag`, `X-Response-Size`, `X-Klikteren-Set-Cookie`.
5. `express.json({ limit: '5mb' })` — stores `rawBody` for `/webhooks/replicate`.
6. `express.urlencoded({ extended: true, limit: '5mb' })`.
7. `compression` — JSON always; skip if `x-no-compression`; threshold 1024.
8. Wrap `res.send` → `X-Response-Size`.
9. `e2eTestContextMiddleware`.
10. `morgan` (`dev` locally, combined + response-time otherwise).
11. `express-rate-limit` on **`/api/`** — skip prefixes from `config.apiRateLimit.skipPathPrefixes`; key = `rateLimitKeyFromRequest`.
12. `recordPresenceActivity` on `/api`.
13. `GET /health` (public).
14. `/webhooks` → `replicateWebhook.routes`.
15. `GET /games/:gameId` → metatags controller (SSR OG, not JSON API).
16. `/api` → `routes/index.ts`.
17. `notFoundHandler` → `errorHandler`.

Auth is **not** global. Per-route: `authenticate`, `optionalAuth`, `requireAdmin`, `requireGamePermission*` in `Backend/src/middleware/auth.ts`. Token extract/load: `middleware/authToken.ts`. Refresh CSRF-ish origin: `middleware/refreshOrigin.ts`. Zod: `validateZod.ts`. express-validator: `validate.ts`.

## Errors

`Backend/src/utils/ApiError.ts`: `statusCode`, `isOperational`, optional `data` (spread onto JSON, often `{ code: 'auth.noToken' }`).

`errorHandler`: ApiError → `{ success: false, message, ...data }`; JSON parse fail 400; Multer `LIMIT_FILE_SIZE` 413; else 500. CORS reflected on error responses. Chat sync paths can log `chat_sync_http_error` when `chatSyncHttpErrorLog` is on.

## Route mounting (`routes/index.ts`)

Mounted under `/api`:

| Mount | File |
|-------|------|
| `GET /health` | public payload |
| `GET /health/details` | admin or local loopback (non-prod) |
| `/app` | `app.routes` |
| `/me` | `me.routes` |
| `/auth` | `auth.routes` (login, OAuth, refresh, sessions, `POST /auth/attribution`) |
| `/telegram` | `telegramAuth.routes` |
| `/users` | `user.routes` |
| `/cities` | `city.routes` |
| `/clubs` | `club.routes` |
| `/courts` | `court.routes` |
| `/games` | `game.routes` |
| `/game-teams` | `gameTeam.routes` |
| `/leagues` | `league.routes` |
| `/results` | `results.routes` |
| `/invites` | `invite.routes` |
| `/rankings` | `ranking.routes` |
| `/admin` | `admin.routes` |
| `/logs` | `logs.routes` |
| `/chat` | `chat.routes` |
| `/stickers` | `stickers.routes` |
| `/giphy` | `giphy.routes` |
| `/link-preview` | `linkPreview.routes` |
| `/media` | `media.routes` |
| `/favorites` | `favorites.routes` |
| `/bugs` | `bug.routes` |
| `/game-courts` | `gameCourt.routes` |
| `/transactions` | `transaction.routes` |
| `/goods` | `goods.routes` |
| `/level-changes` | `levelChange.routes` |
| `/push` | `push.routes` |
| `/blocked-users` | `blockedUsers.routes` |
| `/faqs` | `faq.routes` |
| `/game-subscriptions` | `gameSubscription.routes` |
| `/play-intents` | `playIntent.routes` |
| `/training` | `training.routes` |
| `/trainers` | `trainers.routes` |
| `/group-channels` | `groupChannel.routes` |
| `/bets` | `bet.routes` |
| `/market-items` | `marketItem.routes` |
| `/user-game-notes` | `userGameNoteRoutes` |
| `/currency` | `currency.routes` |
| `/user-teams` | `userTeam.routes` |
| `/club-admin` | `clubAdmin.routes` |
| `/stories` | `story.routes` |
| `/ads` | `ad.routes` |
| `/public/landings` | `adLanding.routes` |
| `/public/link-to-app` | `linkToApp.routes` (`GET /hit`, `GET /go/:choice`) |
| `/booktime` | `booktime.routes` |
| `/padeloo` | `padeloo.routes` |
| `/klikteren` | `klikteren.routes` |
| `/nspadel` | `nspadel.routes` |
| `/weather` | `weather.routes` |

Also: `gamePhoto.routes` is mounted from `game.routes` (not the aggregator). `replicateWebhook.routes` is **not** under `/api`.

## Health

| Path | Auth | Body |
|------|------|------|
| `GET /health` | none | `{ status: 'ok', timestamp }` |
| `GET /api/health` | none | same |
| `GET /api/health/details` | admin JWT, or loopback + non-production | + `database.name`, `database.e2eSafe`, `runtime.nodeEnv`, `authRefresh` metrics |

Implementation: `Backend/src/utils/healthInfo.ts`.

## Schedulers (`server.ts` only)

All `start()` on boot, `stop()` on SIGTERM/SIGINT:

| Class | File |
|-------|------|
| `GameStatusScheduler` | `services/gameStatusScheduler.service.ts` — ANNOUNCED/STARTED/FINISHED/ARCHIVED from times + `resultsStatus` (`utils/gameStatus.ts`). Cron `:00` and `:30`. |
| `TelegramGamesScheduler` | `services/telegram/gamesScheduler.service.ts` |
| `CurrencyScheduler` | `services/currencyScheduler.service.ts` |
| `AuctionScheduler` | `services/auctionScheduler.service.ts` |
| `DraftScheduler` | `services/draftScheduler.service.ts` |
| `UnreadAutoReadScheduler` | `services/unreadAutoReadScheduler.service.ts` |
| `BugArchivedScheduler` | `services/bugArchivedScheduler.service.ts` |
| `ChatSyncStatsScheduler` | `services/chatSyncStatsScheduler.service.ts` |
| `AdCampaignScheduleScheduler` | `services/adCampaignScheduleScheduler.service.ts` |
| `AdAnalyticsScheduler` | `services/adAnalyticsScheduler.service.ts` |
| `BetPayoutReconcileScheduler` | `services/bets/betPayoutReconcileScheduler.service.ts` |
| `PushReplyTokenCleanupScheduler` | `services/push/pushReplyTokenCleanupScheduler.service.ts` |
| `AuthSessionMaintenanceScheduler` | `services/auth/authSessionMaintenanceScheduler.service.ts` |
| `WeatherForecastScheduler` | `services/weatherForecastScheduler.service.ts` |
| `PlayIntentScheduler` | `services/playIntentScheduler.service.ts` |
| `RatingInactiveScheduler` | `services/ratingInactiveScheduler.service.ts` |

Also on API boot: `resumeMatchTimerSchedulesOnStartup()`, Telegram bot, APNs/FCM push, Socket.IO.

## Queue workers (`startQueueWorkers.ts`)

Started from **both** `server.ts` and `worker.ts`:

- `TranslationQueueService` — chat auto-translate
- `GameResultsArtifactQueueService` — results share images
- `PlayIntentFollowerNotificationQueueService`
- `PlayIntentMatchQueueService`
- `PlayIntentNotificationDeliveryQueueService`
- `PlayIntentQueueMaintenanceService`

## Socket.IO

`Backend/src/services/socket.service.ts`. Path `/socket.io/`. JWT on connection. Redis adapter if `REDIS_URL` or `SOCKET_IO_REDIS_URL`. Facade: `socketEmitFacade.ts`. Rooms: `game-{id}`, `notify-user-{id}`, `play-intent-pool:{cityId}` — see [realtime.md](./realtime.md).

## Auth (API)

JWT access + `UserRefreshSession` rotation (`services/auth/`). Web refresh is httpOnly cookie in production (`REFRESH_WEB_HTTPONLY_COOKIE`). Native still gets JSON refresh. Config: `config/jwtAuthConfig.ts` (asserted at process start).

## Heavy-command serialization

Builds, `tsc`, Vitest, Playwright, Prisma generate/migrate, backend test runners **must not** run concurrently in the same lane.

- Prefer existing npm scripts (already wrapped).
- Otherwise: `./scripts/run-heavy <cmd>` from repo root, or `../scripts/run-heavy` from Backend/Frontend.
- Lanes: cwd under `Frontend/` → frontend lock; under `Backend/` → backend lock; else shared. One FE + one BE heavy command may run at once.
- Lint does **not** take the lock.
- Never invoke `tsc` / `vite build` / Vitest / Playwright / Prisma generate directly.

`scripts/run-heavy` uses `lockf` (or flock fallback) on `/tmp/padelpulse-{frontend|backend|shared}-heavy.lock`.

Prisma: `npm --prefix Backend run prisma:migrate` (named `prisma migrate dev`). **Never** `prisma db push`. Enum `ADD VALUE` cannot share a transaction with first use of the value — split migrations. Schema name for the client: `DB_SCHEMA` default `padelpulse` in `config/database.ts` (PrismaPg `search_path`).
