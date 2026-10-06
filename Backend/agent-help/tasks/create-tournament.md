---
id: create-tournament
audience: [player, organizer, tournament_creator, admin]
requires: []
related: [roles, enter-results, create-game, invite-players, book-court, ui-map]
verified_against: [Frontend/src/components/CreateMenuModal.tsx, Frontend/src/utils/noviceShell.ts, Frontend/shared/novice/index.ts, Frontend/src/pages/CreateGame.tsx, Frontend/src/components/createGame/ParticipantsSetupSection.tsx, Frontend/src/components/createGame/GameSettingsSection.tsx, Frontend/src/utils/gameFormat/showGameFormatTemplatePicker.ts, Frontend/src/utils/gameFormat/generationWizardOptions.ts, Frontend/src/components/createGame/courtPlan/courtPlanModel.ts, Frontend/src/utils/userMaxParticipantsInGame.ts, Backend/src/utils/game/userMaxParticipantsCap.ts, Backend/src/services/game/create.service.ts, Backend/src/utils/gameStatus.ts, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/utils/gameResults.ts, Backend/src/services/agent/tools/createGame.tools.ts, Backend/src/services/agent/tools/results.tools.ts]
---
# Create a tournament

## Goal

Set up a tournament: one event with 8 or more players who play several rounds (Americano, Mexicano, Round Robin, King of the Court, Ladder and similar), with results entered round by round and a final standings table. For a single 2- or 4-player match use a casual game instead (topic `create-game`); for a multi-week competition with groups and fixtures use a league (topic `create-league-season`).

## Who can do this

- Any signed-in user can create a tournament. No special permission is needed.
- Without extra rights a tournament can have 8, 10 or 12 players. Bigger tournaments (up to 32 players) need the *can create tournaments* permission, which only a platform admin can grant. There is no request button in the app; the user has to ask a platform admin (see topic `roles`).
- New users in novice mode do not see the "Tournament"{games.entityTypes.TOURNAMENT} option in the create menu until they reach the Regular rank (5 counted games). They can show everything earlier with "I know my way around — show me everything" on the Home screen. This only hides the button; it is not a permission.
- After creation the creator is the tournament's owner. The owner and the admins they promote run it (enter results, accept players, change settings).

## Steps in the UI

1. Tap the + button in the header ("Create"{games.create}) and choose "Tournament"{games.entityTypes.TOURNAMENT} (red button, crossed swords). If the profile has no name yet, the app asks for one first.
2. The "Create Tournament"{createGame.createTournament} page opens. Optional "Name & photo" at the top (placeholder "Name your tournament").
3. Step 1 "Game setup":
   - Sport (only shown if the user plays more than one sport).
   - "Tournament Participants": pick the number of players (even numbers from 8; default 8).
   - "Singles" or "Doubles" when the sport allows both. For doubles choose "Rotating" or "Fixed Pairs".
   - The "Game Format" card: open it to choose scoring, sets or points, "Matchups" and ranking. Tournaments have no quick template picker; the format is always set here.
4. Step 2 "Location & time"{createGame.steps.location}: "Select Club", optional court(s), "Date", "Duration"{createGame.duration} and start time. At clubs with online booking the app offers to reserve the court as part of creating (see topic `book-court`). A repeat row lets you repeat the tournament weekly or every 2 weeks.
5. Step 3 "Players"{createGame.steps.players}: set the "Tournament Player Level" range and use "Invite Players" to pick people; invitations are sent after the tournament is created.
6. Step 4 "Settings & details": the "Tournament Settings" toggles, then description and "Price"{createGame.price}.
7. Tap "Create Tournament"{createGame.createButtonTournament} at the bottom (the label changes when a court is reserved at the same time). The tournament is created at once with status ANNOUNCED; there is no draft or publish step.
8. On the day: when every seat is filled, open the tournament and tap "Start Results Entry" (topic `enter-results`).

### Bigger tournaments
<!-- audience: tournament_creator, admin -->
With the *can create tournaments* permission the "Tournament Participants" choice goes up to 32 players (even numbers). Everything else is the same.

## Settings that matter

