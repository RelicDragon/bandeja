# Wave 2 — backend scaffold report (PRDs 345–357)

Owner: Wave 2 backend scaffold agent. Scope: CONTRACT §5, §6, §7.7 (backend half).

No heavy command was run (no `tsc`, build, test, lint, `prisma generate`, `prisma migrate`).
`Backend/prisma/schema.prisma`, `Backend/prisma/migrations/`, `Frontend/`, `package.json` and
`.github/workflows/ci.yml` were **not** touched.

---

## 1. Done

### 1.1 Notification types and preference keys (CONTRACT §5.1)

`Backend/src/types/notifications.types.ts`

- `PreferenceKey.SEND_WEATHER_ALERTS = 'sendWeatherAlerts'`.
- 10 new `NotificationType` values, each with a `///`-style doc comment naming its PRD:
  `GAME_SERIES_NEXT_PROMPT`, `GAME_NO_SHOW_NOTED`, `GAME_SPOT_OPENED`,
  `FOLLOWED_GAME_SPOT_OPENED`, `GAME_COST_REMINDER`, `FOLLOWED_USER_LIVE`,
  `REFERRAL_JOINED`, `MONTHLY_RECAP_READY`, `GOODS_GIFT_RECEIVED`, `GAME_WEATHER_ALERT`.
- `NotificationData` widened with `seriesId`, `attendanceActionToken`, `confirmActionTitle`,
  `unsureActionTitle`, `keepActionTitle`, `spotOpenedAt`, `recapMonthKey` — all optional, all
  `string` except nothing (matching the existing style; `mediaCount`/`unreadBadgeCount` remain the
  only numbers).

`Backend/src/services/notificationPreference.service.ts`

- 10 new `NOTIFICATION_TYPE_TO_PREF` entries exactly as CONTRACT §5.1 maps them.
- `sendWeatherAlerts` added to **every** place that enumerated the nine columns:
  `NotificationPreferenceData`, `DEFAULT_PREFERENCES`, `toData`, `countTrue`, `flagsFromRow`.
- `flagsFromRow` previously re-declared the nine-column shape inline as its parameter type; it now
  takes `PrefFlags`, so the list exists once. Callers pass Prisma rows, which are structurally
  wider — that still type-checks.

**Grep sweep for other exhaustive enumerations** (the thing that silently breaks):

| Place | Verdict |
|---|---|
| `controllers/user/notificationPreferences.controller.ts` | Generic — drives off `Object.values(PreferenceKey)`. Picks the new key up for free, for both validation and the `updateMany` projection. |
| `routes/user.routes.ts` `PUT /users/notification-preferences` | Validates only `channelType`; no key list. |
| `services/notification.service.ts` | `NOTIFICATION_TYPE_TO_PREF[type]` lookup, no switch. |
| `services/playIntent/playIntentNotificationDeliveryQueue.service.ts` (×2) | Same lookup. |
| `services/push/preparePushPayload.ts` | `switch (payload.type)` **with a `default`** — non-exhaustive by design. |
| `services/admin/massNotification.service.ts`, `controllers/push.controller.ts` | Use a single fixed type. |
| `Admin/` | No preference-key list anywhere (grepped). |

`NOTIFICATION_TYPE_TO_PREF` is the only `Record<NotificationType, …>` in the backend.

### 1.2 Push action tokens (CONTRACT §5.2)

`Backend/src/services/push/pushInviteActionToken.service.ts` — widened to the documented unions.
HS256, `expiresIn: '48h'`, `issuer`/`audience`, `clockTolerance: 45`, `MAX_TOKEN_LENGTH = 4096`
and `ID_PATTERN` are unchanged.

`Backend/src/services/push/pushActionHandlers.ts` — new registry (§2 below for signatures).

`Backend/src/controllers/pushInviteAction.controller.ts` — `team` and `game` stay as **direct
branches** (deliberate: the `team` branch answers `{ success, data }`, which the registry's
`{ success, message }` result shape cannot express without changing the wire format). Everything
else dispatches through the registry; an unregistered kind is
`400 push.inviteActionUnsupported`, never a 500.

`Backend/src/services/push/pushInviteActionToken.service.test.ts` — extended: every documented
kind/action pair round-trips, and a disallowed pair throws.

