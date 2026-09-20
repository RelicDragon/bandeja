# Critic: fix verification

## Verdict

**Not shippable yet, but much closer than before.** Every BLOCKER that had an owner was
genuinely closed, and closed properly rather than papered over: the series authorization
chain is now fail-closed at all four links, the two coin paths are claim-then-spend with
conditional writes that hold at READ COMMITTED, the refund is per-ownership-instance, the
enrichment contract survives wire → merge → memo → render with a *real* compile-time
exhaustiveness guard on both ends, and the Arabic plural BLOCKER is fixed across all 30
namespaces the parity test covers (I re-ran the test's own rule by hand: zero violations).
The 19 UX/a11y findings and the 14 i18n/integration findings landed essentially in full,
including the two diffs the i18n agent handed off unapplied.

What did *not* happen is that **six of the security audit's findings — one BLOCKER and five
MAJORs — had no owner in any of the six fix reports and were silently dropped.** No fix
report even names them. The single worst is `GET /api/results/game/:gameId`: still
`optionalAuth`, still zero authorization, still a top-level Prisma `include`, so one
unauthenticated `curl` with a game id returns PRD 348's new `Game.paymentHint` (IBAN /
Revolut handle / phone number) plus every participant's `bio`, `weeklyAvailability` and
`socialLevel` — for private games too. The money agent explicitly flagged it as out of its
scope and handed it to the orchestrator; nobody picked it up. Close behind it: the
`constraints.md` BLOCKER (attendance still gated on `Game.status`) is untouched, and
`GET /rankings/pairs/:pairId` still names arbitrary users' private games.

Only one genuinely new defect came out of seven agents in a shared tree, and it is minor
(`SegmentedSwitch` now swallows Up/Down in horizontal tab lists). No two fixes half-undo
each other, no authorization check is bypassed by a second route, and no `catch` swallows
something a caller needed. The concurrency work is the strongest part of this round.

---

## Audit findings re-checked

