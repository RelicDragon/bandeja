# Live scoring — rules expansion plan

This document captures how match formats are defined today, where set rows come from, and a concrete plan to extend live scoring for **super tie-break**, **points / Americano** games, and **match completion** (no phantom sets, clear finished state). **Track delivery:** edit checkboxes in **§9**. It is meant to stay in sync with implementation in:

- `Frontend/src/utils/liveScoring/core.ts`
- `Backend/src/services/results/liveScoringEngine/core.ts` (keep aligned with the frontend copy — diff the two files when changing either)
- `Frontend/src/utils/scoring/rulebook.ts` / `Backend/src/services/results/liveScoringEngine/rulebook.ts`
- `Frontend/src/utils/scoring/displaySets.ts`, `Frontend/src/utils/scoring/matchWinner.ts`, `Frontend/src/utils/scoring/matchWinnerLive.ts`, `Frontend/src/utils/scoring/validateSet.ts`
- `Backend/src/services/results/liveScoringEngine/matchWinnerLive.ts` (mirrors frontend **`computeMatchWinnerLiveScoring`** semantics with inlined `isLegalSetScore`-style checks — update both sides when validation rules change)
- `Frontend/src/utils/liveScoring/labels.ts` (format-aware live board / TV copy helpers where used)
- `Backend/src/services/results/matchLiveScoring.service.ts`, `Backend/src/services/results/liveScoringEngine/liveScoringTransitionVerify.ts` (backend-only; no frontend mirror), `Backend/src/services/results/liveScoringEngine/liveScoringRejectReasons.ts`, `Backend/src/services/results/matchSetsValidation.ts`, `Backend/src/services/results/matchLiveScoringAudit.service.ts`
- `Backend/src/services/results/generation/roundGenerator.ts`

Related audit: `docs/watch-vs-live-scoring-audit.md`.

---

## 0. Agreed semantics and v1 scope (Phase 0)

This section locks product/engineering meaning before Phase 1 code changes. It does not change runtime behavior by itself.

### 0.1 Points mode — ball budget and completion

- **Tap semantics:** One control tap awards **one ball** to the tapped side: increment that team’s tally on the active official points row by 1 (`scoreLivePoint` in points mode; taps are **capped** per budget below).
- **Budget:** At all times **`teamA + teamB ≤ rules.totalPointsPerSet`** (when `totalPointsPerSet > 0`). Taps that would exceed the budget are **no-ops** (or rejected server-side once the verifier matches).
- **Per-team cap:** If **`rules.maxPointsPerTeam > 0`**, neither side may exceed that value; combined with the total cap, both must hold.
- **Completion:** The points “set” is **complete** when **`teamA + teamB === rules.totalPointsPerSet`** and the row satisfies **`validatePointsSet`** (exact split, draw rules via **`allowDrawPerSet`**).
- **Match outcome (results table):** Winner (or no winner on allowed draw) from **`computeMatchWinner`** over **official** rows (same mental model as the grid / `validateSet` path). There is no separate hidden “race to N” beyond those row totals for POINTS presets.
- **Match outcome (live scoring):** **`computeMatchWinnerLiveScoring`** — same official row selection, but each completed row must be **legally valid** (`isLegalSetScore` / points `validatePointsSet`) before it counts; avoids “phantom decided” on impossible partial classic rows.
- **After decision:** Once the **live** helper returns a definitive outcome (or an allowed draw), **no further point taps** change a winner side (Phase 1 + UX); table **`computeMatchWinner`** still applies where the product uses unscored table semantics.

### 0.2 Classic (`BY_SETS`) — when the match is “decided”

- **Source of truth for “decided” (table / static):** **`computeMatchWinner(officialSets, rules)`** using the same **official** set selection as elsewhere (**`isOfficialMatchSet`**, roles, supplemental split). **`minSetsToWin`** is reflected in the rules object used by that function (with **`maxSetsPlayed`**, etc.).
- **Live engine + live UI:** **`computeMatchWinnerLiveScoring`** / **`isMatchDecidedForLiveScoring`** — same counting rules, but only **completed official rows with legal scores** participate. **`canAdvanceLiveSet`**, **`normalizeLiveSetsAfterDecision`**, **`displaySets`**, **`isLiveScoringInputLocked`**, **`GameLiveMatchPage`**, **`GameBroadcastMatchPage`**, **`LiveScoreShell`**, **`LiveMatchCompleteBanner`**, backend **`liveScoringEngine/core.ts`**, and Watch **`WatchComputeMatchWinner`** / **`MatchScoringViewModel`** use this path for freeze / trim / banner / undo parity. **`MatchCard`** / **`HorizontalMatchCard`** deep-link to the full-screen live route; there is **no** in-grid embedded live scorer component.
- **Super tie-break:** The decider row is a normal official row with **`isTieBreak: true`** and point-race completion per **`superTieBreakFirstTo` / `superTieBreakWinBy`**; match still “decided” for live when **`computeMatchWinnerLiveScoring`** says so (table helper unchanged for grid-only flows).

