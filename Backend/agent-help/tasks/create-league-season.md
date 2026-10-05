---
id: create-league-season
audience: [player, organizer, season_admin, league_creator, admin]
requires: [user.canCreateLeague]
related: [roles, enter-results, create-tournament, invite-players, ui-map]
verified_against: [Frontend/src/components/CreateMenuModal.tsx, Frontend/src/utils/noviceShell.ts, Frontend/src/pages/CreateLeague.tsx, Frontend/src/components/createLeague/LeagueSeasonSection.tsx, Frontend/src/components/createLeague/LeagueLocationSection.tsx, Backend/src/services/league/create.service.ts, Backend/src/routes/league.routes.ts, Backend/src/utils/game/userMaxParticipantsCap.ts, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/components/GameDetails/LeagueScheduleTab.tsx, Frontend/src/components/GameDetails/LeagueRoundAccordion.tsx, Frontend/src/components/GameDetails/LeagueGroupEditorModal.tsx, Frontend/src/components/GameDetails/LeagueSeasonPointsSection.tsx, Frontend/src/components/gameFormat/gameFormatTeamsVisibility.ts, Frontend/src/components/ManageUsersModal.tsx, Frontend/src/utils/leagueScheduleRegularSeasonScope.ts, Backend/src/services/league/gameCreation.util.ts, Backend/src/services/league/leagueSeasonFinalize.service.ts, Backend/src/utils/parentGamePermissions.ts, Backend/src/services/agent/tools/leagues.write.tools.ts, Backend/src/services/agent/tools/leagueSchedule.tools.ts, docs/domains/agent.md]
---
# Create a league and run a season

## Goal

Create a league with its first season, get players in, split them into groups, generate rounds of fixtures (league matches), schedule them, and follow the standings, optionally ending with a play-off. A season is one long competition; each fixture is a separate match page with its own results.

## Who can do this

- **Creating a league** needs the *can create leagues* permission (or being a platform admin). Only a platform admin can grant it; there is no request button in the app, so the user has to ask a platform admin (see topic `roles`). Without it the "League"{games.entityTypes.LEAGUE} option does not appear in the create menu and the server refuses to create it.
- Users in novice mode also do not see "League"{games.entityTypes.LEAGUE} until they reach the Regular rank (or choose "I know my way around — show me everything"), even with the permission.
- **Running a season** (groups, rounds, fixtures, schedule, start messages, play-offs) is for the season owner and season admins. The creator becomes the owner. The owner can make any season participant an admin with "Promote to Admin"; admins have the same management rights except promoting admins, transferring ownership and deleting.
- **Players** join the season, see the "Schedule"{gameDetails.schedule}, "Planner" and "Standings"{gameDetails.standings}, and can enter results of their own fixtures. Anyone signed in can view a league's standings and schedule.

## Steps in the UI

### Create the league and first season
<!-- audience: league_creator, admin -->
1. Tap the + button in the header ("Create"{games.create}) and choose "League"{games.entityTypes.LEAGUE}.
2. On "Create League"{createGame.createLeague} fill in "League Name"{createLeague.name} (required) and an optional "Description"{createLeague.description}.
3. "Location"{createLeague.location}: "Select City" (required), then optionally "Select Club" (only clubs that support the chosen sport are listed).
4. "Season"{createLeague.season}: optional "Season Avatar", "Season Name" (defaults to this year/next year), "Player Level"{createLeague.playerLevel} range, "Max Participants"{createLeague.maxParticipants} (4 up to your limit) and "Start Date" (today or later, required).
5. "Game Format": the scoring, sets or points and ranking used by every fixture, plus the points per win, tie and loss for the standings.
6. Tap "Create League"{createLeague.createButton}. The app returns to Home; the new season appears among your games/leagues. The creator is the owner and a playing participant.

### Get players in
1. Share the season or use "Invite"{games.invite} on its "General"{gameDetails.general} tab. Players tap Join; by default they wait in the join queue until the owner or an admin accepts them.
2. To make someone a season admin: "General"{gameDetails.general} tab, participants card, "Players"{games.players} button, pick the person, "Promote to Admin" (owner only).

### Fixed pairs (doubles leagues with steady teams)
In the season's "Game Format" section turn on "Fixed Pairs"{games.fixedTeams} and set the pairs. Do this before generating rounds: it is required for "Create all regular rounds", bracket play-offs, swapping a team player and withdrawing a team.

