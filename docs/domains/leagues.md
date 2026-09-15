# Leagues

A **league season** is a `Game` with `entityType=LEAGUE_SEASON` (hub). Its id is `LeagueSeason.id`. **Fixtures** are child games `entityType=LEAGUE` with `parentId` → season. Do not treat league as a create-template tier ([create.md](./create.md)).

`Game.status` is still ANNOUNCED/STARTED/FINISHED/ARCHIVED. Fixture UI labels `SCHEDULED`/`NOT_SCHEDULED` come from `timeIsSet` / `resultsStatus`, not a `READY`/`PLAYING` game status.

`RoundType`: `REGULAR` | `PLAYOFF`. `PlayoffFormat`: `SESSION` | `BRACKET`. `LeagueParticipantType`: `USER` | `TEAM`.

## Shell

`/games/:id` with `variant="league"`. Season tabs (`?tab=`):

| Tab | Who | Content |
|-----|-----|---------|
| general | all | Same as [games.md](./games.md) general + season points |
| schedule | signed-in | Fixtures, bracket, my games, fixture sheets (`LeagueScheduleTab`) |
| planner | season **participants** only | Planning grid (`LeaguePlannerTab`). Non-participants bounce off `?tab=planner` |
| standings | signed-in | Group/bracket tables (`LeagueStandingsTab`) |
| faq | when FAQs exist | Season FAQ |

Fullscreen:

- `/games/:id/league-table` — fixture matrix (`LeagueFixtureTableFullscreenPage`). Also `?tab=schedule&subtab=table` on details
- `/games/:id/league-bracket` — playoff bracket (`LeagueBracketFullscreenPage`)

LEAGUE fixture details: link to parent season; no season tabs. Parent owner/admin permissions inherit (`parentGamePermissions.ts`).

`GameStatusScheduler` skips `LEAGUE_SEASON` rows. FINAL LEAGUE fixtures trigger parent standings recalc.

## Generation

`Backend/src/services/league/` + `Backend/src/routes/league.routes.ts`. Editor: `canEditGame` on the season.

| Capability | Endpoint / service |
|------------|-------------------|
| Full round-robin | `POST .../rounds/full-round-robin` (`createFullRegularRoundRobin`); recreate `.../recreate` |
| Custom manual round | `POST .../rounds`; `POST /rounds/:id/games` |
| Session playoff | `POST .../playoff` `gameType` **WINNER_COURT** or **AMERICANO** (mini-tournaments). Seeds: `PLAYOFF_GAME_TYPE_TEMPLATES` / `playoffTemplates.ts` — not `CREATE_TEMPLATES` |
| Bracket playoff | `POST .../playoff/bracket` (+ preview). Scope `PER_GROUP` \| `CROSS_GROUP`. Options: third place, consolation, double elimination, custom byes, play-in (`BracketSlotKind`) |
| Groups | CRUD, assign, reorder (`groups.service.ts`) |
| Standings | `GET .../standings`; `POST .../standings/recalculate` (`leagueStandingsRecalculate.service.ts`) |
| Bracket slots | patch, **walkover** (`.../slots/:slotId/walkover`) — walkover is **playoff** vocabulary |
| Round start message | `POST /rounds/:id/send-start-message` |
| Mid-season player swap | `.../swap-player` (`canEditGame`). Blocked after team withdrawal |
| Team withdrawal | `POST .../participants/:id/withdraw` |

Fixture create uses `gameCreation.util.ts` (`createLeagueGame` / `createLeaguePlayoffGame`). Match pairing engines for **games** (americano etc.) live under `Backend/src/services/results/generation/`; league RR uses `generation/fixedTeamsRoundRobin.ts`.

## Team withdrawal

Vocabulary from root `CONTEXT.md`. Applies to **TEAM** franchises in **fixed-team** seasons only (`LeagueTeamWithdrawalService`). Authority: same as player swap (`canEditGame`). UI: `LeagueTeamWithdrawModal` next to swap in Manage groups.

| Term | Meaning |
|------|---------|
| Team withdrawal | Franchise leaves remaining regular-season competition; stays on standings for history |
| Technical win / technical loss | Auto result for unfinished REGULAR fixtures vs withdrawn team. Neutral: W/L and points, no set/game delta, no rating/level change (`leagueNeutralTechnicalResult.ts`) |
| Played result | Already decided before withdraw; kept |
| Unfinished fixture | `resultsStatus` not FINAL; overwritten with that technical result (do not leave IN_PROGRESS) |
| Standings place | Ordinal among **active** (non-withdrawn) only; withdrawn cluster after them with no place; same ranking rules inside the cluster |
| Withdrawal finality | Irreversible; technical results stay FINAL |
| Withdrawal scope | Unfinished **REGULAR** only. PLAYOFF slots out of scope. Do not auto playoff-walkover on withdraw |
| Results vs withdrawn | Played + technical vs withdrawn still count for active W/L, H2H, mini-table |
| Withdrawn roster lock | No player swap |
| Withdrawn group lock | Stays in group; new REGULAR fixtures only among non-withdrawn |

Avoid: DNS, delete participant, forfeit (alone), undo withdraw, USER/singles forfeit via this flow.

## Code

- BE: `Backend/src/services/league/` (`create.service.ts`, `groups.service.ts`, `planner.service.ts`, `bracketPlayoff.service.ts`, `bracketStructure.ts`, `leagueTeamWithdrawal.service.ts`, `sync.service.ts`, …)
- FE: `GameDetailsShell` league tabs; `LeagueScheduleTab`, `LeaguePlannerTab`, `LeagueStandingsTab`, `LeagueBracketView`, `LeagueFixtureMatrix`; fullscreen pages above
- Format seeds: `Frontend/src/components/GameDetails/playoffTemplates.ts` (not create templates)
