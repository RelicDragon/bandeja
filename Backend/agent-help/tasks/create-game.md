---
id: create-game
audience: [player, organizer, admin]
requires: []
related: [invite-players, book-court, split-costs, create-tournament, create-training, roles, ui-map]
verified_against: [docs/domains/create.md, docs/domains/games.md, docs/domains/novice.md, Frontend/src/components/CreateMenuModal.tsx, Frontend/src/utils/noviceShell.ts, Frontend/src/pages/CreateGame.tsx, Frontend/src/components/createGame/ParticipantsSection.tsx, Frontend/src/components/createGame/GameSettingsSection.tsx, Frontend/src/components/createGame/GameNameCommentsSection.tsx, Frontend/src/components/createGame/PriceSection.tsx, Frontend/src/components/createGame/CreateGameIntentPicker.tsx, Frontend/src/components/createGame/courtPlan/courtPlanModel.ts, Frontend/src/features/game-series/SeriesRepeatRow.tsx, Frontend/src/utils/userMaxParticipantsInGame.ts, Backend/src/services/game/create.service.ts, Backend/src/utils/game/userMaxParticipantsCap.ts, Backend/src/utils/validators/validateGameForSport.ts, Backend/src/services/agent/tools/createGame.tools.ts, Backend/src/services/agent/tools/createGameWithBooking.tools.ts, Backend/src/services/agent/tools/gameWrites.tools.ts, Backend/src/services/agent/tools/money.tools.ts]
---
# Create a casual game (or a bar meetup)

## Goal

Create a casual game at a club: pick the sport and format, the club, date, time and courts, how many players, the level range, who can see and join it, and the price. The same create page also makes a bar meetup (entity "Bar"{games.entityTypes.BAR}), a training (see `create-training`) and a tournament (see `create-tournament`).

## Who can do this

- **Game and bar meetup:** any signed-in user. The creator becomes the game's owner (organizer).
- **New accounts in beginner (novice) mode:** the create menu shows only what the user's rank has unlocked. Creating a game unlocks after 2 counted games; tournaments and leagues later (full app at rank Regular, 5 games). The user can also unlock everything early (see `roles`). A direct link to the create page still works.
- **Training:** only trainers (and platform admins) see "Training"{games.entityTypes.TRAINING} in the create menu. See `create-training` and `roles`.
- **League:** needs the league-creator permission from a platform admin. See `roles`.
- **Event/Ad** (external camp, tournament or league poster) is a separate, shorter form, not this page. It is reviewed by a platform admin before it appears in Find.
- After creation, the owner can promote other players to game admin (see `invite-players`). Owner and admins can edit the game.

## Steps in the UI

1. On the home screen tap the + button at the top ("Create"{games.create}), then pick "Game"{games.entityTypes.GAME} (or "Bar"{games.entityTypes.BAR} for a bar meetup).
2. The page "Create Game" opens. It has four numbered parts: "Game setup", "Location & time"{createGame.steps.location}, "Players"{createGame.steps.players} and "Settings & details".
3. **Game setup.** If several sports are enabled, use "Choose sport". Then pick the format under "What kind of game?":
   - "Social"{createGame.intent.social.title}: rotation formats, no rating pressure.
   - "Match"{createGame.intent.match.title}: standard rules, counts toward your level.
   - "Advanced"{createGame.intent.advanced.title}: the full format wizard. "Customize format" lets you change the chosen preset.
   - "Singles"{sport.matchSingles} or "Doubles"{sport.matchDoubles} decides the roster: a game is always 2 or 4 players.