| Audit | Finding | Severity | Status |
|---|---|---|---|
| security | `addRegular` self-add → private seat + private chat | BLOCKER | **FIXED** |
| security | `ensureSeriesChat` returns channel id before the owner check | BLOCKER | **FIXED** |
| security | Cost-share coin settle double-pays under concurrency | BLOCKER | **FIXED** (one narrow residual race, below) |
| security | Shop purchase overdraws the wallet across distinct items | BLOCKER | **FIXED** |
| security | Attendance mutations gated on `Game.status` | BLOCKER | **NOT FIXED** |
| security | `GET /rankings/pairs/:pairId` names arbitrary private games | MAJOR | **NOT FIXED** |
| security | `Game.paymentHint` served unauthenticated | MAJOR | **NOT FIXED** |
| security | Live spectator token survives the game going private | MAJOR | **NOT FIXED** |
| security | Weather alert sent before the dedupe marker is persisted | MAJOR | **NOT FIXED** |
| security | `weatherAlertState` read-modify-write erases "Keep as planned" | MAJOR | **NOT FIXED** |
| security | Carry-over prompt has no persisted dedupe | MAJOR | **FIXED** |
| security | Series generation notifies the city before the uniqueness stamp | MAJOR | **FIXED** |
| security | Monthly-recap low-activity sweep stops after the first short page | MAJOR | **NOT FIXED** |
| security | `GameStatusScheduler` has no re-entrancy guard | MAJOR | **NOT FIXED** |
| security | Freed seat pushes the same play-intent user twice | MAJOR | **NOT FIXED** |
| security | Automatic cost-share reminder sweep starves past 50 games | MAJOR | **FIXED** |
| security | `requireLedger` mutates before it authorizes | MINOR | **FIXED** |
| security | `acceptSeat` in-transaction capacity re-check buys nothing | MINOR | **FIXED** (`FOR UPDATE`) |
| security | `closeExpiredSeries` UTC cutoff vs club-local day keys | MINOR | **FIXED** |
| security | Cost-share override amount unbounded | MINOR | **FIXED** |
| security | Gifting bypasses the block relationship | MINOR | **FIXED** |
| security | Withdrawing a re-purchased item skips the refund | MINOR | **FIXED** |
| security | `noteNoShow` not atomically idempotent | MINOR | **NOT FIXED** |
| security | Live-notify claim never released on send failure | MINOR | **NOT FIXED** |
| security | `costReminderDedupe` non-Redis fallback (3 defects) | MINOR | **NOT FIXED** |
| security | Weather "quiet" branch bumps `Game.updatedAt` | MINOR | **NOT FIXED** |
| security | `SpotOpenedDelivery` / `LiveGameNotifyDelivery` have no pruner | MINOR | **NOT FIXED** |
| security | Spot-opened intent lookup is an unbounded per-event scan | MINOR | **NOT FIXED** |
| security | Monthly recap is record-then-send with no retry | MINOR | **NOT FIXED** |
| security | `/clubs/:id/*` limiter keygen dead; `/regulars` cache unbounded | MINOR | **NOT FIXED** |
| security | `GET /rankings/pairs` has no rate limit, re-scans a city per page | MINOR | **NOT FIXED** |
| security | Pair surfaces do not filter blocked users | MINOR | **NOT FIXED** |
| security | `refreshPairStatsForPairs` unbounded all-time scan | MINOR | **NOT FIXED** |
| security | Live-notify fan-out unbounded and serial | MINOR | **NOT FIXED** |
| conf 345–350 | `?playIntentOpen=1` has no consumer | MAJOR | **FIXED** |
| conf 345–350 | `GET /games/:id/series-next` + `GET /series/:id` no access check | MAJOR | **FIXED** (label still public — PARTIAL, below) |
| conf 345–350 | 24 h/2 h reminder has no answerable native shade action | MAJOR | **DEFERRED** (documented) |
| conf 345–350 | Coin settle not idempotent past the transfer | MAJOR | **FIXED** |
| conf 345–350 | Auto settle reminder clock is the sweep, not FINAL | MINOR | **FIXED** (`onGameFinalizedForCost`, post-commit) |
| conf 345–350 | `useLiveGames` releases rooms it never retained | MINOR | **FIXED** |
| conf 345–350 | Spot-opened push has no "Join now" shade button | MINOR | **DEFERRED** (native-shade exclusion) |
| conf 345–350 | Own no-show notes hidden below the 5-game floor | MINOR | **FIXED** |
| conf 345–350 | Owner-cap helper's "link to Profile" never rendered | MINOR | **FIXED** |
| conf 345–350 | Organizer strip owner-only, not owner/admin | MINOR | **FIXED** (platform admin; game-`ADMIN` deliberately excluded) |
| conf 345–350 | Off-phase seed occurrence when weekday overridden | MINOR | **FIXED** |
| conf 351–357 | Second withdrawal deletes ownership without refunding | MAJOR | **FIXED** |
| conf 351–357 | Guests see a login card instead of club reviews | MAJOR | **FIXED** |
| conf 351–357 | "Move indoor" drops the other courts | MAJOR | **FIXED** |
| conf 351–357 | "Scroll to my pair" pill stuck on for a top-3 viewer | MINOR | **FIXED** |
| conf 351–357 | "Played · +50" for a referrer who was paid nothing | MINOR | **FIXED** |
| conf 351–357 | Sticker-pack "Equip" is a no-op | MINOR | **FIXED** (affordance removed both ends) |
| conf 351–357 | "Keep as planned" did not suppress the 12 h alert | MINOR | **FIXED** |
| conf 351–357 | Telegram game messages do not link the club name | MINOR | **FIXED** |
| conf 351–357 | Gifting bypasses blocks | MINOR | **FIXED** |
| conf 351–357 | `?section=weather` without `action=moveIndoor` does nothing | MINOR | **FIXED** |
| ux-a11y | Shop card `aria-label` erases the price | MAJOR | **FIXED** |
| ux-a11y | Per-head price label on a role-less `<span>` | MAJOR | **FIXED** (real `<button>`) |
| ux-a11y | Long-press on per-head price navigates into the game | MAJOR | **FIXED** |
| ux-a11y | Empty category removes the category filter | MAJOR | **FIXED** |
| ux-a11y | Attendance-dot legend reachable only via `contextmenu` | MAJOR | **FIXED** |
| ux-a11y | `radiogroup` with no arrow keys | MAJOR | **FIXED** |
| ux-a11y | Popover menus cannot be dismissed | MAJOR | **FIXED** |
| ux-a11y | Cost share rows collapse the name at 375 px | MAJOR | **FIXED** |
| ux-a11y | Cost card has no loading and no error state | MAJOR | **FIXED** |
| ux-a11y | 10 MINORs (club error state, premium gold, recap tablist, Space, pair pulse, spot pill role, court tiles, RTL sweep/thumb, club action row, 28 px toggle) | MINOR | **FIXED** (all 10) |
| i18n | Enrichment merge drops six of nine fields | BLOCKER | **FIXED** |
| i18n | Arabic `recap` missing `_few`/`_many`/`_two` | BLOCKER | **FIXED** |
| i18n | `buildGameRenderSignature` omits every new card field | BLOCKER | **FIXED** |
| i18n | Bare `sr` handed to `Intl` | MAJOR | **FIXED** |
| i18n | Counted English strings with no plural family | MAJOR | **FIXED** |
| i18n | `series.capReached` count in a frozen genitive | MAJOR | **FIXED** |
| i18n | `clubPage.today.windowHint` hard-codes a 24-hour clock | MAJOR | **FIXED** |
| i18n | Recap **card** PNG has no RTL guard | MAJOR | **FIXED** |
| i18n | Formal/informal register drift (`ru`, `sr`) | MAJOR | **FIXED** in the 12 programme namespaces |
| i18n | Admin Platform Settings missing referral reward rows | MAJOR | **FIXED** (+ a real pre-existing `TypeError` on the Cost Split card) |
| i18n | 9 MINORs (`%` via Intl, Arabic bot arrow, `$`-injectable replace, flag-off shell, `getOwed` gate, two invalidations, `hi` clock) | MINOR | **FIXED**; 4 argued not-defects, reasoning holds |

