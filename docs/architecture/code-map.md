# Code map

Open this file to find code. Paths are repo-relative. Do not trust `CLAUDE.md` file counts.

Related: [overview.md](./overview.md), [backend.md](./backend.md), [frontend.md](./frontend.md), [database.md](./database.md), [shared-packages.md](./shared-packages.md).

---

## Backend

| Path | What |
|------|------|
| `Backend/src/app.ts` | Express app + middleware + `/api` mount |
| `Backend/src/server.ts` | HTTP + Socket.IO + schedulers + workers |
| `Backend/src/worker.ts` | Queue workers only |
| `Backend/src/routes/index.ts` | All `/api` mounts |
| `Backend/src/controllers/` | HTTP handlers (one domain per file; `user/`, `ranking/` subdirs) |
| `Backend/src/services/<domain>/` | Business logic |
| `Backend/src/middleware/` | `auth.ts`, `authToken.ts`, `errorHandler.ts`, `validate.ts`, `validateZod.ts`, `recordPresenceActivity.ts`, `e2eTestContext.ts`, `refreshOrigin.ts` |
| `Backend/prisma/schema.prisma` | Schema |
| `Backend/prisma/migrations/` | Named SQL migrations |
| `Backend/prisma.config.ts` | Prisma 7 `DB_URL` / shadow URL |
| `Backend/src/config/` | `env.ts`, `database.ts`, `corsOrigins.ts`, `jwtAuthConfig.ts`, `apiRateLimit.ts` |
| `Backend/src/sport/` | `sportRegistry.ts`, `sportIds.ts`, `playtomicSport.ts`, `rotationFormats.ts`, `questionnaires/` |
| `Backend/src/workers/startQueueWorkers.ts` | Translation, results artifacts, play-intent queues |
| `Backend/src/shared/` | Duplicates of `Frontend/shared` (parity tests) |
| `Backend/src/utils/` | `ApiError.ts`, `jwt.ts`, `healthInfo.ts`, `gameStatus.ts`, rate-limit keys |

### `services/` folders

| Dir | Domain |
|-----|--------|
| `auth/` | JWT issue, refresh sessions, OAuth login |
| `game/` | CRUD, available/my games, participants, occupancy, event approval, bookings link |
| `chat/` | messages, sync events, unread, group channels, translate, read cursors |
| `league/` | seasons, groups, brackets, standings, planner |
| `results/` | live scoring persistence, outcomes, generation, timers |
| `playIntent/` | looking-to-play match + queues |
| `invite/` | game invites |
| `user/` | profiles, sport projection |
| `ranking/` | leaderboards, inactivity |
| `booktime/` `padeloo/` `klikteren/` `nspadel/` | club booking providers |
| `booking/` | shared booking helpers |
| `ads/` `admin/` | ads + admin ops |
| `story/` `storyEngagement/` | stories |
| `push/` `telegram/` | notifications |
| `stickers/` `giphyIngest/` | chat stickers/GIF |
| `linkToApp/` | landing + attribution |
| `linkPreview/` | URL unfurl |
| `marketItem/` | marketplace |
| `bug/` | bug tracker chats |
| `clubAdmin/` | club operator |
| `me/` | My-tab aggregate |
| `achievements/` | trophies |
| `bets/` | social bets |
| `media` / `s3.service.ts` | uploads |
| `redis/` | Redis client |
| `replicate/` | AI webhooks |
| `weatherForecast.service.ts` | weather |
| `socket.service.ts` | Socket.IO |

Controllers sit next to routes of the same name (`game.controller.ts` ↔ `game.routes.ts`). Exceptions: `linkToApp.controller.ts` also used from `auth.routes` (`POST /auth/attribution`).

---

## Frontend