### 0.3 Live PATCH vs results table edits (authority)

- **Live PATCH** (`PATCH .../live-scoring`): Writes **`state`** into match **`metadata`** (envelope + monotonic **`revision`**), and **replaces** persisted **`Set`** rows from normalized live **`state.sets`**. Uses **`baseRevision`** (and optional **`opId`** / **`clientMessageId`**) for idempotency and conflict detection (**409** on mismatch). While operators use live scoring, this path is the **primary writer** to the set grid **for that session**.
- **Results table `updateMatch`:** Rewrites teams and **`Set`** rows from the grid editor. **`match.metadata` live envelope is preserved** only when **rosters are unchanged** and the incoming **`sets`** grid is **byte-for-byte equal** to the grid reconstructed from the current live metadata (`normalizedMatchSetRowsEqual` to live-derived grid). Otherwise live metadata is **stripped** (**`liveScoringCleared`**), the client is notified, and the table payload is authoritative — **manual correction wins over stale live**.
- **Practical rule:** Do not edit the results table grid concurrently with live scoring unless you intend to **replace** live state; if the saved grid equals live, live continues unchanged.

### 0.4 Presets in v1 live-scoring expansion scope

| Area | In v1 scope (engine + parity + tests) | Deferred / explicit follow-up |
|------|----------------------------------------|--------------------------------|
| Classic ladder | `CLASSIC_BEST_OF_3`, `CLASSIC_BEST_OF_5`, `CLASSIC_SINGLE_SET`, `CLASSIC_PRO_SET`, `CLASSIC_SHORT_SET`, `CLASSIC_SUPER_TIEBREAK` | — |
| Points caps | `POINTS_16`, `POINTS_21`, `POINTS_24`, `POINTS_32` | — |
| Timed / open-ended | **`CLASSIC_TIMED` / `matchTimerEnabled`:** live supports **`timedClassicSetLock`** (partial set at operator lock when timer stopped + `allowIncompleteRegularSetGames`); deep results/timer merge beyond PATCH still per §10.2. | **`TIMED`**: open-ended / weak invariants — live behavior documented per product before claiming parity. **`CUSTOM`**: defer until custom rules are specified and validated in one place. |

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
- `hasGoldenPoint` — when true, live classic uses **golden point at 40–40** (`scoreLivePoint` / `unscoreLivePoint`); center label **GP** in `getClassicPointLabels`; serve strip unchanged from standard game logic (§10.1)

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

### 3.2 Delivered (was “gaps / plan”)

1. **Decider row + `isTieBreak`** — **`alignMandatedSuperTieBreakDecider`** on parse/create; **`ensureSetExists`** / append semantics aligned with **`shouldAppendSetAfterUpdate`** / table expectations.
2. **Optional vs mandated super TB** — Mandated index uses STB row shape; when unset at Bo3 **1–1**, web uses **`LiveOptionalDeciderSheet`** + **`optionalDeciderFormat`**; Watch mirrors on **`WatchLiveScoringState`** and **`pendingSetFormatChoiceIndex`** on merge.
3. **Verification** — Covered in **`Frontend/src/utils/liveScoring/core.test.ts`** (super-TB completion, no phantom advance); see §6.

---

## 4. Points game / Americano — validation layer and live engine

### 4.1 Rest of app

`Frontend/src/utils/scoring/validateSet.ts` — `validatePointsSet`:

- If `rules.totalPointsPerSet > 0`, requires **`a + b === rules.totalPointsPerSet`** for a completed points set (exact ball budget split between teams).
- Respects **`allowDrawPerSet`** (no draw when disallowed and `a === b > 0`).
- `isLegalSetScore` routes POINTS kind through this.

