# Final gate

## Verdict

**DO NOT SHIP** — one BLOCKER, two MAJORs.

The programme is in good shape. Five critics and eight fix agents have genuinely closed almost everything: I re-verified the attendance `Game.status` gate, the pair-ranking IDOR, the weather send-before-persist ordering, the scheduler re-entrancy guard, the monthly-recap sweep cursor, the `SegmentedSwitch` arrow-key regression and the results-endpoint lockdown, and all of them are properly fixed, not papered over. The results projection is also **field-complete** — I walked every consumer (web results engine, league fixture cache, live board, spectator/TV mode, Watch app `WatchResultsGame`/`WatchMatch`/`WatchOutcome`, `convertServerResultsToRounds`, `getRules`) and nothing a scoreboard reads was dropped.

The single worst thing outstanding is that **the fix cycle closed the `Game.paymentHint` leak on one endpoint and left the wider one wide open**. `GET /api/results/game/:gameId` now uses a whitelist projection and a 404-on-private access check. `GET /api/games/:id` sits on `optionalAuth`, runs a top-level Prisma `include`, and therefore returns every `Game` scalar — `paymentHint` included — to a caller with **no token at all**. PRD 348 is the PRD that created that column, the UI placeholder for it reads *"IBAN, Revolut tag, cash at the club…"*, and the programme's own newly-written invariant in `docs/product/constraints.md:184` says `paymentHint` "must never reach a client". An organizer's bank details are one unauthenticated `curl` away from anyone holding a game id. That is not shippable.

Second is a correctness gap the join-path review was explicitly asked to close and could not: `ParticipantService.joinGame` takes no row lock, and PRD 347's spot-opened push is a *designed* simultaneous race of the whole queue onto one seat. PRD 345's `acceptSeat` — the same shape of push, the same shape of race — does take `SELECT … FOR UPDATE`. The asymmetry is the tell.

---

## Per-PRD completeness

