# Play streak (weeks) — plan

**Canonical name:** Play streak (weeks). Distinct from win/loss streaks in performance insights.

---

## 1. Locked product rules

| Decision | Choice |
|----------|--------|
| Unit | Consecutive **weeks** |
| Week meaning | **Rolling 7×24h** from last qualifying play’s local date boundary |
| Qualify | Finished game with `affectsRating` and `gamesPlayed` +1. **Excludes** `BAR`, `LEAGUE_SEASON`, and all non-rating games. `LEAGUE` fixtures count when rated. |
| Win/loss | Irrelevant |
| Scope | **Per sport** on `UserSportProfile` |
| Timezone | User `currentCity.timezone` (fallback UTC) for day boundaries |
| Same week | Extra games do **not** bump the count |
| Public | Show current + best on profiles |
| At-risk | Own view only |
| Freeze / repair | **Out of v1** |
| Broken | Reset current → 0; keep best |

---

## 2. Algorithm

Anchor conceptually by last streak-advancing play.

Practically store:

- `playStreakCount` — consecutive weeks locked in
- `playStreakLastPlayAt` — instant of last qualifying play
- `playStreakBest`

**Alive** iff `now` is before the grace deadline derived from `lastPlayAt`.

**Grace (UX):** Deadline = end of local calendar day of `(lastPlayAt local date + 7 days)`.
Played Tuesday → keep by next Tuesday EOD. Day-7 play can open the next streak week.
(Plan originally said +6; +7 is required so once-a-week play advances without a mid-week filler.)

On new qualifying play while alive:

- If still in the current open week window → update `lastPlayAt` only (count unchanged).
- Else → `count += 1`, update `lastPlayAt`, `best = max(best, count)`.

On first play after break → `count = 1`.

**Derive “at risk”:** `hoursLeft = deadline - now`; at risk when alive && `hoursLeft ≤ 48h`.

Pure functions in `Backend/src/services/results/playStreak.ts` (+ unit tests). No cron to break streaks — break is lazy on read/write when deadline passed.

---

## 3. Data model

On `UserSportProfile`:

```
playStreakCount      Int       @default(0)
playStreakBest       Int       @default(0)
playStreakLastPlayAt DateTime?
playStreakWeekStartAt DateTime?  // last advancing play’s local day start (window anchor)
```

No history table in v1. Recompute from outcomes for backfill / undo.

API shape (nested under sport profile / user stats):

```ts
playStreak: {
  current: number;
  best: number;
  lastPlayAt: string | null;
  deadlineAt: string | null;   // derived
  atRisk: boolean;             // own only; false for others
  hoursLeft: number | null;    // own only
}
```

---

## 4. Write path

Hook inside `applyGameOutcomes` when `countsForPlayStreak(game)` and `gamesPlayed` +1:

1. Load prior qualifying play timestamps (same filters as backfill; exclude current game)
2. `recomputePlayStreak([...prior, playAt])` — playAt = `finishedDate ?? endTime ?? startTime`
3. Persist count/best/lastPlayAt/weekStartAt
4. Stamp outcome metadata `playStreakApplied` + before/after + `advanced` for banner/undo

**Undo / recalculate:** After deleting outcomes, **recompute** streak for users with `playStreakApplied` metadata.

**Do not** use `lastRatingActivityAt` alone — uncertainty accrual uses it differently; keep streak fields separate.

---

## 5. Read path

- Include in existing user stats / sport profile payloads (`stats.controller`, sport projection).
- Derive `deadlineAt` / `atRisk` / `hoursLeft` in service using city TZ.
- Strip `atRisk` / `hoursLeft` for non-self viewers.

---

## 6. UX

### A. Profile chip (player card header + own Profile sport panel)

- Flame + `N` + localized “week/weeks”.
- Own + at risk: subtle amber ring / soft pulse.
- Tap → small sheet: current, best, deadline (“Play by Tue 14 Jul to keep your streak”), one-line rules.

### B. Post-results toast / banner (results screen, once when count increases)

- “Streak · 9 weeks” / “Streak started!”
- No modal. Skip if count unchanged (same week).

### C. Broken

- Chip shows best only or “— · best 12”; no guilt copy.

### D. Empty

- No chip until first qualifying game (or ghost “Start a streak” on own profile only — optional).

### E. Multisport

- Streak for **active sport context** on the card.

Motion: light scale on increment; avoid confetti spam.

i18n: `en/cs/es/ru/sr` under `playerCard` / `rating` or new `playStreak` namespace.

---

## 7. Notifications (phase 2, design now)

| Trigger | When | Pref |
|---------|------|------|
| At-risk | ~48h and ~12h before deadline | new pref under reminders |
| Broken | After deadline, once | soft |

Cron/worker scans `playStreakLastPlayAt` in window. Not in v1 ship criteria.

---

## 8. Backfill

Script: for each `UserSportProfile`, collect distinct qualifying play local-dates from game outcomes (stats-applied), run the pure weekly-chain algorithm forward, set count/best/lastPlayAt.

Ship with migration.

---

## 9. Implementation order

1. Pure `playStreak` math + tests
2. Schema migration (`prisma migrate`) + profile select constants
3. Wire apply + undo/recompute
4. API projection (self vs other)
5. FE types + chip + sheet + results banner
6. i18n
7. Backfill script
8. `docs/UI_TEST_PLAN.md` rows (profile chip, at-risk own-only, post-results increment, broken best)
9. Phase 2: push

---

## 10. UI test plan (minimum)

| ID | Test | Expected |
|----|------|----------|
| PR-streak-1 | Own profile after qualifying week | Flame + N weeks |
| PR-streak-2 | Other profile | Current/best visible; no at-risk |
| PR-streak-3 | Second game same week | Count unchanged; banner absent |
| PR-streak-4 | Game after new week while alive | Count +1; celebration |
| PR-streak-5 | Past deadline | Current 0; best kept |
| GR-streak-1 | Results finalize advances streak | Banner once |

---

## 11. Explicit non-goals (v1)

Streak freeze, repair gems, leaderboards, day-unit display, training-only events, calendar heatmaps, sharing cards.

---

## Assumption

Qualifying = same games that bump `gamesPlayed` / rating stats (not casually “attended”). If open plays / trainings should count before results are final, the write hook changes.