### 1.3 Telegram callback prefixes (CONTRACT §5.3)

`Backend/src/services/telegram/bot.service.ts` — regex is now
`/^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/`, with a comment saying every prefix handled in
`callback.handler.ts` must be listed. **This fixes a live bug**: `uti:` (user-team invite
accept/decline) and `sip:` (play-intent proposal) are implemented and actively emitted but were
never registered, so those Telegram buttons did nothing at all.

`Backend/src/services/telegram/handlers/callback.handler.ts` — the `if/else if` chain now ends in
an `else { await ctx.answerCallbackQuery(); }`, so a registered-but-not-yet-implemented prefix
(`at`, `sr`, `wx`, `pi`) closes the Telegram spinner instead of leaving it hanging. Without this,
registering the four new prefixes would have made the bot look broken until each PRD lands.
No `at`/`sr`/`wx`/`pi` branch was implemented — those belong to PRDs 346 / 345 / 357 / 356.

### 1.4 Feature flags (CONTRACT §7.7)

`Backend/src/config/env.ts` — `gameSeriesEnabled`, `costSplitEnabled`, `shopEnabled`, all
`process.env.X !== 'false'`, each documented with what "off" must look like.
`Backend/env.sample` — a new banner block `Feature flags (PRDs 345–357)` before the
`Other (not referenced in src/config/env.ts)` block, commented-out entries in the file's house
style.

### 1.5 PlatformSetting service + admin endpoints

- `Backend/src/services/platformSetting.service.ts` (§2 below for the signatures).
- `Backend/src/services/platformSetting.service.test.ts` — pure unit test (no DB): numeric
  parsing incl. `0`, `Infinity`, `NaN`, whitespace, and the TTL cache driven by an injected clock.
- `Backend/src/controllers/admin.controller.ts` — `getPlatformSettings`, `setPlatformSetting`,
  written next to `getReplicatePhotoModel` / `setReplicatePhotoModel` and in the same idiom.
- `Backend/src/routes/admin.routes.ts` —
  `GET /admin/platform-settings` and `PUT /admin/platform-settings/:key`, both `requireAdmin`,
  the `PUT` validated with `express-validator` (`key` must match
  `PLATFORM_SETTING_KEY_PATTERN`, `value` a string ≤ 2000 chars).

`GET` returns `{ settings, knownKeys }` so the Admin page can render a row for a key that has no
row yet. `COINS_PER_CURRENCY_UNIT` is deliberately absent from the table (Wave 1 seeded only the
two referral keys), so `getNumericSetting(COINS_PER_CURRENCY_UNIT)` returns `null` and PRD 348
hides the coins option.

### 1.6 Route mounts and empty routers

13 new route files + all 13 mounts in `Backend/src/routes/index.ts`. Full table and shadowing
analysis in §3.

### 1.7 Socket events (CONTRACT §6)

Six public methods on `Backend/src/services/socket.service.ts` and six typed wrappers on
`Backend/src/services/socketEmitFacade.ts` (§2 for signatures). `socketEmitFacade` **is** the
house pattern for typed emits (it exists so bets/game-update callers avoid
`(global as any).socketService`), so the new events were added there too and
`SocketEmitBackend` was widened accordingly.

Every emitted payload was checked byte-for-byte against the frontend scaffold's
`Frontend/src/services/socketService.ts` payload interfaces — they match.

### 1.8 Find-card projection and enrichment (CONTRACT §5.6)

- `availableGamesCard.projection.ts` — the nine scalars added to `FIND_CARD_GAME_SELECT`:
  `seriesId`, `lastSeatOpenedAt`, `showOnLiveRail`, `autoFillFromQueue`, `priceType`,
  `priceTotal`, `priceCurrency`, `costPayerId`, `weatherAlertState`.
  None is in `FIND_CARD_FORBIDDEN_GAME_KEYS` (`description`, `mediaUrls`, `metadata`,
  `telegramResultsSummary`, `resultsSummaryText`, `resultsMeta`, `lastMessagePreview`), none is a
  relation, none is a fat blob — `assertAvailableGamesCardContract` is unaffected. Verified that
  `projectAvailableGameCardPayload` (`read.service.ts`) is a rest-spread denylist, so the new
  scalars survive projection.
