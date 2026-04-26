# PadelPulse — automated testing plan

Plan for introducing automated tests across Backend and Frontend. Baseline: no `*.test.ts` / `*.spec.ts` in repo; CI (`.github/workflows/ci.yml`) runs lint, build, and `prisma generate` only.

---

## 1. Baseline

| Area      | Stack                                                                      | Today                                                                 |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Backend   | Express, Prisma, PostgreSQL, Socket.io, Redis, S3, Firebase, etc.         | No unit/integration runner; ad-hoc `npm run test:currency` (script). |
| Frontend  | Vite, React 19, TypeScript, Zustand, axios, Capacitor                      | No test dependencies or scripts.                                      |
| CI        | Node 20, `npm ci`                                                          | No test step.                                                         |

**Definition of done:** every PR runs fast, deterministic checks (unit + selected integration); optional nightly or `workflow_dispatch` for heavy E2E.

---

## 2. Tooling

| Layer                         | Tool                                                                 | Rationale                                                                 |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unit + integration (Backend)  | **Vitest** (Jest acceptable; Vitest aligns with TS/Vite if unified) | ESM-friendly, watch mode, `vi.mock` for Prisma and AWS SDK.               |
| Unit + component (Frontend)   | **Vitest** + **jsdom** + **@testing-library/react**                  | Native Vite integration; matches current React stack.                     |
| HTTP / API                    | **supertest** (or `fetch` against ephemeral `app.listen`)             | Standard for Express; prefer mounting `app` without full `server.ts`.   |
| DB integration                | **PostgreSQL in CI** (`services: postgres`) or **Testcontainers**    | Prisma uses PostgreSQL (`Backend/prisma/schema.prisma`); avoid SQLite.   |
| E2E (later)                   | **Playwright**                                                       | Auth, maps, Capacitor-adjacent flows; target `vite preview` or staging. |

**Suggested layout**

- Backend: colocated `*.test.ts` under `Backend/src/`, or `Backend/test/` for integration-only.
- Frontend: colocated `*.test.tsx` under `Frontend/src/`.

**Scripts**

- Backend: `test`, `test:unit`, `test:integration` (split via `testMatch` or directories).
- Frontend: `test` (optional: `test:ui` for Vitest UI).

---

## 3. CI/CD

**Phase A — unit only (no DB)**  
Add `npm run test` to Backend and Frontend jobs. No extra services; target &lt; 2–3 minutes.

**Phase B — backend integration**

- Add `services: postgres` and `DB_URL` (or project env name) for disposable DB.
- Run `npx prisma migrate deploy` (prefer over ad-hoc `db push` for prod parity).
- Optional minimal seed (SQL or TS).
- Run integration tests with controlled parallelism (single worker initially, or transactional rollback per test).

**Caching**  
Keep existing npm + Prisma generate. When Playwright is added, cache `~/.cache/ms-playwright`.

**Policy**  
Block merge on Phase A + B for `main` / `master`. E2E optional or nightly.

---

## 4. Priority targets (high ROI)

### Backend — pure logic (no DB)

- `Backend/src/utils/refreshTokenCrypto.ts` — hashing, opaque token shape.
- `Backend/src/utils/tokenExpiry.ts`, `Backend/src/utils/jwt.ts` — use fake timers (`vi.setSystemTime`).
- Validators: `utils/validators/gameFormat.ts`, `weeklyAvailability.ts`, `availabilityBucketBoundaries.ts`.
- Scoring / game helpers: `utils/scoring/deriveBallsInGames.ts`, `utils/gameStatus.ts`.
- `middleware/errorHandler.ts` — status codes and JSON error shape.
- `utils/ApiError.ts`, `utils/asyncHandler.ts`.

### Backend — HTTP smoke and contracts

- `GET /api/health` (`Backend/src/routes/index.ts`).
- Unknown path under `/api` → 404 / consistent error envelope.
- Auth routes (`routes/auth.routes.ts`): 401 on protected routes without credentials; happy paths once test JWT mint or test login exists.

### Backend — integration (Postgres + mocked I/O)

- Refresh/session flows per `docs/AUTH_REFRESH_TOKEN_PLAN.md` and `services/auth/` — rotation, reuse handling, logout-all, session list/delete (mock outbound email/push if triggered).
- One vertical slice per domain where feasible: e.g. user → game → join, with S3/Firebase mocked.

