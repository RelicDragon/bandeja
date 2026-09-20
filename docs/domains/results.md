# Results

`Game.resultsStatus`: **`NONE` → `IN_PROGRESS` → `FINAL`**. Drives live scoring, photo gallery, bets lock, court web cameras. EVENT forbids results (`assertEventForbidsResults`). BAR has no manual results entry (auto on FINISHED). TRAINING uses finish/undo, not the match board. LEAGUE_SEASON has no embedded match entry (fixtures do).

## Entry

`GameResultsEntryEmbedded` when `resultsStatus !== NONE` (not BAR/TRAINING/season hub). Start on ANNOUNCED requires confirm. Reset all / finish / edit FINAL = danger confirms.

Writers: `canModifyResults` — owner/admin, or `resultsByAnyone` + participant; parent season roles inherit. Routes: `Backend/src/routes/results.routes.ts` (`requireCanModifyResults`).

Live board: [live-scoring.md](./live-scoring.md). Match types/presets: schema `GameType` / `ScoringPreset` / `MatchGenerationType`; generation under `Backend/src/services/results/generation/` (RR, random, KOTC, winners court, escalera/swiss-box, swiss re-export, fixed, rating, teammate pairs).

## Outcome explanation

Per player: `GET /results/game/:gameId/outcome/:userId/explanation`. `outcomeExplanation.service.ts` — rating delta breakdown (expected, margin, reliability/uncertainty, endurance). FE modal on results.

`GameOutcome` / `RoundOutcome`. Recalc: `POST .../recalculate`. Reset: `POST .../reset` (also deletes `PlayerLevelEvaluation` rows).

## Sync conflict

`SyncConflictModal` (`GameResultsModals.tsx`): local vs server results diverge — load-from-server vs push-local. Separate from live-scoring **409 revision** ([live-scoring.md](./live-scoring.md)).

## Artifacts / Replicate

Background queue: `gameResultsArtifactQueue.service.ts`. Summary + photo (`prepareResultsArtifactSummary` / `Photo` on `game.controller.ts`). Admin picks Replicate model (`replicatePhotoModelSetting.service.ts`, Platform Settings). Telegram post block when ready (`sendResultsToTelegram`). The summary is Markdown (LLM-written, organizer-editable) — `telegramMarkdown.ts` converts it to Telegram HTML (`**bold**`, `_italic_`, `#` headings, `- ` bullets, links, code) before posting, so caption/message length is measured on the rendered text, not the tags. Share results card with optional generated photo (`GameResultsShareCard`).

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

- BE: `Backend/src/services/results.service.ts`, `Backend/src/services/results/` (`outcomes.service.ts`, `outcomeExplanation.service.ts`, `calculator.service.ts`, `matchLiveScoring.service.ts`, `barResults.service.ts`), `gameStatusScheduler.service.ts`, `utils/gameStatus.ts`
- FE: `Frontend/src/components/gameResults/`, `GameDetails/GameResults*.tsx`, `SyncConflictModal.tsx`
- Artifacts: `Backend/src/services/gameResultsArtifact/`
