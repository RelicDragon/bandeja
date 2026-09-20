# Ratings

Canonical engine id: **`bandeja_elo_v1`** (`SportRatingModel` in `Frontend/shared/createTemplates.ts`). Stored on **`UserSportProfile`** per sport: `level`, `reliability`, `ratingUncertainty`, `gamesPlayed`/`gamesWon`, `inactive`, play streak, questionnaire markers, `externalRatingHint`.

Rates when `Game.affectsRating` is true (model `ratesWhen.affectsRatingTrue`). EVENT/BAR/LEAGUE_SEASON caps: no rating. TRAINING does not run ELO (trainer can set level/reliability by hand). Neutral technical league results apply **no** rating delta ([leagues.md](./leagues.md)).

## ELO v1

`Backend/src/services/results/rating.service.ts` (`calculateRatingUpdate`, `calculateReliabilityChange`). Used from `outcomeExplanation.service.ts` / outcomes pipeline.

- Expected win vs team levels; `ELO_SCALING_FACTOR` 0.8; base step 0.05; default cap `maxDeltaPerEvent` 0.2 (per sport model)
- Score margin when `engine.useScoreMargin` (buckets veryClose/close/normal/blowout)
- High-level dampening above 5.0; max display 6.8
- Entity endurance: LEAGUE fixture gain ×2, TOURNAMENT ×1.5
- Reliability coefficient × uncertainty scale dampens the delta (`computeReliabilityCoefficient` in `ratingUncertainty.ts`)

## Reliability

Separate per-sport score. Moves with rated results (`RELIABILITY_INCREMENT` 0.1). Shown on rankings, results summaries, Telegram/artifacts. Trainers override on TRAINING (`EditLevelModal` → `training.service` `updateParticipantLevel`).

## Uncertainty

Hidden 0–150 on `UserSportProfile.ratingUncertainty`. Accrue +10 / 30 idle days after 30-day grace; −10 per finished rated game; cap 150. Scale on reliability factor: 0→×1, 100→×2, 150→×3. Admin-visible; `inactive` when &lt;5 rated games or none in 90 days (`sportProfileInactive.service.ts`). Daily inactive scheduler.

## Level change events

`LevelChangeEvent` / `LevelChangeEventType`: GAME, SET, QUESTIONNAIRE, SOCIAL_BAR, SOCIAL_PARTICIPANT, LUNDA, OTHER. Written on results, training SET edits, bar auto-results, questionnaire. Shown on profile/results.

## Display mappings

Display system is **not** a second rating. Maps canonical 1–7 to UI hints:

| Sport | `display.system` |
|-------|------------------|
| Padel | PLAYTOMIC |
| Tennis | NTRP |
| Pickleball | DUPR |
| Table tennis | USATT |
| Squash | SQUASHLEVELS |
| Badminton | NONE |

`UserSportProfile.externalRatingHint` — profile-only (DUPR/NTRP/Playtomic import, etc.). Playtomic profile sync API. Not the avatar badge.

## Questionnaire

Per-sport calibration → initial `level` + `levelSource`. BE: `Backend/src/sport/questionnaires/`, `sportQuestionnaire.service.ts`. FE: `Frontend/src/components/sportQuestionnaire/`, `sportQuestionnaireRegistry.ts`. Create-game banner when band vs estimate mismatches.

## Sport level confirmation

Per sport: `UserSportProfile.approvedLevel` / `approvedById` / `approvedWhen`.

**`User.approved*` is a PADEL-only denormalized mirror** for older clients — not a primary-sport projection. Non-padel confirmation lives only on the sport profile (`userSportProfile.service.ts`, APP_FUNCTIONALITY §2.2).

## Anonymous player level feedback

**Not ELO.** Post-FINAL GAME/LEAGUE/TOURNAMENT, playing participants rate opponents they shared an official scored match: LOWER / ABOUT_RIGHT / HIGHER vs post-match shown level. Editable 14 days. Never writes `level` / reliability / uncertainty. Profile aggregate after thresholds (5 evaluators, 3 games, 0.5 level window, 365-day window) — shown on any profile, own profile also gets a locked "not enough answers yet" state.

`player-level-evaluation.service.ts`, `Frontend/src/features/player-level-feedback/`.

## Leaderboard