- `availableGamesEnrichmentTypes.ts` — new, mirrors
  `Frontend/src/types/gameCardEnrichment.ts` (§4).
- `availableGamesEnrichment.ts` — `AvailableGameEnrichFields` widened with the six optional
  fields; enricher registry added; `AVAILABLE_ENRICH_MAX_IDS = 100` preserved;
  `enrichAvailableGamesByIds` now also round-trips the six new fields, emitting a key only when
  an enricher actually produced one (absent = "no change", `null` = "explicitly nothing").
- `gamePrismaIncludes.ts` — `gameMyTabListInclude` needed **no field additions**: it is an
  `include`, not a `select`, so every `Game` scalar (including all the PRD 345–357 columns)
  already reaches My-Tab cards. Documented that on the constant so nobody "fixes" it later.
  `GameReadService.getMyGames` runs `enrichAvailableGamesSafe`, so enrichment-derived fields reach
  My Tab as well.

### 1.9 Scheduler registration points (CONTRACT §5.4)

Three new classes, each `cron.schedule(...)` in `start()`, `.stop()` + null in `stop()`, a
`running` boolean re-entrancy guard copied from `PlayIntentScheduler`, and a `try/catch/finally`
so the cron callback can never throw:

| File | Class | Cron |
|---|---|---|
| `src/services/gameSeries/gameSeriesScheduler.service.ts` | `GameSeriesScheduler` | `30 3 * * *` |
| `src/services/gameCost/costShareReminderScheduler.service.ts` | `CostShareReminderScheduler` | `0 * * * *` |
| `src/services/recap/monthlyRecapScheduler.service.ts` | `MonthlyRecapScheduler` | `0 4 1-3 * *` |

Each exposes `async runOnce(): Promise<void>` holding the (empty, commented) tick body, so
PRD 345 can also call it on series create/edit as §5.4 requires without re-implementing the guard.

`src/server.ts` — all three instantiated + `start()`ed after `ratingInactiveScheduler`, all three
`stop()`ed in `gracefulShutdown` before `stopQueueWorkers()`.

---

## 2. Exact signatures — 12 agents code against these

### 2.1 Push action handler registry — `Backend/src/services/push/pushActionHandlers.ts`

```ts
export type PushActionResult = { success: boolean; message: string };

export type PushActionHandler = (
  scope: PushInviteActionScope
) => Promise<PushActionResult>;

export function registerPushActionHandler(
  kind: PushInviteActionScope['kind'],
  handler: PushActionHandler
): void;

export function resolvePushActionHandler(
  kind: PushInviteActionScope['kind']
): PushActionHandler | undefined;

export function resetPushActionHandlersForTests(): void;
```

and in `Backend/src/services/push/pushInviteActionToken.service.ts`:

```ts
export const PUSH_INVITE_ACTION_KINDS = ['game', 'team', 'series', 'attendance', 'weather'] as const;
export type PushInviteActionKind = (typeof PUSH_INVITE_ACTION_KINDS)[number];

export const PUSH_INVITE_ACTION_ACTIONS = ['accept', 'decline', 'confirm', 'unsure', 'keep'] as const;
export type PushInviteAction = (typeof PUSH_INVITE_ACTION_ACTIONS)[number];

export const PUSH_INVITE_ACTION_ALLOWED_ACTIONS: Record<
  PushInviteActionKind,
  readonly PushInviteAction[]
> = {
  game:       ['accept', 'decline'],
  team:       ['accept', 'decline'],
  series:     ['accept', 'decline'],
  attendance: ['confirm', 'unsure'],
  weather:    ['keep'],
};

export type PushInviteActionScope = {
  userId: string;
  kind: PushInviteActionKind;
  targetId: string;
  action: PushInviteAction;
};

export function signPushInviteActionToken(scope: PushInviteActionScope): string;
export function verifyPushInviteActionToken(token: string): PushInviteActionScope;
```

**Read this before you sign a token.** `PUSH_INVITE_ACTION_ALLOWED_ACTIONS` is enforced on both
sign and verify. It is not decoration — without it, widening the unions would have let a `game`
token carrying `keep` fall into the controller's `action === 'accept' ? accept : decline` ternary
and silently **decline** a game invite. If your PRD needs a pair that is not in the map, ask the
orchestrator to add it; do not work around it.