### Frontend — unit

- `Frontend/src/services/refreshTokenPersistence.ts` — mock Capacitor, `import.meta.env`, localStorage branches.
- Pure helpers, URL builders, small Zustand slices.
- Components via Testing Library — favor small surfaces; split large files like `GameDetails/GameInfo.tsx` by behavior.

### Frontend — E2E (later)

- Login → home; open game details; light chat smoke if test environment allows.

---

## 5. Expanded test surface catalog

Use this as a backlog of **possible** areas (not all need coverage day one). Prefer unit tests for pure logic, integration tests for permission + DB invariants, E2E only for critical journeys.

### 5.1 Backend — HTTP API by domain (`/api/...`)

Map routes in `Backend/src/routes/index.ts` to contract tests (status, body shape, auth):

| Prefix / area | Example concerns |
| ------------- | ---------------- |
| `/app` | App version, config flags, feature toggles, client compatibility checks. |
| `/auth`, `/telegram` | Login, refresh, logout-all, session CRUD, OAuth/provider edge cases, rate limits. |
| `/users` | Profiles, settings, presence, stats, batches, social, reactions, workouts, notification prefs, merge/delete rules. |
| `/cities`, `/clubs`, `/courts` | Geo data, search, club reviews, court availability, normalization (`normalizeClubName`, etc.). |
| `/games`, `/game-teams`, `/game-courts`, `/game-subscriptions` | CRUD, join/leave, capacity, readiness, parent/child games, permissions, subscriptions. |
| `/leagues` | Seasons, rounds, assignments, sync, colors/groups, standings. |
| `/results`, `/level-changes` | Result entry, recalculate/reset, timers, rating floors, level proposals. |
| `/invites` | Create, accept, decline, expiry, duplicate handling. |
| `/rankings` | Ordering, filters, pagination, ties. |
| `/chat`, `/group-channels` | Threads, messages, reactions, mutes, pins, read receipts, search, sync payloads, permissions. |
| `/media` | Upload limits, MIME, size, signed URLs, cleanup hooks (mock S3). |
| `/favorites`, `/blocked-users` | Add/remove, list consistency. |
| `/bugs` | Lifecycle, archiving scheduler hooks, chat side-effects. |
| `/transactions`, `/goods`, `/currency`, `/bets`, `/market-items` | Money paths, idempotency, auction/bid rules, currency conversion (`test:currency` script logic in proper tests). |
| `/training`, `/trainers` | Sessions, trainer favorites, training flows. |
| `/push` | Token registration (mock APN/FCM). |
| `/faqs`, `/logs` | Admin-only or role-gated access. |
| `/admin` | Strong authz tests; never expose in accidental open routes. |
| `/user-teams`, `/user-game-notes` | Membership rules, notes visibility. |

### 5.2 Backend — services and domain logic (`Backend/src/services/**`)

| Cluster | Examples |
| ------- | -------- |
| Auth & sessions | `authIssuance`, `userRefreshSession`, Apple/Google handlers. |
| Game / participant | `game.service`, `participant.service`, `watchSession`, `fixedTeamsCleanup`, workout. |
| Results & ratings | `calculator`, `outcomes`, `roundGeneration`, `gameStandings`, `matchTimer`, bar results. |
| League | `create`, `assign`, `sync`, group colors. |
| Chat | `message`, `readReceipt`, `pinnedMessage`, `chatMute`, `cityGroup`, `systemMessage`, translation prefs, unread batch. |
| Bets & market | `betConditionEvaluator`, `betResolution`, `marketItemBid`, auction schedulers. |
| Notifications | Push templates per domain (game, league, chat, invite, market); preference filtering. |
| Telegram | Bot commands, OTP, notifications, results HTML/image senders (mock grammy / HTTP). |
| Club integration | Playtomic / club sync types and mapping. |
| AI / LLM | Prompt assembly, parsing, guardrails (mock OpenAI). |
| Schedulers / cron | `gameStatusScheduler`, `auctionScheduler`, `bugArchivedScheduler`, `reliabilityDecayScheduler`, `mediaCleanup`, `fileCleanup` — trigger with fake time + mocked DB slices. |
| Misc | `currency.service`, `ranking.service`, `faq`, `welcomeScreen`, `socket.service` (adapter in test). |

