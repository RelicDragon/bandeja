# PRD 345–357 — Engineering contract

**Every agent working on PRDs 345–357 must read this file first, then `docs/agents/RULES.md`, then its own `docs/plans/prd-345-357/prd-<n>.md`.**

This file is the single source of truth for the conventions shared across the 13 PRDs. It is derived from a verified read of the codebase — the facts below were checked against the actual source, not inferred. Where a PRD's wording conflicts with this file, **this file wins** (the PRDs were written before the code was re-verified); note the deviation in your report.

---

## 0. Hard rules

1. **Never run heavy commands.** No `tsc`, `vite build`, `vitest`, `playwright`, `prisma generate`, `prisma migrate`, backend test runners, `npm run build`, `npm test`, `./scripts/run-heavy`. The orchestrator owns that lane and runs them between waves. `eslint` is also not yours to run — the orchestrator runs it.
2. **Never run `git commit`, `git checkout`, `git stash`, or any branch operation.** You share one working tree with other agents.
3. **Stay inside your file ownership list.** If you need a change in a file you do not own, write it into your report instead and the orchestrator will apply it.
4. **No `eslint-disable` comments.** Fix the lint properly. (`docs/agents/RULES.md`.)
5. **No `any` where a real type is available.** The backend uses `any` in legacy create/update payloads; do not spread that into new code.
5b. **A `.tsx` file that exports a component must export *only* components.** `eslint --max-warnings 0` enforces `react-refresh/only-export-components`, so a constant, a pure helper or a type guard living next to a component fails the build. Put them in a sibling `.ts` module (`fooFormat.ts`, `fooRules.ts`) and import them — this has already broken the build five times in this programme. Likewise, anything a `useMemo`/`useCallback` dependency array closes over must be stable: `const xs = query.data ?? []` creates a new array every render and trips `react-hooks/exhaustive-deps`; wrap it in `useMemo`.
6. Respect `docs/product/constraints.md`. In particular: `resultsStatus !== 'NONE'` is the mutation lock, never `Game.status`. Use `canMutateGameRoster` / `isGameResultsLocked` / `isGameArchived` from `@bandeja/shared/gameMutationLock` (backend) / `@shared/gameMutationLock` (frontend).
7. Node 24, npm 11. TypeScript strict.

---

## 1. Verified facts that contradict common assumptions

Read these carefully — several PRDs are written against assumptions that do not hold.

| Assumption in PRDs | Reality |
|---|---|
| "a `GameSettings` model / `GameSettings.autoFillFromQueue`" | **There is no `GameSettings` Prisma model.** Game settings are plain columns on `Game`. `GameSettings` is only a React component at `Frontend/src/components/GameDetails/GameSettings.tsx`. New settings = new `Game` columns + a new row in that component. |
| "Platform Settings (`COINS_PER_CURRENCY_UNIT`)" | **There is no generic settings store.** The only precedent is `ResultsArtifactSetting`, a singleton row with `id = 'default'`. Wave 1 creates a real `PlatformSetting` key/value table — see §4.3. |
| "`NotificationType` enum" | It is a **TypeScript** enum in `Backend/src/types/notifications.types.ts`, not a Prisma enum. `NOTIFICATION_TYPE_TO_PREF` in `Backend/src/services/notificationPreference.service.ts` is a **total** `Record<NotificationType, PreferenceKey>` — adding a type without mapping it is a compile error. Good. |
| "notification prefs on the User model" | They are rows in `NotificationPreference`, keyed `(userId, channelType)`, nine `Boolean @default(true)` columns whose names equal the `PreferenceKey` values. A new pref key needs: enum value + Prisma column + migration + `DEFAULT_PREFERENCES` entry in `notificationPreference.service.ts`. |
| "socket event `game:attendance-updated`" | **Game-room events are kebab-case**: `game-updated`, `game-cancelled`, `game-results-updated`, `match-timer-updated`, `match-live-scoring-updated`. Room name is `` `game-${gameId}` ``. Use kebab-case for all new game-room events (§6). |
| "`acceptJoinQueue` service" | That is the controller name. The service method is `ParticipantService.acceptNonPlayingParticipant(gameId, currentUserId, queueUserId)`. |
| "`canMutateGameRoster` middleware" | `canMutateGameRoster` is a **pure predicate** in `Frontend/shared/gameMutationLock`. The Express middleware is `canManageGameRoster` (from `Backend/src/middleware/auth.ts`). |
| "`GET /clubs/:id` is fine to reuse publicly" | It already runs under `optionalAuth` but **returns the raw Club row including `integrationConfig`**. PRD 354 must add a properly projected `GET /clubs/:id/public`. |
| "`Goods` has kind/price/preview" | `Goods` currently has exactly `id, name, price, createdAt, updatedAt`. PRD 355 extends it. |
| "`/api/goods` write endpoints are admin-gated" | They are **not** — `POST`/`PUT`/`DELETE` on `Backend/src/routes/goods.routes.ts` only use `authenticate`. PRD 355 must add `requireAdmin`. This is a live security bug in scope for that PRD. |
| "the Telegram callback prefixes are all registered" | `Backend/src/services/telegram/bot.service.ts:51` registers `/^(sg|rm|ia|rum|rg|rbm):/` — it **omits `uti:` and `sip:`**, which are implemented and emitted. Any new prefix must be added to that regex. The PRD-349/356 agent also fixes the `uti|sip` gap. |
| "there is a `setMyCommands` call" | There is none anywhere. PRD 356 adds the bot command menu from scratch. |
| "there is a generic `Skeleton` component" | There is not. The primitive is the class string `shimmerBlock` from `Frontend/src/components/motion/shimmerBlock.ts`. |
| "there is a `StatTile` component" | There is not. Stat tiles are ad-hoc; see `Frontend/src/components/LevelHistoryProfileStatsSection.tsx` for the house pattern. Wave 2 adds a shared `StatTile` (§7.4) — use it. |
| "`/rankings` has pagination" | `/rankings/user-context` returns the **whole** leaderboard, unpaginated. PRD 352's pairs endpoint must be cursor-paginated (pattern in §5.5). |
| "i18n key parity is enforced" | It is not — a missing key silently falls back to English with no CI signal. Wave 2 adds a parity test (§8.3). Your namespace must pass it. |