**How to register.** Registration must run at import time of a module the app loads. The reliable
path: put the `registerPushActionHandler(...)` call at module scope in your feature's service
module, which your route file imports — all 13 PRD routers are already mounted from
`routes/index.ts`, so the import chain reaches `app.ts`.

```ts
// e.g. services/gameAttendance/gameAttendance.service.ts
registerPushActionHandler('attendance', async (scope) => {
  const ok = await setAttendanceFromPush(scope.userId, scope.targetId, scope.action);
  return ok
    ? { success: true, message: 'attendance.updated' }
    : { success: false, message: 'errors.attendance.notParticipant' };
});
```

`message` is an **i18n key**, not an English sentence — a falsy `success` becomes
`throw new ApiError(400, result.message)`.

### 2.2 Available-games enricher registry — `Backend/src/services/game/availableGamesEnrichment.ts`

```ts
export const AVAILABLE_ENRICH_MAX_IDS = 100;

export type AvailableGameEnrichFields = {
  userNote?: string | null;
  weatherSummary?: unknown;
  reactions?: unknown[];
  spotOpenedAt?: string | null;                  // PRD 347
  liveSummary?: LiveGameSummary | null;          // PRD 349
  weatherRisk?: WeatherRisk | null;              // PRD 357
  perHeadPrice?: PerHeadPrice | null;            // PRD 348
  seriesLabel?: SeriesCardLabel | null;          // PRD 345
  attendanceSummary?: AttendanceSummary | null;  // PRD 346
};

export type AvailableGamesEnricherInput = {
  id: string;
  cityId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  timeIsSet?: boolean;
};

export type AvailableGamesEnricher = (
  userId: string,
  games: AvailableGamesEnricherInput[],
) => Promise<Record<string, Partial<AvailableGameEnrichFields>>>;

export function registerAvailableGamesEnricher(
  name: string,
  enricher: AvailableGamesEnricher,
): void;

export function listAvailableGamesEnricherNames(): string[];
export function resetAvailableGamesEnrichersForTests(): void;

export async function enrichAvailableGamesSafe<T extends AvailableGamesEnricherInput>(
  userId: string,
  games: T[],
): Promise<(T & AvailableGameEnrichFields)[]>;

export async function enrichAvailableGamesByIds(
  userId: string,
  gameIds: string[],
): Promise<Record<string, AvailableGameEnrichFields>>;
```

Rules for an enricher:

- **Read-only, batched.** One query per call, never one per game. Find calls this on every page.
- Return `{}` when there is nothing to attach. A throw is survivable — every enricher runs inside
  the existing `Promise.all` with a per-enricher `.catch(() => null)`, so a failure logs a warning
  and contributes nothing. One broken PRD can never break Find.
- Re-registering the same `name` replaces the previous entry, so a doubly-imported module cannot
  double-register.
- Register the same way as the push handlers: module scope in your feature service, imported by
  your route file.
- Fields you return are `Object.assign`-ed onto the card **after** notes/weather and **before**
  reactions. Do not return `userNote` / `weatherSummary` / `reactions`.

### 2.3 PlatformSetting service — `Backend/src/services/platformSetting.service.ts`

```ts
export const PLATFORM_SETTING_KEYS = {
  COINS_PER_CURRENCY_UNIT: 'COINS_PER_CURRENCY_UNIT',
  REFERRAL_REWARD_REFERRER: 'REFERRAL_REWARD_REFERRER',
  REFERRAL_REWARD_REFERRED: 'REFERRAL_REWARD_REFERRED',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export const PLATFORM_SETTING_CACHE_TTL_MS = 60_000;
export const PLATFORM_SETTING_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
export const PLATFORM_SETTING_MAX_VALUE_LENGTH = 2000;

export type PlatformSettingRow = { key: string; value: string; updatedAt: Date };

export function parsePlatformSettingNumber(
  raw: string | null,
  fallback?: number | null,
): number | null;

export class PlatformSettingCache {
  constructor(ttlMs?: number, now?: () => number);
  get(key: string): string | null | undefined;  // undefined = miss/expired, null = cached "no row"
  set(key: string, value: string | null): void;
  delete(key: string): void;
  clear(): void;
  get size(): number;
}

export async function getSetting(key: string): Promise<string | null>;
export async function getNumericSetting(key: string, fallback?: number): Promise<number | null>;
export async function setSetting(key: string, value: string): Promise<void>;
export async function listSettings(): Promise<PlatformSettingRow[]>;
export function invalidateSettingsCache(): void;

/** Namespaced re-export of the five functions above, for callers that prefer a service object. */
export const PlatformSettingService = { … };
```

