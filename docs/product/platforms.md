# Platform matrix

Former `docs/APP_FUNCTIONALITY.md` §39. Routes: `Frontend/src/App.tsx`. Native URL open: `Frontend/src/hooks/useDeepLink.ts`. Catalog: `Frontend/src/deepLinks/catalog.ts`. Capacitor: `Frontend/capacitor.config.ts` (`appId` `com.funified.bandeja`).

## Capabilities

| Capability | Web | iOS | Android | Watch | Telegram | Admin |
|------------|-----|-----|---------|-------|----------|-------|
| Core tabs and game flows | yes | yes | yes | — | browse `/games`, `/my` | — |
| PWA / service worker cache | yes | — | — | — | — | — |
| Apple Sign-In | — | yes | — | — | — | — |
| Google Sign-In | yes | — | yes | — | — | — |
| Push | — | APNs | FCM | — | bot messages | mass push |
| Inline chat reply from notification | limited | yes (+ token-only when killed) | yes (+ native `replyToken`) | — | — | — |
| Invite actions from notification shade | — | partial | yes (game + team) | — | inline buttons | — |
| Rich push (image/video/story thumb) | — | yes (+ NSE) | yes MessagingStyle | — | — | — |
| iOS Communication Notifications | — | yes when entitled | — | — | — | — |
| Alternate app icon + sport mascot | — | yes | yes | — | — | — |
| Live scoring | yes | yes | yes | yes | — | — |
| Home Next Game widgets | — | yes (`BandejaHomeWidgets`) | yes (`:bandeja-widgets`) | Watch Next Game + Live Active | — | — |
| Siri / App Intents | — | yes | — | — | — | — |
| Android dynamic shortcuts | — | — | yes | — | — | — |
| Offline chat (IndexedDB outbox) | yes | yes | yes | — | — | — |
| External booking Booktime / Padeloo / Klikteren / Nspadel | yes | yes | yes | — | — | court import |
| Deep links (`appUrlOpen`) | HTTPS URLs | yes | yes | — | `/login/:telegramKey` | — |
| Hardware back | browser back | yes | yes | — | — | — |
| Keyboard-aware dialogs | mobile web | yes | yes | — | — | — |
| App icon badge count | — | yes | yes | — | — | — |
| HealthKit workout bridge | — | via phone | — | yes | — | — |
| Link-to-app QR landing | static `/link-to-app/` | store via `/go/ios` | store via `/go/android` | — | — | App QR stats |

Watch app: `Frontend/ios/App/BandejaWatch Watch App/`. Watch widgets: `Frontend/ios/App/BandejaWatchWidgets/`. Telegram commands: `Backend/src/services/telegram/bot.service.ts`. Admin: `Admin/`.

## Native deep link routes (Capacitor)

`useDeepLink.ts` handles Bandeja URL hosts. Same paths as web unless noted. Chat opens bump a fresh-open nonce.

| Path pattern | Destination |
|--------------|-------------|
| `/games/:id`, `/games/:id/chat`, `/games/:id/live`, `/games/:id/live/tv`, `/games/:id/live/broadcast`, `/games/:id/broadcast`, `/games/:id/watch`, `/games/:id/league-table`, `/games/:id/league-bracket` | Matching game routes (live boards keep their query: `matchId`, `spectatorToken`) |
| `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`, `/bugs/:id` | Chat threads (fresh open nonce) |
| `/user-profile/:id` | Profile (`?sport=` preserved) |
| `/user-team/:id` | Team page |
| `/marketplace`, `/marketplace/my`, `/marketplace/create`, `/marketplace/:id`, `/marketplace/:id/edit` | Marketplace (+ query) |
| `/login/:telegramKey` | Telegram auto-login (deduped; pending path in `deepLinkStore`) |
| `/`, `/find`, `/chats`, `/profile`, `/leaderboard`, `/bugs`, `/game-subscriptions`, `/create-game`, `/create-league`, `/create-event`, `/select-city`, `/login`, `/register` | Main / auth |
| `/next-game`, `/next-game?open=chat`, `/next-game?open=live` | `NextGameRedirect` → detail / chat / live (`Frontend/src/utils/pickNextGame.ts`, `@shared/nextGame/policy`) |
| `/my-clubs/*` | Club admin |
| `/profile/connected-clubs`, `/profile/sessions` | Profile sub-pages |
| `/link-to-app` | Navigate to `/login` + query; ingest `aid` clipboard |

Locked catalog actions (`DEEP_LINK_ACTIONS`): `myGames` `/`, `findToday` `/find?view=calendar&dayOffset=0`, `findTomorrow` `/find?view=calendar&dayOffset=1`, `createGame`, `createLeague`, `createEvent`, `nextGame` / chat / live, `chats`, `invites` `/?focus=invites`.

Push taps use the same route targets (games, chats, bugs, marketplace, teams, league schedule). Widget / Siri / shortcut taps typically land on `/next-game` or a concrete game path.

## Native-only UX (not desktop web)

- Permission modals: camera, photos, geolocation (`PermissionModalProvider`)
- Native calendar add on Capacitor; web: Google Calendar + `.ics`
- Splash / loading mascot: primary sport + selected app icon (`appIcons.ts`)
- Android story DM bar uses plugin keyboard height
- Capacitor secure token storage for refresh
- Siri / App Intents (iOS): donated shortcuts (`BandejaAppShortcuts` / `assistantRegistry`) — Find today/tomorrow, My games, next game, next-game chat/live, plus related intents
- Android dynamic shortcuts: `DynamicGameShortcuts.java` from the next-games envelope; static `shortcuts.xml`

## Phone home-screen widgets

Separate from Watch widgets.

| Platform | Implementation | Data |
|----------|----------------|------|
| iOS | `BandejaHomeWidgets` + `BandejaNextGames` App Group | Envelope from `widgetNextGamesSync` / `WidgetBridgePlugin` |
| Android | `:bandeja-widgets` + `WidgetBridgePlugin` | Same next-games JSON envelope |

Policy: `Frontend/shared/nextGame/policy.ts` + golden JSON. Selection: `Frontend/src/utils/pickNextGame.ts`. Tap → `/next-game` or `/next-game?open=chat|live`. Cleared on logout (`clearWidgetNextGamesCache`).

## Link-to-app / stores

- App Store: `https://apps.apple.com/app/bandeja/id6756632318`
- Play: `https://play.google.com/store/apps/details?id=com.funified.bandeja`
- Web: `https://bandeja.me`
- Public API: `GET /api/public/link-to-app/hit?kind=view|ios|android|web`, `GET /api/public/link-to-app/go/:choice`
