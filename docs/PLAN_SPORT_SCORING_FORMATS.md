# Sport scoring formats — proposed additions

Companion to [PLAN_MULTISPORT.md](./PLAN_MULTISPORT.md), [PLAN_MULTISPORT_DEFERRED.md](./PLAN_MULTISPORT_DEFERRED.md), [PLAN_SPORT_RATING_MODELS.md](./PLAN_SPORT_RATING_MODELS.md), and **[PLAN_CASUAL_MULTISPORT_UX.md](./PLAN_CASUAL_MULTISPORT_UX.md)** (dual track: **social vs match**, templates, discovery, rotation, leagues, phases D0–C8). **Unified execution hub** → [PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md](./PLAN_MULTISPORT_RATINGS_FORMATS_IMPLEMENTATION.md).

Documents **new presets** and how they map to **social (casual)** and **match (official rules)** tracks. v1 = **scoring math** (sets, win-by-2, caps); **officiating** (kitchen, lets) is a separate optional layer — see [PLAN_MULTISPORT_DEFERRED.md](./PLAN_MULTISPORT_DEFERRED.md).

---

## Social vs match (dual track)

**One rulebook, many presets.** Users pick intent at create; hosts can still open Advanced wizard.

| Track | Intent | Preset families | Event shape | Defaults |
|-------|--------|-----------------|-------------|----------|
| **Social** | Club night, low stakes | `POINTS_*`, short/timed | Americano, Mexicano, WC | `affectsRating: false`, timer |
| **Match** | Standard rules, league | `CLASSIC_*`, `BEST_OF_*_*` | CLASSIC, fixed teams | `affectsRating: true` |
| **Advanced** | Power users | All allowed for sport | Any | Manual |

### Three layers (do not mix)

| Layer | Social | Match | Code |
|-------|--------|-------|------|
| **A. Score math** | Ball budget, timed | Bo3×21, classic sets | `scoringPreset` → `rulebook.ts` |
| **B. Event shape** | Rotation formats | Fixtures, bracket | `gameType`, `matchGenerationType` |
| **C. Officiating** | Hints, honor buttons | Strict caps/faults (future) | Deferred |

### Proposed registry metadata

```ts
type PresetTier = 'social' | 'match' | 'both';

type SportPresetMeta = {
  preset: ScoringPreset;
  tier: PresetTier;
  labelKey: string;
  strictValidation?: 'NONE' | 'BWF_21' | 'PICKLEBALL_RALLY_11';
};

type CreateTemplate = {
  id: string;
  sport: Sport;
  tier: 'social' | 'match';
  // bundles: scoringPreset, gameType, matchGenerationType,
  // playersPerMatch, affectsRating, timer, suggestedCourts, …
};
```

**Validation:** shared `isLegalSetScore`; enable `strictValidation` only on **match** presets (e.g. BWF 30-point cap). Social `POINTS_*` must not use match-only caps.

**UI:** Create flow → Social | Match | Advanced; Find/card badges **“Social · Americano”** vs **“Match · 3×21”**. Full spec: [PLAN_CASUAL_MULTISPORT_UX.md](./PLAN_CASUAL_MULTISPORT_UX.md).

---

## Two preset families

| Family | Presets | Engine | Use case |
|--------|---------|--------|----------|
| **Structured match** | `BEST_OF_*_*` | `rallyBestOf(sets, pointsPerSet)` → `isRallyGameRules` | Best-of-N games to M, win-by-2 |
| **Social / rotation** | `POINTS_*` | `pointsRule(cap)` → `isPointsRules` | Fixed **ball budget** per match (Americano-style) |

Expand formats via **`allowedScoringPresets` in `sportRegistry`** (BE + FE), not by exposing padel’s full preset list on every sport.

---

## Current allowlists (create + validate)

| Sport | Allowed presets today | Default |
|-------|----------------------|---------|
| **Padel** | Full classic + points + rally + `TIMED` / `CUSTOM` | `CLASSIC_BEST_OF_3` |
| **Tennis** | Classic ladder + `TIMED` / `CUSTOM` | `CLASSIC_BEST_OF_3` |
| **Table tennis** | `POINTS_11`, `BEST_OF_3_11`, `BEST_OF_5_11`, `CUSTOM` | `BEST_OF_3_11` |
| **Badminton** | `BEST_OF_3_21`, `POINTS_21`, `CUSTOM` | `BEST_OF_3_21` |
| **Pickleball** | `POINTS_16/21/24/32`, `CUSTOM` | `POINTS_21` |
| **Squash** | `BEST_OF_5_11`, `CUSTOM` (singles only, `playersPerMatch: 2`) | `BEST_OF_5_11` |

