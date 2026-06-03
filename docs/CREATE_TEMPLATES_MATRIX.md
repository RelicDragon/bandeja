# Create-game template matrix (all sports)

Source of truth: `Frontend/src/sport/createFlow.ts`, `Frontend/src/sport/createTemplateParticipantFit.ts`, `Frontend/src/sport/rotationFormats.ts`, `Frontend/src/sport/sportRegistry.ts`.

Generated from codebase — update when templates change.

**Behavior:** Selecting a template applies **scoring / generation only** (preset, game type, match generation, ranking, timer, golden point). It does **not** change roster size or 1v1 vs 2v2. Suggested roster/courts below are hints for filtering and copy, not forced on click.

---

## Rotation policy by sport


| Sport        | Americano | Mexicano | Winners court | Ladder | KOTC | Round robin | Min rotation roster | Notes                                             |
| ------------ | --------- | -------- | ------------- | ------ | ---- | ----------- | ------------------- | ------------------------------------------------- |
| Padel        | ✓         | ✓        | ✓But          | ✓      | ✓    | —           | 4                   | Default americano preset `POINTS_24`              |
| Tennis       | —         | —        | —             | —      | —    | —           | —                   | Singles/doubles host only                         |
| Pickleball   | ✓         | ✓        | ✓             | —      | ✓    | —           | 4                   | Americano **doubles only** (hidden at 1v1)        |
| Badminton    | ✓         | ✓        | ✓             | —      | ✓    | —           | 4                   | Americano **doubles only**                        |
| Table tennis | —         | —        | —             | ✓      | —    | ✓           | 4                   | No padel-style americano/mexicano in UI           |
| Squash       | —         | —        | ✓             | ✓      | —    | —           | —                   | Singles only (`allowedPlayerCountsPerMatch: [2]`) |


---

## Sport defaults (roster / match size)


| Sport        | Default players/match | Allowed players/match | Default event roster |
| ------------ | --------------------- | --------------------- | -------------------- |
| Padel        | 4                     | 2, 4                  | 4                    |
| Tennis       | 2                     | 2, 4                  | 4                    |
| Pickleball   | 2                     | 2, 4                  | 4                    |
| Badminton    | 2                     | 2, 4                  | 4                    |
| Table tennis | 2                     | 2, 4                  | 4                    |
| Squash       | 2                     | 2 only                | 4                    |


---

## Scoring presets (advanced wizard / `presetMeta`)


| Sport            | Social presets                                               | Match presets                                                                                        | Both                                                        | Strict validation |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------- |
| **Padel**        | POINTS_11, 16, 21, 24 (default social), 32, TIMED            | CLASSIC_BEST_OF_3 (default match, strict), BEST_OF_5, PRO_SET, SHORT_SET, SINGLE_SET, SUPER_TIEBREAK | CLASSIC_TIMED (CLASSIC_TIMED_RELAXED), BEST_OF_3_11, CUSTOM | CLASSIC_BEST_OF_3 |
| **Tennis**       | CLASSIC_TIMED (default social, CLASSIC_TIMED_RELAXED), TIMED | CLASSIC_BEST_OF_3 (default match, strict), BEST_OF_5, PRO_SET, SHORT_SET, SINGLE_SET, SUPER_TIEBREAK | CUSTOM                                                      | CLASSIC_BEST_OF_3 |
| **Pickleball**   | POINTS_16, 21 (default social), 24, 32                       | BEST_OF_3_11 (default match, PICKLEBALL_RALLY_11, strict)                                            | CUSTOM                                                      | BEST_OF_3_11      |
| **Badminton**    | POINTS_21 (default social)                                   | BEST_OF_3_21 (default match, BWF_21, strict)                                                         | BEST_OF_3_15 (BWF_15), CUSTOM                               | BWF_21, BWF_15    |
| **Table tennis** | POINTS_11, SINGLE_GAME_21                                    | BEST_OF_5_11 (default match)                                                                         | BEST_OF_3_11 (default match in meta), CUSTOM                | —                 |
| **Squash**       | —                                                            | BEST_OF_5_11 (default match), BEST_OF_3_11                                                           | CUSTOM                                                      | —                 |


*Template `TENNIS_FAST4_SOCIAL` uses preset `CLASSIC_FAST4` (allowed on tennis via full scoring list, not listed in casual `presetMeta` rows).*