---

## 2. Repository map (the parts you need)

```
Backend/src/
  app.ts                      Express app + /api mount
  server.ts                   HTTP + Socket.IO + schedulers (pattern: `const x = new XScheduler(); x.start();`)
  routes/index.ts             all /api mounts
  routes/<domain>.routes.ts   one file per domain
  controllers/<domain>.controller.ts
  services/<domain>/          business logic
  types/notifications.types.ts  NotificationType + PreferenceKey + NotificationPayload
  services/notificationPreference.service.ts   NOTIFICATION_TYPE_TO_PREF (total record)
  services/notification.service.ts             unified dispatch
  services/push/…             push payload builders, pushInviteActionToken.service.ts
  services/telegram/…         grammy bot, commands/, handlers/callback.handler.ts
  services/socket.service.ts  Socket.IO server; rooms `game-${id}`, `notify-user-${id}`
  middleware/auth.ts          authenticate, optionalAuth, requireAdmin, requireGamePermission factory
  prisma/schema.prisma        3925 lines, 155 models, 79 enums
  prisma/migrations/          95 dirs, `YYYYMMDDHHMMSS_snake_case_name/migration.sql`
Frontend/src/
  App.tsx                     router, offline gate, provider tree
  pages/MainPage.tsx          tab host; switches on parseLocation().place
  utils/urlSchema.ts          Place union + PLACE_DEFS + Overlay
  deepLinks/catalog.ts        native/assistant deep-link catalog (+ mirror JSON, parity tests)
  i18n/config.ts              flat single-namespace i18next; locales/<code>/index.ts spreads JSON
  components/ui/              Dialog (Radix), Drawer (vaul), FullScreenDialog, OverlayKeyboardBody
  components/                 flat kit: Button, Card, Input, Select, SegmentedSwitch, ToggleSwitch, …
  components/home/EmptyStateCard.tsx, GameCardSkeleton.tsx, AnimatedGameList.tsx
  components/motion/          motionTokens, shimmerBlock, AnimatedMount, AnimatedPresencePanel, AnimatedChildrenStagger
  components/gameCard/        GameCardHeaderTags, GameCardInfoRows, GameCardRightRail, …
  hooks/usePrefersReducedMotion.ts
  utils/keyboardLayout.ts     keyboard contract (see §7.3)
  store/                      zustand stores
  queries/                    TanStack Query; queryKeys.ts
Frontend/shared/              @bandeja/shared (BE) / @shared (FE Vite)
Admin/                        vanilla JS, no build; see §9
docs/plans/prd-345-357/       PRD texts, this contract, staging dirs
```

---

## 3. Prisma conventions (Wave 1 owns the schema; everyone else reads it)

Only the **Wave 1 schema agent** edits `Backend/prisma/schema.prisma` and `Backend/prisma/migrations/`. Every other agent treats the schema as given and reads it.

House style, to be matched exactly:

```prisma
model GameCourt {
  id        String   @id @default(cuid())
  gameId    String
  courtId   String
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  game      Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  court     Court    @relation(fields: [courtId], references: [id], onDelete: Cascade)

  @@unique([gameId, courtId])
  @@unique([gameId, order])
  @@index([gameId])
  @@index([courtId])
}
```

- IDs: `String @id @default(cuid())`. **No `uuid()`, no `autoincrement()`.**
- Timestamps: `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`. Append-only tables carry only `createdAt`.
- Table names are the PascalCase model name. **Do not add `@@map`.** Field names are camelCase; do not add `@map`.
- Always an explicit `onDelete` (`Cascade` for owned children, `SetNull` for optional refs). Named `@relation("Name", …)` whenever two FKs point at the same model.
- Every FK column gets an `@@index`.
- Use `///` triple-slash doc comments for anything non-obvious.
- Postgres hints: `@db.VarChar(n)`, `@db.Text`, `@db.Date`. Free-form blobs are `Json` / `Json @default("[]")`.

Migration style: one dir per logical change, `YYYYMMDDHHMMSS_snake_case_description/migration.sql`, hand-authored round timestamps, Prisma-shaped SQL with `-- CreateEnum` / `-- CreateTable` / `-- AlterTable` / `-- CreateIndex` / `-- AddForeignKey` banners, double-quoted identifiers, `TEXT`, `TIMESTAMP(3)`, `DEFAULT CURRENT_TIMESTAMP`, PK constraint `"<Table>_pkey"`, index names `"<Table>_<col>_idx"` / `"<Table>_<col>_key"`.

> **PostgreSQL trap:** `ALTER TYPE … ADD VALUE` cannot be used in the same transaction as the value it adds. Adding `MONTHLY_RECAP` to `StorySourceType` must be its **own migration file**, ordered before any migration that references the new value.

---

## 4. What Wave 1 puts in the schema (authoritative list)

Every agent codes against exactly these names. If you need a field that is not here, report it — do not add it yourself.

### 4.1 New columns on `Game`