### 5.3 Backend — utilities and pure helpers (`Backend/src/utils/**`)

Beyond Section 4: `participantValidation`, `parentGamePermissions`, `gameQueries`, `messageSearchContent`, `ttlCache`, `promiseWithTimeout`, `rateLimitClientKey`, `clientVersion`, `hash`, `playerLevels`, `normalizePlaytomicCountry`, `translations`, `ipGeoProvider` (mock fetch), `imageProcessor` (fixtures), `refreshWebCookie`, `postJoinOperations`, `participantOperations`.

### 5.4 Backend — middleware and cross-cutting

- `middleware/auth.ts` — `authenticate`, `optionalAuth`, role helpers (`requireCanModifyResults`, etc.): token missing, expired, wrong audience, revoked session.
- `middleware/errorHandler.ts`, `recordPresenceActivity`, CORS (`reflectCorsOrigin`), `express-rate-limit` + `rateLimitKeyFromRequest`.
- `config/env.ts` — validation fails fast with clear errors (no secrets in snapshots).

### 5.5 Backend — integrations (contract / smoke)

- **Prisma**: critical unique constraints and cascade behavior (selected models only).
- **Redis**: session or pub/sub assumptions when integration tests run with Redis service.
- **Socket.io**: connect with test token; one emit/ack pattern per critical event (optional, heavier).
- **S3**: put/get error paths; key naming.
- **Firebase Admin / APN**: mock; assert “would have sent” payloads.
- **Puppeteer** (if used in prod paths): smoke with headless or skip in CI.

### 5.6 Backend — scripts and one-off jobs

- `Backend/scripts/**` backfills: idempotent runs on small fixture DBs where safe.
- **Migrations**: optional “migrate from empty” smoke in CI (already planned); rarely need per-migration tests unless fixing a specific bug.

### 5.7 Frontend — API layer (`Frontend/src/api/**`)

- `axios` / `httpClient` — interceptors: attach access token, refresh on 401, dedupe refresh, backoff on failure.
- `authRefresh.ts` — aligns with backend refresh contract.
- Per-resource modules — response parsing, error mapping to `toastApiError`.

### 5.8 Frontend — services (`Frontend/src/services/**`)

| Area | Examples |
| ---- | -------- |
| Chat sync | `chatLocalApplyPull`, `chatMutationNetwork`, `chatOutboxRetry`, `chatSyncEventsToPatches`, batch warm, metrics, cursor/row utils, optimistic read markers. |
| Game results | `gameResultsEngine` — conflict detection, merge rules (with fixtures). |
| Ops | `opCreators` — shape and idempotency keys. |

### 5.9 Frontend — state (`Frontend/src/store/**`)

- `chatSyncStore`, `socketEventsStore`, `themeStore`, `deepLinkStore` — reducers/selectors pure where possible; mock socket in integration-style tests.

### 5.10 Frontend — utils (`Frontend/src/utils/**`)

- Scoring: `validateSet`, `rulebook`, `keypad`, `setKind`, `messages` — parity with backend rules where duplicated.
- Game format: `summarizeGameFormat`, presets, `gameParticipationState`, `gameTimeDisplay`.
- Availability: `bucketBoundaries`, `presets` (mirror backend validators).
- Chat: `chatSyncScope`, `chatListUtils`, `chatScrollHelpers`, `marketChatUtils`.
- `currency`, `networkStatus`, `toastApiError`, `displayPreferences`, `serviceWorkerUtils`, `openExternalUrl`, `stripPortalScrollBus`.

### 5.11 Frontend — components (sampling)

Group by risk, not every file:

- **Auth** — forms, validation, provider errors, social login entry.
- **GameDetails** — `GameInfo`, edit tabs, bets, league editor, results tabs, public prompts (permission-gated UI).
- **Chat** — list virtualization slices, search, system messages, media grid, undo translate, context panels (bugs).
- **Marketplace** — bids, auction modals, price input, cards, gallery field.
- **Home / tabs** — `MyGamesSection`, invites, trainers, city prompt.
- **Leagues** — create flow, season sections.
- **Shared UI** — `ProtectedRoute`, dialogs, `DateSelector`, `SegmentedSwitch`, maps (markers: mock leaflet).

