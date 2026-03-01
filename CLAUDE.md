# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bandeja is a comprehensive padel game scheduling and community platform with real-time chat, tournament management, leagues, marketplace, and betting features. The project is a monorepo with three main components: Backend (Node.js/Express/TypeScript), Frontend (React/Vite/Capacitor), and Admin (vanilla JS).

## Where to Implement Things

| Task | Backend | Frontend |
|------|---------|----------|
| New REST endpoint | `routes/<domain>.routes.ts` → `controllers/` → `services/` | `api/<domain>.ts` (or new file in `api/`), then use in page/hook |
| New page/screen | — | Add route in `App.tsx`, add `Place` + pattern in `utils/urlSchema.ts`, use `navigationService` or `buildUrl()` to navigate |
| New socket event | Emit in `services/socket.service.ts`; subscribe in controller/service | Subscribe in `socketEventsStore` or component; room names: `game:${id}`, `group:${id}`, etc. |
| New global client state | — | `store/<name>Store.ts` (Zustand, optionally persist) |
| Game-related logic | `services/game/*.service.ts` | `pages/GameDetails.tsx`, `components/GameDetails/` |
| Chat-related logic | `services/chat/*.service.ts` | `pages/GameChat.tsx`, `pages/GameChat/*.ts(x)`, `components/chat/` |
| Header per route | — | `headerStore` + `layouts/Header.tsx` + `components/headerContent/` |
| Programmatic navigation | — | `navigationService` (e.g. `navigateToGame`, `navigateToGroupChat`) or `buildUrl(place, params)` + `navigate()` |
| Back navigation | — | `utils/backNavigation.ts` (`handleBack`); history in `navigationStore` |

## Common Commands

### Backend Development
```bash
cd Backend

# Development
npm run dev                    # Start development server with hot reload
npm run dev:setup             # Run initial setup script

# Database
npm run prisma:generate       # Generate Prisma client
npm run prisma:migrate        # Run database migrations
npm run prisma:studio         # Open Prisma Studio (database GUI)

# Build & Deploy
npm run build                 # Compile TypeScript to dist/
npm start                     # Run production build

# Utilities
npm run lint                  # Lint TypeScript files
npm run migrate-to-s3         # Migrate media to S3
npm run backfill:last-message-previews    # Backfill message previews
npm run backfill:content-searchable       # Backfill searchable content
```

### Frontend Development
```bash
cd Frontend

# Development
npm run dev                   # Start Vite dev server (port 3001)
npm run build                 # Build for production
npm run preview               # Preview production build

# Mobile
npx cap sync                  # Sync web assets to native projects
npx cap open ios              # Open iOS project in Xcode
npx cap open android          # Open Android project in Android Studio

# Utilities
npm run lint                  # Lint code
npm run increment-sw          # Increment service worker version
```

### Admin Dashboard
```bash
cd Admin
# Open index.html in browser or serve with any static server
# Configure API endpoint in app.js (supports localhost:3000, localhost:9000, or production)
```

## Architecture Overview

### Backend Structure

**Three-layer architecture**: Routes → Controllers → Services

```
Backend/
├── src/
│   ├── routes/           # 33 route files, consolidated in index.ts
│   ├── controllers/      # Request/response handlers
│   ├── services/         # Business logic organized by domain
│   │   ├── game/         # Game CRUD, participants, readiness
│   │   ├── chat/         # Messages, reactions, polls, translations
│   │   ├── telegram/     # Bot, notifications, commands
│   │   ├── push/         # APNs, FCM push notifications
│   │   ├── results/      # Game results calculation
│   │   ├── league/       # League management
│   │   └── marketItem/   # Marketplace services
│   ├── middleware/       # auth, validate, errorHandler
│   ├── utils/            # ApiError, jwt, constants, helpers
│   └── server.ts         # Express app entry point
└── prisma/
    └── schema.prisma     # Database schema (50+ models)
```

