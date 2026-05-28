# Apple Watch — Serve & court guide (UX + technical plan)

**Related:** Multisport execution hub → [PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md](./PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md) (track W*, `officiatingLevel`).

## Context

BandejaWatch already scores classic sets in `MatchScoringViewModel` + `ClassicScoringView` (deuce/advantage, within-set tie-break, super tie-break). There is **no** serve or court-side model today; `ScoreHintBanner` only shows set label and games. Match start is immediate in `ActiveSessionManager.startMatch`.

This document plans **optional, rules-aware serve guidance**: who serves next, from which side, with **clean watch UI** — approachable for beginners, **low noise** for advanced players.

---

## Design goals

| Goal | Implication |
|------|----------------|
| Beginners understand *where* and *who* | One canonical “next serve” story: **person + side** (right/left or deuce/ad), not paragraphs of rules. |
| Advanced players hate noise | **One fixed-height row**, skippable; avoid extra modals after match start. |
| Correct rules | Strip and copy must match **one** implemented algorithm; ambiguous cases (e.g. who starts the next set) are explicit **product decisions**. |

---

## Two densities without two different screens

Avoid a literal “Beginner / Pro” layout switch.

- **Default strip:** icon + **3–5 words**, e.g. `Maria · Right` with tennis ball + court/side affordance.
- **Detail on demand:** tap strip → short sheet or expand: bullets (“First point of this game”, “Serve from the right (deuce)”, “Next point: left (ad)”). Advanced users need not open it.
- **Preference:** “Compact serve hints” → **icons only** (ball + L/R or D/A), no names. Pair with global **Off** if desired.

One implementation; density via preference + tap-to-expand.

---

## Start of match: who serves first

**When:** After the user starts a match, **before** first point scoring (insert between Start and `matchActive` / first paint of scoring).

**Layout (watch-friendly):**

- **Title:** “Who serves first?”
- **One line body:** e.g. “We’ll show serve side each point. Optional.”
- **Primary:** Two large targets — **Team A / Team B** with avatar stacks (reuse patterns from `WatchScoringTeamColumn` / `WatchPlayerAvatarView`). Prefer 44pt+ targets.
- **Optional second step (doubles):** After team pick — “Who serves this first game?” — two chips (players). If roster order allows a sensible default, **pre-select** + **Continue** for one tap for experts.
- **Footer:** **Skip serve hints** — visible, not buried; makes clear scoring is unchanged, only guidance is off.

**Persistence:** Store `firstServerTeam`, `firstServerPlayerIndex` (or equivalent) with session keys so `recoverIfNeeded` does not re-ask. If user skipped, **no strip** for that match.

**Scope:** Enable for classic / tennis-style games (`ballsInGames` / `usesTennisSetRules`, not Americano / ball-cap UI).

---

## In-match: coach strip (single home)

**Placement:** Directly under the set/games banner (`ScoreHintBanner` area), **above** team columns — reads as **status**, not a tutorial.

**Height:** Fixed ~28–36 pt so scroll/score layout stays stable.

**Content (left → right):**

1. **Court / side:** small schematic or SF Symbol court split + **R/L** or **Deuce/Ad** — **one** vocabulary app-wide. Beginners: “Right/Left” as primary; “Deuce/Ad” in expanded detail if useful.
2. **Serve:** `tennisball` / filled next to **tiny avatar** or initial.

**Motion:** On server or side change (new game, new point side, TB handoff): single family of motion (e.g. short pulse / `symbolEffect`) — not multiple competing animations.

**Hide strip when:** Americano, user skipped, read-only, or global Off.

**Game win confirm** (`pendingGameWinConfirmSide`): **dim or hide** strip so only one modal “truth” at a time.

---

## Beginner copy (what the strip answers)

Answer **only the next point**:

- Good: “Next: Maria · right side”
- Bad: Full rotation history in the strip.

**Optional one-time coach (non-blocking):** After first serve selection, auto-dismiss (~4s) once: “Each point, we’ll show which side to serve from.” Do not repeat every game. Optionally one line the **first tie-break** in app lifetime if TB confuses users.

---

## Advanced workflow (speed)

- **Skip at start** → strip absent; scoring matches today’s cognitive load.
- **Long-press strip:** “Hide for this match” (discoverability: light haptic + optional first-week hint).
- **Settings:** Serve hints — On / Compact / Off (choose default from product; **On** with obvious Skip is safe for first install).

---

## Rules engine (implementation checklist)

