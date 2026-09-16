# Frontend

React **19**, Vite **8**, React Router **v7**, TypeScript **5.2**, Tailwind **4**, Zustand **5**, TanStack Query **5**, Dexie **4**, Capacitor **8** (`appId` `com.funified.bandeja`).

Entry: `Frontend/src/main.tsx` (theme sync, chat Dexie lifecycle, background sync, SW on web only) → `App.tsx`.

## State ownership

| Layer | Use | Do not use for |
|-------|-----|----------------|
| **Zustand** `Frontend/src/store/` | Auth session, theme, shell nav, unread badges, players cache, socket events, presence, stories, favorites, deep links, gates (name/gender/sport/slot overlap). | Server lists that Query already owns. |
| **TanStack Query** `Frontend/src/queries/` | My/available/past games, weather, user stats, social connections, questionnaire, my-tab payload, user game notes, achievement leaderboards. | Chat messages, chat inbox, outbox. |
| **Dexie** `Frontend/src/services/chat/chatLocalDb.ts` | Chat threads, messages, sync seq, outbox, drafts. Offline-first. Socket + HTTP sync apply into Dexie. | |

Query factory: **`Frontend/src/queries/queryKeys.ts`** (`queryKeys.games.my|available|availableUpcoming|past`, `weather`, `userGameNotes`, stats, questionnaire, achievements). Client: `queries/queryClient.ts`. Provider: `queries/QueryProvider.tsx` (online manager, invalidation bridge, widget next-game sync).

Chat unread totals use `@bandeja/unread-contract` inside Zustand `unreadStore` + chat services — not Query.

## Routes (`App.tsx`)

Most signed-in UX is **one** `MainPage` shell keyed by pathname (`utils/urlSchema.ts` `Place`). Dedicated route components:

| Path | Component |
|------|-----------|
| `/login`, `/login/:telegramKey`, `/register` | Login / TelegramAutoLogin / Register |
| `/select-city` | SelectCity (only if `currentCity` missing) |
| `/next-game` | NextGameRedirect (`pickNextGame`) |
| `/`, `/find`, `/chats`, `/chats/marketplace`, `/profile`, `/leaderboard`, `/games/:id`, `/games/:id/chat`, `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`, `/bugs`, `/bugs/:id`, `/marketplace/*`, `/game-subscriptions`, `/user-team/:id`, `/user-profile/:userId` | **MainPage** |
| `/profile/sessions` | SessionsPage |
| `/profile/connected-clubs` | ConnectedClubsBookingsPage |
| `/create-game`, `/create-league`, `/create-event` | create wrappers |
| `/games/:id/live`, `/live/tv`, `/live/broadcast`, `/broadcast` | live/TV/broadcast |
| `/games/:id/league-table`, `/league-bracket` | fullscreen league |
| `/my-clubs/*` | ClubManagementApp |
| `/link-to-app` | redirect to `/` or `/login`, keep query |
| `/welcome` | → `/` |

`/games/:id` and `/user-profile/:userId` are **not** behind `ProtectedRoute` (guest game + profile). Broadcast/live match routes also allow unauthenticated view.

Static Vite landings (`vite.config.ts` `STATIC_LANDING_PATHS`): `/link-to-app/` (trailing slash, `public/link-to-app/index.html`), `/ad-test`, birthday pages. SPA path `/link-to-app` (no slash) is the redirect above.

## MainPage tabs

Bottom bar (`components/navigation/BottomTabBar.tsx`) — **five** tabs when the user has enabled sports:

| Tab id | Path | Page |
|--------|------|------|
| `my` | `/` | `MyTab` |
| `find` | `/find` | `FindTab` |
| `chats` | `/chats` | `ChatsTab` (also marketplace/bugs/DM/game chat places) |
| `marketplace` | `/marketplace` | `MarketplaceList` / create / item |
| `leaderboard` | `/leaderboard` | `LeaderboardTab` |

`/profile` is `ProfileTab` — **not** a bottom tab. Users with no enabled sports lose My + Find tabs and are redirected off `/` and `/find` to `/profile`.

## URL-driven state

Canonical parser/builder: `Frontend/src/utils/urlSchema.ts`. Store mirror: `hooks/useUrlStoreSync.ts` → `shellNavStore`.

| Query | Where | Meaning |
|-------|-------|---------|
| `?player=` | any | Player card overlay (`PlayerCardModalManager`) |
| `?item=` | any | Marketplace item overlay |
| `?sport=` | profile, player overlay, deep links | Level-sport context (`parseLevelSportQuery`) |
| `?tab=` | `/` | `past-games` vs default calendar. Legacy `list`/`advanced` stripped. |
| `?tab=` | `/find` | `my-games` \| `search` |
| `?view=` | `/find` | `calendar` \| `list` |
| `?date=` / `?dayOffset=` | `/find` | selected calendar day |
| `?game=1` `?training=1` `?tournament=1` `?leagues=1` | `/find` | entity chips (`useFindFromUrl`) |
| `?focus=invites` | `/` | calendar + scroll invites |
| `?filter=` | `/chats` | `users` \| `channels`; `market` on marketplace chat |
| `?tv=1` `?theme=` `?transparent=1` | live/broadcast | TV shell / board theme |

Deep links: `hooks/useDeepLink.ts`, catalog under `Frontend/src/deepLinks/`.

