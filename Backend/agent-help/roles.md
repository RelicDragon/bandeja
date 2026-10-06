---
id: roles
audience: [player, organizer, season_admin, trainer, tournament_creator, league_creator, admin]
requires: []
related: [ui-map, create-game, create-tournament, create-league-season, create-training, invite-players, enter-results]
verified_against: [Backend/src/middleware/auth.ts, Backend/src/routes/game.routes.ts, Backend/src/utils/parentGamePermissions.ts, Backend/src/services/game/create.service.ts, Backend/src/services/game/admin.service.ts, Backend/src/services/game/participant.service.ts, Backend/src/services/training.service.ts, Backend/src/services/league/create.service.ts, Backend/src/utils/game/userMaxParticipantsCap.ts, Backend/src/services/agent/tools/admin.tools.ts, Backend/src/services/agent/tools/createGame.tools.ts, Admin/modals.js, Frontend/src/components/CreateMenuModal.tsx, Frontend/src/components/ManageUsersModal.tsx, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/utils/userMaxParticipantsInGame.ts, Frontend/src/utils/noviceShell.ts, Frontend/shared/novice/index.ts, Frontend/src/layouts/Header.tsx]
---
# Roles and permissions

There are two kinds of roles. **Per-game roles** (game owner, game admin, trainer of a game, season owner and season admins) come from what you do in the app: anyone gets them by creating a game or by being promoted. **Account flags** (trainer, tournament creator, league creator, platform admin) are switches on the user account that only a platform admin can turn on.

## Player (any signed-in user)

Every signed-in user can:
- Find and join games, tournaments, trainings and league seasons, or join a waiting list when a game needs the organizer's approval.
- Accept or decline invites, leave a game, chat in games they are in.
- Create a casual game, a tournament (up to 12 players), a bar meetup or an event (events wait for platform admin approval before they are public).
- Invite other players to a game they are in, if the game has "Anyone can invite other players" on.
- Enter results in a game they are playing in, if the game has "Results by anyone" on.

There is no way to request a role or flag inside the app: no form, button or request flow exists.

### New accounts see fewer buttons at first

New users start in a beginner mode with ranks (Newcomer, Debut, Rookie, Contender, Challenger, Regular). Tabs, menus and create entries appear one by one as they play counted games; everything is visible at Regular (5 counted games). This only hides buttons, never blocks a link. Notably the create menu shows "Game"{games.entityTypes.GAME} from rank 2, and "Tournament"{games.entityTypes.TOURNAMENT} and "League"{games.entityTypes.LEAGUE} only from Regular. The AI assistant segment appears at Regular too. To skip this, use "I know my way around — show me everything" on the welcome page or on the progress card on the My tab, then "Show everything".

## Game owner (organizer)

The user who creates a game, tournament, training or league is its **owner**. There is one owner per game. The owner can:
- Edit everything about the game ("Edit"{common.edit} on the game page).
- Invite players, accept or decline people on the "Waiting List".
- Open "Manage Players"{games.managePlayers} (the "Players"{games.players} button next to "Invite"{games.invite}) and: "Promote to Admin", "Revoke Admin", "Kick User", "Transfer Ownership", and on a training "Set as trainer" or "Remove as trainer".
- Enter and finish results, substitute a player during results entry.
- Delete the game, but only while no results have been entered.

The owner cannot simply leave their own game. They can switch to "Don't play"{gameDetails.dontPlayInGame} (stay organizer without taking a slot) or transfer ownership first.

How to become one: create a game, or have the current owner use "Transfer Ownership" on you.

## Game admin (organizer)

A game admin is a participant the owner promoted with "Promote to Admin". A game admin can do almost everything the owner can: edit the game and its settings, invite, accept or decline the waiting list, kick ordinary participants (not the owner or other admins), enter and finish results, substitute players. Only the owner can promote or revoke admins, set the trainer, transfer ownership and delete the game.

How to become one: ask the game owner to promote you.

Once results have been entered (or the game is archived), the roster is frozen: nobody can invite, kick, promote or change settings; only substitution during results entry stays possible.

## League season owner and season admins (season_admin)

A league season is a game of its own. Whoever creates the league is the season **owner**; the owner can promote season admins exactly like game admins. Season owner and season admins automatically have organizer rights on every fixture of that season: they can create rounds and fixtures, edit fixtures, reschedule them and enter results. Plain players cannot join a fixture directly; they join the season and are assigned to fixtures.

How to become one: create the league (needs the league creator flag), or ask the season owner to promote you.

## Trainer

"Trainer" means two different things:
- **Trainer flag on the account.** Shows the "Training"{games.entityTypes.TRAINING} entry in the create menu, the trainer badge, and the "Review"{profile.review} tab in Profile. Only users with this flag can be invited as a trainer, and only they can create a training with "I want to play"{createGame.iWantToPlay} switched off (coaching without playing).
- **The trainer of one training.** Each training has at most one trainer. That trainer does not take a player slot (status not playing) and has game admin rights on it. A training gets its trainer when a flagged trainer creates it, when the owner invites a flagged trainer as trainer and they accept, or when the owner uses "Set as trainer" on a participant.

A trainer of a training (with the account flag) can finish the training and set or confirm participants' levels afterwards. A plain user can still create a training through "Play with this group again" after a training, but then plays in it and is not its trainer.

How to get the trainer flag: ask a platform admin.

## Tournament creator

Anyone can create a tournament. The tournament creator flag only lifts the size limit: without it a tournament has at most 12 players; with it, the app offers up to 32 (and league seasons are also not capped by the account's personal limit).

How to get it: ask a platform admin.

## League creator

Only users with the league creator flag (or platform admins) can create a league: the "League"{games.entityTypes.LEAGUE} entry in the create menu shows only for them, and the server refuses others with 'You are not allowed to create leagues'.

How to get it: ask a platform admin.

## Platform admin

Platform admins run the app. They pass every create gate (league, training, size limits), can edit any game and its results, see "Show private games" in Find filters, approve or decline events, and manage club admins and user accounts. Only a platform admin can grant or remove account flags (trainer, tournament creator, league creator, admin, max players per game).

How to become one: only an existing platform admin can grant it.

### Granting flags
<!-- audience: admin -->

Flags are changed in the Admin panel (Users, edit user, checkboxes Admin, Trainer, Can Create Tournament, Can Create League) or through the assistant with `admin_find_users` then `admin_update_user_flags`, which shows a confirmation card before anything changes. Max players per game (2 to 999) can only be changed through the assistant tool. An admin cannot remove their own admin rights or deactivate themselves.

## Club admin

Club staff can be made admins of a club by a platform admin. They get a "My clubs" button above the tab bar to manage their club. This is separate from the roles above.

A club team has two roles. Admin can do everything for the club: settings, courts, opening hours and the team. Staff is the front desk: the schedule, bookings and taking payments, but not club settings, courts, hours, the team or reports. A platform admin adds the first club admin; after that, club Admins add or remove teammates themselves, and a club always keeps at least one Admin.

## What the assistant can do

The assistant acts with the user's own permissions: it can never do more than the user could in the app. It tells the user which roles they have (trainer, tournament creator, league creator, admin). Role-related tools: `set_game_admin` and `set_trainer` (owner only), `remove_participant`, `accept_from_queue`, `decline_from_queue` (owner or game admin). `create_game` creates casual games, tournaments and trainings (trainings only for flagged trainers and admins); it cannot create leagues. Transferring ownership is only in the app.