```prisma
  seriesId             String?
  seriesOccurrenceDate DateTime? @db.Date
  autoFillFromQueue    Boolean   @default(false)
  showOnLiveRail       Boolean   @default(true)
  lastSeatOpenedAt     DateTime?
  costPayerId          String?
  paymentHint          String?   @db.VarChar(120)
  costFrozenAt         DateTime?
  weatherAlertState    Json?
```
Relations: `series GameSeries? @relation(fields: [seriesId], references: [id], onDelete: SetNull)`, `costPayer User? @relation("GameCostPayer", fields: [costPayerId], references: [id], onDelete: SetNull)`.
Indexes: `@@index([seriesId])`, `@@unique([seriesId, seriesOccurrenceDate])`, `@@index([lastSeatOpenedAt])`, `@@index([resultsStatus, isPublic, showOnLiveRail])`.

### 4.2 New columns on `GameParticipant`, `User`, `UserSportProfile`, `NotificationPreference`

```prisma
// GameParticipant
  attendance          ParticipantAttendance @default(UNANSWERED)
  attendanceUpdatedAt DateTime?
  noShowNotedById     String?
  noShowNotedAt       DateTime?

// User
  onboardingCompletedAt DateTime?
  onboardingStep        String?
  referralCode          String?  @unique
  referredByUserId      String?

// UserSportProfile
  attendedCount Int @default(0)
  noShowCount   Int @default(0)

// NotificationPreference
  sendWeatherAlerts Boolean @default(true)
```

Migration must backfill `User.onboardingCompletedAt = "createdAt"` for every existing row (existing accounts are considered onboarded — PRD 350).

### 4.3 New models

| Model | Purpose | PRD |
|---|---|---|
| `PlatformSetting` | generic key/value settings: `key String @id`, `value String @db.Text`, `updatedAt DateTime @updatedAt` | 348, 351 |
| `GameSeries` | `ownerId, name, entityType, cadence GameSeriesCadence, weekday Int, startTimeLocal String, durationMinutes Int, clubId?, courtIds String[], template Json, horizonDays Int @default(14), seatDeadlineHours Int @default(48), endsOn DateTime? @db.Date, status GameSeriesStatus @default(ACTIVE), groupChannelId String?` | 345 |
| `GameSeriesRegular` | `seriesId, userId, addedAt, removedAt?` — `@@unique([seriesId, userId])` | 345 |
| `GameSeriesSkip` | `seriesId, occurrenceDate DateTime @db.Date` — `@@unique([seriesId, occurrenceDate])` | 345 |
| `GameCostShare` | `gameId, userId, amountCents Int, currency String, markedPaidAt?, confirmedAt?, method CostShareMethod @default(MANUAL), transactionId?` — `@@unique([gameId, userId])` | 348 |
| `PairStat` | `sport, cityId, userAId, userBId, games Int, wins Int, lastPlayedAt?, combinedLevel Float?` — `@@unique([sport, cityId, userAId, userBId])`, invariant `userAId < userBId` | 352 |
| `MonthlyRecap` | `userId, monthKey String, payload Json, viewedAt?, sharedAt?, sharedSlideKeys String[]` — `@@unique([userId, monthKey])` | 353 |
| `ReferralReward` | `referredUserId String @unique, referrerUserId, rewardedAt, referrerTxId?, referredTxId?, revokedAt?` | 351 |
| `UserGoods` | `userId, goodsId, purchasedAt, giftedByUserId?, equipped Boolean @default(false)` — `@@unique([userId, goodsId])` | 355 |
| `SpotOpenedDelivery` | `userId, gameId, dayKey String, kind SpotOpenedKind, createdAt` — `@@unique([userId, gameId, dayKey, kind])` | 347 |
| `LiveGameNotifyDelivery` | `userId, gameId, createdAt` — `@@unique([userId, gameId])` | 349 |

### 4.4 `Goods` extension (PRD 355)

```prisma
  kind        GoodsKind
  assetKey    String
  previewUrl  String?
  description String?  @db.VarChar(400)
  isActive    Boolean  @default(true)
  isFeatured  Boolean  @default(false)
  premiumOnly Boolean  @default(false)
  sortOrder   Int      @default(0)
```
`@@unique([kind, assetKey])`. Existing rows get `kind = 'PROFILE_FRAME'`, `assetKey = id`, `isActive = false` in the migration (they are not real catalogue items).

### 4.5 `LinkToAppAttribution` extension (PRD 351)

```prisma
  referrerUserId String?
```

### 4.6 New enums

```prisma
enum ParticipantAttendance { UNANSWERED CONFIRMED UNSURE }
enum GameSeriesCadence    { WEEKLY BIWEEKLY }
enum GameSeriesStatus     { ACTIVE ENDED }
enum CostShareMethod      { MANUAL COINS }
enum GoodsKind            { PROFILE_FRAME CHAT_ACCENT STICKER_PACK NAME_COLOR }
enum SpotOpenedKind       { QUEUE INTENT FOLLOWER }
```

Enum **value** additions to existing enums (each in its own migration file, see §3):
- `StorySourceType` += `MONTHLY_RECAP`

---

## 5. Backend conventions

### 5.1 Notification types and preference keys

Add to `NotificationType` in `Backend/src/types/notifications.types.ts` **and** to `NOTIFICATION_TYPE_TO_PREF` in `Backend/src/services/notificationPreference.service.ts` (it is a total record — the compiler enforces this):