**Key patterns:**
- All API routes mounted under `/api` (e.g. `/api/games`, `/api/chat`). App entry: `app.ts` → router from `routes/index.ts`.
- AsyncHandler wrapper for controller error handling. Controllers call services; services throw `ApiError(statusCode, message)` for client errors.
- Service layer contains all business logic; controllers stay thin.
- Prisma ORM for DB; use `select`/`include` explicitly.

**Backend route mount points** (`Backend/src/routes/index.ts`): `/api/app`, `/api/auth`, `/api/telegram`, `/api/users`, `/api/cities`, `/api/clubs`, `/api/courts`, `/api/games`, `/api/game-teams`, `/api/leagues`, `/api/results`, `/api/invites`, `/api/rankings`, `/api/admin`, `/api/logs`, `/api/chat`, `/api/media`, `/api/favorites`, `/api/bugs`, `/api/game-courts`, `/api/transactions`, `/api/goods`, `/api/level-changes`, `/api/push`, `/api/blocked-users`, `/api/faqs`, `/api/game-subscriptions`, `/api/training`, `/api/trainers`, `/api/group-channels`, `/api/bets`, `/api/market-items`, `/api/user-game-notes`, `/api/currency`.

### Frontend Structure

**React 19 + Vite + Capacitor mobile app**

```
Frontend/
├── src/
│   ├── pages/            # Route components (MainPage, GameChat, etc.)
│   ├── components/       # Reusable UI components
│   │   ├── chat/         # Chat-specific components
│   │   ├── headerContent/# Header variants per route
│   │   ├── marketplace/  # Marketplace UI
│   │   └── navigation/   # Bottom tab bar, navigation
│   ├── store/            # Zustand state management stores
│   ├── api/              # Axios API client modules
│   ├── services/         # Frontend business logic
│   ├── hooks/            # Custom React hooks
│   ├── layouts/          # Layout components (Header, etc.)
│   ├── utils/            # Helpers, formatters, validators
│   │   ├── marketChatUtils.ts  # Marketplace chat display helpers
│   │   ├── chatListHelpers.ts  # Chat list utilities
│   │   └── navigation.ts       # Navigation utilities
│   ├── i18n/            # Internationalization (en, es, ru, sr)
│   └── App.tsx           # Root component with routing
├── ios/                  # Capacitor iOS project
└── android/              # Capacitor Android project
```

**State management (Zustand stores)** (`Frontend/src/store/`):
- `authStore` - Auth state (persisted), JWT, user profile
- `socketEventsStore` - Socket subscriptions, unread count updates
- `navigationStore` - Route history, back stack
- `playersStore` - User/player cache for lists and cards
- `chatSyncStore` - Chat sync state
- `presenceStore` / `presenceWantedStore` - Online presence
- `headerStore`, `favoritesStore`, `appModeStore`, `themeStore`

**Custom hooks:**
- `useGroupChannelUnreadCounts` - Unread counts for group channels, socket sync
- `useUrlStoreSync` - Syncs URL with navigationStore (used in App)
- `useDeepLink` - Handles incoming deep links
- `useBackButtonHandler` - Android back button
- `useNavigateWithTracking` - Navigate and track for back stack

**Key pages and structure:**
- `GameDetailsPage.tsx` wraps `GameDetails.tsx` (main game UI). Game chat: `GameChatRoute.tsx` → `GameChat.tsx`; logic split into `pages/GameChat/*.ts(x)` (hooks: useGameChatContext, useGameChatMessages, useGameChatSocket, useGameChatPanels, useGameChatReactions, etc.; components: GameChatHeader, GameChatFooter, GameChatTabs, GameChatAccessDenied, GameChatLoadingSkeleton).
- Main tabs: MainPage (Home, Find, Chats, Profile, Leaderboard), lazy-loaded in App.
- API client modules in `api/`: auth, games, chat, media, favorites, bugs, leagues, courts, cities, clubs, marketplace, bets, training, trainers, push, currency, etc.; entry via `api/index.ts`.

### Database Schema (Prisma)

