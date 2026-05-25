# Bracket Playoff — product & implementation plan

Grounded in the current league model: playoffs are a `LeagueRound` with `roundType: PLAYOFF`, created via `PlayoffConfigurationModal` → `leaguesApi.createPlayoff`, and each group gets **one** `WINNER_COURT` or `AMERICANO` game with **all** selected teams inside it (`createLeaguePlayoffGame`). Regular fixed-team season games are **CLASSIC**, two fixed teams per game (`createLeagueGame`). Bracket playoffs should follow the **regular-season game shape**, not the session-style playoff shape.

---

## 1. Product definition

| Aspect | Decision |
|--------|----------|
| **Name** | Bracket Playoff (UI: “Knockout bracket” / “Playoff bracket”) |
| **Eligibility** | `league.game.hasFixedTeams === true` only; hide/disable for individual leagues |
| **Entrants** | **2–16 teams per group** (any count); non–power-of-2 uses **play-ins + byes** (see §15) |
| **Structure** | Single-elimination tree after play-in phase; main bracket size = `nextPowerOf2(N)` |
| **Games** | One `Game` per matchup — `gameType: CLASSIC`, `hasFixedTeams: true`, two `gameTeam`s (reuse `createLeagueGame`) |
| **Seeding** | Default: regular-season standings order (#1 best … #N); same tie-breakers as `compareStandings` in `PlayoffConfigurationModal` |
| **Selection** | “Top N” quick picks from standings and/or manual checkbox selection; `participantIds` ordered best→worst |
| **Advancement** | Winner of matchup auto-fills the next slot when `resultsStatus === FINAL`; byes auto-advance without a game |
| **Re-seed after play-in** | **No** — play-in winner inherits the bracket slot; only manual edits before games are played |
| **Standings** | Playoff games do **not** sync `LeagueParticipant` points (already skipped for `PLAYOFF` in `gameResults.service.ts`) |
| **Coexistence** | Bracket is a **third playoff format** beside Winner’s Court and Americano; same round type filter (`REGULAR` / `PLAYOFF`) |
| **Scheduling gate (recommended)** | All **play-in** games should be FINAL before main-bracket games are created or highlighted as “actionable” |
| **Bracket scope (V1 shipped)** | `PER_GROUP` — one tree per `LeagueGroup` in a round (see §10) |
| **Bracket scope (planned)** | `CROSS_GROUP` — one season knockout from multiple groups (§21) |
| **Cross-group auto qualification** | Equal **K** teams from every **included** group; total N = K × G, 2 ≤ N ≤ 16 |
| **Cross-group `Game.leagueGroupId`** | **`null`** — season-level playoff bucket (origin group on participant only) |

---

## 2. Data model (recommended)

Avoid encoding the whole tree only in `Game.metadata`. Add explicit bracket config so swaps, play-ins, byes, and advancement stay consistent.

```prisma
enum PlayoffFormat {
  SESSION      // today: WINNER_COURT / AMERICANO
  BRACKET
}

enum BracketSlotKind {
  PLAY_IN   // real game among bottom seeds
  BYE       // top seed(s), no game, auto-advance into main tree
  MAIN      // knockout round after play-in phase is resolved
  THIRD_PLACE // optional match between SF losers (Phase 4)
  CONSOLATION // optional R0 MAIN losers tree
  LOSERS    // double-elim losers bracket (R0 from MAIN R0 losers)
  GRAND_FINAL // double-elim: winners champ vs losers champ
}

// LeagueRound
playoffFormat    PlayoffFormat?
entrantCount     Int?            // actual teams selected, e.g. 7
bracketSize      Int?            // next power of 2, e.g. 8
byeCount         Int?            // bracketSize - entrantCount
bracketTemplateVersion Int?      // pairing algorithm version (reproducibility)

model LeagueBracketSlot {
  id                   String          @id @default(cuid())
  leagueRoundId        String
  leagueGroupId        String
  slotKey              String          // e.g. "PI-0", "MAIN-R0-M0"
  slotKind             BracketSlotKind
  phaseIndex           Int             // 0 = play-in/byes, 1+ = main KO depth
  roundIndex           Int             // index within phase (main: 0=first KO round)
  matchIndex           Int
  leagueParticipantId  String?         // seeded team; null = TBD / winner-fed
  gameId               String?         @unique
  winnerSlotId         String?         // slot that receives winner
  feederSlotAId        String?
  feederSlotBId        String?
  seedRank             Int?            // 1..entrantCount when initially seeded
}
```

**`LeagueRound.bracketConfig Json` (optional):** `seedingLocked`, display labels, audit metadata — **slots table** remains source of truth for pairings and edits.

**Graph (example, 8 teams — power of 2, no play-in):**

- MAIN R0: four QF games.
- MAIN R1: two SF games.
- MAIN R2: Final.

**Graph (example, 7 teams — see §15):**

- BYE: seed #1.
- PLAY_IN: #2v#7, #3v#6, #4v#5.
- MAIN: QF → SF → Final (four teams after play-in phase).

**`Game` linkage:** real matchups have `gameId`; BYE slots never have a game; TBD MAIN slots have `leagueParticipantId = null` until feeders resolve.

---

## 3. Backend behavior

### 3.1 Pairing engine (`bracketStructure.ts`)

Pure function — unit-tested for every `entrantCount` 2..16:

```ts
buildBracketPlan(entrantCount: number, orderedParticipantIds: string[]): BracketPlan
// → slots (PLAY_IN | BYE | MAIN), edges, initial games to create, labels for UI
```

**Core formulas:**

```text
bracketSize   = nextPowerOf2(entrantCount)     // 5→8, 7→8, 9→16
byeCount      = bracketSize - entrantCount
playInTeams   = entrantCount - byeCount        // always even
playInGames   = playInTeams / 2
```

- **Top `byeCount` seeds** (1 … byeCount) → `BYE` slots (auto-advance).
- **Bottom `playInTeams` seeds** → `PLAY_IN` pairings using standard 1-vs-N pairing **within that sub-pool** (mapped to real seed numbers).
- When play-in phase completes (+ byes applied), exactly **`bracketSize / 2`** teams enter the **MAIN** tree (same QF/SF/Final logic as a full bracket).

### 3.2 Create (`POST /leagues/:leagueSeasonId/playoff/bracket`)

```ts
{
  groups: { leagueGroupId: string; participantIds: string[] }[]  // ordered best→worst
  gameSetup?: { fixedNumberOfSets, scoringPreset, ... }  // season-like CLASSIC setup
}
```

`entrantCount` = `participantIds.length` per group (inferred). No need to send `bracketSize` unless overriding (not in V1).

**Validation:**

- Season `hasFixedTeams`.
- Each group: `2 ≤ participantIds.length ≤ 16`.
- Participants are `TEAM` type with valid rosters (same as `loadGroupSortedTeams`).
- No duplicate `participantIds` per group.

**Transaction:**

1. Create one `LeagueRound` (`roundType: PLAYOFF`, `playoffFormat: BRACKET`, `entrantCount`, `bracketSize`, `byeCount`).
2. Per group: `buildBracketPlan` → insert all `LeagueBracketSlot` rows.
3. Create `Game` only for **PLAY_IN** and **MAIN** slots where **both** teams are known at create time (BYE: never).
4. **Lazy game creation** for MAIN slots fed by play-in winners when the second feeder becomes known.

### 3.3 Advancement (`bracketAdvancement.service.ts`)

Hook from result-finalization path (alongside standings sync — bracket only):

| Slot kind | On create | On FINAL result |
|-----------|-----------|-----------------|
| `PLAY_IN` | Both teams set | Winner → `winnerSlotId` in MAIN tree; maybe create next MAIN game |
| `BYE` | Team set, no game | Mark feeder ready; when subtree complete, fill MAIN slot (or at bracket start) |
| `MAIN` | TBD until feeders ready | Winner → next MAIN slot; create game when both feeders known |

1. Determine winning `leagueParticipantId` from `fixedTeams` + `outcomes` (reuse team winner logic from standings sync).
2. Write winner into target slot.
3. If both feeders for a MAIN child slot are known → `createLeagueGame` + link `gameId`.

**Unsync / result edit:** owner-only; clear downstream slots and delete/disable child games; block if downstream MAIN games are FINAL.

### 3.4 Manual bracket edit (`PATCH .../bracket/slots`)

Owner/admin only; only if **no `FINAL` result** in the affected subtree.

- **Swap / move** within **PLAY_IN** phase only (before play-in results).
- **Swap / move** within the same **MAIN** round only (before that round’s games are FINAL).
- **Replace** from playoff pool (`participantIds` for this bracket).
- **Do not** move a BYE team into a PLAY_IN slot without clearing dependent MAIN slots.

Optional: audit log (`bracketConfig.audit[]` or dedicated table) — who changed slots and when.

### 3.5 Read (`GET .../playoff/bracket`)

```ts
{
  round: LeagueRound,
  groups: [{
    leagueGroupId,
    entrantCount,
    bracketSize,
    byeCount,
    playInGameCount,
    slots: BracketSlotDto[],
    championParticipantId?: string,
  }]
}
```

Include nested `game` summary per slot with `gameId`. Include `slotKind` and human `roundLabel` (“Play-in”, “Quarterfinals”, …).

---

## 4. UX/UI — design principles

1. **One mental model:** “Regular season = matrix; Playoff bracket = tree (play-in column + KO columns).”
2. **Progressive disclosure:** creation = standings + count + structure summary + preview; viewing = tree; editing = explicit edit mode.
3. **Mobile-first tree:** vertical round stacks or horizontal scroll-snap columns; **play-in column always left/first**.
4. **Reuse:** `PlayerAvatar`, group colors, `LeagueGameCard` / detail sheet, `EditLeagueGameTeamsModal` for **time/court only** (not bracket placement).
5. **Accessibility:** list fallback tab (“Play-in” / “Knockout” game lists) for screen readers; don’t rely on SVG-only.

---

## 5. Creation flow (owner)

Extend `PlayoffConfigurationModal` with a **third segment**: Bracket.

```
[ Winner's Court | Americano | Bracket ]   ← disabled + tooltip if !hasFixedTeams
```

### Step A — Config

- Group chips + standings table (existing).
- Select **Top N** or manual (N = 2..16); show **seed #** column.
- **Structure summary** (dynamic, not only 2/4/8/16 chips):
  - e.g. “**7 teams** → 1 bye (#1), **3 play-in** games, then **quarterfinals**”
  - e.g. “**8 teams** → quarterfinals (no play-in)”
- Quick picks: Top 2, 4, 5, 6, 7, 8, … up to min(16, group size).

### Step B — Bracket preview

- Columns: **Play-in** (if any) → **Byes** (ghost cards) → **QF / SF / Final** (or R16 for 9–16 entrants after play-in).
- **Adjust seeding:** drag chips within **play-in** or within the same **main** round only.
- Legend: seed badge, group color, “Bye → QF”.

### Step C — Game setup

- Season **CLASSIC** scoring (not WC/Americano templates).

### Step D — Confirm

Per group: entrant count, bye count, play-in count, first main round name, champion path.

**Empty state** when `!hasFixedTeams`: *“Bracket playoffs require fixed teams.”*

---

## 6. Schedule tab — viewing (everyone)

### Sub-views when `playoffFormat === 'BRACKET'`

| View | Use |
|------|-----|
| **Bracket** (default) | Tree with play-in + main columns |
| List | All games; filters **Play-in** / **Knockout** |
| My games | Unchanged |

### `LeagueBracketView`

- **BYE** slots: compact ghost card (“#1 — Bye” + connector to MAIN).
- **PLAY_IN** / **MAIN** match cards: TBD / Ready / Scheduled / Live / Final (same as before).
- Tap → detail sheet or game page.
- Fullscreen: `/games/:leagueSeasonId/league-bracket?group=…`

### Owner: **Edit bracket**

- Phase-aware drag rules (§3.4).
- Save / Discard batch PATCH.

---

## 7. Standings & outcome (everyone)

- **Podium card** for bracket playoffs: champion, finalist, optional SF losers.
- Link: “View full bracket”.
- Optional later: `GamePromoStorySlide` for champion.

---

## 8. API surface (`Frontend/src/api/leagues.ts`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/leagues/:id/playoff/bracket` | Create bracket round (`bracketScope`, `groups` or `crossGroup`) |
| GET | `/leagues/:id/playoff/bracket` | Tree + games + `bracketScope` + phase metadata |
| PATCH | `/leagues/:id/playoff/bracket/slots` | Owner reseed / swap |
| DELETE | existing round delete | Last round & no results |

**`LeagueRound` fields:** `playoffFormat`, `bracketScope`, `entrantCount`, `bracketSize`, `byeCount`.

---

## 9. Seeding reference (power-of-2 MAIN bracket)

Standard 1-based pairings for **MAIN** rounds when `bracketSize` teams occupy the first KO round:

| bracketSize | First MAIN round | Pairings |
|-------------|------------------|----------|
| 2 | Final only | 1 vs 2 |
| 4 | SF (2 games) | 1–4, 2–3 |
| 8 | QF (4 games) | 1–8, 4–5, 2–7, 3–6 |
| 16 | R16 (8 games) | NCAA-style |

**Display order** of matches (1–8, 4–5, …) may differ from `matchIndex` for symmetric tree layout.

**Play-in pairings** (within seeds `byeCount+1 … entrantCount`): apply the same pairing table to a **virtual** bracket of size `playInTeams` (always a power of 2), then map virtual seeds back to real seed numbers. Implement once in `bracketStructure.ts`.

---

## 10. Edge cases & rules

| Case | Behavior |
|------|----------|
| N not power of 2 (5, 7, 9, …) | **Allowed** — play-ins + byes per §15 |
| N < 2 or N > 16 | Reject |
| Multiple bracket rounds per season | Allowed (`orderIndex`); UI shows latest or picker |
| Multi-group season | `PER_GROUP`: one tree per group. `CROSS_GROUP`: one tree; equal K per included group (§21) |
| Cross-group games | `Game.leagueGroupId = null`; slots `leagueGroupId = null` |
| Cross-group + group schedule filter | Full cross tree on bracket tab; list shows games under “Season playoff” (§21.14) |
| Unequal K per group (automatic) | **Reject** — automatic mode requires equal K |
| Manual cross-group picks | Still **exactly K per included group**; global order via drag or preset |
| Walkover / forfeit | Owner assigns winner → advances like FINAL |
| Result correction | Block if downstream MAIN is FINAL; else cascade clear |
| Tie / ambiguous winner | Use existing game winner rules; block advancement until resolved |
| Custom play-in pairings (V1) | **Not supported** — formula + drag within same phase only |
| Double play-in rounds | **Not supported** — single play-in phase per §15 |
| Third-place match | **V1 Phase 4** — optional SF loser game (`includeThirdPlace`) |
| Double elimination | **V3+** — `includeDoubleElimination` on POST |

---

## 11. Implementation phases

### Orchestration status (team)

| Step | Owner | Status |
|------|-------|--------|
| Phase 1 — Backend schema + `bracketStructure` + tests | backend-phase1 | completed |
| Phase 1 — Backend create/GET/advancement/routes | backend-phase1 | completed |
| Phase 1 — Frontend API types + create wizard | frontend-create | completed |
| Phase 1 — Frontend `LeagueBracketView` + schedule | frontend-view | completed |
| Phase 1 — Integration verify + QA matrix 2..16 | qa-integration | completed |
| Phase 2 — PATCH slots + edit overlay | frontend-phase2 | completed (BE PATCH + `BracketEditOverlay`, schedule/fullscreen edit) |
| Phase 3 — Polish (fullscreen, podium, i18n) | frontend-polish | completed |
| Final verification — cross-phase synthesis | qa-integration | **pass with manual gaps** — FE `PatchBracketSlotsRequest` ↔ BE `patchBracketSlots` (path `/playoff/bracket/slots`, `slots`/`side`/`roundId`/`gameTeamUpdates`); no BE 501 stubs; `BracketEditOverlay` implemented; `LeagueRound` + GET bracket expose `playoffFormat`/`entrantCount`; BE `npm run test:bracket-structure` + FE vitest (`bracketStructure`, `leagueBracketOutcome`, `leagueHomeGameMatchup`) green; §18 E2E items still manual |
| Final verification — full | qa-integration | **pass** (2026-05-25) — BE `test:bracket-structure` (incl. `leagueBracketDeepLink.util.test.ts`), `lint`, `tsc --noEmit` green; FE vitest 44/44 (7 files incl. `leagueHomeGameMatchup`); bracket ESLint glob clean; smoke: POST/GET/PATCH routes + CROSS_GROUP validation, `BracketRoundPicker`/`listBracketRounds`, deep-link util + push/Telegram, `broadcast.service` iterates all `round.games` (null `leagueGroupId` included); fix: vitest-style deep-link test broke BE `tsc` → ts-node assert harness + wired into `test:bracket-structure` |
| Final verification — frontend | qa-integration | **pass** (2026-05-25) — vitest 44/44 (7 files); ESLint bracket glob clean; TS fixes in `bracketSlotEdit.util`, `BracketPlayoffGameSetupStep`, `leagueBracketOutcome`; Phases 1–3 smoke-wired; i18n ~61 `gameDetails.bracket*` keys × 5 locales |
| Bracket round picker (§10 multi-round) | frontend | completed — `BracketRoundPicker` (schedule/standings/fullscreen); `listBracketRounds` by `orderIndex`; selected `roundId` → GET/PATCH + `BracketEditOverlay` |
| §21.8 broadcast deep links | backend | completed — `leagueBracketDeepLink.util.ts`; Telegram + push `GAME_REMINDER`; `broadcast.service` includes null-group games |
| Plan compliance audit | qa-integration | completed (2026-05-25) — §20 table synced; §22 living open items; remaining: §18 / §21.14 manual E2E |

**Phase 1 — Core (MVP)**

- `bracketStructure.ts` + tests for N = 2..16
- Schema + create + GET + advancement + read-only `LeagueBracketView`
- Create wizard with structure summary (play-in + bye copy)
- Power-of-2 only acceptable in UI **or** full play-in engine from day one (prefer **full engine** to avoid rework)

**Phase 2 — Owner edit**

- PATCH slots, phase-aware edit overlay, validation

**Phase 3 — Polish**

- Fullscreen bracket, path highlight, podium, notifications, i18n, list filters

**Phase 4 — Optional**

| Step | Owner | Status |
|------|-------|--------|
| 4a — Third-place match (create + view + podium) | frontend | completed — `includeThirdPlace`; `THIRD_PLACE` column; `LeagueBracketPodiumCard` 3rd |
| 4b — Custom bye assignment (per-group + cross-group) | frontend | completed — `BracketCustomByePicker`; `customByeSeedRanks` POST; `customByeSeedRanks.util` |
| 4c — Bracket share link + export image | frontend | completed — `BracketShareToolbar`; `leagueBracketShare.util` (html2canvas); `roundId` query |
| 4d — Third-place + custom bye + Telegram summary | backend | completed — `THIRD_PLACE`; `customByeSeedRanks`; `bracketRoundSummary.notification.ts`; `POST .../notify-summary` |
| 4d — Telegram bracket summary image | backend | completed | `bracket-summary-image.service.ts` (sharp SVG→PNG) + `sendPhoto` on champion/manual summary |

**Phase 5 — Cross-group bracket (§21)**

| Step | Owner | Status |
|------|-------|--------|
| 5a — Schema `BracketScope`, nullable slot `leagueGroupId` | backend | completed |
| 5b — `crossGroupBracketSeeding.ts` + tests | backend | completed |
| 5c — BE create/GET cross payload, round metrics | backend | completed |
| 5d — BE advancement/PATCH scope + `game.leagueGroupId null` | backend | completed |
| 5e — Route validation (discriminated POST body) | backend | completed |
| 5f — FE create wizard (scope toggle, equal K) | frontend | completed |
| 5g — FE schedule/bracket/fullscreen/podium/accordion | frontend | completed |
| 5h — FE edit overlay + API types | frontend | completed |
| 5i — QA + §20 compliance rows | qa | completed |

**Phase 6 — Bracket V2+ backend**

| Step | Owner | Status |
|------|-------|--------|
| 6a — Cross-group unequal K (`teamsPerGroup` / `unequalK`) | backend | completed — `buildUnequalTopKQualifiers`, `validateUnequalCrossGroupPool`; equal-K path unchanged |
| 6b — Bracket slot walkover API | backend | completed — `POST .../playoff/bracket/slots/:slotId/walkover`; `skipGameFinal` optional |
| 6c — Custom play-in pairings on create | backend | completed — `customPlayInPairings` → `buildBracketPlan` |
| 6d — Telegram bracket summary PNG | backend | completed — Phase 4d image; text+link in caption |
| 6e — Consolation bracket (R0 MAIN losers) | backend | completed — `includeConsolationBracket` parallel `CONS-*` tree (lazy games) |
| 6f — Double elimination | backend | completed — `includeDoubleElimination`; `LOSERS` + `GRAND_FINAL` slots; FE tabs |

---

## 12. Files likely touched

| Area | Files |
|------|--------|
| Pairing | `Backend/src/services/league/bracketStructure.ts` (new) |
| Schema | `Backend/prisma/schema.prisma` |
| Create / advance | `bracketPlayoff.service.ts`, `bracketAdvancement.service.ts`, `create.service.ts` |
| Games | `gameCreation.util.ts` (`createLeagueGame` only) |
| Results hook | `gameResults.service.ts` or game finalize hook |
| Routes | `league.routes.ts`, `league.controller.ts` |
| UI create | `PlayoffConfigurationModal.tsx`, `BracketPlayoffPreview.tsx`, `BracketStructureSummary.tsx` |
| UI view | `LeagueScheduleTab.tsx`, `LeagueBracketView.tsx`, bracket fullscreen route |
| UI edit | `BracketEditOverlay.tsx` |
| API / types | `Frontend/src/api/leagues.ts`, `Frontend/src/types` |
| Tests | `bracketStructure.test.ts` (golden fixtures per N) |
| Cross-group seeding | `crossGroupBracketSeeding.ts` (BE + FE mirror) |
| Cross-group create UI | `CrossGroupBracketConfigStep.tsx`, `CrossGroupBracketSeedList.tsx` |

---

## 13. UX mock flow (ASCII)

**Create (7 teams)**

```
Standings ──► Top 7 ──► "1 bye, 3 play-ins, then QF" ──► Preview tree ──► Setup ──► Create
```

**View**

```
[Play-in] ──► [QF] ──► [SF] ──► [Final]
   2v7          1──┐
   3v6          W──┼── ...
   4v5          ...
```

**Edit**

```
[Edit] swap within play-in only (before results) / within same KO round
```

---

## 14. Key architectural choice

**Bracket ≠ session playoff.** Use **`createLeagueGame`** (CLASSIC, 2 fixed teams) + **`LeagueBracketSlot`** graph with **`PLAY_IN` / `BYE` / `MAIN`**, not **`createLeaguePlayoffGame`**.

---

## 15. Play-in phase and byes (non–power-of-2 entrants)

### Algorithm

```text
bracketSize   = nextPowerOf2(N)
byeCount      = bracketSize - N
playInTeams   = N - byeCount        # even
playInGames   = playInTeams / 2
```

1. Seeds **1 … byeCount** → **BYE** (no game; auto-advance into MAIN tree).
2. Seeds **byeCount+1 … N** → **PLAY_IN** games (standard pairing on this sub-pool).
3. After play-in phase: **bracketSize / 2** teams in MAIN round 0 → continue single elimination.

### Examples

| N | bracketSize | Byes (seeds) | Play-in games | First MAIN round |
|---|-------------|--------------|---------------|------------------|
| 5 | 8 | 1–3 | 4 vs 5 (1) | QF (4 teams) |
| 6 | 8 | 1–2 | 3v6, 4v5 (2) | QF (4 teams) |
| 7 | 8 | 1 | 2v7, 3v6, 4v5 (3) | QF (4 teams) |
| 9 | 16 | 1–7 | 8 vs 9 (1) | R16 (8 teams) |
| 10 | 16 | 1–6 | 7v10, 8v9 (2) | R16 (8 teams) |
| 11 | 16 | 1–5 | 6v11, 7v10, 8v9 (3) | R16 (8 teams) |

### Five teams (concrete)

```text
Play-in:   [4 vs 5] ──► W₄₅
Byes:      #1, #2, #3

QF:        #1 vs W₄₅  |  #2 vs #3
SF → Final
```

### Seven teams (concrete)

```text
Play-in:   #2v#7, #3v#6, #4v#5
Bye:       #1

QF:        four teams (#1 + three play-in winners)
SF → Final
```

### Nine teams (concrete)

```text
Play-in:   #8 vs #9
Byes:      #1–#7

R16 → QF → SF → Final   (16-tree; first played MAIN round is R16)
```

### UI copy (creation)

Show computed summary; do **not** force owner to pick 8 when they have 7 teams.

### Play order

Recommend completing all **PLAY_IN** games before MAIN games are scheduled or shown as primary CTAs (soft gate in UI; optional hard gate in API).

---

## 16. Notifications and scheduling

- Notify participants when a **play-in** game is created / scheduled — **IMPLEMENTED** via `BracketGameNotificationService` + `sendLeagueGameAssignedNotification` on initial/lazy game create (`bracketAdvancement.service.ts`, `bracketPlayoff.service.ts`) and after finalize (`outcomes.service.ts`).
- Notify when team **advances** to next MAIN round — **IMPLEMENTED** (same assigned-game notify when `tryCreateReadyGames` creates the next matchup).
- Reuse `LeagueRound.sentStartMessage` pattern for “Playoffs started” with link to bracket view — **IMPLEMENTED**; BRACKET rounds use `leagueBracketDeepLink.util.ts` in round-start push/Telegram (`broadcast.service.ts` already passes `bracketScope`).
- Owner: list view sorted **Play-in first**, then MAIN by round — **IMPLEMENTED** (`bracketScheduleListSort.util.ts`; bracket list panel + `getLeagueRounds` game order for `PLAYOFF`/`BRACKET` rounds).
- **Not in MVP:** Telegram bracket summary image (§19).

---

## 17. Permissions, audit, and rollback

| Action | Who |
|--------|-----|
| Create bracket | Owner / admin |
| Edit slots | Owner / admin |
| Enter results | Existing league game rules (`resultsByAnyone`, etc.) |
| Walkover | Owner / admin |
| Delete bracket round | Owner / admin if no FINAL games (including play-in) |

- Log slot PATCHes (userId, timestamp, before/after) in `bracketConfig.audit` or small audit table.
- Result rollback: cascade rules documented in §3.3; show clear error if downstream MAIN is FINAL.

---

## 18. QA matrix (N = 2..16)

For each `entrantCount` N in 2..16:

**Automated (BE)**

- [x] `buildBracketPlan` golden JSON matches expected slot count and kinds (`bracketStructure.test.ts`, fixtures `bracket-2.json` … `bracket-16.json`)
- [x] `byeCount` and `playInGames` match table in §15 (loop in BE test; play-in pairing via `playInPairings`)
- [x] Edit blocked after FINAL in subtree — `bracketSlotEdit.util.test.ts`; PATCH 409 in `patchBracketSlots`
- [x] Result unsync clears downstream only when allowed — `onBracketGameResultsUndone` in `undoGameOutcomes`; 409 if downstream MAIN FINAL (logic in `bracketAdvancement.service.ts`, not HTTP E2E)

**Manual / E2E only**

- [ ] Create only creates games for known sides — API QA after POST `playoff/bracket`
- [ ] Play-in FINAL advances winner to correct MAIN feeder — `BracketAdvancementService.onGameFinalized` wired in `outcomes.service.ts`; simulate FINAL results
- [ ] BYE teams appear in correct MAIN slot without game — golden slot graph only; verify in UI/API
- [ ] Full run to champion (simulate results) — end-to-end bracket season
- [ ] Multi-group: independent trees — POST with multiple `groups[]`

**Smoke-verified (code, not E2E):** POST/GET `/:leagueSeasonId/playoff/bracket`, PATCH `.../playoff/bracket/slots` (not 501); Prisma `LeagueBracketSlot`, `PlayoffFormat.BRACKET`; advancement hooks on finalize + undo.

Store golden fixtures in `Backend/src/services/league/__fixtures__/bracket-N.json`. Regenerate: `cd Backend && npm run test:bracket-structure` (includes fixture writer).

**Backend verification (2026-05-25):** `npm run test:bracket-structure` (incl. `leagueBracketDeepLink.util.test.ts`), `npm run lint`, `npx tsc --noEmit` — all green; full pass re-run 2026-05-25 after deep-link test harness fix + unused import cleanup in `bracketAdvancement.service.ts`.

**Frontend verification (2026-05-25):** **pass**

| Check | Result |
|-------|--------|
| `npx vitest run` (7 bracket util files, incl. `leagueHomeGameMatchup`) | 7 files, **44** tests passed |
| ESLint bracket glob | **pass** (19 FE bracket files + `PlayoffConfigurationModal`, `LeagueScheduleTab`, `LeagueStandingsTab`, `api/leagues.ts`) |
| TS (bracket surfaces) | **pass** — `NonNullable` patch return type; removed invalid `gameType` on `GameSetupParams`; removed unreachable BYE branch in `buildBracketSlotHighlights` |
| Phase 1 create | `PlayoffConfigurationModal` `BRACKET` → preview → `BracketPlayoffGameSetupStep` → `createBracketPlayoff` |
| Phase 1 view | `LeagueBracketView` + schedule `bracket` / list subtabs |
| Phase 2 edit | `BracketEditOverlay` → `leaguesApi.patchBracketSlots` (view + fullscreen) |
| Phase 3 polish | `LeagueBracketPodiumCard` on standings; `/games/:id/league-bracket` in `App.tsx` |
| Phase 3 — path highlight | **wired** (2026-05-25) — `buildBracketSlotHighlights` → `LeagueBracketView` / fullscreen slot + bye cards |
| Phase 3 — play-in soft gate | **wired** (2026-05-25) — `bracketPlayInGateHint` banner + MAIN column fade when `!isPlayInPhaseComplete` |
| i18n | **58** `gameDetails.bracket*` keys — en, cs, es, ru, sr complete; duplicate `bracketColumnPlayIn` removed in en (others if still dup) |

§18 manual/E2E rows unchanged. No FE blockers for V1.

---

## 21. Cross-group bracket playoffs (planned)

### 21.1 Problem statement

Regular season uses **multiple `LeagueGroup`s**. After group play, organizers need **one** knockout for the season — e.g. **4 groups × top 2 = 8 teams**, single QF → SF → Final with cross-group matchups (A1 vs D2 in QF when seeded with `WINNERS_THEN_RUNNERS_UP`).

**V1 bracket (shipped):** `PER_GROUP` only — one tree per group in the same `LeagueRound`.

**This section:** `CROSS_GROUP` on the same `PlayoffFormat.BRACKET` stack (`buildBracketPlan`, advancement, edit rules unchanged; only pool construction and scope differ).

**Locked decisions:**

- **Automatic qualification:** equal **K** per **included** group (same N per group).
- **`Game.leagueGroupId`:** **`null`** for cross-group bracket matchups.
- **`LeagueBracketSlot.leagueGroupId`:** **`null`** for cross-group slots.
- **Origin group in UI:** from `LeagueParticipant.currentGroupId` (and optional DTO `originGroup`).

---

### 21.2 Product definition

| Aspect | `PER_GROUP` (default) | `CROSS_GROUP` |
|--------|----------------------|---------------|
| Trees per round | One per group in `groups[]` | **Exactly one** |
| Entrant pool | 2–16 **per group** | 2–16 **total** (K × G) |
| Auto qualification | Independent per group (existing UI) | **Equal K** per included group |
| Manual qualification | Per-group selection + order | Global ordered list; **exactly K per included group** |
| Global seeding | N/A | `globalParticipantIds` 1..N → `buildBracketPlan(N, ids)` |
| Auto seed preset (default) | N/A | **`WINNERS_THEN_RUNNERS_UP`** — all group #1s, then all #2s, … in group order |
| Optional auto preset | N/A | **`GROUP_BLOCK`** — A1,A2,B1,B2,… (worse early cross-group; optional V1) |
| Play-in / byes | Per-group N | On **combined** N (§15) |
| `Game.leagueGroupId` | Group id | **`null`** |
| Slot `leagueGroupId` | Required | **`null`** |
| UI group switcher on tree | Per group | **Hidden**; group badge on each team |
| Eligibility | `hasFixedTeams` | Same + season has **≥ 2** groups |
| Session playoffs (WC/Americano) | Per-group batch | **Out of scope** |

**Non-goals (V1 cross-group):**

- Unequal K per group in automatic mode.
- “Never same group until round X” seeding solver.
- Cross-group session playoffs.
- Re-seed after play-in (unchanged §1).

---

### 21.3 Qualification — equal K per group

**Rule:** Owner picks integer **K ≥ 1**. System takes **exactly K** teams from each **included** group, standings order (`compareStandings`).

**Validation:**

| Check | Error |
|-------|--------|
| `includedGroups.length < 2` | Cross-group requires ≥ 2 groups |
| Any included group has `< K` teams | Group `{name}` has only `{n}` teams |
| `K × G > 16` | Total exceeds maximum |
| `K × G < 2` | Total below minimum |
| Participant `currentGroupId` ≠ qualifier group | 400 |
| Duplicate participant across groups | 400 |

**Examples:**

| Groups G | K | Total N | First MAIN round (typical) |
|----------|---|---------|----------------------------|
| 4 | 2 | 8 | QF |
| 4 | 1 | 4 | SF |
| 3 | 2 | 6 | QF (+ play-in per §15) |
| 8 | 2 | 16 | R16 |

**Included groups:** Default = all season groups; owner may **exclude** a group (equal K among **included** only).

---

### 21.4 Global seed order

**Group order:** canonical sort of `LeagueGroup` (document `orderIndex` or `createdAt` in code).

**`WINNERS_THEN_RUNNERS_UP` (default for K ≥ 1):**

```text
for r in 0..K-1:
  for g in groupOrder:
    globalIds.push(qualifiers[g][r])
```

4×2 → `[A1,B1,C1,D1,A2,B2,C2,D2]` → standard 8-bracket → QF cross-group (1v8, 4v5, 2v7, 3v6).

**`MANUAL`:** Owner drags global list after auto-fill; POST sends `globalParticipantIds`.

**Pairing engine:** unchanged `buildBracketPlan(entrantCount, globalParticipantIds)`.

**New module:** `Backend/src/services/league/crossGroupBracketSeeding.ts` (+ FE mirror `Frontend/src/utils/crossGroupBracketSeeding.ts`).

```ts
buildEqualTopKQualifiers(groups, k): Record<groupId, string[]>
mergeGlobalParticipantIds(qualifiers, groupOrder, preset, manualOrder?): string[]
validateCrossGroupPool({ k, includedGroupIds, qualifiers, globalParticipantIds }): void
```

---

### 21.5 Data model

#### 21.5.1 `LeagueRound`

```prisma
enum BracketScope {
  PER_GROUP
  CROSS_GROUP
}

bracketScope         BracketScope      @default(PER_GROUP)
// CROSS_GROUP: entrantCount / bracketSize / byeCount = combined pool
```

**`bracketConfig` (CROSS_GROUP):**

```ts
{
  scope: 'CROSS_GROUP',
  equalTopK: number,
  includedGroupIds: string[],
  qualifiers: Record<groupId, { participantIds: string[] }>,
  globalParticipantIds: string[],
  seedingPreset: 'WINNERS_THEN_RUNNERS_UP' | 'GROUP_BLOCK' | 'MANUAL',
  seedingLocked?: boolean,
  audit?: [...]
}
```

**PER_GROUP round metrics fix (same effort):** When multiple groups have **different** N, do **not** store misleading `entrantCount` on round from first group only (current bug in `bracketPlayoff.service.ts`). **Recommended:** round-level `entrantCount` / `bracketSize` / `byeCount` **null** for `PER_GROUP` multi-group; per-group metrics in `bracketConfig.groups[g]` + derived in GET.

#### 21.5.2 `LeagueBracketSlot`

| Scope | `leagueGroupId` |
|-------|-----------------|
| `PER_GROUP` | Required (current) |
| `CROSS_GROUP` | **`null`** |

**Uniques:**

- `PER_GROUP`: `@@unique([leagueRoundId, leagueGroupId, slotKey])` (unchanged)
- `CROSS_GROUP`: `@@unique([leagueRoundId, slotKey])` — enforce in app + migration

#### 21.5.3 `Game`

| Field | PER_GROUP bracket | CROSS_GROUP bracket |
|-------|-------------------|---------------------|
| `leagueGroupId` | Group id | **`null`** |
| `leagueRoundId` | set | set |

**Standings sync:** `gameResults.service.ts` already skips when `!leagueGroupId` or `PLAYOFF` — cross games must **not** sync group points (intended).

---

### 21.6 Backend — create / read

**POST** `.../playoff/bracket` body:

```ts
{
  bracketScope?: 'PER_GROUP' | 'CROSS_GROUP'  // default PER_GROUP
  groups?: { leagueGroupId, participantIds }[]   // PER_GROUP only
  crossGroup?: {                                  // CROSS_GROUP only
    equalTopK: number,
    includedGroupIds?: string[],
    seedingPreset: 'WINNERS_THEN_RUNNERS_UP' | 'GROUP_BLOCK' | 'MANUAL',
    globalParticipantIds?: string[],
    qualifiers?: { leagueGroupId, participantIds }[],
  }
  gameSetup?: ...
}
```

Mutually exclusive: `groups` vs `crossGroup`. Reject `K×G` ∉ [2,16], any group `< K`, `< 2` included groups.

**CROSS_GROUP transaction:**

1. One `LeagueRound` (`bracketScope: CROSS_GROUP`, metrics from combined plan).
2. Single `persistBracket` — slots `leagueGroupId: null`.
3. Initial/lazy games via `createLeagueGame` with **`leagueGroupId: null`**.

**GET** response:

- `round.bracketScope`
- `groups`: one entry `{ leagueGroupId: null, entrantCount, slots, ... }`
- Optional slot/participant: `originGroupId`, `originGroup { id, name, color }`
- Query `?leagueGroupId=` on cross round: ignore or **400** (document: ignore)

---

### 21.7 Backend — advancement & PATCH

**Refactor** `bracketAdvancement.service.ts` tree scope:

```ts
// PER_GROUP: where { leagueRoundId, leagueGroupId }
// CROSS_GROUP: where { leagueRoundId, leagueGroupId: null }
```

Apply to: `tryCreateReadyGames`, `onGameFinalized`, `onBracketGameResultsUndone`, `cascadeClearDescendants`, `createGameForSlot`, `attachGameToSlot`.

**`patchBracketSlots`:** Cross pool = `bracketConfig.globalParticipantIds` (not `config.groups[slot.leagueGroupId]`). Audit reorder updates `globalParticipantIds`.

Phase rules unchanged (§3.4).

---

### 21.8 Backend — routes & other services

**`league.routes.ts`:** Replace hard `groups[]` validator with discriminated body (§21.6).

**`deleteLeagueRound`:** Unchanged — deletes round games then round; slots cascade.

**`getLeagueRounds`:** Exposes `bracketScope` once on schema; games may have `leagueGroup: null`.

**`broadcast.service.ts` (round start):** Iterates all round games including `leagueGroupId: null`. Deep link via `leagueBracketDeepLink.util.ts` (Telegram + push):

- PER_GROUP: `?tab=schedule&subtab=bracket&group={id}`
- CROSS_GROUP: `?tab=schedule&subtab=bracket` (no `group`)

**No change:** `bracketStructure.ts`, golden fixtures (N = pool size), `outcomes.service` hook, WC/Americano create.

---

### 21.9 Frontend — API types

```ts
export type BracketScope = 'PER_GROUP' | 'CROSS_GROUP';

export interface BracketPlayoffGroupDto {
  leagueGroupId: string | null;
  // ...
}

export interface LeagueRound {
  bracketScope?: BracketScope;
  // ...
}

export type CreateBracketPlayoffRequest =
  | { bracketScope?: 'PER_GROUP'; groups: ...; gameSetup?: ... }
  | { bracketScope: 'CROSS_GROUP'; crossGroup: ...; gameSetup?: ... };
```

---

### 21.10 Frontend — creation (`PlayoffConfigurationModal`)

**Scope switch** (if `groups.length >= 2`):

- Separate bracket per group → `PER_GROUP` (current).
- One bracket across groups → `CROSS_GROUP`.

**Cross-group config:**

| Control | Behavior |
|---------|----------|
| K selector | Teams per group: 1, 2, 3…; max K = min(floor(16/G), minGroupSize) |
| Included groups | Checkboxes, default all |
| Structure summary | `BracketStructureSummary` on **total N** |
| Preset | `WINNERS_THEN_RUNNERS_UP` (default), optional `GROUP_BLOCK`, manual drag |
| Merged preview | Single `BracketPlayoffPreview` from global ids |
| Quick chips | “Top 1 / 2 / 3 per group” sets K for all |

**`canCreate`:** Cross mode uses `K × includedGroups ≥ 2`, not “each group chip ≥ 2” in isolation.

**Submit:** `createBracketPlayoff({ bracketScope: 'CROSS_GROUP', crossGroup: { ... } })` — do **not** send per-group `groups[]` trees.

---

### 21.11 Frontend — viewing

| Surface | PER_GROUP | CROSS_GROUP |
|---------|-----------|-------------|
| Schedule bracket tab | Group chips | No chips; always `groups[0]` |
| `activeBracketGroup` | By `selectedGroupId` | Ignore group filter; full tree |
| Fullscreen | `?group=` | Omit `group`; ignore invalid query |
| `LeagueBracketPodiumCard` link | `&group=` | No `group` param |
| Standings podium | Per group via `bracketGroupsById` | **One** season podium when `bracketScope === 'CROSS_GROUP'` |
| `LeagueGameCard` | Group tag from `game.leagueGroup` | Badge **Season playoff**; optional “A vs D” from participants |
| `LeagueRoundAccordion` | Games under group | **`gameDetails.seasonPlayoff`** section when `!leagueGroupId` (not “No group”) |
| List + group filter | Group-scoped games | Show cross games in Season playoff block even if Group B selected (§21.12) |

**`leagueGroupGameProgress`:** Ignores null `leagueGroupId` — cross playoff games excluded from per-group % (acceptable).

---

### 21.12 UX decisions (locked for implementation)

1. **Bracket tab with group filter selected:** Show **full** cross tree (recommended).
2. **List tab with group filter:** Cross playoff games visible under **Season playoff** section.
3. **Manual mode:** Still exactly **K per included group**; global drag for seed order.
4. **`GROUP_BLOCK` preset:** Optional in V1; default remains `WINNERS_THEN_RUNNERS_UP`.

---

### 21.13 i18n (5 locales)

| Key | EN example |
|-----|------------|
| `bracketScopePerGroup` | Separate bracket per group |
| `bracketScopeCrossGroup` | One bracket across groups |
| `bracketEqualTopK` | Teams per group |
| `bracketIncludedGroups` | Groups in playoff |
| `bracketCrossGroupSummary` | `{{total}} teams (top {{k}} from each of {{g}} groups)` |
| `bracketSeedingWinnersThenRunnersUp` | Group winners, then runners-up |
| `bracketSeedingGroupBlock` | By group (1st, 2nd in each group) |
| `bracketSeasonPlayoff` | Season playoff |
| `bracketOriginGroup` | Group {{name}} |
| `bracketErrorGroupTooSmall` | `{{group}}` has only `{{n}}` teams (need `{{k}}`) |
| `bracketErrorTotalOver16` | Too many teams for one bracket (max 16) |
| `bracketPodiumSeasonTitle` | Season champion |

Repurpose / avoid showing `gameDetails.noGroup` for intentional cross playoffs in accordion.

---

### 21.14 QA matrix (cross-group)

**Automated (BE):**

- [x] `buildEqualTopKQualifiers` — uneven group sizes, K=2
- [x] `mergeGlobalParticipantIds` — WINNERS_THEN_RUNNERS_UP order
- [x] `validateCrossGroupPool` — K×G>16, group too small
- [x] POST cross — one tree; slots and games `leagueGroupId null` (scope unit: `crossGroupBracketScope.test.ts`)
- [x] Advancement + undo scoped by round + null group (scope unit)
- [x] PATCH pool from `globalParticipantIds` (documented in scope test; full PATCH via manual E2E)
- [x] PER_GROUP regression unchanged (`bracketStructure` + scope test per-group filter)

**Automated (FE):**

- [x] K selector disabled when K×G > 16
- [x] Preview uses global N

**Manual E2E:**

- [ ] 4 groups × K=2; QF cross-group (1 vs 8)
- [ ] Standings: one podium (not per group)
- [ ] Schedule list: Season playoff section with group filter on Group B
- [ ] Fullscreen without `group` param
- [ ] `Game.leagueGroupId` null in API/DB

---

### 21.15 Implementation phases (5a–5i)

| Phase | Deliverable |
|-------|-------------|
| **5a** | Schema `BracketScope`, nullable slot `leagueGroupId`, unique rules, migrate existing → `PER_GROUP` |
| **5b** | `crossGroupBracketSeeding.ts` + unit tests (BE; FE mirror) |
| **5c** | BE create/GET cross; round metrics fix for PER_GROUP |
| **5d** | Advancement/PATCH scope; `game.leagueGroupId = null` |
| **5e** | Express discriminated POST validation |
| **5f** | FE create wizard (scope, equal K, merged preview) |
| **5g** | Schedule, bracket, fullscreen, podium, accordion, game card |
| **5h** | Edit overlay + API types |
| **5i** | QA checklist + §20 rows |

**Dependency:** 5a → 5b → 5c → 5d → 5e → 5f–5h → 5i.

---

### 21.16 Files touched

| Area | Files |
|------|--------|
| Schema | `Backend/prisma/schema.prisma` |
| Seeding | `crossGroupBracketSeeding.ts` (BE + FE) |
| Create/GET/PATCH | `bracketPlayoff.service.ts`, `league.controller.ts`, `league.routes.ts` |
| Advancement | `bracketAdvancement.service.ts` |
| FE create | `PlayoffConfigurationModal.tsx`, `CrossGroupBracketConfigStep.tsx`, `CrossGroupBracketSeedList.tsx` |
| FE view | `LeagueScheduleTab.tsx`, `LeagueBracketView.tsx`, `LeagueBracketSlotCard.tsx`, `LeagueBracketFullscreenPage.tsx`, `LeagueBracketPodiumCard.tsx`, `LeagueStandingsTab.tsx`, `LeagueRoundAccordion.tsx`, `LeagueGameCard.tsx`, `BracketEditOverlay.tsx` |
| API | `Frontend/src/api/leagues.ts` |
| i18n | `gameDetails.json` × 5 |

---

### 21.17 Diagram — 4 groups × K=2

```text
Regular:  A,B,C,D groups
Qualify:  top 2 each → 8 teams
Seed:     A1,B1,C1,D1,A2,B2,C2,D2  (WINNERS_THEN_RUNNERS_UP)
Tree:     single KO; slots + games leagueGroupId = null
QF:       1v8  4v5  2v7  3v6  → e.g. A1 vs D2 in 1v8
```

---

### 21.18 Downstream consumers (`leagueGroupId`)

#### A. Must update

| Consumer | Change |
|----------|--------|
| `bracketAdvancement.service.ts` | Tree scope by round + null `leagueGroupId`; games created with null |
| `patchBracketSlots` | Pool = `globalParticipantIds` when cross |
| `league.routes.ts` | Discriminated POST body |
| `PlayoffConfigurationModal` | Scope toggle, equal K, cross submit |
| `LeagueScheduleTab` | `activeBracketGroup`, hide chips, list/accordion rules |
| `LeagueStandingsTab` | Single podium; `bracketGroupsById` null key |
| `LeagueBracketFullscreenPage` | Ignore `?group=` for cross |
| `LeagueBracketPodiumCard` | URL without `group` |
| `LeagueGameCard` | Season playoff badge |
| `LeagueRoundAccordion` | Season playoff label + visibility |
| `BracketEditOverlay` | Global pool + origin badges |
| `api/leagues.ts` | Types union + `leagueGroupId: null` |

#### B. Behavior note only (no code change expected)

| Consumer | Note |
|----------|------|
| `gameResults.service.ts` | Skips null `leagueGroupId` and PLAYOFF |
| `leagueGroupGameProgress.ts` | Null games excluded from group bars |
| `leagueFixtureMatrix.ts` / `recreateRegularSeason` | Null games excluded |
| `leagueStandingsRecalculate` | `leagueGroupId not null` filter |
| `bracketStructure.ts` / fixtures | N = global pool size only |

#### C. Future (§19 extension)

- Unequal K automatic mode
- Constraint-based “avoid same group early” seeding
- ~~Bracket round picker when multiple KO rounds exist~~ (done — `BracketRoundPicker`)
- ~~§16 advance notifications with scope-aware links~~ (done — assigned-game notify on lazy create)
- Telegram bracket summary image

---

## 19. Future (out of V1 scope)

- ~~**Third-place match** between SF losers~~ — **implemented** (Phase 4; `includeThirdPlace` on POST)
- ~~**Consolation bracket** for early losers~~ — **implemented** (`includeConsolationBracket` on POST; `CONSOLATION` slots + `CONS-*` tree; FE tab)
- ~~**Double elimination**~~ — **implemented** (`includeDoubleElimination` on POST; `LOSERS` + `GRAND_FINAL`; FE Winners/Losers/Grand final tabs)
- ~~**Custom bye assignment** (owner picks which seed gets bye instead of top seeds)~~ — **implemented** (`customByeSeedRanks` on POST)
- ~~**Arbitrary play-in pairings** (manual 5 vs 7, etc.)~~ — **implemented** (Phase 6c; `customPlayInPairings` on POST)
- ~~**Bracket image export / share link**~~ — **implemented** (Phase 4c `BracketShareToolbar`)
- ~~**Telegram bracket summary** after round complete~~ — **implemented** text + PNG via Telegram (Phase 4d/6d)
- **Bets resolution** — confirm behavior if league games have bets
- ~~**Stories** — champion promo slide~~ — **implemented** (`BRACKET_CHAMPION` + `BracketChampionStorySlide`)
- ~~**Cross-group:** unequal K per group in automatic mode~~ — **implemented** (Phase 6a; `teamsPerGroup` / `unequalK`); inter-group constraint seeding still future
- **Consolation bracket** — optional `includeConsolationBracket` (R0 MAIN losers only; parallel tree, lazy games)

---

## 20. Plan compliance audit (2026-05-25)

| Scope | ~% |
|--------|-----|
| **V1 core** (Phases 1–2 + backend + automated tests) | **~92%** |
| **Full plan §1–18** (incl. Phase 3 polish, §16 notifications) | **~85%** |

| Requirement | Status | Notes |
|-------------|--------|-------|
| **§1 Product — bracket name / third format** | IMPLEMENTED | `PlayoffFormat.BRACKET`; UI segment in `PlayoffConfigurationModal.tsx` |
| **§1 — `hasFixedTeams` only** | IMPLEMENTED | BE `bracketPlayoff.service.ts`; FE segment disabled + copy |
| **§1 — 2–16 teams, play-in + byes** | IMPLEMENTED | `bracketStructure.ts` + validation BE/FE |
| **§1 — CLASSIC 2-team games via `createLeagueGame`** | IMPLEMENTED | `bracketAdvancement.service.ts`; not session playoff |
| **§1 — seeding from standings order** | IMPLEMENTED | `getOrderedParticipantIds` / quick-select in modal |
| **§1 — advancement on FINAL, byes without game** | IMPLEMENTED | `onGameFinalized` + BYE feeders |
| **§1 — no re-seed after play-in** | IMPLEMENTED | Winner → `winnerSlotId`; PATCH locked after play-in FINAL |
| **§1 — playoff games skip standings** | IMPLEMENTED | `gameResults.service.ts` (`PLAYOFF` skip) |
| **§1 — play-in before MAIN (recommended gate)** | IMPLEMENTED | `isPlayInPhaseComplete`; list bias + tree banner/fade in `LeagueBracketView` |
| **§2 Prisma — enums + `LeagueBracketSlot` + round fields** | IMPLEMENTED | `schema.prisma` |
| **§2 — `bracketConfig` JSON** | IMPLEMENTED | `groups.participantIds`; PATCH `audit[]` |
| **§2 — optional `seedingLocked` in config** | IMPLEMENTED | `false` on create; PATCH slots rejected when `seedingLocked === true` (409). Time-based auto-lock (&lt;1hr) **OUT_OF_SCOPE** — use phase rules + explicit flag only |
| **§3.1 — `buildBracketPlan` N=2..16** | IMPLEMENTED | Golden `__fixtures__/bracket-2..16.json` |
| **§3.1 — tests** | IMPLEMENTED | BE: `bracketStructure`, `bracketSlotEdit`, `crossGroupBracketSeeding`, `crossGroupBracketScope`, `leagueBracketDeepLink`; FE vitest 7 files (44 tests) |
| **§9 — MAIN pairings 2/4/8/16** | IMPLEMENTED | `mainFirstRoundPairings` |
| **§15 — play-in virtual bracket mapping** | IMPLEMENTED | `playInPairings()` |
| **§3.2 — POST create + validation** | IMPLEMENTED | Routes + service checks |
| **§3.2 — lazy MAIN games** | IMPLEMENTED | `initialGameSlotKeys` + `tryCreateReadyGames` |
| **§3.3 — advancement hook** | IMPLEMENTED | `outcomes.service.ts` → `onGameFinalized` |
| **§3.3 — unsync cascade + block downstream FINAL** | IMPLEMENTED | `onBracketGameResultsUndone` |
| **§3.4 — PATCH phase rules** | IMPLEMENTED | `bracketSlotEdit.util.ts` + `patchBracketSlots` |
| **§3.4 — audit log (optional)** | IMPLEMENTED | `bracketConfig.audit` on PATCH |
| **§3.5 — GET payload** | IMPLEMENTED | Slots, games, labels, `championParticipantId` |
| **§5 — create: Bracket segment** | IMPLEMENTED | `PlayoffConfigurationModal.tsx` |
| **§5 — structure summary + quick Top N** | IMPLEMENTED | `BracketStructureSummary.tsx` |
| **§5 — preview tree** | IMPLEMENTED | `BracketPlayoffPreview.tsx` (read-only) |
| **§5 — preview drag reseed before create** | IMPLEMENTED | `BracketPlayoffPreview` tap-swap + `bracketPreviewReorder.util.ts`; order sent on POST |
| **§5 — CLASSIC game setup step** | IMPLEMENTED | `BracketPlayoffGameSetupStep.tsx` |
| **§6 — schedule: Bracket / List / My games** | IMPLEMENTED | `LeagueScheduleTab.tsx` |
| **§6 — `LeagueBracketView` + fullscreen route** | IMPLEMENTED | `App.tsx` `/games/:id/league-bracket` |
| **§6 — list Play-in / Knockout filters** | IMPLEMENTED | `LeagueBracketListPanel.tsx` |
| **§6 — BYE ghost cards, match statuses** | IMPLEMENTED | `LeagueBracketByeCard.tsx`, `leagueBracketMatchStatus.ts` |
| **§6 — owner Edit bracket** | IMPLEMENTED | `BracketEditOverlay.tsx` |
| **§7 — podium + view bracket link** | IMPLEMENTED | `LeagueBracketPodiumCard.tsx` |
| **§8 — FE API POST/GET/PATCH** | IMPLEMENTED | `Frontend/src/api/leagues.ts` |
| **§10 — N 5,7,9 play-in; reject &lt;2 &gt;16** | IMPLEMENTED | BE + FE metrics tests |
| **§10 — multi-group trees** | IMPLEMENTED | `PER_GROUP` create/GET; `CROSS_GROUP` BE §21.5–21.8 |
| **§10 — walkover / forfeit** | IMPLEMENTED | `POST .../slots/:slotId/walkover`; optional `skipGameFinal` |
| **§10 — result correction cascade** | IMPLEMENTED | Util + advancement service |
| **§10 — multiple bracket rounds** | IMPLEMENTED | `BracketRoundPicker`; `listBracketRounds`; `roundId` on GET/edit |
| **§16 — notifications** | IMPLEMENTED | `bracketGameNotification.service.ts`; reuse `sendLeagueGameAssignedNotification`; round-start deep links via `leagueBracketDeepLink.util.ts` |
| **§16 — list sort play-in first** | IMPLEMENTED | FE list panel + BE `getLeagueRounds` sort via `bracketScheduleListSort.util.ts` (play-in → MAIN `roundIndex` → time) |
| **§17 — permissions** | IMPLEMENTED | Owner/admin on routes + service |
| **§18 — automated QA matrix** | IMPLEMENTED | Checkboxes in §18 |
| **§18 — manual E2E** | MISSING | Open in §18 |
| **Phase 3 — path highlight** | IMPLEMENTED | `LeagueBracketView` + fullscreen |
| **Phase 3 — play-in soft gate UI** | IMPLEMENTED | Banner + MAIN de-emphasize in tree view |
| **Phase 3 — i18n 5 locales** | IMPLEMENTED | ~61 `bracket*` keys; dup `bracketColumnPlayIn` all locales |
| **§19 — third place + custom bye** | IMPLEMENTED | POST `includeThirdPlace` / `customByeSeedRanks`; BE `THIRD_PLACE` + `test:bracket-structure` |
| **§19 — bracket export/share + Telegram summary** | IMPLEMENTED | Phase 4c–4d + 6d PNG |
| **§19 — cross-group unequal K** | IMPLEMENTED | Phase 6a |
| **§19 — custom play-in pairings** | IMPLEMENTED | Phase 6c |
| **§19 — consolation bracket** | IMPLEMENTED | `includeConsolationBracket` (R0 MAIN losers) |
| **§19 — double elimination** | IMPLEMENTED | `includeDoubleElimination`; `LOSERS` + `GRAND_FINAL` |

**Top gaps:** §18 manual E2E; §21.14 manual E2E. See **§22** for living open items.

| **§20 — API hard play-in gate (optional)** | IMPLEMENTED | `playInPhaseComplete` + `assertPlayInCompleteForMainBracketGame` — 409 on MAIN finalize/schedule |

| **§21 — `BracketScope` + schema** | IMPLEMENTED | §21.5 |
| **§21 — equal K auto + seeding module** | IMPLEMENTED | §21.3–21.4 |
| **§21 — POST/GET cross payload** | IMPLEMENTED | §21.6 |
| **§21 — advancement/PATCH null scope** | IMPLEMENTED | §21.7 |
| **§21 — `Game.leagueGroupId` null** | IMPLEMENTED | §21.5.3 |
| **§21 — FE create scope + K UI** | IMPLEMENTED | §21.10 (5f) |
| **§21 — FE view/podium/accordion/card** | IMPLEMENTED | §21.11, §21.18A |
| **§21 — route validation** | IMPLEMENTED | §21.8 |
| **§21 — PER_GROUP round metrics fix** | IMPLEMENTED | §21.5.1 |
| **§21 — cross-group QA / E2E** | PARTIAL | §21.14 automated done; manual E2E open |

---

## 22. What's left (living)

Open items after V1 implementation pass (2026-05-25). Remove rows when closed.

| Item | Type | Status | Notes |
|------|------|--------|-------|
| §18 — Create only creates games for known sides | manual | OPEN | POST `playoff/bracket` then inspect DB/API |
| §18 — Play-in FINAL advances winner to MAIN feeder | manual | OPEN | Simulate FINAL on play-in games |
| §18 — BYE teams in correct MAIN slot without game | manual | OPEN | UI/API spot-check per N |
| §18 — Full run to champion | manual | OPEN | End-to-end result entry through final |
| §18 — Multi-group independent trees | manual | OPEN | POST with multiple `groups[]` |
| §21.14 — 4×K=2 QF cross-group (1 vs 8) | manual | OPEN | Verify pairing in UI |
| §21.14 — Standings one season podium | manual | OPEN | `CROSS_GROUP` standings tab |
| §21.14 — List + group filter → Season playoff section | manual | OPEN | Group B filter + cross games visible |
| §21.14 — Fullscreen without `group` param | manual | OPEN | Cross-group deep link |
| §21.14 — `Game.leagueGroupId` null in API/DB | manual | OPEN | Inspect created cross games |
| §10 — Walkover / forfeit | code | DONE | `POST .../playoff/bracket/slots/:slotId/walkover` |
| §17 — Slot PATCH audit beyond JSON | code | OUT_OF_SCOPE | `bracketConfig.audit[]` only; no audit table |
| §2 — Time-based `seedingLocked` auto (&lt;1hr) | code | OUT_OF_SCOPE | Explicit flag + phase rules only |
| §2 — Owner `seedingLocked` toggle | code | DONE | PATCH `seedingLocked`; `LeagueBracketView` lock/unlock |
| §19 — Third-place match | code | DONE | BE `THIRD_PLACE` + FE 4a |
| §19 — Custom bye assignment | code | DONE | BE + FE 4b |
| §19 — Bracket image export / share | frontend | DONE | Phase 4c |
| §19 — Telegram bracket summary | code | DONE | Text + deep link + PNG (`sendPhoto`) |
| §19 — Cross-group unequal K | code | DONE | `teamsPerGroup` / `unequalK` |
| §19 — Custom play-in pairings | code | DONE | `customPlayInPairings` |
| §19 — Consolation bracket | code | DONE | `includeConsolationBracket` (R0 MAIN losers) |
| §19 — Champion promo story slide | code | DONE | `StorySourceType.BRACKET_CHAMPION`; feed + `BracketChampionStorySlide` |
| §19 — Double elimination | code | DONE | `includeDoubleElimination`; `LOSERS` + `GRAND_FINAL` |

---

## Current codebase references

- Playoff creation: `Backend/src/services/league/create.service.ts` (`createPlayoff`, `createPlayoffBatch`)
- Session playoff games: `Backend/src/services/league/gameCreation.util.ts` (`createLeaguePlayoffGame`)
- Regular fixed-team matchups: `createLeagueGame`, `fixedTeamsRoundRobinFill.ts`
- Playoff UI: `Frontend/src/components/GameDetails/PlayoffConfigurationModal.tsx`
- Schedule tab: `Frontend/src/components/GameDetails/LeagueScheduleTab.tsx`
- Standings skip for playoff: `Backend/src/services/league/gameResults.service.ts`
- Cross-group seeding: `Backend/src/services/league/crossGroupBracketSeeding.ts`
- Bracket advancement (scope refactor for §21): `Backend/src/services/league/bracketAdvancement.service.ts`
