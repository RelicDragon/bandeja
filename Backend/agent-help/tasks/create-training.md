---
id: create-training
audience: [player, organizer, trainer, admin]
requires: []
related: [roles, create-game, invite-players, split-costs, book-court, ui-map]
verified_against: [docs/domains/training.md, docs/domains/create.md, Frontend/src/components/CreateMenuModal.tsx, Frontend/src/pages/CreateGame.tsx, Frontend/src/components/createGame/CreateGameHeader.tsx, Frontend/src/components/createGame/ParticipantsSection.tsx, Frontend/src/components/createGame/GameSettingsSection.tsx, Frontend/src/utils/userMaxParticipantsInGame.ts, Frontend/src/components/GameDetails/GameInfo.tsx, Frontend/src/components/PlayerListModal.tsx, Frontend/src/components/ManageUsersModal.tsx, Frontend/src/components/home/EntityFilterChips.tsx, Frontend/src/components/GameDetails/TrainingResultsSection.tsx, Frontend/src/pages/GameDetailsShell.tsx, Backend/src/services/game/create.service.ts, Backend/src/services/game/admin.service.ts, Backend/src/services/game/participant.service.ts, Backend/src/services/invite.service.ts, Backend/src/services/training.service.ts, Backend/src/utils/validators/validateGameForSport.ts, Backend/src/services/agent/tools/createGame.tools.ts, Backend/src/services/agent/tools/roster.tools.ts, Backend/src/services/agent/tools/admin.tools.ts]
---
# Create a training, and book one as a player

## Goal

A trainer creates a training session at a club (time, courts, group size, price), and players find it and join. The trainer runs the session, then finishes it and can confirm players' levels.

## Who can do this

- **Create a training:** trainers and platform admins. Only they see "Training"{games.entityTypes.TRAINING} in the create menu.
- **Become a trainer:** the trainer role is granted by a platform admin; there is no self-service request in the app. A player who coaches should contact the platform's support or admins and ask for the trainer role. See `roles`.
- **Set or change a training's trainer:** the training's owner (the person who created it).
- **Join a training:** any signed-in player, like any game.
- **Finish a training:** the training's trainer or its organizers (owner or game admins).
- **Edit players' levels after a training:** only a trainer who runs that training (as its trainer, owner or admin), or a platform admin. A non-trainer owner cannot.

## Steps in the UI

### Create a training (trainers)
<!-- audience: trainer, admin -->

1. On the home screen tap the + button ("Create"{games.create}), then "Training"{games.entityTypes.TRAINING}. The page "Create Training Session"{createGame.createTraining} opens.
2. Choose the sport if asked. There is no format or rating to pick for a training.
3. **Location & time:** pick the club, date, courts and time, and answer "At the club?" with "Reserve now"{createGame.courtPlan.atClub.reserveNow}, "Already reserved" or "Not yet", exactly as for a game (see `create-game` and `book-court`).
4. If the "Repeat" row appears, choose "Weekly" or "Every 2 weeks" (optionally "Until"{series.until} a date) to create a recurring training. The trainer carries over to each new session.
5. **Players:** pick the group size under "Number of Participants" (1 to 24).
6. Decide "I want to play"{createGame.iWantToPlay}. It is on by default. Turn it **off** to coach without playing: you become the trainer, you do not use a seat and you owe no share of the price. If you leave it on, you are still the trainer but you also take one of the seats.
7. Optionally use "Invite Players" to invite your group; invites are sent after creation.
8. **Settings & details:** set "Public training", "Anyone can invite other participants", "Join without confirmation" and "Stay at the bar after the training". Optionally set "Name of training", a description and the "Price"{createGame.price}.
9. Tap "Create Training Session"{createGame.createButtonTraining} (or the reserve-and-create button when courts are reserved now).

### Set or invite the trainer afterwards (owner)
<!-- audience: trainer, admin -->