- 60 s TTL, **per node**. A write is visible immediately on the writing node and within one TTL
  everywhere else. Do not use these keys as a lock or as the sole guard on money movement.
- Missing rows are cached as `null`, so an unset key does not hit the DB on every read.
- `getNumericSetting('COINS_PER_CURRENCY_UNIT')` → `null` (no row, no fallback). PRD 348 treats
  `null` as "coins settlement unavailable, hide the option" — do not pass a fallback there.
- `parsePlatformSettingNumber` never throws: a malformed row falls back instead of taking down a
  request path.

### 2.4 Socket emit methods

On `SocketService` (`Backend/src/services/socket.service.ts`) — all emit kebab-case to
`` `game-${gameId}` ``, all spread `gameId` into the payload:

```ts
public emitGameAttendanceUpdated(gameId: string, payload: {
  userId: string;
  attendance: ParticipantAttendance;   // Prisma enum
  confirmedCount: number;
  playingCount: number;
}): void;                                             // -> 'game-attendance-updated'

public emitGameSeatOpened(gameId: string, payload: {
  freedCount: number;
  cause: SpotOpenedCause;
  lastSeatOpenedAt: string;            // ISO
}): void;                                             // -> 'game-seat-opened'

public emitGameSeatFilled(gameId: string, payload: { userId: string }): void;
                                                      // -> 'game-seat-filled'

public emitGameCostUpdated(gameId: string): void;     // -> 'game-cost-updated'

public emitGameSeriesConfirmationsUpdated(gameId: string, payload: {
  seriesId: string;
  confirmedCount: number;
  regularCount: number;
}): void;                                  // -> 'game-series-confirmations-updated'

public emitGameWeatherAlertUpdated(gameId: string, payload: {
  severity: WeatherRiskSeverity;
}): void;                                  // -> 'game-weather-alert-updated'
```

**Prefer the facade** (`Backend/src/services/socketEmitFacade.ts`) — typed, a no-op before
`initSocketEmitFacade` runs (scripts, workers, tests), and it swallows emit errors rather than
failing your transaction:

```ts
export type GameAttendanceUpdatedPayload = {
  userId: string; attendance: ParticipantAttendance; confirmedCount: number; playingCount: number;
};
export type GameSeatOpenedPayload = {
  freedCount: number; cause: SpotOpenedCause; lastSeatOpenedAt: string;
};
export type GameSeriesConfirmationsUpdatedPayload = {
  seriesId: string; confirmedCount: number; regularCount: number;
};

export async function emitGameAttendanceUpdated(gameId: string, payload: GameAttendanceUpdatedPayload): Promise<void>;
export async function emitGameSeatOpened(gameId: string, payload: GameSeatOpenedPayload): Promise<void>;
export async function emitGameSeatFilled(gameId: string, payload: { userId: string }): Promise<void>;
export async function emitGameCostUpdated(gameId: string): Promise<void>;
export async function emitGameSeriesConfirmationsUpdated(gameId: string, payload: GameSeriesConfirmationsUpdatedPayload): Promise<void>;
export async function emitGameWeatherAlertUpdated(gameId: string, payload: { severity: WeatherRiskSeverity }): Promise<void>;
```

Frontend receives exactly `{ gameId, ...payload }`, matching
`Frontend/src/services/socketService.ts`'s `GameAttendanceUpdatedPayload`,
`GameSeatOpenedPayload`, `GameSeatFilledPayload`, `GameCostUpdatedPayload`,
`GameSeriesConfirmationsUpdatedPayload`, `GameWeatherAlertUpdatedPayload` — verified field by
field.

---

## 3. Mounted routes and shadowing analysis

All 13 files export a default `Router()` with a header comment naming the owning PRD and an
`// Endpoints are added by the PRD <n> agent.` line. **No feature agent needs to touch
`routes/index.ts`.**

