# Results

`Game.resultsStatus`: **`NONE` → `IN_PROGRESS` → `FINAL`**. Drives live scoring, photo gallery, bets lock, court web cameras. EVENT forbids results (`assertEventForbidsResults`). BAR has no manual results entry (auto on FINISHED). TRAINING uses finish/undo, not the match board. LEAGUE_SEASON has no embedded match entry (fixtures do).

## Entry

`GameResultsEntryEmbedded` when `resultsStatus !== NONE` (not BAR/TRAINING/season hub). Start on ANNOUNCED requires confirm. Reset all / finish / edit FINAL = danger confirms. Finish sits in a sticky bar with match progress; its confirmation summarizes unscored / incomplete matches and ties. Edit FINAL and restart live in the ⋯ beside the results tabs.

Board interaction (`ResultsRoundsBoard`, helpers in `utils/resultsBoardNavigation.ts`): lineups are edited by tapping seats — an empty seat focuses the match and the player tray places into the highlighted side; a placed player opens move / swap / remove. Move, swap (also across matches of one round) and auto-fill are one `GameResultsEngine.setMatchLineups` edit, persisted as one match PUT per changed match. A full match shows **Enter score**; **Save and next** in the score dialog advances to the next set/match. When the next row is in the *same* match it waits for this save to land and opens a fresh draft on the resulting version — it never carries the old draft's `baseVersion` forward.

Writers: `canModifyResults` — owner/admin, or `resultsByAnyone` + participant; parent season roles inherit. Routes: `Backend/src/routes/results.routes.ts` (`requireCanModifyResults`).

Manual set entry (`ScoreEntryModal`, including league fixture cards) owns a draft for the lifetime of the open dialog, including the match version captured when it opens. Background game/results refreshes must not replace entered scores, selected scoring modes, or that original version. Save and Remove set carry it through the write queue. If the match has already changed locally, or the draft opened without a version, reject before changing local scores or storing an offline snapshot; otherwise the server checks the original version atomically. Changes to another court do not invalidate this match's draft. Cancel discards the draft. Reopening, or opening a different match/set, initializes from the latest saved results and version.

## Reading results

`GET /results/game/:gameId` and its `/round/:roundId` and `/match/:matchId` siblings run under `optionalAuth`, because the results tab is reachable by guests on a **public** game (deep links, Telegram, the Live now rail). Two things keep that safe:

- **Authorization** — `assertCanReadGameResults` (`services/results/gameResultsAccess.ts`). Public game → anyone, signed in or not. Private game → a roster member of the game *or of its parent* (a league season shell, for a fixture), or platform staff. Everything else answers **404, not 403**, so the endpoint is not a game-existence oracle. Invites do not count as a roster row.
- **Projection** — `services/results/gameResults.projection.ts` is an explicit `select` whitelist with a machine-readable forbidden list asserted by its test, in the same shape as `availableGamesCard.projection.ts`. The endpoint used to run a top-level `include`, which loaded every `Game` scalar: `paymentHint` (an IBAN or a phone number), `description`, `mediaUrls`, `externalUrl`, `priceTotal`, and every player's `bio` / `weeklyAvailability` / `socialLevel`. `RESULTS_USER_SELECT` is deliberately **not** `USER_SELECT_WITH_SPORT_PROFILES` for that reason. Adding a field here is a deliberate act: the payload is served to spectators holding a signed live token, i.e. to people with no account at all.

The format block (`scoringPreset` … `metadata`) is load-bearing in that whitelist: the frontend derives the whole rulebook from it, and the spectator board has no second source because it never calls `GET /api/games/:id`.

## Post-commit hooks on finalisation

`recalculateGameOutcomes` (`results/outcomes.service.ts`) ends with a tail of hooks that run **after** the transaction commits, never inside it. Everything here is a derived cache, a notification or a grant for people who are not in the game — none of it may widen the transaction's lock footprint, slow down finalisation, or be able to roll a finalized result back. Each hook swallows its own errors.

| Hook | What it does |
|------|--------------|
| `refreshPairStatsForGame` | rebuilds the affected `PairStat` rows (below) |
| attendance counters | recomputes `attendedCount` / `noShowCount` ([social-and-profile.md](./social-and-profile.md)) |
| `onGameFinalizedForReferral` | grants the referral payout on the referred user's first finished game ([economy.md](./economy.md)) |
| series carry-over | creates the next occurrence and sends "Same time next week?" ([games.md](./games.md)) |
| cost freeze | the hourly `CostShareReminderScheduler` sets `costFrozenAt` for games that went FINAL ([economy.md](./economy.md)) |

`deleteGameResults` / `resetGameResults` / `editGameResults` in `results.service.ts` call the pair refresh the same way — and there they must **capture the affected pairs before the transaction**, because those transactions delete `Team` / `TeamPlayer` rows and the generated-format sides would otherwise be gone.