`Frontend/src/utils/scoring/matchWinner.ts` — `computeMatchWinner` for `BY_SCORES`:

- Sums **official** played set points across rows; winner when totals differ (no “first to N” race separate from row totals—usually one row).

### 4.2 Live engine (implemented)

In **`scoreLivePoint`** (points / non-classic branch in `core.ts` + backend mirror):

- One tap increments the tapped side by 1; **`teamA + teamB ≤ rules.totalPointsPerSet`** when `totalPointsPerSet > 0` (otherwise no-op).
- **`maxPointsPerTeam`** enforced when `> 0`.
- Further taps no-op when the active row is **frozen**: full budget and **`validatePointsSet`** passes (**`isLivePointsFrozen`**), or when **`computeMatchWinnerLiveScoring`** / **`isLiveScoringInputLocked`** already lock input (includes allowed draw at cap with no winner side).

### 4.3 Deferred / follow-up

1. **`TIMED` / zero total:** open-ended counters — product rules before claiming full parity with table validation.
2. **Transition verifier** — graph depth and neighbor moves must stay aligned when caps or presets change (**`TRANSITION_MAX_DEPTH`** in `matchLiveScoring.service.ts`).

---

## 5. Match finished — do not advance or fabricate sets

### 5.1 Display layer guards appends

`shouldAppendSetAfterUpdate` returns **`null`** when **`computeMatchWinnerLiveScoring(official, rules) !== null`** — no new row after a live-decided match (same family as engine freeze).

`expandSetsForDisplay` trims official rows to **scored-only** when decided (via the same helper).

### 5.2 Live core (implemented)

- **`canAdvanceLiveSet`** returns **`false`** once **`computeMatchWinnerLiveScoring`** on official sets is non-null (match decided on **legal completed** official rows only).
- **`autoAdvanceCompletedSets`** respects the same gate (no phantom third set after **2–0** Bo3, etc.).
- **`normalizeLiveSetsAfterDecision`** trims trailing empty officials and clamps **`activeSetIndex`** after scoring when classic match is decided.

### 5.3 Backend

**`isLiveScoringTransitionWithinSteps`** + **`assertMatchNormalizedSetsValid`** reject illegal jumps; see §10.6 / §10.9.

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

Update **`Backend/src/services/results/liveScoringEngine/liveScoringTransitionVerify.ts`** when completion gating or points caps change **step depth** or legality (there is **no** duplicate verifier in the frontend).

---

## 7. Watch app (BandejaWatch)

Core preset parity (rules struct, deuce / GP, TB/STB targets, advance gates, points cap freeze, **`WatchValidateSet`**, optional decider + timed lock live fields, post-decision trim) is in **`MatchScoringViewModel.swift`** + **`WatchScoringRulebook`**. Open-ended / ops-only gaps stay in **`docs/watch-vs-live-scoring-audit.md` → “Next to implement”** item 6.

---

## 8. Optional / later

- **`hasGoldenPoint` (Watch):** **Done** — matches live (40–40 → game on next tap; **GP** in `ClassicScoringView`; legacy **deuce** normalized when GP on). See §9 Phase 7.
- **League / templates**: `Backend/src/services/league/gameCreation.util.ts`, `Frontend/src/utils/gameFormat/scoringCompatibility.ts` — Americano often maps to `POINTS_*`; revisit only if new presets or caps are added.

---

## 9. TODO progress checklist

**How to use:** Change `- [ ]` to `- [x]` when an item is done. Groups follow **§12 delivery phases**. For technical detail, see §§4–7 and §10.

### Phase 0 — Alignment

- [x] Write down agreed semantics: points ball budget (`totalPointsPerSet`), classic match decided (`minSetsToWin` / `computeMatchWinner`), authority of live PATCH vs results table edits.
- [x] List scoring presets / game types in **v1 scope** (and explicitly defer `CUSTOM` / open-ended if needed).

### Phase 1 — Engine MVP (`core.ts` + backend mirror)

