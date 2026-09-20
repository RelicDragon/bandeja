# Critic: PRD conformance 345–350

Adversarial read of the working tree on `feat/prd-345-357`. Nothing was run (no
tsc, no tests, no lint) — every finding is substantiated by reading the code and
by tracing every producer/consumer pair.

Overall: this is a substantially real implementation, not a stub farm. Every
component in the six PRDs' new directories has a live import chain into a
mounted route or a rendered page; every new socket event is both emitted and
consumed; every new `NotificationType` is mapped; i18n key parity holds across
all 11 locales for `series`, `attendance`, `spots`, `cost`, `live`,
`onboarding`, and all six namespaces are registered in all 11 `index.ts` files.
The defects below are specific, not structural.

## Verdict per PRD

| PRD | Verdict | One-line reason |
|---|---|---|
| 345 Recurring game series | GAPS | Feature works end to end, but `GET /games/:id/series-next` and `GET /series/:id` have **no access check at all** — any authenticated user who knows a game id can read a private series' full regulars roster. |
| 346 Attendance / no-show | GAPS | Backend, in-app and Telegram paths are complete and correct; the two push-shade action handlers (Android + iOS) and the Watch button are absent, so User Story 1 ("answer without opening the app") only works on Telegram. Documented by the builder. |
| 347 Spot-opened / auto-fill | COMPLETE | All five triggers wired, dedupe persisted, gates enforced, pill + sort + queue panel + `?join=1` all reachable. Only the explicit "Join now" shade button is missing (tapping the push body does carry `?join=1`). |
| 348 Cost split | GAPS | Ledger, permissions, wallet, reminders and deep links are real; the coin-settle path has a non-idempotent window, and the automatic reminder's "FINAL + 24 h" clock is really "freeze-sweep + 24 h". |
| 349 Live now rail | COMPLETE | Query, privacy gate, spectator token, rail, details block, broadcast strip, follower push with persisted dedupe — all present and wired. One ref-count hygiene bug in the rail's socket lifecycle. |
| 350 Guided first-run onboarding | GAPS | The closing "I want to play soon" choice is a **dead end**: it navigates to `/?playIntentOpen=1` and nothing in the app opens the play-intent sheet from that param. |

---

## Findings

### [MAJOR] PRD 350 — "I want to play soon" is a dead end; `?playIntentOpen=1` has no consumer

- **Where:** `Frontend/src/components/onboarding/NotificationsStep.tsx:9` and `:102`; consumer side `Frontend/src/components/playIntent/PlayIntentFindBar.tsx:289-345`
- **Defect:** The final onboarding choice routes to `/?playIntentOpen=1`, but `PlayIntentProvider` only ever *writes* and *clears* that param — there is no effect anywhere in `Frontend/src` that reads `playIntentOpen` and opens the sheet, so the destination silently does nothing.
- **Failure scenario:** Register a new account → complete `/welcome` → on step 6 tap **I want to play soon**. `flow.finish('/?playIntentOpen=1')` runs, the "You're set" overlay plays, `navigate('/?playIntentOpen=1')` lands on the My tab, and the play-intent compose sheet never opens. The user sees plain Home with a stray query string in the URL. (`?lobby=1` and `?proposal=` *are* consumed at `PlayIntentFindBar.tsx:245` and `:166`; `playIntentOpen` is read only at `:322` and `:335`, both of which are close-path guards.)
- **PRD requirement:** PRD 350 User Story 6 — "a final step offering 'I want to play soon' (play intent) or 'Browse games', so that I take a real action"; Implementation Decisions — "First action: play intent uses `PlayIntentProvider` with `?playIntentOpen=1` on Home". CONTRACT §7.5 lists `?playIntentOpen=1` on `/` as a param this programme owns and must "handle … in the page that owns them".
- **Note for the fix:** `Frontend/src/components/recap/RecapStoryViewer.tsx:165` (PRD 353) navigates to the same dead URL, so one consumer effect in `PlayIntentFindBar` closes both.

