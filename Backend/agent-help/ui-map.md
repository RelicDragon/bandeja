---
id: ui-map
audience: [player, organizer, season_admin, trainer, tournament_creator, league_creator, admin]
requires: []
related: [roles, create-game, create-tournament, create-league-season, create-training, invite-players, enter-results, split-costs, book-court]
verified_against: [Frontend/src/components/navigation/BottomTabBar.tsx, Frontend/src/components/headerContent/HomeHeaderContent.tsx, Frontend/src/components/CreateMenuModal.tsx, Frontend/src/components/headerContent/MyGamesTabController.tsx, Frontend/src/components/home/HomeActionGrid.tsx, Frontend/src/components/home/PlayHeroButton.tsx, Frontend/src/components/home/InvitesSection.tsx, Frontend/src/components/headerContent/FindHeaderActions.tsx, Frontend/src/components/home/EntityFilterChips.tsx, Frontend/src/components/home/FiltersPanel.tsx, Frontend/src/components/headerContent/ChatsTabController.tsx, Frontend/src/components/headerContent/LeaderboardTabController.tsx, Frontend/src/components/headerContent/MarketplaceTabController.tsx, Frontend/src/layouts/Header.tsx, Frontend/src/pages/Profile.tsx, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/components/GameDetails/GameInfo.tsx, Frontend/src/components/GameDetails/EditGameInfoModal.tsx, Frontend/src/components/GameDetails/roster/GameRoster.tsx, Frontend/src/components/GameDetails/ParticipantsActionBar.tsx, Frontend/src/components/GameDetails/roster/RosterWaitingList.tsx, Frontend/src/components/GameDetails/GameSettings.tsx, Frontend/src/components/GameDetails/courts/GameCourtsProvider.tsx, Frontend/src/components/ClubDetailPanel.tsx, Frontend/src/components/agent/AgentChatList.tsx, Frontend/src/components/clubAdmin/ClubAdminFab.tsx, Frontend/src/utils/noviceShell.ts]
---
# Where things are in the app

A map of tabs, screens and main buttons. New accounts see fewer tabs and buttons until they have played a few games (see `roles`); a missing tab or button is often just not unlocked yet.

## Bottom tabs

In order: "My"{bottomTab.my}, "Find"{bottomTab.find}, "Chats"{bottomTab.chats}, "Market"{bottomTab.marketplace}, "Top"{bottomTab.leaderboard}.

There is no Profile tab: Profile opens from the round avatar button at the top of the screen. Create opens from the *+* button at the top right.

## Create menu (the + button)

Entries: "Game"{games.entityTypes.GAME}, "Tournament"{games.entityTypes.TOURNAMENT}, "League"{games.entityTypes.LEAGUE} (league creators and admins only), "Training"{games.entityTypes.TRAINING} (trainers and admins only), "Bar"{games.entityTypes.BAR}, "Event/Ad" (needs admin approval), then "Story"{stories.story}, "Group"{chat.group}, "Channel"{chat.channel}, "Team"{teams.team}, "Listing"{marketplace.listing}, "Bug"{bug.bug}.

Game, tournament, training and bar open the create-game screen; league opens the create-league screen. Long-pressing "Game"{games.entityTypes.GAME} lets multi-sport users pick the sport. A user without a name is asked for one first.

## My tab

Header segments: "Calendar"{games.calendar}, "Past"{home.past}, "AI"{agent.tab}.

On "Calendar"{games.calendar}: invites ("Invites"{invites.title} with "Accept"{invites.accept} and "Decline"{invites.decline}), the big "I want to play"{home.playHero} button (tell the app when you are free and get matched), "Browse games"{home.browseGames}, your leagues, a "Bookings"{club.booktime.tabBookings} card when you have court bookings, the calendar of your games, and your teams.

## Find tab

Header: city button and "Filters"{games.filters}. Type chips: "Game"{games.entityTypes.GAME}, "Tournament"{games.entityTypes.TOURNAMENT}, "League"{games.entityTypes.LEAGUE}, "Training"{games.training}, "Other Events". List or calendar view, with day shortcuts. Filters include "Have available slots", "Suitable rating", "Novices welcome only" and "Reset filters"; admins also see "Show private games". Find also shows a trainers carousel.