| File | Mount | PRD | Position |
|---|---|---|---|
| `onboarding.routes.ts` | `/users` (paths under `/me/onboarding`) | 350 | before `user.routes.ts` |
| `recap.routes.ts` | `/users` (paths under `/me/recaps`) | 353 | before `user.routes.ts` |
| `clubPublic.routes.ts` | `/clubs` | 354 | before `club.routes.ts` |
| `gameSeries.routes.ts` | `/games` (for `POST /:id/series`) | 345 | before `game.routes.ts` |
| `gameAttendance.routes.ts` | `/games` | 346 | before `game.routes.ts` |
| `gameCost.routes.ts` | `/games` | 348 | before `game.routes.ts` |
| `gameWeather.routes.ts` | `/games` | 357 | before `game.routes.ts` |
| `pairRanking.routes.ts` | `/rankings` | 352 | before `ranking.routes.ts` |
| `series.routes.ts` | `/series` | 345 | new path, end of file |
| `liveGames.routes.ts` | `/live` | 349 | new path, end of file |
| `referral.routes.ts` | `/referrals` | 351 | new path, end of file |
| `publicReferral.routes.ts` | `/public/referral` | 351 | new path, end of file |
| `shop.routes.ts` | `/shop` | 355 | new path, end of file |

### Ordering decision and why

Express runs `router.use` mounts in registration order; a mounted router that matches nothing
calls `next()` and the request continues to the next mount. So a router mounted **first** can
never be shadowed, and everything it does not match falls straight through unchanged.

I read all four incumbent routers before deciding:

- `game.routes.ts` — `GET|PUT|DELETE /:id`, dozens of `/:id/<verb>` routes, `use('/:gameId/photos')`,
  and `GET /` — but **no** catch-all.
- `club.routes.ts` — `GET|PUT /:id`, plus `/:id/reviews`, `/:id/my-review`,
  `/:id/review-eligible-games`, `/:clubId/{booktime,padeloo,klikteren}/…`.
- `user.routes.ts` — no bare `/:userId`, but `GET /:userId/stats` and
  `GET /:userId/common-groups`, which sit *before* `/invitable-players` in the file (a
  latent 2-segment collision pattern).
- `ranking.routes.ts` — only `/user-context` and `/achievement-context`. No parameters at all.

Mounting the new sub-routers **before** the incumbents therefore:

1. removes every shadowing risk, including the non-obvious `/:userId/<x>` 2-segment ones — that
   was the explicit requirement;
2. changes **no** existing endpoint, because the new routers start empty and only ever gain
   specific new paths.

The trade is the mirror image: a path declared in one of the new routers wins over the same path
in the incumbent. Each new file's header comment says so explicitly and forbids declaring a bare
`/`, `/:id` or `/:userId` there.

**The one concrete collision to know about:** `GET /games/:id/weather` already exists
(`game.routes.ts:102` → `controllers/weather.controller.ts#getGameWeather`, the plain forecast).
`gameWeather.routes.ts` must **not** re-declare it — its header says to use a distinct path such
as `/:id/weather-alert`. That note is repeated in the `routes/index.ts` mount-block comment.

The five new top-level mounts (`/series`, `/live`, `/referrals`, `/public/referral`, `/shop`) have
no incumbent at all and sit at the end of the file next to the other `/public/*` mounts.

Empty routers fall through to `app.use(notFoundHandler)` in `app.ts`, so an unimplemented endpoint
is a clean 404 — nothing throws.

---

## 4. Enrichment payload interfaces (backend copy)

`Backend/src/services/game/availableGamesEnrichmentTypes.ts`. **Confirmed field-for-field
identical to `Frontend/src/types/gameCardEnrichment.ts`**, including doc comments.
There is no generated client and no compile-time link between the two files — **changing one
means changing the other in the same change.**

