# Plan: migrate off `User.level` / `User.reliability` to per-sport data

Per-sport source of truth: `UserSportProfile` (`level`, `reliability`, `gamesPlayed`, `gamesWon`).

Helpers already in place:
- Backend: `resolveUserSportSnapshot`, `projectUserForSportContext`
- Frontend: `getDisplayLevelForSport`, `findSportProfile`, `gamesPlayedForSport`

Global `User` columns remain for padel transition / dual-write / legacy API shape (`USER_SELECT_FIELDS`).

Related: `docs/PLAN_MULTISPORT_QUESTIONNAIRES.md` (ADR-Q5 reliability fallback, ADR-Q13 `User.level` sunset, level history §17), `docs/PLAN_SPORT_RATING_MODELS.md` (canonical Elo + per-sport display bridges). **Unified execution hub** → [`PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md`](./PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md) (track R2a).

---

## API contract (target)

- **`BasicUser.level` / `.reliability`**: level for **context sport** when returned from game-scoped APIs (after `projectUserForSportContext`). Callers must not assume padel `User.level`.
- **Profile payloads**: prefer `sportProfiles[]`; top-level `level` / `reliability` / `gamesPlayed` / `gamesWon` on `User` are legacy until sunset.

---

## P0 — wrong sport context (fix first)

### Frontend

| File | Change |
|------|--------|
| [x] `Frontend/src/components/DateSelectorWithCount.tsx` | Replace `user.level` with `getDisplayLevelForSport(user, gameSport)` (same as `MonthCalendar.tsx`, `AvailableGamesSection.tsx`). **Done:** `userLevelMatchesGameBand` + `parseGameSport`. |
| [x] `Frontend/src/components/profile/CompetitiveSocialLevelBadge.tsx` | Reliability: `findSportProfile(user, sport)?.reliability`, not `user.reliability`. **Done:** `getReliabilityForSport` (profile-first). |
| [x] `Frontend/src/components/LevelHistoryAvatarSection.tsx` | Drop `user.reliability` fallback; profile only or `0`. **Done.** |
| [x] `Frontend/src/components/sportQuestionnaire/SportQuestionnaireContent.tsx` | `resolveLevelFromUser`: `getDisplayLevelForSport(user, sport)` instead of `user.level` for PADEL. **Done.** |
| [x] `Frontend/src/components/welcome/WelcomeQuestionnairePrompt.tsx` | Display via `getDisplayLevelForSport(user, 'PADEL')` or profile. **Done.** |
| [x] `Frontend/src/components/GameDetails/TrainingResultsSection.tsx` | Row: `getDisplayLevelForSport(participant.user, game.sport)`; edit modal: level/reliability from `fullUserProfile.sportProfiles` for `game.sport`, not top-level fields. **Done:** `resolveTrainingEditDefaults` + `getUserStats(..., gameSport)`. |
| [x] `Frontend/src/utils/sportQuestionnaire.ts` | Remove PADEL-only `user?.level` / `user.gamesPlayed` fallbacks; use `getDisplayLevelForSport` / `gamesPlayedForSport`. **Done.** |

### Frontend — verify projection at source

These use `player.level` / `u.level` / `u.reliability` on `BasicUser`; OK only if upstream API projected by sport:

| File | Notes |
|------|--------|
| [x] `Frontend/src/components/playerInvite/inviteEntries.ts` | **OK:** invitable-players API uses `projectUserForSportContext` when `gameId`/`sport` set; team averages prefer sport-projected levels from invitable `players` list when member is listed. |
| [x] `Frontend/src/hooks/useLiveMatchBoardState.ts` | **Fixed:** `liveBoardPlayersForTeam` prefers sport-projected level from `game.participants`; `getGameResults` now projects match players by `game.sport` (spectator + refresh paths). |
| [x] `Frontend/src/components/PlayerListItem.tsx` | **OK:** invite list uses sport-projected `BasicUser`. |
| [x] `Frontend/src/components/PlayerAvatar.tsx` | **OK:** game/invite paths pass sport-projected `BasicUser.level`. |

Invite/game paths already use `projectUserForSportContext`; audit any non-game invite list.

### Backend API — results (live board / spectator)

| File | Change |
|------|--------|
| [x] `Backend/src/services/results.service.ts` (`getGameResults`) | Load `sportProfiles` on nested users; `projectGameUsersForSportContext` before return (auth + spectator). |

### Backend API — training & profile stats

| File | Change |
|------|--------|
| [x] `Backend/src/controllers/user/stats.controller.ts` (`getUserStats`) | Optional `?sport=`; return sport-projected stats or require clients to use `sportProfiles`. |
| [x] `Frontend/src/api/users.ts` | Pass `sport` to `getUserStats` from training flow. **Done:** optional `sport` param; training edit passes `gameSport`. |