- [x] Gate **`canAdvanceLiveSet`** on match not decided (official split + **`computeMatchWinnerLiveScoring`** / completed rows via **`isLegalSetScore`** — same family as results; supersedes naive `computeMatchWinner` on partial rows).
- [x] **`autoAdvanceCompletedSets`** respects the same gate; no phantom next set after 2–0 (etc.).
- [x] Optional: **`trimTrailingEmptyAfterDecision`**-style normalization + **`activeSetIndex`** clamp after score (product decision).
- [x] Duplicate all `Frontend/src/utils/liveScoring/core.ts` engine changes in **`Backend/src/services/results/liveScoringEngine/core.ts`** (incl. **`matchWinnerLive.ts`** mirror, **`ensureSetExists`** inserting officials before **`EXTRA_*`**).
- [x] **Points mode:** enforce `teamA + teamB <= rules.totalPointsPerSet` on each tap; no-op when at cap.
- [x] **Points mode:** enforce **`maxPointsPerTeam`** when `rules.maxPointsPerTeam > 0`.
- [x] **Points mode:** reject further taps when row complete (**`validatePointsSet`**) / match decided for live (**`computeMatchWinnerLiveScoring`**); draw when **`allowDrawPerSet`**.
- [x] **`Frontend/src/utils/liveScoring/core.test.ts`:** Bo3 **2–0** — no extra official set / wrong `activeSetIndex`.
- [x] **`core.test.ts`:** **POINTS\_\*** — total balls cap, winner vs **`computeMatchWinner`**; UI lock aligned via **`isOfficialPointsBallBudgetExhausted`** + **`validatePointsSet`**.
- [x] **`core.test.ts`:** **Super TB** row completes — match decided — no further set advance; supplemental ordering test.
- [x] **`Backend/.../liveScoringTransitionVerify.ts`:** allowed transitions match new completion / points caps (**`TRANSITION_MAX_DEPTH`** raised; verifier canonical **`role`**).

### Phase 2 — Super tie-break row parity

- [x] Before STB scoring: ensure decider row exists with **`isTieBreak`** aligned to **`shouldAppendSetAfterUpdate`** / table (`displaySets.ts`); **`alignMandatedSuperTieBreakDecider`** on parse/create.
- [x] Test **`CLASSIC_SUPER_TIEBREAK`**: at **1–1**, third row is STB; scoring completes match without row-shape drift vs persisted sets.

### Phase 3 — Web UX (control + broadcast)

- [x] **`GameLiveMatchPage`:** disable score + undo when **`isMatchDecidedForLiveScoring`** / **`isLiveScoringInputLocked`**; show match complete (optional link to results).
- [x] **`GameBroadcastMatchPage`** / TV / spectator: **no scoring gestures** when **`isMatchDecidedForLiveScoring`** (and match read-only policy elsewhere if required).
- [x] **`LiveScoreShell`** / **`LiveMatchCompleteBanner`:** completion banner, serve-guide hide, and status suppression use **`isMatchDecidedForLiveScoring`** / **`computeMatchWinnerLiveScoring`** (same as control page).
- [x] **Results match cards:** **`MatchCard`** / **`HorizontalMatchCard`** link to **`/games/:id/live?matchId=…`** (full-screen live); no separate embedded live entry component.
- [x] **Live board:** format-aware labels (pro set, short set, **STB** vs generic “Set *n*”) — reuse game results i18n where possible.

### Phase 4 — Backend hardening

- [x] Re-evaluate **`assertMatchNormalizedSetsValid`** + **`skipClassicGameScoreValidation`** on live PATCH; tighten only where safe (new `liveScoringActiveSetIndex` option still validates prior classic set rows).
- [x] Return **stable reject reason codes** (or i18n keys) on **400** invalid live transition; document codes for support (see §10.9).
- [x] **`matchLiveScoringAudit`:** log same code on reject (new `LIVE_PATCH_REJECT` source + `reasonCode` column).

### Phase 5 — Advanced rules (product-selected)

- [x] **`hasGoldenPoint`:** live classic next-point-wins at 40–40 when `rules.hasGoldenPoint`; `getClassicPointLabels` shows **GP**; backend mirror + verifier. Serve guide strip not GP-specialized (§10.1). Watch: same scoring + **GP** banner (Phase 7).
- [x] **`CLASSIC_TIMED` / `matchTimerEnabled`:** **`timedClassicSetLocked`** + **`freezeTimedClassicSetAtPartialScore`** / **`clearTimedClassicSetLock`**; control UI when timer **STOPPED** and `isGameMatchTimerEnabled`; **`classicSetCompleted`** respects lock with **`allowIncompleteRegularSetGames`**. Server does not re-verify wall-clock (§10.2).
- [x] **`role`:** `normalizeSets` + PATCH normalization preserve **`EXTRA_GAMES` / `EXTRA_BALLS`**; **`liveScoringTransitionVerify`** canonical sets include **`role`**; **`core.test.ts`** supplemental row; **`computeMatchWinner`** unchanged (official-only) (§10.3).

