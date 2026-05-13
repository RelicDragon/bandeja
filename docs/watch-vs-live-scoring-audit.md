# Watch vs Live Scoring — Rules Audit

## Verdict

**Strong parity for common v1 presets** (rules from **`WatchScoringRulebook`**, deuce / **GP**, TB/STB races, advance + auto-advance gates, points freeze, **`WatchValidateSet`** / **`isLegalSetScore`**, optional decider + timed lock in live state, post-decision trim). Remaining scope is **§ Next to implement** item 6 (open-ended presets / non-rally metadata cleanup) unless product expands.

---

## 1) Deuce at 40–40 — fixed

**Live:** next point from `regular(40,40)` → `advantage`.

**Watch:** same (`scorePoint` `.regular` forty–forty branches). Legacy `.deuce` is still decoded for old payloads; with **`hasGoldenPoint`** it is normalized to **40–40 regular** on load / envelope apply (`normalizeClassicPointStateForGoldenPointRules`), matching `normalizePointState` in `core.ts`.

---

## 2) Games per set / tie-break at games — fixed

**Watch** uses **`rules.gamesPerSet`**, **`rules.gamesScoreForTieBreak`**, **`setCompleted`**, etc. from **`WatchScoringRulebook`** (incl. **CLASSIC_PRO_SET**, **CLASSIC_SHORT_SET**).

**Caveat:** **`derive(from:)`** without **`scoringPreset`** still cannot distinguish **short set** from standard single; prefer **`scoringPreset`** on game payloads.

---

## 3) Win-by — fixed

**Watch** uses **`rules.winBy`**, **`tieBreakGameWinBy`**, **`superTieBreakWinBy`** in set and tie-break race completion.

---

## 4) TB targets — fixed

**Watch** uses **`tieBreakGameFirstTo`** / **`superTieBreakFirstTo`** from rules (fallback to 7 / 10 only when those are zero), not **`maxTotalPointsPerSet`** for both.

---

## 5) Super-TB decider index — fixed

**Watch** uses **`rules.superTieBreakReplacesDeciderAtIndex`** and **`rules.maxSetsPlayed`** for optional decider prompt and mandated STB; no **`[2, 4, 6, 8]`** list.

---

## 6) Auto-advance and completion gating — fixed

**Watch** implements **`autoAdvanceCompletedSets`**, **`activeSetIsCompleted`**, and **`canAdvanceToNextSet`** consistent with live **`canAdvanceLiveSet`** / **`computeMatchWinnerLiveScoring`** semantics.

---

## 7) Golden point (`hasGoldenPoint`) — fixed (Watch)

When **`rules.hasGoldenPoint`**, the next point from **40–40** awards the game (same as **`applyClassicPoint`** in `core.ts`). UI shows **GP** above the score row (`ClassicScoringView` + **`WatchCopy.goldenPoint`**).

---

## What matches correctly

- Serve guide: **`ServeGuideEngine.swift`** vs **`serveGuide.ts`**.
- Points caps + match-decided freeze: **`WatchComputeMatchWinner`** + official budget checks.
- Frontend **`liveScoring/core.ts`** ↔ Backend **`liveScoringEngine/core.ts`** (mirrored engine).

---

## Next to implement (prioritized)

1–5 **done** on Watch (see **`WatchValidateSet`**, **`WatchLiveScoringState.optionalDeciderFormat` / `timedClassicSetLocked`**, **`MatchScoringViewModel`** merge + trim + **`lockTimedClassicSetAtPartialScore`**, **`WatchScoringRulebook.derive`** single-set default).

6. **Product-deferred (same as web plan)**  
   **`TIMED` / `CUSTOM`** open-ended presets; dedicated **non-rally outcome** cleanup of incompatible live **`metadata`** beyond tap blocking.

---

## Residual / low effort

- Prefer **always sending `scoringPreset`** on game payloads used by the Watch app so **`derive(from:)`** is rarely hit.

---

## Historical notes

Earlier revisions of this doc listed a **deuce extra-tap bug**, **hardcoded 6/2**, **wrong TB field**, **`[2,4,6,8]`** STB indices, and **missing auto-advance**; those paths were brought in line with **`WatchScoringRules`** and live **`core.ts`**.
