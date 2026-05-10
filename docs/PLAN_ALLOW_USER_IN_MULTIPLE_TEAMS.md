# Plan: `allowUserInMultipleTeams` (game option)

**Execution checklist:** [§15 Full roadmap checklist (todos)](#15-full-roadmap-checklist-todos) — use for step-by-step delivery; **§12** is the test matrix. **Readiness / gates / forks:** [Implementation readiness (verified)](#implementation-readiness-verified) · [§16 Decisions to lock](#16-decisions-to-lock-during-implementation). **Post-implementation review:** [Phase 10 — Hardening / production-readiness](#phase-10--hardening--production-readiness-post-review) (P1 concurrency, P2 semantic quirks, P3 polish).

## Implementation readiness (verified)

- **Safe to start**: the field is not in the repo yet — that is expected. Follow **§13 / §15** (schema → core API → league & sync → frontend → generation → QA).
- **Plan vs code**: touch points match the codebase (`gameTeam.service.ts`, `userTeamFixedTeams.service.ts`, `gameCreation.util.ts` / `createLeagueGame`, `TeamForRoundGeneration.generateGamesForFixedTeamsGroup` + `seasonGame`, `sync.service.ts`, generation under `results/generation/`, `FixedTeamsManagement.tsx`, `TeamPlayerSelector.tsx`).
- **Prisma query shapes**:
  - **`GameTeamService.setGameTeams`** uses `findUnique` with **`include: { participants, rounds }`** — after the column exists, **all `Game` scalars** (including the new boolean) are returned on the parent object; extend logic only, no extra `select` list required for the flag.
  - **`applyUserTeamToFixedTeamsIfReady`** uses **`select: { maxParticipants, hasFixedTeams, rounds, … }`** — you **must** add `allowUserInMultipleTeams: true` to that `select` or the field will be `undefined`.
- **Post-migration discovery**: grep for other logic that assumes at most one fixed-team slot per user per game (e.g. flatten `fixedTeams` → `Set` / unique counts for **business rules** beyond the files named in §14).
- **Release gate (overlap + leagues)**: do **not** ship “full implementation” with overlapping fixed teams for leagues until **§7** (especially sync reuse) **and** **§8.2–8.3** (and standings stance in §8.5) are resolved or explicitly product-gated (e.g. block `WINNERS_COURT` / `ESCALERA` until `teamMap` is fixed).
- **Open decisions** (lock while implementing): see **§16**.

## 1. Goal and semantics

- **Field**: `Game.allowUserInMultipleTeams` — `Boolean`, default **`false`**.
- **When `false` (default)**: Same behavior as today — a user may appear on **at most one** fixed team (`GameTeam`) per game. Backend rejects cross-team duplicates; frontend blocks selection.
- **When `true`**: The same `userId` may appear on **multiple** fixed teams for the same game.
- **Still invalid**: The same user **twice on one team** — blocked by `GameTeamPlayer @@unique([gameTeamId, userId])` in Prisma; validate in `setGameTeams` for clear API errors.

Fixed teams are `GameTeam` + `GameTeamPlayer`. Match rows (`Team` / `TeamPlayer`) are separate; overlap across match sides is a generation concern, not a Prisma uniqueness issue between `GameTeam` rows.

---

## 2. Product scope — **full implementation (including leagues)**

- **Single delivery target**: `allowUserInMultipleTeams` works for **all** `Game` entity types that support fixed teams today — including **`GAME`**, **`TOURNAMENT`**, **`LEAGUE`** (round/match games), **`LEAGUE_SEASON`** (season template game), and any other path that creates or syncs `GameTeam` / league participants.
- **No phased “games only, leagues later” cut**: league creation (`createLeagueGame`), group round generation (`TeamForRoundGeneration`), participant sync (`LeagueSyncService`), playoffs (`createLeaguePlayoffGame`), and UI for league/season settings **must** be implemented and tested in the same rollout (§7, §15 **Phase 5**).
- **Risk**: today’s league stack assumes disjoint rosters; §7 and §8 list required fixes. Shipping without them **corrupts** league data or blocks valid overlap.

---

## 3. Data model and migration

1. Add to `Game` in `Backend/prisma/schema.prisma`:
   - `allowUserInMultipleTeams Boolean @default(false)`
   - Place near `hasFixedTeams` / team-related flags.
2. Generate migration with the project’s standard Prisma workflow (prefer auto-generated migrations per repo rules).
3. Regenerate Prisma client.

---

## 4. Backend: create / update / read

### 4.1 Create

- **`GameCreateService.createGame`**: Read `data.allowUserInMultipleTeams`, default `false`.
- If `maxParticipants === 2` (same rule as `hasFixedTeams`): force **`allowUserInMultipleTeams = false`** on create.

### 4.2 Update

- **`GameUpdateService.updateGame`**: `updateData` is spread from `data`; once the column exists, Prisma persists unknown keys only if they are model fields — ensure clients send the boolean under the correct name.
- When `maxParticipants === 2`: force **`allowUserInMultipleTeams = false`** (with `hasFixedTeams` normalization already present).

### 4.3 Toggling `true` → `false`

- **Validate** before save: if new value is `false`, load current fixed teams; if any `userId` appears in more than one `GameTeam`, **reject** with a clear 400 (or define a destructive cleanup — rejecting is safer and easier to explain).

### 4.4 Read API

- Include `allowUserInMultipleTeams` everywhere **`Game`** is returned for clients that render game details, lists, and chat context (`read.service` and any serializers used by game GET / update response if relied upon for full game shape).

---

## 5. Backend: `GameTeamService.setGameTeams` (core)

**File**: `Backend/src/services/gameTeam.service.ts`

1. Keep the same `prisma.game.findUnique` shape as today (`include: { participants, rounds }`). After the column exists on `Game`, Prisma returns **all scalar fields** on the parent (including `allowUserInMultipleTeams`) together with included relations — no extra `select` needed unless you refactor the query for other reasons.
2. **Cross-team uniqueness**:
   - If `!game.allowUserInMultipleTeams`: keep current check — `allPlayerIds.length === uniquePlayerIds.size`, error `A player cannot be in multiple teams`.
   - If `game.allowUserInMultipleTeams`: **skip** global uniqueness.
3. **Within-team uniqueness**: For each `teamNumber`, ensure `playerIds` has no duplicate strings before `create` (clear 400; DB would throw otherwise).
4. **Participant membership**: Current code checks `game.participants.some(p => p.userId === playerId)` with **no `PLAYING` filter** — keep behavior unless product explicitly wants PLAYING-only.
5. **`teamsReady` vs this check**: `GameReadinessService` loads participants with **`where: { status: 'PLAYING' }`** and requires every fixed-team player to appear in that list. A user on a team but only `NON_PLAYING` on the game will **not** get `teamsReady` even if `setGameTeams` accepted them — document or align if product wants.
6. **Leagues**: Same rules as non-league games — do **not** strip or ignore the flag by `entityType`. League-specific **call sites** (§7) must allow overlap when the flag is true and fix sync/generation.

---

## 6. Backend: user-team auto apply

**File**: `Backend/src/services/game/userTeamFixedTeams.service.ts`

- Extend the initial `prisma.game.findUnique` in this file to load **`allowUserInMultipleTeams`** — this file uses an explicit **`select`**, so add `allowUserInMultipleTeams: true` to the `select` object (unlike `GameTeamService.setGameTeams`, which uses `include` and receives all scalars automatically — see **Implementation readiness** above).
- Today: after building `teamsPayload`, if `new Set(allIds).size !== allIds.length` → log skip `player_duplicate_across_teams`.
- **Change**: If `game.allowUserInMultipleTeams === true`, skip that duplicate-across-teams check and call `GameTeamService.setGameTeams` as today.
- Optional: document ordering when manual teams + auto user-team both apply.

---

## 7. League & sync (**required** for full implementation)

These paths **assume** disjoint players across the two sides of a league match or across group teams — they **must** be updated for overlap + flag.

### 7.1 `createLeagueGame`

**File**: `Backend/src/services/league/gameCreation.util.ts` (~123–127)

- Today: throws if team1 and team2 share any user.
- **Required**: When `seasonGame.allowUserInMultipleTeams === true`, **skip** that overlap check; **copy** `allowUserInMultipleTeams` from `seasonGame` onto the created `Game`.

### 7.2 `TeamForRoundGeneration.generateGamesForFixedTeamsGroup`

**File**: `Backend/src/services/league/generation/TeamForRoundGeneration.ts` (~248–251)

- Today: throws `'Fixed teams in a group cannot share players'` when flattened player IDs are not unique across teams.
- **Required**: When season (or source game) has `allowUserInMultipleTeams === true`, **skip** that throw and **revisit** pairing / `getFixedTeamsOpponentUnNoveltyScore` semantics (shared player distorts “opponent” counts).

### 7.3 `LeagueSyncService.syncLeagueParticipants`

**File**: `Backend/src/services/league/sync.service.ts` (~187–234)

- When creating a new `LeagueTeam`, code may **reuse** an existing `TEAM` `LeagueParticipant` by **maximum overlap** of `userId`s, then **reassign** `leagueTeamId` and delete an orphaned `LeagueTeam`.
- With two desired rosters `[p1,p2]` and `[p1,p3]`, the second pass can **steal** the first team’s participant and **delete** the first league team — **data corruption**.
- **Fix (required)**: never reuse a `LeagueParticipant` unless sorted roster is an **exact** match (overlap === length and same pair), or remove overlap-based reuse entirely for team path.

### 7.4 `createLeaguePlayoffGame`

**File**: `Backend/src/services/league/gameCreation.util.ts`

- No cross-team overlap check between different `teams[i]` entries; audit if multi-team playoffs can encode overlaps and align with flag + sync.

### 7.5 `collectDesiredTeamPlayerIds`

**File**: `sync.service.ts`

- Keys are sorted **pairs** of two user IDs — `[p1,p2]` vs `[p1,p3]` remain distinct entries. The bug is **reuse logic**, not key collision (unless two different `GameTeam`s had identical unordered pairs).

---

## 8. Results generation & standings

### 8.1 Opponent / partner metrics (`a === b`)

**Files**: `Backend/src/services/results/generation/matchUtils.ts` (`buildOpponentCounts`, etc.), `random.ts` (`generateFixedTeamMatchups`), and any nested `for (a of teamA) for (b of teamB)` in fixed-team branches of `rating.ts` / `escalera.ts` / `winnersCourt.ts`.

- When the same user can appear on **both** sides of a generated match, those loops can hit **`a === b`**; `pairKey(a, b)` still builds a key.
- **Fix**: `if (a === b) continue` in opponent-style loops (safe even when flag is false).
- This does **not** solve §8.2 by itself.

### 8.2 `playerId → team` maps (Winners Court & Escalera) — **critical**

**Files**:

- `Backend/src/services/results/generation/winnersCourt.ts` — `generateFixedTeamRound` (~841–846): builds `teamMap` with `teamMap.set(playerId, team)` for each player in each fixed team pair. If one user appears on **two** fixed teams, **later assignment overwrites** the map entry; `teamMap.get(winnerPlayers[0])` can resolve to the **wrong** roster for winners/losers propagation.
- `Backend/src/services/results/generation/escalera.ts` — fixed-team path (~755–758, 794–795): **same pattern** and same overwrite risk.

**Required for overlap + these generators**: Do not key “which fixed roster is this?” by **`userId` alone**. Use a stable team identity (`gameTeamId`, `teamNumber`, or index into `fixedTeamPairs`) through round state / match metadata, **or** disallow `matchGenerationType` `WINNERS_COURT` / `ESCALERA` when `allowUserInMultipleTeams` is true until refactored.

### 8.3 Rating fixed-team round — shared player in team totals

**File**: `Backend/src/services/results/generation/rating.ts` — `generateFixedTeamRatingRound` (~365–371)

- Team ordering uses **sum of each member’s** `scoresDelta` from **global** per-user standings. A user on two fixed teams contributes the **same** standing row to **both** team aggregate scores → **double-counting** that player for team ranking vs intent.

### 8.4 `RoundGenerator` automatic first round

**File**: `roundGenerator.ts` — fixed teams build `teamA` / `teamB` from team 1 and team 2; overlaps produce overlapping match sides; ensure downstream validation and UI accept.

### 8.5 `gameStandings` fixed-team branch (backend + frontend)

**Backend**: `Backend/src/services/results/generation/gameStandings.ts` (~563–615)

- Team aggregates **sum** / **max** over member **per-user** stats. If one user is on two fixed teams, that user’s stats contribute to **two** team rows — team-level leaderboard semantics become ambiguous.

**Frontend**: `Frontend/src/services/gameStandings.ts` (~553+) — mirrors fixed-team aggregation for UI; **audit the same ambiguity** if standings are shown client-side.

- **Document** or adjust (e.g. team-scoped stats — larger change).

---

## 9. Frontend

### 9.1 Types

- `Frontend/src/types/index.ts` — add `allowUserInMultipleTeams?: boolean` to `Game`.

### 9.2 Game settings

- **`GameSettings.tsx`**: Add toggle; extend `editFormData` and handlers.
- **`GameDetails.tsx`** (or parent): Initialize from `game.allowUserInMultipleTeams ?? false`; include in save payload.
- **UX**: Disable or hide when `!hasFixedTeams`, when user cannot edit, or when `resultsStatus` / archived rules match other toggles. **Include** league / season game settings surfaces (`LEAGUE`, `LEAGUE_SEASON`) wherever game settings are edited (same rules as `GameSettings` for `GAME`).
- **i18n**: label + short warning (overlap affects rotation metrics; league parity).

### 9.3 Fixed team editor

- **`FixedTeamsManagement.tsx`**: If `game.allowUserInMultipleTeams`, do **not** block “player already in another team”; keep “already in **this** team” and non-participant checks as appropriate.
- **`TeamPlayerSelector.tsx`**: Today excludes all `selectedPlayerIds` from all teams — when flag is true, exclude only players **already on the current team** (or pass explicit `excludeUserIds` for the active team only).

---

## 10. Other surfaces

- **`removeUserFromGameFixedTeams`**: Already removes all `GameTeamPlayer` for user in game — correct for multi-team membership.
- **`GameOutcome`**: One row per `(gameId, userId)` — still valid.
- **Watch app** (`WatchGame.swift`): Add optional decode for API field if watch uses game JSON for fixed-team UX.
- **Telegram / broadcast**: May list a user twice when flattening teams — cosmetic; optional cleanup.

---

## 11. Readiness and roster size (unchanged by this flag)

- **`participantsReady`**: `playingParticipantsCount === maxParticipants` — overlap across fixed teams does **not** reduce required headcount.
- **`teamsReady` (fixed teams)**: Readiness loads only **`PLAYING`** participants; every fixed-team player must appear in that list. See also §5.5 vs `setGameTeams` (any participant row).
- **Fixed-team UI** requires even `maxParticipants` for the current slot model — “three humans, two pairs with overlap” still needs a fourth slot filled if `maxParticipants === 4`, unless product changes readiness or caps separately.

---

## 12. Testing checklist

| Area | Test |
|------|------|
| API | `setGameTeams` with overlap, flag off → 400 |
| API | `setGameTeams` with overlap, flag on → 200 |
| API | Same user twice **on one team** → 400 / Prisma error |
| API | Toggle flag off while state invalid → 400 (if chosen) |
| Update | `maxParticipants === 2` forces flag false |
| User-team auto | Overlap allowed when flag on |
| Frontend | Selector + save with overlap when on |
| Frontend | `LEAGUE` / `LEAGUE_SEASON`: toggle visible + saves; overlapping fixed teams when flag on |
| League API | `createLeagueGame` with overlapping teams when season flag on → 200; flag copied to child `Game` |
| League sync | `syncLeagueParticipants`: two rosters sharing a player — no participant/team row corruption |
| League gen | `TeamForRoundGeneration` with overlap when flag on — no throw; pairing sane or documented |
| Generation | `a === b` loops — no crash, sensible matchups with overlap |
| Generation | Overlap + flag on: `WINNERS_COURT` / `ESCALERA` — correct team identity (no wrong `teamMap`) or explicit product block |
| Generation | Overlap + flag on: `RATING` fixed-team ranking — team totals not double-counting shared player (or documented) |
| Standings | Backend + `Frontend/src/services/gameStandings.ts` team rows sensible for shared player |
| E2E | Season fixed teams with shared player → sync → round game create → results path smoke |

**Automated backend (subset):** `Backend/scripts/qa-allowUserInMultipleTeams.ts` — from `Backend/`: `DB_URL=… npm run qa:allow-multi-teams` (or `DB_URL=… npx ts-node scripts/qa-allowUserInMultipleTeams.ts`). Covers: `setGameTeams` / create & update `maxParticipants === 2` / invalid toggle; `applyUserTeamToFixedTeamsIfReady`; `removeUserFromGameFixedTeams`; `GameReadinessService` (fixed-team player `NON_PLAYING`); `GameTeamPlayer` uniqueness; `buildOpponentCounts`; in-memory `calculateGameStandings`; `prismaGameToGenGame`; first-round smoke: `generateRatingRound`, `generateEscaleraRound`, `generateWinnersCourtRound`, `RoundGenerator` (fixed overlap `GenGame`); **league:** `syncLeagueParticipants`, `TeamForRoundGeneration`, `createLeagueGame`, `createLeaguePlayoffGame` (overlap on/off). Not automated: React UI/E2E, `Frontend/.../gameStandings.ts` parity test, persisted rounds/results integration, Telegram.

---

## 13. Implementation order (suggested)

1. Prisma field + migration + create/update/read (all entity types; no league-specific stripping of the flag).
2. `GameTeamService.setGameTeams` + within-team dedupe + toggle-off validation.
3. `userTeamFixedTeams.service.ts`.
4. **League & sync**: `createLeagueGame`, `TeamForRoundGeneration`, `LeagueSyncService` reuse fix, `createLeaguePlayoffGame` audit, `collectDesiredTeamPlayerIds` / ingest edge cases (§7).
5. Frontend types, Game settings (including league/season), FixedTeamsManagement, TeamPlayerSelector.
6. Generation: `a === b` skips + **Winners Court + Escalera** `teamMap` identity (§8.2) + **rating** team totals (§8.3); `roundGenerator` / `random` as needed; `GenGame` + `mapPrismaForGeneration` if branching on flag.
7. Standings (backend + frontend `gameStandings.ts`) / watch / telegram / i18n polish.
8. Run linters on touched files; run §12 matrix including league rows.

---

## 14. References (code anchors)

| Topic | Location |
|--------|-----------|
| Cross-team reject | `Backend/src/services/gameTeam.service.ts` |
| League match create reject overlap | `Backend/src/services/league/gameCreation.util.ts` |
| Group fixed teams reject | `Backend/src/services/league/generation/TeamForRoundGeneration.ts` |
| Sync reuse bug risk | `Backend/src/services/league/sync.service.ts` |
| User-team skip | `Backend/src/services/game/userTeamFixedTeams.service.ts` |
| UI block | `Frontend/src/components/GameDetails/FixedTeamsManagement.tsx` |
| Selector filter | `Frontend/src/components/GameDetails/TeamPlayerSelector.tsx` |
| Readiness | `Backend/src/services/game/readiness.service.ts` |
| Opponent loops | `Backend/src/services/results/generation/matchUtils.ts`, `random.ts` |
| `teamMap` overwrite (overlap) | `Backend/src/services/results/generation/winnersCourt.ts`, `escalera.ts` |
| Rating fixed-team totals | `Backend/src/services/results/generation/rating.ts` (`generateFixedTeamRatingRound`) |
| Team standings | `Backend/src/services/results/generation/gameStandings.ts`, `Frontend/src/services/gameStandings.ts` |
| §12 API smoke (script) | `Backend/scripts/qa-allowUserInMultipleTeams.ts` |

---

## 15. Full roadmap checklist (todos)

Use this as the execution tracker. **§12** stays the narrative test matrix; this section is step-by-step with checks.

### Phase 0 — Scope lock

- [ ] **Full implementation**: same semantics for **GAME, TOURNAMENT, LEAGUE, LEAGUE_SEASON** and all league sync / round-generation paths — no “games-only” deferral.
- [ ] **§16**: Record chosen outcomes (flag-off behavior, WC/Escalera strategy, rating/standings strategy) in ticket or PR description before merge.

### Phase 1 — Database

- [x] Add `allowUserInMultipleTeams Boolean @default(false)` to `Game` in `Backend/prisma/schema.prisma`.
- [x] Create and apply migration (`npx prisma migrate dev` or project standard).
- [x] Regenerate Prisma client; confirm CI/local build passes.
- [x] Grep for `fixedTeams`, `GameTeam`, `gameTeam`, `setGameTeams`, `flatMap` + `Set` / unique counts on team player ids — catch any extra “one user one team” assumptions not listed in §14. *(Further fixes: Phase 5–7.)*

### Phase 2 — Backend: create, update, read

- [x] `GameCreateService.createGame`: read body field, default `false`; force `false` when `maxParticipants === 2`.
- [x] `GameUpdateService.updateGame`: force `false` when `maxParticipants === 2`; on `allowUserInMultipleTeams: false`, **validate** no user appears in more than one `GameTeam` (reject 400) unless product chose auto-cleanup.
- [x] **Do not** strip the flag by `entityType` — league games must persist and return it like any other game.
- [x] `GameReadService` (and any game serializers): include scalar on responses used by app (details, lists, chat payloads).
- [x] `game.controller` / other thin controllers: no change unless they whitelist body — confirm update path passes field through.

### Phase 3 — `GameTeamService.setGameTeams`

- [x] Branch global duplicate check on `game.allowUserInMultipleTeams`.
- [x] Add **within-team** duplicate `playerIds` validation (400 before transaction).
- [x] Re-run `updateGameReadiness` after save (already wired).

### Phase 4 — User-team auto fixed teams

- [x] `userTeamFixedTeams.service.ts`: load `allowUserInMultipleTeams` on the game query used for branching.
- [x] Skip `player_duplicate_across_teams` pre-check when flag is `true`; keep other skips (rounds started, slots, etc.).

### Phase 5 — League & sync (**blocking**)

- [x] `createLeagueGame`: skip team1/team2 overlap throw when `seasonGame.allowUserInMultipleTeams === true`; copy flag onto created `Game` (§7.1).
- [x] `TeamForRoundGeneration.generateGamesForFixedTeamsGroup`: skip global uniqueness throw when season allows overlap; adjust pairing / `getFixedTeamsOpponentUnNoveltyScore` for shared players (§7.2).
- [x] `LeagueSyncService.syncLeagueParticipants`: fix reuse logic — exact roster match only, or remove overlap-based reuse (§7.3).
- [x] `createLeaguePlayoffGame`: audit multi-team `teams[]`, copy `allowUserInMultipleTeams` from season where appropriate, align with sync (§7.4).
- [x] `collectDesiredTeamPlayerIds`: confirm identical unordered pairs on two teams — document `byKey` overwrite if product allows duplicate pairs (§7.5).

### Phase 6 — Frontend

- [x] `Frontend/src/types/index.ts`: add `allowUserInMultipleTeams?: boolean` to `Game`.
- [x] `GameSettings.tsx` (and league/season settings entry points): toggle + `editFormData` + save wiring; disable/hide when `!hasFixedTeams` or not editable — **including `LEAGUE` / `LEAGUE_SEASON`** (also `GameFormatCard` immediate save + `GameFormatSection` when fixed teams off → `allowUserInMultipleTeams: false`; `GameDetails` shows `GameFormatSection` / `GameSettings` for `LEAGUE` where applicable).
- [x] `GameDetails.tsx` (or owner of `editFormData`): init `?? false`, include in `gamesApi.update` payload.
- [x] i18n: label, helper text (overlap / rotation / league).
- [x] `FixedTeamsManagement.tsx`: skip “player in another team” when flag on; keep same-team + participant checks.
- [x] `TeamPlayerSelector.tsx`: when flag on, exclude only **current team** selections (or explicit prop), not all teams’ players.

### Phase 7 — Results generation & standings

- [x] `matchUtils.ts` / `random.ts`: `if (a === b) continue` (or equivalent) in opponent-style loops; grep `rating.ts`, `escalera.ts`, `winnersCourt.ts` for same pattern.
- [x] **Winners Court** `generateFixedTeamRound`: fix `teamMap` keyed by `userId` **or** block `WINNERS_COURT` + overlap flag combo until fixed (§8.2).
- [x] **Escalera** fixed-team path: same as Winners Court (§8.2).
- [x] **Rating** `generateFixedTeamRatingRound`: resolve double-count of shared player in team ranking **or** document + gate flag (§8.3).
- [x] `roundGenerator.ts` (AUTOMATIC + fixed teams): confirm overlap match sides acceptable to product/UI.
- [x] Backend `gameStandings.ts` fixed-team branch: document ambiguity or implement team-scoped logic (§8.5).
- [x] Frontend `gameStandings.ts`: align with backend decision (§8.5).

**Phase 7 implementation notes:** `buildOpponentCounts` skips `a === b`; `random` (staleness / `tryAllMatchings` / fixed-team matchups), `rating` / `winnersCourt` use `opponentPairFrequency` for cross-side pairs. Fixed-team WC + Escalera resolve match sides to canonical rosters via `resolveMatchSideToFixedTeamRoster`; `buildTeamRoundsPlayed` / `countTeamRoundsPlayed` resolve sides when `allowUserInMultipleTeams`. Rating fixed-team ordering splits each member’s `scoresDelta` by fixed-team membership count when overlap is on. Team standings (backend + frontend) apply the same weight to `scoresMade`, `scoresDelta`, and `pointsEarned` rows; `matchesWon` / W–T–L max aggregation unchanged. `GenGame` + `prismaGameToGenGame` carry `allowUserInMultipleTeams`. `AUTOMATIC` first round still pairs `teamNumber` 1 vs 2 (overlap allowed, no extra guard).

### Phase 8 — Other surfaces

- [x] Watch: `WatchGame.swift` — optional decode if payload includes field.
- [x] Telegram / broadcast: `LeagueBroadcastService.broadcastRoundStartMessage` dedupes `participants` + fixed-team users by `user.id` before notify (avoids duplicate sends / redundant work when overlap is allowed).
- [x] Docs / internal changelog: this file (`docs/PLAN_ALLOW_USER_IN_MULTIPLE_TEAMS.md`) is the canonical rollout + checklist for `allowUserInMultipleTeams`.

### Phase 9 — QA & sign-off

- [x] **§12 scripted (backend):** `Backend/scripts/qa-allowUserInMultipleTeams.ts` (`npm run qa:allow-multi-teams` in `Backend/`) — adds readiness, `prismaGameToGenGame`, RATING/ESCALERA/WC + `RoundGenerator` smoke, `createLeaguePlayoffGame`; plus prior GAME/league/sync coverage.
- [ ] **§12 remaining:** manual — frontend (selector / league settings UI), prisma-backed multi-round results / outcomes, client `gameStandings.ts` vs backend golden rows, E2E.
- [ ] Lint all touched Backend + Frontend files for the PR (script alone: `eslint scripts/qa-allowUserInMultipleTeams.ts`).
- [ ] Smoke: **GAME** — overlapping fixed teams + **start results / at least one round generation path** (not covered by the script).
- [ ] Smoke: **LEAGUE / LEAGUE_SEASON** — child game / season **editor** UX, broadcast/Telegram if relevant (script covers sync + `createLeagueGame` only).
- [ ] Regression: flag off **UI** + full league flows; script covers API overlap reject for `createLeagueGame` and `setGameTeams`.

### Phase 10 — Hardening / production-readiness (post-review)

Discovered during the post-implementation review (see commit log / chat). Verified against the working tree. Items are grouped by severity. Items marked **P1** should land before calling the rollout "stable / reliable" at scale; **P2** are quirks worth fixing or documenting; **P3** are optional polish.

#### P1 — concurrency & data-integrity

- [x] **TOCTOU in `GameTeamService.setGameTeams`**: `game.allowUserInMultipleTeams` is read **before** the `prisma.$transaction` (`Backend/src/services/gameTeam.service.ts:35-82`) and the transaction does not lock the `Game` row. Two concurrent admin actions (flag toggle off + setGameTeams with overlap) can land overlap rows with `allowUserInMultipleTeams = false`. **Fix:** wrap in a transaction that opens with `SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE` (mirror `roundGeneration.service.ts:169`) and re-read the flag inside the transaction.
- [x] **TOCTOU in toggle-off validation in `GameUpdateService.updateGame`** (`update.service.ts:94-106`): `gameTeam.findMany` runs outside the `prisma.game.update`. An overlap-write via `setGameTeams` between the validation read and the update commit defeats the check. **Fix:** same pattern — `FOR UPDATE` on `Game`, validate + update in one transaction.
- [x] **`LeagueSyncService.syncLeagueParticipants` is not concurrency-safe**: two near-simultaneous syncs (e.g. two `setGameTeams` calls each calling `syncLeagueSeasonAfterFixedTeamsChange`) can both observe "no exact-match standing" and both create a new `LeagueTeam` + `LeagueParticipant` for the same desired roster, leaving a duplicate. The new exact-match path (correctly) never reuses cross-run, so the duplicate window is **wider** than before. **Fix:** `pg_advisory_xact_lock(hashtext($leagueSeasonId))` (or `FOR UPDATE` on the season's `Game` row) at the top of the existing transaction.
- [x] **`update.service.ts` doesn't force `allowUserInMultipleTeams: false` when `hasFixedTeams: false`** is sent (lines 80-92 only force on `maxParticipants === 2`). Frontend (`GameFormatSection.tsx:43-47`) compensates, but direct API consumers can leave the row in the inconsistent `hasFixedTeams: false, allowUserInMultipleTeams: true` state. **Fix:** in the same `if (data.hasFixedTeams === false)` branch, also `updateData.allowUserInMultipleTeams = false`.

#### P2 — semantics quirks

- [x] **Identical rosters across two fixed teams are silently allowed when the flag is on**: `setGameTeams` validates within-team duplicates and the flat cross-team union (skipped under flag), but never the multiset of rosters. `team1=[p1,p2]; team2=[p1,p2]` is accepted; `resolveFixedTeamRosterFromGame` then resolves by smaller `teamNumber` (`matchUtils.ts:144-147`). **Decide:** reject in `setGameTeams` (recommended — adds to §16), or document the smaller-`teamNumber` tiebreak and the standings/rotation impact.
- [x] **Player `place` for a shared player follows the *last-iterated* team in `sortedTeams`**: `gameStandings.ts:730-741` (and frontend mirror) overwrites `standing.place` per team in iteration order, so a player on a 1st- and 4th-place team displays as 4th. Most users would expect **best** rank. **Fix landed:** seed `standing.place === 0 ? position : Math.min(standing.place, position)` (best-of-team rank wins; preserves initial-zero sentinel from the standings push). QA in `qa-allowUserInMultipleTeams.ts` asserts shared player gets the best of its team ranks.
- [x] **AUTOMATIC first round + overlapping fixed teams creates a same-player-on-both-sides match**: `roundGenerator.generateAutomaticRound` (`roundGenerator.ts:105-122`) blindly pairs `teamNumber` 1 vs 2. Downstream `calculatePlayerStats` `continue`s when `isInTeamA && isInTeamB` (`gameStandings.ts:141-143`), so the shared player gets **zero stats** from that match (silent zero, not surfaced anywhere). **Decide:** either reject AUTOMATIC + identical-roster overlap at generation time, or surface a warning in match details / standings note.

#### P3 — polish / dead code / inconsistency

- [x] **`update.service.ts` validation runs on every PATCH** even for unrelated fields (`priceTotal`, `description`, …) because `nextAllowUserInMultipleTeams` falls back to the persisted value. Cheap but wasteful `gameTeam.findMany`. **Fix:** gate with `if (data.allowUserInMultipleTeams !== undefined || data.maxParticipants === 2)` before validating.
- [x] **`createLeaguePlayoffGame` dead branch**: `participantCount = Math.max(userIds.length, 4)` then `participantCount === 2 ? false : Boolean(...)` (`gameCreation.util.ts:257-260`) — the `=== 2` arm is unreachable. Match `createLeagueGame` shape (`maxParticipants === 2 ? false : ...`) for clarity.
- [x] **Inconsistent payload nesting in `LeagueCreateService.createLeague`**: now both `hasFixedTeams` and `allowUserInMultipleTeams` are read from the root `data.*`; force-`false` cascades when `maxParticipants === 2` or `!hasFixedTeams`. `Frontend/src/api/leagues.ts` `CreateLeagueRequest` mirrors the new shape (root-level flag).

#### Edge cases that are intentional — keep documented

- §8.4 / §11 — AUTOMATIC + identical-roster overlap is not blocked by design; downstream stats handle it via the `isInTeamA && isInTeamB` skip in `calculatePlayerStats`. Confirmed silent (no error, no warn).
- `removeUserFromGameFixedTeams` can leave a fixed team with a single player; readiness then becomes false (`teamsReady = false`). Confirmed correct.
- `resolveFixedTeamRosterFromGame` fallback order is **hint → multiset filter → `stringCandidatesFallback` → identity**; ad-hoc match-team edits off canonical rosters fall through to identity (no `gameTeamId` resolution). Confirmed acceptable for Q1 ship.

---

## 16. Decisions to lock during implementation

Resolve explicitly (document in code or product spec):

1. **§4.3 — Turning flag off**: When `allowUserInMultipleTeams` becomes `false` but fixed teams still share a user — **reject** update (recommended) vs **auto-clear** fixed teams vs other cleanup.
2. **§8.2 — Winners Court / Escalera**: **Refactor** `playerId → team` maps to stable team identity (`gameTeamId` / `teamNumber` / index) vs **disallow** `WINNERS_COURT` / `ESCALERA` when overlap is allowed until refactored.
3. **§8.3 / §8.5 — Rating & standings**: **Fix** double-count / ambiguous team rows vs **document** behavior and gate UI (e.g. hide team leaderboard) when overlap is on.
4. **§Phase 10 P2 — identical rosters across two fixed teams**: **reject** in `setGameTeams` (recommended) vs **accept** with documented smaller-`teamNumber` tiebreak.
5. **§Phase 10 P2 — shared player `place` aggregation**: **best-of** (recommended — `Math.min` across teams) vs current "last-iterated wins" vs explicit per-team standing rows.
6. **§Phase 10 P2 — AUTOMATIC + same-roster overlap**: **reject at generation** vs **accept** with surfaced warning in match details vs current silent zero-stat fall-through.

---

*Document version: full implementation (incl. leagues), implementation readiness + Prisma `include`/`select` note, post-migration grep, release gate, §16 decision forks (incl. Phase 10 forks), schema/API/UI, league/sync, generation/standings, `teamsReady` vs `setGameTeams`, §15 checklist + §15 Phase 10 hardening checklist.*