| New `NotificationType` | `PreferenceKey` | PRD |
|---|---|---|
| `GAME_SERIES_NEXT_PROMPT` | `SEND_INVITES` | 345 |
| `GAME_NO_SHOW_NOTED` | `SEND_MESSAGES` | 346 |
| `GAME_SPOT_OPENED` | `SEND_INVITES` | 347 |
| `FOLLOWED_GAME_SPOT_OPENED` | `SEND_PLAY_INTENT_SOCIAL_NOTIFICATIONS` | 347 |
| `GAME_COST_REMINDER` | `SEND_WALLET_NOTIFICATIONS` | 348 |
| `FOLLOWED_USER_LIVE` | `SEND_PLAY_INTENT_SOCIAL_NOTIFICATIONS` | 349 |
| `REFERRAL_JOINED` | `SEND_WALLET_NOTIFICATIONS` | 351 |
| `MONTHLY_RECAP_READY` | `SEND_REMINDERS` | 353 |
| `GOODS_GIFT_RECEIVED` | `SEND_WALLET_NOTIFICATIONS` | 355 |
| `GAME_WEATHER_ALERT` | `SEND_WEATHER_ALERTS` | 357 |

New `PreferenceKey`: `SEND_WEATHER_ALERTS = 'sendWeatherAlerts'`. It also needs the Prisma column (§4.2), a `DEFAULT_PREFERENCES` entry, and a row in `NotificationSettingsModal` on the frontend.

Attendance nudges (346) reuse the existing `GAME_REMINDER` type. Referral coin grants reuse `TRANSACTION`.

### 5.2 Push action tokens

`Backend/src/services/push/pushInviteActionToken.service.ts` currently models `kind: 'game' | 'team'` and `action: 'accept' | 'decline'`. Wave 2 widens it to:

```ts
export type PushInviteActionScope = {
  userId: string;
  kind: 'game' | 'team' | 'series' | 'attendance' | 'weather';
  targetId: string;
  action: 'accept' | 'decline' | 'confirm' | 'unsure' | 'keep';
};
```

Semantics (dispatch lives in `Backend/src/controllers/pushInviteAction.controller.ts`):

| kind | targetId | actions | effect |
|---|---|---|---|
| `series` | the **next occurrence's** gameId | `accept` / `decline` | accept seats the user PLAYING on that occurrence; decline is a no-op record |
| `attendance` | gameId | `confirm` / `unsure` | sets `GameParticipant.attendance` |
| `weather` | gameId | `keep` | sets `weatherAlertState.keepAsPlannedAt` |

Keep the existing 48h expiry, HS256, issuer/audience and `ID_PATTERN` validation. The route stays unauthenticated and rate-limited (`Backend/src/routes/push.routes.ts`).

### 5.3 Telegram callback prefixes

New prefixes, all colon-delimited `prefix:arg:arg`, all added to the registration regex at `Backend/src/services/telegram/bot.service.ts` and to the if-chain in `handlers/callback.handler.ts`:

| Prefix | Shape | PRD |
|---|---|---|
| `at:` | `at:<gameId>:<confirm\|unsure>` | 346 |
| `sr:` | `sr:<gameId>:<accept\|decline>` (series next-week) | 345 |
| `wx:` | `wx:<gameId>:keep` | 357 |
| `pi:` | `pi:d:<offset>` / `pi:t:<slot>` / `pi:cancel` / `pi:again` / `pi:join:<intentId>` | 356 |

The PRD-349/356 agent also adds the already-implemented-but-unregistered `uti` and `sip` to that regex, so the final regex is:
`/^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/`

### 5.4 Schedulers

`Backend/src/services/gameStatusScheduler.service.ts` runs `cron.schedule('0,30 * * * *', …)`. It is **not** a registry — steps are private methods called from the cron callback. New scheduled work follows the same house pattern: a class with `start()` / `stop()`, instantiated and started in `Backend/src/server.ts` alongside the other 17 schedulers, with a matching `stop()` in the shutdown handler.

New schedulers:

| Class | File | Cadence | PRD |
|---|---|---|---|
| `GameSeriesScheduler` | `services/gameSeries/gameSeriesScheduler.service.ts` | `30 3 * * *` + on series create/edit | 345 |
| `CostShareReminderScheduler` | `services/gameCost/costShareReminderScheduler.service.ts` | `0 * * * *` | 348 |
| `MonthlyRecapScheduler` | `services/recap/monthlyRecapScheduler.service.ts` | `0 4 1-3 * *` | 353 |

Weather alerts (357) add a **step inside the existing `GameStatusScheduler`** cron callback (a new private method called after `sendReminders()`), not a new scheduler — the PRD says so and the `:00/:30` cadence is what the 12h/2h windows are sized against.

> The existing reminder dedupe uses **in-memory `Set`s** and is therefore lost on restart. Do not copy that for anything that must not double-fire: use a delivery table (`SpotOpenedDelivery`, `LiveGameNotifyDelivery`) or a persisted timestamp (`Game.weatherAlertState.sentAt[]`, `MonthlyRecap` unique key).

### 5.5 API conventions

- Routes live in `Backend/src/routes/<domain>.routes.ts`, mounted from `Backend/src/routes/index.ts`. Wave 2 pre-creates the mounts and empty routers (§8.2) so feature agents never touch `routes/index.ts`.
- Validation with `express-validator` via `middleware/validate.ts`, or Zod via `middleware/validateZod.ts` — match whichever the neighbouring domain uses.
- Errors: `throw new ApiError(status, 'errors.<domain>.<key>', true, { … })` from `Backend/src/utils/ApiError.ts`. User-facing messages are i18n keys, not English sentences.
- Auth middleware: `authenticate`, `optionalAuth`, `requireAdmin`, and the game-permission factory `requireGamePermission([roles], { allowArchived?, requireRosterMutable? })` with the named exports `canEditGame`, `canManageGameRoster`, `canManageGameRosterAsOwner`, `canAccessGame`.
- Responses: `res.json({ success: true, data: … })`. Lists that can grow use an **opaque cursor**, descending by id:
  ```ts
  where: { …, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: 'desc' }, take: limit + 1
  ```
  (pattern: `Backend/src/services/gamePhoto/gamePhoto.read.service.ts`).
