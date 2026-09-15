# Bandeja product overview

**Product name:** Bandeja. **Repo:** PadelPulse.

Multisport social platform for games, leagues, training, chat, live scoring, ratings, marketplace, and club booking. Not a generic “events app”: every scheduled row is a `Game` with an `EntityType`.

Enums: `Backend/prisma/schema.prisma`. Routes: `Frontend/src/App.tsx`. Shell tabs: `Frontend/src/components/navigation/BottomTabBar.tsx`. Guest vs login: `Frontend/src/components/ProtectedRoute.tsx`. Vocabulary: `docs/product/glossary.md`. Load-bearing rules: `docs/product/constraints.md`.

## Sports

`Sport` enum (`schema.prisma`):

| Value | Product name |
|-------|----------------|
| `PADEL` | Padel |
| `TENNIS` | Tennis |
| `PICKLEBALL` | Pickleball |
| `BADMINTON` | Badminton |
| `TABLE_TENNIS` | Table tennis |
| `SQUASH` | Squash |

Registry + create templates: `Frontend/src/sport/createFlow.ts`, `Frontend/shared/createTemplates.ts`. Parity: `Frontend/src/sport/createTemplates.parity.test.ts`.

## Platforms

| Surface | Stack / path |
|---------|----------------|
| Web + PWA | Vite + React 19, `Frontend/`. Service worker on web only. Origin `https://bandeja.me` (`Frontend/src/deepLinks/catalog.ts`). |
| iOS / Android | Capacitor 8. `Frontend/capacitor.config.ts`: `appId` `com.funified.bandeja`, `appName` `Bandeja`. Play Store same id. App Store `id6756632318` (`Backend/src/services/linkToApp/linkToApp.constants.ts`). |
| Apple Watch | `Frontend/ios/App/BandejaWatch Watch App/`. Live scoring, Next Game / Live Active widgets, HealthKit workout. Requires paired iPhone. |
| Telegram bot | `Backend/src/services/telegram/bot.service.ts`. Commands `/start` `/auth` `/login` `/my` `/games`. Notifications + lightweight browse. |
| Admin | Plain JS, no build: `Admin/`. Serve via `Admin/serve.sh` → `http://127.0.0.1:9010/` (not `file://`). |

Capability matrix: `docs/product/platforms.md`.

UI languages (`Frontend/src/i18n/config.ts` `APP_UI_LANGUAGES`): `en`, `ru`, `sr`, `es`, `cs`, `ar`, `zh`, `id`, `hi`, `th`, `ja`.

## Main 5-tab shell vs standalone routes

Authenticated UX is one **MainPage shell** (`Frontend/src/pages/MainPage.tsx`) plus **standalone** full-screen routes in `App.tsx`.

Bottom tabs (`BottomTabBar.tsx`):

| Tab label | `id` | Path |
|-----------|------|------|
| My | `my` | `/` |
| Find | `find` | `/find` |
| Chats | `chats` | `/chats` |
| Market | `marketplace` | `/marketplace` |
| Top | `leaderboard` | `/leaderboard` |

Unread badge is wired on **Chats only**. Users with no enabled sport lose My + Find tabs and are redirected Home/Find → `/profile` (`hasEnabledSports` in `MainPage.tsx`).

`MainPage` also renders (still inside the shell, not extra tabs): `/profile`, `/games/:id`, `/games/:id/chat`, `/user-profile/:userId`, `/user-team/:id`, `/game-subscriptions`, marketplace subpaths, `/bugs`, `/bugs/:id`, `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`, `/chats/marketplace`.

**Standalone (own page, not MainPage):**

| Path | Component | Auth |
|------|-----------|------|
| `/login`, `/register` | Login / Register | Public; authed → `/` |
| `/login/:telegramKey` | TelegramAutoLogin | Public |
| `/select-city` | SelectCity | Protected; only if `user.currentCity` missing and primary sport already set |
| `/welcome` | `<Navigate to="/" />` | — |
| `/next-game` | NextGameRedirect | No `ProtectedRoute`; resolves then navigates |
| `/create-game` | CreateGameWrapper | Protected |
| `/create-league` | CreateLeague | Protected |
| `/create-event` | CreateEventWrapper | Protected |
| `/profile/sessions` | SessionsPage | Protected |
| `/profile/connected-clubs` | ConnectedClubsBookingsPage | Protected |
| `/games/:id/live` | GameLiveRoute | Public (spectator token on query) |
| `/games/:id/live/tv` | GameLiveTvRedirect | Protected shortcut → live + `?tv=1` |
| `/games/:id/live/broadcast` | GameLiveBroadcastRedirect | Protected shortcut → broadcast URL |
| `/games/:id/broadcast` | GameBroadcastRoute | Public (spectator token) |
| `/games/:id/league-table` | LeagueFixtureTableFullscreenPage | Protected |
| `/games/:id/league-bracket` | LeagueBracketFullscreenPage | Protected |
| `/my-clubs/*` | ClubManagementApp | Protected |
| `/link-to-app` | `<Navigate to="/" or "/login">` | SPA does **not** render the QR page |

Catch-all `*` → `/`.

Static QR landing is **not** the SPA route: `Frontend/public/link-to-app/index.html` is served as `/link-to-app/` (trailing slash). Hits `/api/public/link-to-app/hit` and `/api/public/link-to-app/go/{ios,android,web}`. See `docs/product/constraints.md` (link-to-app first-touch).

`/rating` is commented out in `App.tsx`. See `docs/product/not-shipped.md`.

## Guest access

`ProtectedRoute` remembers the path and sends unauthenticated users to `/login`.

**No `ProtectedRoute` (guest can load):**

| Path | Behavior |
|------|----------|
| `/login`, `/register`, `/login/:telegramKey` | Auth |
| `/games/:id` | Public game details; join prompts login |
| `/user-profile/:userId` | Public profile |
| `/games/:id/live`, `/games/:id/broadcast` | Guest with `?spectatorToken=` |
| `/next-game` | Redirect helper (then typically hits a protected game path) |
| `/link-to-app` | SPA bounce to `/login` |
| `/link-to-app/` (static HTML) | Store / web chooser; no app session required |

`/games/:id/live/tv` and `/games/:id/live/broadcast` are **auth-only redirects**. The target live/broadcast pages accept spectator tokens.

Everything else → login.

## Offline gate

`NoInternetScreen` blocks most routes when offline (`App.tsx`). Exceptions: game details `/games/:id`, live/broadcast, league-table fullscreen, `/user-profile/:userId`, auth paths (including `/link-to-app`), all chat paths (`/chats`, `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`, `/games/:id/chat`, `/bugs/:id`). Chat uses IndexedDB + outbox.

## What is not in the product

| Item | Reality in code |
|------|-----------------|
| Goods shop UI | `Backend/src/routes/goods.routes.ts` exists. No catalog browser route in `App.tsx`. Coins via admin `NEW_COIN`, bets, P2P `TRANSFER`, API `PURCHASE`. |
| `/rating` | Lazy import + route commented in `App.tsx`. |
| External wallet top-up | No payment-provider checkout. Wallet is in-app coins (`Frontend/src/api/transactions.ts`: `NEW_COIN` \| `TRANSFER` \| `PURCHASE` \| `REFUND`). |
| `GameStatus.READY` / `PLAYING` | **Not in schema.** Stored values are `ANNOUNCED` \| `STARTED` \| `FINISHED` \| `ARCHIVED`. `READY`/`SCHEDULED` are league **UI** labels. |

Full list: `docs/product/not-shipped.md`.
