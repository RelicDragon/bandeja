# Live scoring

Phone/web board: `/games/:id/live?matchId=`. TV: `/games/:id/live/tv` or `?tv=1`. Broadcast: `/games/:id/live/broadcast` and `/games/:id/broadcast`. Pages: `GameLiveRoute`, `GameLiveMatchPage`, `GameBroadcastRoute`, TV/broadcast redirects.

Requires `resultsStatus === IN_PROGRESS` for writers. EVENT has no live (`assertEventForbidsResults`).

## Board

Full-screen per match: score / undo; serve setup + serve guide; strict officiating (kitchen fault pickleball, let-replay badminton, tie-break change-ends); timed-set freeze/unlock; optional decider sheet; golden point / deuce from game config.

**Match timer:** `matchTimer.service.ts` — start/pause/resume/stop/reset. Only while results IN_PROGRESS. Cap minutes from `Game.matchTimedCapMinutes`. Socket `match-timer-updated`. Cap push. Watch HealthKit workout via `gameWorkout.service` / watch outbox.

**TV** (`?tv=1`): minimal chrome, light/dark (`parseLiveBoardTheme`). **Broadcast:** shareable spectator URLs.

**Spectator:** `spectatorToken` query. Guests load `GET /results/game/:gameId/spectator?st=`. Authenticated scorers mint via `resultsApi.mintLiveSpectatorToken`. Share URLs stamp the token (`useLiveMatchShareUrls`). Token length cap 4096.

Wake: `useWakeScreenForLiveScoring` (`KeepAwake`). Offline: local apply then `persistLiveScoringPatch`; failed/non-409 save sets refresh; board keeps last local state until server wins.

## Watching a live game (the "Live now" rail)

Live scoring already produced a broadcast page; the rail makes it discoverable. The whole feature hangs off **one** predicate:

```
LIVE_RAIL_WHERE = { resultsStatus: 'IN_PROGRESS', isPublic: true, showOnLiveRail: true }
```

It lives in `Backend/src/services/game/availableGamesStructuralWhere.ts` and is applied through `appendStructuralFiltersToWhere(where, { liveOnly: true })`. **Do not inline these three conditions anywhere else** — five surfaces read it and they must agree exactly:

| Surface | Entry point |
|---------|-------------|
| Find / Home rail | `GET /api/live/games` → `listLiveGames()` |
| Game-details **Live** block | `GET /api/live/games/:id` → `findLiveRailGame()` |
| Spectator token mint | `POST /api/live/games/:id/spectator-token` |
| Telegram `/live` | `listLiveGames()` called **in process**, never over HTTP |
| Follower live push | `notifyFollowersGameWentLive()` re-checks all three |

**Load-bearing.** A private game, a finished game, or a game whose organizer switched `Game.showOnLiveRail` off must never produce a rail card, a live summary or a spectator token. The spectator endpoint answers a plain `404` for all three so it cannot be used to probe whether a private game exists. The toggle itself is in [games.md](./games.md).

### The live summary

`LiveGameSummary` is the compact score payload the rail renders. It is derived — never stored — from the live-scoring envelope already in `Match.metadata.liveScoring`.

| Field | Meaning |
|-------|---------|
| `matchId` | the match the spectator token is signed for |
| `courtName` | the match's court, falling back to the game's |
| `currentSet` | 1-based index of the set being played |
| `sides` | exactly two, side 1 first; each has `players`, `setScores`, `currentGameScore`, `leading` |
| `startedAt` | ISO; renders as "Started 23 min ago" |
| `revision` | **monotonic**, straight off the envelope |

`setScores` covers every set up to *and including* the running one, so the rail shows `6–4 3–2` rather than only completed sets. `currentGameScore` is the point inside the current game (`'40'`, `'AD'`, a tie-break number) and is empty for `points`-mode sports, which have no sub-game score.

**`revision` is not decoration.** The rail merges `match-live-scoring-updated` frames locally and **drops any frame whose revision is not strictly greater** than what is on screen; without it an out-of-order frame would roll the score backwards, and the same guard stops a background refetch overwriting a newer socket frame. Derivation lives in two mirrored files that must change together: `Backend/src/services/game/liveGameSummary.ts` (pure, no Prisma) and `Frontend/src/features/live/liveSummaryUpdate.ts` (pure, socket merge). A game with several boards resolves to the match whose envelope was touched most recently, with the highest match number as the tie-break.

### Ordering, caps and gating

`Backend/src/services/game/liveRailOrder.ts`: the viewer's own live game first (it carries a "You" tag), then fixtures of league seasons the viewer takes part in, then start time ascending. Find shows at most 10 cards, Home at most 3, any requested limit clamped to 20. There is no "follow a season" model in the schema — "followed season" is read as *the viewer is a non-withdrawn `LeagueParticipant` in that season*.