## Pair stats

`PairStat` is a **materialized aggregate, not a rating**. It answers one question — "how often did these two win when they played on the same side?" — and is derived entirely from data the results pipeline already owns. Nothing here feeds `level`, `reliability`, `socialLevel` or any leaderboard other than the Pairs tab. **Pair ELO does not exist and is explicitly out of scope.**

**Ordering invariant.** Every row satisfies `userAId < userBId` (plain lexicographic compare on the cuids, never `localeCompare`). No database constraint enforces it and the unique key is `(sport, cityId, userAId, userBId)`, so writing the mirrored row would silently create a second aggregate for the same two people. Every read and write goes through `orderPairIds` / `tryOrderPairIds` (`services/pairStat/pairKey.ts`), and `writePairAggregates` asserts it before writing.

**What counts** (`services/pairStat/partnerDetection.ts`, pure, no Prisma):

1. `Game.resultsStatus === 'FINAL'` only.
2. `EntityType` is `GAME`, `TOURNAMENT` or `LEAGUE`. `EVENT`, `BAR`, `TRAINING` and `LEAGUE_SEASON` never count.
3. Neutral technical results never count — recognised by the `Game.metadata.technicalWithdrawal === true` / `nonRallyOutcome === 'WALKOVER'` stamp written by `league/leagueNeutralTechnicalResult.ts`. Those fixtures carry no played score.
4. **Fixed teams** (`Game.hasFixedTeams`): "same side" comes from `GameTeam` / `GameTeamPlayer`, and two players on the same fixed team are partners for the whole game regardless of how many matches were played.
5. **Generated formats**: "same side" comes from per-`Match` `Team` / `TeamPlayer` membership, aggregated over the game. A pair counts **at most once per game**, and only when the two were partners in the majority of the matches **they both appeared in**.
6. A win requires **both** members to carry `GameOutcome.isWinner`. A pair whose partner has no `GameOutcome` row is skipped entirely — it cannot be scored.

> Rule 5's denominator is the subtle one. "The majority of that game's matches" taken literally would delete every pair in a multi-court event: in a 12-match, 8-player Americano a fixed duo plays 4 matches together and would score 4/12. Scoping it to matches in which **both** players appeared keeps that pair while a genuinely rotating format still fails (4 players, 3 rounds, partners once each → 1/3), which is exactly the outcome the rule exists to produce.

The aggregate is **recomputed from scratch, never incremented** (`services/pairStat/pairStat.service.ts`). That is what makes applying and reverting a result symmetric for free: a reset deletes the `GameOutcome` rows, the recompute stops seeing that game, and the pair lands back on exactly the totals it had before — no signed deltas to get wrong and no drift after an edit. `refreshPairStatsForGame` never throws; if it fails the result is still correct and the admin rebuild is the repair path.

**Admin rebuild.** `POST /rankings/pairs/recalculate` (`requireAdmin`), optionally scoped to a sport and/or city. It walks counted games in id order 100 at a time, folds each slice into an accumulator that is flushed and cleared before the next slice is read, then backfills `combinedLevel` in batches. Memory is bounded by one slice, so the table may be larger than RAM.

Chemistry, the Pairs tab and its API: [ratings.md](./ratings.md).

Live board: [live-scoring.md](./live-scoring.md). Match types/presets: schema `GameType` / `ScoringPreset` / `MatchGenerationType`; generation under `Backend/src/services/results/generation/` (RR, random, KOTC, winners court, escalera/swiss-box, swiss re-export, fixed, rating, teammate pairs).

## Outcome explanation

Per player: `GET /results/game/:gameId/outcome/:userId/explanation`. `outcomeExplanation.service.ts` — rating delta breakdown (expected, margin, reliability/uncertainty, endurance). FE modal on results.

`GameOutcome` / `RoundOutcome`. Recalc: `POST .../recalculate`. Reset: `POST .../reset` (also deletes `PlayerLevelEvaluation` rows).

## Sync conflict

`SyncConflictModal` (`GameResultsModals.tsx`): local vs server results diverge — load-from-server vs push-local. Separate from live-scoring **409 revision** ([live-scoring.md](./live-scoring.md)).

Results entry distinguishes rejected edits from unavailable requests. Definitive HTTP 4xx rejections (except timeout/rate-limit responses) show the server error and roll back the edit when no other mutation overlaps; they do not disable subsequent saves. Uncertain failures preserve local edits for explicit **Sync to Server**. Background results refreshes must not replace those unsynced edits. The banner says **Unsynced Changes Detected** while the device is online, and **No internet connection** only when the network status reports offline.

### Concurrent scorers and offline edits