---

## Findings

### [BLOCKER] Attendance mutations are still gated on `Game.status` — nobody owned this finding

- **Where:** `Backend/src/services/gameAttendance/attendanceRules.ts:258-263`
  (`return game.timeIsSet === true && game.status === 'ANNOUNCED';`), consumed at
  `Backend/src/services/gameAttendance/gameAttendance.service.ts:237` (`setAttendance`)
  and `:426` (`nudgeUnanswered`).
- **Defect:** byte-identical to what `critic-security.md` filed. `grep` across all six fix
  reports for `attendanceRules` / `gameAcceptsAttendanceAnswers` returns nothing; the only
  hit for `Game.status` is the series carry-over gate, which *was* fixed.
- **Scenario:** create a `GAME` whose `startTime` is already in the past (a logged /
  backdated game). `calculatePersistableGameStatus` refuses to persist a clock-`FINISHED`
  status for an unscored `GAME`, and `gameStatusScheduler` `continue`s rather than writing,
  so the row keeps `status: 'ANNOUNCED'` until archive at start+7d. A rostered player then
  `POST /games/:id/attendance {"state":"CONFIRMED"}` after the game happened; the gate
  passes, `attendedWhere` counts it at archive, and the public "Shows up %" on
  `GET /users/:id/stats` is inflated. The organizer can also `nudgeUnanswered` about a game
  that already finished.
- **Relates to:** `critic-security.md` BLOCKER #5. `docs/product/constraints.md` names this
  exact predicate as forbidden. The correct shape is already written three functions away
  at `attendanceRules.ts:126-136` (`resultsStatus` + explicit `endTime`/`startTime`).

### [MAJOR] `GET /api/results/game/:gameId` still leaks `Game.paymentHint` to anyone, unauthenticated

- **Where:** `Backend/src/routes/results.routes.ts:12` (`optionalAuth`) →
  `Backend/src/controllers/results.controller.ts:41-49` (no authorization at all) →
  `Backend/src/services/results.service.ts:37-40` (top-level `include:`, no `select`).
  Field confirmed present at `Backend/prisma/schema.prisma:826`.
- **Defect:** unchanged. `fix-money-paths.md` lists it under "Deliberately **not** touched
  (flagging for the orchestrator)" and no other agent claimed the results projection.
- **Scenario:** `curl https://host/api/results/game/<gameId>` with no `Authorization`
  header. Game ids are on every Find card, the live rail, Telegram `/live` and every deep
  link. The response carries the organizer's free-text payment handle, plus `description`,
  `metadata`, `priceTotal`, `mediaUrls`, `externalUrl` and each participant's `bio` /
  `weeklyAvailability` / `socialLevel` — `isPublic` is never consulted. The same projection
  is reused verbatim by `getGameResultsForSpectator` (`results.controller.ts:367`).
