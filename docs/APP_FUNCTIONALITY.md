# Bandeja (PadelPulse) — Full Application Functionality

> Comprehensive inventory of everything the product does today.  
> Covers the web app, native iOS/Android (Capacitor), Apple Watch companion, backend API, and admin panel.  
> Verified against `App.tsx`, `Backend/src/routes/`, and `docs/UI_TEST_PLAN.md` (July 2026).

## 0. How to use this doc

| Audience | Start here |
|----------|------------|
| QA / release | §38 routes + `docs/UI_TEST_PLAN.md` P0 lists |
| Product / support | §1 overview, §2.1 glossary, feature sections §5–§22 |
| Agents / engineers | §2–§2.3 architecture/packages/constraints, §31 schedulers, §37 API summary, `docs/README.md` |

**Related docs:** see `docs/README.md`. **Not shipped / manual-only:** see §40.

---

## 1. Product overview

**Bandeja** is a multisport social platform for organizing games, leagues, and training sessions, with real-time chat, live scoring, ratings, marketplace, and club booking integration. It targets racket/paddle sports communities in cities worldwide.

**Supported sports:** Padel, Tennis, Table Tennis, Badminton, Pickleball, Squash.

**Platforms:**
- Web (Vite + React, PWA with service worker)
- iOS / Android (Capacitor 8 native shell)
- Apple Watch (BandejaWatch — live scoring, next-game widgets, workout tracking)
- Admin panel (plain JS, ops dashboard)
- Telegram bot (notifications + lightweight game browsing)

---

## 2. Architecture at a glance

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Vite, Tailwind, Zustand, React Query, React Router v7 |
| Backend | Express 5, TypeScript, Prisma, PostgreSQL, Redis |
| Real-time | Socket.IO with Redis adapter |
| Storage | AWS S3 (media) |
| Mobile | Capacitor 8 (camera, push, deep links, keyboard, network) |
| Chat | Offline-first: IndexedDB (Dexie) + sync protocol (`@bandeja/chat-contract`) |
| Unread | `@bandeja/unread-contract` — shared merge/totals; FE `unreadStore` + snapshot sync for tab badges |
| Server state (FE) | TanStack Query v5 for REST lists; Zustand for client UI; chat stays on Dexie/L1 (not Query) |

Most authenticated UX lives in a single **MainPage shell** with five bottom tabs. Standalone routes handle create flows, live scoring, league fullscreen views, sessions, connected clubs, and club admin.

### 2.1 Domain glossary & lifecycles

**Entity types** (`EntityType` — what kind of event a row represents):

| Value | Meaning |
|-------|---------|
| `GAME` | Standard match or social session |
| `TOURNAMENT` | Bracket-oriented event |
| `TRAINING` | Coach-led session (`trainerId`) |
| `BAR` | Bar meetup (simplified social) |
| `LEAGUE` | Fixture sub-game under a season (`parentId` → season) |
| `LEAGUE_SEASON` | Season hub (schedule, planner, standings tabs) |

**Game status** (`Game.status` — stored on every game; **not** the same as league fixture UI labels `READY` / `SCHEDULED`):

| Status | When |
|--------|------|
| `ANNOUNCED` | Default; also forced when `timeIsSet === false` |
| `STARTED` | Within scheduled window, or `resultsStatus === IN_PROGRESS` |
| `FINISHED` | Past end with no results in progress, or results finalized but not yet archived |
| `ARCHIVED` | Auto-archived by time/results rules (see §31.1) |

Scheduler does **not** auto-set `FINISHED` for results-based types (`GAME`, `LEAGUE`, `TOURNAMENT`, `TRAINING`) — those stay on results flow until manually finalized.

**Results status** (`Game.resultsStatus`): `NONE` → `IN_PROGRESS` → `FINAL`. Drives live scoring, photo gallery visibility, bets lock, court web cameras on game details.

**Participant status** (`GameParticipant.status` — roster slot, not game status):

| Status | Counts toward slots? | Notes |
|--------|----------------------|-------|
| `PLAYING` | Yes | Active roster member |
| `IN_QUEUE` | No | Waiting for owner approval |
| `INVITED` | No | Pending invite |
| `GUEST` | No | Chat-only guest access |
| `NON_PLAYING` | No | e.g. non-playing owner, trainer not in roster |

Only `PLAYING` counts toward `maxParticipants` / slot fill.

**Follow graph:** UI says *follow/unfollow*; API persists user follows under `/favorites/users` (separate from favorite **clubs**).

### 2.2 Architecture constraints (do not “simplify” without intent)

These are surprising, load-bearing choices still true in code:

| Constraint | Why it stays |
|------------|--------------|
| **Create templates ≠ league/playoff formats** | Casual create uses the template registry (`createFlow` / `@shared/createTemplates`). League seasons and playoffs use separate wizards/seeds (`playoffTemplates`, `PLAYOFF_GAME_TYPE_TEMPLATES`). Do not add `league`/`playoff` template tiers. |
| **Template matrix source of truth** | FE + `@shared/createTemplates` define templates; FE/BE parity via `createTemplates.parity.test.ts` / sport flow verify tests. Do not maintain a separate matrix markdown. |
| **Sport level confirmation** | Per-sport on `UserSportProfile.approved*`. Legacy `User.approved*` is a **PADEL-only** denormalized mirror for older clients — not a primary-sport projection. Non-padel confirmation lives only on the sport profile. |
| **Court occupancy** | FE owns external snapshot refresh; BE returns merged occupancy blocks (app games + admin holds + external busy). Snapshot freshness: `BOOKTIME_SNAPSHOT_FRESH_MS` (60s) — shared constant used for Booktime/Padeloo snapshot staleness. |
| **External booking** | Provider ports in `@shared/booking/` with adapters for **Booktime** and **Padeloo** (`ClubIntegrationType`). Separate persistence: `ClubBooktimeBusySnapshot` / `UserClubBooktimeAuth` vs `ClubPadelooBusySnapshot` / `UserClubPadelooAuth`. Shared freshness constant `BOOKTIME_SNAPSHOT_FRESH_MS` (60s). |
| **Open chat thread** | Live projection module (`threadLiveProjection`) — inbox can update while an open thread must still apply inbound + read-receipt paths without requiring refresh. Bootstrap invariants live in `Frontend/src/services/chat/threadOpen/types.ts`. |

### 2.3 Shared packages & modules

| Package / path | Role |
|----------------|------|
| `packages/chat-contract` (`@bandeja/chat-contract`) | Chat sync event types shared FE/BE |
| `packages/unread-contract` (`@bandeja/unread-contract`) | Unread snapshot merge, totals, optimistic bump helpers |
| `Frontend/shared/` (`@shared/*` from Backend) | Create templates, booking ports, gameBooking helpers, next-game **policy** (`nextGame/policy.ts` + golden JSON), club integration types, game format, officiating, system-message keys. Runtime `pickNextGame` is in `Frontend/src/utils/pickNextGame.ts`. |