| Path | What |
|------|------|
| `Frontend/src/main.tsx` | Boot: SW, Dexie, theme, Capacitor |
| `Frontend/src/App.tsx` | Router, offline gate, overlays, auth bootstrap |
| `Frontend/src/pages/` | Route-level pages (MainPage hosts tabs) |
| `Frontend/src/pages/clubAdmin/` | `/my-clubs/*` club operator screens |
| `Frontend/src/pages/settings/` | Connected clubs bookings |
| `Frontend/src/components/` | UI (see folders below) |
| `Frontend/src/hooks/` | Feature hooks |
| `Frontend/src/api/` | Axios wrappers per resource |
| `Frontend/src/queries/` | TanStack Query |
| `Frontend/src/store/` | Zustand |
| `Frontend/src/services/chat/` | Dexie + sync + outbox (dozens of files; start `chatLocalDb.ts`, `chatOpenCoordinator.ts`) |
| `Frontend/src/services/` | socket, push, auth bridge, widgets, booking helpers |
| `Frontend/src/sport/` | FE sport registry + create-flow UI extras; templates from `@shared/createTemplates` |
| `Frontend/src/liveScoring/registry.ts` | Sport → live UI/rules glue |
| `Frontend/src/utils/liveScoring/` | Engine (core, serve guides) |
| `Frontend/src/i18n/` | `config.ts` + `locales/<lng>/` |
| `Frontend/src/integrations/booking/` | `ClubBookingProvider` + Booktime/Padeloo/Klikteren/Nspadel |
| `Frontend/src/clubAdmin/` | `ClubManagementApp` |
| `Frontend/src/layouts/` | `MainLayout` |
| `Frontend/capacitor.config.ts` | Native shell |
| `Frontend/e2e/` | Playwright: `specs/`, `pages/`, `fixtures/`, `test-user.ts` |
| `Frontend/public/sw.js` | PWA |
| `Frontend/public/link-to-app/` | Static landing |

### `pages/` (non-test)

`MainPage`, `MyTab`, `FindTab`, `ChatsTab`, `LeaderboardTab`, `ProfileTab`, `Login`, `Register`, `TelegramAutoLogin`, `SelectCity`, `SessionsPage`, `CreateGame` + `CreateGameWrapper`, `CreateLeague`, `CreateEvent` + `CreateEventWrapper`, `GameDetails` / `GameDetailsPage` / `GameDetailsShell`, `GameChat` / `GameChatRoute`, `GameLiveRoute` / `GameLiveMatchPage` / TV+broadcast redirects, `LeagueDetails`, `LeagueBracketFullscreenPage`, `LeagueFixtureTableFullscreenPage`, `EventDetails`, `MarketplaceList`, `CreateMarketItem`, `Bugs`, `GameSubscriptions`, `UserProfilePage`, `UserTeamPage`, `GroupChannelSettingsPage`, `NextGameRedirect`, `Profile`.

### `components/` folders

`chat/`, `GameDetails/`, `createGame/`, `createLeague/`, `createEvent/`, `home/`, `liveScoring/`, `playIntent/`, `playerInvite/`, `playerProfile/`, `marketplace/`, `stories/`, `bugs/`, `booktime/`, `clubAdmin/`, `clubPicker/`, `sponsorSlots/`, `navigation/`, `leaderboard/`, `trophies/`, `sport/`, `sportQuestionnaire/`, `gameFormat/`, `gameLocationTime/`, `gameResults/`, `gameSettings/`, `availability/`, `browseCity/`, `userTeam/`, `weather/`, `auth/`, `ui/`.

### `store/`

`authStore`, `themeStore`, `shellNavStore`, `unreadStore`, `playersStore`, `socketEventsStore`, `presenceStore`, `presenceWantedStore`, `storiesStore`, `favoritesStore`, `deepLinkStore`, `browseCityStore`, `sportContextStore`, `chatSyncStore`, `chatOfflineStore`, `headerStore`, `userTeamsStore`, `appModeStore`, gate stores (`profileNameGate`, `genderJoinGate`, `gameSlotOverlapConfirm`).

### e2e

`Frontend/e2e/specs/{smoke,auth,home,find,chats,games,profile,marketplace,leaderboard,shell,onboarding,club-admin,user-teams,game-subscriptions,two-user,cross-cutting}/`

---

## Admin

No build. Open **only** via `./Admin/serve.sh` → `http://127.0.0.1:9010/`.