- On the training page, an empty trainer slot shows "No trainer". The owner or a game admin can tap "Invite trainer" and pick from trainers only. While the invite is pending it shows "Invited"{games.trainerInvitePending}, with "Cancel"{games.cancelTrainerInvite}. When the trainer accepts, they become the trainer without taking a seat.
- In the player picker, "Invite as trainer" sends the same kind of trainer invite.
- In "Players"{games.players} then "Manage Players", the owner can tap a participant and choose "Set as trainer" (when there is no trainer yet) or, on the trainer, "Remove as trainer".

### Find and join a training (players)

1. Open the "Find"{bottomTab.find} tab and turn on the "Training"{games.training} filter. "Our trainers" appears: "Tap a trainer to filter trainings by them".
2. Open a training and tap "Join the game", or "Join the queue" when approval is required or the group is full.
3. If you are on the waiting list, the organizer accepts you (see `invite-players`). If the trainer invited you, accepting the invite gives you a free seat directly.

### After the session

- The trainer or an organizer taps "Finish Training"{training.finishTraining}. Players can then "Rate this training" and "Submit review".
- A trainer who runs the session can open each player's "Edit Level" to set and confirm their level. "Undo Training" reverts those changes.

## Settings that matter

- **Trainer and seats:** the trainer is not a player. A trainer set with "Set as trainer" or by accepting a trainer invite is non-playing: they do not use a seat and do not owe a share of the price. Only playing participants fill seats and share the cost.
- **"I want to play"{createGame.iWantToPlay} at creation:** off = you coach without a seat; on = you also hold a seat (and a share of the price).
- **Group size:** 1 to 24 players.
- **"Join without confirmation":** off (default), players who join wait on the waiting list for the organizer. On, they get a free seat directly.
- **"Public training":** off makes it unlisted (not in Find), but anyone with the link can still open and join it.
- **"Anyone can invite other participants":** lets playing participants invite their friends.
- **Price:** split among the playing participants only (see `split-costs`).
- **Results:** a training has no match scores and no rating calculation; levels change only through the trainer's "Edit Level".
- **Changing the trainer:** setting a new trainer turns the previous one into an ordinary non-playing participant.

## Common mistakes

- **"Training"{games.entityTypes.TRAINING} is missing from the create menu:** you are not a trainer. Ask a platform admin for the trainer role (see `roles`).
- **Error *Only trainers can coach a training without playing*:** a non-trainer tried to create a training with "I want to play"{createGame.iWantToPlay} off.
- **"Invite trainer" is missing:** there is already a trainer or a pending trainer invite, or you are not the owner or an admin of this training.
- **Error *Only trainers can be invited as trainer*:** the person you picked does not have the trainer role.
- **Error *Only the owner can set the trainer*:** game admins can invite a trainer but cannot use "Set as trainer".
- **The trainer takes a seat:** the trainer created the training with "I want to play"{createGame.iWantToPlay} on. The trainer can tap "Don't play" on the training page to give up the seat and stay the organizer and trainer.
- **"Change the trainer instead of substituting them":** the trainer cannot be substituted; set another trainer.
- **Can't edit levels after the training:** only a trainer running this training or a platform admin can, and only after "Finish Training"{training.finishTraining}.
- **I was put on the waiting list:** approval is required or the group is full.

## What the assistant can do

- `create_game` with type training: creates a training at a club and time for trainers and platform admins (the user confirms a card first). Set its creator-plays option to false to coach without a seat. The price starts unset; use `set_game_price` afterwards.
- `create_game_with_booking`: books a free court slot from `find_available_slots` and creates the training on it.
- `set_trainer`: the owner sets a player already on the roster as trainer, or removes the trainer. It cannot make the owner the trainer (that happens at creation by turning "I want to play"{createGame.iWantToPlay} off).
- `update_game`, `invite_players`, `accept_from_queue`, `decline_from_queue`, `remove_participant`, `join_game`, `leave_game`, `cancel_game` work for trainings as for games.
- `search_games` (it can filter on trainings) and `get_game` (shows the trainer) help players find a training.
- Only the app can: send a trainer invite, set up "Repeat", finish a training, edit levels, undo a training, write a review.
- Granting the trainer role: platform admins only, in the admin panel or with `admin_update_user_flags`.
