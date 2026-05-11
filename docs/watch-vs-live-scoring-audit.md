# Watch vs Live Scoring — Rules Audit

## Verdict
**Not equally good.** Frontend (`Frontend/src/utils/liveScoring/core.ts`) and Backend (`Backend/src/services/results/liveScoringEngine/core.ts`) share an identical, rule-parameterized engine. The Watch (`Frontend/ios/App/BandejaWatch Watch App/ViewModels/MatchScoringViewModel.swift`) is a separate hand-rolled implementation and diverges on multiple points — one real correctness bug and several configuration gaps.

---

## 1) BUG — Deuce takes one extra point to convert to Advantage

**Live** (`Backend/src/services/results/liveScoringEngine/core.ts`, lines 281–291): from `regular(40,40)` the next point goes directly to `advantage`.

```ts
} else if (side === 'teamA') {
  if (point.teamA === 40 && point.teamB !== 40) awardGame(state, 'teamA', rules);
  else if (point.teamA === 40 && point.teamB === 40) classic.pointState = { kind: 'advantage', side: 'teamA' };
  else classic.pointState = { kind: 'regular', teamA: nextPoint[point.teamA], teamB: point.teamB };
}
```

**Watch** (`MatchScoringViewModel.swift`, lines 618–651): from `regular(.forty,.forty)` the next point goes to `.deuce`, and only the point after that becomes `.advantage`.

```swift
case .regular(let a, let b):
    if side == .teamA {
        if a == .forty && b != .forty {
            awardGame(.teamA)
        } else if a == .forty && b == .forty {
            classicPointState = .deuce
        ...
case .deuce:
    classicPointState = .advantage(side)
```

**Net effect:** a tied game on the Watch needs **3 points** from 40–40, while Live needs **2**. The web/backend tests (`Frontend/src/utils/liveScoring/core.test.ts:54-64`) explicitly assert "advantage in one tap"; Watch would fail that test.

The same asymmetry exists on `unscore`: Live collapses `advantage → regular(40,40)` directly, Watch goes `advantage → .deuce → regular(40,40)` (one extra undo).

---

## 2) Hardcoded games-per-set / tie-break-at-games

**Live** uses `rules.gamesPerSet` and `rules.tieBreakGameAtGames`.

**Watch** (`MatchScoringViewModel.swift`, lines 35–43):

```swift
private static let tennisGamesPerSet = 6
private var gamesScoreForTieBreak: Int {
    usesTennisSetRules ? Self.tennisGamesPerSet : max(game?.maxPointsPerTeam ?? Self.tennisGamesPerSet, 1)
}
```

Breaks:
- `CLASSIC_PRO_SET` (9 games, TB at 8)
- `CLASSIC_SHORT_SET` (4 games, TB at 3)

`scoringPreset` is decoded by `WatchGame` but only used to detect `TIMED`/`CLASSIC_TIMED`.

---

## 3) Hardcoded win-by = 2

**Live** respects `rules.winBy`, `rules.tieBreakGameWinBy`, `rules.superTieBreakWinBy`.

**Watch** (`MatchScoringViewModel.swift`, lines 684–723):

```swift
private func withinSetTieBreakPointRaceCompleted() -> Bool {
    ...
    return winner >= target && (winner - loser) >= 2
}

private func superTieBreakPointRaceCompleted(teamA: Int, teamB: Int) -> Bool {
    ...
    return winner >= target && (winner - loser) >= 2
}

private func setCompleted(teamA: Int, teamB: Int) -> Bool {
    if usesTennisSetRules {
        ...
        if hi >= Self.tennisGamesPerSet && hi - lo >= 2 { return true }
        ...
    }
    ...
    return winner >= need && (winner - loser) >= 2
}
```

Custom rules that change `winBy` won't be honored.

---

## 4) TB targets read the wrong field

**Live:** `rules.tieBreakGameFirstTo` (default 7), `rules.superTieBreakFirstTo` (default 10).

**Watch** (`MatchScoringViewModel.swift`, lines 45–53):

