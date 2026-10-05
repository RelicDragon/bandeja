---
id: invite-players
audience: [player, organizer, admin]
requires: []
related: [create-game, create-training, roles, enter-results, ui-map]
verified_against: [docs/domains/games.md, docs/product/constraints.md, Backend/src/services/game/canInviteToGame.ts, Backend/src/services/game/participant.service.ts, Backend/src/services/game/admin.service.ts, Backend/src/services/invite.service.ts, Backend/src/services/invite/sendInviteAsUser.service.ts, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/components/GameDetails/ParticipantsActionBar.tsx, Frontend/src/components/GameDetails/roster/RosterJoinPanel.tsx, Frontend/src/components/GameDetails/roster/RosterWaitingList.tsx, Frontend/src/components/ManageUsersModal.tsx, Frontend/src/components/home/InvitesSection.tsx, Frontend/src/components/GameDetails/GameSettings.tsx, Backend/src/services/agent/tools/roster.tools.ts, Backend/src/services/agent/tools/rosterWrites.tools.ts, Backend/src/services/agent/tools/gameWrites.tools.ts]
---
# Invite players and manage who plays

## Goal

Fill a game: invite players, answer an invite you received, handle the waiting list (accept or decline people who asked to join), remove someone, and share organizer rights with game admins.

## Who can do this

- **Owner** (the person who created the game, or who received ownership): everything below, including making and removing game admins and transferring ownership.
- **Game admin** (promoted by the owner): invite, accept or decline from the waiting list, remove ordinary players, edit the game. An admin cannot remove the owner, cannot promote or demote admins, and cannot transfer ownership.
- **Any playing participant:** can invite others only when the owner turned on "Anyone can invite other players". Queue and roster management stay with the owner and admins.
- **Anyone signed in:** can join a game or its waiting list, and answer their own invites.
- To get organizer rights on someone else's game, ask the owner to tap "Promote to Admin" for you. To invite without being an admin, ask the owner to turn on "Anyone can invite other players". To own a game, create one (see `create-game`) or ask the owner to transfer ownership. Details in `roles`.
- League match rosters are filled by the league, not by invites or joining.

## Steps in the UI

### Invite players

1. Open the game. In the "Participants"{games.participants} section tap "Invite"{games.invite} (or "Invite Player" on an empty seat).
2. Pick people from the "Search"{playerInvite.tabSearch} tab, or from "Looking"{playerInvite.tabLooking} (players who said they want to play around that time).
3. Confirm. Invited players appear with "Invited"{games.statusInvited} until they answer. An invite does not hold a seat.
4. While creating a game you can also use "Invite Players"; those invites are sent once the game is created.

### Answer an invite (invitee)

1. Your invites show in the "Invites"{invites.title} section of the "My"{bottomTab.my} tab and on the game page.
2. Tap "Accept"{invites.accept} to take a seat, or "Decline"{invites.decline}. Declining asks "Decline invite?" with an optional "Reason (optional)" for the organizer.
3. If the game filled up before you accepted, you are put on the waiting list instead. An invite skips the level range.

### Join a game yourself

1. Open the game and tap "Join the game" (direct join is allowed and a seat is free) or "Join the queue".
2. While you wait you see "You are in the waiting list. Waiting for approval..."{games.inQueue}. "Cancel request" takes you out of the queue.

### Handle the waiting list (owner or admin)

1. On the game page, the "Waiting List"{games.joinQueue} shows each person with "Wants to join".
2. Tap the check mark to accept (they get a seat) or the cross to decline (their request is removed).
3. Accepting by hand skips the level range but still needs a free seat and the right gender.
4. In the game's settings, "Auto-fill from queue" seats the first person in line automatically when a seat opens (level and gender rules still apply).

### Remove a player, make admins (Manage Players)

1. On the game page tap "Players"{games.players}. "Manage Players" opens; tap a player.
2. Owner options: "Promote to Admin", "Revoke Admin", "Kick User", "Transfer Ownership". On a training also "Set as trainer" or "Remove as trainer" (see `create-training`).
3. A game admin only sees "Kick User", and only on ordinary players.
4. Kicking a playing player frees their seat; kicking an invited person cancels the invite.

### Leave a game

- A player taps "Leave"{common.leave}. The owner, if playing, taps "Don't play": they stay organizer but give up their seat. The owner cannot leave the game entirely; cancel the game instead.

## Settings that matter

- **Seats:** only playing participants use a seat. Invited, queued and non-playing people (such as a trainer or an organizer who does not play) do not.
- **"Enter without confirmation"** (on trainings "Join without confirmation"): off, every joiner goes to the waiting list and an organizer must accept. On, joiners get a free seat directly.
- **Level range:** a player outside it who joins is queued, with the message "Your level is outside the range set by the owner. You have been added to the queue." Invites and manual accepts skip it.
- **Full game:** new joiners and late invite accepters go to the waiting list. The queue order is first come, first served.
- **"Anyone can invite other players":** lets playing participants invite.
- **"Public game"** off: the game is unlisted, not closed. Anyone with the link can open it and join or queue.
- **Gender** (Men, Women, Mix): players who don't fit cannot join, even from the queue.
- **"Auto-fill from queue":** automatic seating when someone leaves or is removed.
- **Results lock:** once results entry has started, nobody can join, leave a seat, be invited, kicked, accepted or promoted. The only roster change left is the organizer substituting a player.

## Common mistakes

- **No "Invite"{games.invite} button:** you are not owner or admin and "Anyone can invite other players" is off; or you are only invited or queued yourself (you must be playing or a non-playing organizer); or the game is full; or results entry has started.
- **"Only participants can send invites":** the same causes, reported by the server.
- **"Invite already sent to this user":** that person already has a pending invite.
- **I'm in the queue instead of playing:** approval is required, the game is full, or your level is outside the range.
- **"You're in the queue. The organizer seats players for this game.":** you tried to take a seat yourself while approval is required. Wait for the organizer.
- **No accept or decline buttons on the waiting list:** only the owner and game admins can answer queue requests, even when anyone can invite.
- **No "Players"{games.players} button:** you are not owner or admin, or results entry has started.
- **Can't promote someone:** only the owner can make or remove admins.
- **Admin can't kick the owner:** by design.
- **"Cannot change participants after results entry has started"** / **"Results entry has started — ask the organiser to substitute you out":** the roster is locked during scoring.
- **"League matches are filled by the league. Ask to join the season instead":** league games have no join or queue.
- **"Cannot join an archived game":** the game is too old.

## What the assistant can do

- `invite_players`: invite up to 10 players (found with `search_players`) to a game the user may invite to. Inviting someone who is in the queue seats them (organizers only).
- `join_game` / `leave_game`: join or leave for the user (the card says whether they get a seat or join the queue). The assistant can only join games it can find; for an unlisted game, open the link in the app.
- `accept_from_queue`, `decline_from_queue`: owner or game admin.
- `remove_participant` (always asks for confirmation): remove a player, queued player or invite; not the user themselves.
- `set_game_admin` (always asks for confirmation): owner only.
- `set_trainer`: trainings only, owner only.
- `get_game` shows the game and its roster.
- Only the app can: answer the user's own invite, cancel an invite (except via `remove_participant`), transfer ownership, substitute a player during scoring, change "Auto-fill from queue" or "Anyone can invite other players", send a trainer invite. League rosters are never changed by the assistant.