**Core entities:**
- `User` - Multi-auth provider (Phone, Telegram, Apple, Google)
- `Game` - Central entity with hierarchical structure (parent/child), supports tournaments, leagues, training
- `ChatMessage` - Multi-context messaging (GAME, BUG, USER, GROUP)
- `GroupChannel` - Community groups AND marketplace private chats (between buyer/seller)
- `League` - Tournament structure with seasons, groups, rounds
- `MarketItem` - Marketplace items with categories and trade types
- `Bet` - Betting system (SOCIAL or POOL types)
- `ExchangeRate` - Currency conversion rates for marketplace items

**Important relationships:**
- Games can be hierarchical (parentId field) for tournament brackets
- ChatMessage uses polymorphic contextId + chatContextType pattern
- User preferences split across User model fields and NotificationPreference model
- GroupChannel can be associated with bugs (1:1), market items (1:many), or standalone community groups
- MarketItem can have multiple GroupChannels (one per buyer for private chats)

## Real-Time & Communication Architecture

### Socket.IO Integration

**Server** (`Backend/src/services/socket.service.ts`):
- Room-based architecture: game rooms, chat rooms, bug rooms, user chats
- Events emitted: game updates, chat messages, reactions, read receipts, wallet updates, bets, polls
- Heartbeat mechanism for connection health

**Client** (`Frontend/src/services/socketService.ts`):
- Auto-reconnection with exponential backoff
- Event subscription system via `socketEventsStore`
- Room joining/leaving managed per route navigation

### Dual-Track Notifications

**Push Notifications:**
- APNs for iOS, FCM for Android
- `PushToken` model stores device tokens per platform
- Smart delivery: Try Socket.IO first, fallback to push notification
- `MessageDeliveryAttempts` service tracks delivery status

**Telegram Integration:**
- grammy bot framework with commands: `/start`, `/auth`, `/my`, `/games`
- OTP authentication via inline keyboards (6-digit codes in `TelegramOtp` model)
- Game results posted to city Telegram groups
- Scheduled cleanup service for expired OTPs

**User preferences:**
- Per-channel settings: `sendPushMessages`, `sendTelegramMessages`, etc.
- `NotificationPreference` model for granular control
- Fields: `sendInvites`, `sendDirectMessages`, `sendReminders`, `sendWalletNotifications`

## Multi-Context Chat System

**Single unified chat architecture:**
```typescript
enum ChatContextType {
  GAME      // Game public/admin/private chats
  BUG       // Bug report discussions
  USER      // Direct user-to-user chats
  GROUP     // Community channels AND marketplace buyer-seller chats
}

enum ChatType {
  PUBLIC    // Visible to all participants
  PRIVATE   // Direct messages
  ADMINS    // Admins only
  PHOTOS    // Photo gallery chat
}
```

**Key features:**
- `contextId` polymorphically references Game/Bug/UserChat/GroupChannel
- Supports reactions, read receipts, translations, polls, replies
- `ChatDraft` model for unsent message persistence
- `MessageReport` for content moderation
- `contentSearchable` field for full-text search (use `messageSearch.service.ts`)

**GroupChannel (GROUP context) types:**
- Community channels: `isChannel: true`, `bugId: null`, `marketItemId: null`
- Bug discussion groups: `isChannel: false`, `bugId: <bugId>`, unique per bug
- Marketplace private chats: `isChannel: false`, `marketItemId: <itemId>`, `buyerId: <userId>`, multiple per item

## Game System

**Game types:**
- CLASSIC, AMERICANO, MEXICANO, ROUND_ROBIN, WINNER_COURT, CUSTOM

**Entity types:**
- GAME, TOURNAMENT, LEAGUE, LEAGUE_SEASON, BAR, TRAINING

**Game lifecycle:**
- Status: ANNOUNCED → STARTED → FINISHED → ARCHIVED
- Results status: NONE → IN_PROGRESS → FINAL