## Chats tab

Segments: "Chats"{chats.chats}, "Market"{bottomTab.marketplace} (marketplace conversations), "Channels"{chats.channels}, "Bugs"{chats.bugs}. Every game also has its own chat: open the game and tap "Chat"{nav.chat} at the top.

## Market and Top

"Market"{bottomTab.marketplace} has segments "Market"{bottomTab.marketplace} and "My"{marketplace.myShort} (your listings). "Top"{bottomTab.leaderboard} has "Achievements"{trophies.cabinet.title}, "Level"{profile.level} and "Social"{profile.social} rankings.

## Profile and settings

Open with the avatar button. Segments: "Profile"{profile.title} (stats), "General"{profile.general} (settings), "Comparison"{profile.comparison}, "Community"{profile.community}, and "Review"{profile.review} for trainers.

"General"{profile.general} holds: "Personal Information", "Connected Accounts", "Play Preferences", "Appearance" (theme, "Language"{profile.language}, "Time Format", "Week Start", "Currency"), "Sharing to followers", "Notification Settings", "Current City" with "Change City", "Club bookings"{club.booktime.connectedClubsCardTitle} (button "Bookings"{club.booktime.connectedClubsCardCta}), "Signed-in devices", "Logout" and "Delete Account".

## Game page

Opening any game shows one scrolling page (league seasons have tabs instead, see below). Top to bottom, roughly:
- Organizer to-do hints, then the game info card with "Edit"{common.edit} (owner, game admins, platform admins), "Share Game", "Add to calendar" and "Navigate to club". It shows the date, time, club and, under the club, each court's booking (Booked · <club system>, "Booked by organizer"{courtReservation.slot.reported}, "Not booked yet"{courtReservation.slot.planned}); organizers tap a court for its booking actions and get one main button (for example Book Court 7).
- The players card: roster, open spots, attendance and the cost split. Under it "Invite"{games.invite} and "Players"{games.players} (opens "Manage Players"{games.managePlayers} for the owner and admins), and the "Waiting List"{games.joinQueue} with accept and decline buttons.
- Photos, results, format, training results, participants-only chat, settings ("Rating game", "Public game", "Anyone can invite other players", "Novices welcome"{createGame.suitableForNovices.title}, "Results by anyone", "Enter without confirmation", ...).
- Action buttons at the bottom: "Start Results Entry" (or "Finish Training"{training.finishTraining} on a training), "Leave"{common.leave} or "Don't play"{gameDetails.dontPlayInGame} for the owner, "Duplicate"{gameDetails.duplicate}, and "Delete"{common.delete} (owner, before results).

"Edit details"{gameDetails.editModal.title} has tabs "When and where"{gameDetails.whenWhere.title} (club, date, courts, time and the courts' bookings), "General"{gameDetails.editTab.general}, "Price"{gameDetails.editTab.price}, "Participants"{gameDetails.editTab.participants} and "Settings"{gameDetails.editTab.settings}; one "Save"{common.save} saves every tab you changed. Tapping the game's date, time or club opens it on "When and where".

A league season page has tabs "General"{gameDetails.general}, "Schedule"{gameDetails.schedule}, "Planner"{gameDetails.plannerTab} (season participants), "Standings"{gameDetails.standings} and "FAQ"{gameDetails.faq} when there are questions. A league fixture links back with "Open League Season".

## Court bookings

- Club page: "Court availability" shows free slots; for clubs with booking integration you may need "Connect account" first.
- Your bookings: the "Bookings"{club.booktime.tabBookings} card on My, or Profile, "General"{profile.general}, "Club bookings"{club.booktime.connectedClubsCardTitle}.
- A game's linked reservations are in the courts part of the game page.

## AI assistant

My tab, "AI"{agent.tab} segment. The list is titled "AI assistant"{agent.listTitle}; start with "New chat"{agent.newChat}. The settings button opens "Assistant settings" with "Permissions"{agent.settings.tabPermissions} and "Memory". Changes always show a confirmation card first.

## Club admins

Club staff see a "My clubs" button above the tab bar to manage their club.
