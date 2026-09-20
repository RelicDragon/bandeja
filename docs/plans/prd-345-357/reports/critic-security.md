# Critic: security & correctness

## Verdict

**Do not ship as-is.** The worst finding is PRD 345: `GameSeriesService.addRegular` skips every authorization check when the actor is the target, so **any authenticated user can add themselves as a "regular" of any series**, then seat themselves `PLAYING` in that series' next occurrence via a path that bypasses the level / gender / `isPublic` / `allowDirectJoin` validation every normal join enforces, and then join the private series group chat. That is a complete roster and private-chat compromise reachable with two ordinary API calls and no prior relationship to the series.

Close behind are two money bugs on the two new spending paths. Both are textbook check-then-act outside a transaction: `markOwnShareAsPaid(method: 'COINS')` reads "already settled" and the wallet balance outside any transaction, so two concurrent requests both transfer coins for the same share (the payer is paid twice, one `Transaction` is orphaned); and `purchaseGoods` re-reads the balance *inside* the transaction but under Postgres READ COMMITTED, so N concurrent purchases of N *distinct* items all pass the affordability gate and drive the wallet negative — free goods.

PRD 348 also added `Game.paymentHint` (a free-text payment handle) to a model that the pre-existing, **unauthenticated** `GET /api/results/game/:gameId` dumps in full via a top-level `include` — so the new field leaks to anyone with a game id on day one.

There is also a cluster of duplicate-notification defects: the weather sweep sends before it records its dedupe marker (and the scheduler it was bolted onto has no re-entrancy guard), PRD 345's carry-over prompt has no persisted dedupe at all and re-fires on every results edit, and series generation blasts a city-wide push *before* it discovers the occurrence already exists. Two sweeps also silently stop early — the monthly-recap low-activity pass breaks on its first short page, and the automatic cost-share reminder starves past 50 in-window games.

Substantial parts of the work are genuinely well built — the referral payout, the `UserGoods` unique-index idempotency, the seat-opened delivery table, the cost-reminder Redis claim, the `LIVE_RAIL_WHERE` privacy gate, the public club projection, and PRD 346's forbidden-write allow-list are all correct and better than the precedents they were modelled on. The failures are concentrated in authorization on the series surface, transaction boundaries on the two coin paths, and a handful of IDOR reads.

---

## Findings

### [BLOCKER] Any authenticated user can self-add as a series "regular", seat themselves in a private game, and enter the private series chat

- **Where:** `Backend/src/services/gameSeries/gameSeries.service.ts:1139-1156` (`addRegular`), `Backend/src/controllers/series.controller.ts:190-199`, `Backend/src/routes/series.routes.ts:60`
- **Defect:** `addRegular` runs `assertSeriesOwner` **only** when `actorId !== targetUserId`, and the controller defaults `targetUserId` to `req.userId`, so the self-add branch has no ownership, membership or roster check at all.
- **Exploit / failure scenario:**
  1. `GET /api/games/<anyGameId>/series-next` (route `gameSeries.routes.ts:47` — `authenticate` only, and `getSeriesContext` at `gameSeriesCarryOver.service.ts:420-519` never compares the viewer to the series) returns `seriesId`, `ownerId`, the next occurrence's `gameId` and every regular's name/avatar.
  2. `POST /api/series/<seriesId>/regulars` with body `{}` → attacker becomes an active `GameSeriesRegular`.
  3. `POST /api/games/<nextOccurrenceId>/series-next` `{"action":"accept"}` → `GameSeriesCarryOverService.acceptSeat` (`gameSeriesCarryOver.service.ts:353-393`) sees `isRegular === true` and calls `addOrUpdateParticipant(..., status: 'PLAYING')`. That path checks only `maxParticipants` — it never calls `validatePlayerCanJoinGame` or `validateGenderForGame`, so the level band, `isPublic` and `allowDirectJoin` are all bypassed. The attacker is now a playing participant of a private, level-gated recurring game.
  4. `POST /api/series/<seriesId>/chat` → `ensureSeriesChat` (below) syncs the attacker into the `GroupChannelParticipant` table and returns the channel id. Full read/write on the private series chat.
  5. The attacker remains a regular, so they receive the weekly carry-over prompt indefinitely.
- **Invariant violated:** CONTRACT §13 "permission checks on every mutating endpoint"; PRD 345 user story 18 sanctions self-*removal* from the regular roster only — nothing in the PRD permits self-add.

### [BLOCKER] `ensureSeriesChat` returns the group-channel id and syncs members before the ownership check

- **Where:** `Backend/src/services/gameSeries/gameSeries.service.ts:1181-1193`
- **Defect:** the `if (series.groupChannelId)` early return calls `syncSeriesChatMembers` and returns `{ groupChannelId }` *before* `assertSeriesOwner(series, userId, isAdmin)` on the next line, so the owner check only ever runs on first creation.
- **Exploit / failure scenario:** `POST /api/series/<anySeriesId>/chat` from any authenticated account returns the `groupChannelId` of any series that already has a chat — enough to read the channel through the chat API if membership is obtained by the previous finding, and a standalone identifier leak otherwise. Fixing the self-add finding alone does not close this: the check is simply in the wrong order.
- **Invariant violated:** CONTRACT §13 "no endpoint leaks private data".

### [BLOCKER] Cost-share coin settlement double-pays under concurrency

- **Where:** `Backend/src/services/gameCost/gameCost.service.ts:593-652` (`markOwnShareAsPaid`), gate at `Backend/src/services/gameCost/costShareMath.ts:344-367` (`planCoinSettlement`)
- **Defect:** `alreadySettled` and `viewerCoinBalance` are read outside any transaction, the coin `TRANSFER` is executed, and only then is the share stamped — so the guard is a check-then-act with no lock and no unique constraint behind it.
- **Exploit / failure scenario:** a player with a 100-coin share and 200 coins double-taps "Pay with coins" (or the client retries on a flaky connection — the route allows 60/min, `gameCost.routes.ts:56-61`). Both requests read `confirmedAt: null, transactionId: null` and `wallet: 200`, both pass `planCoinSettlement`, both run `TransactionService.createTransaction(TRANSFER, 100)`. The payer is credited **200** for a **100** share, the player's wallet drops to 0, and the second `gameCostShare.update` overwrites `transactionId`, so the first `Transaction` is orphaned — the ledger shows one settled share and the extra 100 coins are unrecoverable without an admin. The file's own comment ("a retry can never pay twice") is true only for sequential retries.
- **Invariant violated:** CONTRACT §13 / the brief's "any coin grant, purchase, gift or refund that is not idempotent"; the neighbouring `shopPurchase.service.ts` gets this right by doing the check inside the transaction behind a unique index.

