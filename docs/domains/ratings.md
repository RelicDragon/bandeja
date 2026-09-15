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

**Not ELO.** Post-FINAL GAME/LEAGUE/TOURNAMENT, playing participants rate opponents they shared an official scored match: LOWER / ABOUT_RIGHT / HIGHER vs post-match shown level. Editable 14 days. Never writes `level` / reliability / uncertainty. Profile aggregate after thresholds (5 evaluators, 3 games, 0.5 level window, 365-day window). UI kill: `VITE_PLAYER_LEVEL_FEEDBACK_ENABLED=false` (BE auth still enforced).

`player-level-evaluation.service.ts`, `Frontend/src/features/player-level-feedback/`.

## Leaderboard

Route `/leaderboard` → `LeaderboardTab` → `ProfileLeaderboard`. API `GET /rankings/user-context`, `GET /rankings/achievement-context`. `ranking.service.ts` + `ratingLeaderboardQualify.ts`. City + sport, period, rating vs games vs social, gender filter, reliability in sort, scroll-to-me, inactive section. Head-to-head: profile Comparison tab.

## Code

- Engine: `Backend/src/services/results/rating.service.ts`, `ratingUncertainty.ts`, `calculator.service.ts`
- Models: `UserSportProfile`, `LevelChangeEvent` in `schema.prisma`
- Display/questionnaires: `Frontend/shared/createTemplates.ts` `*_RATING_MODEL`
- Rankings: `Backend/src/services/ranking.service.ts`, `Frontend/src/components/leaderboard/`, `Frontend/src/api/ranking.ts`
