# Live scoring

Phone/web board: `/games/:id/live?matchId=`. TV: `/games/:id/live/tv` or `?tv=1`. Broadcast: `/games/:id/live/broadcast` and `/games/:id/broadcast`. Pages: `GameLiveRoute`, `GameLiveMatchPage`, `GameBroadcastRoute`, TV/broadcast redirects.

Requires `resultsStatus === IN_PROGRESS` for writers. EVENT has no live (`assertEventForbidsResults`).

## Board

Full-screen per match: score / undo; serve setup + serve guide; strict officiating (kitchen fault pickleball, let-replay badminton, tie-break change-ends); timed-set freeze/unlock; optional decider sheet; golden point / deuce from game config.

**Match timer:** `matchTimer.service.ts` — start/pause/resume/stop/reset. Only while results IN_PROGRESS. Cap minutes from `Game.matchTimedCapMinutes`. Socket `match-timer-updated`. Cap push. Watch HealthKit workout via `gameWorkout.service` / watch outbox.

**TV** (`?tv=1`): minimal chrome, light/dark (`parseLiveBoardTheme`). **Broadcast:** shareable spectator URLs.

**Spectator:** `spectatorToken` query. Guests load `GET /results/game/:gameId/spectator?st=`. Authenticated scorers mint via `resultsApi.mintLiveSpectatorToken`. Share URLs stamp the token (`useLiveMatchShareUrls`). Token length cap 4096.

Wake: `useWakeScreenForLiveScoring` (`KeepAwake`). Offline: local apply then `persistLiveScoringPatch`; failed/non-409 save sets refresh; board keeps last local state until server wins.

## Dual writer (phone + watch)

Watch app: `Frontend/ios/App/BandejaWatch Watch App/` + `BandejaWatchShared`. Phone bridge: `liveScoringBridge` / `watchBridgeInit.ts`. Watch score → `lastWatchLiveScoringHint` → phone refreshes that match. Phone/socket live + timer relayed to watch (`match-live-scoring-updated`, `match-timer-updated`).

Both writers PATCH the same envelope. Stale `baseRevision` → **409** `Live scoring revision mismatch` (`matchLiveScoring.service.ts`). Client: apply server envelope if present, else refresh + `gameDetails.liveScoring.syncConflictRetry`. `opId` / `clientMessageId` on patch.

Watch session: `PATCH /games/:id/my-session` (`watchSession.service.ts`). Widgets: Next Game, Live Active Match.

## Engine

BE rulebook: `Backend/src/services/results/liveScoringEngine/rulebook.ts` (`getRules`). FE: `Frontend/src/liveScoring/registry.ts` (`resolveLiveScoringPlugin`) + `Frontend/src/utils/liveScoring` + `Frontend/src/utils/scoring`.

`GameType`: CLASSIC, AMERICANO, MEXICANO, ROUND_ROBIN, WINNER_COURT, LADDER, KOTC, CUSTOM.

`MatchGenerationType`: HANDMADE, AUTOMATIC, FIXED, RANDOM, ROUND_ROBIN, ESCALERA, RATING, WINNERS_COURT, KING_OF_COURT. No `SWISS` enum — `TT_SWISS_BOX` / `swissPairing.ts` re-export escalera.

`ScoringPreset`: classic BO3/BO5, Fast4, pro/short/single/super TB, timed, rally POINTS_*, BEST_OF_*_11/15/21, PAR_11, SINGLE_GAME_21, CUSTOM. Strict ids in createTemplates.

FE plugin `uiId`: padel-court, tennis-court, americano-points, table-tennis/badminton/pickleball/squash boards.

## Code

- BE: `matchLiveScoring.service.ts`, `liveSpectator.service.ts`, `matchTimer.service.ts`, `results.routes.ts`, `liveScoringEngine/`
- FE: `useLiveMatchController.ts`, `useLiveMatchBoardState.ts`, `persistLiveScoring.ts`, `Frontend/src/components/liveScoring/`, `Frontend/src/pages/GameLive*.tsx`
- Watch: `Frontend/ios/App/BandejaWatch*`