---

## P0b — new / niche surfaces

| Area | Files | Change |
|------|--------|--------|
| **Stories** | [x] `Backend/src/services/story/story.feed.service.ts`, [x] `story.events.ts` | `toBasicUser` uses `USER_SELECT_FIELDS.level`; project by story/game `sport` before exposing `BasicUser`. |
| **League planner** | [x] `Backend/src/services/league/planner.service.ts` | Participants loaded with `USER_SELECT_FIELDS` only; select `LeagueSeason.sport` and `projectUserForSportContext` for planner sample users. |
| **Level history game embeds** | [x] `Backend/src/controllers/levelChange.controller.ts` | `?sport=` filters events, but `getGameInclude()` nests users with raw `USER_SELECT_FIELDS` — project by `game.sport` in response. |
| **Head-to-head** | [x] `Backend/src/controllers/user/stats.controller.ts` (`getPlayerComparison`) | `otherUser` is global; games mix sports; nested users unprojected. Add sport filter or per-sport breakdown. |
| **Profile W/L buckets** | [x] `Backend/src/services/user/userGameOutcomeStats.service.ts` | `getUserGameOutcomeAggregates` sums all `GameOutcome` across sports; used by `getUserStats` + comparison. Add `sport` filter or per-sport aggregates. |
| **Level history UI** | `Frontend/src/components/LevelHistoryView.tsx` | [x] Competitive tab is per-sport; `gamesStats` refetch with `?sport=` per selected sport tab. |

---

## P1 — global-only backend systems

| Area | Files | Change |
|------|-------|--------|
| [x] Leaderboard `sport=all` | `Backend/src/controllers/ranking.controller.ts` | `orderBy` on `User.level` / `User.reliability` / `User.gamesPlayed`. Decide product rule; rank via per-sport snapshots. |
| [x] Social leaderboard | Same controller | Global `gamesPlayed`, `reliability` on `User` — per-sport or stay global? |
| [x] Reliability idle decay | `Backend/src/services/reliabilityDecay.service.ts` | Reads/writes `User.reliability`, `User.gamesPlayed`, `reliabilityDecayPostGraceDaysApplied`. Per-sport profiles or padel-only until sunset. |
| [x] Admin | `Backend/src/services/admin/users.service.ts`, `Admin/app.js`, `Admin/modals.js` | Per-sport level edit/display; stop writing only `User.level`. Admin also shows global `gamesPlayed` / `gamesWon`. |
| [x] User merge | `Backend/src/services/user/userMerge.service.ts` | Merge `UserSportProfile` per sport; do not treat global `reliability` / `gamesPlayed` / `gamesWon` as sole truth. |

---

## P2 — dual-write / sunset `User.level`, `User.reliability`, global counts

| File | Change |
|------|--------|
| [x] `Backend/src/services/training.service.ts` | Removed PADEL `User.level` / `reliability` dual-write; profile-only. Kept `reliabilityDecayPostGraceDaysApplied` reset on User (padel-only decay, no profile field). |
| [x] `Backend/src/services/user/userSportProfile.service.ts` | `resolveUserSportSnapshot`: padel-only fallback to `User.*` when `sportProfiles` key absent or profile row missing; other sports → default snapshot. |
| [ ] `Backend/src/utils/constants.ts` | **Deferred:** `USER_SELECT_FIELDS` still selects global `level` / `reliability` (~50+ readers; many need projection, not removal). Strip after column sunset + reader audit. |
| [x] `Backend/scripts/backfillWelcomeScreenPassed.ts` | Uses `resolveUserSportSnapshot(user, PADEL)` with padel profile select. |
| [ ] `Backend/scripts/backfillPadelQuestionnaireFromWelcome.ts` | One-time; copies `User.level` / `reliability` into profiles — do not re-run after sunset. |
| [x] `Frontend/src/types/index.ts` | JSDoc `@deprecated` on top-level `level` / `reliability` / `gamesPlayed` / `gamesWon`. Auth store unchanged (reads same API shape). |

**P2 remaining for full sunset (ADR-Q13):** drop `User` rating columns from schema; remove `reliabilityDecayPostGraceDaysApplied` from `User` or move to profile; stop `reliabilityDecay` / admin legacy reads; strip `USER_SELECT_FIELDS` global stats; remove frontend padel fallbacks in `profileSports.ts` / `sportQuestionnaire.ts`; social leaderboard `User.gamesPlayed` filter in ranking controller.

### Global `gamesPlayed` / `gamesWon` (parallel migration)

