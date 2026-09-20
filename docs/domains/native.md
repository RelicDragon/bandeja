# Native

Capacitor 8 shell. `appId` `com.funified.bandeja`, `webDir` `dist`. iOS/Android schemes `https`. Keyboard: plugin `resize: none` (JS/CSS lift). Push: badge/sound/alert. SystemBars CSS insets.

## Plugins / capabilities

Camera, photos, geolocation, filesystem, keyboard, network, app lifecycle, share, local/push notifications, secure token storage (Keychain/Keystore refresh credentials). Hardware back. App icon badge = unread. Alternate app icons + sport mascot (`appIcons.ts`, `appIcon.service.ts`). Splash uses primary sport + selected icon.

## Appearance

`AuthBridge.setAppAppearance` saves Light/Dark/System plus the effective Classic/Premium choice and updates the native window/WebView backing to match the document background. iOS uses a dynamic UIColor for System; Android refreshes on configuration changes. The web theme store also re-sends the preferences on foreground. Native backing changes require a new native build; existing builds still receive the web/CSS backgrounds.

## Deep links

`Frontend/src/hooks/useDeepLink.ts` — Capacitor `App.getLaunchUrl` + `appUrlOpen`. Hosts: `isBandejaDeepLinkHost`. Attribution ingest on open (`appAttribution`). `/link-to-app` → `/login` + query.

Same paths as web unless noted: games (+ chat/live/tv/broadcast/league-table/league-bracket), chats, bugs, marketplace (+ query), profiles (`?sport=`), teams, Telegram `/login/:key` (deduped), tabs, create game/league/event, `/next-game`, `/my-clubs/*`, sessions/connected-clubs. Chat routes bump fresh-open nonce. Find: `resolveFindDeepLinkTarget`. Catalog: `Frontend/src/deepLinks/catalog.ts`.

## Widgets / next game

Policy `@shared/nextGame/policy.ts`: soonest non-FINISHED/ARCHIVED with `startTime` strictly after reference−1h. Runtime `Frontend/src/utils/pickNextGame.ts` + golden JSON. Envelope via `widgetNextGamesSync` / `WidgetBridgePlugin` (iOS App Group `BandejaNextGames`, Android `:bandeja-widgets`). Tap `/next-game` or `?open=chat|live` (`NextGameRedirect`). Cleared on logout.

## Siri / shortcuts

iOS: up to 10 donated (`BandejaAppShortcuts`, `assistantRegistry.ts`) — Find today/tomorrow, My, next game, next-game chat/live, related feature/entity intents. Android: static `shortcuts.xml` + `DynamicGameShortcuts` from the next-games envelope.

## Watch / HealthKit

BandejaWatch: live scoring, next-game + live-match widgets, workout. The watch runs the `HKWorkoutSession` itself (`WorkoutManager`, activity type from `WatchSport.hkActivityType`, location `.unknown`) and POSTs the summary to `POST /games/:id/workout` after results are finalized; failed uploads queue in `WorkoutSyncOutbox` (bound to the recording user, cleared on logout, poison 4xx dropped). Credentials arrive from the phone over WatchConnectivity (`WatchSessionManager`) and the watch refreshes its own JWT after long idle. Match-timer pause/resume mirrors workout pause/resume through `MatchTimerWorkoutBridge` and the `WatchMatchTimerRelayStore` (single source for relayed + self-fetched snapshots; elapsed time anchors on local receipt time). Watch and widget-extension targets carry the same `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` as the iOS app (`./scripts/app-release.sh sync-ios-versions`).

## Permission modals

`PermissionModalProvider` + `permissionService` — camera, photos, geolocation when denied. Recheck on `appStateChange`.

## Calendar add

Native device calendar on Capacitor; web = Google Calendar + `.ics`.

## Offline exceptions

`App.tsx` `NoInternetScreen` gates most routes. Allowed offline: game details, live/broadcast, league fullscreen table, `/user-profile/:id`, auth, **all chat routes** (Dexie + outbox). Native still uses bundled `dist` (no PWA SW).