| File | What |
|------|------|
| `Admin/index.html` | Shell + login; loads JS sequentially |
| `Admin/app.js` | Router, pages, API client |
| `Admin/styles.css` | CSS |
| `Admin/serve.sh` | Static server + `/api` proxy (`ADMIN_PORT=9010`). Default proxy tunnel `:9000`. `--dev` → local `:3000`. |
| `Admin/serve.mjs` | Node server |
| `Admin/run-ssh.sh` | Tunnels: DB `localhost:15432`, API `localhost:9000` |
| `Admin/modals.js` | Shared modals |
| `Admin/data-table.js` | Tables |
| `Admin/sportLabels.js` | Sport labels |
| `Admin/market-categories.js` | Market categories |
| `Admin/mass-notifications.js` | Mass push |
| `Admin/platform-settings.js` | Platform settings |
| `Admin/ads.js` + `ads-*.js` | Ads campaigns/sponsors/presets/analytics/API |
| `Admin/link-to-app.js` | Link-to-app events / attribution |
| `Admin/merge-users.js` | User merge |

---

## Packages + `Frontend/shared`

See [shared-packages.md](./shared-packages.md).

| Path | Package / alias |
|------|-----------------|
| `packages/chat-contract` | `@bandeja/chat-contract` |
| `packages/unread-contract` | `@bandeja/unread-contract` |
| `Frontend/shared` | `@bandeja/shared` (BE npm), `@shared/*` (FE Vite) |

`Frontend/shared` modules: `createTemplates.ts`, `sport.ts`, `booking/`, `gameBooking/`, `booktime/`, `clubIntegration.ts`, `gameFormat/`, `nextGame/policy.ts`, `achievements/`, `entityCapabilities.ts`, `eventApproval.ts`, `officiatingLevel.ts`, `officiatingEnforcement.ts`, `rotationFormats.ts`, `strictValidation.ts`, `timedCustomPresets.ts`, `playIntentRealtime.ts`, `playIntentCreateSource.ts`, `systemMessages/`, `gamePhotos/`, `gameSlotOverlap.ts`, `nameSearch.ts`, `matchFormat.ts`, `isPresetLegal.ts`.

---

## Watch + iOS native (`Frontend/ios/App`)

Present. Apple Watch live scoring + next-game widgets.

| Path | What |
|------|------|
| `Frontend/ios/App/BandejaWatch Watch App/` | WatchOS app: `BandejaWatchApp.swift`, `ContentView.swift`, `Views/`, `ViewModels/`, `Models/` (incl. `WatchLiveScoringEngine.swift`), `Services/APIClient.swift` |
| `Frontend/ios/App/BandejaWatchWidgets/` | Watch widgets (NextGame, LiveActive) |
| `Frontend/ios/App/BandejaWatchShared/` | Shared Watch models |
| `Frontend/ios/App/BandejaHomeWidgets/` | iPhone home next-game widget |
| `Frontend/ios/App/BandejaNextGames/` | Swift package: next-game pick + App Group storage (parity with JS `pickNextGame`) |
| `Frontend/ios/App/NotificationServiceExtension/` | Rich push |
| `Frontend/ios/App/App/` | Capacitor iOS host, intents (`OpenNextGameIntent`, `FindGamesIntent`, `BandejaAssistantIntents`) |

JS policy: `Frontend/shared/nextGame/policy.ts`. JS picker: `Frontend/src/utils/pickNextGame.ts`. Golden: `Frontend/shared/nextGame/pickNextGameGolden.json`.

---

## Domain → BE service + FE pages/hooks