### Phase 6 — Optional decider UX (if in roadmap)

- [x] Web blocking sheet: **normal 3rd set vs super TB** when `superTieBreakReplacesDeciderAtIndex === null` and Bo3 is **1–1** on empty decider (`optionalDeciderChoicePending` / **`applyOptionalDeciderFormat`**); state persisted in live metadata for reload / merge (§10.4). Scope: **third official set only** (not Bo5 deciders).

### Phase 7 — Watch (BandejaWatch)

- [x] Ship or derive full **`ScoringRules`** on watch (**`WatchScoringRulebook`** / **`WatchScoringRules`**) — see **`docs/watch-vs-live-scoring-audit.md`**.
- [x] **Deuce:** one tap to advantage from 40–40 (match Live `core.ts`); legacy **`deuce`** normalized when **`hasGoldenPoint`**.
- [x] **Auto-advance** after set / STB; **`canAdvanceToNextSet`** gated on set actually complete.
- [x] **`superTieBreakReplacesDeciderAtIndex`** — no hardcoded decider index list; uses **`maxSetsPlayed`** for optional STB prompt.
- [x] Points cap + **match decided** freeze aligned with web/backend (**`isMatchDecidedForLiveScoring`**, TS **`isOfficialPointsBallBudgetExhausted`** / Watch **`isPointsOfficialBudgetExhausted`** — strict total + draw rule).
- [x] **`hasGoldenPoint`:** next tap from 40–40 awards the game; **GP** label on classic row (`ClassicScoringView`).

### Phase 7 follow-ups — Watch (audit gaps)

- [x] **`isLegalSetScore` parity:** **`WatchComputeMatchWinner`** / completion checks align with TS **`completedOfficialSetsForLive`** (do not rely on hand-rolled **`classicGamesRowComplete`** alone for “row counts toward live decided”).
- [x] **Optional decider in live PATCH:** **`WatchLiveScoringState`** + envelope merge include **`optionalDeciderFormat`** (or equivalent); **`pendingSetFormatChoiceIndex`** / sheet behavior must not be cleared blindly on every server apply (audit **Next to implement** item 2).
- [x] **`CLASSIC_TIMED` / `timedClassicSetLocked`:** watch live state + **`setCompleted` / `canAdvanceToNextSet`** respect **`allowIncompleteRegularSetGames`** when lock is set (mirror **`classicSetCompleted`** / **`canAdvanceLiveSet`** in `core.ts`).
- [x] **Post-decision trim:** mirror **`normalizeLiveSetsAfterDecision`** (trim trailing empty officials, clamp **`activeSetIndex`**) after auto-advance / decided match on Watch.
- [x] **`WatchScoringRulebook.derive(from:)`:** fix **`fixedNumberOfSets == 1`** mis-map to pro set when game is standard single or short set without **`scoringPreset`** (or document API-only fix: always send preset).
- [x] **`TIMED` preset on Watch:** do not schedule **`patchMatchLiveScoring`** when **`scoringPreset`** is **`TIMED`** (open-ended; no stable ball budget / parity with web deferral).

### Phase 8 — Edge ops

- [x] **Walkover / default / retired:** web + Watch block further official taps / read-only when **`metadata.nonRallyOutcome`** is WO / default / retired (§10.7); clearing incompatible live state on outcome set remains product follow-up if needed.
- [x] **409** conflict UX (web): control (and other live writer) paths merge server **`liveScoring`** envelope where possible; retry copy (§10.8).
- [x] **i18n:** match complete / draw / winner strings, STB/TB short labels, timed lock CTAs — **`gameDetails.liveScoring`** (**en** + parity locales); broaden product copy elsewhere only if needed.

### Cross-cutting

- [x] **`npm run test:live-scoring`** (or full `vitest`) green in CI after engine changes (`Frontend/src/utils/liveScoring/core.test.ts`).
- [x] **`docs/watch-vs-live-scoring-audit.md`** — parity + **“Next to implement (prioritized)”** for remaining Watch vs live gaps (legal rows, optional decider state, timed lock, trim, derive).