**Complex features:**
- Fixed teams vs dynamic teams (`hasFixedTeams`, `GameTeam` model)
- Match generation strategies: HANDMADE, FIXED, RANDOM, ROUND_ROBIN, ESCALERA, RATING, WINNERS_COURT
- Winner determination: BY_MATCHES_WON, BY_POINTS, BY_SCORES_DELTA, PLAYOFF_FINALS
- Hierarchical structure: Games can have children (rounds in tournaments)
- Results affect player levels (`GameOutcome`, `LevelChangeEvent` models)

## Important Service Patterns

### Backend Services Organization

**Game services** (`Backend/src/services/game/`):
- Split into focused services: `create`, `read`, `update`, `delete`, `admin`, `participant`, `readiness`
- Use these services instead of direct Prisma queries for game operations

**Chat services** (`Backend/src/services/chat/`):
- 17+ specialized services for different chat concerns
- `groupChannel.service.ts` - Group management
- `messageSearch.service.ts` - Full-text search with highlighting
- `poll.service.ts` - Poll creation and voting
- `reaction.service.ts`, `readReceipt.service.ts` - Message interactions
- `translation.service.ts` - AI-powered message translation

**Unread count management:**
- `UnreadCountBatchService` aggregates updates before emitting
- Prevents flooding clients with individual message updates
- Batches counts for multiple chats/games before broadcasting

## Frontend Routing & Navigation

**Routes** (defined in `App.tsx`): `/`, `/login`, `/register`, `/select-city`, `/complete-profile`, `/welcome`, `/find`, `/chats`, `/chats/marketplace`, `/profile`, `/leaderboard`, `/games/:id`, `/games/:id/chat`, `/create-game`, `/create-league`, `/rating`, `/bugs`, `/bugs/:id`, `/marketplace`, `/marketplace/my`, `/marketplace/create`, `/marketplace/:id`, `/marketplace/:id/edit`, `/game-subscriptions`, `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`.

**URL ↔ place mapping** (`Frontend/src/utils/urlSchema.ts`):
- `parseLocation(pathname, search)` → `{ place: Place, params, overlay? }`
- `buildUrl(place, params)` → path string
- `Place` enum: home, find, chats, chatsMarketplace, profile, leaderboard, game, gameChat, userChat, groupChat, channelChat, createGame, createLeague, marketplace, marketplaceMy, marketplaceItem, createMarketItem, editMarketItem, gameSubscriptions, bugs, login, etc.
- **Deprecated:** `config/navigationRoutes.ts` is a stub; URL parsing lives in urlSchema, back behavior in `utils/backNavigation.ts`.

**Important navigation patterns:**
- Use `navigationService` for programmatic navigation (initialized in App with `navigate`); do not rely on `useNavigate()` alone for deep links.
- Back: `handleBack()` from `utils/backNavigation.ts`; history in `navigationStore`.
- Header content per route: `headerStore` + `layouts/Header.tsx` + `components/headerContent/`.
- Deep links: Capacitor App plugin; URL format `padelpulse://path` (mobile), `/path` (web).

## Authentication & Authorization

**Multi-provider auth:**
- Phone (OTP), Telegram (bot OTP), Apple Sign-In, Google OAuth
- `AuthProvider` enum tracks original auth method
- JWT tokens stored in `authStore` (localStorage persistence)

**Authorization middleware:**
- `auth.ts` middleware verifies JWT, attaches `req.user`
- IP geolocation tracking on auth (stores `latitudeByIP`, `longitudeByIP`)
- Admin/trainer/permissions: `isAdmin`, `isTrainer`, `canCreateTournament`, `canCreateLeague`

## Media & File Handling

**AWS S3 integration:**
- S3 service (`Backend/src/services/s3.service.ts`) handles uploads
- CloudFront CDN for delivery (`VITE_MEDIA_BASE_URL`)
- Sharp library for image optimization (resize, compress, format conversion)
- Media stored in arrays: `mediaUrls`, `thumbnailUrls` fields
- Avatar handling: `avatar` (optimized) + `originalAvatar` (full size)

**Frontend image handling:**
- Capacitor Camera plugin for mobile photo capture
- `react-easy-crop` for image cropping
- `dom-to-image` and `html2canvas` for screenshot generation