### 5.12 Frontend — pages and routing

- `App.tsx` / router — deep links, tab defaults, 404 fallback.
- `Register`, `SelectCity`, `FindTab`, `MyTab`, `GameChat` — access denied branches, loading and empty states.

### 5.13 Frontend — hooks

- `useLoadingState`, `useBackButtonHandler`, `usePhotoCapture`, `useDragPaint`, game chat hooks (`useGameChatDerived`, panels, context) — with fake timers and mocked API.

### 5.14 Frontend — i18n and a11y

- Critical strings resolve for default locale; optional a11y lint + axe in Playwright on key screens.

### 5.15 Frontend — Capacitor and native bridges

- Plugins used in repo: app, browser, camera, filesystem, geolocation, keyboard, network, push, share, status-bar, social login, calendar — **unit-test** through thin wrappers (mock `@capacitor/core`); E2E on real devices is manual or separate pipeline.

### 5.16 Cross-stack and non-functional

- **Contract tests** — optional OpenAPI or hand-written JSON schemas shared or duplicated between FE and BE for high-churn DTOs.
- **Visual regression** — optional Playwright screenshots for marketing-critical UI (high maintenance).
- **Performance** — Lighthouse CI on one route, or k6 on `/api/health` + one authenticated read (optional).
- **Security** — dependency audit in CI (already often present); optional static rules for dangerous patterns (`dangerouslySetInnerHTML`, eval).

---

## 6. Mocking

| Dependency              | Approach                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| Prisma                  | Unit: `vi.mock('@prisma/client')`. Integration: real client + test Postgres. |
| S3 (`@aws-sdk/client-s3`) | Mock client or LocalStack if SDK semantics matter.                          |
| Redis / Socket.io       | Inject test doubles or CI Redis service when integration requires it.       |
| Firebase / APN / Google | Stub modules; assert no real network in unit tests.                           |
| Time                    | `vi.useFakeTimers()` for schedulers and cron-related code.                    |

---

## 7. Data and environment

- Test env: `.env.test` or CI secrets — `DB_URL`, fixed `JWT_SECRET`, disable external webhooks.
- CI: migrate from empty DB each run for reproducibility.
- Parallelism: start serial for DB tests; later per-worker DB URLs if needed.
- Cleanup: truncate with FK awareness, or transaction + rollback per test.

---

## 8. Refactors that ease testing (optional)

- Export `createApp(overrides?)` from app bootstrap so tests mount Express without starting full `server.ts` (Socket.io, etc.) unless required.

---

## 9. Phased roadmap

| Phase | Scope                                                         | Exit criteria                          |
| ----- | ------------------------------------------------------------- | -------------------------------------- |
| 0     | Vitest + scripts + 5–10 util tests                            | CI green, fast job                     |
| 1     | Health + 401 matrix for authenticated routes; error handler   | No or minimal DB                       |
| 2     | Postgres in CI + migrate + 3–5 integration flows (auth/game)  | Accept ~10 min initially if needed     |
| 3     | Frontend service + component tests (auth/session + one flow) | `npm run test` in frontend CI job      |
| 4     | Playwright smoke                                              | Nightly or `workflow_dispatch`         |

---

## 10. Coverage guidance

Prefer behavioral coverage on auth, transactions, results/league logic, and chat permissions over raw line %. Early target: strong coverage on `utils/` and `middleware/`; avoid chasing high % on large services before boundaries and mocks exist. Use Section 5 to pick the next slice when a domain changes frequently in PRs.

---

## 11. Risks

- **Flaky E2E:** keep scope small; stable selectors (`data-testid` where needed).
- **Schema drift:** always `migrate deploy` on CI test DB.
- **Secrets:** never production keys in tests; dummy JWKS / stub external SDKs.

---

## 12. References in repo

- API mount: `Backend/src/app.ts` (`/api`), routes: `Backend/src/routes/index.ts`.
- Auth middleware: `Backend/src/middleware/auth.ts`.
- Refresh token doc: `docs/AUTH_REFRESH_TOKEN_PLAN.md`.
- Frontend persistence: `Frontend/src/services/refreshTokenPersistence.ts`.