**Note:** `POINTS_21` on badminton is **not** three games to 21 — it is one match with a **21-ball total budget**.

---

## Proposed new presets

### Badminton (priority)

| Preset | Meaning | Why |
|--------|---------|-----|
| **`BEST_OF_3_15`** | Best of 3 games, each to 15, win-by-2 | Common club / recreational format; serve coach already uses interval at 8 when `pointsPerGame >= 15` (`badmintonServe.ts`) |
| **`POINTS_15`** (optional) | Single match, 15-ball cap | Casual / rotation events (parallel to `POINTS_21`) |

Keep **`BEST_OF_3_21`** as the “long” structured default for competitive-style copy.

**Not in v1:** BWF cap at 30–29 in 21-point games, service faults, lets.

### Squash

| Preset | Meaning | Why |
|--------|---------|-----|
| **`BEST_OF_3_11`** | Best of 3 to 11 (PAR, win-by-2) | Shorter casual singles; same engine as `BEST_OF_5_11` |

### Table tennis (optional)

| Preset | Meaning | Why |
|--------|---------|-----|
| — | Already has `POINTS_11`, `BEST_OF_3_11`, `BEST_OF_5_11` | Only add if product asks (e.g. `BEST_OF_7_11` for competition) |

### Pickleball / tennis / padel

| Sport | Action |
|-------|--------|
| **Pickleball** | Point caps sufficient; no classic ladder |
| **Tennis** | Classic ladder sufficient; no `POINTS_*` on create |
| **Padel** | No change; reference implementation |

---

## Wording for hosts

| User says | Preset type | Example |
|-----------|-------------|---------|
| “3×15”, “best of 3 to 15” | Structured | `BEST_OF_3_15` |
| “3×21”, “best of 3 to 21” | Structured | `BEST_OF_3_21` (exists) |
| “15 balls”, “play to 15 points total” | Social cap | `POINTS_15` |
| “21 balls” on badminton | Social cap | `POINTS_21` (exists) |

---

## Implementation checklist (per new enum preset)

Example: **`BEST_OF_3_15`**

1. **Prisma** — add to `ScoringPreset` enum; `npx prisma migrate dev` (project rule: auto-migrate, no hand-written migration unless necessary).
2. **Shared validators** — `Backend/src/utils/validators/gameFormat.ts` → `SCORING_PRESETS`, `RALLY_SCORINGS` if rally.
3. **Rulebooks** — `PRESETS` entry: `BEST_OF_3_15: rallyBestOf(3, 15)` in:
   - `Frontend/src/utils/scoring/rulebook.ts`
   - `Backend/src/services/results/liveScoringEngine/rulebook.ts`
4. **Create defaults** — `Frontend/src/config/scoringPresets.json` (`fixedNumberOfSets: 3`, `maxTotalPointsPerSet: 15`, `ballsInGames: false`).
5. **Sport registry** — `BADMINTON_SCORING` in BE + FE `sportRegistry.ts`.
6. **Types** — `Frontend/src/types/index.ts` `ScoringPreset` union.
7. **UI** — `GameFormatStepPointsTotal.tsx` `MATCH_BEST_OF_PRESETS` row; `GameFormatWizard.tsx` union if listed; i18n `gameFormat.scoring*` / `*BySport.BADMINTON`.
8. **Infer preset** — `Frontend/src/utils/gameFormat/detectPreset.ts` (sets === 3 && pts === 15).
9. **Watch** — `WatchScoringPreset` if mirrored; registry uses `usesRallySetScoring` (no new UI required).
10. **Tests** — extend `multisport-phase3.ts` / `multisport-phase3-presets.ts`; optional `validateSet` + live registry test.

Live scoring, results entry (`isLegalSetScore`), and Watch reuse the same rules — no new engine id.

---

## Suggested rollout order

**Dual track (product):** D0 `PresetTier` + templates → D1 create branches → then presets below ([PLAN_CASUAL_MULTISPORT_UX.md](./PLAN_CASUAL_MULTISPORT_UX.md)).

**Presets (engine):**

1. **`BEST_OF_3_15`** (badminton) — **match** (+ optional **both** tier for club).
2. **`POINTS_15`** (badminton) — **social** only (ball budget).
3. **`BEST_OF_3_11`** (squash / pickleball match) — **match**.
4. Pickleball **`BEST_OF_3_11`** — **match**; keep **`POINTS_21`** as **social** with explicit label.

Defer **parameterized** “best of 3 to 17” until `CUSTOM` live parity improves; prefer named presets for clarity in results and Watch.

---

## Do not