---

## Template catalog (all definitions)


| ID                      | In create UI | Sport        | Tier   | Display title (EN)              | Game type   | Match generation | Scoring preset    | PPM | Suggested roster | Suggested courts | Min roster† | Max roster‡ | Affects rating | Match timer | Cap (min) | Golden point |
| ----------------------- | ------------ | ------------ | ------ | ------------------------------- | ----------- | ---------------- | ----------------- | --- | ---------------- | ---------------- | ----------- | ----------- | -------------- | ----------- | --------- | ------------ |
| PADEL_AMERICANO_10      | ✓            | Padel        | social | Americano · 10 min              | AMERICANO   | RANDOM           | POINTS_24         | 4   | 16               | 4                | 4           | —           | no             | yes         | 10        | —            |
| PADEL_AMERICANO_24      | ✓            | Padel        | social | Americano (24 pts)              | AMERICANO   | RANDOM           | POINTS_24         | 4   | 8                | 2                | 4           | —           | no             | yes         | 15        | —            |
| PADEL_AMERICANO_20      | ✓            | Padel        | social | Americano · 20 min              | AMERICANO   | RANDOM           | POINTS_24         | 4   | 16               | 4                | 4           | —           | no             | yes         | 20        | —            |
| PADEL_MEXICANO_24       | ✓            | Padel        | social | Mexicano (24 pts)               | MEXICANO    | RATING           | POINTS_24         | 4   | 8                | 2                | 4           | —           | no             | yes         | 15        | —            |
| PADEL_CHALLENGER_POOL   | ✓            | Padel        | social | Challenger pool                 | KOTC        | KING_OF_COURT    | POINTS_11         | 4   | 12               | 3                | 8           | —           | no             | yes         | 12        | —            |
| PADEL_KOTC_11           | —            | Padel        | social | King of the Court               | KOTC        | KING_OF_COURT    | POINTS_11         | 4   | 12               | 3                | 8           | —           | no             | yes         | 12        | —            |
| PICKLEBALL_SOCIAL_21    | ✓            | Pickleball   | social | Open play (21 pts)              | AMERICANO   | RANDOM           | POINTS_21         | 4   | 12               | 3                | 4           | —           | no             | yes         | 15        | —            |
| PICKLEBALL_MATCH_BO3_11 | ✓            | Pickleball   | match  | Best of 3 to 11                 | CLASSIC     | AUTOMATIC        | BEST_OF_3_11      | 2   | 4                | 1                | 2           | 4           | yes            | —           | —         | —            |
| PICKLEBALL_KOTC_11      | ✓            | Pickleball   | social | King of the Court               | KOTC        | KING_OF_COURT    | POINTS_11         | 4   | 12               | 3                | 8           | —           | no             | yes         | 12        | —            |
| BADMINTON_AMERICANO_21  | ✓            | Badminton    | social | Club night (21 balls)           | AMERICANO   | RANDOM           | POINTS_21         | 4   | 12               | 3                | 4           | —           | no             | yes         | 15        | —            |
| BADMINTON_CLUB_3X15     | ✓            | Badminton    | social | Club 3×15                       | CLASSIC     | AUTOMATIC        | BEST_OF_3_15      | 2   | 8                | 2                | 2           | 8           | no             | —           | —         | —            |
| BADMINTON_MATCH_3X21    | ✓            | Badminton    | match  | 3×21 official                   | CLASSIC     | AUTOMATIC        | BEST_OF_3_21      | 2   | 4                | 1                | 2           | 4           | yes            | —           | —         | —            |
| TT_OPEN_PLAY_11         | ✓            | Table tennis | social | Quick game to 11                | CLASSIC     | AUTOMATIC        | POINTS_11         | 2   | 4                | 1                | 2           | 4           | no             | yes         | 15        | —            |
| TT_CLUB_RR_11           | ✓            | Table tennis | social | Club round robin                | ROUND_ROBIN | ROUND_ROBIN      | POINTS_11         | 2   | 8                | 2                | 6           | —           | no             | yes         | 12        | —            |
| TT_LEGACY_SINGLE_21     | ✓            | Table tennis | social | Old-school 21-point single game | CLASSIC     | AUTOMATIC        | SINGLE_GAME_21    | 2   | 4                | 1                | 2           | 4           | no             | —           | —         | —            |
| TT_BOX_BO3_11           | ✓            | Table tennis | social | Box league Bo3×11               | LADDER      | ESCALERA         | BEST_OF_3_11      | 2   | 12               | 3                | 6           | —           | no             | yes         | 15        | —            |
| TT_MATCH_BO3_11         | ✓            | Table tennis | match  | Match Bo3×11                    | CLASSIC     | AUTOMATIC        | BEST_OF_3_11      | 2   | 4                | 1                | 2           | 4           | yes            | —           | —         | —            |
| TT_MATCH_BO5_11         | ✓            | Table tennis | match  | Match Bo5×11                    | CLASSIC     | AUTOMATIC        | BEST_OF_5_11      | 2   | 4                | 1                | 2           | 4           | yes            | —           | —         | —            |
| TT_AMERICANO_11         | —            | Table tennis | social | *(no EN i18n)*                  | AMERICANO   | RANDOM           | POINTS_11         | 4   | 12               | 3                | 4           | —           | no             | yes         | 15        | —            |
| TT_MEXICANO_11          | —            | Table tennis | social | *(no EN i18n)*                  | MEXICANO    | RATING           | POINTS_11         | 4   | 12               | 3                | 4           | —           | no             | yes         | 15        | —            |
| TT_SWISS_BOX            | —            | Table tennis | social | Swiss box                       | LADDER      | ESCALERA         | BEST_OF_3_11      | 2   | 12               | 3                | 6           | —           | no             | yes         | 15        | —            |
| TENNIS_FAST4_SOCIAL     | ✓            | Tennis       | social | FAST4 social                    | CLASSIC     | AUTOMATIC        | CLASSIC_FAST4     | 2   | 4                | 1                | 2           | 4           | no             | yes         | 15        | yes          |
| TENNIS_CLASSIC_BO3      | ✓            | Tennis       | match  | Best of 3 sets                  | CLASSIC     | AUTOMATIC        | CLASSIC_BEST_OF_3 | 2   | 4                | 1                | 2           | 4           | yes            | —           | —         | —            |
| SQUASH_QUICK_BO3_11     | ✓            | Squash       | match  | Quick Bo3×11                    | CLASSIC     | AUTOMATIC        | BEST_OF_3_11      | 2   | 4                | 1                | 2           | 4           | yes            | —           | —         | —            |