| File | Change |
|------|--------|
| [ ] `Frontend/src/utils/profileSports.ts` | `gamesPlayedForSport` → `user.gamesPlayed` padel fallback — remove at sunset. |
| [ ] `Frontend/src/utils/sportQuestionnaire.ts` | Same for `user.gamesPlayed`. |
| [ ] `Backend/src/controllers/ranking.controller.ts` | Social branch `gamesPlayed: { gt: 0 }` on `User`. |

### `reliabilityDecayPostGraceDaysApplied`

Only on `User` today (decay + padel training undo). Decide: per `UserSportProfile` or stay global with padel-only decay.

---

## P3 — naming clarity (already sport-correct if mapped) [x]

These use `.user.level` but input is usually **sport-projected** via `mapPrismaForGeneration` → `projectUserForSportContext`:

| File | Notes |
|------|-------|
| [x] `Backend/src/services/results/generation/escalera.ts` | File comment: `user.level` = level for `game.sport` after projection. |
| [x] `Backend/src/services/results/generation/winnersCourt.ts` | Same. |
| [x] `Backend/src/services/results/generation/gameStandings.ts` | Same. |
| [x] `Backend/src/services/results/generation/rating.ts` | Same. |
| [x] `Frontend/src/services/gameStandings.ts` | Same. |
| [x] `Frontend/src/types/index.ts` | `BasicUser.level` JSDoc. |

Optional: rename gen field to `sportLevel` — deferred; documented instead.

`Backend/src/services/telegram/results-html.service.ts` — projects outcomes first; OK.

`Backend/src/services/results/calculator.service.ts` — uses `player.level` from `outcomes.service` snapshot; OK.

---

## Intentional fallbacks (keep until sunset, then remove)

| File | Notes |
|------|-------|
| `Frontend/src/utils/profileSports.ts` | `getDisplayLevelForSport` → `user.level` when no profile and sport is PADEL or primary; `resolveProfileHeaderLevel` → `user.level` if no enabled sports. |
| `Backend/src/controllers/user/settings.controller.ts` | `setInitialLevel` → `upsertPadelSportProfileFromUser` only (no `User.level` write). |
| `Backend/src/services/user/userSportProfile.service.ts` | `upsertPadelSportProfileFromUser` — name legacy; only `UserSportProfile`. |
| `Backend/src/services/user/sportQuestionnaire.service.ts` | Questionnaire writes profile only; padel `User` update is `welcomeScreenPassed` flag only. |

---

## Already migrated (reference)

- `outcomes.service.ts` — `UserSportProfile` + `resolveUserSportSnapshot` for calculator players
- `participantValidation.ts` — join level check via sport snapshot
- Game/invite/social — `projectUserForSportContext` in `game/read.service.ts`, `invite.service.ts`, `participant.service.ts`, `social.controller.ts`, etc.
- Sport leaderboard — `resolveUserSportSnapshot` in `ranking.controller.ts` / `ranking.service.ts`
- `league/create.service.ts` — season sport level for roster stats
- `results-telegram.service.ts` — sport snapshot for display
- Frontend find/create — `getDisplayLevelForSport` in `CreateGame`, `AvailableGamesSection`, `MonthCalendar`, `PlayerAvatarView`, `ProfileLeaderboard` (API-dependent)
- Bets / marketplace backend — no `user.level` usage found

---

## `USER_SELECT_FIELDS` audit (process)

~50+ files `select: USER_SELECT_FIELDS`. Not all need changes — only where **level / reliability / games counts** affect UX or business rules without projection.

```bash
rg "USER_SELECT_FIELDS" Backend/src
```

For each hit: if UI shows level badge or logic filters by level → require `sportProfiles` + `projectUserForSportContext` or `resolveUserSportSnapshot` for known sport.

---

## QA matrix

| Scenario | Expected source | Verified |
|----------|-----------------|----------|
| Find games filter (tennis) | Tennis profile level | [x] `profileSports.test.ts`, `findSportFilter.test.ts` |
| Date selector count filter | Same as calendar (`getDisplayLevelForSport`) | [x] P0 frontend + `profileSports.test.ts` |
| Training edit (tennis game) | Tennis profile level + reliability | [x] `profileSports.test.ts` |
| Story bubble (tennis game) | Tennis profile level | [x] `multisport-trust-patches.ts` source audit |
| League planner (tennis season) | Tennis profile level | [x] `multisport-trust-patches.ts` source audit |
| Leaderboard sport = TENNIS | Tennis snapshot | [x] `multisport-phase1.ts` |
| Leaderboard sport = all | Primary sport snapshot (fallback PADEL) | [x] `multisport-trust-patches.ts` |
| Profile competitive tab + history | Selected sport | [x] P0b LevelHistoryView + stats `?sport=` |
| Profile W/L 30/90/all tabs | Per-sport aggregates | [x] `multisport-trust-patches.ts` |
| Compare two users | Per-sport or split | [x] stats controller sport filter (source audit) |
| Reliability badge (multi-sport profile) | Sport profile `reliability` | [x] `profileSports.test.ts` |
| Reliability decay | Padel-only on profile + dual-write | [x] `multisport-trust-patches.ts` |
| Live board / spectator match levels | `game.sport` profile level | [x] `getGameResults` projection + `multisport-trust-patches.ts` |
| Invite team level averages | Sport-projected member levels | [x] `inviteEntries` projectedPlayers fallback |