## Testing & Debugging

**Common debugging approaches:**
- Backend: Check `morgan` logs in console (HTTP request logging)
- Frontend: React DevTools, Redux DevTools (for Zustand)
- Socket events: Use Socket.IO admin UI or browser console logging
- Database: Use `npm run prisma:studio` for visual data inspection
- Mobile: Xcode console (iOS), Android Studio Logcat (Android)

**Error handling:**
- Backend uses `ApiError` class with HTTP status codes
- Frontend uses `toast` from `react-hot-toast` for user-facing errors
- Socket errors emit via `error` event to client

## Environment Variables

**Backend** (`.env` file):
```
DB_URL=postgresql://...
JWT_SECRET=...
AWS_S3_BUCKET=...
AWS_S3_REGION=...
TELEGRAM_BOT_TOKEN=...
APNS_KEY_ID=...
FCM_PROJECT_ID=...
```

**Frontend** (`.env` file):
```
VITE_API_BASE_URL=http://localhost:3000
VITE_MEDIA_BASE_URL=https://cdn.example.com
```

## Currency & Exchange Rates

**ExchangeRate model:**
- Stores conversion rates between any two `PriceCurrency` values
- Updated periodically from external API
- Used to display marketplace prices in user's preferred currency
- Fields: `baseCurrency`, `targetCurrency`, `rate`, `lastUpdated`, `fetchedFromAPI`

**User currency preferences:**
- User model has `defaultCurrency` field (defaults to EUR)
- Frontend converts prices for display using exchange rates
- Backend stores prices in original currency from seller

## Internationalization

- Supported languages: English (en), Spanish (es), Russian (ru), Serbian (sr)
- Locale files: `Frontend/src/i18n/locales/*.json`
- User language preference stored in User model (`language` field)
- Backend sends localized notifications based on user preference

## Mobile-Specific Considerations

**Capacitor plugins in use:**
- `@capacitor/camera` - Photo capture
- `@capacitor/geolocation` - GPS location
- `@capacitor/push-notifications` - Native push
- `@capacitor/keyboard` - Keyboard behavior control
- `@capacitor/network` - Network status monitoring
- `@capacitor/app` - Deep linking, app state
- `@capgo/capacitor-social-login` - Social auth

**Platform detection:**
- Use `Capacitor.getPlatform()` for iOS/Android/Web branching
- iOS-specific: Status bar handling, safe area insets
- Android-specific: Back button navigation

## Performance Optimization

**Frontend:**
- `@tanstack/react-virtual` for virtual scrolling in long lists
- `idb-keyval` for IndexedDB caching
- Service worker for offline support and caching
- Image lazy loading via native `loading="lazy"`

**Backend:**
- Database indexes on frequently queried fields (check schema.prisma)
- Prisma query optimization: use `select` to limit fields
- Socket room-based broadcasting (avoid broadcasting to all connections)

## Security Notes

- JWT tokens have expiration (verify expiry in `jwt.ts`)
- User blocking: `BlockedUser` model prevents interactions
- Message reporting: `MessageReport` for content moderation
- Rate limiting: `express-rate-limit` configured in routes
- Helmet.js for security headers
- CORS configured in `server.ts`

## Marketplace Feature

**Trade types:**
- BUY_IT_NOW - Fixed price purchase
- SUGGESTED_PRICE - Negotiable price
- AUCTION - Time-based bidding
- FREE - Free items (cannot be combined with other trade types, no price allowed)

**Item status:**
- ACTIVE → SOLD/RESERVED/WITHDRAWN