### [BLOCKER] Shop purchase can overdraw the wallet — N distinct items for the price of one

- **Where:** `Backend/src/services/shop/shopPurchase.service.ts:61-150`
- **Defect:** the balance check *is* inside `prisma.$transaction`, but the transaction runs at the Postgres default READ COMMITTED (no `isolationLevel` is passed, unlike `game/create.service.ts:59` which uses `Serializable`), so concurrent purchases of **different** `goodsId`s each read the pre-decrement balance; the `UserGoods` unique index only serialises purchases of the *same* item.
- **Exploit / failure scenario:** user has 100 coins. They fire 5 concurrent `POST /api/shop/purchase` for 5 different 100-coin items (the limiter allows 20/min, `shop.routes.ts:21-32`). All five read `wallet: 100`, all five pass `rejectPurchase`'s `buyerBalance < price`, all five `create` distinct `UserGoods` rows and all five `decrement: 100`. Result: 5 items owned, `wallet = -400`, and the bank is credited 500 that never existed. Nothing in the read paths (`ShopService.getCatalog` returns `balance: viewer.wallet`) refuses a negative balance, so the account simply sits at -400.
- **Invariant violated:** CONTRACT §13; the brief's "double-spend / double-grant windows". Note the legacy `TransactionService.createTransaction` (`transaction.service.ts:99-114`) has the same weakness, so this is a propagated pattern rather than a novel one — but the shop is a new value-extraction surface.

### [BLOCKER] Attendance mutations are gated on `Game.status`, not `resultsStatus`

- **Where:** `Backend/src/services/gameAttendance/attendanceRules.ts:254-263` (`gameAcceptsAttendanceAnswers`), used at `Backend/src/services/gameAttendance/gameAttendance.service.ts:237` (`setAttendance`) and `:426` (`nudgeUnanswered`)
- **Defect:** `return game.timeIsSet === true && game.status === 'ANNOUNCED';` gates two mutating endpoints on the clock-derived `status` column.
- **Exploit / failure scenario:** `calculatePersistableGameStatus` / `isUnscoredClockFinished` (`utils/gameStatus.ts`) deliberately refuse to persist a clock-`FINISHED` status for an unscored `GAME`, and `gameStatusScheduler.service.ts` `continue`s rather than writing. A game created *after* its own `startTime` (a backdated/logged game) is never observed by the `0,30 * * * *` sweep while inside `[startTime, endTime)`, so its persisted `status` stays `ANNOUNCED` until archive (start + 7 days). Attendance therefore stays open on a game that already happened: a rostered player can `POST /games/:id/attendance {"state":"CONFIRMED"}` after the fact, which `attendedWhere` (`attendanceCounters.service.ts:31-47`) then counts once the game archives, inflating the public "Shows up %" on `GET /users/:id/stats`. The organizer can also nudge players about a past game.
- **Invariant violated:** `docs/product/constraints.md` → "`Game.status` is derived — never gate mutations on it … do not reintroduce `status === 'STARTED'` or `status === 'FINISHED'` checks in permission code", restated as CONTRACT §0.6. The correct predicate here is `resultsStatus === 'NONE'` plus an explicit `endTime`/`startTime` comparison — the sibling no-show window at `attendanceRules.ts:126-136` already does exactly that and is correct.

### [MAJOR] `GET /rankings/pairs/:pairId` leaks the names, venues and times of arbitrary users' private games

- **Where:** `Backend/src/services/pairStat/pairRanking.service.ts:575-590` (`loadRecentPairGames`), `Backend/src/services/pairStat/pairStatGameLoad.ts:51-56` (`pairCountedGameWhere`), `Backend/src/controllers/pairRanking.controller.ts:80-93`
- **Defect:** `pairCountedGameWhere()` filters on `resultsStatus` and `entityType` only — there is no `isPublic` clause — and the handler takes both user ids straight from `:pairId` with no check that the caller is a member of the pair or shared any game with them.
- **Exploit / failure scenario:** any authenticated account calls `GET /api/rankings/pairs/<userA>,<userB>` for any two user ids (both are visible on every Find card and leaderboard) and receives `name`, `club.name`, `startTime` and `entityType` for that pair's last five games, **including private ones**. Compare `clubPublicRegulars.service.ts`, which deliberately counts private games but never names them.
- **Invariant violated:** CONTRACT §13 "no endpoint leaks private data".

### [MAJOR] PRD 348's new `Game.paymentHint` is served unauthenticated