- Attach padel **Americano / Mexicano** game types to tennis or rally sports without an explicit product decision.
- Expose all global `SCORING_PRESETS` on every sport in `GameFormatWizard`.
- Claim BWF / USAPA / ITTF officiating — only score lines and win-by-2 validation.

---

## Related code

| Area | Path |
|------|------|
| Rally skeleton | `rallyBestOf` in `rulebook.ts` |
| Badminton serve / interval | `Frontend/src/utils/liveScoring/badmintonServe.ts` |
| Per-sport allowlist | `Backend/src/sport/sportRegistry.ts`, `Frontend/src/sport/sportRegistry.ts` |
| Live plugin routing | `Frontend/src/liveScoring/registry.ts` |
| Score validation | `Frontend/src/utils/scoring/validateSet.ts` |

---

## Casual formats research (engagement)

Web scan (2025–2026) for **social / club** formats that keep people playing longer and mixing partners. Split into what Bandeja **already ships** vs **preset-only** vs **game-type / scheduler** work.

### Engagement levers (cross-sport)

| Lever | Why it works | Bandeja today |
|-------|----------------|---------------|
| **Short matches** (5–15 min) | More rotations, less intimidation | `POINTS_*`, `TIMED`, classic short sets |
| **Individual leaderboard** | Everyone cares about their row, not one fixed pair | Americano / Mexicano / RR (padel) |
| **Skill-balanced pairings** | Tighter games → more rallies | **Mexicano** (leaderboard-based next round) |
| **Partner rotation** | Meet everyone; beginners less stuck on one partner | Americano schedule |
| **Court ladder** | Visible status, “king court” drama | **Not a first-class game type** (padel only via custom events) |
| **Timed rounds** | Predictable evening length | `TIMED` + match timer (weak on some sports) |
| **Named “house rules”** | Hosts pick a label, not raw numbers | Partially via presets + `CUSTOM` |

---

### Padel (reference — mostly covered)

