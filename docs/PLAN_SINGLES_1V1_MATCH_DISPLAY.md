# Singles (1v1) match display audit

Audit of UI components that show match sides / rosters. Goal: every surface that shows **2v2** should also work for **1v1** when `game.playersPerMatch === 2`.

**Status:** Complete for web app scope. Shared `matchFormat` module + all audited UI/engine/league surfaces updated.

---

## DRY — one formula, many consumers

### Canonical concepts

| Concept | Meaning | Singles example (`ppm=2`, roster=2) |
|---------|---------|-------------------------------------|
| `playersPerMatch` | Players on court per match (2 or 4) | 2 |
| `playersPerTeam` | `playersPerMatch / 2` | 1 |
| `maxFixedTeamSlots` | `#` of fixed teams for roster | 2 teams × 1 player |
| `maxPlayersPerTeam` | Max roster slots **per side** in a match UI | 1 |

Resolution priority (display + validation): **`game.playersPerMatch`** → **`participantCount === 2`** → **sport default**.

### Where logic lives

| Layer | Implementation | Status |
|-------|----------------|--------|
| **Shared** | `Frontend/shared/matchFormat.ts` ↔ `Backend/src/shared/matchFormat.ts` | ✅ canonical API |
| **Frontend barrel** | `Frontend/src/utils/matchFormat.ts` — `export * from '@shared/matchFormat'` + UI-only helpers | ✅ |
| **Backend generation** | `Backend/src/services/results/generation/matchUtils.ts` re-exports shared | ✅ |
| **Deleted** | `Frontend/src/utils/fixedTeamSlotCount.ts` | ✅ removed |

**Shared API** (use these names everywhere; no duplicate aliases):

```ts
playersPerMatchOf(game)           // 2 | 4
playersPerTeamOf(game)            // 1 | 2  (= ppm / 2)
maxFixedTeamSlots(game)           // floor(maxParticipants / playersPerTeam)
maxPlayersPerTeamForGame(game, participantCount?)  // display + validation cap
```

**Frontend-only** (`Frontend/src/utils/matchFormat.ts`):

```ts
syncPlayersPerMatchOnRosterChange(...)  // create/edit roster ↔ ppm
teamSideSlotsFull(match, team, maxPerTeam)
capPlayerIds(ids, maxPerTeam)
```

**Other frontend utils** (unchanged paths):

```ts
resolveLeagueGameCardTeams(game)       // leagueGameCardTeams.util.ts
liveBoardPlayersForTeam(...)           // useLiveMatchBoardState.ts
```

**Rules for new code**

1. No `players.length === 2 ? 1 : 2` or hardcoded `length === 2` for match format.
2. No `team.players.length === 2` for readiness — use `playersPerTeamOf`.
3. UI slot loops: `Array.from({ length: maxPlayersPerTeam }, …)`, not `[0, 1]`.
4. Readiness: slot indices filled (`match[team][i]`), not raw array length (stale IDs).
5. Import from `@/utils/matchFormat` (or `@shared/matchFormat` in shared-only code) — never revive `fixedTeamSlotCount` or duplicate names like `maxFixedTeamSlotsForGame`.

**Parity tests**

- `Backend/src/shared/matchFormat.test.ts`
- `Frontend/src/utils/matchFormat.test.ts` (same numeric table)
- Included in `Backend/scripts/tests/multisport-deferred-officiating.ts` run-all bundle

---

## Done — supports 1v1

### Match / results UI

| Component | Path | Notes |
|-----------|------|-------|
| MatchCard | `Frontend/src/components/gameResults/MatchCard.tsx` | `maxPlayersPerTeamForGame` |
| HorizontalMatchCard | `Frontend/src/components/gameResults/HorizontalMatchCard.tsx` | same + cap |
| HorizontalScoreEntryModal | `Frontend/src/components/gameResults/HorizontalScoreEntryModal.tsx` | `capPlayerIds` |
| AvailablePlayersFooter | `Frontend/src/components/gameResults/AvailablePlayersFooter.tsx` | `teamSideSlotsFull` |
| RoundAddedModal | `Frontend/src/components/gameResults/RoundAddedModal.tsx` | dynamic avatars |
| PlayerStatsMatchDetails | `Frontend/src/components/gameResults/PlayerStatsMatchDetails.tsx` | dynamic |
| GameResultStoryMatchCard | `Frontend/src/components/stories/slides/GameResultStoryMatchCard.tsx` | dynamic `TeamLine` |
| gameResultsEngine | `Frontend/src/services/gameResultsEngine.ts` | `addPlayerToTeam` + `isPresetResultsRoster` |
| GameResultsEntryEmbedded | `Frontend/src/components/GameDetails/GameResultsEntryEmbedded.tsx` | `isPresetResultsRoster` |
| BracketPlayoffPreview | `Frontend/src/components/GameDetails/BracketPlayoffPreview.tsx` | `maxPlayersPerTeamForGame` via `playersPerMatch` prop |