---

## 3. Authentication & account

### 3.1 Sign up & sign in

| Method | Details |
|--------|---------|
| Phone + password | Primary registration and login |
| Apple Sign-In | Native iOS; link/unlink/merge on profile |
| Google Sign-In | Web OAuth + native Android; link/unlink/merge |
| Telegram | Bot OTP (`/auth`), deep-link auto-login (`/login/:telegramKey`), account linking |

### 3.2 Session management

- JWT access + refresh tokens (secure storage on native)
- **Active sessions** page: view devices (web/iOS/Android), revoke individual sessions, sign out all devices
- Silent token refresh on expiry
- Logout (single device) and logout-all

### 3.3 Onboarding gates

After first login, users may be blocked until they complete:

| Gate | Trigger |
|------|---------|
| Primary sport | User has no enabled sport profile |
| City selection | Auto-city failed; `/select-city` or home banner |
| Profile name | Required before join/create/invite actions |
| Gender prompt | Banner when gender unset (affects mixed-gender games) |
| Welcome questionnaire | First-run skill/onboarding flow |
| Sport questionnaire | Per-sport level calibration |

Users **without any enabled sport** are redirected from Home and Find to Profile.

### 3.4 Account lifecycle

- Delete account (double confirmation)
- Block / unblock users
- EULA acceptance at registration

---

## 4. App shell & global UX

### 4.1 Bottom navigation

| Tab | Route | Purpose |
|-----|-------|---------|
| **My** | `/` | Home: calendar, invites, stories, bookings, teams, leagues |
| **Find** | `/find` | Discover and join public games |
| **Chats** | `/chats` | Messaging inbox |
| **Market** | `/marketplace` | Marketplace listings |
| **Top** | `/leaderboard` | City sport rankings |

Unread badge on the **Chats** bottom tab when applicable. My/Market bottom tabs do not show unread today (store selectors exist; only Chats is wired in `BottomTabBar`). Market unread appears on the Chats → Market inbox filter. Game-card unread chips still show on Home/Find lists.

### 4.2 Header & create menu

Context-sensitive header per screen. The **+ create menu** (Home header) opens:

- Game (per sport)
- League
- Training session
- Tournament
- Bar event
- Group chat / Channel
- Story
- User team
- Marketplace listing
- Bug report

### 4.3 URL-driven state

- `?player=<userId>` — player card bottom sheet
- `?item=<marketItemId>` — marketplace item drawer
- `?sport=` — sport context for levels/profiles
- Home: `?tab=calendar|past-games`
- Game/league: `?tab=general|schedule|planner|standings|faq`
- Live: `?matchId=`, `?tv=1`, `?theme=`, `?spectatorToken=`, `?transparent=1`
- Find: `?view=list`
- Chats: `?filter=channels`, `/chats/marketplace`, `/bugs`

### 4.4 Cross-cutting UX

- **Themes:** light / dark / system (persisted)
- **i18n:** multi-language UI synced from profile (**en**, **ru**, **es**, **sr**, **cs**)
- **Pull-to-refresh** on most lists
- **Resizable splitter** on desktop game-details + chat split view (width persists for session)
- **Navigation error boundary** — broken routes recover to `/`
- **Lazy-route chunk recovery** — reload prompt if a code-split page fails to load
- **Multi-tab auth sync** — access-token refresh broadcast across browser tabs
- **PWA service worker** — web cache versioning and offline asset cache (native uses bundled `dist`)
- **Offline gate:** `NoInternetScreen` blocks most routes offline
- **Offline exceptions:** game details, live/broadcast, league fullscreen, user profiles, auth routes, **all chat routes** (IndexedDB cache + outbox)
- **App version check:** `GET /api/app/version-check` via `useAppVersionCheck` — **blocking** (force) or **optional** update modal from Admin App Versions (min / force build per platform). E2E can stub via `window.__E2E_VERSION_CHECK__`
- **Ads:** sponsor placements on Home, Find, Leaderboard
- **Deep links:** games, chats, marketplace, profiles, teams, Telegram login, **`/next-game`** (widget / Siri / shortcuts)
- **Desktop layouts:** split views for Home calendar, Find calendar, Chats inbox+thread, Game details+chat
- **Home-screen widgets (native):** Next Game timeline synced via `widgetNextGamesSync` + App Group / Android widget bridge — see §39.3

### 4.5 Guest (unauthenticated) access

| Route | Access |
|-------|--------|
| `/games/:id` | Public game details (join prompts login) |
| `/user-profile/:userId` | Public player profile |
| `/games/:id/live`, `/games/:id/broadcast` | With `?spectatorToken=` (no login required) |
| `/login`, `/register` | Auth flows |

**Note:** `/games/:id/live/tv` and `/games/:id/live/broadcast` are auth-only **redirect shortcuts** that rewrite to the live/broadcast URL with the right query params. The target live/broadcast pages themselves accept guest spectator tokens.

Everything else redirects to login.

---

## 5. Home — My tab (`/`)

### 5.1 Stories rail

Instagram-style ephemeral content at top of Home:

- View others' stories (navigation, likes, comments)
- Create **photo stories** (editor: text overlays, stickers, filters, crop, caption)
- Create **video stories**
- Auto-generated slides: game results, bracket champions
- Story DM replies land in user chat with story-reply card
- Quick emoji reactions from story viewer
- Report story comments

### 5.2 Calendar & game list

- **Calendar view** (default): month grid, day selection, localized weekday headers
- **List view** toggle: upcoming games grouped by date
- **Past games subtab** (`/?tab=past-games`): historical FINISHED and ARCHIVED games
- Overflow month cells selectable (adjacent-month days with games)
- Today/Tomorrow badges on selected date heading
- Empty states when no games

### 5.3 Panel switcher (below stories)

Three optional panels — Bookings, Teams, Leagues — with counts:

**Bookings** (Booktime / Padeloo):
- Upcoming club booking cards (up to 3 + "See all")
- Adjacent same-court slot grouping
- Linked game chips, occupancy % pills
- Per-slot actions: link to game, create game, cancel booking
- Connect-club banner for unconnected integrated clubs
- Gear shortcut → connected clubs integrations

**Teams:**
- User's teams row; tap → team page

**Leagues:**
- League hub cards with scheduled/unscheduled game sections (collapsible)

### 5.4 Invites

- Pending game invite cards with accept/decline
- Decline with optional note
- Invite note persistence without accept/decline
- Accept from game details clears invite on return to Home

### 5.5 Prompts & banners

- Sport questionnaire prompt
- City prompt banner
- Gender prompt banner
- Mark-all-chats-read banner
- Invite friend to Bandeja (share link)

### 5.6 Game cards

- Tap → game details
- Unread chat badge on card
- Create game from calendar date (pre-filled)
- Create from + menu

---