† **Min roster** — from `minRosterForTemplate()`; template hidden if `maxParticipants` is lower.  
‡ **Max roster** — only for non-rotation (`CLASSIC` host-a-match) templates; hidden if roster is higher. Rotation templates have no upper cap in the filter.

**In create UI** — listed in `CREATE_FLOW_BY_SPORT[sport].createTemplates` for that sport.

---

## Templates shown in UI, by sport and intent tab

### Padel — Social (5)


| Template              | Intent tab |
| --------------------- | ---------- |
| PADEL_AMERICANO_10    | social     |
| PADEL_AMERICANO_24    | social     |
| PADEL_AMERICANO_20    | social     |
| PADEL_MEXICANO_24     | social     |
| PADEL_CHALLENGER_POOL | social     |


*Padel has no match-tier create templates; use Advanced + classic presets.*

### Tennis — Social (1) / Match (1)


| Template            | Intent tab |
| ------------------- | ---------- |
| TENNIS_FAST4_SOCIAL | social     |
| TENNIS_CLASSIC_BO3  | match      |


### Pickleball — Social (2) / Match (1)


| Template                | Intent tab |
| ----------------------- | ---------- |
| PICKLEBALL_SOCIAL_21    | social     |
| PICKLEBALL_KOTC_11      | social     |
| PICKLEBALL_MATCH_BO3_11 | match      |


### Badminton — Social (2) / Match (1)


| Template               | Intent tab |
| ---------------------- | ---------- |
| BADMINTON_AMERICANO_21 | social     |
| BADMINTON_CLUB_3X15    | social     |
| BADMINTON_MATCH_3X21   | match      |


### Table tennis — Social (4) / Match (2)


| Template            | Intent tab |
| ------------------- | ---------- |
| TT_OPEN_PLAY_11     | social     |
| TT_CLUB_RR_11       | social     |
| TT_LEGACY_SINGLE_21 | social     |
| TT_BOX_BO3_11       | social     |
| TT_MATCH_BO3_11     | match      |
| TT_MATCH_BO5_11     | match      |