---

## 10. Completeness — beyond the core engine

### 10.1 Golden point (`hasGoldenPoint`)

Table-side rules can set `hasGoldenPoint` for classic BY_SETS. **Live (web + backend mirror):** when `rules.hasGoldenPoint`, at **regular 40–40** the next tap **awards the game** (`applyClassicPoint` → `awardGame`); legacy **`deuce`** point state is normalized to 40–40 regular on parse; **`getClassicPointLabels`** shows center **GP**. **`serveGuide.ts`** does not add separate GP serve logic (same game strip as deuce). **Watch:** same `awardGame` path from 40–40 when `rules.hasGoldenPoint`; **GP** label on the classic score UI.

### 10.2 Timed classic / buzzer (`CLASSIC_TIMED`, `matchTimerEnabled`)

`allowIncompleteRegularSetGames` relaxes validation for incomplete **regular** game rows when the match timer or timed preset applies. **Live:** operators can **lock** the current classic set at a partial games score via **`freezeTimedClassicSetAtPartialScore`** (sets **`timedClassicSetLocked`**); **`classicSetCompleted`** then allows set advance; **`GameLiveMatchPage`** exposes lock when the per-match timer is **STOPPED** and `isGameMatchTimerEnabled` (`matchTimer.ts`). **Not** enforced server-side against match timer fields on PATCH. **Follow-up:** tighter alignment with results/timer merge if product requires server-authoritative buzzer. **Watch:** **`timedClassicSetLocked`** + **`allowIncompleteRegularSetGames`** in **`classicSetCompleted`** / envelope merge; timer **Stop** calls **`lockTimedClassicSetAtPartialScore`** (**§9 Phase 7 follow-ups** done).

### 10.3 Supplemental set rows (`role`)

`Frontend/src/utils/matchSetRole.ts` — official vs `EXTRA_GAMES` / `EXTRA_BALLS`. Live **`normalizeSets`** / backend **`readSetsFromState`** preserve **`role`** and order; transition verifier canonical state includes **`role`** per row. **`core.test.ts`** covers supplemental **`EXTRA_GAMES`** in initial state. **`computeMatchWinner`** remains official-only.

### 10.4 UX — optional super TB, labels, broadcast

- **Optional decider format (web):** **`LiveOptionalDeciderSheet`** on **`GameLiveMatchPage`** when **`optionalDeciderChoicePending`** (Bo3, 1–1, empty third official row, mandated STB index unset); choice stored as **`optionalDeciderFormat`** + decider row **`isTieBreak`**. i18n: `gameDetails.liveScoring` keys (`deciderTitle`, etc., **en** locale). **Watch:** same **`optionalDeciderFormat`** on **`WatchLiveScoringState`** + **`pendingSetFormatChoiceIndex`** synced on envelope merge (**§9 Phase 7 follow-ups** done).
- **Labels:** Pro set, short set, and super TB rows should not all read as generic “Set *n*” on `LiveScoreCenter` / TV — use format-aware strings (STB abbreviation already exists in game results i18n).
- **Broadcast / TV:** When **`isMatchDecidedForLiveScoring`**, ensure **spectator and TV routes** never accept taps; control page shows completion and optional link to results.

### 10.5 Edge cases (points and outcomes)

- **Draw:** `allowDrawPerSet` + equal totals at full `totalPointsPerSet` — winner is null in `computeMatchWinner`; broadcast and standings copy must handle “tie / no side winner” explicitly.
- **`maxPointsPerTeam`:** Already validated in `isLegalSetScore` / `validateSetScores`; live points mode must enforce the same cap as taps accumulate.

### 10.6 Ops / backend hardening

- **`patchMatchLiveScoring`:** Still passes `skipClassicGameScoreValidation: true`, but **`liveScoringActiveSetIndex`** (from `state.activeSetIndex`) re-enables **`validateMatchClassicSetScores`** on **every official row except the active one** — prior sets cannot be silently invalid. Structural checks (role order, single TB row, TB placement rules) unchanged. **`TRANSITION_MAX_DEPTH`** lives in `matchLiveScoring.service.ts` (raised for deep graphs / points caps); keep verifier aligned when expanding neighbor moves.
- **Reject payloads:** Stable **`reasonCode`** on 400/409 (see §10.9). **`matchLiveScoringAudit`:** reject rows use source **`LIVE_PATCH_REJECT`** + **`reasonCode`**; successful PATCH remains **`LIVE_PATCH`**.

