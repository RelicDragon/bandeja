# Wave 2 — Frontend scaffold

Shared frontend foundation for PRDs 345–357 so the 12 feature agents never collide on a shared file.
Nothing in here is a throw-away stub: every file compiles, renders and is lint-clean.

---

## 1. Done

### i18n

**12 new namespaces × 11 locales = 132 files**, each exactly `{ "<ns>": {} }`:

`series.json`, `attendance.json`, `spots.json`, `cost.json`, `live.json`, `onboarding.json`,
`referral.json`, `pairs.json`, `recap.json`, `clubPage.json`, `shop.json`, `weatherAlerts.json`

Locales: `en, ru, sr, es, cs, ar, zh, id, hi, th, ja` (`Frontend/src/i18n/locales/<code>/`).

All 12 are **registered (import + spread) in all 11 `Frontend/src/i18n/locales/<code>/index.ts`**, in
alphabetical position matching each file's existing ordering. **Feature agents must never touch
`index.ts`** — only their own 11 JSON files.

Also in those `index.ts` files:

- Removed the pre-existing duplicate `...sportRating,` spread. It was duplicated in **7** locales
  (`en, ar, hi, id, ja, th, zh`); the second spread (the one after `...rating,`) was removed. `ru, cs,
  es, sr` only ever had one and were left alone.

New shared copy (real translations in all 11 locales, no English copies):

- `Frontend/src/i18n/locales/<code>/common.json` → `common.comingSoon`, `common.comingSoonDescription`
  (used by the four stub pages so no hard-coded English enters `Frontend/src`).
- `Frontend/src/i18n/locales/<code>/profile.json` → `profile.sendWeatherAlerts` ("Weather alerts"),
  `profile.sendWeatherAlertsDescription` ("Only for outdoor courts") — PRD 357 notification row.

### i18n parity test

`Frontend/src/i18n/localeParity.test.ts` — reads the JSON off disk (so it picks up feature-agent keys
without ever being edited) and asserts, per non-`en` locale:

1. key set is **exactly** equal to `en` (failure prints full dotted paths, missing and extra);
2. `{{placeholder}}` sets per key match `en`;
3. no value whose English source is longer than 3 characters is byte-identical to English.

Exported allowlist `PARITY_IDENTICAL_ALLOWLIST: string[]` at the top of the file — **currently empty**,
because nothing covered needs it. Add full dotted paths with a one-line reason.

Coverage: the 12 program namespaces **plus 18 pre-existing namespaces that already pass every rule**
(`ads, calendar, conflicts, contacts, createEvent, createLeague, eventDetails, faq, favorites, media,
offline, permissions, playerProfile, push, telegram, trainers, userGameNotes, welcome`). The remaining
legacy namespaces still carry historical drift (missing keys, English copies) and are deliberately out
of scope — see §4.

Empty namespaces contribute zero keys, so the test passes trivially today. Verified locally by an
independent script: 212 English keys, 0 diffs across all 10 target locales.

### Routes, places, overlays

| Route | Place | Host | Protected | Offline-gate exception |
|---|---|---|---|---|
| `/welcome` | `welcome` | standalone `OnboardingPage` | yes | no |
| `/clubs/:id` | `club` | `MainPage` | **no** | **yes** |
| `/shop` | `shop` | `MainPage` | yes | no |
| `/series/:id` | `series` | `MainPage` | yes | no |

- `Frontend/src/App.tsx` — four lazy `<Route>`s inside `<Suspense>`; the old
  `<Route path="/welcome" element={<Navigate to="/" replace />} />` stub is gone. New
  `isClubPage` predicate added to the `!isOnline` gate alongside `isGameDetailsPage` /
  `isUserProfilePage`.
- `Frontend/src/utils/urlSchema.ts` — four `Place` members, four `PLACE_DEFS` entries (placed after
  `/user-profile/:id` and before the `/marketplace/*` block, so nothing is shadowed — `/clubs/:id`,
  `/series/:id`, `/shop`, `/welcome` are all disjoint from existing patterns), four `buildUrl` cases,
  and `welcome|clubs|shop|series` added to `APP_PATH_RE` (otherwise `handleBack` / the Capacitor
  popstate fallback would bounce these routes to `/`).