Home shows the rail only when the viewer has **no game of their own today**, computed in the viewer's *city* day ([home-and-find.md](./home-and-find.md)).

### Spectator access from the rail

The organizer-only mint (`POST /results/game/:gameId/matches/:matchId/live-spectator-token`, `requireCanModifyResults`) was **not** widened. A second, narrower endpoint signs the *same* token type and only for a game that passes `LIVE_RAIL_WHERE`. It runs under `optionalAuth` — a shared broadcast link has to work for a signed-out viewer, and the gate is what protects the data, not the session — and is rate limited to 60 mints per 15 minutes per client. Existing tokens keep working until they expire (the pre-existing 48 h contract), so turning `showOnLiveRail` off stops new mints rather than revoking issued links.

Follower push (`FOLLOWED_USER_LIVE`, once per recipient per game, ever): [notifications.md](./notifications.md).

## Dual writer (phone + watch)

Watch app: `Frontend/ios/App/BandejaWatch Watch App/` + `BandejaWatchShared`. Phone bridge: `liveScoringBridge` / `watchBridgeInit.ts`. Watch score → `lastWatchLiveScoringHint` → phone refreshes that match. Phone/socket live + timer relayed to watch (`match-live-scoring-updated`, `match-timer-updated`).

Both writers PATCH the same envelope. The base-revision check, idempotency check, set writes and envelope update share one database transaction under the game lock. Stale `baseRevision` → **409** `Live scoring revision mismatch` (`matchLiveScoring.service.ts`). Client: apply the newer server envelope, or refresh when it carries a manual-correction tombstone, and show `gameDetails.liveScoring.syncConflictRetry`. `opId` / `clientMessageId` on patch. A manual correction retains an incremented envelope with `state: null`; revision never resets to zero. Null socket clear messages trigger a server read rather than seeding from cached scores. HTTP refreshes and save replies cannot lower the displayed revision.

Watch merge rule (`MatchScoringViewModel`): a newer foreign saved score wins over unacknowledged local taps. The watch cancels the stale queue and adopts the newer score; it does not automatically replay old edits onto that score. Own in-flight echoes wait for acknowledgement so they do not count points twice. A manual-correction tombstone cancels pending taps and loads its authoritative set scores before another save. Non-409 rejections (400 invalid sets / out of graph, 403) also re-sync to the server. The watch mirrors server auto-advance: completed rally games and the empty optional-decider row are stepped onto before the PATCH so the state stays inside the transition graph.

Authorization on the watch mirrors `canModifyResults` (`WatchResultsPermissions`): owner/admin (any real roster status, game or parent) may score every court; `resultsByAnyone` players only their own; everyone else sees the board read-only. Platform admins pass via the `isAdmin` JWT claim.

Watch session: `PATCH /games/:id/my-session` (`watchSession.service.ts`). Widgets: Next Game, Live Active Match.

## Engine

BE rulebook: `Backend/src/services/results/liveScoringEngine/rulebook.ts` (`getRules`). FE: `Frontend/src/liveScoring/registry.ts` (`resolveLiveScoringPlugin`) + `Frontend/src/utils/liveScoring` + `Frontend/src/utils/scoring`.

`GameType`: CLASSIC, AMERICANO, MEXICANO, ROUND_ROBIN, WINNER_COURT, LADDER, KOTC, CUSTOM.

`MatchGenerationType`: HANDMADE, AUTOMATIC, FIXED, RANDOM, ROUND_ROBIN, ESCALERA, RATING, WINNERS_COURT, KING_OF_COURT. No `SWISS` enum — `TT_SWISS_BOX` / `swissPairing.ts` re-export escalera.

`ScoringPreset`: classic BO3/BO5, Fast4, pro/short/single/super TB, timed, rally POINTS_*, BEST_OF_*_11/15/21, PAR_11, SINGLE_GAME_21, CUSTOM. Strict ids in createTemplates.

FE plugin `uiId`: padel-court, tennis-court, americano-points, table-tennis/badminton/pickleball/squash boards.

## Code

- BE: `matchLiveScoring.service.ts`, `liveSpectator.service.ts`, `matchTimer.service.ts`, `results.routes.ts`, `liveScoringEngine/`
- Live rail: `Backend/src/services/game/liveGames.service.ts`, `liveGameSummary.ts`, `liveRailOrder.ts`, `routes/liveGames.routes.ts`; `Backend/src/services/live/liveGameNotify.service.ts`
- FE rail: `Frontend/src/features/live/`
- FE: `useLiveMatchController.ts`, `useLiveMatchBoardState.ts`, `persistLiveScoring.ts`, `Frontend/src/components/liveScoring/`, `Frontend/src/pages/GameLive*.tsx`
- Watch: `Frontend/ios/App/BandejaWatch*`