Derive from **`(score snapshot, first-serve choice, format flags)`** — no separate manual “serve cursor”; `unscorePoint` recomputes.

| Situation | Behaviour |
|-----------|-----------|
| Normal game | Server fixed for the game; **side** alternates each point (point 0 → deuce/right, then ad/left, …). **Next game:** receiving team serves; **partners** alternate who serves each game (doubles). |
| Deuce / advantage | Same server for the game; side still follows **points played in current game**. |
| Within-set tie-break | Documented ITF-style: first point server, two-point rotations, correct sides; **change ends** every 6 points if product requires it — **one** UI moment (“Change sides”) + haptic, not stacked with serve line. |
| Super tie-break | Align with `activeSetIsSuperTieBreak` rules already in app. |
| New set | Explicit rule: e.g. previous set’s receiver starts (or coin — document). |

Cover with **unit tests** (golden paths: game points 0→n, new game, deuce/ad, TB, super TB, unscore).

---

## Tie-break UX

Strip during TB: consider **“Serve 1” / “Serve 2”** labels for two-point blocks if rules use them; keep **side** icon. **Change ends:** full strip message briefly, then return to serve hint.

---

## Visual design (watchOS)

- Typography: `.footnote` / `.caption` semibold for strip; monospaced digits for scores only.
- Color: muted capsule or thin material; **accent** on ball or active side only.
- Icons: consistent SF Symbol weight; ball **filled** for “live” serve.
- Align strip **leading** with score banner for one vertical rhythm.

---

## Accessibility

- VoiceOver: one sentence — e.g. “Next serve: Team A, Maria, from the right, deuce side.”
- Dynamic Type: if truncating, drop **name** before **side** (side is safety-critical).
- Color-blind: always include **R/L** or D/A text, not color alone.

---

## Deliberately out of scope (anti-bloat)

- No full court diagram every point.
- No in-flow rulebook tab.
- No “confirm you stood on the correct side” gate before scoring taps.

---

## Suggested implementation order

1. `ServeGuideSnapshot` + pure functions + tests from synthetic `MatchScoringViewModel` state.
2. Start-match sheet + session persistence for first server + skip flag.
3. `ServeCoachStrip` + integration in `ClassicScoringView` only (classic path).
4. Long-press hide, compact mode, localization (`WatchCopy`), haptics on change ends / TB handoff.

---

## Validation checklist

- [ ] New user: after start, understands **one** next physical action without docs.
- [ ] Advanced: Skip → scoring UI indistinguishable from today except session.
- [ ] Advanced: hints on → strip readable in **&lt;300 ms** without extra scroll.
- [ ] TB / change ends: single clear message; no stacked modals with game-win confirm.

---

## Addendum — edge cases and product gaps

**Perspective of “right / left”.** Define unambiguously: e.g. **as the serving team faces the net** (or always from **Team A’s** bench view — pick one and state it in the expanded sheet once). Otherwise beginners mirror incorrectly.

**Wrong “who served first” after the fact.** Offer **“Fix starting server…”** under match overflow / long-press nav **before** too much score exists, or with a **confirm** if games were already entered (recomputes entire strip from new seed). Without this, users distrust the hint.

**Missing seed (mid-match open, recovery, or other device scored first).** If scoring state loads but **no** persisted `firstServerTeam` / partner index: either **hide strip** until user sets seed from one lightweight sheet, or **prompt once** (“Who served the first point of this match?”) — do not invent serve order from games/points alone.

**`pendingSetFormatChoiceIndex` (normal set vs super tie-break).** Same rule as game-win confirm: **pause or hide** the coach strip while a blocking format sheet is up.

**Supplemental sets** (`activeSetIsSupplemental`). Confirm whether serve rotation continues from match history or resets; if rules differ, either align the engine or **show a one-line banner** (“Extra games — same serve order”) and test separately.

**Always On Display.** Strip text/icons must stay **legible at reduced luminance**; avoid relying on motion alone for changes (pair with haptic or contrast bump).

**RTL locales.** UI mirroring must not flip **court geography**; keep **R/L** tied to real court semantics, not layout direction.

**Disclaimer (one line).** In expanded detail or settings: guidance is **assistive**, not a substitute for venue rules or an umpire — sets expectations and reduces support load.

**iPhone companion parity (optional).** If the same user starts on phone and continues on Watch, **sync serve seed** via game session / my-session payload so Watch does not ask again or contradict.

**Analytics (light).** Optional events: skip vs complete picker, strip long-press hide, expand-sheet opens — validates whether the feature helps or is ignored without noisy in-app surveys.