- `Frontend/src/pages/MainPage.tsx` — `case 'club' | 'shop' | 'series'` in `renderContent`.
- Stub pages: `Frontend/src/pages/ClubPage.tsx`, `ShopPage.tsx`, `SeriesPage.tsx`, `OnboardingPage.tsx`.
  Each renders an `EmptyStateCard` "coming soon" body. `OnboardingPage` is standalone (full-screen,
  `SubPageHeader` + `useBackButtonHandler`), the other three are bare content inside the tab shell.

**Overlay widening (PRD 352).** `Overlay['type']` is now `'player' | 'item' | 'pair'` via a new
exported `OverlayType`. `getOverlay` loops a single `OVERLAY_TYPES` list, `parseLocation`'s strip-list
uses the same list, and `addOverlay` / `removeOverlay` take `OverlayType`. The pair sheet itself is
**not** built — PRD 352 owns it (model it on `PlayerCardModalManager.tsx`).

### Deep links

`Frontend/src/deepLinks/catalog.ts`:

- `DEEP_LINK_ACTIONS.shop = { id: 'shop', path: '/shop' }`
- `DEEP_LINK_TEMPLATES.club = { id: 'club', pathTemplate: '/clubs/{id}' }`
- `DEEP_LINK_TEMPLATES.series = { id: 'series', pathTemplate: '/series/{id}' }`
- new helpers `buildClubPath(clubId)` / `buildSeriesPath(seriesId)`, re-exported from
  `Frontend/src/deepLinks/index.ts`
- `deepLinkTemplatePath` / `deepLinkTemplateUrl` second parameter renamed `gameId` → `entityId`
  (templates are no longer game-only). Positional, so no call site changes.

`Frontend/src/hooks/useDeepLink.ts`: `/clubs/:id` and `/series/:id` branches (search preserved),
`/shop` and `/welcome` in `simpleRoutes`, `/welcome` also in `routesWithSearchParams` so PRD 350's
`?step=` survives the hop.

**Native mirrors — required by `catalog.parity.test.ts`, which loops every action and template:**

- `Frontend/ios/App/App/BandejaDeepLink.swift` → `static let shop`, `static func club(_:)`,
  `static func series(_:)`
- `Frontend/android/bandeja-widgets/.../WidgetDeepLinks.kt` → `fun club(id)`, `fun series(id)`

No Android manifest / AASA change needed: both match on host only, with no path filters.

### Shared UI (CONTRACT §7.4)

`Frontend/src/components/ui/StatTile.tsx`, `StatTileRow.tsx`, `CountUpNumber.tsx` — see §2 for exact
signatures. Visual language taken from `LevelHistoryProfileStatsSection.tsx` (rounded
`bg-gray-100 dark:bg-gray-700/50` surface, `border-gray-200/60 dark:border-gray-600/50` hairlines,
`tabular-nums`). **Logical properties only** (`border-s`, `border-t`, `px`/`py`) — no `ml-`/`mr-`/
`pl-`/`pr-`/`border-l`/`border-r` anywhere, so `ar` mirrors correctly. `CountUpNumber` jumps straight
to its value under `usePrefersReducedMotion()`.

**Not added to `Frontend/src/components/index.ts`** — that barrel does not export anything from
`components/ui/` (`Dialog`, `Drawer`, `FullScreenDialog` are all imported by path). Import as
`@/components/ui/StatTile` etc.

### Feature flags (CONTRACT §7.7)

`Frontend/src/config/featureFlags.ts` — `isGameSeriesEnabled`, `isCostSplitEnabled`, `isShopEnabled`,
injectable-default pattern copied from `features/player-level-feedback/player-level-feedback.ts`.
`Frontend/vite.config.ts` `define` block gained `VITE_GAME_SERIES_ENABLED`, `VITE_COST_SPLIT_ENABLED`,
`VITE_SHOP_ENABLED` (each `process.env.X ?? ''`, i.e. on by default).

### Types