| Casual format | Scoring | In product? | Notes |
|-----------------|---------|-------------|--------|
| **Americano** | Rally = 1 pt; round to **16 / 24 / 32** (UK often 24) | **Yes** — `AMERICANO` + `POINTS_*` | [Live for Padel](https://www.liveforpadel.com/blog/padel-americano-rules), [PadelFast](https://padelfast.com/blog/what-is-the-difference-between-padel-americano-mexicano) |
| **Mexicano** | Same points; pairings from **live standings** | **Yes** — `MEXICANO` | More competitive than Americano |
| **Mixed / team Americano** | Same cap; fixed pairs or teams | Partial — team variants are organizer logic | Marketing copy opportunity |
| **Timed round** (e.g. 10–20 min) | Points at buzzer | **Yes** — `TIMED` / timer | Common in club nights |
| **King of the Court / Winners Court** | Short games; winners move up courts | **No** dedicated type | [Padelio](https://blog.padelio.org/king-of-the-court-padel/), [PadelMix](https://padelmix.app/king-of-the-hill-padel) — needs multi-court ladder + rotation |
| **Winner Court / Ladder** | Points or classic mini-matches | **Yes** — `WINNER_COURT`, `LADDER` game types | Align presets with 16/24 caps in copy |

**Preset tweaks:** Surface **24** as recommended default in UI copy (already in `POINTS_24`). Optional **`POINTS_12`** for very fast 4-court nights (low priority).

---

### Tennis

| Casual format | Scoring | In product? | Proposal |
|-----------------|---------|-------------|----------|
| **Standard social doubles** | Classic | **Yes** | Default path |
| **FAST4** | Sets to **4 games**; **no-ad** deuce; TB at **3–3** to **5** (deciding pt at 4–4); lets in play | **Partial** — `CLASSIC_SHORT_SET` (4 games) ≠ full FAST4 (no-ad, 5-pt TB) | New preset family or document “closest: short set + golden point” |
| **Timed hit** | Partial games | **Yes** — `CLASSIC_TIMED` / `TIMED` | Club night |
| **Round robin points** | Per-match points cap | **Yes** — `ROUND_ROBIN` + points presets if enabled | Confirm RR + `POINTS_21` combo in wizard |
| **King of the Court** | Short sets / tiebreak only | **No** | Scheduler + ladder (like padel KOTC) |

Sources: [Tennis Australia FAST4](https://www.tennis.com.au/wp-content/uploads/2016/12/FAST4-Tennis-Information-Sheet.pdf), [Toomanyrackets FAST4](https://toomanyrackets.com/fast-4-tennis/).

**High-engagement preset idea:** `CLASSIC_FAST4` — 4-game sets, TB at 3–3 to 5, no-ad at 3–3 games (product + engine; not just enum).

---

### Pickleball

| Casual format | Scoring | In product? | Proposal |
|-----------------|---------|-------------|----------|
| **Recreational side-out** | To **11**, win by 2; only server scores | **Not as live tap flow** — we use **rally-style point caps** | `BEST_OF_3_11` or single game to 11 win-by-2 (structured) |
| **Rally scoring** | To **15 or 21**, win by 2; either team scores | **Partial** — `POINTS_*` = fixed **ball budget**, not “first to 21” | Add **`RALLY_GAME_11`** / **`BEST_OF_3_11`** if USAPA-style match scoring wanted |
| **Open play rotation** | Ad-hoc games | Organizer-led | KOTC / round robin (scheduler) |
| **King of the Court** | Short games to 11 | **No** | Cross-sport scheduler |

Sources: [Pickleball.com scoring guide](https://pickleball.com/docs/en/article/pickleball-scoring-explained-traditional-and-rally-scoring-guide), [USA Pickleball](https://usapickleball.org/what-is-pickleball/).

**Engagement gap:** Clubs expect **“game to 11”** (win by 2), not only **“24 balls total”**. Consider:

- `BEST_OF_3_11` or `POINTS_11` with **win-by-2 rally rules** (`isRallyPointsRules`) for pickleball registry.
- Marketing: label `POINTS_21` as **“Americano / ball budget”** vs **“Game to 21 (rally)”** to avoid confusion.

Kitchen / side-out: deferred ([PLAN_MULTISPORT_DEFERRED.md](./PLAN_MULTISPORT_DEFERRED.md)).

---

### Badminton

| Casual format | Scoring | In product? | Proposal |
|-----------------|---------|-------------|----------|
| **Club 3×21** | BWF rally; deuce; cap 30 | **Yes** — `BEST_OF_3_21` | Default structured |
| **Club 3×15** | Rally to 15; deuce; cap 21 | **Planned** — `BEST_OF_3_15` | BWF moves default to 3×15 from **Jan 2027** ([SAYS summary](https://says.com/my/sports/badminton-key-changes-under-the-3x15-scoring-system-bwf)); 21 remains allowed |
| **Legacy 15 / 11** (side-out era) | Older recreational | **No** | Low priority unless demand |
| **Social ball budget** | Fixed total points | **Yes** — `POINTS_21` | Americano-style club night |
| **King of the Court** | Short games; rotate challengers | **No** | Scheduler |

Sources: [ActiveSG](https://www.activesgcircle.gov.sg/learn/badminton/simplified-badminton-rules-and-regulations), [Badminton Bible](https://www.badmintonbible.com/rules/scoring).

**Optional presets:** `POINTS_15`, `BEST_OF_3_15` (priority). Future: engine flag for **30-point game cap** on 21-pt games (BWF deuce cap) — validation only.

---

### Table tennis

| Casual format | Scoring | In product? | Proposal |
|-----------------|---------|-------------|----------|
| **Modern club** | **11** pts, win by 2; Bo3/Bo5 | **Yes** — `BEST_OF_3_11`, `BEST_OF_5_11`, `POINTS_11` | Good coverage |
| **Legacy 21** (pre-2001 casual) | 21 pts, serve every 5 | **No** | Niche; `CUSTOM` or `POINTS_21` mislabeled |
| **Single game** (office / pub) | One game to 11 | **Yes** — `POINTS_11` or Bo1 via cap | [Racket Insight office TT](https://racketinsight.com/table-tennis/host-a-ping-pong-tournament-at-work/) |
| **Round robin / Swiss** | Same scoring | **Yes** — `ROUND_ROBIN` on padel; TT often `CLASSIC` only | Allow `ROUND_ROBIN` + points for TT in registry? |
| **King of the Court** | Winners stay | **No** | Scheduler |

Sources: [MSU rec rules](https://recsports.msu.edu/activity-rules/table-tennis-rules), [Turnio tournament guide](https://turnio.net/table-tennis-tournament-guide/).

**Optional:** `BEST_OF_1_11` alias (single game match) for faster social — or document `POINTS_11` as “one game to 11 win-by-2” if rules aligned.

---

### Squash

| Casual format | Scoring | In product? | Proposal |
|-----------------|---------|-------------|----------|
| **PAR to 11, Bo5** | Standard WSF | **Yes** — `BEST_OF_5_11` | Default |
| **PAR to 15** | Club option | **No** | `BEST_OF_5_15` or `BEST_OF_3_15` — same `rallyBestOf` |
| **PAR to 11, Bo3** | Shorter evening | **Planned** — `BEST_OF_3_11` | [Club rules example](https://cbltsc.com/squash-league-rules/) |
| **Handicap / league points** | Start lead or higher target | **No** | Rating/league feature, not preset |
| **English (HiHo) to 9** | Legacy | **No** | Rare; skip unless UK clubs ask |

Sources: [Chesham Bois club PAR 11/15](https://cbltsc.com/squash-league-rules/), [Munster league PAR 15 divisions](https://www.munstersquash.com/index.php/league-rules/).

---

## Cross-sport: formats that need **scheduling**, not only presets

These drive engagement but are **round-generation / game-type** features:

| Format | Sports | Scoring layer | Product work |
|--------|--------|---------------|----------------|
| **King of the Court / Winners Court** | Padel, pickleball, badminton, TT | Short `POINTS_11` or timed | Multi-court state machine, promote/demote, optional individual points |
| **Challenger pool** (overflow sit-out) | Multi-court padel | Same | Queue when courts < players/4 |
| **Swiss / skill pairing** | TT, tennis RR | Existing match scoring | Pairing algorithm (like Mexicano but per-round) |
| **Fast4 tennis** | Tennis | New classic variant | Rulebook + live classic engine branch |
| **Handicap start** | Squash leagues | Custom per match | `maxPointsPerTeam` skew or supplemental metadata |

Bandeja already wins on **Americano / Mexicano / Winner Court / Ladder** for padel. Biggest **engagement gap** vs market: **King of the Court** + **pickleball “game to 11”** + **FAST4-style tennis** + **badminton 3×15**.

---

## Recommended additions (engagement-first)

### Tier A — presets only (reuse engines)

| Preset | Sport(s) | Casual label |
|--------|----------|--------------|
| `BEST_OF_3_15` | Badminton | “Club 3×15” / BWF 2027 |
| `POINTS_15` | Badminton | “15-ball social” |
| `BEST_OF_3_11` | Squash | “Quick match” |
| `BEST_OF_5_15` or `BEST_OF_3_15` | Squash | “PAR 15” club night |
| `BEST_OF_3_11` | Pickleball | “Game to 11 (×3)” if added to registry |
| `POINTS_12` | Padel | “Lightning Americano” (optional) |

### Tier B — presets + small rule tweaks

| Item | Sport | Notes |
|------|-------|--------|
| Pickleball **rally to 11/15/21** (win by 2) | Pickleball | Distinguish from ball-budget `POINTS_*` in UI |
| Badminton **21-game cap at 30** | Badminton | `validateRallyPointGame` extension |
| Tennis **short no-ad set** | Tennis | Subset of FAST4 |

### Tier C — game types / UX (highest engagement, most work)

1. **King of the Court** (multi-court ladder, padel first).
2. **FAST4** preset + live classic branch (tennis social).
3. **Timed Americano round** templates (10 / 15 / 20 min) with freeze at buzzer.
4. **Sport-specific create templates** — “Club night”, “Beginner social”, “Competitive Mexicano” one-tap presets + game type.

---

## Copy / UX (low cost, high clarity)

- Rename in UI where needed: **“Ball budget (Americano)”** vs **“Match to N points (win by 2)”**.
- Recommended caps from web: padel **24**, pickleball social **11** or rally **15**, badminton structured **15** (2027+) or **21**, TT **11** Bo3.
- Host checklist in create flow: group size multiple of 4 (padel), 2 courts minimum for KOTC, etc.

---

## References (external)

- Padel Americano vs Mexicano: [padelfast.com](https://padelfast.com/blog/what-is-the-difference-between-padel-americano-mexicano), [liveforpadel.com](https://www.liveforpadel.com/blog/padel-americano-rules)
- Pickleball scoring: [pickleball.com guide](https://pickleball.com/docs/en/article/pickleball-scoring-explained-traditional-and-rally-scoring-guide)
- Badminton 3×15 (2027): [says.com BWF](https://says.com/my/sports/badminton-key-changes-under-the-3x15-scoring-system-bwf)
- Table tennis events: [turnio.net guide](https://turnio.net/table-tennis-tournament-guide/)
- Squash PAR 11/15: [cbltsc.com](https://cbltsc.com/squash-league-rules/)
- Tennis FAST4: [tennis.com.au PDF](https://www.tennis.com.au/wp-content/uploads/2016/12/FAST4-Tennis-Information-Sheet.pdf)
- King of the Court: [padelio.org](https://blog.padelio.org/king-of-the-court-padel/), [brakto.com](https://www.brakto.com/help/king-of-court)

---

## Implementation architecture

Three layers — do not conflate them:

```mermaid
flowchart TB
  subgraph product["Product layer"]
    GT[gameType: AMERICANO / CLASSIC / …]
    SP[scoringPreset: POINTS_24 / BEST_OF_3_21 / …]
    PPM[playersPerMatch: 2 or 4]
  end
  subgraph engine["Round engine layer"]
    MGT[matchGenerationType: RANDOM / RATING / …]
    RG[roundGenerator → random | rating | winnersCourt | escalera]
  end
  subgraph sportGate["Sport gate"]
    REG[sportRegistry: allowedGameTypes + allowedScoringPresets]
    VAL[validateGameForSport]
  end
  GT --> MGT
  SP --> RULES[rulebook / live / results validation]
  PPM --> RG
  REG --> VAL
  VAL --> product
```

| Layer | What it controls | Sport-specific today? |
|-------|------------------|------------------------|
| **`scoringPreset`** | Points per match, sets, win-by-2, live mode | Yes — `allowedScoringPresets` per sport |
| **`gameType`** | UX label + default scoring compatibility | Yes — padel: all types; tennis: `CLASSIC`, `ROUND_ROBIN`, `CUSTOM`; rally: `CLASSIC`, `CUSTOM` only |
| **`matchGenerationType`** | Who plays whom each round | **No** — same generators for all sports (if allowed through validation) |
| **`playersPerMatch`** | 1v1 vs 2v2 match shape | Per game; registry `allowedPlayerCountsPerMatch` |
| **League `LeagueSeason.sport`** | All child games inherit sport | Yes — `assertGameSportMatchesLeagueSeason` |

**Mapping today** (`Frontend/src/utils/gameFormat/scoringCompatibility.ts`):

| `matchGenerationType` | `gameType` (derived) | Generator |
|----------------------|----------------------|-----------|
| `RANDOM` | `AMERICANO` | `generateRandomRound` |
| `RATING` | `MEXICANO` | `generateRatingRound` |
| `ESCALERA` | `LADDER` | `generateEscaleraRound` |
| `WINNERS_COURT` | `WINNER_COURT` | `generateWinnersCourtRound` |
| `ROUND_ROBIN` | `ROUND_ROBIN` | **Throws** — not implemented |
| `AUTOMATIC` / `HANDMADE` / `FIXED` | `CLASSIC` or `CUSTOM` | Auto pairing or manual / league fixtures |

---

## Will Americano (random) work for other sports?

### Short answer

| Question | Answer |
|----------|--------|
| Does the **pairing algorithm** care about sport? | **No** — `random.ts` / `rating.ts` only use roster, courts, `playersPerMatch`, gender rules. |
| Is Americano **allowed** on other sports today? | **No** — `validateGameForSport` + `allowedGameTypes` block `AMERICANO` on tennis, pickleball, etc. (`multisport-phase0`, `multisport-phase4-leagues`). |
| Is the **scoring** right if we flip the flag? | **Only if** preset is a `POINTS_*` (or rally cap) allowed for that sport — individual points → `winnerOfGame: BY_SCORES_DELTA`. |
| Does it work for **1v1** (`playersPerMatch: 2`)? | **Not correctly today** — generators build `teamA` / `teamB` as **pairs of two user IDs** (`MatchConfig` in `random.ts`). For singles you get one match **2v2 by accident** (four IDs on court), not two 1v1 courts. Needs a **`playersPerMatch === 2` branch** in random/rating/winnersCourt. |
| Does **Mexicano** (rating) differ? | Same engine constraints; uses standings for pairing instead of pure fairness. |

### When Americano-style rotation fits other sports

Good fit (social, even groups, points cap):

- **Pickleball** open play / club night (often doubles; singles less common for rotation).
- **Badminton** / **table tennis** — doubles rotation or singles round-robin **after** 1v1 generator fix.
- **Tennis** — uncommon for true Americano (fixed doubles pairs more normal); better as **timed social** or **FAST4** mini-matches, not padel-style individual leaderboard unless singles rotation is built.

Poor fit:

- **Squash** — singles only; rotation is “ladder” or box league, not 4-player Americano blocks.
- **League regular season** — fixed teams per fixture (`CLASSIC`, `HANDMADE` / `FIXED`), not `RANDOM`.

### Recommended policy: `rotationFormats` in sport registry

Extend `SportConfig` (BE + FE) with explicit flags instead of copying padel’s full `GAME_TYPES`:

```ts
type RotationPolicy = {
  /** Allow matchGenerationType RANDOM → AMERICANO */
  americano: boolean;
  /** Allow RATING → MEXICANO */
  mexicano: boolean;
  /** Allow WINNERS_COURT */
  winnersCourt: boolean;
  /** Allow ESCALERA → LADDER */
  ladder: boolean;
  /** Minimum roster for rotation (usually 2 × playersPerMatch, often 8) */
  minRotationRoster?: number;
  /** Default points preset when creating Americano */
  defaultAmericanoPreset?: ScoringPreset;
};
```

Example matrix (product defaults — tune with club feedback):

| Sport | Americano | Mexicano | Winner Court | Ladder | Notes |
|-------|-----------|----------|--------------|--------|--------|
| Padel | ✓ | ✓ | ✓ | ✓ | Reference |
| Tennis | ✗ | ✗ | ✗ | ✗ | `CLASSIC` + `ROUND_ROBIN` only; social = separate “social session” template later |
| Pickleball | ✓ (4p) | ✓ | ✓ | optional | Needs `POINTS_*`; consider rally-to-11 preset |
| Badminton | ✓ (4p) | ✓ | ✓ | optional | 1v1 rotation after engine fix |
| Table tennis | ✓ (4p) | ✓ | optional | optional | Office TT often RR — implement `ROUND_ROBIN` or use Americano |
| Squash | ✗ | ✗ | optional* | ✓? | *Winner Court = ladder metaphor; not 4-player WC |

Enabling Americano for a sport = **registry + validation + create wizard filter + QA script**, not a new round engine.

---

## Leagues and tournaments per sport

### What exists today

| Mode | Game shape | `gameType` / `matchGenerationType` | Sport |
|------|------------|-----------------------------------|--------|
| **Standalone game** | User-chosen | Full padel set; restricted on others | `Game.sport` |
| **League regular season** | One match, **two fixed teams** | `CLASSIC`, `HANDMADE` / league fixture | `LeagueSeason.sport` on every child game |
| **League session playoff** | **One game per group**, whole roster inside | `WINNER_COURT` or `AMERICANO` only (`league.routes`, `PLAYOFF_GAME_TYPE_TEMPLATES`) | Same season sport; **AMERICANO rejected for tennis** in tests |
| **League bracket playoff** | **CLASSIC** 2-team games per slot | `createLeagueGame` — see [PLAN_LEAGUE_BRACKET_PLAYOFF.md](./PLAN_LEAGUE_BRACKET_PLAYOFF.md) | Season sport + classic scoring |

League creation already:

- Sets `sport` on `LeagueSeason` and copies to games (`create.service.ts`, `gameCreation.util.ts`).
- Resolves `playersPerMatch` from season sport (`resolvePlayersPerMatch`).
- Validates `gameType` / `scoringPreset` via `validateGameForSport`.

### How to take leagues multi-sport (phased)

**Phase L1 — Classic-only leagues (done for tennis; extend checklist per sport)**

- Season sport = `TENNIS` | `BADMINTON` | …
- Season template: `gameType: CLASSIC`, `matchGenerationType: HANDMADE` or `FIXED`, classic or rally presets from registry.
- Fixture generation: existing head-to-head (`tryGenerateHeadToHeadFixedTeamsMatch` in `roundGenerator.ts`).
- Standings: `LeagueGameResultsService` already uses match W/L and score delta — sport-agnostic.
- Rating: `game.sport` on outcomes — already per `UserSportProfile`.

**Phase L2 — Session playoffs on non-padel sports**

Only after `rotationFormats.americano` (and QA) for that sport:

- Allow `createPlayoff` with `gameType: AMERICANO` when `season.sport` permits.
- Map `PLAYOFF_GAME_TYPE_TEMPLATES.AMERICANO` to sport-appropriate **`scoringPreset`** (not hardcoded padel `POINTS_16` only) — today templates fix `ballsInGames: false`, `RANDOM`; preset comes from `gameSetup` / season.
- **Winner Court playoff** on pickleball/TT: verify `generateWinnersCourtRound` with `playersPerMatch` and points presets.

**Phase L3 — Bracket + multi-sport**

- Bracket stays **CLASSIC** head-to-head — works for any sport with 2-team fixtures and legal set validation.
- Ensure `BracketPlayoffGameSetupStep` filters presets by `LeagueSeason.sport`.
- No bracket changes needed for Americano.

**Phase T — Tournaments (`entityType: TOURNAMENT`)**

- Same as standalone games: sport + preset + optional rotation.
- Table view / single-set modes already sport-agnostic if preset fits.
- Marketing: “Padel Americano tournament” vs “TT box league” = different `gameType` + copy, same stack.

### League default templates (suggested)

| Sport | Regular season preset | Playoff session (optional) | Bracket |
|-------|----------------------|----------------------------|---------|
| Padel | `CLASSIC_BEST_OF_3` | AMERICANO `POINTS_24` / WC | CLASSIC |
| Tennis | `CLASSIC_BEST_OF_3` | — (or future FAST4 league) | CLASSIC |
| Pickleball | `POINTS_21` or `BEST_OF_3_11` | AMERICANO `POINTS_21` | CLASSIC |
| Badminton | `BEST_OF_3_21` / `BEST_OF_3_15` | AMERICANO `POINTS_21` | CLASSIC |
| Table tennis | `BEST_OF_3_11` | AMERICANO `POINTS_11` | CLASSIC |
| Squash | `BEST_OF_5_11` | Ladder / WC only | CLASSIC |

---

## Implementation roadmap (ordered)

### Track 1 — Presets (low risk)

See checklist above: `BEST_OF_3_15`, `BEST_OF_3_11` squash, pickleball structured games, etc. No round-generator changes.

### Track 2 — Singles-safe rotation (required for 1v1 Americano)

1. Add `isSinglesMatch(game)` → `playersPerMatch === 2`.
2. In `random.ts` / `rating.ts` / `winnersCourt.ts`:
   - Singles: build matches as `teamA: [a]`, `teamB: [b]`; opponent rotation = “who plays whom”; drop partner-pair graph or treat partner count as N/A.
3. Extend `qa-americanoRandomRoundGeneration.ts` with `playersPerMatch: 2` scenarios.
4. FE: show Americano only when roster ≥ `minRotationRoster` **and** sport `rotationFormats.americano`.

### Track 3 — Sport rotation policy (enable cross-sport social)

1. `rotationFormats` on `SportConfig` (BE + FE).
2. Replace implicit “padel has all `GAME_TYPES`” with explicit flags.
3. `validateGameForSport`: optional check `gameType` → required `matchGenerationType` allowed.
4. `GameFormatWizard`: filter generation types by sport + roster size.
5. Tests: pickleball Americano create + one generated round smoke.

### Track 4 — League / playoff wiring

1. `PLAYOFF_GAME_TYPE_TEMPLATES` + routes: gate by `getSportConfig(sport).rotationFormats`.
2. Season create defaults per sport (table above).
3. `PlayoffConfigurationModal`: hide AMERICANO for tennis until product says otherwise.

### Track 5 — New engines (high effort)

| Feature | Approach |
|---------|----------|
| **King of the Court** | New `MatchGenerationType` (e.g. `KING_OF_COURT`) or extend `WINNERS_COURT` with multi-court rank state; court ordering on `gameCourts` |
| **ROUND_ROBIN** | Implement `generateRoundRobinRound` (currently throws); full schedule table |
| **FAST4 tennis** | Preset + classic live branch (no-ad, 4-game set, TB to 5) |
| **Handicap** | Metadata on match or league rules — not a preset |

### Track 6 — Copy / templates

- Create-game **templates**: “Club Americano (padel)”, “Pickleball social (21 balls)”, “TT box (Bo3×11)” → prefill `sport`, `gameType`, `scoringPreset`, `playersPerMatch`, `matchGenerationType`.
- i18n sport-specific labels for same preset (`gameFormat.*BySport`).

---

## Decision log (product)

| Decision | Recommendation |
|----------|----------------|
| Casual + official in one app? | **Yes** — `PresetTier` + templates; one rulebook. |
| Copy padel Americano to all sports? | **No** — social track only via `rotationFormats`. |
| Is random pairing sport-safe? | **Yes for doubles (ppm=4)** once allowed; **fix singles first**. |
| Tennis league Americano? | **Defer** — match track = CLASSIC; social = FAST4 / timed. |
| Pickleball `POINTS_21`? | **Social tier** only; match = `BEST_OF_3_11` / rally to 11. |
| Badminton `POINTS_21` vs `BEST_OF_3_21`? | **Social** vs **match** — never ambiguous labels. |
| Implement ROUND_ROBIN or use Americano? | Americano for social; RR for match schedules later. |
| King of the Court vs Winner Court? | KOTC = social scheduling; WC = in-game type (Track 5). |

---

## Code map (round generation)

| File | Role |
|------|------|
| `Backend/src/services/results/generation/roundGenerator.ts` | Dispatches by `matchGenerationType` |
| `Backend/src/services/results/generation/random.ts` | Americano |
| `Backend/src/services/results/generation/rating.ts` | Mexicano |
| `Backend/src/services/results/generation/winnersCourt.ts` | Winner Court |
| `Backend/src/services/results/generation/escalera.ts` | Ladder |
| `Backend/src/services/results/generation/matchUtils.ts` | `playersPerMatchOf`, `getNumMatches` |
| `Backend/src/utils/validators/validateGameForSport.ts` | Sport gate |
| `Backend/src/sport/sportRegistry.ts` | `allowedGameTypes`, `allowedScoringPresets` |
| `Backend/src/services/league/gameCreation.util.ts` | Playoff templates |
| `Frontend/src/utils/gameFormat/scoringCompatibility.ts` | gameType ↔ generation mapping |