## 6. Cities & club discovery

Not a top-level route — embedded in city picker, Find header, and create-game club flows.

### 6.1 City selection

- Searchable **city list** and **map view** toggle (`CityMap`)
- Tap map marker → select city
- **Clubs tab** in city picker: club cards with avatar, address; info (i) opens club detail; tap selects that club's city
- Geolocation for user position on map (with permission)
- Auto-city assignment with confirm/change via home banner

### 6.2 Club detail panel

Opened from city picker, Find/create club modals, or club info links:

- Address, city line, coordinates, **mini map** (`ClubMiniMap`), open in Maps link
- **Availability grid** for BOOKTIME/PADELOO-integrated clubs (free slots, duration toggle, last-sync time)
- Connect-club banner + OTP flow when not linked
- Browse slots → navigate to create-game with prefilled club/court/time
- **Club reviews** section (see §6.3)

### 6.3 Club reviews

- Star rating + text comment tied to a **visit game** (eligible finished games at that club)
- Up to several photos per review
- Community review list with pagination
- Aggregate rating on club (`clubRating`, `clubReviewCount`)
- Edit/update own review for a visit

---

## 7. Find tab (`/find`)

Discover and join games in the user's city.

### 7.1 Views

- Calendar view (default) with month picker, go-to-today
- List view (`?view=list`) — games from today grouped by date
- Desktop split layout (calendar + list side by side)
- Re-tap Find tab → jump to today

### 7.2 Category chips

Filter by: Games, Training, Tournaments, Leagues, User-created games (combinable AND logic).

### 7.3 Advanced filters

| Filter | Behavior |
|--------|----------|
| Club(s) | One or more clubs; favorite clubs shortcut |
| Time range | Start/end window |
| Level range | Min/max skill level |
| Sport | Primary or all sports |
| Available slots | Hide full games |
| Suitable rating | Hide out-of-band level games |
| No-rating games | Casual games only |
| Private games | Admin-only toggle |
| Hide bar games | Exclude bar events |

Filters persist in local storage across reloads.

### 7.4 Discovery actions

- Open game details
- Quick join from card
- Join queue when full
- Trainer carousel when Training filter on (tap to filter by trainer)
- Gender-restricted game badges (MEN/WOMEN/MIX)
- Join blocked for wrong gender, out-of-range level, missing name
- "Booked" badges: manual court booked (blue), external booking linked (green checkmark), partial link (blue)

### 7.5 City

Change city from header → games refetch for new city.

---

## 8. Create game (`/create-game`)

Multi-step wizard for scheduling events. Entity types:

| Entity | Purpose |
|--------|---------|
| **GAME** | Standard match/social session |
| **BAR** | Social bar meetup (simplified) |
| **TRAINING** | Coach-led session; trainer role, creator may be non-playing |
| **TOURNAMENT** | Bracket-oriented defaults, roster setup |

### 8.1 Format wizard

- Sport selector (updates available templates and clubs)
- **Template picker** per sport — social vs match tier
- Scoring preset, game type, match generation algorithm
- Rating vs social toggle (`affectsRating`)
- Golden point / deuce count (classic tennis-style)
- Singles vs doubles (players per match)
- Fixed teams toggle
- Participants-only chat toggle (default off)
- Match timer options where applicable

**Create templates** (canonical set in `Frontend/shared/createTemplates.ts`):

| Sport | Templates (examples) |
|-------|---------------------|
| Padel | Americano 10/20/24, Mexicano 24, Challenger Pool, KOTC 11, Singles BO3, Singles single set, Singles Americano 24 |
| Pickleball | Social 21, Match BO3 11, KOTC 11 |
| Badminton | Club 3×15, Club 3×21, Americano 21, Match 3×21 |
| Table Tennis | Open play 11, Club RR 11, Box BO3 11, Legacy single 21, Match BO3/BO5 11, Americano 11, Mexicano 11, Swiss box |
| Tennis | Fast4 social, Classic BO3 |
| Squash | Quick BO3 11 |

### 8.2 Scheduling

- Club picker (filtered by sport)
- Court grid with occupancy rings per date
- Multi-court selection (auto-calculated from participant count)
- Date, duration, time grid
- Level range slider
- Max participants, gender restriction (MEN/WOMEN/MIX)
- Game name, description, avatar upload
- Price section (type, currency, total)
- Invite players from list (level filter, availability icons)
- Floating summary chip bar when scrolling past filled sections

### 8.3 External booking (Booktime / Padeloo)

When club has BOOKTIME or PADELOO integration:

- Unified **location & time** panel: club → date → court → reservation card → auth/duration → time
- Connect via phone OTP inline or from club detail
- Reservation strip: user's upcoming bookings on selected date
- Green grid overlay for reservation windows
- Adjacent slot grouping in strip
- **Book on create:** reserves real court via external API (multi-step confirm for multi-court)
- **Opt-out toggle:** "Don't book real court" — full schedule grid, red external cells selectable
- Deep link prefill: `?bookingIds=` from My bookings or connected clubs
- Rollback reservation if game create fails
- Snapshot refresh, scout pool, last-sync timestamps
- Duration buttons match club API (1h/2h/etc.)

### 8.4 Submit

- Validation errors inline
- Direct create overlay (non-reservation path)
- Navigate to game details or calendar on success
- Duplicate game from existing game details (pre-filled)

---

## 9. Create league (`/create-league`)

- League name, description, city, club
- Season name and date range
- Sport, player level range, max participants
- Format wizard (round-robin, bracket, etc.)
- Season avatar upload
- Gender teams, fixed teams, multi-court options
- Anyone-can-invite toggle, participants setup tags, price section
- Creates a **LEAGUE_SEASON** entity

---

## 10. Game details (`/games/:id`)

Central hub for any scheduled event. Layout adapts by `entityType`.

### 10.1 Entity types

| Type | UI |
|------|-----|
| GAME | Standard game shell |
| TOURNAMENT | Tournament roster/bracket defaults |
| TRAINING | Trainer section, training results, reviews |
| BAR | Bar participants list, simplified social |
| LEAGUE | Link to parent league season |
| LEAGUE_SEASON | Multi-tab: General, Schedule, Planner, Standings, FAQ |

### 10.2 General tab (all types)

**Information:**
- Name, time, club/court(s), sport, level range, public/private; **favorite club** star; **club mini map** when geo available
- Sport and format tags in app header
- Collapsible game info card
- Weather summary + full-day forecast dialog (hourly, day navigation, archive days)
- Linked external bookings section ("From your reservations") with coverage badges
- Court web cameras (FINAL games only)
- Add to calendar modal
- Share game / results / Telegram summary

**Private notes (user-only):**
- Per-user **game note** on game info card, game cards (My/Find/league fixtures), and note modal — not visible to other players