- New `Frontend/src/types/gameCardEnrichment.ts` with the enrichment payload shapes, every field
  documented. Re-exported from `Frontend/src/types/index.ts` so agents `import type { … } from '@/types'`.
- `Game` gained the nine CONTRACT §4.1 columns and the six §5.6 enrichment fields.
- `GameParticipant` gained `attendance?: ParticipantAttendance`, `attendanceUpdatedAt`,
  `noShowNotedById`, `noShowNotedAt`.

### Socket plumbing

- `Frontend/src/services/socketService.ts` — six exported payload interfaces + six entries in
  `interface SocketEvents` (kebab-case, `game-${gameId}` room).
- `Frontend/src/store/socketEventsStore.ts` — six `lastX` slots, six handlers, six `socketService.on`
  registrations, six `off` teardowns, six resets in `cleanup()`. Written exactly like
  `handleGameResultsUpdated`.

### Notification preference row (PRD 357)

- `Frontend/src/api/users.ts` → `NotificationPreference.sendWeatherAlerts: boolean`.
- `Frontend/src/components/NotificationSettingsModal.tsx` → `'sendWeatherAlerts'` in `TOGGLE_KEYS`
  immediately after `'sendReminders'`, a `SWITCH_LABELS` entry, `?? true` normalisation in both the
  hydrate effect and `resetToInitialValues` (same as `sendTeamNotifications`, so the row reads "on"
  before the backend column ships), and the field in the save payload.
- Copy in `profile.json` for all 11 locales.

### Extension points

- `Frontend/src/components/referral/ReferralWelcomeBanner.tsx` — renders `null`. Filled by PRD 351,
  rendered by PRD 350's Welcome step.
- `Frontend/src/components/pairs/ChemistryChip.tsx` — renders `null`. Filled by PRD 352, rendered by
  PRD 353's recap partner slide.

Both declare their props interface and take `_props` (matching `argsIgnorePattern: '^_'`), so the call
sites are stable today and neither pair of agents has to edit the other's file.

---

## 2. Exact signatures — 12 agents code against these

### Shared UI

```tsx
// @/components/ui/StatTile
export type StatTileTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
export interface StatTileProps {
  label: string;
  value: React.ReactNode;     // plain text or a <CountUpNumber />
  hint?: string;
  icon?: LucideIcon;          // rendered aria-hidden
  tone?: StatTileTone;        // default 'neutral'
  className?: string;
}
export const StatTile: (props: StatTileProps) => JSX.Element;

// @/components/ui/StatTileRow
export interface StatTileRowProps { children: React.ReactNode; className?: string }
export const StatTileRow: (props: StatTileRowProps) => JSX.Element | null;
// 2–4 tiles. 1→1 col, 2→2, 3→3, 4→2 cols below `sm` and 4 above.
// Extra children past the fourth are dropped. No children → renders null.

// @/components/ui/CountUpNumber
export const COUNT_UP_MAX_DURATION_MS = 600;
export interface CountUpNumberProps {
  value: number;
  durationMs?: number;           // default 600, clamped to <= 600
  decimals?: number;             // default 0
  format?: (n: number) => string; // default Intl.NumberFormat(i18n.language, { min/maxFractionDigits: decimals })
  className?: string;            // merged after a built-in `tabular-nums`
}
export const CountUpNumber: (props: CountUpNumberProps) => JSX.Element;
// reduced motion => jumps to `value`; a mid-flight `value` change re-targets from
// what is on screen; the pending rAF is cancelled on unmount and on every re-target.
```

### Feature flags

```ts
// @/config/featureFlags
export function isGameSeriesEnabled(rawValue?: unknown): boolean; // default import.meta.env.VITE_GAME_SERIES_ENABLED
export function isCostSplitEnabled(rawValue?: unknown): boolean;  // default import.meta.env.VITE_COST_SPLIT_ENABLED
export function isShopEnabled(rawValue?: unknown): boolean;       // default import.meta.env.VITE_SHOP_ENABLED
// true unless the trimmed lowercase string is '0' | 'false' | 'off'.
```

### Enrichment payloads (`@/types`, source `@/types/gameCardEnrichment`)