| Domain | Backend | Frontend |
|--------|---------|----------|
| Auth / sessions | `services/auth/`, `controllers/auth*.ts`, `telegramAuth`, `middleware/auth.ts` | `pages/Login.tsx`, `Register.tsx`, `SessionsPage.tsx`, `store/authStore.ts`, `api/auth*.ts`, `utils/authPersistence.ts` |
| Users / profile | `services/user/`, `controllers/user/` | `pages/ProfileTab.tsx`, `UserProfilePage.tsx`, `hooks/useViewerLevelSport.ts`, `store/sportContextStore.ts` |
| Home (My) | `services/me/`, `services/game/` (my games) | `pages/MyTab.tsx`, `hooks/useMyGames.ts`, `usePastGames.ts`, `queries/me/useMyTabDataQuery.ts`, `queries/games/useMyGamesQuery.ts` |
| Find / available games | `services/game/availableGames*.ts` | `pages/FindTab.tsx`, `hooks/useAvailableGames.ts`, `useAvailableUpcomingGames.ts`, `useGameFilters.ts`, `queries/games/useAvailableGamesQuery.ts` |
| Game CRUD / details | `services/game/`, `controllers/game.controller.ts` | `pages/GameDetails*.tsx`, `CreateGame*.tsx`, `components/GameDetails/`, `hooks/useGameFormat.ts` |
| Participants / invites | `services/game/participant.service.ts`, `services/invite/` | `components/playerInvite/`, `hooks/useDeclineInvite.tsx`, `api/invites.ts` |
| League | `services/league/` | `pages/CreateLeague.tsx`, `LeagueDetails.tsx`, `LeagueBracketFullscreenPage.tsx`, `LeagueFixtureTableFullscreenPage.tsx`, `components/GameDetails/` league views |
| Results / live scoring | `services/results/`, `controllers/results.controller.ts`, `matchTimer.controller.ts` | `pages/GameLive*.tsx`, `hooks/useLiveMatchController.ts`, `hooks/liveMatchController/`, `liveScoring/registry.ts`, `utils/liveScoring/`, `components/liveScoring/` |
| Chat | `services/chat/`, `controllers/chat.controller.ts`, `groupChannel.controller.ts` | `pages/ChatsTab.tsx`, `GameChat*.tsx`, `services/chat/`, `hooks/useChat*.ts`, `store/unreadStore.ts`, `api/chat.ts` |
| Stickers / Giphy | `services/stickers/`, `giphyIngest/`, routes `/stickers` `/giphy` | `api/stickers.ts`, `api/giphy.ts`, `services/stickers/` |
| Play intent | `services/playIntent/`, `playIntentScheduler.service.ts` | `components/playIntent/`, `api/playIntents.ts`, `hooks` matching `usePlayIntent*` |
| Club booking | `services/booktime/`, `padeloo/`, `klikteren/`, `nspadel/`, `game/gameExternalBooking.service.ts` | `integrations/booking/`, `hooks/useBooktime*.ts`, `useKlikteren*.ts`, `useNspadel*.ts`, `pages/settings/ConnectedClubsBookingsPage.tsx` |
| Clubs / courts / occupancy | `services/game/courtOccupancy.service.ts`, club/court controllers | `hooks/useCourtOccupancy.ts`, `ClubModal.tsx`, `components/clubPicker/` |
| Rankings / trophies | `services/ranking/`, `achievements/` | `pages/LeaderboardTab.tsx`, `components/leaderboard/`, `trophies/`, `queries/useAchievementLeaderboardQuery.ts` |
| Marketplace | `services/marketItem/` | `pages/MarketplaceList.tsx`, `CreateMarketItem.tsx`, `components/marketplace/` |
| Bugs | `services/bug/` | `pages/Bugs.tsx`, `components/bugs/` |
| Stories | `services/story/` | `store/storiesStore.ts`, `components/stories/`, `api/stories.ts` |
| Ads | `services/ads/`, `admin/` ad\* | `components/sponsorSlots/`, `hooks/useAdPlacements.ts` |
| Push | `services/push/` | `services/pushNotificationService.ts`, `api/push.ts` |
| Telegram | `services/telegram/`, `controllers/telegramAuth.controller.ts` | `pages/TelegramAutoLogin.tsx`, `utils/telegramAutoLoginPath.ts` |
| Weather | `weatherForecast.service.ts` | `hooks/useMonthCalendarWeather.ts`, `queries/weather/` |
| Link-to-app | `services/linkToApp/`, `controllers/linkToApp.controller.ts` | `utils/appAttribution.ts`, `public/link-to-app/`, Admin `link-to-app.js` |
| Club admin | `services/clubAdmin/` | `clubAdmin/ClubManagementApp`, `pages/clubAdmin/` |
| User teams | `services/userTeam/` | `pages/UserTeamPage.tsx`, `components/userTeam/`, `store/userTeamsStore.ts` |
| Bets | `services/bets/` | `api/bets.ts` |
| Training | `training.service.ts` | create-game training flow, `api/training.ts` |
| Watch / widgets | `services/game/watchSession.service.ts` | `services/widgetBridge.ts`, `widgetNextGamesSync.ts`, `Frontend/ios/App/BandejaWatch*` |