- **Number of participants**: the tournament can only start results entry when exactly this many players are confirmed (PLAYING). Invited or queued people do not count.
- **"Fixed Pairs" vs "Rotating"** (doubles): with fixed pairs, partners stay together all tournament ("Partners stay together for the entire tournament.") and every pair must be complete before results can start. With rotating, partners change between rounds.
- **"Matchups"** (in "Game Format"): how each round's matches are built. Options include "Automatic"{gameFormat.generation.Automatic.title}, "Americano"{gameFormat.generation.Random.title} (random partners each round), "Mexicano"{gameFormat.generation.Rating.title} (partners matched by current standings), "Round Robin"{gameFormat.generation.RoundRobin.title} (4+ players), "King of Court"{gameFormat.generation.WinnersCourt.title}, "Ladder"{gameFormat.generation.Escalera.title} and "King of the Court"{gameFormat.generation.KingOfCourt.title} (8+ players). There is no knockout bracket for tournaments; brackets exist only in leagues.
- **"Gender"{createGame.genderTeams.label}**: "Any"{createGame.genderTeams.any}, "Men"{createGame.genderTeams.men}, "Women"{createGame.genderTeams.women} or "Mix"{createGame.genderTeams.mixPairs}. Mix needs an even number of players (at least 4); each team is one man and one woman.
- **"Tournament Player Level"**: players outside the range are not refused; they are put in the join queue for the organizer to decide.
- **"Rating game"**: on by default. When on, finished results change players' levels.
- **"Public game"**: on means anyone can find it in search; off means only invited people or people with the link.
- **"Anyone can invite other players"**: off by default ("Only organizers can invite players.").
- **"Enter without confirmation"**: off by default, so joiners wait in the queue until an organizer accepts them. On lets them take a free seat directly.
- **"Novices welcome"{createGame.suitableForNovices.title}**: a label for newcomers; it does not change who can join.
- **"Participants-only chat"{createGame.participantsOnlyChat.title}**: creates separate participants and organizers chats.
- **"Price"{createGame.price}**: for a per-person, per-team or total price the amount must be above 0 ("Price must be greater than 0 for this price type").
- **Results by anyone** is not offered for tournaments: only the owner, tournament admins and platform admins can enter scores.

## Common mistakes

- **No "Tournament" button in the create menu**: the user is still in novice mode (see Who can do this). It is not a permission problem.
- **Can't choose more than 12 players**: the *can create tournaments* permission is missing; ask a platform admin. With it the limit is 32.
- **Can't pick an odd number or fewer than 8**: tournaments use even numbers from 8. For 2 or 4 players create a game.
- **Format options missing in "Matchups"**: some formats need more players (Round Robin 4+, King of Court / Ladder / King of the Court 8+) or are not available for the sport.
- **"Choose a club to continue"** on the button: pick a club first.
- **"Another game is planned here"**: another game uses that court at that time; you can still go ahead with "Continue anyway".
- **No "Start Results Entry" button / "Not enough players"{games.results.problems.insufficientPlayers}**: not all seats are filled with confirmed players, or ("Fixed pairs are not fully set up") a pair is incomplete. Accept people from the queue or invite more.
- **Can't change settings, time or players anymore**: once results entry has started, settings and the roster are locked ("Cannot change game settings after results entry has started"). Use "Restart" on the results board to go back (this clears all results).
- **Players can't enter scores**: by design; only organizers score tournaments. Promote a trusted player with "Promote to Admin" if needed.
- **The tournament shows as archived**: tournaments are archived 7 days after their start time, or 2 days after results were finished. Archived tournaments cannot be edited.

## What the assistant can do

- `create_game` with type TOURNAMENT creates a tournament from a casual format template (e.g. Americano, Mexicano, King of the Court) at a club, after the user confirms a card. It uses default settings: rotating partners, gender Any, price not set, only organizers invite. Custom formats, fixed pairs, gender, price, novices and chat options must be set in the app.
- `create_game_with_booking` creates it and books the court in one step at clubs with online booking.
- `update_game` (time, club, court, name, description, max players, public, direct join), `set_game_price`, `invite_players`, `accept_from_queue`, `decline_from_queue`, `remove_participant`, `set_game_admin` manage it before results start.
- `get_game_results`, `enter_match_score`, `finish_results` for scoring, but the assistant cannot start results entry for generated formats (Americano, Mexicano, Round Robin and so on): the organizer must tap "Start Results Entry" in the app first.
- App only: the "Game Format" wizard, fixed pairs, adding rounds, lineups, live scoring, "Restart", editing final results, and granting the permission for bigger tournaments (platform admins can use `admin_update_user_flags`).
