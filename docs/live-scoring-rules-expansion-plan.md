# Live scoring — rules expansion plan

This document captures how match formats are defined today, where set rows come from, and a concrete plan to extend live scoring for **super tie-break**, **points / Americano** games, and **match completion** (no phantom sets, clear finished state). It is meant to stay in sync with implementation in:

- `Frontend/src/utils/liveScoring/core.ts`
- `Backend/src/services/results/liveScoringEngine/core.ts` (keep byte-for-byte aligned with the frontend copy)
- `Frontend/src/utils/scoring/rulebook.ts` / `Backend/src/services/results/liveScoringEngine/rulebook.ts`
- `Frontend/src/utils/scoring/displaySets.ts`, `Frontend/src/utils/scoring/matchWinner.ts`, `Frontend/src/utils/scoring/validateSet.ts`
- `Backend/src/services/results/matchLiveScoring.service.ts`, `Backend/src/services/results/liveScoringEngine/liveScoringTransitionVerify.ts`
- `Backend/src/services/results/generation/roundGenerator.ts`

Related audit: `docs/watch-vs-live-scoring-audit.md`.

---

## 1. Scoring presets and rule fields

Presets are enumerated in Prisma (`ScoringPreset`) and mapped in `rulebook.ts` via `PRESETS` / `getRulesFromPreset` / `getRules(game)`.

| Category | Presets | Notes |
|----------|---------|--------|
| Best-of classic | `CLASSIC_BEST_OF_3`, `CLASSIC_BEST_OF_5` | Games per set, `winBy`, tie-break at `tieBreakGameAtGames`, TB to `tieBreakGameFirstTo` / `tieBreakGameWinBy` |
| Super TB decider | `CLASSIC_SUPER_TIEBREAK` | `superTieBreakReplacesDeciderAtIndex: 2` — the **third official set row** is a **match-deciding super tie-break** (point race on that row with `isTieBreak: true`) |
| Single / pro / short / timed | `CLASSIC_SINGLE_SET`, `CLASSIC_PRO_SET`, `CLASSIC_SHORT_SET`, `CLASSIC_TIMED` | Pro set: 9 games, TB at 8–8; short set: 4 games, TB at 3–3; timed classic may allow incomplete games via `allowIncompleteRegularSetGames` |
| Points cap (“Americano-style” per match) | `POINTS_16`, `POINTS_21`, `POINTS_24`, `POINTS_32` | `ballsInGames: false`, `totalPointsPerSet` = cap, `winnerOfMatch: 'BY_SCORES'` |
| Open-ended | `TIMED`, `CUSTOM` | Weaker invariants; needs explicit product rules for live |

**Classic vs points mode in live state**

- `isClassicRules(rules)` ⇔ `rules.ballsInGames && rules.winnerOfMatch === 'BY_SETS'`.
- `createInitialLiveScoringState` sets `mode` to `'classic'` or `'points'` from that.

Other important fields:

- `minSetsToWin`, `maxSetsPlayed`, `fixedNumberOfSets`
- `superTieBreakFirstTo`, `superTieBreakWinBy`
- `maxPointsPerTeam` (from game row, merged in `getRules`)
- `allowDrawPerSet` (draws in points-style sets when totals tie)
- `hasGoldenPoint` — **not** implemented in live classic today (still deuce / advantage); see audit doc

---

## 2. Where set rows are created (beyond live scoring)

Several layers create or extend the `sets` array. They must stay consistent after live-scoring changes.

### 2.1 Round generator

`Backend/src/services/results/generation/roundGenerator.ts`:

- `initialSetRowsForMatch`: for classic **BY_SETS**, row count = `floor(fixedNumberOfSets / 2) + 1` (e.g. Bo3 with `fixedNumberOfSets === 3` → **2** empty rows), not all three slots up front.

### 2.2 Results / display helpers

`Frontend/src/utils/scoring/displaySets.ts`:

- **`initialSetsForRules`**: for classic multi-set, starts with `max(1, rules.minSetsToWin)` empty official rows (e.g. Bo3 → **2** rows).
- **`shouldAppendSetAfterUpdate`**: appends the next official row when all current official rows are scored, match not yet decided, under cap; sets **`isTieBreak: true`** on the new row iff `official.length === rules.superTieBreakReplacesDeciderAtIndex` (super-TB decider).
- **`expandSetsForDisplay`**: when match **is** decided, trims official display to **only scored** rows (+ supplemental).
- **`trimTrailingEmptyAfterDecision`**: same trim idea for persisted arrays.

Live PATCH persists `state.sets` as match rows (`matchLiveScoring.service.ts` deletes and recreates `Set` records from normalized live rows).

---

## 3. Super tie-break — current behavior and work items

### 3.1 What already works in live `core.ts`

- **Within-set tie-break**: `classic.withinSetTieBreak` with numeric `tieBreakA` / `tieBreakB`; completion writes the set row as e.g. 7–6 games, `isTieBreak: false` (`finishWithinSetTieBreak`).
- **Match super tie-break**: when the **active set row** has `isTieBreak === true`, points increment `set.teamA` / `set.teamB` directly; completion uses `pointRaceCompleted(..., superTieBreakTarget(rules), rules.superTieBreakWinBy)`.
- **Serve guide** (`Frontend/src/utils/liveScoring/serveGuide.ts`) uses `activeSetIsSuperTieBreak(state)` for correct strip behavior.

### 3.2 Gaps / plan

1. **Decider row must exist with `isTieBreak: true` before STB scoring**  
   Align live initialization or first transition after 1–1 with **`shouldAppendSetAfterUpdate`** semantics so the third row matches what the results table expects.

2. **Optional vs mandated super TB**  
   If `superTieBreakReplacesDeciderAtIndex` is set, the format **mandates** STB at that index. If the product ever supports “normal third set vs STB” when the index is unset, that is **UI + explicit state** (Watch already has `pendingSetFormatChoiceIndex`; web live may need an equivalent).

3. **Verification**  
   Golden / unit tests: CLASSIC_SUPER_TIEBREAK path completes STB row; no further set advance after match decided (see section 5).

---

## 4. Points game / Americano — gap vs validation layer

### 4.1 Rest of app

`Frontend/src/utils/scoring/validateSet.ts` — `validatePointsSet`:

- If `rules.totalPointsPerSet > 0`, requires **`a + b === rules.totalPointsPerSet`** for a completed points set (exact ball budget split between teams).
- Respects **`allowDrawPerSet`** (no draw when disallowed and `a === b > 0`).
- `isLegalSetScore` routes POINTS kind through this.

`Frontend/src/utils/scoring/matchWinner.ts` — `computeMatchWinner` for `BY_SCORES`:

- Sums **official** played set points across rows; winner when totals differ (no “first to N” race separate from row totals—usually one row).

### 4.2 Live engine today

In `scoreLivePoint`, **points mode** branch:

- Increments one side only, hard cap **99** per team.
- Does **not** enforce `totalPointsPerSet`, `maxPointsPerTeam`, or exact `a + b` budget.
- Does **not** freeze scoring when the match outcome is already determined under those rules.

### 4.3 Plan

1. **Define tap semantics**: e.g. one tap = one ball for that team → enforce **`teamA + teamB <= totalPointsPerSet`** (and per-team max if `maxPointsPerTeam > 0`).
2. **Completion**: when `teamA + teamB === totalPointsPerSet` (and validation passes), treat as **match complete** for UI; winner from `computeMatchWinner` / same rules as table.
3. **Draws**: if `allowDrawPerSet` and totals tie at full cap, match may end with no winner side where product allows.
4. **TIMED** / zero total: document whether live remains a free counter or follows another rule; align with `validateTimedSet` / custom paths.
5. **Transition verifier** (`liveScoringTransitionVerify.ts`): extend so PATCH cannot jump past allowed points budgets.

---

## 5. Match finished — do not advance or fabricate sets

### 5.1 Display layer already guards appends

`shouldAppendSetAfterUpdate` returns **`null`** when `computeMatchWinner(official, rules) !== null` — no new row after decision.

`expandSetsForDisplay` trims official rows to **scored-only** when decided.

### 5.2 Live core gap

`canAdvanceLiveSet`:

- Requires current set “complete” (classic set, within-set TB resolution, or super TB point race).
- Requires `activeSetIndex + 1 < rules.maxSetsPlayed`.
- Does **not** check **`minSetsToWin` / `computeMatchWinner`**.

`autoAdvanceCompletedSets` loops `advanceLiveSet` while `canAdvanceLiveSet` is true — so after e.g. **2–0** in Bo3, the engine can still **advance `activeSetIndex`** into another row (or `ensureSetExists` can materialize empty trailing rows) while `maxSetsPlayed` still allows, which is the “phantom set 3” problem.

### 5.3 Plan

1. **Gate advancement on match not decided**  
   Before advancing (or inside `canAdvanceLiveSet`), compute winner from **official** sets that are already complete / scored per product rules — mirror **`computeMatchWinner`** + **`isOfficialMatchSet`** (and roles) so live matches the results model.

2. **Normalize state after scoring**  
   Optionally apply logic equivalent to **`trimTrailingEmptyAfterDecision`**: drop trailing empty official rows and clamp **`activeSetIndex`** to the last relevant scored set so UI and DB rows do not show an extra empty set after a win.

3. **UI**  
   On `GameLiveMatchPage` / `LiveScoreShell` / `LiveScoreCenter`: disable score and undo when **`isMatchDecided`**, show clear **match complete** affordance.

4. **Backend**  
   If normalization runs client-side, ensure **`isLiveScoringTransitionWithinSteps`** and validation reject illegal “extra rows after decision” so malicious PATCHes cannot diverge.

---

## 6. Tests and parity

### 6.1 Files to extend

- `Frontend/src/utils/liveScoring/core.test.ts`  
  Suggested cases:
  - Bo3 **2–0** without decider: **`activeSetIndex`** does not land on a new empty third official row (or sets array trimmed as designed).
  - **CLASSIC_SUPER_TIEBREAK** at 1–1: third row STB completes; then no further advance.
  - **POINTS_21** (or similar): scoring stops when **21 balls** allocated; winner/draw matches `computeMatchWinner` / `validatePointsSet`.

### 6.2 Parity rule

Any change to `Frontend/src/utils/liveScoring/core.ts` must be duplicated in `Backend/src/services/results/liveScoringEngine/core.ts` (or shared via a future package — today they are intentionally mirrored).

### 6.3 Transition verifier

Update `Backend/src/services/results/liveScoringEngine/liveScoringTransitionVerify.ts` (and any frontend mirror if present) when completion gating or points caps change **step depth** or legality.

---

## 7. Watch app (BandejaWatch)

`docs/watch-vs-live-scoring-audit.md` lists divergences: deuce path, hardcoded games/win-by, TB targets, super-TB index list, auto-advance, completion gating.

**After** web/backend live rules are canonical:

- Align **`MatchScoringViewModel.swift`** with the same completion, points cap, and super-TB index rules; or ship full **`ScoringRules`** on the watch payload and drive behavior from one struct (`WatchScoringRules.swift` is already intended as a mirror).

---

## 8. Optional / later

- **`hasGoldenPoint`**: implement in live classic or explicitly document as unsupported in live.
- **League / templates**: `Backend/src/services/league/gameCreation.util.ts`, `Frontend/src/utils/gameFormat/scoringCompatibility.ts` — Americano often maps to `POINTS_*`; revisit only if new presets or caps are added.

---

## 9. Checklist (implementation order)

1. [ ] Match-decided gate in `canAdvanceLiveSet` / `autoAdvanceCompletedSets` (+ optional trim + `activeSetIndex` clamp); sync backend `core.ts`.
2. [ ] Points mode: enforce `totalPointsPerSet` (+ `maxPointsPerTeam`); freeze taps when decided; tests.
3. [ ] Super TB: ensure decider row append + `isTieBreak` matches `shouldAppendSetAfterUpdate`; tests for CLASSIC_SUPER_TIEBREAK.
4. [ ] UI: disabled scoring + match complete on live pages / broadcast if needed.
5. [ ] Backend: transition verifier + any `assertMatchNormalizedSetsValid` expectations.
6. [ ] Watch: follow-up alignment per audit.

---

*Last updated: aligned with codebase structure as of the live scoring / rulebook / displaySets / matchWinner / roundGenerator layout described above.*