Route `/leaderboard` → `LeaderboardTab` → `ProfileLeaderboard`. API `GET /rankings/user-context`, `GET /rankings/achievement-context`. `ranking.service.ts` + `ratingLeaderboardQualify.ts`. City + sport, period, rating vs games vs social, gender filter, reliability in sort, scroll-to-me, inactive section. Head-to-head: profile Comparison tab.

### Pairs tab

A **Players · Pairs** mode switch sits under the filter header; changing mode never resets the sport, gender or scope filters. The pairs view is a view over `PairStat` ([results.md](./results.md)) — a derived aggregate, never a rated quantity.

`Backend/src/routes/pairRanking.routes.ts`, mounted at `/api/rankings` **before** `ranking.routes.ts`:

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /rankings/pairs?cityId&sport&period&sort&cursor&limit` | `authenticate` | cursor-paginated; the `me` block mirrors `/rankings/user-context`'s `userRank` |
| `GET /rankings/pairs/:pairId?sport` | `authenticate` | `pairId` is `userAId,userBId`; powers the `?pair=a,b` sheet |
| `POST /rankings/pairs/recalculate` | `authenticate` + `requireAdmin` | batched full rebuild |
| `GET /users/:id/partners?sport` | `authenticate` | Profile → Your partners |

**Ranking rules.** Minimum **5** games together inside the period to rank at all (`PAIR_MIN_GAMES`); **3** for the profile partners list (`PARTNER_MIN_GAMES`). Sorts: win rate (default), games together, combined level — each comparator ends on the pair ids, so the order is **total** and a page at a given offset is always the same page. Ranks are positional (`offset + index + 1`), matching the SQL `ROW_NUMBER()` the materialized path uses.

**Two read paths, one DTO.** `period=all` reads `PairStat` and sorts, pages and ranks in Postgres, so only one page is ever materialized in Node. `period=10|30` cannot come from `PairStat` (it stores all-time totals), so it re-derives the window from the games themselves, batch by batch, through the **same pure detection rules**, bounded by city × sport × window.

**Cursor.** Opaque base64url of `[offset, fingerprint]` where the fingerprint is `cityId:sport:period:sort`. The list is a ranking, so an offset into a total order is the right cursor; the fingerprint means a client that changes sort or period mid-scroll gets `400 errors.pairs.invalidCursor` instead of two interleaved orderings. This deliberately does **not** copy `/rankings/user-context`, which returns the whole leaderboard unpaginated.

### Chemistry

Chemistry is a **display-only** comparison, not a rating input:

```
chemistry = pairWinRate − mean(soloWinRate A, soloWinRate B)
```

in whole percentage points, where the solo numbers come from `UserSportProfile.gamesPlayed` / `gamesWon` for `period=all`, and from the same windowed scan that produced the pair totals for `period=10|30` (an all-time baseline against a 30-day pair rate would compare two different things).

Zero denominators decide whether the chip is honest, so they are specified exactly (`services/pairStat/chemistry.ts`):

| Case | Result | Why |
|------|--------|-----|
| `pairGames === 0` | `null` | there is no pair win rate to compare |
| both solo denominators `0` | `null` | no baseline exists; a chip would be fiction |
| exactly one solo denominator `0` | the **other** player's rate alone | treating the unknown as `0 %` would invent a huge positive chemistry for a brand-new partner |
| `wins > games` (corrupt counter) | clamped to `100 %` | a bad counter must not produce a >100 % rate |

`null` is the "nothing to show" state and renders **no chip**, never a `0`. The chip turns green at `chemistry >= 5` (`CHEMISTRY_POSITIVE_THRESHOLD`); colour is never the only signal — the accessible name always spells the number out. The same chip appears on the profile partners rail, the pair sheet, the user-team page and the recap's best-partner slide.

## Code

- Engine: `Backend/src/services/results/rating.service.ts`, `ratingUncertainty.ts`, `calculator.service.ts`
- Models: `UserSportProfile`, `LevelChangeEvent` in `schema.prisma`
- Display/questionnaires: `Frontend/shared/createTemplates.ts` `*_RATING_MODEL`
- Rankings: `Backend/src/services/ranking.service.ts`, `Frontend/src/components/leaderboard/`, `Frontend/src/api/ranking.ts`
