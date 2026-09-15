# Native

Capacitor 8 shell. `appId` `com.funified.bandeja`, `webDir` `dist`. iOS/Android schemes `https`. Keyboard: plugin `resize: none` (JS/CSS lift). Push: badge/sound/alert. SystemBars CSS insets.

## Plugins / capabilities

Camera, photos, geolocation, filesystem, keyboard, network, app lifecycle, share, local/push notifications, secure token storage (Keychain/Keystore refresh credentials). Hardware back. App icon badge = unread. Alternate app icons + sport mascot (`appIcons.ts`, `appIcon.service.ts`). Splash uses primary sport + selected icon.

## Deep links

`Frontend/src/hooks/useDeepLink.ts` — Capacitor `App.getLaunchUrl` + `appUrlOpen`. Hosts: `isBandejaDeepLinkHost`. Attribution ingest on open (`appAttribution`). `/link-to-app` → `/login` + query.

Same paths as web unless noted: games (+ chat/live/tv/broadcast/league-table/league-bracket), chats, bugs, marketplace (+ query), profiles (`?sport=`), teams, Telegram `/login/:key` (deduped), tabs, create game/league/event, `/next-game`, `/my-clubs/*`, sessions/connected-clubs. Chat routes bump fresh-open nonce. Find: `resolveFindDeepLinkTarget`. Catalog: `Frontend/src/deepLinks/catalog.ts`.

## Widgets / next game

Policy `@shared/nextGame/policy.ts`: soonest non-FINISHED/ARCHIVED with `startTime` strictly after reference−1h. Runtime `Frontend/src/utils/pickNextGame.ts` + golden JSON. Envelope via `widgetNextGamesSync` / `WidgetBridgePlugin` (iOS App Group `BandejaNextGames`, Android `:bandeja-widgets`). Tap `/next-game` or `?open=chat|live` (`NextGameRedirect`). Cleared on logout.

## Siri / shortcuts

iOS: up to 10 donated (`BandejaAppShortcuts`, `assistantRegistry.ts`) — Find today/tomorrow, My, next game, next-game chat/live, related feature/entity intents. Android: static `shortcuts.xml` + `DynamicGameShortcuts` from the next-games envelope.

## Watch / HealthKit

BandejaWatch: live scoring, next-game widgets, workout. HealthKit workout bridge via phone. Watch refreshes JWT after long idle.

## Permission modals

`PermissionModalProvider` + `permissionService` — camera, photos, geolocation when denied. Recheck on `appStateChange`.

## Calendar add

Native device calendar on Capacitor; web = Google Calendar + `.ics`.

## Offline exceptions

`App.tsx` `NoInternetScreen` gates most routes. Allowed offline: game details, live/broadcast, league fullscreen table, `/user-profile/:id`, auth, **all chat routes** (Dexie + outbox). Native still uses bundled `dist` (no PWA SW).
