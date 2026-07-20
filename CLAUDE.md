# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of Contents

1. [Development Environment](#development-environment)
2. [Project Structure](#project-structure)
3. [Common Commands](#common-commands)
4. [Database & Prisma](#database--prisma)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Key Architectural Patterns](#key-architectural-patterns)
8. [Authentication & Authorization](#authentication--authorization)
9. [Real-time Features](#real-time-features)
10. [Chat System](#chat-system)
11. [Sport Registry & Multisport](#sport-registry--multisport)
12. [League System](#league-system)
13. [Live Scoring & Results](#live-scoring--results)
14. [Testing](#testing)
15. [Code Standards](#code-standards)
16. [Mobile App (Capacitor)](#mobile-app-capacitor)
17. [Shared Code](#shared-code)
18. [API Patterns](#api-patterns)
19. [Error Handling](#error-handling)
20. [Deployment Considerations](#deployment-considerations)

---

## Development Environment

- **Node.js version**: 24 (enforced by `.nvmrc`)
- **Package manager**: npm 11+
- **TypeScript**: 6.0.3 (Backend), 5.2.2 (Frontend)
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Mobile**: Capacitor 8

---

## Project Structure

This is a monorepo for **PadelPulse** - a multisport game scheduling app (padel, tennis, table tennis, badminton, pickleball, squash).

```
PadelPulse/
├── Backend/              # Express + TypeScript API, Prisma ORM, Socket.IO
│   ├── src/
│   │   ├── app.ts       # Express app configuration
│   │   ├── server.ts    # Server entry with schedulers and Socket.IO
│   │   ├── config/      # Environment config, database connection
│   │   ├── controllers/ # Route handlers (55+ controllers)
│   │   ├── middleware/  # Auth, error handling, CORS
│   │   ├── routes/      # API route definitions (45+ route files)
│   │   ├── services/    # Business logic (78+ services)
│   │   ├── utils/       # Utilities, helpers
│   │   ├── sport/       # Sport registry and configurations
│   │   ├── workers/     # Background queue workers
│   │   └── prisma/      # Database schema and migrations
│   ├── prisma/
│   │   └── schema.prisma # PostgreSQL schema
│   ├── package.json
│   └── tsconfig.json
│
├── Frontend/             # React + Vite, Capacitor (mobile), Zustand, React Query
│   ├── src/
│   │   ├── App.tsx      # Main app component
│   │   ├── main.tsx     # Entry point
│   │   ├── api/         # API client functions (50+ modules)
│   │   ├── components/  # React components (180+ files)
│   │   ├── hooks/       # Custom React hooks (100+ hooks)
│   │   ├── pages/       # Route pages
│   │   ├── queries/     # React Query hooks
│   │   ├── store/       # Zustand stores
│   │   ├── services/    # Frontend services (chat, push, etc.)
│   │   ├── utils/       # Utilities
│   │   ├── sport/       # Sport registry and configs
│   │   ├── liveScoring/ # Live scoring rules
│   │   ├── layouts/     # Layout components
│   │   ├── i18n/        # Internationalization
│   │   ├── types/       # TypeScript types
│   │   └── contexts/    # React contexts
│   ├── capacitor.config.ts
│   ├── vite.config.ts
│   ├── playwright.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── packages/
│   └── chat-contract/   # Shared chat sync protocol types
│       └── src/
│           ├── chatSyncEventType.ts
│           └── index.ts
│
├── Admin/                # Plain JS admin panel (no build)
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── docs/
│   ├── adr/            # Architecture Decision Records
│   └── *.md            # Various planning docs
│
├── .cursor/rules/       # Cursor AI rules
├── .nvmrc              # Node version
└── CLAUDE.md           # This file
```

---

## Common Commands

### Backend

```bash
cd Backend

# Development
npm run dev              # Start dev server with nodemon (port 3000)
npm run worker          # Start worker process

# Building
npm run build            # Build TypeScript (runs prebuild: contract & shared)
npm run start            # Run production server

# Prisma
npm run prisma:generate  # Generate Prisma client after schema changes
npm run prisma:migrate   # Create migration (uses auto-generation)
npm run prisma:studio    # Open Prisma Studio UI

# Code quality
npm run lint             # ESLint check

# Testing
npm run test:automated   # Run automated backend tests
npm run test:bracket-structure # Run league bracket tests
npm run test:game-results-artifacts # Run results artifact tests

# Scripts/Backfill
npm run backfill:*       # Various data migration scripts
```

### Frontend

```bash
cd Frontend

# Development
npm run dev              # Start Vite dev server (port 3001)

# Building
npm run build            # Build production bundle
npm run postbuild        # Force service worker version bump
npm run preview          # Preview production build

# Code quality
npm run lint             # ESLint check

# E2E Testing (Playwright)
npm run test:e2e         # Run all E2E tests
npm run test:e2e:ui      # Run E2E with UI
npm run test:e2e:guest   # Run guest-only E2E tests
npm run test:e2e:auth    # Run authenticated E2E tests
npm run test:e2e:two-user # Run multi-user E2E tests
npm run test:e2e:report  # Show Playwright report

# Unit Testing (Vitest)
npm run test:live-scoring   # Test live scoring logic
npm run test:game-invite    # Test game invite logic
npm run test:group-channel  # Test group channel participation
npm run test:queries        # Test React Query hooks
npm run test:chat-inbox-feed # Test chat inbox logic
npm run test:chat-outbox    # Test chat outbox logic
npm run test:stories        # Test story creation/viewing

# Service Worker
npm run increment-sw    # Increment service worker cache version
```

### Root

```bash
npm run build:contract   # Build @bandeja/chat-contract package
npm run test:contract    # Test contract parity
```

### Quick Start (Full Stack)

```bash
# Terminal 1 - Backend
cd Backend && npm run dev

# Terminal 2 - Frontend
cd Frontend && npm run dev

# For E2E tests
cd Frontend && npm run test:e2e:auth
```

---

## Database & Prisma

### Schema Location
`Backend/prisma/schema.prisma` - Complete PostgreSQL schema

### Key Models

#### Core Models
- **User** - User accounts, preferences, sport profiles, wallet
- **City** - Geographic locations with timezone
- **Club** - Sports clubs, courts, integration config
- **Court** - Individual courts within clubs
- **Game** - Game events, participants, results
- **GameParticipant** - Participants with status (GUEST, INVITED, IN_QUEUE, PLAYING, NON_PLAYING)
- **GameTeam**, **GameTeamPlayer** - Fixed team structures

#### Chat Models
- **ChatMessage** - Messages with reactions, replies
- **GroupChannel** - Group chats (city groups, game chats, DMs)
- **UserChat** - DM relationships
- **MessageReaction**, **MessageReadReceipt**
- **ChatDraft**, **ChatMutationIdempotency**

#### League Models
- **League** - Leagues with sport, format, brackets
- **LeagueGroup**, **LeagueRound** - Group and round structure
- **LeagueBracketSlot** - Playoff bracket slots
- **LeagueParticipant** - League participants

#### Results Models
- **Round**, **Match** - Match structure within games
- **RoundOutcome**, **GameOutcome** - Result tracking
- **LevelChangeEvent** - Rating changes

### Important Enums

```prisma
enum Sport {
  PADEL, TENNIS, TABLE_TENNIS, BADMINTON, PICKLEBALL, SQUASH
}

enum GameStatus {
  ANNOUNCED, SCHEDULED, READY, PLAYING, FINISHED, ARCHIVED
}

enum ParticipantStatus {
  GUEST, INVITED, IN_QUEUE, PLAYING, NON_PLAYING
}

enum EntityType {
  GAME, LEAGUE, TRAINING, BUG
}
```

### Migration Rules

**CRITICAL**: PostgreSQL `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction as the new enum value.

Split into two migration files:

```bash
# Migration 1: Add the enum value
npx prisma migrate dev --name add_new_enum_value

# Migration 2: Use the enum value in your model
npx prisma migrate dev --name use_new_enum_value
```

Or use auto-generation:

```bash
npm run prisma:migrate  # Uses auto-create
```

### Common Prisma Operations

```bash
# Generate client after schema changes
npm run prisma:generate

# Open Prisma Studio (GUI)
npm run prisma:studio

# Deploy migrations to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset

# Format schema
npx prisma format
```

### Important Database Patterns

1. **Trainer Identification**: Use `Game.trainerId` (FK to User), NOT participant flags
2. **Slot Counting**: Only `status === 'PLAYING'` counts toward slots
3. **Parent Games**: Games can have `parentId` for league sub-games
4. **Soft Deletes**: Use `isActive: false` pattern instead of hard deletes
5. **JSON Fields**: Used for flexible metadata (e.g., `weeklyAvailability`, `photos`)

---

## Backend Architecture

### Technology Stack
- **Framework**: Express 5
- **Language**: TypeScript 6.0.3
- **ORM**: Prisma 7.8
- **Database**: PostgreSQL
- **Real-time**: Socket.IO 4.8 with Redis adapter
- **Cache**: Redis 6
- **File Storage**: AWS S3
- **Background Jobs**: Custom queue workers + node-cron

### Entry Point

`Backend/src/server.ts` - Initializes:
- Express app from `app.ts`
- Database connection
- Socket.IO with Redis adapter
- Telegram bot
- Push notification service
- Cron schedulers (GameStatus, Currency, League, etc.)
- Queue workers (Translation, GameResultsArtifact)

### Request Flow

```
Request → CORS → Helmet → Compression → Morgan → Rate Limit → 
  middleware (auth, presence) → Route → Controller → Service → 
  Prisma → Database → Response
```

### Directory Structure

```
src/
├── app.ts                 # Express app setup, middleware config
├── server.ts              # Server initialization, schedulers
├── config/
│   ├── database.ts        # Prisma client singleton
│   └── env.ts             # Environment variables
├── controllers/           # Route handlers (55+)
│   ├── auth.controller.ts
│   ├── game.controller.ts
│   ├── chat.controller.ts
│   └── ...
├── routes/
│   ├── index.ts           # Route aggregator
│   ├── auth.routes.ts
│   ├── game.routes.ts
│   └── ...
├── services/              # Business logic (78+)
│   ├── auth/
│   ├── chat/
│   ├── game/
│   ├── league/
│   ├── results/
│   └── ...
├── middleware/
│   ├── auth.ts            # JWT authentication
│   ├── authToken.ts       # Token utilities
│   ├── errorHandler.ts    # Error response handler
│   ├── recordPresenceActivity.ts
│   └── validate.ts
├── utils/
│   ├── ApiError.ts        # Custom error class
│   └── ...
├── sport/
│   ├── sportRegistry.ts   # Sport configurations
│   ├── playtomicSport.ts
│   └── ...
└── workers/
    └── startQueueWorkers.ts
```

### Controllers Pattern

Controllers are lightweight and delegate to services:

```typescript
// controllers/game.controller.ts
export const createGame = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const gameData = req.body;
    const game = await GameService.create(gameData, req.userId);
    res.json({ success: true, game });
  } catch (error) {
    next(error);
  }
};
```

### Services Pattern

Services contain business logic and database operations:

```typescript
// services/game/create.service.ts
export async function createGame(data: CreateGameDto, userId: string): Promise<Game> {
  const game = await prisma.game.create({
    data: { ...data, userId },
    include: { participants: true }
  });
  return game;
}
```

### Route Definition

```typescript
// routes/game.routes.ts
router.post('/', authenticate, gameController.createGame);
router.get('/:gameId', authenticate, gameController.getGame);
router.patch('/:gameId', authenticate, canEditGame, gameController.updateGame);
```

---

## Frontend Architecture

### Technology Stack
- **Framework**: React 19
- **Build Tool**: Vite 8
- **Routing**: React Router v7
- **State Management**: Zustand (global) + React Query (server state)
- **Styling**: Tailwind CSS 4
- **Forms**: Controlled components with validation
- **HTTP**: Axios with interceptors
- **Mobile**: Capacitor 8 (iOS/Android)

### Directory Structure

```
src/
├── App.tsx               # Main app component
├── main.tsx              # Entry point, service worker setup
├── index.css             # Global styles, Tailwind directives
├── api/                  # API client functions (50+ modules)
│   ├── games.ts
│   ├── chat.ts
│   ├── auth.ts
│   └── index.ts
├── components/           # React components (180+ files)
│   ├── chat/            # Chat components
│   ├── GameDetails/     # Game details sub-components
│   ├── liveScoring/     # Live scoring components
│   ├── createGame/      # Game creation wizard
│   └── ...
├── hooks/                # Custom React hooks (100+ hooks)
│   ├── useAvailableGames.ts
│   ├── useLiveMatchController.ts
│   ├── useChatAutoTranslateConfig.ts
│   └── ...
├── pages/                # Route pages
│   ├── MainPage.tsx
│   ├── GameDetailsShell.tsx
│   ├── Login.tsx
│   └── ...
├── queries/              # React Query hooks
│   ├── queryKeys.ts      # Query key factory
│   ├── queryClient.ts    # Query client config
│   └── games/            # Game-specific queries
├── store/                # Zustand stores
│   ├── authStore.ts
│   ├── playersStore.ts
│   ├── unreadStore.ts
│   └── ...
├── services/             # Frontend services
│   ├── chat/            # Chat sync, local db
│   ├── pushNotificationService.ts
│   └── ...
├── utils/                # Utilities
│   ├── capacitor.ts
│   ├── keyboardLayout.ts
│   └── ...
├── sport/                # Sport registry
│   ├── sportRegistry.ts
│   ├── createFlow.ts
│   └── ...
├── liveScoring/          # Live scoring rules
│   └── registry.ts
├── layouts/              # Layout components
├── i18n/                 # Internationalization
│   ├── config.ts
│   └── locales/          # Translation files
├── types/                # TypeScript types
└── contexts/             # React contexts
```

### Component Structure

**Atomic-ish design**:
- Base components: `Button`, `Input`, `Card`, `Modal`
- Domain components: `GameCard`, `PlayerAvatar`, `ChatMessageItem`
- Page components: `GameDetailsShell`, `MainPage`
- Feature components: `CreateGame`, `LeagueBracketView`

### State Management

**Zustand** (client state):
```typescript
// store/authStore.ts
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
}));
```

**React Query** (server state):
```typescript
// queries/games/useGameQuery.ts
export function useGameQuery(gameId: string) {
  return useQuery({
    queryKey: queryKeys.games.detail(gameId),
    queryFn: () => api.games.get(gameId),
    enabled: !!gameId,
  });
}
```

### Routing

**React Router v7** with URL state:

```typescript
// pages/MainPage.tsx
export function MainPage() {
  const navigate = useNavigate();
  const searchParams = useSearchParams();

  const handleGameClick = (gameId: string) => {
    navigate(`/games/${gameId}`);
  };
}
```

### API Client Pattern

**Axios with interceptors**:

```typescript
// api/httpClient.ts
export const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: !isCapacitor(),
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**Typed API functions**:

```typescript
// api/games.ts
export async function getGame(gameId: string): Promise<Game> {
  const { data } = await api.get(`/games/${gameId}`);
  return data.game;
}
```

---

## Key Architectural Patterns

### 1. Monorepo Shared Code

**Backend imports frontend shared modules**:

```typescript
// Backend/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../Frontend/shared/*"]
    }
  }
}

// Backend/src/sport/sportRegistry.ts
import { CREATE_TEMPLATES } from '@shared/createTemplates';
```

### 2. Registry Pattern

**Sport Registry** - Centralized sport configuration:

```typescript
// Backend/src/sport/sportRegistry.ts
export const SPORT_CONFIGS: Record<Sport, SportConfig> = {
  PADEL: {
    name: 'Padel',
    scoringPresets: [...],
    createTemplates: [...],
  },
  TENNIS: { ... },
};
```

### 3. Service Layer Pattern

**Controller → Service → Prisma**:

```typescript
// Controller: HTTP request handling
// Service: Business logic, orchestration
// Prisma: Data access
```

### 4. Optimistic Updates

**Frontend UI updates immediately, rolls back on error**:

```typescript
const mutation = useMutation({
  mutationFn: api.games.update,
  onMutate: async (newData) => {
    await queryClient.cancelQueries(['games']);
    queryClient.setQueryData(['games', id], newData);
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['games', id], context.previousData);
  },
});
```

### 5. Event-Driven Chat Sync

**Socket.IO + IndexedDB**:

```
User sends message → Local DB (optimistic) → API → 
  Socket broadcast → Other clients receive → Apply to local DB
```

### 6. Background Workers

**Dedicated worker processes**:

```typescript
// Backend/src/workers/startQueueWorkers.ts
export function startQueueWorkers(): void {
  TranslationQueueService.startWorker();
  GameResultsArtifactQueueService.startWorker();
}
```

---

## Authentication & Authorization

### Backend

**JWT with refresh tokens**:

```typescript
// Middleware usage
router.post('/games', authenticate, createGame);
router.delete('/games/:id', authenticate, canEditGame, deleteGame);
```

**Auth middleware** (`Backend/src/middleware/auth.ts`):

- `authenticate` - Requires valid JWT, populates `req.userId`
- `optionalAuth` - Attaches user if token present
- `requireAdmin` - Requires admin role
- `requireGamePermission` - Game-based authorization
- `requireCanModifyResults` - Results modification check
- `requireClubAdmin` - Club admin check

**Permission functions**:

```typescript
// Can edit game (owner/admin)
canEditGame = requireGamePermission([OWNER, ADMIN]);

// Can access game (owner/admin/participant)
canAccessGame = requireGamePermission([OWNER, ADMIN, PARTICIPANT]);

// Can edit including archived games
canEditGameIncludingArchived = requireGamePermission([OWNER, ADMIN], { allowArchived: true });
```

### Frontend

**Auth store** (`Frontend/src/store/authStore.ts`):

```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  login: (credentials) => { ... },
  logout: () => { ... },
}));
```

**Protected routes**:

```typescript
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}
```

---

## Real-time Features

### Socket.IO Setup

**Backend** (`Backend/src/services/socket.service.ts`):

```typescript
class SocketService {
  private io: Server;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      adapter: createRedisAdapter({ host, port }),
      cors: { origin: true, credentials: true },
    });
  }

  // Join a game room
  joinGameRoom(userId: string, gameId: string) {
    this.io.to(`user:${userId}`).socketsJoin(`game:${gameId}`);
  }

  // Emit to game room
  emitToGame(gameId: string, event: string, data: unknown) {
    this.io.to(`game:${gameId}`).emit(event, data);
  }
}
```

**Frontend** (`Frontend/src/store/socketEventsStore.ts`):

```typescript
export const useSocketEventsStore = create((set, get) => ({
  connect: () => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('game:updated', (data) => {
      // Handle game update
    });

    socket.on('chat:message', (data) => {
      // Handle new message
    });
  },
}));
```

### Common Socket Events

- `game:updated` - Game state changes
- `game:participant_updated` - Participant changes
- `chat:message` - New chat message
- `chat:typing` - Typing indicator
- `presence:user_online` - User came online
- `presence:user_offline` - User went offline

### Rooms

- `game:{gameId}` - All participants in a game
- `user:{userId}` - User's personal room
- `league:{leagueId}` - League participants
- `chat:{threadId}` - Chat thread participants

---

## Chat System

The chat system is a complex, offline-first real-time messaging system.

### Backend (`Backend/src/services/chat/`)

**Core Services**:
- `message.service.ts` - CRUD, search, media handling (25k lines)
- `groupChannel.service.ts` - City groups, game chats, DMs (37k lines)
- `chatSyncEvent.service.ts` - Event-based sync protocol
- `chatAutoTranslate.service.ts` - Translation queue integration
- `chatListRowPreview.service.ts` - Message previews
- `chatReadCursor.service.ts` - Read position tracking
- `pinnedMessage.service.ts` - Pinned messages
- `reaction.service.ts` - Message reactions

**Key Operations**:

```typescript
// Send message
await MessageService.sendMessage(userId, threadId, content, attachments);

// Get thread
const thread = await MessageService.getThread(threadId, cursor);

// Search messages
const results = await MessageSearchService.search(query, userId);
```

### Frontend (`Frontend/src/services/chat/`)

**Architecture**:

- `chatLocalDb.ts` - IndexedDB (Dexie) for offline storage
- `chatThreadIndex.ts` - Thread list management
- `chatSyncFetchWorkerClient.ts` - Background sync worker
- `chatOutboxEnqueue.ts` - Optimistic send queue
- `chatSendCoordinator.ts` - Send orchestration
- `unreadSnapshot.ts` - Unread count coordination
- `chatVideoTranscode.ts` - Video compression
- `threadSession.ts` - Thread session management

**Message Flow**:

```
User types → Message added to outbox → Optimistic UI update → 
  Send to API → Socket broadcast → 
  Update local DB → Mark read → Unread count update
```

**Offline Support**:

- Messages stored in IndexedDB
- Sync when back online
- Read receipts queued
- Media uploads retry on failure

**Chat Components** (`Frontend/src/components/chat/`):

- `MessageList.tsx` - Virtualized message list
- `MessageInput.tsx` - Rich input with mentions, media
- `ChatThreadController` - Thread state management
- `ChatParticipantsModal.tsx` - Participant list

### Sync Protocol

**Shared in `packages/chat-contract/`**:

```typescript
// chatSyncEventType.ts
export type ChatSyncEventType =
  | 'MESSAGE_CREATE'
  | 'MESSAGE_UPDATE'
  | 'MESSAGE_DELETE'
  | 'REACTION_ADD'
  | 'REACTION_REMOVE'
  | 'READ_CURSOR_UPDATE';
```

---

## Sport Registry & Multisport

### Backend (`Backend/src/sport/`)

**Sport Registry** (`sportRegistry.ts`):

```typescript
export const SPORT_CONFIGS: Record<Sport, SportConfig> = {
  PADEL: {
    id: 'PADEL',
    name: 'Padel',
    createTemplates: [
      'PADEL_BEST_OF_3',
      'PADEL_AMERICANO',
      // ...
    ],
    ratingModel: 'ELO',
    defaultScoring: 'CLASSIC_BEST_OF_3',
  },
  TENNIS: { ... },
  BADMINTON: { ... },
  PICKLEBALL: { ... },
  TABLE_TENNIS: { ... },
  SQUASH: { ... },
};
```

### Frontend (`Frontend/src/sport/`)

**Sport Registry** (`sportRegistry.ts`):

```typescript
export const SPORT_REGISTRY: Record<Sport, SportMeta> = {
  PADEL: {
    icon: '/icons/sports/padel.svg',
    color: '#10b981',
    createTemplates: [ /* same as backend */ ],
  },
  // ...
};
```

### Shared Templates

**`Frontend/shared/createTemplates.ts`** - Imported by both tiers:

```typescript
export interface CreateTemplate {
  id: string;
  sport: Sport;
  tier: 'MATCH' | 'SOCIAL' | 'TOURNAMENT';
  scoringPreset: ScoringPreset;
  gameType: GameType;
  matchGenerationType: MatchGenerationType;
  playersPerMatch: number;
  affectsRating: boolean;
  // ...
}

export const CREATE_TEMPLATES: Record<string, CreateTemplate> = {
  PADEL_BEST_OF_3: { ... },
  PADEL_AMERICANO: { ... },
  // ...
};
```

### Scoring Presets

**`Backend/src/services/results/liveScoringEngine/rulebook.ts`**:

```typescript
export type ScoringPreset =
  | 'CLASSIC_BEST_OF_3'
  | 'CLASSIC_BEST_OF_5'
  | 'POINTS_21'
  | 'BEST_OF_3_21'
  | 'TIMED'
  | 'CUSTOM';

export interface ScoringRules {
  preset: ScoringPreset;
  ballsInGames: boolean;
  fixedNumberOfSets: number;
  minSetsToWin: number;
  maxSetsPlayed: number;
  // ...
}

export function getScoringRules(preset: ScoringPreset, sport: Sport): ScoringRules {
  // Returns rules for the preset/sport combo
}
```

### Live Scoring Registry

**`Frontend/src/liveScoring/registry.ts`**:

```typescript
export interface LiveScoringRules {
  sport: Sport;
  preset: ScoringPreset;
  serveRules: ServeRules;
  scoreFormat: ScoreFormat;
  winCondition: WinCondition;
}
```

---

## League System

### Backend (`Backend/src/services/league/`)

**Core Services**:
- `create.service.ts` - League creation (48k lines)
- `bracketPlayoff.service.ts` - Bracket structure, seeding, advancement (51k lines)
- `bracketStructure.ts` - Bracket logic (22k lines)
- `groups.service.ts` - Group management
- `sync.service.ts` - Standings recalculation
- `planner.service.ts` - League planning UI

**Generation Algorithms** (`Backend/src/services/results/generation/`):

- `roundRobin.ts` - Round-robin scheduling
- `random.ts` - Random pairing (23k lines)
- `kingOfTheCourt.ts` - King of the Court format
- `winnersCourt.ts` - Winners Court format (34k lines)
- `escalera.ts` - Escalera format (35k lines)

**League Structure**:

```typescript
interface League {
  id: string;
  sport: Sport;
  format: 'ROUND_ROBIN' | 'PLAYOFF' | 'TOURNAMENT';
  groups: LeagueGroup[];
  rounds: LeagueRound[];
  participants: LeagueParticipant[];
  bracketSlots: LeagueBracketSlot[];
}
```

### Frontend

**Pages**:
- `LeagueBracketFullscreenPage.tsx` - Playoff bracket view
- `LeagueFixtureTableFullscreenPage.tsx` - Schedule table
- `LeaguePlannerTab.tsx` - Planning interface

**Components** (`Frontend/src/components/GameDetails/`):
- `LeagueBracketView.tsx` - Bracket visualization
- `LeagueFixtureMatrix.tsx` - Schedule grid
- `LeagueStandingsTab.tsx` - Standings table
- `LeagueScheduleTab.tsx` - Schedule management

---

## Live Scoring & Results

### Backend (`Backend/src/services/results/`)

**Core Services**:
- `liveScoringEngine/rulebook.ts` - Scoring rules per preset
- `matchLiveScoring.service.ts` - Live scoring persistence (14k lines)
- `calculator.service.ts` - Rating calculation (20k lines)
- `outcomes.service.ts` - Match outcome determination (22k lines)
- `matchTimer.service.ts` - Per-match timers (11k lines)
- `results.service.ts` - Results CRUD (25k lines)

**Outcome Explanation** (`outcomeExplanation.service.ts`):

```typescript
export interface OutcomeExplanation {
  winner: string;
  reason: string;
  sets: SetOutcome[];
  points: PointsBreakdown;
}

export function explainOutcome(game: Game, results: Match[]): OutcomeExplanation {
  // Returns human-readable explanation of why the match ended as it did
}
```

### Frontend

**Live Scoring Rules** (`Frontend/src/liveScoring/registry.ts`):

```typescript
export interface LiveScoringRules {
  sport: Sport;
  preset: ScoringPreset;
  serveRules: ServeRules;
  scoreFormat: ScoreFormat;
  winCondition: WinCondition;
}
```

**Components** (`Frontend/src/components/liveScoring/`):
- Live scoring court visualization
- Score input panels
- Timer controls
- Serve tracking

---

## Testing

### E2E Tests (Playwright)

**Config**: `Frontend/playwright.config.ts`

**Projects**:
- `guest` - Unauthenticated flows
- `login` - Authentication flows
- `authenticated` - Logged-in user flows
- `desktop` - Desktop viewport
- `two-user` - Multi-user scenarios
- `games-guest` - Public game viewing

**Test Categories**:
```
Frontend/e2e/specs/
├── smoke/           # Smoke tests
├── auth/            # Authentication
├── home/            # Home page
├── find/            # Find games
├── chats/           # Chat flows
├── games/           # Game management
├── profile/         # User profile
├── marketplace/     # Marketplace
├── two-user/        # Multi-user tests
└── cross-cutting/   # Cross-feature tests
```

**Running E2E tests**:

```bash
# All tests
npm run test:e2e

# Specific project
npm run test:e2e:guest
npm run test:e2e:auth
npm run test:e2e:two-user

# With UI
npm run test:e2e:ui

# Show report
npm run test:e2e:report
```

**Test patterns**:

```typescript
// e2e/specs/games/game-details.spec.ts
test('should display game details', async ({ page }) => {
  await page.goto(`/games/${gameId}`);
  await expect(page.getByTestId('game-details')).toBeVisible();
});
```

### Frontend Unit Tests (Vitest)

**Targeted test scripts**:

```bash
npm run test:live-scoring      # Live scoring logic
npm run test:game-invite       # Game invite logic
npm run test:group-channel     # Group channel logic
npm run test:queries           # React Query hooks
npm run test:chat-inbox-feed   # Chat inbox
npm run test:chat-outbox       # Chat outbox
npm run test:stories           # Story features
```

**Test locations**:
- `Frontend/src/utils/*.test.ts` - Utility tests
- `Frontend/src/sport/*.test.ts` - Sport registry tests
- `Frontend/src/queries/*.test.ts` - Query tests
- `Frontend/src/liveScoring/*.test.ts` - Live scoring tests

### Backend Tests

**Automated test suite**:

```bash
npm run test:automated
```

**Test locations**:
- `Backend/src/services/**/*.test.ts` - Service tests
- `Backend/scripts/tests/` - Integration tests
- `Backend/src/shared/*.test.ts` - Shared module tests

---

## Code Standards

### ESLint (from Cursor rules)

**File**: `.cursor/rules/eslint-standards.mdc`

```markdown
- Never add `eslint-disable` comments
- Fix the underlying lint issue instead
- Never leave unused variables, imports, or parameters
- Remove them or use them; prefix with `_` only when truly unused
```

**Examples**:

```typescript
// ❌ DON'T
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unused = 123;

// ✅ DO
const used = 123;

// ✅ OR (if signature requires it)
function handler(_unused: string) {
  // ...
}
```

### Migrations (from Cursor rules)

**File**: `.cursor/rules/migration-rule.mdc`

```markdown
Avoid (if possible) creating custom migration files
Use 'npx prisma migrate dev' to auto-create it
```

### TypeScript

**Backend**: Strict mode enabled
**Frontend**: Strict mode enabled

**Type imports**:

```typescript
// Use type imports for types only
import type { Game } from '@shared/types';

// Default import for values
import { GAME_CONFIG } from '@shared/config';
```

### Naming Conventions

- **Files**: `kebab-case.ts` for utilities, `PascalCase.tsx` for components
- **Components**: `PascalCase`
- **Hooks**: `useCamelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

---

## Mobile App (Capacitor)

### Configuration

**File**: `Frontend/capacitor.config.ts`

```typescript
export default defineConfig({
  appId: 'com.bandeja.app',
  appName: 'Bandeja',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    Camera: { permissions: ['camera', 'photos'] },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
});
```

### Capacitor Utilities

**File**: `Frontend/src/utils/capacitor.ts`

```typescript
import { isCapacitor, isIOS, isAndroid } from '@/utils/capacitor';

// Platform checks
if (isCapacitor()) {
  // Running in native app
}

if (isIOS()) {
  // iOS-specific code
}
```

### Keyboard Handling

**File**: `Frontend/src/utils/keyboardLayout.ts`

```typescript
import { resolveKeyboardLayoutMode, isKeyboardLikelyVisible } from '@/utils/keyboardLayout';

// Determine how layout should adjust for keyboard
const layoutMode = resolveKeyboardLayoutMode();
```

### Push Notifications

**Service**: `Frontend/src/services/pushNotificationService.ts`

```typescript
pushNotificationService.initialize();
pushNotificationService.requestPermission();
```

### Capacitor Plugins Used

- `@capacitor/camera` - Photo capture
- `@capacitor/filesystem` - File storage
- `@capacitor/geolocation` - Location
- `@capacitor/local-notifications` - Push notifications
- `@capacitor/share` - Share sheet
- `@capacitor/keyboard` - Keyboard events
- `@capacitor/network` - Network status
- `@capacitor/app` - App lifecycle

---

## Shared Code

### Frontend Shared

**Location**: `Frontend/shared/`

**Modules**:
- `createTemplates.ts` - Game creation templates (22k lines)
- `gameFormat/` - Game format logic
- `booking/` - Booking utilities
- `officiatingLevel.ts` - Officiating requirements
- `rotationFormats.ts` - Rotation formats
- `strictValidation.ts` - Scoring validation
- `timedCustomPresets.ts` - Timed game presets

**Backend imports**:

```typescript
// Backend/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../Frontend/shared/*"]
    }
  }
}

// Backend/src/sport/sportRegistry.ts
import { CREATE_TEMPLATES } from '@shared/createTemplates';
```

### Chat Contract

**Location**: `packages/chat-contract/`

**Purpose**: Shared TypeScript types for chat sync protocol

**Build**:

```bash
npm run build:contract
npm run test:contract
```

---

## API Patterns

### Response Format

**Success**:

```json
{
  "success": true,
  "game": { ... }
}
```

**Error**:

```json
{
  "success": false,
  "message": "Game not found",
  "code": "game.notFound"
}
```

### Error Handling

**Backend** (`Backend/src/utils/ApiError.ts`):

```typescript
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  data?: Record<string, unknown>;

  constructor(statusCode: number, message: string, isOperational = true, data?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

**Throwing errors**:

```typescript
if (!game) {
  throw new ApiError(404, 'Game not found', true, { code: 'game.notFound' });
}

if (!hasPermission) {
  throw new ApiError(403, 'You do not have permission', true, { code: 'auth.forbidden' });
}
```

### Pagination

**Request**:

```
GET /games?page=1&limit=20
```

**Response**:

```json
{
  "success": true,
  "games": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

---

## Error Handling

### Global Error Handler

**Backend** (`Backend/src/middleware/errorHandler.ts`):

```typescript
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.data && { ...err.data }),
    });
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      success: false,
      message: 'File too large',
    });
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};
```

### Frontend Error Handling

**API errors**:

```typescript
// api/handleApiUnauthorized.ts
export function handleUnauthorized(error: unknown) {
  if (isAxiosError(error) && error.response?.status === 401) {
    // Clear auth and redirect to login
    useAuthStore.getState().logout();
    window.location.href = '/login';
  }
}
```

**Component error boundaries**:

```typescript
// components/NavigationErrorBoundary.tsx
export function NavigationErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={<NavigationErrorFallback />}
      onError={(error) => console.error('Navigation error:', error)}
    >
      {children}
    </ErrorBoundary>
  );
}
```

---

## Deployment Considerations

### Environment Variables

**Backend** (`.env`):
```
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=...
```

**Frontend** (`.env`):
```
VITE_API_BASE_URL=https://api.example.com
VITE_SOCKET_URL=wss://api.example.com
VITE_GOOGLE_CLIENT_ID=...
VITE_APPLE_CLIENT_ID=...
```

### Build Process

**Backend**:

```bash
cd Backend
npm run build  # Compiles TypeScript to dist/
npm run start  # Runs dist/server.js
```

**Frontend**:

```bash
cd Frontend
npm run build  # Vite build to dist/
```

### Health Check

```bash
curl https://api.example.com/health
```

Response:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "version": "1.0.0"
}
```

### Graceful Shutdown

**Backend** (`Backend/src/server.ts`):

```typescript
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received. Starting graceful shutdown...`);

  await socketService.close();
  server.close(async () => {
    // Stop all schedulers
    gameStatusScheduler.stop();
    // Stop workers
    stopQueueWorkers();
    // Disconnect database
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## Additional Resources

### Architecture constraints

**Location**: `docs/APP_FUNCTIONALITY.md` §2.2

Load-bearing “do not simplify” rules (templates vs league, PADEL level mirror, occupancy, booking ports, chat live projection). No separate ADR folder.

### Important Patterns Reference

1. **Trainer Identification**: `Game.trainerId` (FK to User), NOT participant flags
2. **Slot Counting**: Only `status === 'PLAYING'` counts toward slots
3. **Enum Migrations**: Split into two files for PostgreSQL `ALTER TYPE`
4. **No ESLint disables**: Fix underlying issues instead
5. **Auto migrations**: Prefer `prisma migrate dev` over custom files
6. **Shared templates**: Use `@shared/createTemplates` for FE/BE sync
7. **Optimistic updates**: Apply locally, rollback on error
8. **Socket rooms**: `game:{id}`, `user:{id}`, `chat:{threadId}`

### Quick Reference Commands

```bash
# Development
cd Backend && npm run dev
cd Frontend && npm run dev

# Database
cd Backend && npm run prisma:generate
cd Backend && npm run prisma:migrate

# Testing
cd Frontend && npm run test:e2e:auth
cd Backend && npm run test:automated

# Build
cd Frontend && npm run build
cd Backend && npm run build
```

---

## Common Tasks

### Adding a New Sport

1. Add to `Sport` enum in `schema.prisma`
2. Add config to `Backend/src/sport/sportRegistry.ts`
3. Add config to `Frontend/src/sport/sportRegistry.ts`
4. Add scoring presets to rulebook
5. Add create templates to shared `createTemplates.ts`
6. Update ADRs if needed

### Adding a New API Endpoint

1. Create service method in `Backend/src/services/`
2. Create controller handler in `Backend/src/controllers/`
3. Add route in `Backend/src/routes/`
4. Create API client function in `Frontend/src/api/`
5. Add TypeScript types if needed

### Adding a New React Component

1. Create component file in `Frontend/src/components/`
2. Follow naming: `PascalCase.tsx`
3. Export from `Frontend/src/components/index.ts`
4. Add tests if applicable

### Database Migration

1. Modify `schema.prisma`
2. Run `npm run prisma:migrate`
3. Review generated migration
4. If adding enum values, split into two migrations
5. Run `npm run prisma:generate`

### Debugging Chat Sync

1. Check backend `Backend/src/services/chat/`
2. Check frontend `Frontend/src/services/chat/`
3. Verify socket connection
4. Check `chatSyncFetchWorkerClient.ts` logs
5. Review IndexedDB contents

---

This documentation should enable any LLM to start working effectively on this codebase immediately. For product behavior and architecture constraints, see `docs/APP_FUNCTIONALITY.md`.