4. **Location & time.** Tap "Select Club" and pick a club, then the date. Set how many courts you need under "Courts"{createGame.courtPlan.courts} (each court can stay "Any court"{createGame.courtPlan.anyCourt} or be a specific one). Under "Court booking"{createGame.courtPlan.atClub.title} choose:
   - "Book now"{createGame.courtPlan.atClub.reserveNow}: the app books the courts at the club when you create the game (only at clubs connected to the app; you may need to sign in to the club's booking account).
   - "Already booked"{createGame.courtPlan.atClub.alreadyReserved}: link bookings you already have; courts without one show as "Booked by organizer"{courtReservation.slot.reported}.
   - "Not booked"{createGame.courtPlan.atClub.notYet}: plan the game without a court booking. You can book later (see `book-court`).
   Then pick the start time and duration. Times taken at the club cannot be picked.
5. If the "Repeat" row appears after you pick a time, you can make it a recurring series: "Once", "Weekly" or "Every 2 weeks", optionally "Until"{series.until} a date.
6. **Players.** Set the "Player Level"{createGame.playerLevel} range. You are in the game as a player by default; remove yourself from your seat to organize without playing, and tap "Join the game" to take a seat again. Use "Invite Players" to pick people; they get the invite after the game is created.
7. **Settings & details.** Set the toggles under "Settings"{createGame.settings} (see below). Optionally add a name and photo ("Name & photo"), a description, and the price under "Price"{createGame.price}.
8. Tap the create button at the bottom. It reads "Create Game" (or "Create Bar Event"), or says it will book courts and create when "Book now"{createGame.courtPlan.atClub.reserveNow} is chosen.
9. If you already play another game at that time you get "Already playing"; confirm with "Continue"{games.overlapConfirmProceed} or change the time. If another player's planned (not reserved) game uses that court you get "Another game is planned here" and can tap "Continue anyway".

### Bar meetup differences

- Only bar venues can be picked, and you pick a "Hall"{createGame.hall} instead of a court.
- No format, rating, gender, or "Results by anyone". Results are automatic.

## Settings that matter

- **Players (2 or 4):** a game must have exactly 2 or 4 players; 3 is never allowed. Larger rotation formats (Americano for 8 or more) must be created as a tournament.
- **Only playing seats count.** Invited, queued and non-playing people (such as an organizer who does not play) do not use a seat.
- **"Player Level"{createGame.playerLevel}:** players whose level is outside the range are not refused. When they join they go to the waiting list and the organizer decides. Invited players and players accepted by the organizer skip the level check. Automatic seating from the queue does check it.
- **"Public game":** on, the game is listed in Find and search. Off, it is unlisted: it does not appear in search, but anyone you invite or send the link to can open it and join (or join the queue).
- **"Enter without confirmation":** off (the default), every player who joins lands in the "Waiting List"{games.joinQueue} and an organizer must accept them. On, players get a seat directly while seats are free; when full, they queue.
- **"Anyone can invite other players":** off, only the owner and admins can invite. On, any playing participant can invite too.
- **"Results by anyone":** on, any playing participant can enter scores and change the format. Off, only organizers. Not available for tournaments.
- **"Rating game":** whether results change players' levels. For most sports the format preset decides this (social presets are unrated, match presets are rated).
- **"Novices welcome"{createGame.suitableForNovices.title}:** a label that welcomes newer players. It does not change the level rule.
- **"Gender"{createGame.genderTeams.label}:** "Any"{createGame.genderTeams.any}, "Men"{createGame.genderTeams.men}, "Women"{createGame.genderTeams.women} or "Mix" (one man and one woman per team; needs an even number of players, at least 4). Players of the wrong gender cannot join.
- **"Stay at the bar after the game"** and **"Participants-only chat"{createGame.participantsOnlyChat.title}**: informational and chat options; no effect on joining.
- **"Price Type":** "Not Known", "Free"{createGame.priceTypeFree}, "Per Person", "Per Team" or "Total"{createGame.priceTypeTotal}. Per Person, Per Team and Total need an amount above 0. The price drives the cost split (see `split-costs`).
- **Club and court:** the club must accept games for this sport. Courts must belong to the chosen club.

## Common mistakes

- **No + button or no "Game"{games.entityTypes.GAME} entry:** the account is new and still in beginner mode; game creation unlocks after 2 counted games.
- **"Training"{games.entityTypes.TRAINING} missing from the menu:** the user is not a trainer. See `create-training` and `roles`.
- **Can't choose 8 players:** a game is 2 or 4 players. Use a tournament for bigger groups.
- **"Price must be greater than 0 for this price type":** Per Person, Per Team or Total was chosen without an amount. Enter one or choose "Free"{createGame.priceTypeFree} or "Not Known".
- **Error *This club is not available for playing games*:** the club is inactive or not set up for games. Pick another club.
- **A start time can't be tapped:** a court you need is booked, held or reserved at that time, or not enough courts are free. Pick another time or court.
- **Players I wanted end up in the queue:** "Enter without confirmation" is off, the game is full, or their level is outside the range. Accept them from the "Waiting List"{games.joinQueue} (see `invite-players`).
- **The game doesn't appear in Find:** "Public game" is off, or the game is outside the viewer's city or filters.
- **Settings can't be changed any more:** once results entry has started, the roster, settings and format are locked.

## What the assistant can do

- `create_game`: creates a casual game or tournament from a format preset, or a training (trainers only), at a club and time, without booking a court. The user confirms a card first. Defaults: 4 players (2 for singles presets), public, "Enter without confirmation" off, the creator plays, price not set, level range from the preset and the user's level.
- `create_game_with_booking`: books a free slot found with `find_available_slots` and creates the game on it in one step.
- `search_clubs`, `get_club`, `find_available_slots`, `get_weather` help pick the place and time.
- After creation: `update_game` (time, club, court, name, description, max players, public/private, direct join; not when the game has linked court bookings or several courts), `set_game_price`, `invite_players`, `cancel_game`.
- Only the app can: create a bar meetup, an Event/Ad or a league; set gender, level-rating override, "Anyone can invite other players", "Results by anyone", "Novices welcome"{createGame.suitableForNovices.title}, "Participants-only chat"{createGame.participantsOnlyChat.title} or the bar option; set up "Repeat"; pick several courts; set the price during creation (the assistant sets it afterwards with `set_game_price`).