### Groups, rounds and fixtures
1. Open the "Schedule"{gameDetails.schedule} tab and tap "Create Groups". The app syncs the confirmed players into the league and asks "Select Number of Groups".
2. "Manage groups" opens "League groups": "Add group", "Add participant" (a participant can be in one group only), the "Order" tab, and on "Tools" "Sync participants" (adds players who joined later) and "Recreate season table" (rebuilds unscheduled fixtures as a single round-robin; scheduled and played ones are kept).
3. Build the fixtures:
   - Fixed-pairs season: "Create all regular rounds" adds every matchup in each group in one go.
   - Otherwise: "Create Round" creates the next round with generated fixtures; repeat for each round. Inside a round, "Add Game" adds a fixture by hand.
4. Schedule each fixture: tap its edit icon, then "Location & Time" (and "Edit Teams" for the lineup). Fixtures show "Not scheduled", "Scheduled"{gameDetails.fixtureCellScheduled} or "Played"{gameDetails.fixtureCellPlayed}.
5. When a round is ready, "Send Start Message" notifies all its players (once per round, cannot be resent).
6. Players (or organizers) enter each fixture's results; standings update when a fixture's results are finished.

### Play-off and end of season
When every regular-season fixture in view is finished, a "Regular season" / "Play-off" switch appears. Under "Play-off" tap "Create Playoff": a session play-off (Americano or King of Court style, at least 4 participants) or a bracket (fixed pairs only, up to 16 teams). The season becomes finished automatically when every bracket is decided; there is no manual button to finish a season.

## Settings that matter

- **"Max Participants"{createLeague.maxParticipants}**: the cap is 12 unless your account has a higher limit; platform admins and users who may create big tournaments can go up to 999.
- **"Game Format"**: applies to every fixture. Set it before generating rounds.
- **Points per result** ("Points per result" section, "Win"{gameResults.win}, "Tie"{gameResults.tie}, "Loss"{gameResults.loose}): how many standings points each outcome gives. Ties in the table are broken by head-to-head, then a mini-table, then score difference ("Show explanations" on "Standings"{gameDetails.standings}).
- **"Fixed Pairs"{games.fixedTeams}**: teams instead of individual players in the standings; needed for full round-robin generation, brackets, swaps and withdrawals.
- **Fixtures** are private, rated, and allow results by any confirmed player of the fixture or the season. They use the season's price unless a fixture has its own.
- **Groups**: with 2 or more groups each group gets its own group chat.

## Common mistakes

- **No "League"{games.entityTypes.LEAGUE} in the create menu**: missing *can create leagues* permission (ask a platform admin), or the user is still in novice mode.
- **"Create League"{createLeague.createButton} greyed out**: league name, city or start date is missing.
- **Can't set more participants**: the account limit (usually 12) applies; a platform admin can raise it.
- **No club list**: pick a city first; only clubs for the season's sport appear.
- **No management buttons on "Schedule"{gameDetails.schedule}**: you are not the season owner or an admin.
- **No "Create all regular rounds"** or it is disabled: the season has no fixed pairs, "Create groups first", "Assign complete teams (two players each) in every group", or regular rounds already exist ("Delete existing regular season rounds first").
- **No "Create Round"**: create groups with participants first.
- **Can't delete a round**: only the last round, and only while none of its fixtures has results.
- **Start message button gone**: it was already sent for that round.
- **No "Planner" tab**: it is only for season participants.
- **A player can't move their fixture's time**: only the season owner or admins reschedule fixtures.
- **No "Play-off" switch / "Bracket playoffs require fixed teams."**: finish all regular-season fixtures first; brackets need fixed pairs.
- **Can't substitute a player in a fixture**: league rosters change through the team (swap a team player in "Manage groups"), not on the fixture.
- **The season never shows as finished**: it only finishes when a bracket play-off is fully decided.

## What the assistant can do

- Read: `get_league_season`, `get_league_standings`, `get_league_schedule` (fixtures by round, day or missing time/club/court), `get_game_results` for a fixture.
- Season owner/admin writes (confirmation card first): `reschedule_league_fixture` (date, time, club, court of a fixture whose results have not started; not with linked court bookings or several courts) and `send_league_round_start_message` (once per round).
- Fixture results: `enter_match_score` and `finish_results` work on league fixtures for organizers and the fixture's or season's confirmed players.
- App only: creating a league or season, joining a season, groups, creating rounds or fixtures, fixed pairs, format and points, price, play-offs and brackets, swaps and withdrawals, admins and ownership, and resetting or editing final results. The assistant cannot grant *can create leagues* (platform admins can use `admin_update_user_flags`).