### [MAJOR] PRD 345 — `GET /games/:id/series-next` and `GET /series/:id` have no access check

- **Where:** `Backend/src/routes/gameSeries.routes.ts:48` (`router.get('/:id/series-next', authenticate, getSeriesNextOccurrence)`), `Backend/src/controllers/series.controller.ts:73-76`, `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts:420-520`; and `Backend/src/routes/series.routes.ts:56` (`router.get('/:id', getSeriesDetail)`), `Backend/src/services/gameSeries/gameSeries.service.ts:579-820`.
- **Defect:** Neither endpoint applies `canAccessGame` / any owner-or-participant predicate; `getSeriesContext` and `getSeriesDetail` both take a `viewerId` purely for *projection* (`viewerIsOwner`, `viewerIsPlaying`) and never for authorisation. The sibling route `Backend/src/routes/gameAttendance.routes.ts:87` does use `canAccessGame`, so the omission is clearly unintentional.
- **Failure scenario:** User A runs a private weekly series. User B was once invited, has the link `/games/<occurrenceId>`, and has since been removed. B calls `GET /api/games/<occurrenceId>/series-next` with their own token and receives `{ label: { seriesId, name, cadence, weekday, startTimeLocal, occurrenceNumber }, settings, next: { seriesName, nextStartTime, nextClubName, seatDeadlineAt, confirmedCount, regularCount, regulars: [{ userId, firstName, lastName, avatar, confirmed }] } }` — the full private roster with confirmation state. B then calls `GET /api/series/<seriesId>` and receives the owner's full public-user projection, every regular's full user projection with sport profiles, and a Find-card payload for **every** past and future occurrence.
- **PRD requirement:** CONTRACT §13 "Backend: permission checks on every mutating endpoint; no endpoint leaks private data to guests." PRD 345 scopes the organizer strip to "owner/admin" and the series page to participants.
- **Secondary (same file, MINOR):** `GameSeriesService.ensureSeriesChat` (`gameSeries.service.ts:1183-1195`) only calls `assertSeriesOwner` on the **creation** branch. Once `series.groupChannelId` exists, `POST /api/series/:id/chat` returns the private `groupChannelId` to any authenticated caller and triggers a `syncSeriesChatMembers` write on that channel.

### [MAJOR] PRD 346 — the 24 h / 2 h reminder has no answerable action on either native platform

- **Where:** `Backend/src/services/push/notifications/game-reminder-push.notification.ts:70-93` sets `confirmActionTitle` / `unsureActionTitle` / `attendanceActionToken` / `nativeHandler = 'attendance_actions'`, but `Frontend/android/app/src/main/java/.../ChatReplyMessagingService.java` branches only on `invite_actions` / `play_intent_actions`, and `Frontend/ios/App` registers no `UNNotificationCategory` anywhere.
- **Defect:** The push payload carries everything a shade action needs, and nothing on either client consumes it, so the two buttons never render.
- **Failure scenario:** A PLAYING participant with push enabled and no Telegram link receives "Tomorrow 19:00 · Padel Centar. Are you coming?" 24 h before the game. There are no **I'm coming** / **Not sure yet** buttons on the notification; tapping it opens the game. Because the 2 h reminder filters on `attendance === 'UNANSWERED'` (`Backend/src/services/gameStatusScheduler.service.ts:296-299`), the same user is then pushed a second time — exactly the "asked twice" case the filter exists to prevent, for a reason the user cannot act on.
- **PRD requirement:** PRD 346 User Story 1 — "I want the 24h reminder to offer 'I'm coming' and 'Not sure yet', so that I answer without opening the app"; UX — "Both are one-tap shade actions; neither opens the app."
- **Status:** documented honestly by the builder (report §4.1 and §4.2). Filed because it is a user-visible gap against a User Story, not because it was hidden.

### [MAJOR] PRD 348 — coin settle is not idempotent past the transfer