### 10.7 Walkover, default, retirement

**Web live:** when **`match.metadata.nonRallyOutcome`** is **`WALKOVER`**, **`DEFAULT`**, or **`RETIRED`**, scoring is treated as closed (same family as match decided). **Live PATCH** returns **`reasonCode: LIVE_NON_RALLY_OUTCOME`** (400) once that outcome is set. **Metadata:** **`PATCH /game/:gameId/matches/:matchId/metadata`** with `{ patch }` merges into **`match.metadata`**; if the merged outcome is closing, **`liveScoring`** is stripped from persisted metadata (response may include **`liveScoringCleared`**). **`PUT .../matches/:id`** may send optional **`metadata`**; same merge + strip when outcome closes live.

### 10.8 Conflicts (409)

When `baseRevision` mismatches: response includes **`reasonCode: LIVE_REVISION_MISMATCH`**, **`revision`**, and **`liveScoring`** envelope when present — merge server state, show “out of date — retry”, preserve writer intent where idempotent **`opId`** allows.

### 10.9 Live scoring reject reason codes (Phase 4)

Live PATCH responses include a stable `reasonCode` field on 400/409 errors. Codes are defined in
`Backend/src/services/results/liveScoringEngine/liveScoringRejectReasons.ts`. The same code is
written to `MatchLiveScoringAudit.reasonCode` on reject (source `LIVE_PATCH_REJECT`).

| Code | Status | Trigger |
|------|--------|---------|
| `LIVE_MISSING_STATE` | 400 | PATCH body missing `state` field. |
| `LIVE_INVALID_BASE_REVISION` | 400 | Non-finite `baseRevision`. |
| `LIVE_INVALID_IDEMPOTENCY_KEY` | 400 | `clientMessageId`/`opId` not matching `[A-Za-z0-9._-]{1,128}`. |
| `LIVE_MATCH_GAME_MISMATCH` | 400 | Match does not belong to URL `gameId`. |
| `LIVE_REVISION_MISMATCH` | 409 | `baseRevision !== currentRevision`; response includes server envelope. |
| `LIVE_INVALID_SETS` | 400 | Live sets array failed `assertMatchNormalizedSetsValid` (role order, TB rules, classic completed sets per `liveScoringActiveSetIndex`). |
| `LIVE_TRANSITION_OUT_OF_GRAPH` | 400 | `isLiveScoringTransitionWithinSteps` could not reach the new state from current state within `TRANSITION_MAX_DEPTH` (see `matchLiveScoring.service.ts`; raised for points caps / deep graphs). |
| `LIVE_NON_RALLY_OUTCOME` | 400 | **`metadata.nonRallyOutcome`** is **`WALKOVER`**, **`DEFAULT`**, or **`RETIRED`** — live PATCH is not allowed (§10.7). |

Server `assertMatchNormalizedSetsValid` accepts a `liveScoringActiveSetIndex` option that keeps
the in-progress active set exempt from classic completed-set checks but **still validates every
other classic row** — closing the gap where stale prior sets could slip past PATCH validation.

---

## 11. Out of scope (unless product expands)

- Per-rally stats (aces, faults), medical timeouts, line challenges.
- **Tournament-level** Americano aggregation (standings across rounds) — separate from per-match live state.

---

## 12. Delivery phases

Phases are ordered so each ends with something **shippable and testable**. Track granular work in **§9 TODO progress checklist** (`[ ]` → `[x]`).

### Phase 0 — Alignment (short)

- Locked in **§0**: points = fixed ball budget (`a + b === total` when complete); classic completion via **`computeMatchWinner`** / official sets; live PATCH vs table **`updateMatch`** (preserve vs clear live). **§0.4** = v1 preset scope; **`CUSTOM` / `TIMED` / `CLASSIC_TIMED`** deferred as listed.

### Phase 1 — Engine correctness (MVP)