- **Relates to:** `critic-security.md` MAJOR. This is the single highest-value item left.

### [MAJOR] The live spectator token still survives the game becoming private

- **Where:** `Backend/src/controllers/results.controller.ts:342-373`.
- **Defect:** redemption verifies the signature, that `payload.gameId === gameId` and that
  the match belongs to the game — and nothing else. `LIVE_RAIL_WHERE` is never re-applied.
- **Scenario:** a guest mints a token from `POST /live-games/:id/spectator-token` while the
  game is public and `showOnLiveRail`. The organizer then turns "Show on Live now" off (or
  flips the game private). The token keeps returning the full `getGameResults` payload for
  its 48 h life. The organizer's opt-out is unenforceable once anyone has minted.
- **Relates to:** `critic-security.md` MAJOR. Unclaimed by every fix report.

### [MAJOR] `GET /rankings/pairs/:pairId` still names arbitrary users' private games

- **Where:** `Backend/src/services/pairStat/pairStatGameLoad.ts:50-55`
  (`pairCountedGameWhere` filters on `resultsStatus` + `entityType` only — still no
  `isPublic`), `Backend/src/services/pairStat/pairRanking.service.ts:574-590`,
  `Backend/src/controllers/pairRanking.controller.ts:80-92` (both ids straight from the
  path param, no membership check), route `Backend/src/routes/pairRanking.routes.ts:28`
  (`authenticate` only, still no limiter).
- **Scenario:** any authenticated account calls
  `GET /api/rankings/pairs/<userA>,<userB>` for any two ids visible on any Find card or
  leaderboard, and receives `name`, `club.name`, `startTime` and `entityType` for that
  pair's last five games including private ones.
- **Relates to:** `critic-security.md` MAJOR (plus its two sibling MINORs — no rate limit,
  no block filter — also untouched).

### [MAJOR] Weather alerts still send before the dedupe marker is persisted, and still lose "Keep as planned"

- **Where:** `Backend/src/services/weather/weatherAlert.service.ts:316-323` —
  `await notifyGame(...)` on line 320, `await persistState(...)` on line 321;
  `persistState` (`:326-333`) is still a wholesale `game.update` of the JSON blob with no
  version check or row lock.
- **Scenario (duplicate):** a deploy restarts the process between the fan-out and the
  persist. The 12 h window is 11.5–12.5 h wide against a 30-minute cadence, so the game is
  still in-window on the very next tick; `sentAt` is empty and the whole roster is alerted
  a second time.
- **Scenario (lost update):** the sweep reads the blob for game G, then spends tens of
  seconds on serial per-recipient push + preference query + Telegram HTTP. The organizer
  taps "Keep as planned" from that very push; `keepAsPlanned` writes `keepAsPlannedAt`.
  The sweep then persists its stale `nextState`, which carries no `keepAsPlannedAt`. The
  opt-out is gone — and note this now *matters more*, because the conformance fix made
  `keepAsPlannedAt` suppress **both** windows (`weatherRisk.ts:380-382`), so erasing it
  un-silences an alert the organizer explicitly declined.
- **Relates to:** two `critic-security.md` MAJORs. Unclaimed.

### [MAJOR] `GameStatusScheduler` still has no re-entrancy guard

- **Where:** `Backend/src/services/gameStatusScheduler.service.ts:20-38` — no `running`
  flag, while all three new schedulers have one.
- **Scenario:** one `0,30 * * * *` tick now runs `updateGameStatuses` + `sendReminders` +
  `sendWeatherAlerts` (up to 600 games across two windows, each with serial per-recipient
  push + preference query + Telegram HTTP). Once a tick exceeds 30 minutes node-cron fires
  the next callback concurrently; two sweeps read `weatherAlertState` for the same game
  before either persists, which — given the send-then-persist ordering above — produces a
  duplicate roster-wide alert with no crash required.
- **Relates to:** `critic-security.md` MAJOR. Unclaimed.

### [MAJOR] The monthly-recap low-activity sweep still terminates after the first short page

- **Where:** `Backend/src/services/recap/monthlyRecapPass.ts:104`
  (`if (userIds.length < batchSize) break;`) against
  `Backend/src/services/recap/recapInputs.loader.ts:57-81`, which still `take`s exactly
  `limit` rows and *then* filters out anyone who played last month.