## Offline gate

`App.tsx`: if `!isOnline`, show `NoInternetScreen` **unless**:

- game details `/games/:id`
- live match / TV / broadcast
- league fixture table fullscreen
- `/user-profile/:id`
- auth routes (login, register, telegram auto-login, `/link-to-app`)
- chat: `/chats`, `/user-chat|group-chat|channel-chat/:id`, `/games/:id/chat`, `/bugs/:id`

Chat is usable offline from Dexie + outbox. `OfflineBanner` still shows on the shell (not on TV/broadcast). Network: `utils/networkStatus.ts`.

## i18n

`Frontend/src/i18n/config.ts`. Locales: **`en ru sr es cs ar zh id hi th ja`**. Files: `i18n/locales/<lng>/*.json`. Fallback `en`. RTL: `ar` (also he/fa/ur in the RTL set). User language from profile `language` or `localStorage`.

## Theme

`store/themeStore.ts`: preference `light` \| `dark` \| `system`. Applied as `document.documentElement` class `dark`. Foreground re-sync: `applySystemThemeOnForeground.ts` (Capacitor resume). Selector: `components/ThemeSelector.tsx`.

Signed-in users with `user.isPremium === true` and `user.mainTheme === 'premium'` receive the Premium shell: an embossed gold tiger/brand header, compact obsidian bottom tabs with the original sizing, label visibility, and animations, and warm neutral/gold page accents. `styles/premium-navigation.css` scopes the palette to `MainLayout.premium-shell`; the saved light/dark/system preference stays intact. `PremiumBrand` uses the local transparent `/premium/bandeja-gold-crest.webp` asset. Standard users retain the existing palette and 64px header. Only the Premium branding area and top safe area use the welcome accept button’s dedicated `obsidian-gold-stone.webp` texture with continuous 12-second circular vein drift and a light sweep; a separately clipped decorative layer stops above the tab/controls row, preserves menu overflow, and honors reduced motion. Edge softening uses a static masked fade; avoid live backdrop blur over the animated stone because it causes repeated header rasterization during scrolling. The tab row keeps its dark base with a soft gold glow fading down from the branding seam. Premium header height is 112px plus the top safe area; shell content and fixed split panels read `--app-header-height` rather than assuming 64px. Bottom-tab routes, unread counts, sport gating, safe areas, and desktop placement stay the same.

`main.tsx` synchronizes the account preference to `html.premium-theme` independently of header mounting. Root, body, loading screen and all routes inherit the selected palette. `index.html` restores saved preferences before the first paint; `themeStore` synchronizes the native WebView background through `AuthBridge.setAppAppearance` on theme changes and foreground refresh. Native iOS/Android persist both preferences for launch and follow OS changes when System is selected. Broadcast transparency remains an explicit override.

`usePremiumNavigationAppearance` marks the document only while a Premium header is mounted, sets the web theme color, and restores it on downgrade/unmount. Capacitor uses light status-bar content over that dark header even when the app is light; the bottom system bar still follows the page appearance.

`components/premium/PremiumWelcome.tsx` checks account onboarding after startup and owns the full-screen Inner Circle reveal. `premiumWelcomeStore` lets the Premium header replay it without navigation. The server stores `premiumOnboardingCompletedAt`; dismissal is immediate with a best-effort background write, and only a successful write completes onboarding on the server. Failed writes never block closing or trigger an automatic replay in the current session. Artwork lives in `src/assets/premium/`. The shared branding-footer resolver chooses the gold crest under the Premium theme; HTML first paint and native launch screens use the same gold branding.

## Pull-to-refresh

`components/PullToRefreshShell.tsx` + `hooks/usePullToRefresh.ts` + `RefreshIndicator`. Used on Home/Find lists. Disabled when nested scrollers should own the gesture.

## Desktop split views

`hooks/useDesktop.ts` — viewport **≥ 768px**.

| Surface | Behavior |
|---------|----------|
| Home calendar | `MyTab` split: month calendar \| games (`splitView`) |
| Find calendar | `FindTab` + `AvailableGamesSection splitView` |
| Chats | list \| thread (`SplitViewPanels`, `ResizableSplitter`) |
| Game details | desktop or landscape: info \| chat/results (`GameDetailsPage`) |

Components: `SplitViewPanels.tsx`, `ResizableSplitter.tsx`.

## PWA / SW

`Frontend/public/sw.js`. `main.tsx` registers `/sw.js` **only if not Capacitor**. `npm run postbuild` → `scripts/force-sw-update.js`. Capacitor uses bundled `dist/` (`capacitor.config.ts` `webDir`).

## Capacitor

`Frontend/src/utils/capacitor.ts`, `capacitorSetup.ts`. Plugins: push, keyboard (`resize: none`), system bars CSS insets, camera, geolocation, share. iOS extras under `Frontend/ios/App/` (Watch, widgets, NSE) — see [code-map.md](./code-map.md).

## HTTP

`api/httpClient.ts` Axios instance. `api/axios.ts` interceptors: Bearer, `X-Client-Version`, `X-Client-Platform`, attribution on auth URLs, 401 → refresh (`api/authRefresh.ts`). Web `withCredentials: true` (refresh cookie). Native: JSON refresh in persistence (`services/refreshTokenPersistence.ts`).