---

## Tests to update after changes

- [x] `Frontend/src/utils/profileSports.test.ts` — tennis filter band, training edit defaults, reliability per sport
- [x] `Frontend/src/utils/sportQuestionnaire.test.ts` — tennis unrated uses profile gamesPlayed not global
- [x] `Backend/scripts/tests/multisport-questionnaire-q0.ts` — snapshot invariants, addUserSport
- [x] `Backend/scripts/tests/multisport-trust-patches.ts` — P0b/P1 source audits + snapshot unit tests
- [x] `Backend/scripts/tests/run-all.ts` — 39 suites green (2026-05-24 QA reintegration)
- Add: story feed, league planner level (backend integration tests beyond source audit — optional)

---

## Schema & data sunset

- Prisma `User.level` / `User.reliability` / `gamesPlayed` / `gamesWon` kept until dual-write removed (ADR-Q13).
- Initial backfill: `Backend/prisma/migrations/20260519120000_multisport_phase0/migration.sql` (profiles from `User.level`).
- Before column drop: one-time sync job padel `User` ↔ `UserSportProfile` (PADEL), verify no writers left.

---

## Open product decisions

1. **Leaderboard `sport=all`**: primary sport snapshot per user (fallback PADEL) — implemented.
2. **Social leaderboard**: per-sport when sport param set; primary sport when omitted — implemented.
3. **Reliability decay**: padel-only on `UserSportProfile` with dual-write to `User` — implemented.
4. **`reliabilityDecayPostGraceDaysApplied`**: stays global on `User` (padel-only decay) — implemented.
5. **`User.level` / `User.reliability` column removal** date (ADR-Q13, ADR-Q5).
6. **Compare / profile stats**: single cross-sport view vs sport-scoped only?

---

## Orchestrator status (QA reintegration)

| Phase | Status | Completed | Notes |
|-------|--------|-----------|-------|
| P0 frontend + stats API | Done | 2026-05-24 | All P0 frontend rows marked [x] |
| P0 projection verify (invite/live) | Done | 2026-05-24 | `getGameResults` sport projection; team invite `projectedPlayers` fallback |
| P0b niche surfaces | Done | 2026-05-24 | Stories, league planner, level history, W/L aggregates |
| P1 global backend | Done | 2026-05-24 | Leaderboards, decay, admin, merge |
| P2 dual-write sunset | Pending | — | `training.service`, `USER_SELECT_FIELDS`, types, backfill scripts |
| P3 naming clarity | Optional | — | Gen services already sport-correct via projection |

**QA run 2026-05-24:** Backend lint OK; `test:automated` 39/39; Frontend lint OK; `test:live-scoring` 67/67; `sportQuestionnaire.test.ts` 5/5.

**Fixes this pass:** `resolveUserSportSnapshot` padel-only legacy fallback (q0 + trust-patches); `getGameResults` → `projectGameUsersForSportContext`; invite team averages via projected invitable players.

**Remaining gaps (P2/P3 sunset only):** dual-write removal; global `gamesPlayed`/`gamesWon` column sunset; `reliabilityDecayPostGraceDaysApplied` per-profile decision; optional backend integration tests for story feed / league planner levels (beyond source audit).

**Gap patches 2026-05-24:** `getRoundResults`/`getMatchResults` sport projection; user-team invite API `?gameId=`/`?sport=` + frontend wiring; `basicUsersForMessage` chat sport projection; user DM chat `user1`/`user2` projected by primary sport.

---

## Suggested order of work

1. [x] P0 frontend + training stats API + projection verify (invite/live).
2. [x] P0b stories, league planner, level history embeds, profile aggregates.
3. [x] P1 leaderboards + reliability decay + admin + merge.
4. P2 dual-write removal + `USER_SELECT_FIELDS` cleanup + types.
5. P3 optional gen-type rename / docs only.