- **Scenario:** the first 200-row page contains 4 users who also played last month → 196
  returned → `196 < 200` → the sweep breaks. Every lapsed user sorting after that point
  gets no "come back" recap and no push, and `monthKey` changes next month so there is no
  catch-up. The related cursor bug (`monthlyRecapPass.ts:77` takes the cursor from the
  *filtered* list, so pages overlap) is also still present.
- **Relates to:** `critic-security.md` MAJOR. Unclaimed.

### [MAJOR] A freed seat can still push the same play-intent user twice

- **Where:** `Backend/src/services/game/participant.service.ts:250-256` — `leaveGame` still
  fires both `PlayIntentMatchService.onPublicGameSlotsOpened(gameId)` (deduped on
  `PlayIntentNotificationDelivery.eventKey`) and `GameSeatService.seatOpened(...)`, whose
  `INTENT` recipients come from the same `intentMatchesGame` predicate
  (`Backend/src/services/gameSeat/spotOpenedIntentRecipients.ts:77-92`) behind an
  independent `SpotOpenedDelivery` dedupe.
- **Scenario:** a public game is created **full**, so `onPublicGameCreated` returns early
  without recording an `eventKey`. A player later leaves. `onPublicGameSlotsOpened` fires
  `GAME_MATCHES_INTENT` (nothing to suppress it) and `notifySpotOpened` fires
  `GAME_SPOT_OPENED` — the same user gets two pushes about the same seat, seconds apart.
- **Relates to:** `critic-security.md` MAJOR. Unclaimed. *(Note: another agent is editing
  this file right now for integration tests; the two `void` calls above were unchanged at
  the time I read it.)*

### [MINOR] A concurrent "mark received" can still turn one coin settle into two

- **Where:** `Backend/src/services/gameCost/gameCost.service.ts:670-702` (the claim /
  transfer / stamp sequence) vs `:728-736` (`setShareConfirmed`, an unconditional
  `gameCostShare.update`).
- **Defect:** the COINS claim stamps `confirmedAt = claimedAt` and only stamps
  `transactionId` *after* the transfer, under `where: { confirmedAt: claimedAt }`.
  `setShareConfirmed` is not scoped to that claim, and its own "already settled" guard is
  `method === 'COINS' && transactionId != null` — which is false during the window.
- **Scenario:** the player taps "Pay with coins"; the claim lands. While
  `createGuardedTransfer` is running, the payer taps the "Received" checkbox **off**
  (`setShareConfirmed(paid: false)`). The guard passes (`transactionId` is still null) and
  it writes `confirmedAt: null`. The transfer commits; the stamp `updateMany` matches 0
  rows, so `transactionId` is never recorded. The share now reads unpaid with
  `confirmedAt: null, transactionId: null` — the player taps "Pay with coins" again, the
  claim predicate matches, and a **second** transfer runs. Coins moved twice for one share.
- **Relates to:** `critic-security.md` BLOCKER #3 — the main race is closed, this is a
  residual third-party race. Scoping `setShareConfirmed`'s write to
  `updateMany({ where: { gameId, userId, method: { not: 'COINS' } } })` (or to
  `confirmedAt` values it read) closes it.

### [MINOR] `GET /games/:id/series-next` still leaks a private series' name, cadence and time to any authenticated caller

- **Where:** `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts:548-559` —
  `buildSeriesCardLabels([gameId])` runs before, and outside, the `isSeriesInsider` gate at
  `:571-581`; route `Backend/src/routes/gameSeries.routes.ts:47` is `authenticate` only,
  with no `canAccessGame`.
- **Defect:** the fix's own justification is that "the same label is already on every public
  Find card via `gameSeriesCardEnricher`" — but the Find card only carries it for games the
  viewer can already see, whereas this endpoint accepts *any* game id.
- **Scenario:** user B was once invited to A's private weekly series and still has
  `/games/<occurrenceId>`. `GET /api/games/<occurrenceId>/series-next` returns
  `label: { seriesId, name: "Tuesday Regulars", cadence, weekday, startTimeLocal,
  occurrenceNumber }`. The roster, the next occurrence id and the counters are correctly
  withheld now; the organizer-authored series name and schedule are not.