```swift
private var withinSetTieBreakTarget: Int {
    let t = game?.maxTotalPointsPerSet ?? 0
    return t > 0 ? t : 7
}
private var superTieBreakTarget: Int {
    let t = game?.maxTotalPointsPerSet ?? 0
    return t > 0 ? t : 10
}
```

Works by accident for canonical presets (their `totalPointsPerSet = 0` so the fallback hits 7 / 10), but any custom rule with a non-zero `maxTotalPointsPerSet` will use the same number for both targets, while the backend distinguishes them.

---

## 5) Super-tie-break-decider hardcoded

**Live:** `rules.superTieBreakReplacesDeciderAtIndex` (null or 2).

**Watch** (`MatchScoringViewModel.swift`, lines 550–561):

```swift
private func shouldOfferSuperTieBreakChoice(nextIndex: Int) -> Bool {
    guard usesTennisSetRules, !usesBallCapPerSetUI else { return false }
    if sets[safe: nextIndex].map({ $0.resolvedRole != .official }) ?? false { return false }
    let allowedIndices = [2, 4, 6, 8]
    ...
}
```

Hardcoded indices and `rawFixedNumberOfSets` derivation instead of the configured rule.

---

## 6) No auto-advance to next set + missing completion gating

**Live** (`core.ts:189-197`): `autoAdvanceCompletedSets` runs after every scored point — the moment a set completes, `activeSetIndex` moves forward. Auto-advance is covered by the test at `core.test.ts:110-120`.

**Watch:** never auto-advances. `awardGame` / `finishWithinSetTieBreakAsGames` just commit the set. Worse, `canAdvanceToNextSet` only checks bounds and `rawFixedNumberOfSets` — it does not verify the active set is completed:

```swift
func canAdvanceToNextSet() -> Bool {
    guard activeSetIndex + 1 < sets.count else { return false }
    if isAmericano { return true }
    if rawFixedNumberOfSets > 0 {
        if activeSetIndex + 1 < rawFixedNumberOfSets { return true }
        return sets[activeSetIndex + 1].resolvedRole != .official
    }
    return true
}
```

Live's `canAdvanceLiveSet` (`core.ts:169-176`) uses `classicSetCompleted` / `pointRaceCompleted`. Watch users can advance on an incomplete set.

---

## What matches correctly

- Frontend `liveScoring/core.ts` is byte-for-byte identical to Backend `liveScoringEngine/core.ts`.
- Serve guide algorithm: `Frontend/src/utils/liveScoring/serveGuide.ts` and `Frontend/ios/.../ServeGuideEngine.swift` are line-for-line equivalent (`firstServerTeamForSet`, `servingTeamForGame`, `tbNextServerTeam`, `doublesPlayerIndex`, `tbDoublesPlayerIndex`, deuce/ad alternation, change-ends every 6 TB points).
- `99` cap in points mode (supplemental rows on both sides).
- Within-set tiebreak entry at `N–N` games, with normalized commit to `(N+1)–N`.
- Neither implementation enforces `hasGoldenPoint` — both still play deuce/advantage even when the flag is on. ("Equally not implemented.")

---

## Recommended fixes (small → large)

1. **Fix the deuce transition.** At `regular(.forty, .forty)`, go straight to `.advantage(side)`. Symmetrically, unscore from `.advantage` should land on `regular(.forty, .forty)` directly (skip `.deuce`). This is the only real correctness bug for the default preset.
2. **Plumb `ScoringRules` to the Watch.** Either ship the rule object on `WatchGame` from the backend, or mirror `getRulesFromPreset` client-side keyed by `scoringPreset`. Replace hardcoded `6` and `2` constants in `gamesScoreForTieBreak`, `setCompleted`, `withinSetTieBreakPointRaceCompleted`, `superTieBreakPointRaceCompleted` with rule values.
3. **Add auto-advance.** After `awardGame`, `finishWithinSetTieBreakAsGames`, and super-TB scoring, call an `autoAdvanceCompletedSets` analogue. Gate `canAdvanceToNextSet` on `setCompleted(...)` so the Watch matches `canAdvanceLiveSet`.
4. **Use `superTieBreakReplacesDeciderAtIndex`** instead of the `[2, 4, 6, 8]` constant in `shouldOfferSuperTieBreakChoice`.