### Squash — Match only (1)


| Template            | Intent tab |
| ------------------- | ---------- |
| SQUASH_QUICK_BO3_11 | match      |


*Squash has no social-tier create templates in UI.*

---

## Participant filter matrix

A template appears in the picker only when **all** of the following hold (`isCreateTemplateCompatible`):


| Rule                         | Effect                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Scoring preset allowed       | `tpl.scoringPreset` ∈ sport `allowedScoringPresets`                                                               |
| Players per match            | `tpl.playersPerMatch ===` current 1v1/2v2 setting                                                                 |
| Mixed pairs                  | Hidden for all templates if `genderTeams === MIX_PAIRS` and players/match is **2** (singles)                      |
| Rotation allowed             | For AMERICANO / MEXICANO / LADDER / KOTC / ROUND_ROBIN: sport rotation flag must allow that format at current PPM |
| Fixed teams + rotation pairs | Hidden if `hasFixedTeams` and game type is **AMERICANO** or **MEXICANO**                                          |
| Roster floor                 | `maxParticipants >= minRosterForTemplate(sport, tpl)`                                                             |
| Roster ceiling               | For **CLASSIC** host templates only: `maxParticipants <= tpl.suggestedMaxParticipants`                            |


### Visibility by setup (quick reference)

Legend: **✓** = can show (if intent tab and preset match) · **—** = filtered out

#### Padel (4v4 rotation sport)


| Setup                         | Americano* | Mexicano | Challenger pool | Notes                      |
| ----------------------------- | ---------- | -------- | --------------- | -------------------------- |
| 4–16 players, 2v2, open teams | ✓          | ✓        | ✓ (≥8)          | All social templates       |
| 4–7 players, 2v2              | ✓          | ✓        | —               | KOTC needs ≥8              |
| 2–3 players, 2v2              | —          | —        | —               | Below rotation minimum (4) |
| 8 players, 1v1                | —          | —        | —               | Templates require PPM 4    |
| 8 players, 2v2, fixed teams   | —          | —        | ✓               | Americano/Mexicano hidden  |


#### Pickleball / Badminton (doubles rotation; americano disabled at 1v1)


| Setup                 | Americano / club doubles | KOTC (4v4) | Bo3 match (2v2) | Club 3×15 / open (2v2) |
| --------------------- | ------------------------ | ---------- | --------------- | ---------------------- |
| ≥4 players, 2v2, open | ✓                        | ✓ (≥8)     | —               | —                      |
| 2–4 players, 1v1      | —                        | —          | ✓ (≤4 roster)   | ✓ badminton only       |
| 2v2 fixed teams       | —                        | ✓          | ✓               | ✓                      |


#### Table tennis


| Setup             | Open play / legacy 21 / match Bo3/5 | Club RR | Box league |
| ----------------- | ----------------------------------- | ------- | ---------- |
| 2–4 players, 1v1  | ✓                                   | —       | —          |
| 6–8 players, 1v1  | —                                   | ✓       | —          |
| 6–12 players, 1v1 | —                                   | —       | ✓          |
| 4v4 (doubles PPM) | —                                   | —       | —          |


#### Tennis


| Setup                           | FAST4 social | Classic Bo3 match |
| ------------------------------- | ------------ | ----------------- |
| 2–4 players, 1v1 or 2v2 doubles | ✓ (≤4)       | ✓ (≤4)            |
| >4 players                      | —            | —                 |


#### Squash


| Setup                 | Quick Bo3×11 |
| --------------------- | ------------ |
| 2–4 players, 1v1 only | ✓            |
| >4 players            | —            |
| Any 2v2 PPM           | —            |


---

## Legacy / stored-only templates


| ID                              | Why kept                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| PADEL_KOTC_11                   | Older `templateId` on games; superseded by PADEL_CHALLENGER_POOL in UI |
| TT_AMERICANO_11, TT_MEXICANO_11 | TT rotation policy disables americano/mexicano; removed from UI        |
| TT_SWISS_BOX                    | Replaced by TT_BOX_BO3_11 in UI                                        |


---

## Backend parity

Server template definitions mirror FE in `Backend/src/sport/sportRegistryCasual.ts` (same IDs and fields for validation / defaults). Keep FE and BE in sync when adding templates.