- **Match decided:** gate `canAdvanceLiveSet` / `autoAdvanceCompletedSets` on **`computeMatchWinnerLiveScoring`** over official sets (completed rows only); optional trim + `activeSetIndex` clamp (phantom set fix). §9 Phase 1.
- **Points mode:** enforce `totalPointsPerSet` and `maxPointsPerTeam`; no-op at cap; respect `allowDrawPerSet`. §9 Phase 1 + Phase 8 i18n.
- Keep **`Frontend/src/utils/liveScoring/core.ts`** and **`Backend/src/services/results/liveScoringEngine/core.ts`** in lockstep.
- Tests: `Frontend/src/utils/liveScoring/core.test.ts` (e.g. Bo3 2–0, POINTS cap, STB row completes then match stops advancing).
- Update **`liveScoringTransitionVerify.ts`** for allowed step graphs. §9 Phase 1.

**Exit criteria:** PATCH + scoring match table validation for common Bo3, POINTS\_\*, and super-TB preset paths.

### Phase 2 — Super tie-break row parity

- Decider row exists with **`isTieBreak`** consistent with **`shouldAppendSetAfterUpdate`** / table before STB taps apply. §9 Phase 2.

**Exit criteria:** No row-shape drift between live metadata and results grid for `CLASSIC_SUPER_TIEBREAK`.

### Phase 3 — Web UX (control + broadcast)

- Control: match complete state; disable score / undo when decided; optional navigation to results. §9 Phase 3.
- Broadcast / TV / spectator: no scoring taps when decided (and wherever policy requires read-only).
- Format-aware set / STB labels on live board (§10.4).

**Exit criteria:** Clear “done” state for operators and audience.

### Phase 4 — Backend hardening

- **`liveScoringActiveSetIndex`** + completed-row classic validation on PATCH; **`reasonCode`** on rejects (§10.9); audit **`LIVE_PATCH_REJECT`**. §9 Phase 4.

**Exit criteria:** Illegal client states are rarer and easier to diagnose.

### Phase 5 — Advanced rules (product-selected)

- **`hasGoldenPoint`** in live classic (§10.1); **`CLASSIC_TIMED` / timer** partial lock (§10.2); **`role`** PATCH + verifier (§10.3). §9 Phase 5 — **done** for web/backend engine; Watch: GP + timed lock **done** (Phase 7 + follow-ups).

**Exit criteria:** Timed / golden / supplemental paths agree with validation and display split (server timer proof optional).

### Phase 6 — Optional decider UX (if in roadmap)

- Web blocking sheet + persisted **`optionalDeciderFormat`** (§10.4). §9 Phase 6 — **done** (Bo3 1–1 decider only).

**Exit criteria:** Parity with Watch-style optional decider where product requires it (**Watch live PATCH** aligned with web).

### Phase 7 — Watch (BandejaWatch)

- Core parity per **`docs/watch-vs-live-scoring-audit.md`** (rules struct, deuce / GP, auto-advance, completion gate, super-TB index). §9 Phase 7 — **done** for common paths.
- Further parity: **§9 Phase 7 follow-ups** **done**; audit **Next to implement** item 6 only if product expands TIMED/CUSTOM / non-rally cleanup.

**Exit criteria:** Watch and web agree on supported v1 presets for the same match state; follow-ups close validator / metadata / timed / trim gaps.

### Phase 8 — Edge ops (as needed)

- Walkover / default / retired flows vs live (§10.7).
- **409** conflict UX and recovery copy (§10.8); **`reasonCode`** on payload.
- Live board i18n: match complete, draw, STB/TB labels, timed lock CTAs (`gameDetails.liveScoring`).

**Exit criteria:** Supportable behavior under conflicts and special outcomes.

### Dependency sketch

- **Phase 1** unblocks 2–4 and most of 5.
- **Phase 3** can overlap **Phase 4** once Phase 1 is stable.
- **Phases 5–6** depend on product decisions.
- **Phase 7** should follow **1–3** (or **1–2**) so engine behavior is stable before Watch alignment.
- **Phase 7 follow-ups** (Watch): **done** (validator, optional decider PATCH, timed lock, trim, **`derive`** single-set default).
- **Phase 8** can trail 3 or run in parallel once conflicts and outcomes are prioritized.

---

*Last updated: doc synced with implementation (§3–§5 historical “gaps” → delivered; **`MatchCardEmbeddedLiveEntry`** removed as inaccurate); **`docs/watch-vs-live-scoring-audit.md`** item 6 still deferred for open-ended presets.*