- **Relates to:** `critic-conformance-345-350.md` MAJOR — PARTIAL rather than fully closed.

### [MINOR] `SegmentedSwitch` now consumes ArrowUp/ArrowDown in *horizontal* tab lists — NEW

- **Where:** `Frontend/src/components/SegmentedSwitch.tsx:95-112` with
  `Frontend/src/utils/rovingFocus.ts:51-66` (`ArrowDown` → `delta = 1`, `ArrowUp` →
  `delta = -1`, unconditionally, with no orientation input).
- **Defect:** `handleKeyDown` is installed for every non-toggle `SegmentedSwitch`
  regardless of `orientation`, and calls `event.preventDefault()` for all six nav keys.
  WAI-ARIA reserves Up/Down for vertical tab lists; a horizontal one should ignore them.
- **Scenario:** on any of the ~30 horizontal callers (`Header` tab controllers,
  `GameResultsTabs`, `ShopPage`, `LeaderboardModeSwitch`, `CreateGameDurationSelector`,
  `CourtSelectionGrid`, `PlayerCardProfileBody`, …) a keyboard user who Tabs to the tab
  strip and presses ArrowDown to scroll the page instead changes the selected tab — firing
  `onChange`, which on several callers refetches a list — and the page does not scroll.
  This is a behaviour change to a primitive the programme did not otherwise touch.
- **Relates to:** NEW, introduced by `fix-ux-a11y.md`'s systemic pass 1. One-line fix: pass
  `orientation` into `nextRovingIndex` and return `null` for the cross-axis keys.

---

## Still open

**Deliberately deferred, with a documented reason (leave these):**

- **Native push-shade actions** — Android `ChatReplyMessagingService` still branches only on
  `invite_actions` / `play_intent_actions`, and iOS registers no `UNNotificationCategory`.
  PRD 346's "I'm coming / Not sure yet" and PRD 347's "Join now" shade buttons therefore do
  not render. Excluded by the fix brief; flagged in the builder report, the conformance
  audit and `fix-conformance.md`. Telegram mirrors both, and tapping the body carries
  `?join=1`.
- **Carry-over dedupe marker lives in `Game.metadata`, which is client-writable**
  (`gameSeriesCarryOver.service.ts:168-185`). `metadata` is in `GAME_UNCHECKED_SCALAR_KEYS`
  and not in `GAME_RESULTS_LOCKED_FIELDS`, so a game owner could `PATCH` it away and
  re-prompt their own regulars. Documented in `fix-security-series.md` §"Residual risk";
  wants a real column (`Game.seriesCarryOverPromptedFor`) the agent was not allowed to add.
- **`getSeriesDetail` now 403s for non-insiders** — a deliberate behaviour change beyond the
  literal finding, documented. Verified safe: the `↻ Weekly` card pill
  (`GameCardHeaderTags.tsx:72-81`) is a non-interactive `<span>`, so no in-app tap can now
  land a stranger on a 403.
- **PRD 345 organizer strip excludes game-`ADMIN` co-organizers** — deliberate, because
  `assertSeriesOwner` accepts only owner-or-platform-admin, so the buttons would 403.
  Documented in `fix-conformance.md`. If the PRD really means game co-organizers, that is a
  backend permission change still to be made.
- **Four i18n MINORs argued as non-defects** (decorative `_one`/`_other` families,
  count-neutral `series` labels grandfathered by CONTRACT §8.3, mock clock in
  `shop.previewRosterHint`, the flag-parsing asymmetry). Reasoning re-checked and holds.
- **`live.startedMinutesAgo` Arabic 3–10 plural** and the **three dead API surfaces** —
  explicitly recommended as follow-ups rather than fixed.
- **`Frontend/src/utils/displayPreferences.ts:159` maps `sr → sr-RS`** (Cyrillic) — the
  app-wide date path, pre-existing, deliberately left out of scope with a one-line fix
  recorded.

**Quietly dropped (no fix report names them):**

- The **BLOCKER** and **five MAJORs** in the Findings section above: attendance
  `Game.status` gate, `paymentHint` unauthenticated, spectator-token privacy bypass, pairs
  IDOR, weather send-before-persist + lost update, `GameStatusScheduler` re-entrancy,
  monthly-recap sweep early exit, spot-opened/play-intent double push.