**Chat system:**
- Each MarketItem can have MULTIPLE GroupChannels (one per buyer)
- When a buyer shows interest, a private chat (GroupChannel) is created between seller and buyer
- GroupChannel has `buyerId` field to track which buyer the chat is for
- Marketplace chats have `isChannel: false` (they're private 1:1 chats, not public channels)
- Use `marketChatUtils.ts` helper functions for display titles
- Use `useGroupChannelUnreadCounts` hook for tracking unread messages in marketplace chats

**Currency & Pricing:**
- Items stored with `priceCents` (integer) and `currency` (PriceCurrency enum)
- `ExchangeRate` model tracks conversion rates between currencies
- FREE items must have `priceCents: null` or `0`
- BUY_IT_NOW requires a valid price
- AUCTION requires starting bid and end date

**Other features:**
- Category management in Admin dashboard
- City-scoped listings (with optional `additionalCityIds`)
- Seller notifications for buyer interest

## League System

**Structure:**
- League → LeagueSeason → LeagueGroup → LeagueRound → Game
- Participants can be users or teams (`LeagueParticipantType`)
- Automatic promotion/demotion between groups (`movePlayersRule`)
- Points, wins, ties, losses, score delta tracked per participant

## Betting System

**Bet types:**
- SOCIAL - One-on-one bet between two users
- POOL - Multiple participants on two sides (WITH_CREATOR, AGAINST_CREATOR)

**Stake/reward types:**
- COINS - In-app currency (wallet)
- TEXT - Free-form text description

**Status flow:**
- OPEN → ACCEPTED → RESOLVED/CANCELLED/NEEDS_REVIEW

## Code Style & Conventions

- TypeScript strict mode enabled. ESLint: `npm run lint` in Backend/Frontend.
- Backend: async/await; services throw `ApiError(statusCode, message)`; controllers use AsyncHandler.
- Frontend: functional components + hooks; Zustand with immer for updates.
- Naming: camelCase for vars/functions, PascalCase for components. Imports: external → internal → types → styles.

## File Lookup Quick Reference

- **Backend:** Routes `routes/*.routes.ts`, controllers `controllers/*.controller.ts`, services `services/<domain>/*.service.ts`, middleware `middleware/`, Prisma schema `prisma/schema.prisma`, env `config/env`.
- **Frontend:** Routes in `App.tsx`, URL schema `utils/urlSchema.ts`, nav `navigationService.ts`, back `utils/backNavigation.ts`, API `api/*.ts` + `api/index.ts`, stores `store/*.ts`, i18n `i18n/`.
- **Game UI:** Page `GameDetails.tsx` + `GameDetailsPage.tsx`, subcomponents `components/GameDetails/`.
- **Chat UI:** `GameChat.tsx` + `pages/GameChat/*`; list/channel UI in `components/chat/`.

## Common Pitfalls

1. **Chat context confusion**: Always check `chatContextType` before querying by `contextId`
2. **Socket room names**: Must match between client and server (e.g., `game:${gameId}`, `group:${channelId}`)
3. **Prisma relations**: Use `include` or `select` to load relations, never assume they're loaded
4. **Date handling**: Backend uses ISO strings, frontend uses `date-fns` for formatting
5. **Mobile navigation**: Use `navigationService` instead of direct `useNavigate()` for deep link support
6. **Game permissions**: Check `role` (OWNER/ADMIN/PARTICIPANT) before allowing operations
7. **Message delivery**: Don't assume Socket.IO delivery, always have push notification fallback
8. **Image URLs**: Always use `VITE_MEDIA_BASE_URL` prefix for S3 URLs in frontend
9. **User blocking**: Check `BlockedUser` relationship before sending messages
10. **Level changes**: Only games with `affectsRating: true` modify user levels
11. **Marketplace chats**: Each buyer gets a separate GroupChannel - don't assume one channel per item
12. **FREE trade type**: Cannot be combined with other trade types and must have no price
13. **Currency handling**: Always store prices in original currency with `priceCents` (integer), convert for display only
14. **GroupChannel types**: `isChannel: false` for marketplace/bug chats (private), `true` for community channels (public)
15. **Navigation**: Use `urlSchema.ts` (parseLocation, buildUrl, Place) and `navigationService`; `navigationRoutes.ts` is deprecated
16. **New page**: Add route in App.tsx, add Place and pattern in urlSchema.ts PLACE_DEFS (order matters), then implement page and optional headerContent