```ts
export type ParticipantAttendance = 'UNANSWERED' | 'CONFIRMED' | 'UNSURE'; // re-exported from @prisma/client

export interface AttendanceSummaryEntry {
  userId: string;
  attendance: ParticipantAttendance;
}

/** PRD 346 */
export interface AttendanceSummary {
  confirmedCount: number;
  unsureCount: number;
  unansweredCount: number;
  playingCount: number;
  viewerAttendance: ParticipantAttendance | null;
  entries?: AttendanceSummaryEntry[];
}

/** PRD 347 */
export type SpotOpenedCause =
  | 'LEAVE' | 'KICK' | 'INVITE_DECLINED' | 'SUBSTITUTION' | 'CAPACITY_INCREASE';

export interface SpotOpenedInfo {
  freedCount: number;
  cause: SpotOpenedCause;
  lastSeatOpenedAt: string;
}

/** PRD 348 */
export interface PerHeadPrice {
  amountCents: number;
  currency: PriceCurrency;
  totalCents: number;
  payerCount: number;
  estimated: boolean;
}

/** PRD 345 */
export type GameSeriesCadence = 'WEEKLY' | 'BIWEEKLY';

export interface SeriesCardLabel {
  seriesId: string;
  name: string;
  cadence: GameSeriesCadence;
  weekday: number;          // ISO-8601, 1 = Monday
  startTimeLocal: string;   // HH:mm, club-local
  occurrenceNumber?: number;
  endedAt?: string | null;
}

/** PRD 349 */
export interface LiveGameSummarySide {
  teamNumber: number;
  players: BasicUser[];
  setScores: number[];
  currentGameScore: string;
  leading: boolean;
}

export interface LiveGameSummary {
  matchId: string;
  courtName?: string | null;
  currentSet: number;
  sides: [LiveGameSummarySide, LiveGameSummarySide];
  startedAt?: string | null;
  revision?: number;
}

/** PRD 357 */
export type WeatherRiskSeverity = 'none' | 'likely' | 'heavy' | 'storm';

export interface WeatherRisk {
  severity: WeatherRiskSeverity;
  pop: number;
  windKph: number;
  at: string;
  keptAsPlanned?: boolean;
}
```

Two deliberate, invisible-at-runtime differences from the frontend file:

1. `PriceCurrency` and `ParticipantAttendance` come from `@prisma/client` here (the frontend
   declares them as hand-written string unions). The value sets are identical.
2. `BasicUser` is `Backend/src/types/user.types.ts`'s, which declares
   `firstName: string | null` where the frontend's declares `firstName?: string`. That divergence
   is pre-existing across the whole codebase; both describe the same JSON. Using the backend's own
   `BasicUser` is what the rest of the backend does.

---

## 5. Contract deltas

1. **`PUSH_INVITE_ACTION_ALLOWED_ACTIONS` is not in the contract.** §5.2 gives the kind→actions
   table as prose. Widening the unions without enforcing that table would have created a real
   security/behaviour hole (see §2.1). I encoded the table and enforce it on sign and verify.
2. **`game` / `team` push actions were left as direct controller branches**, not registry
   entries, because the `team` branch's `{ success, data }` response cannot be expressed by the
   registry's `{ success, message }` result type. The contract explicitly left this to judgement.
3. **`runOnce()` on all three schedulers.** §5.4 only specifies `start()`/`stop()`, but it also
   requires the PRD 345 scheduler to run "on series create/edit". A public guarded `runOnce()` is
   the only way to do that without duplicating the re-entrancy guard at the call site.
4. **`flagsFromRow`'s parameter type collapsed to `PrefFlags`.** It previously duplicated the
   nine-column shape inline. Behaviour identical.
5. **`gameMyTabListInclude` needed no change** — it is an `include`, so all `Game` scalars already
   flow. The contract implies an edit might be needed; documented instead.
6. **`GET /admin/platform-settings` returns `{ settings, knownKeys }`**, not a bare array, so the
   Admin page can show a row for a key that has no DB row yet (exactly the
   `COINS_PER_CURRENCY_UNIT` state PRD 348 depends on).

---

## 6. Files I could not touch

None blocked me. Two things other agents must do — both already in the contract, listed here as a
checklist:

1. **`Frontend/src/components/NotificationSettingsModal.tsx`** already declares `sendWeatherAlerts`
   (the Wave 2 frontend scaffold landed it) and `Frontend/src/api/users.ts` types it as a
   **required** `boolean`. My backend change supplies it on every
   `GET/PUT /users/notification-preferences` response, so those two are now consistent. The copy
   keys `profile.sendWeatherAlerts` / `profile.sendWeatherAlertsDescription` are the frontend
   scaffold's business.