**Participation:**
- Join, leave, join queue, cancel queue
- Accept/decline invites (with note)
- Owner: accept/decline queue, invite players, cancel invites, kick, **transfer ownership**, manage users modal (roles)
- Guest join (chat-only access without full roster join)
- Participant carousel vs list toggle
- Fixed teams management
- Gender filter enforcement

**Content:**
- Photo gallery — upload, set main, delete; privacy toggle (`forbidOthersPhotosView`); visible only when results FINAL
- Results section — rounds, matches; **outcome explanation** modal per player (rating delta breakdown)
- Results **sync conflict** modal when local and server results diverge (choose load-from-server vs push-local)
- Enter results on **ANNOUNCED** games requires confirmation gate
- **Reset all results**, **finish results** confirm, **edit finalized results** with danger confirm
- **AI results artifacts** — generated summary/photo via background queue; **Telegram post** block when artifacts ready
- **Share results card** with optional generated photo
- **BAR games:** per-player level before/after on participant list when finished
- Bets — create, accept, update, cancel
- FAQ tab (when FAQs exist)
- Emoji **reactions on game cards** in lists (My, Find, etc.)
- Workout tracking link (Apple Watch / HealthKit)

**Settings (owner/admin):**
- Edit general info, location & time (same Booktime panel as create)
- Club, courts, visibility, rating impact
- Invite/join rules, results permissions
- Participants-only chat enable
- Duplicate game, cancel, delete (with linked-booking warning)
- Multi-court reorder

**Chat:**
- Open game chat (`/games/:id/chat`)
- Desktop: split panel with chat beside details
- Participants + Organizers tabs when participants-only chat enabled

### 10.3 League season tabs

| Tab | Content |
|-----|---------|
| **Schedule** | Fixtures, bracket views, my games list, fixture detail sheets |
| **Planner** | Planning grid (participants only) |
| **Standings** | Group/bracket points tables |
| **FAQ** | Season FAQ content |

**Fullscreen routes:**
- `/games/:id/league-table` — fixture matrix
- `/games/:id/league-bracket` — playoff bracket visualization

### 10.4 League backend capabilities

- Full round-robin fixture generation
- Custom manual rounds
- Playoff rotation: Winner Court or Americano mini-tournaments
- Bracket playoff: PER_GROUP or CROSS_GROUP seeding
- Bracket options: third place, consolation, double elimination, custom bye seeds, play-in pairings
- Groups CRUD, participant assignment, reorder
- Standings recalculation
- Bracket slot edit, walkover, notify
- Round games create/delete, send start message

---

## 11. Live scoring

### 11.1 Web / phone (`/games/:id/live`)

Full-screen live match board per `?matchId=`:

- Score points, undo
- Serve setup and serve guide
- **Strict officiating** modes: kitchen fault (pickleball), let replay blocks scoring (badminton), tie-break change-ends cues
- Timed set freeze/unlock
- Optional decider sheet
- Match timer (start/pause/resume/stop/reset) with cap notifications
- Golden point / deuce rules from game config
- **TV mode** (`?tv=1`) — minimal chrome, light/dark theme
- **Broadcast mode** — shareable spectator URLs
- **Spectator token** — guest viewing without login
- Wake screen / keep-awake on native
- Offline-tolerant shell
- **Share URLs** for live/broadcast/TV with minted or passed `spectatorToken`
- Authenticated scorers can mint spectator token for guests
- **Sync conflict** retry when live scoring revision stale (409)
- **Dual-writer attribution** toast when phone and watch both score

Routes: `/games/:id/live`, `/games/:id/live/tv`, `/games/:id/live/broadcast`, `/games/:id/broadcast`

### 11.2 Apple Watch (BandejaWatch)

- Game list synced from phone
- Live scoring per sport rules (padel doubles, tennis, rally-point sports, squash, table tennis, Americano)
- Serve court visualization and serve guide
- First-serve pick flow, change-ends coach
- Strict officiating mode buttons
- Match timer with HealthKit workout bridge
- Results post-finalize hints
- **Widgets:** Next Game, Live Active Match
- WatchConnectivity sync with iPhone app
- Deep link to specific game/match

### 11.3 Scoring engine (backend)

**Game types:** CLASSIC, AMERICANO, MEXICANO, ROUND_ROBIN, WINNER_COURT, LADDER, KOTC, CUSTOM

**Match generation algorithms:** HANDMADE, AUTOMATIC, FIXED, RANDOM, ROUND_ROBIN, ESCALERA, RATING, WINNERS_COURT, KING_OF_COURT, Swiss pairing

**Scoring presets:** Classic best-of-3/5, Fast4, rally point (11/21), best-of-3/5 at 11, timed, custom

**Rating:** Bandeja ELO v1 engine with sport-specific display systems (Playtomic, NTRP, DUPR, UTR, USATT, SquashLevels)

---

## 12. Chats (`/chats`)

Offline-first real-time messaging system.

### 12.1 Inbox filters

| Filter | Route / param |
|--------|---------------|
| Users | Default — DMs + group chats |
| Market | `/chats/marketplace` |
| Channels | `?filter=channels` |
| Bugs | `/bugs`, `/bugs/:id` |

### 12.2 Thread types

| Type | Route |
|------|-------|
| Direct message | `/user-chat/:id` |
| Group chat | `/group-chat/:id` |
| Channel | `/channel-chat/:id` |
| Game chat | `/games/:id/chat` |
| Bug report | `/bugs/:id` |
| Marketplace | Market filter threads |

### 12.3 Message features

- Text, **@mentions**, replies, reactions, read receipts
- **Edit** and **delete** own messages (sync + offline outbox; edit shows error if message was deleted server-side)
- **Report message** — reason (spam, harassment, inappropriate, fake info, other) + optional description → admin Reports queue
- Photos, video (transcode/compress), voice/audio, documents
- **Stickers** — first-class `MessageType.STICKER` (`stickerId`); official packs + personal stickers; favorites/recents tray (`/api/stickers`)
- **Giphy / GIF** — composer GIF search & trending when `GIPHY_API_KEY` and/or `KLIPY_API_KEY` set (`/api/giphy`; provider may be Giphy or Klipy); URL-only paste re-hosted as `IMAGE` for Giphy, Klipy, or **Tenor** page/media URLs (soft-fail keeps text URL)
- **Link previews** — eligible URLs get OG/app cards (`/api/link-preview`); Bandeja deep links resolve to typed app cards (game, next-game, profile, etc.); composer chip + remove-preview
- Polls (create, vote)
- Pinned messages
- Search in thread + **global chat search** (sections: messages, games, channels, bugs, marketplace)
- Auto-translate + language picker per thread
- Drafts (auto-expire after 30 days)
- Offline outbox with retry on reconnect
- Typing indicators
- **Pin** and **mute** threads from inbox
- **Archived/cancelled game chat** — read-only after game cancel; outbox dropped with user message
- Context panels: game info, bug details, marketplace item
- Push notification reply from lock screen
- Delivery acks via socket