The latest **saved** score is authoritative. An older queued edit may not replace it just because its request arrives later. A conflicting scorer loads the latest score and makes a fresh explicit correction; device clocks do not decide ordering.

`GET /results/game/:id` carries an opaque `resultsVersion` on the board and each match. Manual PUT and match-metadata PATCH send the match's original version as `baseVersion`; offline snapshot sync sends the board's original version. Checks and writes share a database transaction and game lock (`resultsConcurrency.ts`), with bracket-round locks acquired first. Missing/stale versions return 409 without altering scores. Versions remain with offline drafts, including Watch queued PUTs. Do not fetch a new version merely to retry an old payload.

Local manual saves are sent in entry order. Pending edits are stored durably with an unacknowledged marker before the network request, so an app restart preserves them even before a network timeout is reported. A healthy Finish flow reads the latest server board instead of uploading a cached whole board. Accepted offline sync reconciles rows in place, retaining unchanged live state, timers, team identities and history. Finalized games reject late score/structure writes until explicitly reopened.

Compatibility: versionless manual PUT, match-metadata PATCH, and full-board sync requests are rejected. Ship the corresponding web/native/Watch client changes with the server protection; older installed clients need an update before manual saves. Existing offline drafts without a baseline version require loading the latest results and re-entering the correction.

## Artifacts / Replicate

Background queue: `gameResultsArtifactQueue.service.ts`. Summary + photo (`prepareResultsArtifactSummary` / `Photo` on `game.controller.ts`). Admin picks Replicate model (`replicatePhotoModelSetting.service.ts`, Platform Settings). Telegram post block when ready (`sendResultsToTelegram`). The summary is Markdown (LLM-written, organizer-editable) — `telegramMarkdown.ts` converts it to Telegram HTML (`**bold**`, `_italic_`, `#` headings, `- ` bullets, links, code) before posting, so caption/message length is measured on the rendered text, not the tags. Share results card with optional generated photo (`GameResultsShareCard`); its primary action after FINAL is **Play with this group again** (PRD 362, see [games.md](./games.md) → Settings).

## BAR auto-results

Scheduler: BAR `ANNOUNCED`/`STARTED` → `FINISHED` → `BarResultsService.setBarResults` (social level events `SOCIAL_BAR`, not ELO). Participant list shows level before/after when FINAL.

## Peer feedback

Anonymous post-FINAL GAME/LEAGUE/TOURNAMENT level verdicts. **Not ELO** — [ratings.md](./ratings.md). `player-level-evaluation.service.ts`.

## Status scheduler

`GameStatusScheduler` (`Backend/src/services/gameStatusScheduler.service.ts`) runs **:00 and :30** hourly **and on startup**. Timezone: club city via `calculateGameStatus` (`Backend/src/utils/gameStatus.ts`).

Verified transitions:

- `timeIsSet === false` → force `ANNOUNCED` (even if stored ARCHIVED)
- `resultsStatus === IN_PROGRESS` → `STARTED`
- In window (started, not ended) → `STARTED`
- Past end + `NONE` → `FINISHED`, **except** results-based types `GAME`/`LEAGUE`/`TOURNAMENT`/`TRAINING` (scheduler skips applying FINISHED)
- `FINAL` → `FINISHED`, then `ARCHIVED` after archive window: 2 club-TZ days after `finishedDate` for GAME/LEAGUE/TOURNAMENT; GAME/TOURNAMENT also ARCHIVED 7 days after `startTime`
- BAR/EVENT/other: archive from end time + `gameStatus.ts` (LEAGUE_SEASON without FINAL not archived by that helper; scheduler **excludes** `LEAGUE_SEASON` rows entirely)

Side effects:

- BAR → FINISHED: auto bar results
- FINISHED / ARCHIVED: cleanup invite participant rows
- LEAGUE fixture FINAL + FINISHED/ARCHIVED: recalculate parent season standings
- Reminders 24h and 2h (±10 min) to PLAYING and Event `lookingForPartner`, types GAME TOURNAMENT BAR TRAINING LEAGUE EVENT, only while `ANNOUNCED` and `timeIsSet`

## Code

- BE: `Backend/src/services/results.service.ts`, `Backend/src/services/results/` (`outcomes.service.ts`, `outcomeExplanation.service.ts`, `calculator.service.ts`, `matchLiveScoring.service.ts`, `barResults.service.ts`, `gameResultsAccess.ts`, `gameResults.projection.ts`), `gameStatusScheduler.service.ts`, `utils/gameStatus.ts`
- Pairs: `Backend/src/services/pairStat/`, `routes/pairRanking.routes.ts`
- FE: `Frontend/src/components/gameResults/`, `GameDetails/GameResults*.tsx`, `SyncConflictModal.tsx`
- Artifacts: `Backend/src/services/gameResultsArtifact/`