2. **Admin panel "Platform Settings" page** (CONTRACT §9) — the endpoints exist now; the page is
   PRD 348 / 351's work. It needs `GET /admin/platform-settings` and
   `PUT /admin/platform-settings/:key` with `{ value: string }`.

---

## 7. Known gaps

- **Registration is import-time, so a feature that registers a push handler or an enricher but
  whose route file is never imported will silently do nothing.** All 13 routers *are* mounted, so
  the chain exists — but if an agent puts the registration in a module nothing imports, it will
  not run. Flagged in both registry doc comments.
- **`PUSH_INVITE_ACTION_ALLOWED_ACTIONS` is a runtime check, not a compile-time one.** An agent
  needing a pair outside the map finds out at runtime. Mitigated by the doc comment and by this
  report; a deliberate trade for not leaving the hole described in §5.1.
- **The `at` / `sr` / `wx` / `pi` Telegram branches are registered but unimplemented.** They now
  answer the callback query and do nothing, which is the correct interim behaviour — but PRDs 346,
  345, 357 and 356 must actually implement them, and PRD 356 owns `pi:` with four sub-shapes.
- **No integration test for the new admin endpoints.** The colocated test is pure (cache +
  parsing). A DB-touching `*.integration.test.ts` for `getSetting`/`setSetting` round-trip is
  worth adding but belongs with whoever first uses the table for real (PRD 348 or 351).
- **`PlatformSettingCache` is per-node.** With more than one backend node, an admin write takes up
  to 60 s to be visible elsewhere. Acceptable for these keys; document it if a future key needs
  stronger consistency.

---

## 8. Test files added / changed

| Path | Kind | Notes |
|---|---|---|
| `Backend/src/services/platformSetting.service.test.ts` | **new**, pure unit | `ts-node --transpile-only`, no DB, no dotenv needed |
| `Backend/src/services/push/pushInviteActionToken.service.test.ts` | **extended** | already wired into `test:auth-refresh`; needs `JWT_SECRET` as before |

Suggested wiring (orchestrator owns `package.json`):

```
"test:platform-settings": "ts-node --transpile-only src/services/platformSetting.service.test.ts"
```

Existing suites that cover files I changed and should be re-run:
`test:available-games` (projection + enrichment + `weatherForecast.nonBlocking` which greps
`availableGamesEnrichment.ts` for `refresh: 'background'` / `FIND_WEATHER_SOFT_WAIT_MS` — both
preserved), `test:auth-refresh`, `test:play-intent` (it runs
`notificationPreference.legacyMirror.test.ts` and `preparePushPayload.test.ts`).

---

## 9. Manual verification needed

1. **`npm run typecheck` + `npm run lint` in `Backend/`** — I could run neither. The riskiest
   spots are the `Promise.all` tuple inference in `enrichAvailableGamesSafe` (four elements, the
   fourth now `runRegisteredEnrichers`) and `SocketService` structurally satisfying the widened
   `SocketEmitBackend` interface.
2. **Boot the server** and confirm the three new schedulers log their start lines and that
   `SIGINT` logs their stop lines.
3. **`GET /api/admin/platform-settings`** as an admin → exactly two rows
   (`REFERRAL_REWARD_REFERRER`, `REFERRAL_REWARD_REFERRED`), `COINS_PER_CURRENCY_UNIT` absent from
   `settings` but present in `knownKeys`. Then
   `PUT /api/admin/platform-settings/REFERRAL_REWARD_REFERRER {"value":"60"}` and re-`GET`.
4. **Telegram, on a real bot:** tap a `uti:` (user-team invite) and a `sip:` (play-intent
   proposal) button. Both were dead before this change; they should now work. Also confirm that a
   not-yet-implemented prefix does not leave the button spinning.
5. **Find and My Tab still render** — the nine new scalars are additive, but confirm payload size
   did not jump (`weatherAlertState` is the only non-scalar; it is a small Json blob and `null` on
   every existing row).
6. **`POST /api/push/invite-action`** with an old-format `game`/`team` token still signed by the
   previous code: it must still work (the payload shape is unchanged; only the accepted unions
   widened).