- **Where:** field added at `Backend/src/services/game/create.service.ts:584-587` and `Backend/src/services/game/update.service.ts:~122`; leaked by `Backend/src/routes/results.routes.ts:12` → `Backend/src/controllers/results.controller.ts:41-50` → `Backend/src/services/results.service.ts:37-40`
- **Defect:** `GET /api/results/game/:gameId` runs under `optionalAuth`, performs **no** authorization check, and `getGameResults` uses a top-level `include:` with no `select`, so every `Game` scalar is returned — now including the organizer's free-text payment handle ("Revolut @name", IBAN, phone number).
- **Exploit / failure scenario:** `curl https://host/api/results/game/<gameId>` with no `Authorization` header returns the payment hint (plus `description`, `metadata`, `lastMessagePreview`, `priceTotal`, `mediaUrls`, `externalUrl` and every participant's `bio` / `weeklyAvailability` / `socialLevel`), for private games too — `isPublic` is never consulted. Game ids come from Find cards, the new live rail, Telegram `/live` and deep links.
- **Invariant violated:** CONTRACT §13. The unauthenticated endpoint is pre-existing and out of these PRDs' scope, but **PRD 348 put a new sensitive field behind it**; either the field must be excluded from that projection or the endpoint must be projected.

### [MAJOR] The live spectator token survives the game becoming private

- **Where:** mint `Backend/src/controllers/liveGames.controller.ts:74-86` + `Backend/src/routes/liveGames.routes.ts:49-54` (`optionalAuth`); redemption `Backend/src/controllers/results.controller.ts:342-372`
- **Defect:** the mint correctly gates on `LIVE_RAIL_WHERE` (`isPublic + showOnLiveRail + resultsStatus: IN_PROGRESS`), but `getGameResultsForSpectator` re-checks only the token signature and that the match belongs to the game — never the visibility gate — and the token has a 48 h life.
- **Exploit / failure scenario:** a guest mints a token while a game is live and public, then the organizer switches "Show on Live now" off, or flips the game to private, or the game finishes. The token keeps returning the full `getGameResults` payload for 48 h. The organizer's opt-out is therefore not enforceable once anyone has minted.
- **Invariant violated:** the comment on `availableGamesStructuralWhere.ts:52-58` states all three `LIVE_RAIL_WHERE` conditions are load-bearing for "the rail, `/live` in Telegram, **and** the spectator-token endpoint" — the redemption side does not honour it.

### [MAJOR] Weather alerts are sent before the dedupe state is persisted

- **Where:** `Backend/src/services/weather/weatherAlert.service.ts:316-325` (`evaluateGame`)
- **Defect:** `await notifyGame(...)` runs before `await persistState(game.id, evaluation.nextState!)`, so the `Game.weatherAlertState.sentAt[]` marker only exists after the whole roster has been pushed and Telegrammed.
- **Exploit / failure scenario:** the process is restarted (deploy) or the `game.update` fails between the fan-out and the persist. The 12 h window spans 11.5–12.5 h and the sweep runs at `:00/:30`, so the same game is still in-window on the very next tick; `evaluateGameWeather` sees no `sentAt` entry and the entire roster receives the alert a second time.
- **Invariant violated:** CONTRACT §5.4 — "use a delivery table … or a persisted timestamp (`Game.weatherAlertState.sentAt[]`)"; the table exists but the write ordering defeats it.

### [MAJOR] `weatherAlertState` is a read-modify-write with no concurrency control — "Keep as planned" is silently erased

- **Where:** `Backend/src/services/weather/weatherAlert.service.ts:306-322` (sweep) vs `:544-557` (`keepAsPlanned`)
- **Defect:** both paths read the whole `Game.weatherAlertState` JSON blob and overwrite it wholesale, with no version check or row lock.
- **Exploit / failure scenario:** the 12 h sweep reads the blob for game G, then spends tens of seconds fanning out (serial push + preference query + Telegram HTTP call per recipient, `:393-441`). The organizer taps "Keep as planned" **from that very push**; `keepAsPlanned` writes `keepAsPlannedAt`. The sweep then persists its stale `nextState`, built from the pre-tap blob, which carries no `keepAsPlannedAt`. The opt-out is gone, and at the 2 h window `decideAlert`'s `keptAsPlanned` branch never fires — the organizer receives the escalation alert they explicitly declined.

### [MAJOR] PRD 345's carry-over prompt has no persisted dedupe — it re-fires on every results edit

- **Where:** `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts:152-223` (`onOccurrenceFinalized`), triggered from `Backend/src/services/results/outcomes.service.ts:1112-1120`
- **Defect:** this is the only new notifier in the programme with neither a delivery table nor a persisted timestamp. The sole guard is `selectCarryOverRecipients` (`gameSeriesEditScope.ts:105-122`), which excludes users *already `PLAYING` on the next occurrence* — a regular who simply ignores the prompt is never excluded.
- **Exploit / failure scenario:** an organizer corrects a score typo. `POST /api/results/game/:gameId/recalculate` re-runs `recalculateGameOutcomes`, which unconditionally re-fires `onOccurrenceFinalized`. Three corrections send three more "Same time next week?" pushes *and* Telegram messages to every regular who has not yet accepted. `update.service.ts:961` and `participantSubstitution.service.ts:123` call the same function, so a late substitution re-prompts too.
- **Invariant violated:** CONTRACT §5.4 — "Do not copy [the in-memory dedupe] for anything that must not double-fire: use a delivery table … or a persisted timestamp." Secondary: the gate at `:166` accepts `game.status === 'FINISHED'` as an alternative to `resultsStatus === 'FINAL'` on a path that *creates games* via `generateForSeries` — a `Game.status` gate on a state-changing path, which `docs/product/constraints.md` forbids.

### [MAJOR] Series occurrence generation notifies the whole city before it checks uniqueness

- **Where:** `Backend/src/services/gameSeries/gameSeriesGeneration.service.ts:291-310`, with `Backend/src/services/game/create.service.ts:822-833`
- **Defect:** `GameCreateService.createGame` commits and immediately fires `notificationService.sendNewGameNotification(...)` plus `PlayIntentMatchQueueService.drain()`. Only *afterwards* does `stampOccurrenceOrRollback` write `(seriesId, seriesOccurrenceDate)`, hit `P2002` and delete the game. The `inFlightSeriesIds` `Set` at `:83` is explicitly per-process, and `generateForSeries` is reachable concurrently from the 03:30 cron, from three HTTP paths in `gameSeries.service.ts` (`:528`, `:991`, `:1136`) and from `gameSeriesCarryOver.service.ts:177`.
- **Exploit / failure scenario:** node A's cron and node B's series-edit request both generate the 2026-10-06 occurrence. Both `createGame` calls commit and both blast the city-wide "new game" push and drain the play-intent match queue. Node B's stamp fails with `P2002` and deletes its game. Every matching play-intent user in the city has now been pushed about a game that no longer exists; the tap deep-links to a 404. Even single-node, a second request arriving while the cron holds the in-flight set is not blocked — the set only guards the same `seriesId` in the same process.

### [MAJOR] The monthly-recap low-activity sweep terminates after the first page

- **Where:** `Backend/src/services/recap/monthlyRecapPass.ts:104` (`if (userIds.length < batchSize) break;`) with `Backend/src/services/recap/recapInputs.loader.ts:57-81`
- **Defect:** `findLowActivityUserIdsForMonth` fetches exactly `limit` rows and *then* filters out anyone who played last month, so it routinely returns fewer than `limit` while more pages remain. `sweep` treats any short page as "last page".
- **Exploit / failure scenario:** the first 200-row page contains 4 users who also played last month → 196 returned → `196 < 200` → the sweep breaks. Every lapsed user whose id sorts after that point gets no "come back" recap and no push. In the degenerate case where one page is entirely users who played last month the function returns `[]` and the low-activity sweep does nothing at all. `monthKey` changes next month, so there is no catch-up. (Related, lower severity: `cursor` is taken from the *filtered* list at `:78`, so pages overlap — harmless only because `generateMonthlyRecap` is idempotent.)

### [MAJOR] `GameStatusScheduler` has no re-entrancy guard, and PRD 357 added the weather sweep to it

- **Where:** `Backend/src/services/gameStatusScheduler.service.ts:28-38`
- **Defect:** unlike all three *new* schedulers (`gameSeriesScheduler.service.ts:34`, `costShareReminderScheduler.service.ts:27`, `monthlyRecapScheduler.service.ts:55`), this class has no `running` flag. PRD 357 stacked `sendWeatherAlerts()` — up to 600 games across two windows, each with a serial per-recipient push + preference query + Telegram HTTP call — on top of an already-unbounded `updateGameStatuses` (`:67-94`, every non-archived game with a timezone lookup and an `update` each) and a `pastGames` query that scans every game ever played (`:255-264`).
- **Exploit / failure scenario:** once one tick exceeds 30 minutes, node-cron fires the next callback concurrently. Two sweeps read `weatherAlertState` for the same game before either persists, which — given the send-then-persist ordering above — produces a duplicate roster-wide alert with no crash required. The header comment's claim that "every game passes through each window exactly once" is also wrong on its own terms: `alertWindowBounds` (`weatherRisk.ts:282-294`) produces a 1-hour-wide window against a 30-minute cadence, so a game can be in-window on two consecutive ticks and only the persisted state prevents the duplicate.

### [MAJOR] A freed seat can push the same play-intent user twice

- **Where:** `Backend/src/services/game/participant.service.ts:249-256`
- **Defect:** `leaveGame` fires both `PlayIntentMatchService.onPublicGameSlotsOpened(gameId)` (deduped on `PlayIntentNotificationDelivery.eventKey = GAME_MATCHES_INTENT:<gameId>`) and `GameSeatService.seatOpened(...)`, whose `INTENT`-kind recipients come from the *same* `intentMatchesGame` predicate (`spotOpenedIntentRecipients.ts:77-92`) but with an independent `SpotOpenedDelivery` dedupe. Neither knows about the other.
- **Exploit / failure scenario:** a public game is created **full** — `onPublicGameCreated` returns early at `playIntentMatch.service.ts:141` (`openSlots <= 0`) without recording an `eventKey`. A player later leaves. `onPublicGameSlotsOpened` now fires `GAME_MATCHES_INTENT` (no prior `eventKey` to suppress it) and `notifySpotOpened` fires `GAME_SPOT_OPENED` — the same user gets two pushes about the same seat, seconds apart. This is the headline PRD 347 scenario.

### [MAJOR] The automatic cost-share reminder sweep can starve

- **Where:** `Backend/src/services/gameCost/costShareReminder.service.ts:218-242`
- **Defect:** the `due` query takes 50 rows **with no `orderBy`**, and games that have already been claimed still satisfy the `where` (`costFrozenAt` in the 24 h–7 d window, `costShares: { some: { confirmedAt: null } }`) for the rest of that window, so they keep occupying the batch.
- **Exploit / failure scenario:** more than 50 games sit in the 6-day window at once (routine at any real volume — a game stays eligible for six days). Postgres returns the same physical-order 50 rows each hourly tick; all 50 are already claimed, `claimCostReminder` returns false, `continue` fires 50 times and nothing else is ever reminded. The feature silently stops working for every game past the first 50, with no error and no log.
- **Invariant violated:** none documented; this is a correctness defect. An `orderBy: { costFrozenAt: 'asc' }` plus excluding already-claimed games (or a persisted `remindedAt` column in the `where`) closes it.

### [MINOR] `requireLedger` mutates before it authorizes

- **Where:** `Backend/src/services/gameCost/gameCost.service.ts:448-455`
- **Defect:** `syncGameCostShares(gameId)` — which creates/deletes `GameCostShare` rows, writes `Game.costPayerId` (`:169-172`) and emits `game-cost-updated` into the game room — runs before `canViewCostShares(ctx)` throws 403.
- **Exploit / failure scenario:** any authenticated user calls `GET /api/games/<anyGameId>/cost-shares`, gets a 403, and has nonetheless caused a write and a socket emit on a game they have no relationship to. The 404-vs-403 split is also a game-existence oracle. Low impact because the writes are idempotent and derive the correct values, but authorization should precede side effects.

### [MINOR] `noteNoShow` is not atomically idempotent — duplicate pushes and chat lines

- **Where:** `Backend/src/services/gameAttendance/gameAttendance.service.ts:306-334`
- **Defect:** `findFirst` → `if (!alreadyNoted)` → `update` with no conditional write.
- **Exploit / failure scenario:** two concurrent `POST /games/:id/participants/:userId/no-show` (limiter allows 30/min) both observe `alreadyNoted === false`; the target receives two `GAME_NO_SHOW_NOTED` pushes and two `USER_NOTED_NO_SHOW` chat system messages. The row and the counters are unaffected (counters recompute). `updateMany({ where: { id, noShowNotedAt: null } })` with a count check closes it.

### [MINOR] The non-Redis cost-reminder fallback is not atomic and evicts long-TTL claims with a short TTL

- **Where:** `Backend/src/services/gameCost/costReminderDedupe.ts:41-50` (`pruneReminderState`), `:56-65` (`claimInState`), `:104-112`
- **Defect:** three problems on the same fallback path. (a) `claimInState` passes the *caller's* `ttlMs` to `pruneReminderState`, which applies that one TTL to **every** entry in the shared map — even though auto claims use 7 days and manual claims use 24 h. (b) The claim is a read-modify-write over one `PlatformSetting` row with no lock, and `getSetting` is served from a **60-second per-node cache** (`platformSetting.service.ts:106-117`). (c) `COST_REMINDER_STATE_MAX_ENTRIES = 200` evicts the oldest *still-live* claims.
- **Exploit / failure scenario:** (a) game G is auto-reminded at T, storing `auto:G → T`. At T+25 h any organizer of any *other* game taps "Remind unpaid"; that call prunes with `ttlMs = 24h` and drops `auto:G` as expired. On the next hourly sweep G is re-claimable and its players get a second automatic settle nudge. (b) two nodes running the `0 * * * *` cron both read a state without G and both claim it. (c) with >200 live claims in the 7-day window, evicted games are re-reminded every hour until they age out. Only the Redis `SET NX PX` path is actually atomic, so the two paths do not offer the same guarantee.

### [MINOR] Live-notify claim is never released on send failure

- **Where:** `Backend/src/services/live/liveGameNotify.service.ts:130` vs `:144-165`
- **Defect:** `claimDelivery` writes the `LiveGameNotifyDelivery` row, then a `sendNotification` failure at `:162-164` is logged and swallowed with no `delete`.
- **Failure scenario:** the dedupe key is `(userId, gameId)` for the lifetime of the game, and the transition site is one-shot (`matchLiveScoring.service.ts:377-401` fires only on the `NONE → IN_PROGRESS` edge), so a single FCM blip permanently drops that follower's notification. The sibling spot-opened path *does* release on transient failure (`spotOpenedNotify.service.ts:116-118` / `spotOpenedDelivery.service.ts:49-57`) — this is an inconsistency, not a deliberate policy.

### [MINOR] `acceptSeat`'s in-transaction capacity re-check buys nothing

- **Where:** `Backend/src/services/gameSeries/gameSeriesCarryOver.service.ts:371-393`
- **Defect:** the `count` inside `prisma.$transaction` runs at READ COMMITTED and takes no row locks, so it is the same check-then-act as the pre-check at `:371`. There is no DB-level capacity constraint.
- **Failure scenario:** two regulars tap "I'm in" from their pushes at the same instant; both read `live = 3 < 4` and both insert, over-seating the occurrence. The normal join path has the same exposure, so this is house behaviour rather than a regression — but the code's structure implies the in-transaction re-check is the safety net, and it is not.

### [MINOR] `closeExpiredSeries` uses a UTC cutoff against club-local day keys

- **Where:** `Backend/src/services/gameSeries/gameSeriesGeneration.service.ts:378-388` vs the per-series check at `:219-229`
- **Defect:** the bulk `updateMany` computes its cutoff in UTC while the per-series path uses the club-local day key.
- **Failure scenario:** for a club west of UTC, a series is flipped to `ENDED` while its final local day is still in progress, suppressing that day's occurrence and every prompt attached to it.

### [MINOR] Weather's "quiet" branch bumps `Game.updatedAt` on every tick, extending the cost-freeze window

- **Where:** `Backend/src/services/weather/weatherAlert.service.ts:316-318`; consumed by `Backend/src/services/gameCost/costShareReminder.service.ts:202`
- **Defect:** the no-alert branch still issues a `game.update` for every outdoor game in either window just to refresh `lastEvaluatedAt`, which bumps `updatedAt`.
- **Failure scenario:** `updatedAt: { gte: freezeCutoff }` is a predicate in the cost-freeze query, so weather evaluation keeps unrelated games inside the 7-day freeze window and they keep consuming slots in the 50-row freeze batch.

### [MINOR] The two new delivery tables have no pruner

- **Where:** `SpotOpenedDelivery` and `LiveGameNotifyDelivery` (`prisma/schema.prisma:4289`, `:4304`)
- **Defect:** both carry a `createdAt` index suggesting a pruner was intended, but rows are only removed by cascade when the game or user is deleted. `SpotOpenedDelivery` grows by (recipients × seat-open events) forever. Compare `pruneExpiredMonthlyRecaps` (`story.prune.service.ts:78-107`), which *is* wired into the recap pass.

### [MINOR] Spot-opened intent lookup is an unbounded per-event scan

- **Where:** `Backend/src/services/gameSeat/spotOpenedIntentRecipients.ts:43-60`
- **Defect:** unbounded `findMany` over every `OPEN` play intent in the city, with `user.sportProfiles` included, on **every** leave / kick / substitution / capacity increase.

### [MINOR] Monthly recap is record-then-send with no retry

- **Where:** `Backend/src/services/recap/monthlyRecapPass.ts:85-97`
- **Defect:** the `MonthlyRecap` row is created, then `deps.notify` is called; a throw (or a process death in between) is counted as a failure, and the 2nd/3rd-of-month catch-up runs take the `!outcome.created` branch at `:88` and stay silent by design.
- **Failure scenario:** the recap exists on the profile and the rail but the user is never told it is there. Defensible for a monthly digest, but it is a genuine one-way drop.

### [MINOR] Withdrawing a re-purchased item skips the refund

- **Where:** `Backend/src/services/shop/shopPurchase.service.ts:217-226`
- **Defect:** idempotency is "this user already has *a* `REFUND` `TransactionRow` for this `goodsId`", which is a lifetime check, not a per-withdrawal check.
- **Exploit / failure scenario:** admin withdraws item X (user refunded) → admin re-activates X → user buys X again → admin withdraws X again. `alreadyRefunded > 0`, so the `UserGoods` row is deleted and **no** refund is issued. The user paid twice and was refunded once.

### [MINOR] Cost-share override amount is unbounded

- **Where:** `Backend/src/services/gameCost/gameCost.service.ts:510-513`
- **Defect:** an override is validated only as `Number.isFinite(...) && >= 0`, then `Math.round`ed into `GameCostShare.amountCents`, which is a Postgres `int4`.
- **Exploit / failure scenario:** an organizer `PUT`s `{"overrides":[{"userId":"…","amountMinor":1e15}]}`; the Prisma write throws an unmapped error and the endpoint answers 500 instead of a 400. A value just under `2^31` is accepted and rendered as a real share.

### [MINOR] Gifting bypasses the block relationship

- **Where:** `Backend/src/controllers/shop.controller.ts:73-120`, `Backend/src/services/shop/shopPurchase.service.ts:77-95`
- **Defect:** `recipientUserId` is validated only as "a string that is not the buyer" and "an active user"; `BlockedUser` is never consulted.
- **Exploit / failure scenario:** a blocked user gifts their target a cheap catalogue item; the target receives a `GOODS_GIFT_RECEIVED` push carrying the blocked user's first and last name (`shop.controller.ts:106-114`). Repeatable once per catalogue item, at the attacker's own coin cost.

### [MINOR] `/clubs/:id/*` rate-limit key generator is dead code, and `/regulars` caches unbounded attacker-chosen keys

- **Where:** `Backend/src/routes/clubPublic.routes.ts:32,35-38`; `Backend/src/services/clubPublic/clubPublicRegulars.service.ts:52,120` + `Backend/src/utils/ttlCache.ts`
- **Defect:** the limiter is registered *before* `optionalAuth`, so `(req as AuthRequest).userId` is always `undefined` and the per-user branch never fires — the whole endpoint shares one 120/min bucket per IP. Separately, `getClubRegulars` caches by raw `clubId` in a `TtlCache` with no max size and no sweep, and `clubPublic.controller.ts:41-45` does not verify the club exists or is active (unlike the sibling `/public` and `/public-games` handlers, which `findFirst({ isActive: true })` and 404).
- **Exploit / failure scenario:** an unauthenticated loop over random 64-char ids at 120/min inserts a permanent empty-array cache entry per id and runs a `groupBy` over `GameParticipant` each time. `onboarding/cityStats.service.ts` solves exactly this with `CITY_STATS_CACHE_MAX_ENTRIES`; the same guard is missing here. A delisted club's regulars also stay enumerable after `/public` starts 404ing.

### [MINOR] `GET /rankings/pairs` has no rate limit and re-scans a whole city per page

- **Where:** `Backend/src/routes/pairRanking.routes.ts:27` + `Backend/src/services/pairStat/pairRanking.service.ts:377-402,443`
- **Defect:** the only new list endpoint without a limiter, and with `period=10|30` it walks every counted game in the city/sport window through `forEachPairDetectionGameBatch` (fat rows: `rounds → matches → teams → players` + `outcomes`) with no cache, re-running the full scan for every page because paging is `ordered.slice(offset, …)`.
- **Exploit / failure scenario:** one authenticated account loops `GET /api/rankings/pairs?period=30&cursor=…` across cities; each request is a full window scan. The cursor `offset` is validated non-negative but not upper-bounded, so `OFFSET 10^9` is reachable on the materialized path.

### [MINOR] Pair surfaces do not filter blocked users, unlike their sibling PRDs

- **Where:** `Backend/src/services/pairStat/pairRanking.service.ts` (no `blockedUser` reference anywhere) vs `clubPublicRegulars.service.ts:104-114` and `onboarding/suggestedUsers.service.ts:67-89`, both of which do the bidirectional filter; helper is `social-graph/socialGraph.block.ts`.
- **Failure scenario:** a viewer who blocked X still sees X's name and avatar in `GET /rankings/pairs`, `GET /rankings/pairs/:pairId` and `GET /users/:userId/partners`. Two surfaces built in the same wave treat this as load-bearing; the pairs surface does not.

### [MINOR] `refreshPairStatsForPairs` is an unbounded all-time scan in the results-finalization path

- **Where:** `Backend/src/services/pairStat/pairStat.service.ts:186-189`, awaited from `Backend/src/services/results/outcomes.service.ts:1072`
- **Defect:** `gameOutcome.findMany({ where: { userId: { in: userIds }, game: pairCountedGameWhere() } })` has no `take` — it loads *every* counted outcome row for all eight players, on every single results finalization.
- **Failure scenario:** a roster of long-tenured players (500+ games each) makes every "save final score" request drag several thousand rows plus a batched re-read of the intersecting games. It is correctly wrapped in try/catch and post-commit, so it cannot corrupt anything — but it is unbounded latency on the hottest write in the app, growing with account age.

### [MINOR] Live-notify fan-out is unbounded and serial

- **Where:** `Backend/src/services/live/liveGameNotify.service.ts:109-112` and `:129-165`
- **Defect:** `userFavoriteUser.findMany` with no `take` over every follower of every `PLAYING` participant, then a serial `for` loop doing `await claimDelivery()` + `await sendNotification()` — two round trips per recipient.
- **Failure scenario:** a game with a popular player goes live; the loop issues 2N sequential round trips for N followers with no concurrency cap, on the same tick as the rest of the scheduler's work.

---

## Verified safe

Things I read end-to-end and found genuinely correct:

**Money**
- `referralReward.service.ts` — the only currency-minting path. The `ReferralReward.referredUserId` unique claim row is inserted **before** any coins move, P2002 short-circuits, a total failure releases the claim and a partial success keeps it. Correctly post-commit from `recalculateGameOutcomes`, never inside the outcomes transaction, and `onGameFinalizedForReferral` swallows every error so a referral problem cannot disturb a finalized result.
- `referralAbuse.ts` / `checkReferralEligibility` — rules evaluated at both conversion *and* payout; empty fingerprint values are dropped so "two accounts with no device id" do not look like a match; the cap excludes revoked rows; `referralAbuseErrorKey` collapses all identity overlaps to one message so the endpoint does not confirm the existence of a second account.
- **Backend independently validates the referral code** (explicitly in scope per the brief): `linkToApp.attributionParse.ts` runs `normalizeReferralCode` on the inbound `ref`, and `linkToApp.service.ts:180-183` resolves it through `resolveReferrerUserId` (which requires `isActive`) before `attachReferrer`. The frontend value is never trusted.
- `attachReferrer` — first-touch enforced by `updateMany({ where: { referredByUserId: null } })`, mirroring `mergeAttributionFirstTouch`; the 7-day window applies to the link path as well as manual entry; the attribution row's `referrerUserId` is likewise write-once.
- `purchaseGoods` — the `UserGoods` unique index (`create`, not `upsert`) is a real idempotency key for same-item double taps; wallet debit, `Transaction`, `TransactionRow` and `UserGoods` are one atomic unit; the premium gate is server-side and evaluated on the **owner**, never the client. (The cross-item overdraft above is the one hole.)
- `refundGoodsOwners` — per-owner atomic units, `stillOwned` re-read inside the transaction, refund skipped when a REFUND row already exists.
- **`goods.routes.ts` is now fully `requireAdmin`** — the live pre-existing hole flagged in CONTRACT §1 (any signed-in player could create/reprice/delete catalogue items) is closed on every verb including the reads.
- `requireShopEnabled` returns a plain 404, so the flag-off state is indistinguishable from "no such feature".

**Idempotency / scheduling**
- **All four required unique constraints exist** in `schema.prisma`: `Game.@@unique([seriesId, seriesOccurrenceDate])` (`:875`), `MonthlyRecap.@@unique([userId, monthKey])` (`:4222`), `SpotOpenedDelivery.@@unique([userId, gameId, dayKey, kind])` (`:4289`), `LiveGameNotifyDelivery.@@unique([userId, gameId])` (`:4304`). No `upsert` is used anywhere a unique-constrained `create` was needed in the new dedupe paths.
- `SpotOpenedDelivery` (`gameSeat/spotOpenedDelivery.service.ts:32-42`) is `create` + catch `P2002`, the claim precedes the send (`spotOpenedNotify.service.ts:76-83`), and the transient/permanent split with `releaseSpotOpenedDelivery` is a sound compromise. `seatIsStillOpen` (`:148-159`) revalidates before *every* attempt and correctly uses `canMutateGameRoster` (`resultsStatus`), not `Game.status`.
- `MonthlyRecap` idempotency is done right: `recap.service.ts:186-205` is `create` + catch `P2002` + re-read, and `created: false` is precisely what suppresses the 2nd/3rd-day duplicate push.
- `claimCostReminder` uses Redis `SET NX PX` on the production path, and the manual "Remind unpaid" takes its claim *before* dispatch (drop-on-crash rather than double-send).
- `GameSeatService.seatOpened` and `seatOpenedFromInviteDecline` never throw; `runSeatOpened` re-derives the seat count from the database rather than trusting the caller, so a trigger that did not actually free a seat is a no-op. Every call site uses `void` (`participant.service.ts:256/517`, `admin.service.ts:225`, `participantSubstitution.service.ts:151`, `update.service.ts:1097`, `invite.service.ts:648`), `sendWithBackoff` never throws, and `selectAutoFillCandidate` treats a thrown gate check as a rejection.
- Every post-commit hook in `recalculateGameOutcomes` (`onGameFinalizedForAttendance`, `refreshPairStatsForGame`, `onGameFinalizedForReferral`, the series carry-over `setImmediate`) swallows its own errors, so no analytics/notification failure can reach the organizer's "save results" request. Each was checked individually.
- `refreshAttendanceCounters` **recomputes** with `count()` instead of incrementing, so re-running a hook or a scheduler tick cannot double-count.
- All three new schedulers are instantiated *and* `stop()`ped in `server.ts` (`:118-126`, `:183-185`), and all three carry the `running` re-entrancy flag the old ones lack.
- Series generation is bounded and DST-correct: `horizonDays` 7–60, `weekday` 1–7, `seatDeadlineHours` ∈ {24,48,72}, `MAX_OCCURRENCES_PER_PASS = 64`; `gameSeriesOccurrenceDates.ts` works in integer epoch-days and local `HH:mm`, touching a real instant only in `occurrenceStartUtc` via `fromZonedTime`. `generateForAllActiveSeries` is keyset-cursored, the recap pass is cursor-paged `groupBy`, and the weather sweep caps at 300 games per window with an explicit `orderBy`.
- `gameSeries.service.ts:485-528` correctly runs `generateForSeries` **after** its `$transaction` commits rather than inside it.
- `notifyFollowersGameWentLiveInBackground` is genuinely fire-and-forget off the live-scoring write path (`matchLiveScoring.service.ts:399-401`), so a follower push can never fail a score patch.

**Authorization / exposure**
- `PUBLIC_CLUB_SELECT` / `projectPublicClub` (`clubPublic.projection.ts`) — whitelist `select`; `integrationConfig` and `integrationType` are read only to derive a `booking` boolean and destructured away before serialization; `ptMeta`, `normalizedName`, `originalAvatar`, `externalCourtId` are never selected. `findPublicClubContractIssues` is a genuine second belt. This is the endpoint CONTRACT §1 called the highest-risk new surface and it is done right.
- `getClubPublicGames` guest path — `viewerId = ''` makes the private branch of `buildVisibilityOr` match nothing, `isAdmin`/`showPrivateGames` are hard-coded false, enrichment is off for guests. No private or unapproved-`EVENT` game can enter the list.
- `clubPublicToday` returns only hour buckets; no provider URL, external court id, game name or participant reaches the payload; `NSPADELSUPABASE` is correctly not merged.
- `resolvePublicReferrer` projects to exactly `firstName` + `avatar` and requires `isActive`; the endpoint is rate-limited 60/15min per client key over a 32^8 code space.
- `LIVE_RAIL_WHERE` is one shared object applied unconditionally and first, used by the rail query, the single-game read, the enricher, `liveRailGameIdsForUsers` and the token mint, and asserted in `liveGamesFilter.test.ts`. `liveGameNotify`'s follower query filters blocks in **both** directions and re-checks visibility after load.
- All four onboarding routes are authenticated, rate-limited and keyed off `req.userId` — no path-param IDOR. `suggestedUsers` excludes blocks in both directions plus self and existing follows, and uses `USER_SELECT_WITH_SPORT_PROFILES` (no phone/email/telegramId/wallet).
- PRD 346's core prohibition holds: zero writes to `level`, `reliability`, `ratingUncertainty`, `approvedAtLevel` or `LevelChangeEvent` anywhere under `services/gameAttendance/`. Every participant write goes through `buildAnswerUpdate` / `buildNoShowNoteUpdate` / `buildNoShowUndoUpdate`, each calling `assertAttendanceUpdateIsSafe` against a four-field allow-list. `noteParticipantNoShow` verifies the target is a `PLAYING` participant *of that game*, so `noShowCount` cannot be corrupted from outside the roster; self-noting is blocked.
- `POST /games/:id/attendance` has no `canAccessGame` middleware, but the service does require a `PLAYING` `GameParticipant` — a stranger **cannot** set attendance on an arbitrary game. (The error ordering does leak game existence and `timeIsSet`/`status` to a non-participant holding a leaked cuid; low.)
- `keepAsPlanned` (`weatherAlert.service.ts:531-542`) requires `role in [OWNER, ADMIN]` on both the HTTP route (`canEditGame`) and the Telegram `wx:` callback path. `noteMovedIndoor` likewise.
- Push action tokens: `signPushInviteActionToken` **and** `verifyPushInviteActionToken` both enforce the kind→action matrix, so a `game` token can never carry `keep` and fall through to "decline". The `team` and `game` branches survived the widening. Every Telegram callback (`sr:`, `at:`, `wx:`, `pi:`) resolves the acting user from `ctx.telegramId`, never from the callback payload.
- `/rankings/pairs/recalculate` is `authenticate + requireAdmin`; pair-leaderboard `limit` is clamped to 50; raw SQL uses `Prisma.sql` parameters throughout.
- Series *writes* other than `addRegular`/`ensureSeriesChat` are correct: `updateSeries`, `endSeries`, `skipOccurrence`, `undoSkip` all call `assertSeriesOwner` first. `mergeGameSeriesTemplate` iterates fixed allow-lists and never spreads the patch, so `body.template` cannot set `ownerId`, `sport`, `entityType`, `clubId` or `startTime`.
- Series and cost mutation locks use `resultsStatus`, not `Game.status`: `gameSeriesEditScope.ts:59,86`, `createSeriesFromGame` (`gameSeries.service.ts:427`), `acceptSeat` (`gameSeriesCarryOver.service.ts:340`), and `Game.costFrozenAt` keyed off `resultsStatus === 'FINAL'`.

**Contract conformance**
- All six new socket events use the `game-${gameId}` room and kebab-case names; `socketEmitFacade` no-ops before init and never throws into a caller's transaction.
- `FIND_CARD_GAME_SELECT` additions are all slim scalars, none caught by the forbidden-key guardrails; the enricher registry runs every enricher with an individual `.catch`, so one bad PRD cannot break Find. The `attendanceSummary` enricher explicitly returns `null` unless the viewer is `PLAYING` in that game.
- `NOTIFICATION_TYPE_TO_PREF` is complete for all ten new types and matches CONTRACT §5.1 exactly; `SEND_WEATHER_ALERTS` has its enum value, Prisma column, `DEFAULT_PREFERENCES` entry and `countTrue`/`flagsFromRow` wiring.
- The Telegram callback regex is now `/^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/`, closing the pre-existing `uti`/`sip` gap, and an unknown prefix answers the callback query instead of surfacing grammy's generic error.
- `PlatformSetting` admin write is `requireAdmin` + key-pattern + length validated.
- `recap` share/export are scoped to `req.userId`, rate-limited 20/h, and `resolveSharedSlides` rejects any slide key not in the owner's own payload (capped at 12).

---

## Not verified

- **Nothing was executed.** Every finding is from source reading; no request was issued, no test run, no query plan inspected. The concurrency findings (shop overdraft, cost-share double-pay, `noteNoShow`, `acceptSeat`, `weatherAlertState` lost update) are reasoned from Prisma's default READ COMMITTED isolation and the absence of a unique constraint or row lock, not reproduced.
- The cost-reminder **starvation** finding depends on Postgres returning a stable arbitrary order for an unordered `take: 50`. The absence of `orderBy` is certain; the resulting order is not guaranteed by the planner, so starvation could be intermittent rather than permanent.
- The `costReminderDedupe` findings apply only when `getRedisClient()` returns null. `CLAUDE.md` lists Redis in the stack, so this may be a degraded-mode path only — I did not confirm whether production ever runs without it.
- The double-push finding (spot-opened + play-intent) is confirmed at the code-path level; I did not establish how often a public game is created already full, which is its precondition.
- Frontend was out of scope entirely: no check of whether the client mirrors any of these server gates, and no check of the PRD 351 localStorage boundary (explicitly excluded).
- `recapSlideImage.renderer.ts` (sharp/PNG rendering) was not audited for resource exhaustion or font/SVG injection beyond confirming the slide-key allow-list and the 12-slide cap.
- Admin-only surfaces (`adminReferral.service.ts`, `ShopAdminService`, `rebuildPairStats`) were read for gating but not for correctness under a hostile admin; `rebuildPairStats` deletes all `PairStat` rows for its scope before rebuilding non-transactionally, so the pair leaderboard is empty/partial for the duration — flagged here rather than as a finding since it is an operator action.
- I did not verify whether `GET /users/:userId/partners` is consistent with the platform's (apparently absent) profile-privacy model — `User` has no `isPrivateProfile` column, so "private profile filtering" reduces to `isActive`/`nameIsSet`.