- **Thirteen security MINORs**, none claimed by any agent: `noteNoShow` non-atomic;
  live-notify claim never released on send failure; the three `costReminderDedupe`
  non-Redis defects; weather "quiet" branch bumping `updatedAt`; no pruner on
  `SpotOpenedDelivery` / `LiveGameNotifyDelivery`; unbounded spot-opened intent scan;
  monthly recap record-then-send; `/clubs/:id/*` dead limiter keygen + unbounded
  `TtlCache` + no `isActive` check on `/regulars`; `/rankings/pairs` unlimited and
  uncached; pair surfaces not filtering blocks; `refreshPairStatsForPairs` unbounded scan;
  live-notify serial fan-out.
- `Frontend/src/components/playIntent/PlayIntentDeepLink.test.tsx` exists but is in no
  `Frontend/package.json` script, so it never runs. (Every *other* new test file from the
  six reports — including `SegmentedSwitch.keyboard.test.tsx`, `gameSeriesAccess.test.ts`,
  `gameCostSettle.integration.test.ts`, `recapSlideImage.renderer.test.ts`,
  `costReminderCopy.test.ts` — was wired up.)

**Handover items I confirmed *were* applied** (the i18n and UX agents left these unapplied
for the orchestrator; all three landed): `cost.toast.reminded` → `{ count }` at
`GameCostCard.tsx:257` with full plural families in all 11 locales;
`resolveIntlLocale` at `AttendanceStatisticsSection.tsx:30`; `pressScaleGuard` at
`NotificationsStep.tsx:159`.

---

## Not verified

- **Nothing was executed.** No `tsc`, no build, no lint, no vitest, no Prisma, no HTTP
  request, per the brief. Every status above is from reading the current working tree.
- **Type correctness.** The two new compile-time guards (`AllEnrichmentKeysListed` in
  `Frontend/src/types/gameCardEnrichment.ts:241-243`, `AllEnrichFieldsEmitted` in
  `Backend/src/services/game/availableGamesEnrichment.ts:204-209`) are structurally correct
  — `AssertNever<T extends never>` fails at the declaration site naming the missing field —
  but I could not run `tsc` to confirm they compile clean today, nor that the widened
  `Game extends GameCardEnrichment` did not collide with an existing declaration.
- **Concurrency claims.** The cost-share claim, the shop conditional debit, the refund
  `deleteMany` claim and the `jsonb_set` carry-over claim are all reasoned from Postgres
  READ COMMITTED re-evaluation after row-lock release. I read the new
  `gameCostSettle.integration.test.ts` / `shop.integration.test.ts` assertions but did not
  run them. The `SELECT … FOR UPDATE` in `acceptSeat` uses the unqualified `"Game"` table
  name matching house usage; not executed.
- **The i18n plural verdict** was produced by re-implementing the test's own rule
  (`Intl.PluralRules(tag).resolvedOptions().pluralCategories`, `sr` → `sr-Latn`) over the
  same 30 namespaces the test covers: 0 missing and 0 unreachable categories across all 11
  locales. That is the test's logic, not the test itself.
- **`MoveIndoorSheet` edge case, UNVERIFIED:** `planIndoorCourtSwap` de-duplicates, so
  picking an indoor court the game is *already* on would shrink the court set by one. I did
  not confirm whether `indoorAlternatives.service.ts` excludes already-linked courts from
  the offered list (it probably does, since they are busy).
- **`sr` register, partial:** zero informal pronoun tokens remain in the 12 programme
  namespaces, which is what the finding asked for. 31 informal tokens remain in legacy
  namespaces (`club`, `chat`, `createGame`, `playIntent`, …), so the fix agent's premise
  that the legacy bundle is uniformly formal is not quite right. Whether the programme is
  now *more* or *less* consistent with the app overall is a copy judgement I cannot settle
  from source.
- **Anything needing a device:** shade rendering, Telegram round trips, RTL layout, the
  Tailwind `motion-reduce:active:scale-100` specificity claim, the `pointerdown` capture
  dismissal on iOS WKWebView, and the 375 px cost-row and club-action-row layouts.
- There are **six** fix reports, not seven; no `fix-integration.md` exists in
  `docs/plans/prd-345-357/reports/`. If a seventh agent ran, its work is unattributed — the
  six orphaned security findings above are consistent with a missing owner.