- Rate limits: `express-rate-limit` with `keyGenerator: rateLimitKeyFromRequest` (see `Backend/src/routes/linkToApp.routes.ts`).

### 5.6 Find-card projection

Adding a field to the Find/Home game card requires **three** edits, and the contract asserter will fail the build if you miss one:

1. `Backend/src/services/game/availableGamesCard.projection.ts` → `FIND_CARD_GAME_SELECT`.
2. `Frontend/src/types/index.ts` → the `Game` interface (line ~579).
3. If the field must survive the guardrails, check it is not caught by `FIND_CARD_FORBIDDEN_GAME_KEYS` / `FIND_CARD_FORBIDDEN_USER_KEYS` / `FIND_CARD_FORBIDDEN_NESTED_KEYS` in the same file.

Wave 2 adds these scalars to `FIND_CARD_GAME_SELECT`: `seriesId`, `lastSeatOpenedAt`, `showOnLiveRail`, `autoFillFromQueue`, `priceType`, `priceTotal`, `priceCurrency`, `costPayerId`, `weatherAlertState`.

Derived/computed card fields are attached in `Backend/src/services/game/availableGamesEnrichment.ts` (which already fans out with `.catch(() => null)` so a partial failure never breaks Find). Wave 2 widens `AvailableGameEnrichFields` to:

```ts
export type AvailableGameEnrichFields = {
  userNote?: …;
  weatherSummary?: …;
  reactions?: …;
  spotOpenedAt?: string | null;      // PRD 347
  liveSummary?: LiveGameSummary | null;  // PRD 349
  weatherRisk?: WeatherRisk | null;  // PRD 357
  perHeadPrice?: PerHeadPrice | null;// PRD 348
  seriesLabel?: SeriesCardLabel | null;  // PRD 345
  attendanceSummary?: AttendanceSummary | null; // PRD 346
};
```

The `my-tab` payload does **not** use the Find card projection — it comes from `GameReadService.getMyGames` with `gameMyTabListInclude` and then runs through the same `enrichAvailableGamesSafe`. So enrichment-derived fields reach both surfaces; `FIND_CARD_GAME_SELECT` scalars only reach Find, and `gameMyTabListInclude` must be checked separately.

---

## 6. Socket events

Room: `` `game-${gameId}` `` (never `game:{id}`). User fan-out room: `` `notify-user-${userId}` ``.

New events, all kebab-case, emitted from `Backend/src/services/socket.service.ts` via a new public method per event, and typed on the frontend in `Frontend/src/services/socketService.ts` → `interface SocketEvents`, then handled in `Frontend/src/store/socketEventsStore.ts`:

| Event | Payload | PRD |
|---|---|---|
| `game-attendance-updated` | `{ gameId, userId, attendance, confirmedCount, playingCount }` | 346 |
| `game-seat-opened` | `{ gameId, freedCount, cause, lastSeatOpenedAt }` | 347 |
| `game-seat-filled` | `{ gameId, userId }` | 347 |
| `game-cost-updated` | `{ gameId }` | 348 |
| `game-series-confirmations-updated` | `{ seriesId, gameId, confirmedCount, regularCount }` | 345 |
| `game-weather-alert-updated` | `{ gameId, severity }` | 357 |

Frontend subscription pattern (there is **no** `useGameSocket` hook): ref-counted room membership via `retainGameRoom(gameId)` / `releaseGameRoom(gameId)` from `Frontend/src/services/gameRoomMembership.ts` in a `useEffect`, then read the last-event slot from `useSocketEventsStore`. See `Frontend/src/pages/GameDetailsShell.tsx:395-479`.

---

## 7. Frontend conventions

### 7.1 Design language (from every PRD, restated as rules)

- **Mobile first.** Capacitor iOS/Android and mobile browsers are the primary target. Desktop reuses the same components inside the existing split layouts.
- **Surfaces:** vaul bottom sheets (`components/ui/Drawer.tsx`) for actions and detail; Radix dialogs (`components/ui/Dialog.tsx`) only for destructive confirms; full-screen routes for destinations.
- **Motion:** Framer Motion 12. Entrance springs `{ type: 'spring', stiffness: 260, damping: 24 }`; state changes 180–240 ms; layout animations for list reorders. Never animate more than one hero element at once. Number changes use a count-up ≤600 ms. **Every motion path must be gated on `usePrefersReducedMotion()`** (`Frontend/src/hooks/usePrefersReducedMotion.ts`) — reduced motion shows the final state immediately.
- **Color:** Tailwind `primary` (sky) for actions, semantic green/amber/red for states, neutral surfaces from `Frontend/src/styles/tokens.css`. Must read correctly in **Light, Dark, Classic and Premium**. Premium keeps gold accents only where the shell already applies them.
- **Type and density:** one headline per screen, one primary action per sheet, secondary actions as text buttons. Cards keep the `GameCard` rhythm.
- **Icons:** `lucide-react` only. No emoji as icons; emoji allowed inside copy.
- **Feedback:** `react-hot-toast` for transient confirmations, inline banners for persistent state, `shimmerBlock` skeletons for loading, `EmptyStateCard` for empties with one clear next action.
- **Accessibility:** 44 px minimum tap targets, 4.5:1 text contrast, explicit roles and labels on every control, arrow-key support on segmented controls, RTL verified for `ar`, all copy in the 11 locales. Every decorative animation is `aria-hidden`. Status conveyed by colour must also be conveyed by text or a visually-hidden label.
- **Copy:** plain, second person, verbs first ("Confirm seat", not "Seat confirmation"). Never leak schema jargon (`resultsStatus`, `PLAYING`, `NON_PLAYING`) into user-facing text.