- **Where:** `Backend/src/services/gameCost/gameCost.service.ts:631-653`
- **Defect:** `TransactionService.createTransaction` runs first and the `gameCostShare.update` that records `transactionId` / `method: 'COINS'` runs second, outside any transaction. The in-code comment claims "the share is left exactly as it was, so a retry cannot pay twice" — that reasoning only covers a failure *in* the transfer, not a failure *after* it.
- **Failure scenario:** Participant taps **Send 10 coins**. The `TRANSFER` commits (10 coins leave their wallet, arrive in the payer's). The following `prisma.gameCostShare.update` fails (connection drop, pool timeout) and the request 500s. The client shows an error; the share still reads **Unpaid**. The user taps **Send 10 coins** again: `planCoinSettlement` is called with `alreadySettled: share.confirmedAt != null || share.transactionId != null` — both still null — so it approves, and a second 10-coin transfer runs. The payer is paid twice and the participant is charged twice, with no record linking either transfer to the share.
- **PRD requirement:** PRD 348 Testing Decisions — "coin settle path … never double-marks"; Implementation Decisions — "on success writes `method=COINS`, both timestamps, `transactionId`."

### [MINOR] PRD 348 — the automatic settle reminder is not "FINAL + 24 h"

- **Where:** `Backend/src/services/gameCost/costShareReminder.service.ts:196-227` together with `gameCost.service.ts:172-176` (`shouldFreezeNow`)
- **Defect:** `Game.costFrozenAt` is written by whichever sweep first observes `resultsStatus === 'FINAL'`, not at the FINAL transition, and the reminder is scheduled off `costFrozenAt`. Nothing calls `syncGameCostShares` on the FINAL transition itself (`GameReadinessService.updateGameReadiness` is the only hook, and it fires on roster changes).
- **Failure scenario:** A game goes FINAL at 20:05. The hourly `CostShareReminderScheduler` first sees it at 21:00 and writes `costFrozenAt = 21:00`. The auto reminder therefore fires at ~21:00 the next day, not ~20:05. Worse: a game that goes FINAL and whose `updatedAt` then falls outside the 7-day `AUTO_REMIND_MAX_AGE_MS` window before a sweep runs (long outage, or a backlog larger than `AUTO_REMIND_BATCH_SIZE = 50` in a busy hour) is never frozen and never reminded at all.
- **PRD requirement:** PRD 348 Implementation Decisions — "automatic once at FINAL+24 h"; UX — "At FINAL the card freezes shares".

### [MINOR] PRD 349 — `useLiveGames` releases game rooms it never retained

- **Where:** `Frontend/src/features/live/useLiveGames.ts:86-107`
- **Defect:** The retain loop is asynchronous and aborts on the `released` flag, but the cleanup unconditionally calls `releaseGameRoom(id)` for **every** id in `visibleIdsKey`. `releaseGameRoom` (`Frontend/src/services/gameRoomMembership.ts:64-73`) treats `current <= 1` — including `0` — as "last holder": it deletes the entry, bumps `joinEpoch` and calls `socketService.leaveGameRoom(gameId)`.
- **Failure scenario:** The rail is showing games `[A, B, C]`; the retain loop is awaiting `joinGameRoom(A)` when the 60 s `refetchInterval` returns a different id list. The effect cleanup runs and calls `releaseGameRoom(B)` although B was never retained by this hook. If any other mounted surface holds B at ref-count 1 (a second `LiveNowRailContainer` instance — one is mounted in `pages/MyTab.tsx:580` and another in `components/home/AvailableGamesSection.tsx` — or `GameDetailsShell`), B's count drops to 0, the socket leaves `game-B`, and that surface stops receiving `match-live-scoring-updated` / `game-updated` until the next poll or reconnect. The `joinEpoch` bump additionally makes any *in-flight* `retainGameRoom(B)` leave the room immediately after joining (`gameRoomMembership.ts:59-61`).
- **PRD requirement:** PRD 349 Testing Decisions — "Socket subscription lifecycle test (subscribe on mount, unsubscribe on unmount…)"; the existing test `useLiveGames.test.tsx` does not cover an interrupted retain loop.

### [MINOR] PRD 347 — the spot-opened push has no "Join now" action button

- **Where:** `Backend/src/services/push/notifications/spot-opened-push.notification.ts:69-81`
- **Defect:** The payload has no `actions` array and no `nativeHandler`, so the notification renders without the named action. (Tapping the notification body *is* correct — `Frontend/src/services/pushNotificationService.ts:638` calls `navigateToGameForJoin`, which appends `?join=1`.)
- **Failure scenario:** A queued player receives "A spot just opened … You're #1 in the queue." The shade shows no **Join now** button; they must tap the body. Functionally equivalent, visually not what the PRD specifies.
- **PRD requirement:** PRD 347 UX — "Action **Join now** deep-links to the game with `?join=1`". The Telegram mirror does implement it (`Backend/src/services/telegram/notifications/play-intent.notification.ts:74-86`).

### [MINOR] PRD 346 — own no-show notes are hidden below the 5-game threshold

- **Where:** `Frontend/src/features/attendance/AttendanceStatisticsSection.tsx:63-64`
- **Defect:** `if (!shouldShowAttendanceRate(stats)) return null;` gates the **entire** section — the tile, the sparkline *and* the "your no-show notes" list with its chat links — on the ≥5 sample threshold that the PRD attaches only to the percentage.
- **Failure scenario:** A player with 2 confirmed games and 1 no-show note (sample size 3) opens Profile → Statistics. Their no-show note is invisible, so the "if that's wrong, reply in the game chat" affordance the note's push promises has no in-app counterpart until they reach 5 recorded games.
- **PRD requirement:** PRD 346 UX — "**Profile → Statistics**: the same tile plus a 12-month sparkline; own no-show notes listed with links to the chat (own profile only)"; the threshold is specified only for the tile ("Hidden until 5 recorded games").

### [MINOR] PRD 345 — the owner-cap helper's "link to Profile" is never rendered

- **Where:** `Frontend/src/features/game-series/SeriesRepeatRow.tsx:176-189` (`{onManageSeries && (<button …>)}`), and the call site `Frontend/src/pages/CreateGame.tsx:1286-1295`, which does not pass `onManageSeries`.
- **Defect:** The cap branch renders the helper text but the escape hatch is behind a prop the only call site omits, so the branch is dead.
- **Failure scenario:** An organizer with 10 ACTIVE series opens Create game. **Weekly** and **Every 2 weeks** are correctly disabled and "You have 10 active series." is shown, with no way to get to the list to end one.
- **PRD requirement:** PRD 345 States and edge cases — "Owner cap reached: … a helper 'You have 10 active series. End one to add another.' **and a link to Profile**." (The builder's own report §4.7 notes the Profile → "Your regular games" entry point was not built, which is the destination this link needs.)

### [MINOR] PRD 345 — the organizer strip is owner-only, not owner/admin

- **Where:** `Frontend/src/features/game-series/SeriesGameSection.tsx:72` (`{viewerIsOwner && next && …}`), where `viewerIsOwner` is `series.ownerId === viewerId` (`Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts:449`).
- **Defect:** A game ADMIN (or a platform admin) on a series occurrence never sees "Next: … · 3 of 4 regulars confirmed", **Skip next** or **Edit series**, even though `assertSeriesOwner` accepts `isAdmin` on the backend.
- **Failure scenario:** A club co-organizer with `ParticipantRole.ADMIN` on every occurrence opens the finished occurrence's details and has no series controls at all; only the series creator can skip next week.
- **PRD requirement:** PRD 345 Occurrence details — "**Organizer strip** (owner/admin, only when a next occurrence exists)".

### [MINOR] PRD 345 — converting a game with a different weekday leaves occurrence #1 off the cadence phase

- **Where:** `Backend/src/services/gameSeries/gameSeries.service.ts:451-455` and `:504-510`
- **Defect:** When `input.weekday` differs from the seed game's weekday, `anchorDayKey` is moved to the chosen weekday, but the seeding game is still stamped `seriesOccurrenceDate = seedDayKey`. The generator then lists occurrences from `anchorDayKey`, so the seed game is not on the series' own date grid.
- **Failure scenario:** Organizer converts a Thursday game into a series and picks Tuesday in the Repeat sheet. The Thursday game keeps `seriesOccurrenceDate = <that Thursday>`, and the generator creates a **second** game on the preceding/following Tuesday of the same week — two occurrences in one week, and the series page's "week N" numbering is off by one from then on. (Unreachable from the current create-game UI, which never sends `weekday`; reachable via `PATCH /series/:id` / a direct API call.)
- **PRD requirement:** PRD 345 User Story 16 — "occurrence generation to be idempotent per (seriesId, occurrenceDate)"; Repeat sheet — "weekday chips (pre-selected from the date, **editable** for biweekly offsets)".

---

## What I verified as genuinely working

Not exhaustive, but these were traced end to end rather than skimmed:

- **Wiring.** Every new FE component in `features/{game-series,attendance,spot-opened,cost,live}`, `components/{live,onboarding,GameDetails/cost}` has a real import chain to a mounted page (`GameDetailsShell`, `MainPage`, `MyTab`, `AvailableGamesSection`, `CreateGame`, `GameSettings`, `EditGameInfoModal`, `GameCardHeaderTags`, `GameCardRightRail`, `GameCardInfoRows`, `LevelHistoryView`, `WalletModal`, `GameBroadcastMatchPage`, `App.tsx`). No orphan components found.
- **Socket round trips.** All six new kebab-case events are emitted from `socket.service.ts` via `socketEmitFacade`, typed in `Frontend/src/services/socketService.ts`, stored in `socketEventsStore.ts`, and *read* by a consumer (`useGameAttendance`, `useSeries`, `useSpotOpenedRealtime`, `GameCostCard`, `WeatherRiskBanner`). No emit-without-consumer or consumer-without-emit. `useSeriesConfirmationsLive` correctly joins the **next** occurrence's room, which is the room the emit targets.
- **Registries.** `registerPushActionHandler` (`series`, `attendance`, `weather`) and `registerAvailableGamesEnricher` (`seriesLabel`, `attendanceSummary`, `spotOpenedAt`, `perHeadPrice`, `liveSummary`, `weatherRisk`) all register at import time on modules reachable from `routes/index.ts`. `pushInviteAction.controller.ts` dispatches through the registry with a 400 (not a 500) for an unregistered kind.
- **Schedulers.** `GameSeriesScheduler` and `CostShareReminderScheduler` are instantiated and `start()`ed in `server.ts:118-122`.
- **Feature flags.** `config.gameSeriesEnabled` / `costSplitEnabled` are checked in the routers *and* in every service entry point *and* in the FE (`isGameSeriesEnabled()` gates queries so no request goes out). `enrichPerHeadPrice` re-checks the flag even though its registration is unconditional.
- **i18n.** All six namespaces exist in all 11 locales, key sets are plural-family-identical to `en`, all are spread in all 11 `locales/<code>/index.ts`, and every `t('<ns>.…')` key used by the new components resolves. No hard-coded user-facing English in the new components (checked JSX text nodes and `aria-label`/`title`/`placeholder`).
- **PRD 346 invariants.** `setAttendance` only writes `attendance`/`attendanceUpdatedAt`; `assertAttendanceUpdateIsSafe` + `ATTENDANCE_FORBIDDEN_FIELDS` guard it; counters are *recomputed* (`refreshAttendanceCounters`) rather than incremented, so re-finalisation cannot double-count; the 2 h reminder filter and `onlyUserIds` plumbing through `notification.service.ts:601` → `game-reminder.notification.ts:68` is correct; the 7-day no-show window requires the game to have ended; the nudge cooldown is read from the last system message (restart-safe).
- **PRD 347.** All five triggers call `GameSeatService.seatOpened` (`participant.service.ts:256,517`, `admin.service.ts:225`, `update.service.ts:1097`, `participantSubstitution.service.ts:151`, plus `invite.service.ts:648`); `runSeatOpened` re-derives open seats and respects `canMutateGameRoster`; auto-fill orders by `joinedAt` and pre-checks level+gender (`skipLevelCheck` deliberately off) with a next-candidate fallback; private games notify queue members only; `SpotOpenedDelivery` is a real persisted claim with release-on-transient-failure; the FE pill window, day-group partition (`sortDayGroupGames`, used by both `utils/groupGamesByDate.ts` and `UpcomingGamesList.tsx`) and queue-position ordering match the backend's `createdAt = joinedAt` mapping.
- **PRD 348.** Permission matrix (`costSharePermissions.ts`) is complete and enforced; `getOwedSummary`'s `costPayerId: { not: userId }` is safe because `syncGameCostShares` persists the implicit payer before any read; coin-settled shares are pinned during recompute; substitution moves the row; `GET /transactions/owed` is mounted and consumed by `WalletModal` → `WalletOwedSections`; `?section=cost` / `?settle=1` are consumed and cleaned out of the URL; both cost sheets honour the keyboard contract (`DrawerContent` + `OverlayKeyboardBody` + `var(--overlay-bottom-inset)` + `useBackButtonModal`); `paymentHint` round-trips create → edit → settle sheet.
- **PRD 349.** `LIVE_RAIL_WHERE` is the single privacy definition and is reused by the rail query, the per-id enricher, the spectator-token mint and the follower fan-out; `findLiveRailGame` returns the same 404 for private/finished/opted-out; the Home gate is city-timezone-aware; `showOnLiveRail` and `autoFillFromQueue` are both in `GAME_UNCHECKED_SCALAR_KEYS`, so the `GameSettings` toggles actually persist; `LiveGameNotifyDelivery` dedupe is a real unique row; `/live` is registered in `bot.service.ts:54` and the callback regex now includes `uti|sip|at|sr|wx|pi`.
- **PRD 350.** `/welcome` is a real protected route in `App.tsx:631` and is exempted from the offline gate (`App.tsx:513`); the gate is a pure, unit-tested function that fails *open* on an unknown status; `sportsEnabled` is a Prisma `Sport[]`, so `needsSportStep` is computed correctly and the `@default([PADEL])` means existing accounts are not swept into the sport-only flow; `completeOnboarding` is idempotent; `GET /users/suggested` excludes blocks in both directions, the viewer and already-followed users, and ranks on FINISHED games in a 60-day window; `GET /cities/:id/stats` is mounted; the deep link the gate intercepted is handed back via `rememberPostOnboardingPath` / `consumePostOnboardingPath`.

## What I could not verify

- Anything requiring a running app, device or simulator: actual push delivery, APNs/FCM shade rendering, Telegram button round-trips, RTL rendering for `ar`, the four themes, reduced-motion behaviour, 44 px tap targets in situ.
- Type correctness. I could not run `tsc`; several `as unknown as` casts across Prisma `select` results and hand-written row types (`gameCost.service.ts` `loadGame`/`syncGameCostShares`, `liveGames.service.ts` `Prisma.GameGetPayload` inference, `spotOpenedNotify.service.ts` `toGameInfo`) are the likeliest places a compile error hides. Every builder report flags the same.
- Whether both `LiveNowRailContainer` instances (`MyTab` and `AvailableGamesSection`) can be mounted simultaneously under `TabContentStack`. That determines whether the ref-count finding above is reachable in practice or only during a rail refetch race; the code defect itself is unambiguous either way.
- Database behaviour: no integration test in scope was executed, so the `P2002` rollback path in `GameSeriesGenerationService.stampOccurrenceOrRollback`, the `syncGameCostShares` create/update/delete diff and the freeze write are read-verified only. Both builders list this as their largest gap.
- The Admin "Platform Settings" row for `COINS_PER_CURRENCY_UNIT` (PRD 348 depends on it; the admin surface belongs to PRD 351's file ownership and was out of my scope).