### League / fixed teams

| Component | Path | Notes |
|-----------|------|-------|
| LeagueGameCard | `Frontend/src/components/GameDetails/LeagueGameCard.tsx` | `resolveLeagueGameCardTeams` |
| LeagueFixedTeamsSection | `Frontend/src/components/GameDetails/LeagueFixedTeamsSection.tsx` | `resolveLeagueGameCardTeams` |
| EditLeagueGameTeamsModal | `Frontend/src/components/GameDetails/EditLeagueGameTeamsModal.tsx` | dynamic slot arrays |
| FixedTeamsManagement | `Frontend/src/components/GameDetails/FixedTeamsManagement.tsx` | `maxFixedTeamSlots` + `playersPerTeamOf` |
| YourLeaguesHomeLeagueGameMatchup | `Frontend/src/utils/leagueHomeGameMatchup.ts` | 1v1 tests |
| LeagueFixtureDetailSheet | `Frontend/src/components/GameDetails/LeagueFixtureDetailSheet.tsx` | maps all team players |
| LeagueBracketSlotCard | `Frontend/src/components/GameDetails/LeagueBracketSlotCard.tsx` | maps all side users |
| League create (Backend) | `Backend/src/services/league/create.service.ts` | `playersPerTeamOf` for fixtures |

### Live / TV

| Component | Path | Notes |
|-----------|------|-------|
| LiveBroadcastBoard | `Frontend/src/components/liveScoring/LiveBroadcastBoard.tsx` | dynamic roster rows |
| LiveTeamPanel | `Frontend/src/components/liveScoring/LiveTeamPanel.tsx` | TV |
| LiveMatchCompleteBanner | `Frontend/src/components/liveScoring/LiveMatchCompleteBanner.tsx` | dynamic |
| LiveScoreShell / registry | `Frontend/src/components/liveScoring/LiveScoreShell.tsx`, `liveScoring/registry.ts` | `playersPerMatch === 4` for doubles serve guide |
| GameBroadcastMatchPage | `Frontend/src/pages/GameBroadcastMatchPage.tsx` | `playersPerMatchOf`, `liveBoardPlayersForTeam` |
| GameLiveMatchPage | `Frontend/src/pages/GameLiveMatchPage.tsx` | same |
| LiveServeSetupCard / ServeCourtSchema | `Frontend/src/components/liveScoring/` | `matchDoubles` from `playersPerMatch` |

### Tests

- `Frontend/src/utils/matchFormat.test.ts` — parity + helpers
- `Frontend/src/utils/leagueGameCardTeams.util.test.ts` — `resolveLeagueGameCardTeams`
- `Frontend/src/hooks/useLiveMatchBoardState.test.ts` — `liveBoardPlayersForTeam`
- `Frontend/src/components/liveScoring/LiveBroadcastBoard.test.ts` — serve-row singles
- `Backend/src/shared/matchFormat.test.ts`
- `Backend/src/services/results/generation/matchUtils.test.ts`

**Preset roster helper:** `isPresetResultsRoster` in `Frontend/src/utils/gameResultsHelpers.ts` (2 or 4 playing participants → single-round preset init).

---

## Probably OK / context-dependent

| Item | Notes |
|------|-------|
| Fixed teams + 2-player roster | Create flow resets fixed teams when roster = 2; gap only if singles + fixed teams combined intentionally |
| Bracket playoff seeds | May remain doubles-by-design |

---

## Other platforms

### Watch (iOS)

**Done.** Scoring/serve UI branches on `isDoublesMatch`; results entry supports 2- or 4-player preset rosters via `WatchMatchFormat` + `WatchResultsRoundBuilder`. See **[PLAN_WATCH_1V1.md](./PLAN_WATCH_1V1.md)**.

### Backend results artifacts

Use whatever players are on the match; no two-slot UI assumption.

---

## Related docs

- [PLAN_CASUAL_MULTISPORT_UX.md](./PLAN_CASUAL_MULTISPORT_UX.md) — `playersPerMatch` in create flow
- [PLAN_LIVE_SCORING_SYNC_AND_TV_MODE.md](./PLAN_LIVE_SCORING_SYNC_AND_TV_MODE.md) — TV/broadcast
- [PLAN_WATCH_1V1.md](./PLAN_WATCH_1V1.md) — Watch roster UI + results entry
- [watch-vs-live-scoring-audit.md](./watch-vs-live-scoring-audit.md) — Watch scoring engine parity