### 7.2 Component kit — what exists, use it

| Need | Use |
|---|---|
| Tabs / segmented control | `SegmentedSwitch` (`Frontend/src/components/SegmentedSwitch.tsx`). **`layoutId` must be unique per mounted instance.** Supports `orientation`, `fullWidth`, `size`, `badgeStyle`, `allowDeselect`, `toggleIds`. |
| Bottom sheet | `Drawer` / `DrawerContent` / `DrawerHeader` / `DrawerTitle` / `DrawerCloseButton` (`components/ui/Drawer.tsx`). Always pass `accessibleTitle`. Pair with `useBackButtonModal(open, onClose, '<unique-modal-id>')`. |
| Destructive confirm | `Dialog` / `DialogContent` (`components/ui/Dialog.tsx`) or `ConfirmationModal`. |
| Full-screen overlay | `FullScreenDialog` (`components/ui/FullScreenDialog.tsx`). |
| Empty state | `EmptyStateCard` (`components/home/EmptyStateCard.tsx`) — `{ icon, title, description?, action? }`. |
| Loading | `shimmerBlock` class string from `components/motion/shimmerBlock.ts`; `GameCardSkeleton` / `GamesLoadingSkeleton` for card lists. |
| Toggle | `ToggleSwitch`; in game settings, the local `SettingToggleRow` pattern inside `GameSettings.tsx`. |
| Button | `Button` (`components/Button.tsx`), 5 variants × 3 sizes. |
| Card surface | `Card` (`components/Card.tsx`). |
| Avatars | `PlayerAvatar`, `ClubAvatar`, `GameAvatar`, `TeamAvatar`, `UserAvatarFallbackImg`. |
| Premium name | `PremiumName`. |
| Animated list | `AnimatedGameList` (`components/home/AnimatedGameList.tsx`). |
| Mount/unmount animation | `AnimatedMount`, `AnimatedPresencePanel`, `AnimatedChildrenStagger` (`components/motion/`). |
| Stat tile | `StatTile` — **added by Wave 2**, `Frontend/src/components/ui/StatTile.tsx` (§7.4). |
| Count-up number | `CountUpNumber` — **added by Wave 2**, `Frontend/src/components/ui/CountUpNumber.tsx` (§7.4). |
| Horizontal rail | Follow `FindCityEventsRail` (`components/home/FindCityEventsRail.tsx`): dedicated hook → memo component with a `RAIL_LIMIT` → `return null` when empty → wrapped in `<AnimatedMount layout show={…}>`. |
| Toast | `import toast from 'react-hot-toast'`; `toast.success` / `toast.error`. Provider is already mounted. |

### 7.3 Keyboard contract (mandatory for any overlay with an input)

The app owns keyboard lift; Capacitor `Keyboard` resize is `none` and vaul's `repositionInputs` is `false`.

- DOM hooks are written by **one** module, `Frontend/src/utils/keyboardState.ts` → `--keyboard-height`, `body.keyboard-visible`, `body.keyboard-dialog-shift`. Never write these yourself.
- Overlays opt in with a class: `cap-keyboard-aware-sheet` (vaul sheets — already on `DrawerContent`), `cap-keyboard-aware-dialog` (Radix — already on `DialogContent`), `cap-keyboard-aware-overlay`, `cap-keyboard-aware-bottom-panel`.
- Scroll body: wrap content in `OverlayKeyboardBody` (or the `overlay-keyboard-body` class) so `.dialog-header` / `[data-overlay-chrome]` stick to the top.
- Pin a primary action above the keyboard with `padding-bottom: var(--overlay-bottom-inset, 0px)` — **never** a hard-coded inset.
- Predicates live in `Frontend/src/utils/keyboardLayout.ts`; the CSS/JS mirror pair is `styles/keyboard/variables.css` ↔ `utils/overlayKeyboardLayout.ts`. If you change one, change the other.
- Numeric entry sheets (cost-share override, 348) and any text input inside a sheet must be verified against this contract.

### 7.4 Shared components Wave 2 adds (use them, do not reinvent)

```tsx
// Frontend/src/components/ui/StatTile.tsx
export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}
export const StatTile: React.FC<StatTileProps>;

// Frontend/src/components/ui/StatTileRow.tsx — 2–4 StatTiles in the house divider layout
export const StatTileRow: React.FC<{ children: React.ReactNode; className?: string }>;

// Frontend/src/components/ui/CountUpNumber.tsx
export interface CountUpNumberProps {
  value: number;
  durationMs?: number;   // default 600, clamped to <= 600
  decimals?: number;
  format?: (n: number) => string;   // default Intl per active locale
  className?: string;
}
export const CountUpNumber: React.FC<CountUpNumberProps>;  // reduced motion => jumps to value
```

### 7.5 Routing, places and overlays

Adding a route means editing **four** places consistently:

1. `Frontend/src/App.tsx` — the `<Route>`.
2. `Frontend/src/utils/urlSchema.ts` — a `Place` union member **and** an entry in the ordered `PLACE_DEFS` (first match wins; put more specific patterns first).
3. `Frontend/src/pages/MainPage.tsx` — a `case` in `renderContent` if the page is hosted inside the tab shell.
4. `Frontend/src/deepLinks/catalog.ts` + regenerate the mirror (orchestrator runs `npm run sync:deep-link-catalog`) if the route should be reachable from a native/assistant deep link, plus a branch in `Frontend/src/hooks/useDeepLink.ts`.

Wave 2 pre-creates all four routes and their stub pages so feature agents only fill in the page body:

| Route | Place | Host | Protected | Offline-gate exception | PRD |
|---|---|---|---|---|---|
| `/welcome` | `welcome` | standalone page `OnboardingPage` | yes | no | 350 |
| `/clubs/:id` | `club` | `MainPage` | **no** (guest-readable) | **yes** | 354 |
| `/shop` | `shop` | `MainPage` | yes | no | 355 |
| `/series/:id` | `series` | `MainPage` | yes | no | 345 |

Query-string overlays: the `Overlay` union in `urlSchema.ts` is widened by Wave 2 to `'player' | 'item' | 'pair'`. `getOverlay` and `parseLocation`'s strip-list are updated to match, and PRD 352 adds a manager component modelled on `Frontend/src/components/PlayerCardModalManager.tsx`.

Deep-link query params owned by this program — handle them in the page that owns them, and always clean them out of the URL after consuming:

| Param | Meaning | PRD |
|---|---|---|
| `?join=1` on `/games/:id` | run the normal join flow after load | 347 |
| `?section=cost` / `?settle=1` on `/games/:id` | scroll to Cost card / open settle sheet | 348 |
| `?section=weather&action=moveIndoor` on `/games/:id` | open the weather banner / move-indoor sheet | 357 |
| `?step=sport` on `/welcome` | resume at a specific onboarding step | 350 |
| `?ref=CODE` anywhere | referral capture | 351 |
| `?playIntentOpen=1` on `/` | open the play-intent compose sheet | 350 |
| `?clubIds=` on `/find` | apply the club filter | 354 |
| `?pair=a,b` | open the pair sheet | 352 |

### 7.6 Data layer

- Server state: **TanStack Query**. Add keys to `Frontend/src/queries/queryKeys.ts` under a new namespace; never inline a key array at a call site.
- Client/UI state: **zustand** stores in `Frontend/src/store/`.
- Offline-capable chat state: Dexie — not relevant to these PRDs except that chat surfaces must keep working.
- API wrappers live in `Frontend/src/api/<resource>.ts` and are re-exported from `Frontend/src/api/index.ts`.
- Mutations that must survive a flaky connection should show the pending outline state rather than blocking; follow the existing optimistic pattern in `GameSettings.tsx` `persistSetting` (optimistic set → request → refetch → success flash → rollback + `toast.error` on failure).

### 7.7 Feature flags

Backend, in `Backend/src/config/env.ts` (opt-in style, default **on** for everything that is not explicitly gated by its PRD):

```ts
gameSeriesEnabled: process.env.GAME_SERIES_ENABLED !== 'false',
costSplitEnabled:  process.env.COST_SPLIT_ENABLED  !== 'false',
shopEnabled:       process.env.SHOP_ENABLED        !== 'false',
```
Document each in `Backend/env.sample`.

Frontend: `VITE_*` vars are untyped and must be declared in the `define` block of `Frontend/vite.config.ts`. Wave 2 adds them plus a testable reader module `Frontend/src/config/featureFlags.ts` following the `Frontend/src/features/player-level-feedback/player-level-feedback.ts` pattern:

```ts
export function isGameSeriesEnabled(raw: unknown = import.meta.env.VITE_GAME_SERIES_ENABLED): boolean {
  if (typeof raw !== 'string') return true;
  return !['0', 'false', 'off'].includes(raw.trim().toLowerCase());
}
```
Flags: `VITE_GAME_SERIES_ENABLED`, `VITE_COST_SPLIT_ENABLED`, `VITE_SHOP_ENABLED`.

A disabled feature must degrade to **nothing rendered and no request made** — never a broken or empty shell.

---

## 8. i18n

### 8.1 How it works

`Frontend/src/i18n/config.ts` builds one flat `translation` bundle per locale by spreading top-level-keyed JSON files. There are **11 locales**: `en, ru, sr, es, cs, ar, zh, id, hi, th, ja`. `sr` is Serbian **Latin**; `zh` is **Simplified**. `ar` is RTL — `applyHtmlLangDir` sets `dir="rtl"` and every new layout must be checked with logical properties (`ms-`/`me-`/`ps-`/`pe-`/`start`/`end`), never `ml-`/`mr-`/`left`/`right`.

### 8.2 Namespaces owned by this program

Wave 2 creates all of these as `{ "<ns>": {} }` in all 11 locale dirs and registers the import + spread in all 11 `Frontend/src/i18n/locales/<code>/index.ts` files. **Feature agents only write content into their own 11 JSON files** and never touch `index.ts`.

| Namespace / file | PRD |
|---|---|
| `series.json` | 345 |
| `attendance.json` | 346 |
| `spots.json` | 347 |
| `cost.json` | 348 |
| `live.json` | 349 |
| `onboarding.json` | 350 |
| `referral.json` | 351 |
| `pairs.json` | 352 |
| `recap.json` | 353 |
| `clubPage.json` | 354 |
| `shop.json` | 355 |
| `weatherAlerts.json` | 357 |

(PRD 356 is Telegram-only; its copy goes through the backend translation files, see §8.4.)

### 8.3 Key parity is now enforced

Wave 2 adds `Frontend/src/i18n/localeParity.test.ts`, which asserts that **every locale has exactly the same key set as `en`** for the namespaces above, and that no non-`en` value is byte-identical to the English one for keys longer than a short allowlist of proper nouns. Write real translations, not English copies. If you genuinely cannot translate a term (a brand name, a score format), add it to the allowlist in that test with a comment.

Write the English copy first, then translate. Keep placeholders (`{{count}}`, `{{name}}`) identical across locales.

**Plurals.** The parity check is **family-aware**, so counted strings use i18next plural suffixes (`pluralSeparator: '_'`) and each locale carries exactly the CLDR categories its grammar needs:

- English declares `foo_one` and `foo_other`.
- Russian / Serbian additionally need `_few` and `_many`; Czech needs `_few` (and `_many` for decimals); Arabic can use `_zero`, `_two`, `_few`, `_many`.
- Chinese, Japanese, Thai, Indonesian have **one** form — `foo_other` alone is correct and complete for them.
- The **only** hard requirement is that every locale defines `_other` for each family. Extra categories are allowed and are not counted as "extra keys"; missing ones are not counted as "missing keys".

Do **not** reword copy to dodge pluralization — "3 games" must read naturally in Russian. (An earlier version of this contract demanded plural suffixes *and* exact key-set parity, which are mutually exclusive; the parity test was fixed, and `series`, `attendance` and `cost` were written under the old rule with count-neutral copy. Those three may be revisited, but nothing new should be.)

### 8.4 Backend copy

Backend user-facing strings are i18n keys resolved by `Backend/src/utils/translations`. Telegram copy uses the same `t(key, lang)` with `getUserLanguage(user.language, ctx.from?.language_code)`. Add keys to the backend translation resources for all 11 supported bot languages.

---

## 9. Admin panel

No build step. Adding a page is five mechanical edits (see `Admin/market-categories.js` for the canonical module):

1. `Admin/index.html` sidebar: `<li><a href="#" data-page="my-thing" class="nav-link">🔧 My Thing</a></li>`
2. `Admin/index.html` body: `<div id="myThingPage" class="content-page">…</div>` (id = camelCase of the page name + `Page`)
3. `Admin/my-thing.js` exposing `window.loadMyThingPage`
4. Add the filename to the `scripts` array in the `bootAdmin()` IIFE at the bottom of `Admin/index.html`
5. Add `case 'my-thing': loadMyThingPage(); break;` to `loadPageData` in `Admin/app.js`

Shared globals available to any page module: `apiRequest`, `escapeHtml`, `escapeHtmlAttr`, `formatDate`, `toast`, `openModal` / `closeModal`, `ALL_SPORTS` / `sportLabel`, `selectedCityId`, `API_URL`, `authToken`, `DataTable`.

Admin pages added by this program: **Goods** (355), **Referrals** (351), and new rows on **Platform Settings** (348, 351).

Admin is opened only via `./Admin/serve.sh` → `http://127.0.0.1:9010/`. Never `file://`.

---

## 10. Tests

- **Backend** tests are hand-rolled `ts-node` scripts named `<thing>.test.ts`, colocated with the source, asserting with `node:assert`. They are run by per-area `test:*` npm scripts. Look at an existing one in your domain before writing.
- **Frontend** tests are Vitest, named `<thing>.test.ts(x)`, colocated with the source.
- **Do not edit `package.json` or `.github/workflows/ci.yml`.** Write the test files; the orchestrator wires the `test:*` scripts and the CI job at integration time. Name your files so a glob finds them.
- Pure logic (date math, share math, severity classification, partner detection, chemistry) must have unit tests with fixtures. Service tests that need the DB go in a `*.integration.test.ts` and must be safe to run against `padelpulse_dev`.
- Every PRD's "Testing Decisions" section is a requirement, not a suggestion.

---

## 11. Docs you must produce

Do **not** edit `docs/UI_TEST_PLAN.md` or `docs/domains/*.md` directly — many agents would collide. Instead:

- Write your UI test plan section to `docs/plans/prd-345-357/ui-test-plan/prd-<n>.md`, formatted exactly like an existing `docs/UI_TEST_PLAN.md` section (`### N.N Title` headings with bullet cases, including `@manual` / `@two-user` tags where relevant). The orchestrator merges them.
- Write your domain-doc delta to `docs/plans/prd-345-357/domains/prd-<n>.md`, saying which `docs/domains/<area>.md` file each block belongs in. The orchestrator merges them.
- If your PRD introduces a load-bearing invariant that must never be "simplified away", say so in your report with the exact paths — the orchestrator adds it to `docs/product/constraints.md`.

---

## 12. Your report

End your run with a report written to `docs/plans/prd-345-357/reports/prd-<n>.md` containing:

1. **Done** — what you implemented, file by file, grouped backend / frontend / i18n / admin / tests / docs.
2. **Contract deltas** — anything you needed that this contract did not provide, and what you did instead.
3. **Files you could not touch** — changes you need the orchestrator to apply in files you do not own, written as exact diffs or precise instructions.
4. **Known gaps** — anything in your PRD you did not finish, and why. Be honest; the critic pass will find it anyway and an honest list is cheaper to close.
5. **Test files added** — exact paths, so the orchestrator can wire npm scripts.
6. **Manual verification needed** — anything that only a device or a real run can confirm.

---

## 13. Definition of done (this is what the critics check)

For each PRD, all of the following must be true:

- Every **User Story** in the PRD is satisfied by working code, not a stub.
- Every element of the **UX / UI Design** section exists: entry points, states, empty/loading/error states, edge cases, motion, accessibility notes.
- Every item in **Implementation Decisions** is honoured, or the deviation is documented with a reason.
- Every item in **Testing Decisions** has a corresponding test file.
- Nothing in **Out of Scope** was built.
- All copy is in all 11 locales and passes the parity test. No hard-coded user-facing English anywhere in `Frontend/src`.
- RTL (`ar`) verified by using logical CSS properties throughout.
- Reduced motion verified: every animation has a reduced-motion path.
- Light, Dark, Classic and Premium themes all read correctly.
- Keyboard contract honoured by every overlay containing an input.
- 44 px tap targets, labelled controls, text alternatives for colour-coded state.
- Backend: permission checks on every mutating endpoint; no endpoint leaks private data to guests; rate limits on anything a user can trigger repeatedly.
- No `console.log` left behind; use the existing logging path.
- Feature degrades cleanly when its flag is off.