```ts
export type ParticipantAttendance = 'UNANSWERED' | 'CONFIRMED' | 'UNSURE';
export interface AttendanceSummaryEntry { userId: string; attendance: ParticipantAttendance }
export interface AttendanceSummary {                       // PRD 346
  confirmedCount: number;
  unsureCount: number;
  unansweredCount: number;
  playingCount: number;                                    // denominator of "3/4"
  viewerAttendance: ParticipantAttendance | null;          // null when viewer is not PLAYING
  entries?: AttendanceSummaryEntry[];                      // roster-ordered dots
}

export type SpotOpenedCause = 'LEAVE' | 'KICK' | 'INVITE_DECLINED' | 'SUBSTITUTION' | 'CAPACITY_INCREASE';
export interface SpotOpenedInfo {                          // PRD 347 (socket + queue panel)
  freedCount: number;
  cause: SpotOpenedCause;
  lastSeatOpenedAt: string;                                // ISO
}

export interface PerHeadPrice {                            // PRD 348
  amountCents: number;                                     // one player's share, minor units
  currency: PriceCurrency;                                 // the game's own currency, never converted
  totalCents: number;
  payerCount: number;                                      // PLAYING count the total was split by
  estimated: boolean;                                      // false once Game.costFrozenAt is set
}

export type GameSeriesCadence = 'WEEKLY' | 'BIWEEKLY';
export interface SeriesCardLabel {                         // PRD 345
  seriesId: string;
  name: string;
  cadence: GameSeriesCadence;
  weekday: number;                                         // ISO-8601: 1 = Monday … 7 = Sunday
  startTimeLocal: string;                                  // 'HH:mm', club-local
  occurrenceNumber?: number;                               // 1-based ("12th week")
  endedAt?: string | null;                                 // set once series status is ENDED
}

export interface LiveGameSummarySide {                     // PRD 349
  teamNumber: number;                                      // 1 or 2, matches GameTeam.teamNumber
  players: BasicUser[];
  setScores: number[];                                     // completed sets, oldest first, index-aligned
  currentGameScore: string;                                // '40', 'AD', '6' — sport-rendered
  leading: boolean;                                        // drives the leading-side glow
}
export interface LiveGameSummary {
  matchId: string;
  courtName?: string | null;
  currentSet: number;                                      // 1-based
  sides: [LiveGameSummarySide, LiveGameSummarySide];       // exactly two, side 1 first
  startedAt?: string | null;                               // ISO — "Started 23 min ago"
  revision?: number;                                       // monotonic; drop older socket frames
}

export type WeatherRiskSeverity = 'none' | 'likely' | 'heavy' | 'storm';
export interface WeatherRisk {                             // PRD 357
  severity: WeatherRiskSeverity;
  pop: number;                                             // 0–100 at `at`
  windKph: number;
  at: string;                                              // ISO, normally the game start
  keptAsPlanned?: boolean;                                 // pill turns neutral grey
}
```

`Game` fields (all optional, all nullable — enrichment fans out with `.catch(() => null)`):

```ts
seriesId?: string | null;  seriesOccurrenceDate?: string | null;   // 'YYYY-MM-DD'
autoFillFromQueue?: boolean;  showOnLiveRail?: boolean;
lastSeatOpenedAt?: string | null;
costPayerId?: string | null;  paymentHint?: string | null;  costFrozenAt?: string | null;
weatherAlertState?: unknown;                                        // raw scheduler bookkeeping
spotOpenedAt?: string | null;
liveSummary?: LiveGameSummary | null;
weatherRisk?: WeatherRisk | null;
perHeadPrice?: PerHeadPrice | null;
seriesLabel?: SeriesCardLabel | null;
attendanceSummary?: AttendanceSummary | null;
```

### Socket event payloads (`@/services/socketService`)