| PRD | Delivered? | Anything missing |
|---|---|---|
| 345 Recurring series | **Partial** | A regular cannot leave the regular roster (user story 18) — backend allows it, UI gates on ownership. Organizer "add a regular" endpoint exists with no UI. Profile → "Your regular games" section absent. `↻ Weekly` card pill is a non-interactive `<span>` (deliberate consequence of the series-detail lockdown). |
| 346 Attendance / no-show | Yes | Nothing beyond the accepted native-shade gap. (I checked and **rejected** a suspected gap: the "Shows up" tile *does* render on another user's player card via `PlayerCardProfileBody` → `LevelHistoryView:328`, fed by `attendance` on `GET /users/:id/stats` — `stats.controller.ts:317-340`.) |
| 347 Spot-opened / auto-fill | Yes | All five trigger points wired; pill, queue panel, `?join=1`, auto-fill, system messages, delivery dedupe all real. See MAJOR-2 and MINOR-3/4 for defects, not gaps. |
| 348 Cost split | Yes | — |
| 349 Live now rail | Yes | — |
| 350 Onboarding | Yes | Analytics is a documented no-op seam (`onboardingAnalytics.ts` dispatches a `window` CustomEvent with no listener) — defensible, the app has no analytics client at all (`grep -rn "logEvent\|trackEvent" Frontend/src` → nothing). Listed as an accepted gap. |
| 351 Referral | Yes | `GET /referrals/game-link/:gameId` + `referralApi.getGameInviteLink` are unreachable; the client builds the link itself. Already on the known dead-surface list. |
| 352 Pair leaderboard | Yes | `POST /rankings/pairs/recalculate` has no caller (no Admin UI). The PRD only asked for "an endpoint", so compliant. |
| 353 Monthly recap | Yes | — |
| 354 Public club page | Yes | — |
| 355 Shop | Yes | `GET /shop/items/:goodsId` + `shopApi.getItem` unreachable. Already on the known dead-surface list. |
| 356 Telegram `/play` `/live` | Yes | `setMyCommands` genuinely invoked (`botCommandMenu.ts:49,58` ← `bot.service.ts:85`); callback regex at `bot.service.ts:66` carries all twelve prefixes and every one has a branch in `callback.handler.ts`. |
| 357 Weather alerts | Yes | — |

---

## Findings

### [BLOCKER] `Game.paymentHint` is served to unauthenticated callers by `GET /api/games/:id`

- **Where:** `Backend/src/routes/game.routes.ts:118` (`optionalAuth`, no privacy gate) → `Backend/src/controllers/game.controller.ts:57-67` → `Backend/src/services/game/read.service.ts:321-325` (`include: gameWithRoundsAndOutcomes` — a top-level `include`, so **every** `Game` scalar is returned; `Backend/src/services/game/gamePrismaIncludes.ts:204-234`). Column: `Backend/prisma/schema.prisma:826`. Intended audience: `Backend/src/services/gameCost/costSharePermissions.ts:38-45`.
- **Defect:** PRD 348 added a free-text payment-handle column to `Game`, and the only endpoint that returns the whole `Game` row has no `select` whitelist and no `isPublic` / membership check, so the field reaches anyone who knows a game id — with no account.
- **Failure scenario:** An organizer creates a game, taps "How to pay you" (`Frontend/src/components/createGame/PaymentHintField.tsx:31-43`, placeholder `Frontend/src/i18n/locales/en/cost.json:51` = *"IBAN, Revolut tag, cash at the club…"*, help text line 52 = *"Shown to players when they settle"*) and types their IBAN. Anyone with the game id — a shared chat link, a Telegram forward, a player who was removed from the roster last week — runs `curl https://<host>/api/games/<gameId>` with **no `Authorization` header** and reads `data.paymentHint`. There is no auth middleware ahead of it (`Backend/src/app.ts` mounts no global `authenticate`) and no response scrubber. `GET /games/:id/cost`, the endpoint the product intends to serve that same string from, correctly requires roster membership. The same request also returns a private game's full roster with each player's `bio`, `weeklyAvailability`, `socialLevel` and `verbalStatus` (`USER_SELECT_WITH_SPORT_PROFILES`) — that part is pre-existing, the `paymentHint` part is not.
- **Introduced by:** original build (PRD 348 created the column). `fix-security-round2.md` found this endpoint, named it, and explicitly deferred it — *"`GET /api/games/:id` is still `optionalAuth` with no `isPublic` check… outside this brief"* — after closing the byte-identical leak on `GET /api/results/game/:gameId`. The programme then wrote the rule it violates into `docs/product/constraints.md:184`.
- **Shape of the fix:** the same one already built for results — an explicit `select` on `getGameById` that omits `paymentHint` (minimum), plus reuse of `RESULTS_FORBIDDEN_GAME_KEYS`-style assertion. A membership gate on private games is the larger, separate pre-existing item.

### [MAJOR] `joinGame` takes no row lock, and PRD 347 makes last-seat contention the designed path

- **Where:** `Backend/src/services/game/participant.service.ts:115-148` (queued-player promote) and `:176-195` (new joiner); the in-transaction re-read is `fetchGameWithPlayingParticipants` (`Backend/src/utils/gameQueries.ts:26-49`), a plain `findUnique` with no `FOR UPDATE`. Contrast `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts:462`, which takes `SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE` for exactly this situation, and the house uses of the same pattern at `Backend/src/services/gameTeam.service.ts:68` and `Backend/src/services/gamePhoto/gamePhoto.create.service.ts:97`.
- **Defect:** the capacity check and the seat write are a check-then-act across a Prisma transaction at Postgres's default READ COMMITTED with nothing locked, and there is no DB-level capacity constraint (`GameParticipant` has only `@@unique([userId, gameId])`).
- **Failure scenario:** A 4-slot public game with `allowDirectJoin: true`, `autoFillFromQueue: false`, roster full, three players queued. One player leaves → `runSeatOpened` (`Backend/src/services/gameSeat/gameSeat.service.ts:112-146`) writes `lastSeatOpenedAt` and, because auto-fill is off, `dispatchSpotOpenedNotifications` pushes *all three* queued players "A spot just opened — Join now" at the same instant. Two tap within the same second. Both requests enter `prisma.$transaction`, both `fetchGameWithPlayingParticipants` read 3 PLAYING, both `validatePlayerCanJoinGame` return `canJoin: true`, both `addOrUpdateParticipant` write `PLAYING`. Result: **5 PLAYING participants in a 4-slot game**. From there `isPlayingRosterFull` blocks every further roster action, match generation for a 4-player format has an extra body, and the organizer has to kick someone who was told they were in.
- Everything else the join-path review asked about does hold: the roster lock answers first (`validatePlayerCanJoinGame` → `validateGameCanAcceptParticipants`, `Backend/src/utils/participantValidation.ts:159`), the overlap confirm is applied to the new queued-promote path (`participant.service.ts:109-113` → `gameSlotOverlap.service.ts:131-144`, and the `?join=1` deep link routes through `handleJoin`'s `runWithOverlapConfirm`, `GameDetailsShell.tsx:652`), a `PLAYING` participant still short-circuits at `:71`, self-promotion on a manual-accept game is refused at `:85-92`, and the `INVITED` / `GUEST` / `NON_PLAYING` / no-row branches are byte-identical to master.
- **Introduced by:** original build (PRD 347 created the thundering herd); the fix cycle's queue self-promotion widened the set of racers from "strangers who happen to be on Find" to "everyone the push just woke up".

### [MAJOR] PRD 345's regulars roster is read-only for everyone but the owner

- **Where:** `Frontend/src/pages/SeriesPage.tsx:535` — `canRemove={series.isOwner && !isEnded}`, the only gate on the remove control (`:118`). Backend deliberately permits self-removal: `Backend/src/services/gameSeries/gameSeriesAccess.ts:62-64` lets `actor === target` through. The add side, `Frontend/src/api/series.ts:236` (`addRegular`) → `Backend/src/routes/series.routes.ts:60` → `Backend/src/services/gameSeries/gameSeries.service.ts:1216`, has **zero** call sites (`grep -rn "addRegular" Frontend/src` returns only the definition).
- **Defect:** two elements of PRD 345 have working backends and no UI — user story 18 (*"As a regular, I want to leave the regular roster without leaving the current game, so that 'not next week' and 'not tonight' are separate choices"*, `prd-345.md:30`) and the Regulars tab's *"remove/**add** for organizer"* (`prd-345.md:55`).
- **Failure scenario:** A player is a regular in "Tuesday Regulars". They want to stop coming weekly but still play tonight's occurrence. Opening `/series/:id` shows the Regulars list with no control on their own row — the remove button only renders for the series owner. Their only options are to keep receiving the weekly "Same time next week?" push indefinitely or to ask the organizer. Symmetrically, an organizer who wants to add someone back to the roster has a live, authorised endpoint and no button.
- **Introduced by:** original build. Not re-litigating the accepted native-shade gap; this is a separate one of the same kind.

### [MINOR] Losing the spot-opened race shows a green success toast reading "Game is full"

- **Where:** `Backend/src/services/game/participant.service.ts:99-107` returns `joinResult.reason` through the **200** path; `Backend/src/controllers/game.controller.ts:496-499` wraps it as `{ success: true, message }`; `Frontend/src/pages/GameDetailsShell.tsx:652-662` routes anything that is not `games.addedToJoinQueue` or `games.addedToQueueLevelOutOfRange` to `toast.success`.
- **Defect:** the "you did not get the seat" outcome is delivered as a success.
- **Failure scenario:** Two queued players tap "Join now" from the spot-opened push. The loser's request reaches `validatePlayerCanJoinGame` after the seat is taken, gets `{ canJoin: false, shouldQueue: true, reason: 'errors.invites.gameFull' }`, and — because they are already queued — the new `wasInQueue` branch returns that string instead of throwing. They see a **green checkmark toast reading "Game is full"** (`Frontend/src/i18n/locales/en/errors.json:24`) and reasonably conclude they are in, until the roster refreshes.
- **Introduced by:** a fix cycle (`fix-integration.md`; before it, this case was a 400).

### [MINOR] `GET /api/games/available/enrichment` returns PRD-derived fields for arbitrary game ids

- **Where:** `Backend/src/routes/game.routes.ts:58` (`authenticate` only, no rate limit) → `Backend/src/controllers/game.controller.ts:410-428` → `Backend/src/services/game/availableGamesEnrichment.ts:215-250`, whose `prisma.game.findMany({ where: { id: { in: unique } } })` applies no visibility filter. The enrichers that ignore the viewer are `Backend/src/services/gameSeries/gameSeriesCardEnricher.ts:95-108` and `Backend/src/services/gameCost/perHeadPrice.enricher.ts:70-95`.
- **Defect:** an endpoint that predates the programme with a benign payload (own note / weather / reactions) now also carries six PRD-derived fields, two of which are not viewer-scoped.
- **Failure scenario:** A player removed from a private weekly game still has the game id. `GET /games/:id` 200s today (see the BLOCKER) but does **not** carry the series name. `GET /api/games/available/enrichment?ids=<id>` returns `seriesLabel = { seriesId, name: "Tuesday Regulars", cadence, weekday, startTimeLocal, occurrenceNumber }` and `perHeadPrice = { amountCents, currency, totalCents, payerCount, estimated }` — the series is still running, on which weekday, at what local time, and what the group now pays. Up to 100 ids per request, unmetered. `attendanceSummary` and `liveSummary` are correctly scoped (`gameAttendance.service.ts:580-586` viewer-must-be-PLAYING; `liveGames.service.ts:291-306` re-applies `LIVE_RAIL_WHERE`) — only these two are not.
- **Introduced by:** original build. Same class as the series-name leak `critic-verification.md` filed as a PARTIAL/MINOR on `GET /games/:id/series-next`; rated consistently with it. Fixing that one will not fix this one — they are separate code paths.

### [MINOR] The "Spot opened" pill survives the seat being refilled

- **Where:** `Backend/src/services/gameSeat/spotOpenedEnricher.ts:26-35` filters on `lastSeatOpenedAt` within 2 h, `resultsStatus`, `status` — but never on whether a seat is still open. Client mirror `Frontend/src/features/spot-opened/spotOpenedWindow.ts:33-41` doesn't either. Nothing clears `lastSeatOpenedAt` (`grep -rn "lastSeatOpenedAt" Backend/src` — the only write is `gameSeat.service.ts:119`).
- **Defect:** the pill is keyed on "a seat opened recently", not "a seat is open".
- **Failure scenario:** `autoFillFromQueue` is on. A player leaves; `runSeatOpened` sets `lastSeatOpenedAt`, auto-fills the queue head ~200 ms later and emits `game-seat-filled`. The game is full again. For the next **two hours** every Find and My-tab card for that game shows the sky "A spot opened" pill *and* is boosted to the top of its day group by `sortDayGroupGames` (`spotOpenedWindow.ts:65-70`). Find does not filter full games by default (`availableSlots` in `availableGamesStructuralWhere.ts:18` is an opt-in filter), so users tap through to a full game. The cheap fix is an open-seat count in the enricher's query.
- **Introduced by:** original build.

### [MINOR] `setShareConfirmed` can release an in-flight COINS claim (still open)

- **Where:** `Backend/src/services/gameCost/gameCost.service.ts:731-736` (unconditional `update` writing `confirmedAt: null`) against the claim/transfer/stamp window at `:668-706`. The guard at `:726` (`method === 'COINS' && transactionId != null`) is false for the whole window, because `transactionId` is stamped only after the transfer returns.
- **Defect:** the un-tick path is not scoped away from a COINS claim that has not been stamped yet.
- **Failure scenario:** Player A taps "Pay with coins"; the claim is stamped `confirmedAt = claimedAt` and `createGuardedTransfer` is in flight. In that window the payer un-ticks "Received" for A. `setShareConfirmed` writes `confirmedAt: null`; A's stamp `updateMany({ where: { confirmedAt: claimedAt, transactionId: null } })` then matches 0 rows. The share now reads unsettled with both fields null, and A's next "Pay with coins" claims and **transfers a second time**. Coins moved twice for one share.
- **Introduced by:** a fix cycle (`fix-money-paths.md` closed the main race and left this third-party one). Already filed as MINOR by `critic-verification.md`; re-verified as still present. Suggested fix stands: scope the un-tick to `updateMany({ where: { gameId, userId, method: { not: 'COINS' } } })`.

### [MINOR] Two new frontend test files are in no npm script and have never run

- **Where:** `Frontend/src/components/playIntent/PlayIntentDeepLink.test.tsx` and `Frontend/src/components/GameDetails/TeamPlayerSelector.test.tsx` — both untracked new files, neither matched by any glob or literal in `Frontend/package.json`.
- **Defect:** the "15 frontend suites pass" signal does not cover them; the assertions inside them (including the whole PRD 350 `?playIntentOpen=1` consumer, which was a conformance MAJOR) are unverified.
- **Failure scenario:** `?playIntentOpen=1` regresses, CI stays green.
- **Introduced by:** fix cycles (`fix-conformance.md` created the first; neither could edit `package.json`). All twelve backend test files the fix reports asked to wire **are** wired — I checked each by name against `Backend/package.json`.

---

## Invariants re-checked

- **No new code gates a mutation on `Game.status`.** Holds. `grep` across `services/{gameSeries,gameCost,gameAttendance,gameSeat,weather,recap,shop,referral,pairStat,live}` finds `ANNOUNCED`/`STARTED` only inside comments and tests. `attendanceRules.ts:254-275` now uses `canMutateGameRoster` + an explicit `startTime` comparison; `gameSeat.service.ts:106-110` and `weatherAlert.service.ts:229` carry the same replacement with the reason written down. The one remaining `status` filter is a **read** filter on the card pill (`spotOpenedEnricher.ts:31`), which fails harmlessly open.
- **PRD 346 writes nothing to `level` / `reliability` / `ratingUncertainty` / `LevelChangeEvent`, and never moves a seat or a queue slot.** Holds, enforced three ways: the runtime allow-list `assertAttendanceUpdateIsSafe` (`attendanceRules.ts:80-89`, applied by all three builders at `:104/:113/:122`), `refreshAttendanceCounters` writing only `attendedCount`/`noShowCount` (`attendanceCounters.service.ts:97-112`), and the invariants integration test. I also checked the one thing that could have slipped past the allow-list — the `userSportProfile.upsert` `create` branch — and it is benign: the Prisma default `level 1.0` equals `DEFAULT_NEW_SPORT_LEVEL`, which is exactly what `resolveUserSportSnapshot` returns for a missing profile.
- **Every coin grant, purchase, gift and refund is atomic and idempotent.** Holds except for the residual `setShareConfirmed` race above. Cost-share claims conditionally before money moves and releases scoped to its own claim (`gameCost.service.ts:668-706`); shop debits with `updateMany({ wallet: { gte } })`; refunds are keyed per ownership instance; referral claims the unique `ReferralReward.referredUserId` row before granting either side (`referralReward.service.ts:108-145`).
- **Socket rooms are `game-${id}` / `notify-user-${id}` and game-room events are kebab-case.** Holds. All six new events emit to `` `game-${gameId}` `` (`socket.service.ts:1305-1346`), are typed in `Frontend/src/services/socketService.ts:109-114`, and are subscribed and unsubscribed symmetrically in `Frontend/src/store/socketEventsStore.ts:860-865` / `:911-916`.
- **Play-intent-style delivery stays persisted, revalidated and deduped.** Holds. `SpotOpenedDelivery` claims before dispatch and releases only on transient failure (`spotOpenedDelivery.service.ts:55-78`), with `sendWithBackoff` never throwing into the caller; weather claims with a conditional UPDATE **before** `notifyGame` (`weatherAlert.service.ts:326-346`); `MonthlyRecap`'s unique `(userId, monthKey)` is the recap claim. No in-memory `Set` was introduced.
- **Results endpoints are field-complete for every consumer.** Holds. `RESULTS_GAME_SCALAR_SELECT` covers every field of `getRules`' `RulesSource` (including `metadata`, which the spectator board has no second source for); `convertServerResultsToRounds` reads nothing outside `resultsMatchSelect`; the Watch app's `WatchResultsGame` needs only `id`/`rounds`/`outcomes` and `WatchTeamPlayer`/`WatchOutcome`'s required keys are all present; the only user fields dropped (`bio`, `verbalStatus`, `socialLevel`, `weeklyAvailability`, `availabilityBucketBoundaries`) are read exclusively from `game.participants` on `GET /games/:id`, never from the results payload.
- **All twelve Telegram callback prefixes are registered.** Holds — `bot.service.ts:66` is `/^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/` and every one has a branch in `callback.handler.ts`.
- **Every card enricher is actually registered at boot.** Holds, including the one `critic-i18n-integration.md` left UNVERIFIED: `gameSeriesCardEnricher` is imported by `series.controller.ts:17`, whose router is mounted at `routes/index.ts:169` (and again transitively via `gameSeriesCarryOver.service.ts:22`).
- **New `Game` columns are not client-writable.** Holds — `weatherAlertState`, `lastSeatOpenedAt`, `costFrozenAt`, `seriesId`, `seriesOccurrenceDate` and `costPayerId` are all absent from `GAME_UNCHECKED_SCALAR_KEYS` (`update.service.ts:64-135`). `metadata` remains writable, which is the already-documented series-carry-over marker risk.

---

## Accepted gaps

- **Native push-shade actions (PRD 346 / 347).** Excluded by the fix brief; Android's `ChatReplyMessagingService` branches only on `invite_actions` / `play_intent_actions` and iOS registers no `UNNotificationCategory`. Not re-litigated.
- **Onboarding analytics is a no-op seam (PRD 350).** `Frontend/src/components/onboarding/onboardingAnalytics.ts` dispatches a `window` CustomEvent with no listener. Defensible and documented in the file: the app has no analytics client at all (`grep -rn "logEvent|trackEvent|analytics\." Frontend/src` → nothing outside that module). The PRD's "emit through the existing event logging path" has no path to use.
- **Three unreachable API surfaces:** `GET /referrals/game-link/:gameId` + `referralApi.getGameInviteLink`, `GET /shop/items/:goodsId` + `shopApi.getItem` (both already on `critic-i18n-integration.md`'s follow-up list), and `POST /rankings/pairs/recalculate`, which has no Admin UI but satisfies PRD 352's literal ask for "an endpoint".
- **PRD 345's `↻ Weekly` card pill is not a link**, though `prd-345.md:38` says the series page should be "reachable from the pill on any occurrence". This is the deliberate consequence of `getSeriesDetail` now 403-ing non-insiders; making it a link needs a projected public series payload. Game details does link correctly.
- **PRD 345's Profile → Statistics → "Your regular games" section does not exist.** Already acknowledged in `fix-conformance.md`; `useMySeries` is only consumed for the 10-series cap check.
- **A queued player promoted by self-join loses `inviteUserTeamId`.** `addOrUpdateParticipant` (`Backend/src/utils/participantOperations.ts:30-42`) clears it and never runs `applyUserTeamToFixedTeamsIfReady`, which the organizer-accept path does. Declared in `fix-integration.md`. Reachable: an INVITED-with-team participant who queues via `moveExistingParticipantToQueue` keeps the id, then loses it on self-join. Effect is a missing fixed-team pairing, not a wrong seat.
- **`joinGame` emits no `game-seat-filled` on self-promotion** (only auto-fill does), so the organizer gets no "X joined from the queue" toast for a self-serve join. Declared in `fix-integration.md`.
- **An OWNER sitting in their own queue on a manual-accept game** now gets `spots.queue.waitForOrganizer`. Declared; they can still accept themselves via `acceptNonPlayingParticipant`.
- **The join-path invariant `fix-integration.md` proposed was not added to `docs/product/constraints.md`.** The other five programme invariants were (lines 130-190). Worth adding with the row-lock requirement from MAJOR-2 once that lands.
- **Thirteen security MINORs from `critic-security.md` remain unowned** (delivery-table pruners, live-notify claim release on send failure, `costReminderDedupe` without Redis, unbounded intent scan, pair-surface block filtering, no rate limit on `/rankings/pairs`). None reached BLOCKER or MAJOR on re-read.

---

## Not verified

- **Nothing was executed.** No `tsc`, build, lint, vitest, Playwright, Prisma or HTTP request, per the brief. Every verdict is from reading the working tree.
- **The two concurrency findings are reasoned, not reproduced.** MAJOR-2 rests on Prisma's default READ COMMITTED with no `FOR UPDATE` and no DB capacity constraint; MINOR-5 rests on the interleaving `critic-verification.md` already described. Neither was run against `padelpulse_dev`.
- **The BLOCKER was not confirmed with a live request.** It is read-verified end to end (route → controller → `include` → no scrubber in `app.ts`), but I did not `curl` a running server. One unauthenticated request against staging would settle it in seconds and is worth doing before the fix, to size the exposure.
- **Anything needing a device or a running integration:** push-shade rendering, Telegram round trips, RTL layout in `ar`, the four themes, reduced motion, 44 px targets, the keyboard contract on real Capacitor, Watch-app decoding against a live payload.
- **League/tournament edges of the results access check.** `assertCanReadGameResults` walks exactly one parent level and excludes `INVITED` from the related-statuses list. Fixtures are created `isPublic: false` with `parentId` = the season, and season players hold roster rows, so the common path is fine — but a viewer whose only relationship is an unaccepted season invite, or membership of a league two levels up, will now get a blank fixture scoreboard. Not reproduced.
- **I did not fluency-review any locale.** The i18n critic's structural verdict was taken as given; I only checked that the new backend `errors.*` keys are never rendered raw (they are not — cost, series, pairs, recap and shop surfaces all use their own generic copy or a mapper such as `attendanceErrorKey`).