### 12.4 Group / channel admin

- Create group or channel from + menu
- Participants list, roles (owner/admin)
- Invites, join/leave, pin/hide thread
- Avatar upload
- Channel vs group distinction

### 12.5 Sync protocol & unread

- Socket.IO + IndexedDB local DB
- Event-based sync (`MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `REACTION_ADD/REMOVE`, `READ_CURSOR_UPDATE`)
- Background sync worker
- **Unread authority:** `@bandeja/unread-contract` merge helpers + FE `unreadStore` / `unreadSnapshot` — Chats bottom-tab badge + app icon badge; optimistic bumps on send/receive; muted threads excluded from totals; open-thread clears without waiting for socket round-trip. My/Market bottom-tab selectors exist but are not shown on those tabs; Market unread is under Chats → Market filter; game cards can still show chat unread chips

---

## 13. Marketplace (`/marketplace`)

Peer-to-peer listings within the app.

### 13.1 Browse

- Infinite scroll listings
- Category and city filters
- Item detail drawer (`?item=`) or `/marketplace/:id`
- Unread badges on Market **inbox filter** (`/chats/marketplace`) and per-item threads

### 13.2 My listings (`/marketplace/my`)

- View, edit, withdraw own listings

### 13.3 Create / edit (`/marketplace/create`, `/marketplace/:id/edit`)

- Title, description, up to 5 photos
- Category, cities
- Trade types: sell, buy, rent, exchange
- Price or auction:
  - **Classical auction** — ascending bids
  - **Holland auction** — price drops on interval until buy-at-current-price
- Buy-it-now option
- Draft autosave

### 13.4 Transactions

- Chat seller (marketplace thread)
- Express interest
- Place bid, buy-it-now, withdraw bid
- Seller/buyer chat threads
- Auction end scheduler (every minute) + Holland price tick (every 5 min)
- Real-time auction updates via socket

---

## 14. Leaderboard (`/leaderboard`)

- City + sport rankings
- Search players
- Filters: scope, time period, rating type
- Multisport picker
- Scroll to my rank
- Ad placement banner

---

## 15. Profile (`/profile`)

### 15.1 Sub-tabs

| Tab | Content |
|-----|---------|
| **General** | Settings and identity |
| **Statistics** | Performance stats per sport |
| **Comparison** | Head-to-head vs other players |
| **Followers** | Following / followers lists |
| **Reviews** | Trainer reviews (trainers only) |

### 15.2 General settings

**Identity:**
- Avatar upload + fullscreen view
- Display name, email, gender, bio, verbal status
- Hand preference, court side preference

**Sports profiles:**
- Enable/disable sports
- Per-sport level (questionnaire-calibrated)
- **External rating hints** (Playtomic, NTRP, DUPR, UTR, etc.) — display-only on profile
- **Playtomic profile sync** API (import levels by sport)
- Competitive vs social badges
- Weekly availability grid

**Preferences:**
- City
- Language, time format, week start
- Default currency
- Theme (light/dark/system)
- Alternate app icon carousel (native)

**Privacy:**
- Messages from non-contacts
- Online status visibility
- Always show names in lists

**Sharing:**
- Share photos, creations, results to followers

**Connected accounts:**
- Apple, Google link/unlink/merge
- Telegram link/sync

**Other:**
- Wallet modal (in-app coins)
- Notification preferences modal
- Blocked users list
- Logout, delete account
- Links: sessions, connected clubs, game subscriptions, EULA
- App version (native build number)

**Statistics tab extras:**
- **Performance insights** (win rate, streaks, form — sport-scoped)
- **Play streak** — consecutive weeks with a finished game per sport (current / best / at-risk); shown on own profile
- **Reliability** — per-sport reliability score (see §29); shown with stats / results deltas
- **Level history** chart (competitive vs social level over time)

### 15.3 Other user profile (`/user-profile/:userId`) — guest-readable

- Avatar, stats, sport levels
- Favorite, share, start DM, block/unblock
- Reviews list
- Public game join prompt for guests

---

## 16. Social graph

- **Follow / unfollow** users (API: `/favorites/users`; also used to highlight trainers in Find)
- **Favorite clubs** (shortcut in Find filters; separate API from user follows)
- **Block / unblock** (restricts chat and follow)
- **User teams** (`/user-team/:id`): create, edit name/status/avatar, invite members, remove, delete team
- **Player card overlay** (`?player=`) from anywhere — avatar/stats, follow, block, start DM, invite to game, **send coins**, **common group chats** list (`/users/:id/common-groups`)
- **Invite friend** share link from Home

---

## 17. Game subscriptions (`/game-subscriptions`)

Alert subscriptions for new games matching criteria:

- CRUD subscriptions per user
- On new **public** game create (with `clubId`, not `LEAGUE` / `LEAGUE_SEASON`), subscribers in the **same city** are checked; push and/or Telegram sent if a subscription matches (respects notification prefs; **creator excluded**)

**Matching rules** (all optional filters on the subscription; empty filter = no constraint):

| Filter | Match logic |
|--------|-------------|
| City | Must equal game `cityId` |
| Entity types | Game `entityType` in subscription list (if list non-empty) |
| Clubs | Game `clubId` in subscription club list (if list non-empty) |
| Day of week | Game start weekday in city TZ ∈ subscription days (if list non-empty) |
| Date range | Game date ≥ `startDate` and ≤ `endDate` (city TZ) |
| Time window | Game start time-of-day within `startTime`–`endTime` (city TZ; end exclusive) |
| Level range | Game `[minLevel, maxLevel]` overlaps subscription range (interval overlap when both sides have bounds) |
| My gender only | Skip `MEN` / `WOMEN` games that don't match subscriber gender; `ANY` / `MIX_PAIRS` pass |

Creator is excluded from their own game's subscription notifications.

---

## 18. Connected clubs & external booking (`/profile/connected-clubs`)

External court booking via club `integrationType`: **BOOKTIME** or **PADELOO** (provider ports in `@shared/booking/`; FE adapters under `integrations/booktime` and `integrations/padeloo`).

### 18.1 Bookings tab

- View linked club bookings (upcoming and past) for connected Booktime/Padeloo clubs
- Past booking: link to game, expand actions
- Cancel booking (policy confirm)
- Timezone display uses club city TZ
- Price display when available

### 18.2 Integrations tab

- Connect/disconnect clubs (Booktime: phone OTP; Padeloo: provider session/auth for that club)
- New user signup flow during connect where applicable
- Dismiss connect hints
- Link bookings to games from My tab or create-game
- APIs: `/booktime/*`, `/padeloo/*`, plus per-club `/clubs/:id/booktime|padeloo/...` snapshot/auth routes

### 18.3 Game ↔ booking link

- Link one or more reservations to a game (coverage helpers in `@shared/gameBooking`)
- Coverage badges: fully booked vs not fully booked
- Shared reservation across multiple games (informational)
- Refresh/unlink when booking disappears from external system
- Delete game warns that club bookings stay active

---

## 19. Club admin (`/my-clubs/*`)

For users with `clubAdminClubs` permission. FAB entry point.

| Route | Purpose |
|-------|---------|
| `/my-clubs` | Club picker |
| `/my-clubs/:clubId` | Dashboard — today's stats, conflicts |
| `/my-clubs/:clubId/schedule` | Schedule grid — block slot, edit hold, cancel game, clear court |
| `/my-clubs/:clubId/reservations` | Reservations list (infinite scroll) |
| `/my-clubs/:clubId/courts` | Courts CRUD |
| `/my-clubs/:clubId/settings` | Club settings (cancellation notice hours, integration flags) |

**Schedule actions:** block slot (hold with reason), edit hold, cancel game on slot (optional DM preview to participants), clear court from slot. Booktime sync status on schedule.

- View-as-player modal
- Coach marks for first-time admin

---

## 20. Bug tracker

In-app issue reporting via chat threads.

- Create bug from + menu → opens bug channel
- Bugs inbox filter (`/bugs`)
- Priority selector and badge
- Bug context panel in chat thread
- Lifecycle: TEST → FINISHED (15d) → ARCHIVED (3d) via scheduler
- Developer room socket notification (`new-bug`)

---

## 21. In-app economy

### 21.1 Wallet & coins

- Virtual currency wallet on profile
- Transaction history (`GET /transactions`)
- **P2P send coins** — wallet modal or player card → `SendMoneyToUserModal`; amount + optional message; `TRANSFER` transaction type; min 1 coin, cannot exceed balance
- Transaction types: `NEW_COIN`, `TRANSFER`, `PURCHASE`, `REFUND`
- Admin can grant coins (`NEW_COIN`)
- Currency exchange rates (Frankfurter API, updated every 2 hours)
- **No external top-up UI** — coins enter via admin grant, bet payouts, P2P, or API `PURCHASE` (goods catalog has no shop UI)

### 21.2 Bets

- Create bets on games (coin stakes)
- Accept, update, cancel bets
- Resolution on game results
- **Locked after results start** — create/accept/edit/cancel disabled when `resultsStatus` is IN_PROGRESS or FINAL
- Payout reconcile scheduler (every 5 min)
- Real-time bet socket events

### 21.3 Virtual goods

- Goods catalog (admin-managed via API)
- Purchasable with coins through transactions API — **no dedicated in-app shop UI** today

### 21.4 Game pricing

- Optional price on game create (type, currency, total)

---

## 22. Training & trainers

- **Training games:** trainer identified by `Game.trainerId` (not participant flag)
- Pending trainer invite row + trainer accept flow when no trainer assigned
- Finish/undo training session
- Participant level and reliability edits by trainer (`EditLevelModal`)
- Trainer reviews (profile Reviews tab for trainers; submit after training)
- Favorite trainer (Find filter highlight)
- Training filter in Find tab + trainer carousel
- Invite picker lists trainers only when creating training games

---

## 23. Stories (detailed)

Beyond the Home rail (see §5.1):

- View counts, likes
- Comments with report flow
- GAME_CREATED / GAME_RESULT auto-slides
- Story expiry and prune (Telegram scheduler)
- Engagement sync via socket

---

## 24. Notifications

### 24.1 Push (APNs + FCM)

Types: game chat, user chat, group chat, bug chat, invites, new game, game reminder, game results, game cancelled, game system, league round start, league game assigned, bets resolved, transactions, new market item, new bug, auction, match timer cap, user team events.

- Register/renew/remove device tokens
- **Inline reply** to chat from lock screen / notification shade (incl. token-only path when app killed)
- **Notification actions:** accept/decline game invites, accept/decline team invites (Android)
- **Rich notifications:** image/video/story-reply thumbnails; iOS Communication Notifications layout when entitled
- Deep link routing on tap (games, chats, bugs, marketplace, teams, league schedule)
- Local notification actions when backgrounded

### 24.2 Telegram bot

Commands: `/start`, `/auth` (OTP), `/login` (link), `/my`, `/games`

- Inline callback buttons for game actions
- 20+ notification types mirroring push
- City pinned game messages (scheduler every 5 min)
- Send game results to Telegram from game API

### 24.3 User preferences

Per-channel toggles (Telegram vs Push). Respects chat mute state.

---

## 25. Ads

- Sponsor placements on Home, Find, Leaderboard
- Campaign scheduling (activate/end every 10 min)
- Analytics rollup (daily 03:00)
- Event tracking API
- Admin: sponsors, campaigns, targeting, stats, export, preview

---

## 26. AI & media processing

- **Chat translation queue** — async message translation
- **Chat transcription** — voice message transcription
- **Game results artifacts** — AI-generated results summaries/photos (Replicate webhooks: Flux/GPT image models)
- **Media upload** — avatars, chat attachments, game photos, marketplace photos, story media
- S3 storage with cleanup schedulers

---

## 27. Weather

- Game/day weather preview on game details
- Full-day hourly forecast dialog
- Archive weather for past games
- `/weather/day` and `/weather/preview` API

---

## 28. Presence & online status

- User online/offline tracking
- Presence subscriptions via socket
- Optional hide online status in privacy settings
- Online users view in admin panel

---

## 29. Ratings & rankings

- **Bandeja ELO v1** rating engine per sport
- **Reliability** — separate per-sport score on `UserSportProfile`; moves with results (`calculateReliabilityChange`); dampens level change via reliability coefficient (also interacts with `ratingUncertainty`); trainers can override on training games; shown on rankings, results summaries, Telegram/artifacts
- Level change events stored and displayed
- Score margin affects delta where configured
- Leaderboard by city/sport/period (can sort/filter involving reliability)
- Player comparison (head-to-head)
- External rating display mappings (Playtomic, NTRP, DUPR, etc.)
- Questionnaire-based initial level calibration

---

## 30. Admin panel (`Admin/`)

Plain JS ops dashboard (no build step). Sections:

| Section | Capabilities |
|---------|-------------|
| **Overview** | Stats dashboard |
| **Users** | CRUD, merge accounts, reset password, grant coins |
| **Online Users** | Live presence list |
| **Games** | Browse, manage games |
| **Invites** | Invite management |
| **Cities** | City CRUD |
| **Clubs** | Club CRUD, courts, **online booking integration type** (Booktime / Padeloo), **court import**, **court web camera URL** |
| **Reports** | Message and story comment reports |
| **App Versions** | Force/minimum version config |
| **Platform Settings** | Translation queue, results artifacts settings (incl. Replicate photo model picker) |
| **Market Categories** | Marketplace category management |
| **Mass Notifications** | Broadcast push to users |
| **Sponsor Ads** | Campaign management |
| **Translation Queue** | Monitor chat translation jobs |
| **Logs** | Historical log stream |

---

## 31. Background jobs & schedulers

| Job | Schedule | Purpose |
|-----|----------|---------|
| Game status | :00 and :30 hourly | Status transitions, 24h/2h reminders, bar results, league standings |
| Currency rates | Every 2 hours | Exchange rate update |
| Auctions | Every 1 min + 5 min | End auctions; Holland price ticks |
| Chat drafts | Daily 03:00 | Expire old drafts |
| Unread auto-read | Daily 04:00 | Auto-read messages >1 month old |
| Bug lifecycle | Daily 04:30 | TEST→FINISHED→ARCHIVED |
| Ad campaigns | Every 10 min | Activate/end campaigns |
| Ad analytics | Daily 03:00 | Rollup + purge old events |
| Bet payout reconcile | Every 5 min | Retry unresolved payouts |
| Push reply tokens | Daily 05:15 | Purge expired tokens |
| Chat sync stats | Weekly Mon 05:30 | Stats log + event retention prune |
| Telegram games | Every 5–10 min | Pinned city messages, story expiry |
| Translation queue | Worker | Async chat translation |
| Results artifacts | Worker | AI results generation |

### 31.1 Game status scheduler (detail)

Runs at **:00 and :30** every hour (+ once on startup). Uses club city timezone via `calculateGameStatus`.

**Status transitions:**

- `timeIsSet === false` → force `ANNOUNCED`
- `resultsStatus === IN_PROGRESS` → `STARTED`
- In scheduled window (started, not yet ended) → `STARTED`
- Past end, `resultsStatus === NONE` → `FINISHED` (except results-based types blocked from auto-`FINISHED` — see §2.1)
- `resultsStatus === FINAL` → `FINISHED`, then `ARCHIVED` after archive window (2 days after `finishedDate` for GAME/LEAGUE/TOURNAMENT; or 7 days after start for GAME/TOURNAMENT without final results path)
- BAR/TRAINING and other types: archive based on end time + rules in `gameStatus.ts`

**Side effects on transition:**

- **BAR** → `FINISHED`: auto-set bar results (`BarResultsService`)
- **FINISHED / ARCHIVED**: clean up invite participant rows
- **LEAGUE** fixture with `resultsStatus === FINAL` → recalculate parent season standings
- **Reminders**: 24h and 2h before start (±10 min window) to `PLAYING` participants — entity types GAME, TOURNAMENT, BAR, TRAINING, LEAGUE; only while status `ANNOUNCED` and `timeIsSet`

---

## 32. Real-time events (Socket.IO)

**Client subscriptions:** game rooms, bug rooms, DM rooms, group/channel rooms, marketplace auction rooms, presence.

**Server events:** chat messages/updates/reactions/read receipts/deletes/polls/translations/transcriptions/pins, unread counts, game updates/results/cancel, match timer, live scoring, game photos, invites, user team events, bets, auction bids, stories, wallet updates, presence, typing indicators, sync handshake.

---

## 33. Security & permissions

### Game permissions

| Role | Capabilities |
|------|-------------|
| Owner | Full edit, delete, invite management |
| Admin | Edit game settings |
| Participant | Join actions, chat, photos (when allowed), results (when permitted) |
| Guest | View public games, spectator live scoring |
| Archived game | Join/edit blocked; game chat read-only if cancelled |

### Other

- JWT authentication on all protected API routes
- Optional auth for public game/profile endpoints
- Admin role for admin panel and private game visibility
- Club admin role for `/my-clubs/*`
- Block graph enforced in chat and social actions
- Rate limiting on API
- CORS, Helmet, compression middleware

---

## 34. Multisport configuration

Each sport in the registry defines:

- Allowed game types and scoring presets
- Create templates (shared FE/BE via `Frontend/shared/createTemplates.ts`)
- Rotation formats
- Rating model and display system
- Live scoring rulebook
- Onboarding questionnaire
- Players per match constraints (e.g. Squash singles-only)

---

## 35. Testing & quality

- **Playwright E2E:** smoke, auth, games, find, chats, marketplace, profile, leagues, club-admin, two-user, link-preview specs
- **Vitest unit tests:** live scoring, game invite, group channel, queries, chat inbox/outbox/open, unread, stickers, stories, next-game / deep-link catalog, invites
- **Backend automated tests:** bracket structure, game results artifacts, service tests, sticker/giphy suites
- **Contract packages:** `packages/chat-contract`, `packages/unread-contract` (built in CI)
- **UI test plan:** `docs/UI_TEST_PLAN.md` — 1300+ manual test cases catalogued
- **CI:** `.github/workflows/ci.yml` — Node 24, lint/build + targeted FE suites + iOS shared packages job

---

## 36. Deployment & environments

- CI deploys backend + frontend on push to `master`
- PostgreSQL + Redis in production
- S3 for media
- Native app releases via `./scripts/app-release.sh` (Google Play + App Store, separate from web deploy)
- Production ops: `docs/PRODUCTION.md`
- SSH tunnels for prod DB access

---

## 37. Backend API surface (summary)

~400+ endpoints under `/api/*` across route modules mounted in `Backend/src/routes/index.ts`. Not exhaustive — grouped by domain:

| Domain | Key routes |
|--------|------------|
| Auth & identity | `/auth`, `/telegram`, `/me` (`/my-tab-data` aggregated home payload) |
| App | `/app` (`/version-check`, `/location`) |
| Users & social | `/users`, `/blocked-users`, `/favorites`, `/user-teams`, `/user-game-notes` |
| Geography & clubs | `/cities`, `/clubs` (incl. `/map`, reviews, per-club booktime/padeloo auth+snapshot), `/courts`, `/club-admin`, `/booktime`, `/padeloo` |
| Games | `/games`, `/game-teams`, `/game-courts`, `/game-subscriptions`, `/invites`, `/faqs`, `/training`, `/trainers` |
| Results & live | `/results` (incl. spectator token, live scoring, match timer, outcome explanation) |
| Leagues | `/leagues` |
| Chat | `/chat`, `/group-channels`, `/stickers`, `/giphy`, `/link-preview` |
| Media & stories | `/media`, `/stories` |
| Marketplace & economy | `/market-items`, `/bets`, `/transactions`, `/goods`, `/currency` |
| Ops | `/bugs`, `/ads`, `/weather`, `/push`, `/rankings`, `/level-changes`, `/admin`, `/logs` |

**Non-API:** `/health`, `/games/:gameId` OG/social meta tags for share previews, `/webhooks/replicate` (AI image callbacks).

---

## 38. Route reference (quick)

### Public / guest
`/login`, `/register`, `/login/:telegramKey`, `/games/:id`, `/user-profile/:userId`, `/games/:id/live` (+ spectator token), `/games/:id/broadcast`

### Authenticated main shell
`/`, `/find`, `/chats`, `/chats/marketplace`, `/bugs`, `/bugs/:id`, `/leaderboard`, `/profile`, `/games/:id`, `/games/:id/chat`, `/user-team/:id`, `/game-subscriptions`, `/marketplace`, `/marketplace/my`, `/marketplace/create`, `/marketplace/:id`, `/marketplace/:id/edit`, `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`

### Standalone authenticated
`/create-game`, `/create-league`, `/select-city`, `/profile/sessions`, `/profile/connected-clubs`, `/next-game` (redirect to next eligible game detail/chat/live via `?open=`), `/games/:id/live`, `/games/:id/live/tv`, `/games/:id/live/broadcast`, `/games/:id/broadcast`, `/games/:id/league-table`, `/games/:id/league-bracket`, `/my-clubs/*`

---

## 39. Platform & native UX matrix

| Capability | Web | iOS | Android | Watch | Telegram | Admin |
|------------|-----|-----|---------|-------|----------|-------|
| Core tabs & game flows | ✓ | ✓ | ✓ | — | browse only | — |
| PWA / service worker cache | ✓ | — | — | — | — | — |
| Apple Sign-In | — | ✓ | — | — | — | — |
| Google Sign-In | ✓ | — | ✓ | — | — | — |
| Push notifications | ✓ (web push where supported) | ✓ APNs | ✓ FCM | — | bot msgs | mass push |
| Inline chat reply from notification | limited | ✓ (+ token-only when killed) | ✓ (+ native replyToken) | — | — | — |
| Invite actions from notification shade | — | partial | ✓ game + team | — | inline buttons | — |
| Rich push (image/video/story thumb) | — | ✓ (+ NSE) | ✓ MessagingStyle | — | — | — |
| iOS Communication Notifications | — | ✓ when entitled | — | — | — | — |
| Alternate app icon + sport mascot | — | ✓ | ✓ | — | — | — |
| Live scoring | ✓ | ✓ | ✓ | ✓ | — | — |
| Home Next Game widgets | — | ✓ | ✓ | Watch: §11.2 | — | — |
| Siri / App Intents | — | ✓ | — | — | — | — |
| Android dynamic shortcuts | — | — | ✓ | — | — | — |
| Offline chat (IndexedDB outbox) | ✓ | ✓ | ✓ | — | — | — |
| External booking (Booktime / Padeloo) | ✓ | ✓ | ✓ | — | — | import courts |
| Deep links (Capacitor `appUrlOpen`) | — | ✓ | ✓ | — | login key | — |
| Hardware back button | browser back | ✓ | ✓ | — | — | — |
| Keyboard-aware dialogs/drawers | mobile web | ✓ | ✓ | — | — | — |
| App icon badge count | — | ✓ | ✓ | — | — | — |
| HealthKit workout bridge | — | via phone | — | ✓ | — | — |

### 39.1 Native deep link routes (Capacitor)

Handled in `useDeepLink.ts` for Bandeja URL hosts — same paths as web unless noted:

| Path pattern | Destination |
|--------------|-------------|
| `/games/:id`, `/games/:id/chat`, `/games/:id/live`, `/games/:id/live/tv`, `/games/:id/live/broadcast`, `/games/:id/broadcast`, `/games/:id/league-table`, `/games/:id/league-bracket` | Matching game routes |
| `/user-chat/:id`, `/group-chat/:id`, `/channel-chat/:id`, `/bugs/:id` | Chat threads (fresh open nonce) |
| `/user-profile/:id` | Profile (`?sport=` preserved) |
| `/user-team/:id` | Team page |
| `/marketplace`, `/marketplace/my`, `/marketplace/create`, `/marketplace/:id`, `/marketplace/:id/edit` | Marketplace (+ query string) |
| `/login/:telegramKey` | Telegram auto-login (deduped) |
| `/`, `/find`, `/chats`, `/profile`, `/leaderboard`, `/bugs`, `/game-subscriptions`, `/create-game`, `/create-league`, `/select-city`, `/login`, `/register` | Main / auth routes |
| `/next-game`, `/next-game?open=chat`, `/next-game?open=live` | Resolve next eligible game → detail / chat / live (`NextGameRedirect`, `@shared/nextGame` policy) |
| `/my-clubs/*` | Club admin |
| `/profile/connected-clubs`, `/profile/sessions` | Profile sub-pages (web; add if linked from native share) |

Push notification taps use the same route targets (games, chats, bugs, marketplace, teams, league schedule). Widget / Siri / shortcut taps typically land on `/next-game` or a concrete game path.

### 39.2 Native-only UX (not on desktop web)

- **Permission modals** — camera, photos library, geolocation when denied (`PermissionModalProvider`)
- **Native calendar add** — game details Add to calendar uses device calendar on Capacitor; web offers Google Calendar link + `.ics` download
- **Splash / loading mascot** — primary sport + selected app icon (e.g. tiger / racket variants per sport — `appIcons.ts`)
- **Story DM bar / keyboard** — Android uses plugin keyboard height for story reply composer
- **Capacitor secure token storage** — refresh token persistence
- **Siri / App Intents (iOS)** — up to 10 donated shortcuts (`BandejaAppShortcuts` / `assistantRegistry`): Find today/tomorrow, My games, next game, next-game chat/live, and related feature/entity intents — not next-game only
- **Android dynamic shortcuts** — next-game shortcuts (`DynamicGameShortcuts.java`) fed from the next-games envelope; also static feature shortcuts (`shortcuts.xml`)

### 39.3 Phone home-screen widgets

Separate from Apple Watch widgets (§11.2):

| Platform | Implementation | Data |
|----------|----------------|------|
| iOS | `BandejaHomeWidgets` + `BandejaNextGames` App Group package | Envelope written by `widgetNextGamesSync` / `WidgetBridgePlugin` |
| Android | `:bandeja-widgets` module + `WidgetBridgePlugin` | Same next-games JSON envelope |

- Policy for which game is “next”: `@shared/nextGame/policy` + golden fixtures; selection implemented by `Frontend/src/utils/pickNextGame.ts`
- Tap → `/next-game` or `/next-game?open=chat|live` (web + Capacitor)
- Cleared on logout (`clearWidgetNextGamesCache`)

---

## 40. Not shipped / manual-only

| Item | Notes |
|------|-------|
| `/rating` route | Commented out in `App.tsx` — no user-facing rating page |
| Virtual goods shop UI | `PURCHASE` via API only; no in-app catalog browser |
| External wallet top-up | No payment provider checkout in app |
| Full Capacitor OAuth matrix | Apple/Google sign-in on device — manual QA |
| Telegram OTP / bot flows | Manual unless test env provides deterministic keys |
| Every sport × template combo | Sample in QA; full set in `@shared/createTemplates` + parity tests |
| Holland auction edge timing | Scheduler-driven; manual verification on slow clocks |
| Watch standalone without phone | Requires paired iPhone + same account |

---

*Last updated from codebase inventory, July 2026.*