```ts
export interface GameAttendanceUpdatedPayload {            // 'game-attendance-updated'  PRD 346
  gameId: string; userId: string; attendance: ParticipantAttendance;
  confirmedCount: number; playingCount: number;
}
export interface GameSeatOpenedPayload {                   // 'game-seat-opened'  PRD 347
  gameId: string; freedCount: number; cause: SpotOpenedCause; lastSeatOpenedAt: string;
}
export interface GameSeatFilledPayload {                   // 'game-seat-filled'  PRD 347
  gameId: string; userId: string;
}
export interface GameCostUpdatedPayload {                  // 'game-cost-updated'  PRD 348
  gameId: string;
}
export interface GameSeriesConfirmationsUpdatedPayload {   // 'game-series-confirmations-updated'  PRD 345
  seriesId: string; gameId: string; confirmedCount: number; regularCount: number;
}
export interface GameWeatherAlertUpdatedPayload {          // 'game-weather-alert-updated'  PRD 357
  gameId: string; severity: WeatherRiskSeverity;
}
```

Store slots on `useSocketEventsStore`: `lastGameAttendanceUpdated`, `lastGameSeatOpened`,
`lastGameSeatFilled`, `lastGameCostUpdated`, `lastGameSeriesConfirmationsUpdated`,
`lastGameWeatherAlertUpdated`. Subscribe with `retainGameRoom` / `releaseGameRoom` from
`@/services/gameRoomMembership` (pattern: `GameDetailsShell.tsx:395-479`).

---

## 3. Hand-edited generated artifacts — please verify

`Frontend/src/deepLinks/catalog.mirror.json` is normally produced by
`npm run sync:deep-link-catalog` (`JSON.stringify(serializeDeepLinkCatalogMirror(), null, 2) + '\n'`).
I was not allowed to run it, so I hand-edited it to add:

- `actions.shop = { path: '/shop', url: 'https://bandeja.me/shop' }` (last key, after `invites`)
- `templates.club = { pathTemplate: '/clubs/{id}', urlTemplate: 'https://bandeja.me/clubs/{id}' }`
- `templates.series = { pathTemplate: '/series/{id}', urlTemplate: 'https://bandeja.me/series/{id}' }`
  (both after `gameLive`)

**Orchestrator: run `npm run sync:deep-link-catalog` and confirm the file is unchanged**, then run
`npm run test:deep-link-catalog`.

---

## 4. Contract deltas / decisions

1. **`SpotOpenedInfo` vs a bare timestamp.** CONTRACT §5.6 fixes `spotOpenedAt?: string | null` on the
   card, so that is what `Game` carries. `SpotOpenedInfo` is still declared and exported — it types the
   `game-seat-opened` socket payload and the queue panel. So there are 5 card-enrichment interfaces +
   `SpotOpenedInfo`, not 6 card interfaces.
2. **`ParticipantAttendance` lives in `types/gameCardEnrichment.ts`.** The task asked for the literal
   union inline on `GameParticipant`; a named alias re-exported from `@/types` is equivalent and keeps
   the enum in one place (the socket payload and `AttendanceSummary` use it too).
3. **"Coming soon" copy went into `common.json`, not the four new namespaces.** The stub bodies need
   user-facing copy and the 12 namespaces belong to the feature agents; putting a placeholder key in
   each would have forced 4 agents to delete keys they did not write. `common.*` is also not covered by
   the parity test, so it does not constrain them.
4. **`components/ui/*` is not in the `components/index.ts` barrel** (checked: `Dialog`, `Drawer`,
   `FullScreenDialog` are not either), so `StatTile` / `StatTileRow` / `CountUpNumber` are not exported
   from it.
5. **`APP_PATH_RE` widened.** Not called out in the contract, but `isAppPath` drives `handleBack` and
   the Capacitor popstate fallback; without it every new route would bounce to `/` on back.
6. **`/welcome` is not in the deep-link catalog.** It is handled in `useDeepLink`'s `simpleRoutes`
   (with search params preserved for `?step=`) but has no `DEEP_LINK_ACTIONS` entry, because a catalog
   entry would obligate an iOS `static let welcome` + the assistant-registry surface, which PRD 350 did
   not ask for. Say the word and it is a three-line change.
7. **`Frontend/src/config/multisportFlags.ts`** is a dead stub (`isSportCreatable` just re-checks
   `ALL_SPORTS.includes`) and the three `VITE_MULTISPORT_*` defines in `vite.config.ts` are read
   nowhere in `Frontend/src`. Left alone as instructed — out of scope, worth a cleanup task.

