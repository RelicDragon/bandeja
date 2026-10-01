# Leagues

A **league season** is a `Game` with `entityType=LEAGUE_SEASON` (hub). Its id is `LeagueSeason.id`. **Fixtures** are child games `entityType=LEAGUE` with `parentId` → season. Do not treat league as a create-template tier ([create.md](./create.md)).

`Game.status` is still ANNOUNCED/STARTED/FINISHED/ARCHIVED. Fixture UI labels `SCHEDULED`/`NOT_SCHEDULED` come from `timeIsSet` / `resultsStatus`, not a `READY`/`PLAYING` game status.

League data (season, standings, rounds/schedule, groups, bracket) is intentionally public to every authenticated user (`GET /leagues/:id/*`, and the AI agent's league reads).

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

### Read access

Season reads follow the **direct-link model** of `GET /games/:id` (`GameReadService.getGameById`): a signed-in viewer holding the season id may read it, **private or not**. `GET /leagues/:id/rounds`, `/standings`, `/groups` and `/playoff/bracket` are therefore `authenticate` only, with no roster check. This is intentional:

- The season page already serves the same roster, fixtures and fixture outcomes to that viewer. Its schedule and standings tabs are shown to any signed-in user (table above). A roster guard here would hide nothing that `/games/:id` does not already return.
- Invited players and people sent a shared link open schedule/standings before they join. Shipped store builds call these endpoints on that path.
- Parity with `getGameById` holds: an unknown id answers 404 (`loadLeagueSeasonSportOrThrow` / `getGroupsReadOnly`). The system-game refusal is moot because `Game.cityId` is non-null.

The planner is the participants-only read (`canAccessGame`). Detailed fixture results (`GET /api/results/game/:id`) are stricter by design, because they are guest-readable: for a private fixture, only the roster of the fixture or of its season sees them ([results.md](./results.md)). The AI agent treats league seasons and their fixtures as public to every signed-in principal (`isAgentLeagueContent`, `assertAgentCanViewLeagueSeason`), matching these reads; see [agent.md](./agent.md). If private seasons ever need to be hidden from id holders, change `getGameById` and these reads together. Do not gate only the tabs.

LEAGUE fixture details: link to parent season; no season tabs. Parent owner/admin permissions inherit (`parentGamePermissions.ts`).

`GameStatusScheduler` skips `LEAGUE_SEASON` rows. FINAL LEAGUE fixtures trigger parent standings recalc.

### Write permissions

Every league write needs season **OWNER/ADMIN** (incl. parent-game roles, `hasParentGamePermission`) or a platform admin (`User.isAdmin`); a plain season participant is not enough. Errors: 404 unknown season/group, 400 archived season, 403 role (`{ success: false, message }`).

| Writes | Check |
|--------|-------|
| `POST /leagues` (create league + first season) | `User.canCreateLeague` or platform admin, else 403 (`LeagueCreateService.createLeague`). Same gate as the app's Create menu |
| `/:leagueSeasonId/*` writes (rounds, playoff, bracket, groups create/manual/reorder, sync, recalculate, swap, withdraw) | `canEditGame` route middleware (`assertGamePermission`) |
| `/groups/:groupId` rename / delete, `/groups/:groupId/participants` add / remove | `canEditLeagueGroup` route middleware → `LeagueGroupManagementService.ensureCanEditGroup` (group → season, then `assertGamePermission`). The service also checks on every write (`ensureCanEditSeason` / `ensureCanEditGroup`, also for create/reorder), so non-HTTP callers are covered |
| `POST /rounds/:id/games`, `DELETE /rounds/:id` | In the service: season-game participant with role OWNER/ADMIN, or platform admin (`create.service.ts`) |
| `POST /rounds/:id/send-start-message` | In the service: `hasParentGamePermission` OWNER/ADMIN or platform admin (`broadcast.service.ts`) |

Test: `npm run test:league-permissions` (`Backend/src/routes/__tests__/league.routes.permissions.http.integration.test.ts`).

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

For a full fixed-team round robin, the season creates enough REGULAR rounds for its largest group. Each group generates fixtures only for its own single cycle: even `n` teams play `n−1` rounds, odd `n` teams play `n` rounds with one bye per round. Smaller groups have no fixtures in later shared rounds. Manual **Create round** can intentionally start another cycle. Recreate applies the same per-group limit while preserving protected fixtures.

AI agent (season owner/admin, with a confirmation card): `get_league_schedule`, `reschedule_league_fixture` (time / club / court), `send_league_round_start_message` — [agent.md § League-owner tools](./agent.md#league-owner-tools-phase-4a-toolsleagueswritetoolsts-toolsleaguescheduletoolsts).

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

## Group chats

Seasons with **2+ groups** get one auto-managed private `GroupChannel` per `LeagueGroup` (`GroupChannel.leagueGroupId`, name `Season · Group`, season avatar). Members = non-withdrawn group participants (USER `userId` + TEAM `leagueTeam.players`) plus every season `OWNER`/`ADMIN` (same chat role). `LeagueGroupChatService.reconcileSeason` is idempotent; `queueLeagueGroupChatReconcile` (debounced, fire-and-forget) runs after group create/rename/delete/assign, sync, `ensure*LeagueParticipant`, swap, withdraw, and season admin/owner/kick changes. Existing chats keep syncing if the season drops back to one group; deleting a group deletes its chat. Members cannot leave/invite/edit (`assertNotLeagueGroupChat`); mute is allowed. FE: **Group chat** button on Standings group cards (`GET /leagues/:id/group-chats`). Backfill (Jesen-Zima 2026 only): `npm run backfill:league-group-chats [-- --apply]`.

## Code

- BE: `Backend/src/services/league/` (`create.service.ts`, `groups.service.ts`, `planner.service.ts`, `bracketPlayoff.service.ts`, `bracketStructure.ts`, `leagueTeamWithdrawal.service.ts`, `sync.service.ts`, …)
- FE: `GameDetailsShell` league tabs; `LeagueScheduleTab`, `LeaguePlannerTab`, `LeagueStandingsTab`, `LeagueBracketView`, `LeagueFixtureMatrix`; fullscreen pages above
- Format seeds: `Frontend/src/components/GameDetails/playoffTemplates.ts` (not create templates)