---

## 5. Pre-existing problems found, not fixed

1. **`es/index.ts` and `sr/index.ts` never import or spread `calendar.json`** — the file exists in both
   locales, so Spanish and Serbian silently fall back to English calendar copy. Two-line fix per file;
   I left it because it is a behaviour change outside my brief. The parity test covers `calendar.json`
   content, not its registration.
2. **The remaining ~35 legacy i18n namespaces are not parity-clean.** Sampled failures: `ru` is missing
   keys in `createGame` (10), `gameFormat` (21), `games` (9), `errors` (6), `club` (6); `common`,
   `sportRating`, `trophies`, `invites`, `auth`, `app` carry English copies in `ru`; `es`/`sr`/`id`
   carry English copies in `nav`, `bottomTab`, `chats`, `rating`, `wallet`, `teams`,
   `gameSubscriptions`, `browseCity`, `healthWorkout`. Each is a small standalone cleanup that would
   then move into `LEGACY_CLEAN_NAMESPACES` in `localeParity.test.ts`.
3. `NotificationPreference.sendWeatherAlerts` is typed non-optional to match its nine siblings. Until
   Wave 1's Prisma column ships and the backend projects it, the value arrives `undefined` at runtime —
   normalised to `true` in the modal, exactly like `sendTeamNotifications` already is.

---

## 6. Files the orchestrator may need to touch

Nothing blocking. For completeness, these are outside my ownership and were **not** edited:
`Frontend/package.json` (test script wiring, below), `.github/workflows/ci.yml`, anything under
`Backend/`.

Backend counterparts the feature/backend agents still owe, to match what I declared here:

- `availableGamesCard.projection.ts` → the §5.6 scalars.
- `availableGamesEnrichment.ts` → `AvailableGameEnrichFields` widened to the six fields, with payloads
  matching §2 above **exactly**.
- `NotificationPreference.sendWeatherAlerts` column + `DEFAULT_PREFERENCES` entry +
  `PreferenceKey.SEND_WEATHER_ALERTS`.
- Six `socket.service.ts` emitters, kebab-case, room `game-${gameId}`.

---

## 7. Test files added

```
Frontend/src/i18n/localeParity.test.ts
Frontend/src/components/ui/StatTile.test.tsx
Frontend/src/components/ui/StatTileRow.test.tsx
Frontend/src/components/ui/CountUpNumber.test.tsx      (@vitest-environment jsdom)
Frontend/src/config/featureFlags.test.ts
```

Suggested npm script (orchestrator owns `package.json`):

```json
"test:prd-345-357-scaffold": "../scripts/run-heavy vitest run src/i18n/localeParity.test.ts src/components/ui/StatTile.test.tsx src/components/ui/StatTileRow.test.tsx src/components/ui/CountUpNumber.test.tsx src/config/featureFlags.test.ts"
```

`localeParity.test.ts` resolves paths from `process.cwd()`, i.e. it must run with `Frontend/` as cwd —
the same assumption `src/deepLinks/catalog.parity.test.ts` already makes.

Existing suites that this change touches and that should be re-run:
`npm run test:deep-link-catalog` (catalog + mirror + native parity).

---

## 8. Manual verification needed

- `CountUpNumber.test.tsx` stubs `requestAnimationFrame` / `cancelAnimationFrame` / `performance.now`
  globally. If React 19's DOM renderer ever schedules its own frame in jsdom, the exact `frames.size`
  assertions would need relaxing. Flagging it because I could not run Vitest.
- RTL (`ar`): `StatTileRow`'s dividers are logical (`border-s` / `border-t`) and `StatTile` uses no
  directional utilities, but the four-tile 2×2 wrap should be eyeballed once on a narrow `ar` viewport.
- Native deep links `https://bandeja.me/clubs/<id>`, `/series/<id>`, `/shop` on a device (host-level
  AASA / intent filter, so they should already resolve — only the in-app routing is new).
- `/clubs/:id` while offline: it is now exempt from the offline gate, so PRD 354 must make sure the page
  degrades without a network call rather than spinning forever.
