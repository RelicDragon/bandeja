# PadelPulse UI Test Plan

> End-to-end and manual UI test catalog for the web app. Based on routes (`App.tsx`), tabs (`MainPage`, `BottomTabBar`), and feature modules in `Frontend/`.

---

## 1. Scope & goals

### In scope
- Web app (Vite dev / preview) — primary automation target
- Responsive layouts: mobile viewport, desktop split views, landscape game details
- All authenticated main tabs: **My**, **Find**, **Chats**, **Market**, **Leaderboard**, **Profile**
- Standalone flows: create game/league, game details, live scoring, club admin
- Auth: login, register, logout, sessions, OAuth (where testable on web)

### Out of scope / manual-only (initially)
- Native Capacitor plugins (camera, push, Apple/Google sign-in on device)
- Real payment / wallet top-up with external providers
- Telegram bot OTP flows (unless test env provides deterministic keys)
- Full multisport matrix (run sampled sports, not every template × sport)

### Definition of done (per release)
- **P0 smoke** passes on staging with seeded data
- **P1 core journeys** pass for at least 2 user personas (player + admin/owner)
- No regressions on chat send/receive and game join/leave

---

## 2. Recommended tooling

| Layer | Tool | Notes |
|-------|------|-------|
| E2E | **Playwright** | Aligns with `docs/AUTO_TEST_PLAN.md` Phase 4 |
| Auth bootstrap | API fixture + `storageState` | Faster than UI login every test |
| DB | Seeded staging / disposable CI DB | Needs City, clubs, 4+ users for live scoring |
| Selectors | `data-testid` on high-churn UI | Add incrementally to modals, tabs, CTAs |
| Visual | Optional screenshot diff | Stories, live board — high maintenance |

**Suggested layout**

```
Frontend/e2e/
  fixtures/          # auth, users, games
  pages/             # Page Object Model
  specs/
    smoke/
    auth/
    onboarding/
    games/
    find/
    chats/
    bugs/
    marketplace/
    profile/
    social/
    leagues/
    club-admin/
    two-user/          # C2C / dual-browser specs (@two-user)
  .auth/
    user-a.json        # User A storageState
    user-b.json        # User B storageState
  playwright.config.ts
```

---

## 3. Test data & personas

### Minimum seed requirements

| Entity | Count | Purpose |
|--------|-------|---------|
| City | ≥1 | Registration, Find, marketplace |
| Clubs + courts | ≥2 | Create game, filters |
| Users | ≥4 | Full game, live scoring, invites |
| Games | mixed | open, full, private, past, league season |
| Market listings | ≥3 | buy-now, auction, free |
| Chats | ≥1 each type | user, game, group, channel, bug |

### Personas

| ID | Role | Key permissions |
|----|------|-----------------|
| `P1` | Regular player | join games, chat, profile |
| `P2` | Game owner | edit game, invite, manage queue |
| `P3` | Admin | private games filter, bug channel |
| `P4` | Club admin | `/my-clubs/*` |
| `P5` | New user | no sports enabled, name not set |
| `P6` | Trainer | profile reviews tab |
| `P7` | Guest (logged out) | public pages, login prompts |
| `P8` | Blocked relationship | A blocked B — chat/follow restrictions |

### Precondition tags (use in test names)
- `@auth` — logged in
- `@guest` — logged out
- `@desktop` — viewport ≥1024
- `@mobile` — viewport 390×844
- `@offline` — network disabled
- `@seed:games` — requires game fixtures
- `@two devices` — iPhone (Capacitor or web) + paired Apple Watch on same account
- `@watch` — Apple Watch scoring app (BandejaWatch)

---

## 4. Global / shell tests

### 4.1 App bootstrap

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| G-01 | Cold load authenticated | Open `/` with valid session | Home (My tab), bottom tabs visible |
| G-02 | Cold load unauthenticated | Open `/` | Redirect to `/login` |
| G-03 | Unknown route | Open `/foo` | Redirect to `/` |
| G-04 | Blocking app update | Mock version check blocking | Blocking update modal, no app content |
| G-05 | Optional app update dismiss | Optional update shown | Dismiss → app usable |
| G-06 | Offline gate | Go offline on non-exempt route | `NoInternetScreen` |
| G-07 | Offline exempt routes | Offline on `/games/:id`, `/user-profile/:id`, `/login` | Page still loads cached/shell |
| G-08 | Profile name gate | User with `nameIsSet !== true` tries join/create | Name modal blocks action |
| G-09 | Primary sport gate | User without enabled sports | Redirect from `/` and `/find` to `/profile` |
| G-10 | Bottom tab navigation | Tap each tab | Correct route + active state |
| G-11 | Tab unread badges | Seed unread game + chat + market | Badges on My, Chats, Market |
| G-12 | Pull to refresh | Pull on My / Find / Profile | Spinner sits in blank gap below header (not over stories/content); list refreshes, no crash |
| G-13 | Deep link game | Open `/games/:id` | Game details loads |
| G-14 | Deep link game chat | Open `/games/:id/chat` | Game chat thread opens |
| G-15 | Deep link user chat | Open `/user-chat/:id` | DM thread opens |
| G-16 | Deep link marketplace item | Open `/marketplace/:id` | Item drawer/detail |
| G-17 | Player card overlay | URL with player overlay param | Bottom sheet opens |
| G-18 | i18n switch | Change language in profile | UI strings update |
| G-19 | Dark/light theme | Toggle theme | Persisted appearance |
| G-20 | Desktop split chat | `@desktop` open `/chats` + select thread | List + thread side by side |
| G-21 | Home URL subtab sync | Open `/?tab=past-games`; legacy `/?tab=list`, `/?tab=advanced` | Past subtab selected; legacy list/advanced URLs redirect to calendar |
| G-22 | Find URL view sync | Open `/find?view=list` | Find list view active |
| G-23 | Chats filter URL sync | Open `/chats?filter=channels`, `/chats/marketplace`, `/bugs` | Correct inbox filter |
| G-24 | Player overlay URL | Open any page with `?player=:userId` | Player card bottom sheet |
| G-25 | Marketplace item overlay | Open page with `?item=:id` | Item drawer opens |
| G-26 | Overlay dismiss | Close player/item overlay | Query param removed, page unchanged |
| G-27 | Re-tap Find tab | On Find, tap Find again | Jumps to today / current date |
| G-28 | Cache clear on refresh | Pull-to-refresh on My/Find | Refetch without dropping unsynced results |

### 4.2 Onboarding gates & prompts

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| OG-01 | Profile name gate | `@P5` join / create / invite action | `NameSetModal` blocks until name saved |
| OG-02 | Name gate resume | Save name in gate modal | Pending action completes |
| OG-03 | Primary sport gate | User needs primary sport | `PrimarySportSetModal` shown |
| OG-04 | Gender prompt banner | User without gender set | Banner on home/find; opens `GenderSetModal` |
| OG-05 | Gender prompt dismiss | Dismiss gender banner | Banner hidden; mixed-gender games may stay limited |
| OG-06 | City prompt banner | User with auto-city, after sport gate | `CityPromptBanner` on home |
| OG-07 | Welcome questionnaire | New user, city set | `WelcomeQuestionnairePrompt` shown |
| OG-08 | Welcome questionnaire skip | Skip welcome flow | `welcomeScreenPassed` set, prompt gone |
| OG-09 | Sport questionnaire | Incomplete per-sport Q | `SportQuestionnairePrompt` on home |
| OG-10 | Sport questionnaire complete | Finish questionnaire | Prompt removed; levels updated |

---

## 5. Authentication & onboarding

### 5.1 Login (`/login`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| A-01 | Phone login happy path | Phone + password → submit | Home, token stored |
| A-02 | Invalid credentials | Wrong password | Error message, stay on login |
| A-03 | Already authenticated | Visit `/login` while logged in | Redirect to `/` |
| A-04 | Phone tab navigation | Switch main ↔ phone tab | Form visible |
| A-05 | Register link | Click register | `/register` |
| A-06 | Google OAuth return | `?google_code=` mock exchange | Login success (web) |
| A-07 | Google OAuth error | `?google_error=` | Error shown |
| A-08 | Telegram auto-login route | `/login/:telegramKey` | Auto login or error |
| A-09 | EULA link | Open terms | External/legal page opens |
| A-27 | Android Google login stable session | Capacitor Android: logout → Google sign-in → complete | Lands on My tab; no bounce back to `/login` within 10s |
| A-28 | Android Telegram login stable session | Capacitor Android: logout → Telegram bot link → open app deep link | Lands on My tab; no bounce back to `/login` within 10s |

### 5.2 Register (`/register`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| A-10 | Full registration | All required fields + EULA | Account created, logged in |
| A-11 | Validation errors | Submit empty form | Field errors, scroll to first |
| A-12 | Password mismatch | Different confirm | Error on confirm |
| A-13 | Phone format | Phone without `+` | Validation error |
| A-14 | Gender prefer-not-to-say | Without acknowledgment | Blocked |
| A-15 | Primary sport selection | Pick sport at register | Saved on profile |
| A-16 | Optional email invalid | Bad email format | Validation error |

### 5.3 City selection (`/select-city`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| A-17 | New user auto-city | Fresh user, sport confirmed, `cityIsSet: false`, auto-assigned city | `CityPromptBanner` on home; `/select-city` redirects home |
| A-18 | City already set @auth | `cityIsSet: true` | Redirect home |
| A-19 | Pick city | Auto-detect failed, after sport gate | Redirect to `/select-city`; profile updated |

### 5.4 Logout & sessions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| A-20 | Logout from profile | Profile → Logout | `/login`, session cleared |
| A-21 | Sessions list | `/profile/sessions` | Devices listed, current marked |
| A-22 | Revoke other session | Revoke non-current | Removed from list |
| A-23 | Revoke current session | Revoke this device | Logout + redirect login |
| A-24 | Sign out all devices | Confirm sign out all | Logout everywhere |
| A-25 | Session persistence | Reload after login | Still authenticated |
| A-26 | Token refresh | Expire access token | Silent refresh, no logout |

---

## 6. My tab (Home `/`)

### 6.1 Layout & sub-views

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-01 | Calendar view | Open My tab | Calendar + games render; Bookings / Teams / Leagues switch row below stories |
| H-54 | My tab panel switcher | Logged in → My tab below stories | One switch row: Bookings (ticket), List, Teams, Leagues; none selected by default |
| H-55 | My tab panel single select | Tap Bookings then Teams | Bookings panel animates out; Teams panel animates in; only Teams highlighted |
| H-57 | My tab panel switcher counts | User with bookings, teams, and leagues | Bookings / Teams / Leagues buttons show matching counts; hidden when zero |
| H-02 | Calendar date select | Pick date on calendar | Games for that day |
| H-41 | Selected date heading | Pick date on My tab calendar | Long localized date (e.g. "Thursday, 11 June") with Today/Tomorrow badge shown below calendar; updates on re-select, localized per language |
| H-40 | Overflow month day select | Navigate month → tap gray adjacent-month cell with game badge | Selected day highlights; that day's games in list (not upcoming sections) |
| H-03 | Empty my games | User with no games | Empty state |
| H-04 | Stories rail visible | Logged in home | Stories bubbles render |
| H-05 | Sport questionnaire prompt | Incomplete questionnaire | Prompt shown, links to flow |
| H-06 | City prompt banner | User missing city prefs | Banner shown |
| H-07 | Gender prompt banner | When applicable | Banner + action |
| H-08 | User teams section | User in teams | My tab → Teams switch shows teams row |
| H-09 | Your leagues section | User in leagues | My tab → Leagues switch shows league cards |
| H-10 | League game sections collapse | My tab → Leagues → league hub with scheduled/unscheduled games → tap section header | Section collapses/expands with chevron; both sections expanded by default |
| H-11 | Mark all read banner | Unread games exist | Banner + action clears counts |

### 6.2 Invites

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-12 | View pending invite | Seed invite | Card shows game info |
| H-13 | Accept invite | Accept | Joined game, invite gone |
| H-14 | Decline invite | Decline → confirm modal | Invite removed |
| H-15 | Decline with note | Add note in modal | Note saved |
| H-16 | Invite note on game | Save note without accept/decline | Persisted |

### 6.3 My games interactions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-17 | Open game from list | Tap game card | `/games/:id` |
| H-18 | Unread badge on game | Game with chat unread | Badge on card |
| H-19 | Create game entry | Header/FAB create | `/create-game` with entity picker |
| H-20 | Create from calendar date | Select date → create | Pre-filled date |
| H-36 | Selected date shows archived/finished | User with FINISHED and ARCHIVED games on a past calendar day | Select that day on My tab calendar; both FINISHED and ARCHIVED games appear under Finished section |

### 6.4 Stories

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-21 | Open story viewer | Tap story bubble | Fullscreen viewer |
| H-22 | Story navigation | Tap next/prev | Changes slide |
| H-23 | Create story sheet | Tap own bubble / header action | Create sheet opens |
| H-24 | Photo story publish | Pick photo → publish | Appears in rail |
| H-25 | Video story publish | Pick video → publish | Appears in rail |
| H-26 | Story engagement | Like / comment (if enabled) | Count updates |
| H-27 | Report story comment | Report flow | Modal submits |
| H-42 | Story DM reply lands in user chat | Open another user's story → type DM text → send → open user chat with owner | Message in DM thread shows story thumbnail card + "Replied to your story"/"You replied to their story" label above the bubble |
| H-43 | Story quick-reaction emoji reply | Open another user's story → focus DM input → tap one of the six quick emojis | Emoji sent to DM with same story-reply card; flyout animation plays in viewer |
| H-44 | Story reply card without media | Reply to GAME_CREATED/GAME_RESULT story without photo | DM shows story-reply label with placeholder thumbnail; tap does nothing harmful |
| H-45 | Story editor live drag WYSIWYG | Photo editor → add text/sticker → drag it (mouse and touch) | Layer follows the pointer live on the visible preview, no jump on release |
| H-46 | Story editor live resize/rotate WYSIWYG | Select layer or photo → drag transformer corner / rotate handle | Preview scales/rotates live; final state matches preview during gesture |
| H-47 | Story text edit wrap parity | Type long text (incl. one very long unbroken word) in text overlay → commit | Line breaks in edit overlay identical to committed canvas text; long word breaks instead of overflowing |
| H-48 | Published story matches editor preview | Add text + sticker + adjust filter → move/scale them → publish → view own story | Viewer shows pixel-equivalent composition (positions, sizes, styles, filters) to the editor preview |
| H-49 | Story layer drag clamp | Drag text/sticker hard toward screen edge | Layer stops at canvas padding; preview and hit target stay aligned |
| H-50 | Story layer max scale clamp | Scale sticker/text past max via corner handle | Preview and handle stop at max scale without overshoot jump on release |
| H-51 | Rotated story text edit | Add text → rotate → double-tap to edit | Edit overlay keeps rotation while typing; committed text unchanged |
| H-52 | Story text edit canvas preview | Type in text overlay (classic/neon/outline/gradient/blackBox) | Visible glyphs match canvas/export renderer, not CSS approximation |
| H-53 | Story photo rotate snap live | Select photo → rotate with handle near 0°/90° | Rotation snaps live in preview, not only on release |

### 6.5 Home subtabs & URL

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-28 | Past games subtab | Header → Past (History) | Past games list only (no stories, bookings, invites, or banners); load more when available; URL `/?tab=past-games` |
| H-29a | Past games empty | User with no past games → Past subtab | Empty state "No past games" |
| H-31 | Calendar subtab default | Open home | Calendar view default; no `tab` query param |
| H-32 | URL deep link Past | `/?tab=past-games` | Past subtab selected |
| H-33 | Subtab survives refresh | On Past subtab → reload | Same subtab + query param preserved |
| H-34 | Restore calendar after create | Create game from calendar | Returns to calendar + game date selected |
| H-35 | Invite friend to app | `InviteFriendToBandejaButton` | Share sheet / copy invite link |
| H-37 | Club booking connect banner (My tab) | User in city with BOOKTIME club, not connected | Tap Bookings switch → connect banner → settings page |
| H-40 | Club booking connect banner dismiss | User sees connect banner via Bookings switch | Close (×) hides banner; does not reappear for same user |
| H-38 | Club booking upcoming cards (My tab) | Connected user with upcoming bookings | Tap Bookings switch → up to 3 cards + "See all" below cards |
| H-38a | Adjacent booking group (My tab) | User with 2+ back-to-back slots same court | Bookings switch → grouped card with date + time chips; tap highlights card and expands per-slot rows with actions; tap another card collapses first |
| H-38e | Upcoming bookings via switch (My tab) | Connected user with upcoming bookings | Bookings switch toggles panel open/closed with animation |
| H-38b | Linked game on booking card (My tab) | Upcoming booking linked to one game | Single tappable "Linked game" chip; no duplicate "Also used in" line |
| H-38c | Booking times use club TZ | Club city TZ ≠ Europe/Belgrade; upcoming booking on My tab or connected-clubs page | Wall-clock times match club city TZ (not Belgrade default) |
| H-38d | Booking card prices (My tab) | Connected user with priced upcoming booking(s) | Single card shows slot price from booking list; grouped adjacent slots show per-slot price on chips and summed total on card header (no separate price loading state) |
| H-38g | Past booking card price | Connected user with past booking(s) on connected-clubs page | Expand past section → past card shows price top-right when get-previous returns a positive amount; no price label when list sends 0 or omits price |
| H-38h | Past booking card actions | Past booking without linked game | Tap card → "Link to game" animates in; one expanded at a time; tap again collapses; linked-game cards stay static with chip visible |
| H-38i | Full-slot linked booking actions | Upcoming booking linked to game(s) whose times fully cover the slot | Linked game chip(s) shown; Link more + Create game hidden; Cancel still available when policy allows |
| H-38j | Booking slot occupancy pill | Upcoming booking with partial or full linked game coverage | Small % pill beside slot time; grouped adjacent card shows weighted % across all slots |
| H-38f | Standalone booking card actions (My tab) | Connected user with at least one non-grouped upcoming booking | Tap standalone card → link/create/cancel actions animate in and card highlights; tap another standalone card → first collapses, second expands; tap same card again → actions collapse |
| H-38k | Grouped booking card actions (My tab) | Connected user with adjacent same-court upcoming slots | Tap grouped card → per-slot rows animate in with link/create/cancel; only one card expanded at a time; tap again collapses |
| H-38l | Bookings integrations shortcut (My tab) | Connected user with upcoming bookings on My tab | Gear icon beside "See all" → `/profile/connected-clubs?tab=integrations` with Integrations subtab active; "See all" still opens Bookings subtab |
| H-58 | My tab games list view | My tab → tap List in panel switcher | Games calendar animates out; upcoming + finished game sections; preference persists after reload |
| H-59 | My tab games calendar view | Deselect List or select Bookings/Teams/Leagues | Calendar animates back; games calendar mode unless List selected again |
| H-39 | My tab bookings refresh | Switch away from My tab and back | Upcoming bookings refetched from club booking system |

---

## 7. Find tab (`/find`)

### 7.1 Views & date navigation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-01 | Calendar view default | Open Find | Calendar + games |
| F-02 | List view | Switch to list | Scrollable list |
| F-03 | Date prev/next | Chevron navigation | Games update |
| F-04 | Month calendar expand | Open month picker | Range changes |
| F-05 | Go to today | Header action | Jumps to current date |
| F-06 | Desktop calendar split | `@desktop` | Split layout |
| F-37 | Overflow month day select | Navigate month → tap gray adjacent-month cell with game count badge | Games for that day appear in list |
| F-38 | Selected date heading | Select date on Find calendar (mobile + `@desktop` split) | Long localized date with Today/Tomorrow badge below calendar; updates when another date selected |

### 7.2 Category filters (chips)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-07 | Games filter | Toggle games | Only games shown |
| F-08 | Training filter | Toggle training | Training events |
| F-09 | Tournament filter | Toggle tournaments | Tournaments only |
| F-10 | Leagues filter | Toggle leagues | League seasons |
| F-11 | User-created filter | Toggle user games | Filters creator |
| F-12 | Combined filters | Multiple toggles | AND behavior correct |

### 7.3 Advanced filters panel

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-13 | Open filters panel | Tap filter icon | Panel opens |
| F-14 | Club filter | Select club(s) | Games at club only |
| F-15 | Favorite clubs shortcut | Use favorites in panel | Clubs pre-selected |
| F-16 | Time range filter | Set start/end time | Games outside range hidden |
| F-17 | Level range filter | Adjust min/max level | Out-of-range hidden |
| F-18 | Sport filter | Switch primary/all sport | API refetch with sport; club list matches sport |
| F-20 | No-rating filter | Enable no-rating | Only casual games |
| F-21 | Show private games | `@admin` toggle | Private games appear |
| F-22 | Reset filters | Reset button | Defaults restored |
| F-23 | Filter persistence | Set filters → reload | Filters restored from storage |
| F-42 | Available slots filter | Enable available slots toggle | Full games hidden |
| F-43 | Suitable rating filter | Enable suitable rating toggle | Out-of-band level games hidden |
| F-44 | Hide bar games | Enable hide bar games toggle | Bars section hidden; bar games excluded |

### 7.4 Game discovery actions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-24 | Open game details | Tap card | Navigate to game |
| F-25 | Quick join from Find | Join button on card | Joined + toast + navigate |
| F-26 | Join queue | Full game with queue | Added to queue toast |
| F-27 | Join blocked no name | `@P5` join attempt | Name gate modal |
| F-28 | Trainers list section | Training filter on | Trainers carousel visible; hint “tap a trainer to filter” |
| F-29 | Empty find results | Filters with no match | Empty state |
| F-37 | Trainer without slots filters | Training filter → tap trainer chip body (no count badge) | “Trainings by …” banner; list empty with trainer-specific no-slots message |
| F-38 | Trainer avatar opens profile | Training filter → tap trainer avatar (with or without slots) | Player card opens; trainer filter unchanged |
| F-30 | Change city from header | Find header city button → `CityModal` | City changes; games refetch |
| F-31 | Filter button active state | Apply any advanced filter | Filter button highlighted |
| F-32 | Favorite trainer highlight | `@user with favoriteTrainerId` + training filter | Favorite trainer games emphasized on calendar |
| F-33 | Gender-restricted game card | MEN/WOMEN/MIX game | Gender badge on card |
| F-34 | Join blocked wrong gender | User gender incompatible | Error toast / join blocked |
| F-35 | Level out of range | User level outside game range | Join blocked or warning |
| F-36 | Confirmed court badge on card | Game with `timeIsSet`, `hasBookedCourt`, club + court, no `externalBookingId` | Blue “Booked” pill (no checkmark) after time on game card |
| F-39 | Linked booking badge on card | Game with `bookingStatus=EXTERNAL_FULL` (Find tab / available games or game details) | Green “Booked” pill with checkmark after time on game card |
| F-40 | Booking row also-used-in pill | Link same booking to second game | Booking row shows soft pill with other game name(s) |
| F-41 | Game card badge partial external link | Game with `bookingStatus=EXTERNAL_PARTIAL` | Blue “Booked” pill (no checkmark) after time on game card |

---

## 8. Create game (`/create-game`)

### 8.1 Entry & entity types

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-01 | Invalid create route | `/create-game` without state | Redirect home |
| C-02 | Create GAME | Pick GAME intent | Wizard loads |
| C-03 | Create BAR | Pick BAR | Bar-specific fields |
| C-04 | Create TRAINING | Pick TRAINING | Trainer fields |
| C-05 | Create TOURNAMENT | Pick TOURNAMENT | Roster/tournament defaults |
| C-06 | Duplicate game | From game details duplicate | Pre-filled form |
| C-07 | Bottom tabs hidden | On create page | Tab bar hidden |
| C-08 | Back navigation | Back button | Returns home |

### 8.2 Template & format wizard

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-09 | Sport selector | Multi-sport user switches sport | Format limits update |
| C-10 | Template picker | Select template | Format + rating defaults applied |
| C-11 | Game format wizard | Open/close wizard | Scoring preset saved |
| C-47 | Golden point deuce count | Create/edit classic game → Set structure step → pick Off / At 40–40 / After 1–4 deuces | Setting saved on game; live scoring uses advantage until threshold then sudden death at 40–40; watch matches web |
| C-12 | Rating vs social game | Toggle affects rating | Flag persisted on create |
| C-40 | Non-default match format | Padel → singles (1v1) or tennis → doubles (2v2) in participants setup | Format card summary shows Singles/Doubles; expanded details show Teams format row with 1v1/2v2 hint |
| C-41 | Padel singles templates | Create padel game → participants 1v1 → open format templates | Match tab: Best-of-3 (Official) + Single set; Social tab: Singles Americano (24 pts) when roster ≥4 |
| C-42 | What game collapsed | Create GAME with template picker → default load | “What game” section collapsed; only selected template card visible; gender + rating badges stay in section header row; setup-format button and inline pickers hidden |
| C-44 | What game collapse scroll | Expand section → tap collapse chevron | Section scrolls to top; header stays visible |
| C-45 | Create with participants-only chat | Enable “Participants-only chat” toggle → create game | Game chat has Participants + Organizers tabs with localized system messages |
| C-46 | Participants-only chat toggle default | Open create game settings | Toggle off by default; not persisted in game payload |
| C-43 | What game expand/collapse | Tap chevron or collapsed card | All template cards animate open; collapse hides non-selected; selected card stays on top |

### 8.3 Core fields

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-13 | Club selection | Pick club | Courts load |
| C-47 | Club modal sport filter | Create game with sport TENNIS → open club modal | Only clubs with TENNIS in `sports` or matching/null-sport courts listed |
| C-48 | Court grid sport filter | Pick multi-sport club → view court grid (create-game or game-details edit) | No Padel/Tennis sport switcher tabs; only courts for game sport (+ null-sport courts) shown |
| C-49 | Sport change clears club | Pick padel-only club → switch sport to TENNIS | Club/court/booking selection cleared; club picker empty |
| C-50 | Sport change prunes courts | Multi-sport club, padel courts selected → switch to TENNIS | Padel court selections removed; TENNIS courts remain selectable |
| C-51 | Booktime tennis courts (Elite/KSC) | Create TENNIS game → Elite Padel or KSC | Elite: Tennis Court 1–5 listed; KSC: Tennis Court 1–4 + Betonski teren listed; padel halls (Court 1–7) not shown |
| C-13a | Club booking connect banner | Open club detail for BOOKTIME club, not connected | Connect banner shown |
| C-13b | Club booking OTP connect | Phone + OTP (existing account) | Connected chip; GET auth has no tokens |
| C-13c | Club booking connect hidden | BOOKTIME club already connected | No connect banner |
| C-13d | Club booking cold-start refresh | Open create-game or club detail for BOOKTIME club with stale/missing snapshot | Brief "Updating club availability…" while snapshot refresh runs; banner hides after booked-courts returns (warning banner if live refresh unavailable) |
| C-13e | Club booking no sync banner | Unconnected user, empty scout pool, no snapshot today | "No sync yet today" or scout-pool degraded banner |
| C-13f | Club booking availability sheet | Open BOOKTIME club detail with mapped courts | Free slot grid per court; duration toggle matches club API `bookingDurations` |
| C-13t | Integrated club duration options | Create GAME or TOURNAMENT at BOOKTIME club | Duration buttons match club API (e.g. 1h/2h only); tournament extras (3h/4h/6h) hidden when unsupported |
| C-13g | Club availability slot → create-game | Tap free slot on club detail availability grid | Navigates to `/create-game` with club/court/time prefilled; no API book on club detail |
| C-13h | Club booking last sync | After snapshot refresh on club detail | "Last synced …" shown on availability section |
| C-13i | External booking unmapped courts hidden | Club has unmapped external booking courts | Only mapped courts appear in availability sheet |
| C-13j | Club browse grid copy | Open BOOKTIME club detail availability | Title + browse hint; no in-sheet book confirm dialog |
| C-13k | Club booking slot taken | _(club-detail book removed)_ | N/A — slot-taken handled on create-game confirm step 1 |
| C-13l | Club booking cancel | Connected user → upcoming list → cancel | Policy confirm modal; booking removed; snapshot refreshes |
| C-13m | Club slot → create-game prefill | Tap slot on availability grid | Create-game opens with club/court/time; reservation ON if integrated + live API |
| C-13n | Club booking create game soft link | Create game from booking row (`locationTimeMode=bookings&bookingIds=…`) | Bookings tab active; game saved with `hasBookedCourt: true` and `linkedBookings` |
| C-13o | Club booking cancel linked game warn | Cancel booking that has linked game | Success + non-blocking "Your game is still on the calendar" + Open game |
| C-13q | Club booking signup connect | ConnectClubSheet → new user signup + OTP | Account created; connected chip shown |
| C-13r | Club booking create-game grid refresh | Open create-game for BOOKTIME club with stale snapshot | Banner then red external cells after snapshot PUT |
| C-13s | Club booking scout pool degraded | Unconnected user, empty scout pool | "Live availability unavailable" banner on create-game/club detail |
| C-13u | BOOKTIME court name labels | Open club detail, availability sheet, or court picker for BOOKTIME club where Bandeja court name differs from BookTime resource name | Primary label shows Bandeja court name; smaller integration name on same row |
| C-13v | BOOKTIME create-game time grid | Create GAME at BOOKTIME club on a day with gaps in `get-available-slots` (e.g. 08:00–10:00, 12:00–19:00) | Time picker shows only starts inside available ranges for selected duration; gap times (fiesta/blocked) absent; reserved gaps show as club-booked |
| C-13w | Create-game scheduling layout | Open create-game, pick BOOKTIME club + integrated court | Single location & start card: club → date → court → reservation card → auth or duration → time |
| C-13x | Integrated court opt-out toggle | BOOKTIME club, pick integrated court(s) on Time slots tab | "Don't book real court" switch + hint animate in; OFF by default (will reserve); ON skips real booking and shows full club time grid (not API-only slots); red external cells selectable; deselect integrated court or pick non-integrated court only → switch animates out |
| C-14p | Don't select court time grid | BOOKTIME club, tap "Don't select court" | Full club schedule; red external cells selectable and saveable; no bookable-days strip |
| C-14q | Opt-out save on external overlap | Don't book real court ON; pick slot overlapping red external booking | Save succeeds (info banner ok); no hard-block toast |
| C-13y | Create-game reserve CTA | Pick integrated court(s), connected, live API, opt-out OFF | CTA "Create game & reserve court" |
| C-13z | Create-game inline auth gate | Reservation ON, not connected | Date visible; duration/time hidden; phone OTP inline; opt-out reveals normal grid |
| C-14a | Create-game confirm morph | Reservation ON, connected, pick slot → Create | Single dialog: review → reserve → create → success → calendar |
| C-14b | Create-game bookable days strip | Reservation ON, connected | Date strip only (no calendar); days clamped to club `bookableDays` |
| C-14c | Create-game no overlap when reserving | Reservation ON | No yellow/red overlay; overlap gate skipped on submit |
| C-14d | Create-game slot taken on confirm | Slot taken between confirm and API | Step 1 error; dialog closes to time grid |
| C-14e | Create-game snapshot block | Reservation ON, `noSyncToday` banner | Confirm disabled until snapshot usable |
| C-14r | Create-game sync banner false positive | BOOKTIME club, user connected (bookings visible on My bookings); open create-game and select club | No amber "sync isn't active" banner while availability loads; banner only if snapshot refresh actually fails |
| C-14f | bookingIds deep link | Open create-game from booking row (`locationTimeMode=bookings&bookingIds=…`) | Bookings tab active; row pre-selected; preselected banner; no book confirm |
| C-14g | Create-game confirm closes on edit | Open confirm; change time/court/date | Dialog closes automatically |
| C-14h | Create-game !liveApiEnabled | BOOKTIME club without scout/connection | No reservation UI; generic time grid |
| C-14i | Create-game rollback on create fail | Reservation ON; force game create API error after successful book | Confirm shows create-failed copy; court reservation rolled back (or rollback-failed message if cancel fails) |
| C-14j | Create-game no request loop | Reservation ON, connected; open create-game for BOOKTIME club | Snapshot/slots/club fetches settle once per date/court change — no repeating network storm |
| C-14k | Create-game court grid occupancy | Pick club with multiple courts; change date | Court picker is inline grid (not dropdown); each compact card shows court name (+ indoor icon) and integration name on the left, smaller occupancy ring on the right with fill % for selected date |
| C-14l | Create-game multi-court selection | Set max participants > 4; open court grid | Hint shows required court count; tap toggles courts up to min(ceil(participants/4), club courts); numbered badges on selected cards |
| C-14m | Create-game multi-court create | Create game with 2+ courts selected | Game created with `courtIds`; primary `courtId` is first; gameCourts populated |
| C-14n | Create-game selected time summary | Pick club + date + duration; tap a time slot | Below time grid, card shows selected start → end and duration badge; updates when time or duration changes |
| C-14o | Create-game direct create overlay | Create without reservation pipeline (no integrated book confirm) | Page fades; fullscreen creating overlay; brief success; navigates to calendar |
| C-14 | Court not booked | Select "Don't book court" | Allowed |
| C-15 | Court booked | Pick court | Overlap warning if conflict |
| C-16 | Mark court booked modal | Confirm booking | Court marked |
| C-17 | Segmented switch (integrated club) | Pick BOOKTIME club on create | "Pick a time" \| "Bookings" labels visible on both tabs |
| C-18 | Time slots + integrated court | Select integrated court on Time slots tab | Opt-out toggle; default reserves on create; toggle ON creates game only with full schedule and selectable red cells |
| C-19 | Bookings tab multi-select | Bookings tab; select N reservations | Derived min–max window; live counter |
| C-19a | Bookings tab club TZ display | Create-game Bookings tab at club whose city TZ ≠ Europe/Belgrade | Booking row wall-clock matches My bookings for same reservation |
| C-20 | Override time on Bookings tab | Toggle adjust game time | Expand animates; create uses shorter window |
| C-21 | Multi-court confirm 2 steps | 2 integrated courts → Create | Stepper: 2 reserve steps + create; rollback on fail |
| C-22 | Deep link bookingIds | `?locationTimeMode=bookings&bookingIds=uuid` | Bookings tab; row selected; preselected banner |
| C-22a | Adjacent bookings picker group | Create game → Bookings tab with 2+ consecutive same-court slots | Adjacent slots shown as one grouped card; tap selects all slots and reveals per-slot rows; deselect respects min selection |
| C-23 | Tab switch discard | Dirty selection on tab → switch | Confirm discard modal |
| C-24 | Date/time | Change start + duration | End time updates |
| C-25 | Level range slider | Adjust range | Min ≤ max |
| C-26 | Max participants | Change count | Roster options update |
| C-27 | Fixed teams toggle | Enable for doubles | Team setup shown |
| C-28 | Game name & description | Fill name and description in one section | Saved on submit |
| C-29 | Price section | Set price type/currency/total | Saved correctly |
| C-30 | Avatar upload | Upload game image | Preview shown |
| C-31 | Invite players | Open player list → select | Invites sent on create |
| C-32 | Participants setup tags | Configure setup | Tags on game |
| C-33 | Multiple courts | Enable multi-court | Court count selector |
| C-34 | Submit create | Complete valid form | Game created → details page |
| C-35 | Validation errors | Submit incomplete | Errors shown, no create |
| C-36 | Floating summary bar | Fill club/time/etc., scroll down past those sections | Animated chip bar appears under header summarizing scrolled-out values (sport, roster, format, club, date·time·duration·court, participants/level, name, price) |
| C-37 | Summary chip scroll-back | Tap a chip in the summary bar | Page smooth-scrolls back to that section; chip disappears once section is visible |
| C-38 | Summary bar empty values | Scroll past sections with nothing entered (no name, price not known) | No chip shown for empty sections; bar hidden when no chips |

### 8.4 Create league (`/create-league`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-29 | League basic info | Name, city, club, season | Form valid |
| C-30 | League format wizard | Configure format | Saved |
| C-31 | Season avatar | Upload season image | Preview |
| C-32 | Create league submit | Valid form | League season game created |
| C-33 | Anyone-can-invite toggle | Enable on create | Saved; non-owner participants can invite |
| C-34 | Gender teams setting | Set MEN/WOMEN/MIX | Saved on game |
| C-35 | Fixed teams + multi-court | Enable both | Correct roster/court UI |
| C-36 | Invite as trainer only | TRAINING + player picker | Only trainers listed |
| C-37 | Player list level filter | Filter invite list by level | Filtered players |
| C-38 | Player availability icon | View invite list | Availability indicator on rows |
| C-39 | Booking overlap warning | Booked court conflict | Warning before submit |

---

## 9. Game details (`/games/:id`)

### 9.1 View & access

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-01 | Public game guest view | `@guest` open public game | Info visible, limited actions |
| GD-02 | Private game non-participant | `@P1` private game | Access denied / limited |
| GD-03 | Desktop split view | `@desktop` landscape | Split layout |
| GD-04 | Share game | Share modal | Link/copy works |
| GD-05 | FAQ tab | Game with FAQs | FAQ content |
| GD-06 | Photos section | Upload/view photos | Gallery works |
| GD-06a | Open photos API | FINAL game, `forbidOthersPhotosView` off; anonymous `GET /games/:id/photos` | Returns photo list (200) |
| GD-06b | Open photos UI guest | Same game; guest opens game details and games list | PhotosSection and GameCard thumbnail visible without login |
| GD-06c | Restricted photos | FINAL + `forbidOthersPhotosView` on; stranger or anonymous | Gallery and thumb hidden; participant sees gallery |
| GD-06d | Photos before FINAL | Game with `resultsStatus` not FINAL | Nobody sees photos section or card thumb (any viewer) |
| GD-06e | Photo privacy toggle | FINAL game with visible Photos section; owner/admin toggles in gallery header | Setting persists; visibility matches matrix |
| GD-06f | Photo upload permissions | Participant uploads; stranger cannot upload/set main | Upload/set-main succeed for participant/admin only |
| GD-07 | Open game chat | Chat button | `/games/:id/chat` |
| GD-73 | Scroll-more hint | Open long game details; scroll partway down | Bottom gradient + bouncing chevron; hides at page bottom |
| GD-74 | Scroll-more hint tap | Tap chevron on long game details | Smooth scroll to bottom; hint hides when at bottom |
| GD-75 | Scroll-above hint | Scroll down on long game details | Top gradient + bouncing chevron up; hides at page top |
| GD-76 | Scroll-above hint tap | Tap top chevron on long game details | Smooth scroll to top; hint hides when at top |
| GD-78 | Date/time info row layout | Open game with `timeIsSet` on wide viewport; repeat on narrow | Wide: date and time on one row with vertical divider; narrow: stacked rows |
| GD-79 | Time period clock icon | Open game with `timeIsSet` and start/end times (e.g. 18:00–20:00) | Clock icon shows golden period arc with primary-colored outline matching the displayed time range |
| GD-80 | Sport tag placement | Open game details | Sport and match-format tags appear in main app header between Back and Chat |
| GD-81 | Compact game details back | Narrow viewport; game with sport + format tags and Chat visible | Back shows arrow only (no label) so tags and Chat fit on one row |
| GD-82 | Game info collapse handle | Open game details; tap chevron strip at bottom edge of info card | Card collapses to compact summary with smooth height animation; chevron rotates |
| GD-83 | Collapsed info tap-to-expand | Collapse info card; tap anywhere on the collapsed summary | Card expands; detail rows animate in with stagger; action buttons reappear |
| GD-86 | Linked bookings section | Game with `linkedBookings` at BOOKTIME-integrated club; viewer owns linked reservation in Booktime | Collapsible “From your reservations” card below game info; header shows link count + coverage badge; expand reveals rows; hidden for other viewers, guests, or when club unset / not integration-enabled |
| GD-89 | Linked bookings coverage badge | Game with linked bookings where count or booking window does not cover game courts/time; viewer owns linked reservation | Section header shows blue “Not fully booked” badge |
| GD-90 | Linked bookings fully covered badge | Game with enough linked bookings spanning full `startTime`–`endTime` for required courts; viewer owns linked reservation | Section header shows green check “Fully booked” badge |
| GD-103 | Linked booking status in game info (non-owner) | Game with `linkedBookings`; viewer is not the Booktime reservation owner (participant, guest, or other user) | “From your reservations” section hidden; game info club row shows green “Fully booked” or blue “Not fully booked” badge instead of manual court booked text |
| GD-87 | Linked booking refresh (owner) | Game details linked booking that exists in viewer's Booktime account | Refresh icon on row; success toast if still active |
| GD-88 | Linked booking absent unlink | Refresh when booking gone from viewer's Booktime account | Modal explains link removal; game stays; confirm removes link from this game |
| GD-91 | Delete game with linked bookings | Owner deletes game with `linkedBookings` → confirm → second modal | Lists linked reservations; explains club bookings stay active; "Delete anyway" proceeds |
| GD-92 | Delete game without linked bookings | Owner deletes game with no `linkedBookings` | Single confirm modal only; delete proceeds immediately |
| GD-93 | Court cameras section visible | FINAL game on court(s) with `webCameraUrl` | “Court cameras” card lists each court with “Web camera” link; link opens URL |
| GD-94 | Court cameras section hidden | Game not FINAL, or FINAL but no played court has `webCameraUrl` | Court cameras section absent; web camera link absent from game info club row |
| GD-97 | Participants chat section visible | Owner opens game before participant chats enabled | “Participants-only chat” card with create button |
| GD-98 | Enable participant chats | Tap create → confirm | Section animates away; game chat shows Participants + Organizers tabs with system messages |
| GD-99 | Parent admin enable participant chats | League owner opens child game | Same as GD-98 |
| GD-100 | Participants chat section hidden | Open game after chats enabled | Section absent |
| GD-101 | Non-admin no participants chat section | Regular playing participant | Section not shown |
| GD-102 | NON_PLAYING private chat unread | NON_PLAYING participant; new message in Participants (PRIVATE) tab | Game chat badge increments; push delivered when not viewing chat |

### 9.2 Participation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-08 | Join open game | Join CTA | Participant added |
| GD-09 | Leave game | Leave → confirm | Removed |
| GD-10 | Decline pending invite | From participants | Invite declined |
| GD-11 | Join queue | Full game | Queue position shown |
| GD-12 | Owner accept queue | Accept queued user | User becomes participant |
| GD-13 | Owner decline queue | Decline queued user | Removed from queue |
| GD-14 | Cancel own queue request | Cancel queue | Removed |
| GD-15 | Invite players | Owner opens player list → invite | Pending invites shown |
| GD-16 | Cancel invite | Owner cancels pending | Invite removed |
| GD-17 | Guest join chat only | Join as guest | Chat access without full join |
| GD-18 | Carousel vs list participants | Toggle view mode | Layout switches |

### 9.3 Edit game (owner/admin)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-19 | Edit general info | Edit modal → general tab | Name/description updated |
| GD-20 | Edit location & time tab | Edit modal → Location & time | Single tab replaces Where+When; club picker visible; tab label not truncated; bookings/time slots switch visible on open (no auto-scroll past it) |
| GD-20b | Edit opt-out full schedule | BOOKTIME game, integrated court, toggle "Don't book real court" ON (or Don't select court) | Full club time grid; red external cells selectable and saveable; same as create-game opt-out |
| GD-20a | Edit game change club | Edit modal → Location & time → change club | Club modal opens; new club selected; courts refresh for new club |
| GD-20c | Edit club modal sport filter | TENNIS game → edit Location & time → open club modal | Only TENNIS-capable clubs listed |
| GD-20d | Edit legacy club kept | TENNIS game at club no longer supporting TENNIS → edit Location & time | Current club still shown in picker; user must change club or pick compatible court |
| GD-20e | Edit court grid sport filter | TENNIS game at multi-sport club → edit Location & time | Court grid shows TENNIS + null-sport courts only; courts API called with `sport=TENNIS` |
| GD-20f | Edit prunes incompatible courts | Multi-sport game with padel court saved → club gains sport tags → reopen edit modal | Incompatible court selections cleared when modal opens |
| GD-20g | Edit sport mismatch rejected | API: update game `clubId` or `courtId` to sport-incompatible venue | 400 with sport mismatch message |
| GD-21 | Edit with linked bookings | Game with `linkedBookings` | Bookings list only; no time slots switch |
| GD-22 | Edit unlink last booking | Remove last linked reservation | Dual subtab unlocks; `hasBookedCourt` clears; amber hint that club booking stays active; save asks to confirm unlink without auto-cancel |
| GD-22a | Edit unlink save confirm | Edit modal → unlink reservation → Save | Confirm modal warns real booking is not cancelled; save unlinks only |
| GD-23 | Edit price | Price tab | Price fields updated |
| GD-23 | Edit level range | Level modal | Min/max saved |
| GD-24 | Edit max participants | Max participants modal | Capacity updated |
| GD-25 | Edit game format | Format wizard (pre-results) | Format updated |
| GD-95 | Format summary for read-only viewer | Open padel game pre-results as participant without format edit rights, or non-participant who can view the game | “What kind of game?” picker hidden; format card shows title + summary (includes gender label when not Any); tap help icon expands full format details; no pencil; no gender row below card |
| GD-96 | Format picker for editor | Open same game as owner/admin or `resultsByAnyone` playing participant | “What kind of game?” picker shown; can change template / format |
| GD-82 | Fixed pairs roster section | Open padel game with fixed pairs enabled, 4+ even roster, no results | Standalone Fixed Pairs card below format; team slots editable; no toggle in format card |
| GD-83 | Fixed pairs section hidden | Same game after results start, or `hasFixedTeams` off, or odd roster | Fixed Pairs card absent |
| GD-77 | Non-default match format display | Game with padel singles or tennis doubles | Format section summary + expanded details show non-default match format |
| GD-26 | Edit blocked after results final | `@finished` | Edit disabled |
| GD-27 | Archive/cancel game | Owner cancel flow | Status archived/cancelled |

### 9.4 Results & scoring

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-28 | Enter set results | Results tab → enter scores | Saved locally + server |
| GD-84 | Rally match set score (TT Bo3×11) | Table tennis game with Bo3×11 template → enter set score 11:4 | Accepted and saved (first-to-11 per set, not americano total-11 budget) |
| GD-29 | Conflict resolution | Conflicting entries | Conflict modal |
| GD-30 | Submit results | Finalize results | Status updates |
| GD-31 | Recalculate results | Owner recalc | Standings update |
| GD-32 | Training level edit | Training game → level modal | Levels updated |
| GD-33 | Live scoring link | Open live board | `/games/:id/live` |
| GD-34 | TV mode | `?tv=1` on live | TV layout/theme |
| GD-35 | Broadcast view | `/games/:id/broadcast` | Broadcast layout |
| GD-36 | Results share card hidden without photo | Final results, no game photo yet | No share card or share CTA; Play again still available |
| GD-36b | Results share card with photo | Add/generate photo, open Results tab | Share card preview shows photo; Share results card succeeds |
| GD-37 | Game results artifact | Photo/story from results | Artifact flow |

### 9.5 Bets

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-38 | View bets section | Game with bets | Bet cards listed |
| GD-39 | Create bet | Open create bet modal | Bet appears |
| GD-40 | Accept bet | Participant accepts | Status updated |
| GD-41 | Resolve bet | Owner resolves | Wallet/rating side effects |
| GD-42 | Real-time bet update | `@two browsers` socket | UI updates without reload |
| GD-81 | Challenge actions locked after results start | Game with `resultsStatus` IN_PROGRESS or FINAL | Create / accept / edit / cancel challenge controls hidden; existing bets still visible |
| GD-82 | Format section hidden after results start | Game with results entered (`IN_PROGRESS` or `FINAL`) | “What kind of game?” / format card not shown; format summary still visible in scores tab when editing |

### 9.6 League season specifics

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-43 | League tabs | general/schedule/planner/standings/faq | Tab content |
| GD-44 | Schedule tab | View/fixtures | Round list |
| GD-45 | Planner tab | `@participant` | Planner accessible |
| GD-46 | Standings tab | View table | Standings correct |
| GD-47 | Fullscreen league table | `/games/:id/league-table` | Fullscreen table |
| GD-48 | Fullscreen bracket | `/games/:id/league-bracket` | Bracket view |
| GD-49 | Edit league teams | Team assignment modal | Teams saved |
| GD-50 | Playoff configuration | Playoff wizard | Bracket generated |
| GD-51 | Walkover / BYE handling | Set walkover | Bracket updates |
| GD-52 | Club favorite toggle | Star on club in game info | Favorited state persists |
| GD-53 | Club mini map | Game with geo | Map renders |
| GD-54 | User game note | Add private note from game info card, game card, or modal | Note saved; only visible to self |
| GD-55 | Edit/delete game note | Update note content | Persisted / deleted |
| GD-56 | Game settings panel | Toggle anyoneCanInvite, visibility, etc. | Settings saved |
| GD-57 | Manage users modal | Owner opens manage users | Roles/kick actions available |
| GD-58 | Kick participant | Kick user from game | Removed from roster |
| GD-59 | Kick admin | Owner kicks admin participant | Role change / removal |
| GD-60 | Reduce max participants | Edit max → kick overflow users | Capacity enforced |
| GD-61 | Navigate to parent league | Open league fixture (`parentId`) | Link to season game works |
| GD-85 | League match settings hidden | Open `LEAGUE` fixture as owner/admin before results | Game Settings section absent; season (`LEAGUE_SEASON`) still shows settings when editable |
| GD-86 | League season sport levels | Tennis league season; player with padel 4.0 / tennis 2.5 | Standings, bracket, planner, fixture roster show tennis 2.5; Admin game modal shows tennis level for league fixture participants |
| GD-62 | Pending trainer invite | TRAINING without trainer | Pending trainer row + accept flow |
| GD-63 | FAQ edit (owner) | Edit game FAQs | Content saved |
| GD-64 | Announced game results gate | Enter results on ANNOUNCED game | Confirm modal before entry |
| GD-65 | Reset results | Owner reset all results | Confirm → cleared |
| GD-66 | Sync conflict modal | Local + server results diverge | Choose sync-to-server or load-from-server |
| GD-67 | Outcome explanation | Tap level change explanation | `OutcomeExplanationModal` shows delta |
| GD-68 | Finish results confirm | Finish results action | Confirmation modal |
| GD-69 | Edit finalized results | Edit after finish | Danger confirm modal |
| GD-70 | BAR level changes display | Finished BAR game | Per-player level before/after on list |
| GD-71 | Training review submit | Post-training review | Rating saved on trainer profile |
| GD-72 | Training level/reliability edit | Trainer edits participant levels | `EditLevelModal` saves |
| GD-73 | Empty trainer invite links | TRAINING, no trainer, owner/admin | "No trainer" row + "Invite trainer" row below; both open invite picker |

---

## 10. Live scoring (`/games/:id/live`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LS-01 | Open live board | From game as scorer | Court UI loads |
| LS-02 | Point for team A/B | Tap scoring buttons | Score increments |
| LS-03 | Undo last point | Undo action | Score reverts |
| LS-04 | Change server | Serve indicator | Correct server side |
| LS-05 | End set / start next | Set completion | New set state |
| LS-06 | Match completion | Finish match | Final state |
| LS-07 | Sport variants smoke | Sample: padel, badminton, pickleball, squash, table tennis | Sport-specific court renders |
| LS-08 | Spectator token | `?spectatorToken=` | View without auth |
| LS-09 | Keep awake / orientation | Mobile live | Board usable landscape |
| LS-10 | Socket sync | `@two clients` score on one | Other updates live |

### 10.1 Apple Watch live scoring & serve guide

Server source of truth: live session in `Match.metadata.liveScoring` (revision + serve seed); serve **display** derived on device; match timer in separate `Match.timer*` columns (see LS-25).

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LS-11 | Unified session — phone serve setup | `@two devices` phone completes first-serve setup while `@watch` scoring open | Watch serve overlay dismisses; serve strip matches phone at same revision |
| LS-12 | Unified session — hide serve guide | `@two devices` `@watch` long-press hide serve coach | Phone serve strip hides after sync; watch does not re-prompt |
| LS-13 | Serve setup skip cross-device | `@two devices` phone skips serve setup | Watch scoring opens without serve overlay |
| LS-14 | Offline live outbox replay | `@two devices` `@offline` score 3+ points on `@watch` → reconnect | Server revision includes all points in order; no duplicates |
| LS-15 | Offline 409 merge | `@two devices` conflicting score while `@watch` outbox replays | Watch applies server envelope; no duplicate points; no error modal |
| LS-16 | WC relay phone → watch | `@two devices` score on phone with iPhone nearby | `@watch` updates within ~1s (not poll-only lag) |
| LS-17 | WC relay watch → phone | `@two devices` score on `@watch` | Phone live board updates via socket/HTTP |
| LS-18 | Serve guide display parity | `@two devices` after shared points at same revision | Serve strip / court side identical on phone and watch (derived, not stored) |
| LS-19 | Poll fallback without phone | `@two devices` remote scorer on web; watch without iPhone nearby | `@watch` reflects remote scores within ~2s |
| LS-20 | Poll skip on fresh relay | `@two devices` score on phone → WC delivers revision | `@watch` does not flash stale score on next poll |
| LS-21 | Strict kitchen fault sync | `@two devices` strict pickleball — kitchen fault on phone | `@watch` score + serve rotation correct after sync |
| LS-22 | Strict let blocks scoring | `@two devices` strict badminton — let on phone | `@watch` scoring disabled until replay confirmed |
| LS-23 | Watch-initiated strict fault | `@two devices` let/fault on `@watch` | Appears on phone live board |
| LS-24 | Match timer relay | `@two devices` pause/resume timer on phone | `@watch` timer bar reflects within ~1s |
| LS-25 | Timer vs live scoring domains | `@two devices` pause timer on phone while scoring continues on `@watch` | `Match.timer*` updates separately from `metadata.liveScoring`; both UIs stay consistent |
| LS-26 | Dual-writer attribution | `@two devices` phone scores while `@watch` scoring open | Brief non-blocking “updated from phone” notice once per remote revision |
| LS-27 | Attribution silent 409 merge | `@two devices` conflict merge on `@watch` | No attribution toast spam |
| LS-28 | Fix starting server | `@watch` fix starting server (confirm if games played) | Serve setup overlay; corrected seed syncs to phone |
| LS-29 | Tie-break change ends | `@two devices` enter in-set tie-break on one device | Other device serve strip shows change-ends cue |
| LS-30 | Pickleball rally rotation | `@two devices` rally points with `pointWinnerLog` | Serve rotation matches across devices |
| LS-31 | Table edit clears live session | Edit match results in table while live open on another client | Live session cleared/reconciled; watch/phone reflect final table state |
| LS-32 | Serve guide golden CI | Run `npm run test:live-scoring` + `ios/scripts/run-watch-serve-guide-golden-tests.sh` | TS `computeServeGuideSnapshot` and Watch `ServeGuideEngine` match shared fixture catalog |
| LS-33 | Mid-match serve setup gate | `@watch` Open scoring when live envelope has points but no serve seed | Setup overlay blocks scoring until resolved or skipped; matches web `needsServeSetup` (#178 edge) |
| LS-34 | Finish match persists score | `@watch` Score several games → Finish Match → confirm on review (optional: `@two devices` phone on same live game) | Review and saved results match scored sets; no reset to 0–0 during review/save |

---

## 11. Chats (`/chats`, thread routes)

### 11.1 Inbox & filters

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-01 | Users filter default | Open chats | DM + game chats |
| CH-02 | Channels filter | Switch to channels | City channels |
| CH-03 | Market filter | Switch to market | Market-related threads |
| CH-04 | Bugs filter | `@admin` bugs filter | Bug threads |
| CH-05 | Search users | Type in search | Matching users/chats |
| CH-06 | Unread filter toggle | Show unread only | Filters list |
| CH-07 | Contacts mode | Toggle contacts | City users list |
| CH-08 | Start new DM | Pick user → chat | `/user-chat/:id` |
| CH-09 | Load more pagination | Scroll list end | More threads load |
| CH-10 | Empty inbox | New user no chats | Empty state |
| CH-11 | Muted chat indicator | Mute thread | Muted badge/state |

### 11.2 Thread types

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-12 | User DM | Send text | Message appears |
| CH-13 | Game chat | Open from game | Game context header |
| CH-69 | Game chat type tab switch | Game with multiple channels (PUBLIC/PHOTOS/etc.) → switch tabs | Message pane slides/fades to new channel; thin loading pulse during fetch; each tab restores its scroll; re-tapping active tab does not animate |
| CH-14 | Group chat | Open group | Member list accessible |
| CH-15 | Channel chat | Open channel | Read/post per permissions |
| CH-16 | Bug chat | `@admin` bug thread | Bug context panel |
| CH-17 | Market chat | From listing | Market context panel |

### 11.3 Messaging features

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-18 | Send text message | Type + send | Optimistic + confirmed |
| CH-19 | Send emoji | Emoji picker | Emoji in message |
| CH-20 | Reply to message | Reply action | Threaded reply |
| CH-21 | Edit message | Edit own message | Updated content |
| CH-22 | Delete message | Delete own | Removed/hidden |
| CH-23 | Reaction | Add reaction on user or system message (e.g. join/leave) | Reaction strip visible; emoji persists |
| CH-24 | Pin message | Pin (if permitted) | Pinned bar shows |
| CH-25 | Unpin message | Unpin | Bar updates |
| CH-26 | Forward message | Forward to another chat | Appears in target |
| CH-27 | Copy text | Copy action | Clipboard content |
| CH-28 | Send image | Attach image | Image message renders |
| CH-29 | Send video | Attach video | Upload + transcode state |
| CH-30 | Fullscreen media | Tap image/video | Viewer opens |
| CH-30a | Copy fullscreen image | Open image viewer → tap copy | Desktop/native: “Image copied” toast; paste works. Mobile web without clipboard image API: share sheet opens with “Choose Copy or Save…” toast |
| CH-31 | Send voice (if enabled) | Record voice | Audio message |
| CH-32 | Create poll | Poll composer | Poll message |
| CH-33 | Vote on poll | Select option | Vote count updates |
| CH-34 | View poll voters | Open voters modal | Voter list |
| CH-35 | Auto-translate | Enable translate | Translated text shown |
| CH-36 | Draft persistence | Type without send → leave → return | Draft restored |
| CH-37 | Offline send queue | `@offline` send | Queued state + retry on online |
| CH-38 | Failed send retry | Force failure → resend | Message sends |
| CH-39 | Read receipts | Open thread | Unread clears |
| CH-40 | Scroll to replied | Tap reply preview | Scrolls to original |
| CH-41 | Load older messages | Scroll up | Pagination loads history |
| CH-42 | Jump to pinned | Tap pinned bar | Scrolls to message |
| CH-61 | Message grouping | Send 3+ messages within 4 min from one sender | Tight spacing; avatar bottom-aligned on last only; sender name on first only; asymmetric bubble corners (small radius between grouped bubbles) |
| CH-62 | Group break | Same sender after >4 min gap or different sender/day | New group: full corners, avatar + name shown again |
| CH-63 | Queued-offline send icon | `@offline` send message | Amber clock icon on bubble (not red alert); tap opens resend/delete menu |
| CH-64 | Queued banner offline | `@offline` with unsent message | Gray "Queued — will sync when you're back online" banner under header; turns into amber tap-to-retry when back online with failures |
| CH-65 | Offline thread access | Go offline → open previously visited chat thread | Cached history renders (no full-page No Internet screen); composer queues sends |
| CH-66 | New message entry animation | Receive/send message near bottom | Message fades + slides in smoothly; no scroll jump |
| CH-67 | Date separator pill | Scroll across day boundary | Rounded pill date label (Today/Yesterday/date) centered between days |
| CH-68 | Mid-history scroll stability | Long thread → scroll up into history; wheel/trackpad with pauses | View stays anchored on the same messages; no abrupt jumps when row heights settle or tail preloads |

### 11.4 Group/channel settings

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-43 | Group settings page | Open settings | Settings load |
| CH-44 | Invite to group | Invite modal | Members added |
| CH-45 | Leave group | Leave confirm | Removed from group |
| CH-46 | Mute notifications | Toggle mute | Mute persisted |
| CH-47 | Channel join | Join public channel | Participant flag set |
| CH-48 | Channel context panel | Open side panel | Metadata shown |

### 11.5 Desktop/mobile layout

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-49 | Mobile full-screen thread | `@mobile` select chat | Full screen, no split |
| CH-50 | Desktop split persist | Select chat → resize splitter | Layout preserved |
| CH-51 | Back from thread mobile | Back | Returns to list |
| CH-52 | Create bug report | Bugs filter → add bug | `BugModal` → bug thread created |
| CH-53 | Bugs filter panel | Panel closed by default; non-admin: Created by me on + all statuses; admin: Created by me off + open statuses only | List matches defaults; open panel → multi-select status chips → list updates |
| CH-54 | Pin chat from list | Pin DM/group | Pinned ordering |
| CH-55 | Mute chat from list | Mute thread | Mute persisted; notifications suppressed |
| CH-56 | Unmute from thread | Thread settings unmute | Mute cleared |
| CH-57 | Reply thread | Reply to message | Reply count + scroll-to-parent |
| CH-58 | Blocked user DM | `@blocked` user | Cannot message / hidden content |
| CH-59 | `/chats/marketplace` route | Direct nav | Market filter inbox |
| CH-60 | Channel with market filter | `/channel-chat/:id?filter=market` | Market filter active |
| CH-61 | Group settings page | Navigate to group settings | Member/admin actions |
| CH-62 | Kick from group settings | Admin kicks member | Member removed |
| CH-63 | Bug chat video attach (iOS) | `@mobile` Capacitor iOS → bug thread → attach gallery MOV | Video accepted; compress toast; message sends |

---

## 12. Marketplace (`/marketplace`)

### 12.1 Browse & filters

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| M-01 | List loads | Open marketplace | Shimmer skeleton grid, then cards stagger in |
| M-02 | My listings | `/marketplace/my` | Seller's items only; horizontal slide transition from Market |
| M-03 | Category filter | Select category | Pill slides; grid dims then new cards animate in |
| M-04 | City filter | Change city | Items for city |
| M-05 | Sport filter | Change sport context | Categories update |
| M-06 | Search | Text search | Matching items |
| M-07 | Pagination / infinite scroll | Scroll down / Load more | More items animate in |
| M-08 | Unread on card | Item with chat unread | Badge shown |
| M-09 | Empty marketplace | City with no items | Empty state card with icon + hint |

### 12.2 Create / edit listing

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| M-10 | Create buy-it-now | `/marketplace/create` | Listing created |
| M-11 | Create auction rising | Auction + end date | Auction live |
| M-12 | Create Holland auction | Holland type + interval | Config saved |
| M-13 | Create suggested price | Consider offers | No fixed price |
| M-14 | Create free item | Free type | Price hidden |
| M-15 | Validation errors | Missing title/category/city | Blocked |
| M-16 | Image gallery upload | Add multiple photos | Gallery preview |
| M-17 | Draft restore | Fill form → leave → return | Draft from localStorage |
| M-18 | Edit own listing | `/marketplace/:id/edit` | Updates saved |
| M-19 | Edit others listing | `@P1` edit `@P2` item | Blocked / redirect |
| M-20 | Delete/deactivate listing | Seller action | Removed from browse |

### 12.3 Item detail & transactions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| M-21 | Open item drawer | Tap card | Detail drawer with drag handle; content fades in |
| M-22 | Deep link item | `/marketplace/:id` | Redirect + drawer |
| M-23 | Item not found | Invalid id | Not found UI |
| M-24 | Place bid | `@auction` bid modal | Bid accepted |
| M-25 | Bid too low | Below minimum | Validation error |
| M-26 | View bid history | View bids | List of bids |
| M-27 | Real-time auction update | `@two users` bid | Price updates live |
| M-28 | Buy it now | Instant purchase flow | Status sold |
| M-29 | Suggest price / offer | Chat offer flow | Message in market chat |
| M-30 | Contact seller | Open chat from item | Market thread |
| M-31 | Currency display | User currency ≠ item | Converted display |
| M-32 | Confirm remove listing | Delete own item | `ConfirmRemoveMarketItemModal` → removed |
| M-33 | Holland auction live drop | `@two users` watch Holland auction | Price drops on interval |
| M-34 | Mark sold / deactivate | Seller ends listing | Hidden from browse |
| M-35 | Overlay open item | `buildUrl` with `?item=` on marketplace | Drawer without full navigation |

---

## 13. Profile (`/profile`)

### 13.1 Tabs

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PR-01 | General tab | Default profile | Settings visible |
| PR-02 | Statistics tab | Switch tab | Stats charts/numbers |
| PR-03 | Comparison tab | Switch tab | Comparison UI |
| PR-04 | Followers tab | Switch tab | Followers list |
| PR-05 | Reviews tab | `@trainer` | Reviews visible |
| PR-06 | Reviews hidden | Non-trainer | Tab not shown |

### 13.2 General settings

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PR-07 | Avatar upload | Upload photo | Avatar updates |
| PR-08 | Remove avatar | Remove button | Avatar cleared |
| PR-09 | View original avatar | Eye button | Fullscreen viewer |
| PR-10 | First/last name autosave | Edit name | Saving indicator → saved |
| PR-11 | Email edit | Change email | Validation + save |
| PR-12 | Verbal status | 32 char limit | Counter + save |
| PR-13 | Bio | 128 char limit | Save |
| PR-14 | Gender set once | Change gender | Rules enforced |
| PR-15 | Weekly availability | Toggle schedule grid | Saved |
| PR-61 | Availability reset 24/7 | Set evening-only schedule → "Reset to 24/7", or clear then weekdays+weekends | Stays 24/7; does not revert to evening |
| PR-16 | Availability visibility | Public/private toggle | Saved |
| PR-17 | Profile sports section | Enable/disable sports | Primary sport updated |
| PR-18 | Sport levels display | Per-sport levels | Badges update |
| PR-62 | Table tennis / squash questionnaire | Profile → add sport → Take questionnaire → answer all 5 questions | Completes without validation error; sport level assigned |
| PR-19 | Change city | City modal | City updated |
| PR-20 | Phone/password change | If exposed in UI | Auth updated |
| PR-21 | Language selector | Pick language | i18n + profile saved |
| PR-22 | Theme selector | Light/dark/system | Theme applied |
| PR-23 | Online status toggle | Show/hide online | Preference saved |
| PR-24 | Notification settings modal | Open + toggle prefs | Saved |
| PR-25 | Wallet modal | Tap wallet badge | Balance + actions |
| PR-26 | Send money to user | From wallet/user profile | Transfer flow |
| PR-27 | Link Apple account | OAuth link | Linked state |
| PR-28 | Unlink Apple | Confirm unlink | Removed |
| PR-29 | Link/unlink Google | Same as Apple | |
| PR-30 | OAuth merge modal | Duplicate account detect | Merge flow |
| PR-31 | Blocked users section | `@user with blocks` | List + unblock |
| PR-32 | App icon carousel | Change app icon | `@native` manual; tiger uses primary-sport mascot (padel default); racket unchanged |
| PR-63 | Tiger icon + primary sport | Profile → set primary sport to tennis (tiger icon selected) | Footer mascot + `@native` home-screen icon show tennis tiger; switch primary to padel → padel tiger |
| PR-64 | Branding on load/splash | User with tennis primary + tiger icon → cold start / pull-to-refresh loading | Tab footer, `AppLoadingScreen`, iOS overlay splash, Android launch splash show tennis mascot |
| PR-33 | Delete account | Delete → double confirm | Account deleted + logout |

### 13.3 Other profile routes

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PR-34 | User profile page | `/user-profile/:userId` | Public profile |
| PR-35 | User profile sport query | `?sport=` param | Correct level sport |
| PR-36 | Follow/unfollow | From profile | State toggles |
| PR-37 | Open player card | Tap avatar in list | Bottom sheet |
| PR-38 | Player card common groups | View shared groups | Listed |
| PR-39 | Invite player from card | Invite action | Invite sent |
| PR-40 | Follow user | Star/follow on profile/card | Added to favorites |
| PR-41 | Unfollow user | Unfollow action | Removed from favorites |
| PR-42 | Follow blocked user | `@blocked` target | Action disabled with message |
| PR-43 | Block user | Block from profile | Confirm → blocked |
| PR-44 | Unblock user | Blocked users section | User unblocked |
| PR-63 | Following list primary-sport level | Multi-sport user (tennis primary, padel global level higher) on another user's followers/following list | Level badge shows tennis profile level, not padel `User.level` |
| PR-45 | Send money from card | Player card → send money | `SendMoneyToUserModal` transfer |
| PR-46 | Wallet transaction history | Open wallet modal | Balance + history visible |
| PR-47 | Level history panel | Statistics → level history | Per-sport history chart |
| PR-48 | Edit sport level on profile | `ProfileSportsSection` level edit | Level saved |
| PR-49 | Comparison tab pick player | Comparison → select opponent | Head-to-head stats load |
| PR-50 | Comparison sport switch | Change sport in comparison | Stats refetch for sport |
| PR-51 | Trainer reviews tab | `@P6` reviews tab | Reviews list + summary |
| PR-52 | Public profile guest view | `@guest` open `/user-profile/:id` | `PublicGamePrompt` / limited stats |
| PR-53 | Share user profile | Share button | `ShareModal` with profile URL |
| PR-54 | Display preferences | 12h/24h, date format toggles | Affects game time display app-wide |
| PR-55 | Competitive vs social badge | User with both levels | Correct badge for sport context |
| PR-56 | Bookings settings entry | Profile → Bookings | Navigates to `/profile/connected-clubs` |
| PR-57 | Bookings page tabs | Profile → Bookings | Segmented switch Bookings/Integrations centered; Bookings default |
| PR-57a | Bookings tab | Bookings tab with connected clubs | All upcoming across clubs with club name; one linked-game chip per link (opens game); no "Also used in" duplicate; Link to game dialog lists announced games with recommended match |
| PR-57a1 | Adjacent booking group (settings) | Bookings → Bookings tab with consecutive same-court slots | Grouped card with date + per-slot time chips; tap highlights and expands each slot row; only one expanded at a time |
| PR-57a2 | Standalone booking card actions (settings) | Bookings → Bookings tab with non-grouped upcoming booking | Tap standalone card → actions animate in; only one expanded at a time; tap again collapses |
| PR-57a3 | Past booking card actions (settings) | Bookings → expand Past section; unlinked past booking | Same tap-to-expand "Link to game" behavior as upcoming standalone cards |
| PR-57b | Integrations tab | Integrations tab | Club list with connect/disconnect state; hint card |
| PR-57c | Link booking to game (happy path) | My tab → Bookings → Link to game → pick game (confirm reschedule if times differ) | Single request succeeds; success toast; game shows linked booking with correct time/club |
| PR-57d | Link booking to game (failure) | Link to game while offline or on already-linked booking | Error toast; no partial link (game unchanged if request failed) |
| PR-57e | Bookings back navigation | My tab → See all → back; Profile → Bookings → back | Browser back returns to previous screen (My tab or Profile) |
| PR-59 | Club account disconnect | Bookings page → Integrations tab → Disconnect | Toast "Club account disconnected"; club shows connect CTA |
| PR-60 | Club booking cancel from settings | Settings page upcoming → cancel booking | Same policy modal + snapshot refresh as club detail |

---

## 14. Leaderboard (`/leaderboard`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LB-01 | Leaderboard loads | Open tab | Rankings list |
| LB-02 | Sport filter | Switch sport | Rankings refetch |
| LB-03 | City scope | City-specific board | Filtered players |
| LB-04 | Open player from row | Tap player | Profile/card |
| LB-05 | Empty leaderboard | No ranked players | Empty state |
| LB-06 | Current user highlight | User in list | Highlighted row |

---

## 15. User teams (`/user-team/:id`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| UT-01 | Team page loads | Open team | Roster + info |
| UT-02 | Team from home section | Tap team card | Team page |
| UT-03 | Edit team (captain) | Edit name/avatar | Saved |
| UT-04 | Invite member | Invite flow | Pending member |
| UT-05 | Leave team | Leave confirm | Removed |
| UT-06 | Full-height mobile layout | `@mobile` | Layout fills screen |

---

## 16. Game subscriptions (`/game-subscriptions`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GS-01 | List subscriptions | Open page | Subscriptions shown |
| GS-02 | Create subscription | Add form | New subscription |
| GS-03 | Edit subscription | Edit existing | Updated |
| GS-04 | Delete subscription | Delete confirm | Removed |
| GS-05 | Club filter in form | Pick clubs | Saved filters |

---

## 17. Club admin (`/my-clubs/*`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CA-01 | My clubs entry | FAB / link | Club list |
| CA-02 | Club home | Select club | Dashboard |
| CA-03 | Schedule page | View schedule grid | Courts × time |
| CA-04 | Block slot | Block slot sheet | Slot blocked |
| CA-05 | Edit hold | Edit hold sheet | Updated |
| CA-06 | Cancel game from schedule | Cancel sheet | Game cancelled |
| CA-07 | Reservations page | View reservations | List loads |
| CA-08 | Courts page | CRUD court | Court saved |
| CA-17 | Court sport assignment | Club admin → All courts → add or edit court | Sport picker shows only club-enabled sports; saved sport appears on list row with icon and label; legacy courts without sport remain editable |
| CA-09 | Settings page | Club settings | Updates persist |
| CA-10 | View as player | Preview modal | Player perspective |
| CA-11 | Coach marks | First visit | Hints shown once |
| CA-12 | Club booking sync status banner | BOOKTIME club schedule, snapshot stale/missing | "Updating club availability…" or "No sync yet today" or "Last synced …" |
| CA-13 | External booking unmapped courts warning | Club with unmapped external booking snapshot courts | Amber banner with count + link to All courts |
| CA-14 | External booking unassigned lane | Schedule date with `courtId: null` snapshot busy | "Unassigned" column shows external busy slots |
| CA-15 | External booking on grid | Mapped external booking busy in snapshot | Red external slots on matching court columns |
| CA-16 | Club booking integration down | Snapshot load failure | "Club system unavailable" banner; app games/blocks still shown |

---

## 18. Cross-cutting & edge cases

### 18.1 Permissions & gates

| ID | Test | Expected |
|----|------|----------|
| X-01 | Protected routes without auth | Redirect login |
| X-02 | Action without name set | Name gate modal |
| X-03 | Action without primary sport | Sport gate |
| X-04 | Non-owner edit attempt | UI disabled or error toast |
| X-05 | Archived game | Join/edit blocked |

### 18.2 Real-time & sync

| ID | Test | Expected |
|----|------|----------|
| X-06 | Game participant join socket | Other client updates roster |
| X-07 | Chat message socket | Appears in open thread |
| X-08 | Wallet update socket | Profile wallet badge updates |
| X-09 | Unread counts refresh | Tab badges update |

### 18.3 Offline & resilience

| ID | Test | Expected |
|----|------|----------|
| X-10 | Offline banner | Banner shown when offline |
| X-11 | Chat outbox retry | Queued messages send on reconnect |
| X-12 | Optimistic UI rollback | Failed mutation shows error state |
| X-13 | Navigation error boundary | Broken route recovers to `/` |

### 18.4 Accessibility & UX smoke

| ID | Test | Expected |
|----|------|----------|
| X-14 | Keyboard focus trap in modals | Focus contained |
| X-15 | aria labels on tab bar | Screen reader labels |
| X-16 | Toast errors on API failure | User-visible feedback |
| X-17 | Loading skeletons | No layout jump crash |

### 18.5 Maps & city UI

| ID | Test | Expected |
|----|------|----------|
| X-18 | City selector list view | City list searchable |
| X-19 | City selector map view | `CityMap` renders clubs/markers |
| X-20 | Map ↔ list toggle | Switch views without crash |
| X-21 | Select city from map | Tap marker → city selected |

### 18.6 Ads & sponsored content

| ID | Test | Expected |
|----|------|----------|
| X-22 | Home hero ad slot | Ad renders or graceful empty |
| X-23 | Find top ad slot | Ad respects sport context |
| X-24 | Leaderboard banner ad | Ad on leaderboard tab |
| X-25 | Ad click in-app route | Tap ad with internal action → navigates |
| X-26 | Ad click external URL | Tap ad with URL → opens browser |

### 18.7 Navigation shell

| ID | Test | Expected |
|----|------|----------|
| X-27 | Back button (web) | Browser back from create/game → sensible destination |
| X-28 | Back button (Capacitor) | Hardware back handled | `@manual` |
| X-29 | Player card history | Open overlay → back | Overlay closes, no orphan state |
| X-30 | Resizable splitter | Drag chat/game split | Width persists session |
| X-31 | Bottom tabs hidden on create | `/create-game` | Tab bar hidden |
| X-32 | Game details hides tabs mobile | Mobile game details | Tabs hidden for immersion |

### 18.8 Push notifications (manual / device)

| ID | Test | Expected |
|----|------|----------|
| X-33 | Tap game invite push | Routes to `/games/:id` |
| X-34 | Tap game chat push | Routes to `/games/:id/chat` |
| X-35 | Tap bracket schedule push | Routes to league schedule/bracket tab |
| X-36 | Tap DM push | Routes to `/user-chat/:id` |
| X-37 | Permission prompt | First launch push permission | `@manual` |
| PN-R1 | iOS inline chat reply (background) | DM push → expand → reply | Message sent with `replyToId`; no app open |
| PN-R2 | iOS inline reply (killed, token-only) | Force-quit → reply from lock screen without JWT | Reply via `POST /chat/push-reply` succeeds |
| PN-R3 | Android inline chat reply (killed) | Shade reply with app killed | Message sent via native `replyToken` path |
| PN-R4 | Android game invite actions | Game invite push → Accept/Decline from shade | Same outcome as in-app invite handlers |
| PN-R5 | Android team invite actions | Team invite push → Accept/Decline | Navigates or declines per handler |
| PN-R6 | iOS Communication Notification | Chat push on iOS 15+ with entitlement | Rich sender layout; inline reply still works |
| PN-R7 | Invalid reply token | Reply after token reuse/expiry | Localized "Couldn't send your reply" |
| PN-R8 | Story push | Story like notification | No reply action |
| PN-M1 | Image chat push thumbnail (iOS) | Send image in DM with app backgrounded/killed | Expanded notification shows photo thumbnail; tap opens chat |
| PN-M2 | Image chat push thumbnail (Android) | Send image in game chat with app backgrounded | Collapsed/expanded notification shows thumbnail as large icon; MessagingStyle conversation + inline reply preserved |
| PN-M3 | Video chat push poster | Send video message push | Poster thumbnail visible; text shows duration label |
| PN-M4 | Story-reply push thumbnail | Reply to a story with thumbnail in DM | Push shows story thumb on iOS (NSE) / Android large icon; body shows story-reply label |

### 18.9 Native permissions (manual)

| ID | Test | Expected |
|----|------|----------|
| X-38 | Photos permission denied | Upload avatar → `PermissionModal` |
| X-39 | Camera permission | Story/game photo capture |
| X-40 | Geolocation permission | City/map features |

### 18.9 Club booking platform admin (`Admin/`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| X-41 | Online booking integration type | Platform admin → edit club → Integration type online booking + companyId | Saved; player app shows club booking surfaces for club |
| X-42 | Import booking courts | BOOKTIME club → Import courts | Courts matched/created; `externalCourtId` set; schedule grid shows mapped externals |
| X-43 | Manual external court ID | Platform admin court list → set externalCourtId | Snapshot maps busy to internal court column |
| X-53 | Court web camera URL | Platform admin → edit court → Web camera URL → Save | URL persisted; Camera column shows ✓ |
| X-54 | Open court camera from list | Platform admin court list → click ✓ in Camera column | Opens web camera URL in new tab |

### 18.10 Software keyboard (Capacitor + mobile web, `@manual`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| X-44 | Chat composer above keyboard | Open game chat → focus composer | Composer sits on top of keyboard; message list stays scrolled to latest; no double gap |
| X-45 | Centered dialog shift | Open any `ui/Dialog` with input (e.g. game note, city search) → focus input | Dialog re-anchors just above keyboard; content scrolls inside dialog; nothing hidden |
| X-46 | Bottom drawer lift | Open Vaul drawer with input (story comments, market item) → focus input | Whole drawer lifts above keyboard; composer visible while typing |
| X-47 | Poll creation keyboard | Game chat → attach → poll → focus question/options | Poll dialog shifts above keyboard; all fields reachable |
| X-48 | Club admin sheets keyboard | Schedule → cancel game / block slot / edit hold → focus reason/note | Sheet pushed above keyboard; submit button visible |
| X-49 | Full-page form input visibility | Create game → focus a bottom field (e.g. comment) | Page scrolls so focused field sits above keyboard with gap |
| X-50 | Story caption & text edit | Photo story editor → caption drawer / text style panel → focus | Caption drawer and style panel ride above keyboard |
| X-51 | Story DM bar keyboard (Android) | Story viewer → focus DM input on Android | DM bar lifts by plugin keyboard height (not stuck under keyboard) |
| X-52 | Keyboard dismiss restores layout | Any of above → dismiss keyboard | Surfaces return to resting position; no leftover bottom padding or shifted dialogs |
| X-55 | Auth login keyboard (Android web) | Mobile Chrome → `/login` → focus phone field | Form sits directly above keyboard; no dark gray scroll gap between card and keyboard |

---

## 19. Test matrices

Use these for structured regression sweeps — not every cell needs automation day one.

### 19.1 Entity type matrix

| Entity | Create | Details | Join/leave | Results | Chat |
|--------|--------|---------|------------|---------|------|
| GAME | C-02 | GD-* | GD-08/09 | GD-28–31 | CH-13 |
| BAR | C-03 | GD-70 | GD-08/09 | BAR standings | CH-13 |
| TRAINING | C-04 | GD-71/72 | Trainer flow | Level edit | CH-13 |
| TOURNAMENT | C-05 | Bracket UI | GD-08/09 | GD-28–31 | CH-13 |
| LEAGUE (season) | C-29–32 | GD-43–51 | Season join | Standings | CH-13 |

### 19.2 Multisport smoke (sample one deep + spot-check others)

| Sport | Create template | Live board | Find filter |
|-------|-----------------|--------------|-------------|
| PADEL | ✓ deep | ✓ deep | ✓ |
| TENNIS | spot | spot | spot |
| PICKLEBALL | spot | spot | — |
| BADMINTON | spot | spot | — |
| SQUASH | spot | spot | — |
| TABLE_TENNIS | spot | spot | — |

### 19.3 Locale smoke

Run P0 smoke in each locale: **en**, **ru**, **es**, **sr**, **cs** — verify no layout overflow on login, Find filters, game card, chat input.

### 19.4 Viewport matrix

| Viewport | Priority flows |
|----------|----------------|
| Mobile 390×844 | P0 + chat full-screen thread |
| Desktop 1280×800 | Split chat, split game details, calendar split |
| Landscape mobile | Game details split view |

---

## 20. Priority matrix

### P0 — Smoke (every deploy, ~15 min)

`G-01, G-02, G-10, A-01, A-20, H-17, F-24, F-25, C-27, GD-08, GD-09, CH-12, CH-18, M-01, M-21, PR-01, PR-07, LB-01`

### P1 — Core product (~45 min)

All of §5 auth (except OAuth device), §7 Find filters, §8 create game happy path, §9 participation + edit, §11 chat send/media/poll, §12 marketplace create + bid, §13 profile settings save, `LS-01`–`LS-03`

### P2 — Extended (~2 hr)

Leagues, live scoring multisport sample, bets, stories, game subscriptions, user teams, sessions, group settings, club admin schedule, onboarding gates (§4.2), past-games subtab, bugs tracker, sync conflict, training reviews

### P3 — Edge / regression backlog

Offline queues, deep links, OAuth merge, Holland auctions, broadcast/TV modes, delete account, admin-only filters, visual regression, URL overlays, push routing, locale matrix, entity type matrix

---

## 21. Test execution notes

### Environments
- **Local:** Backend `:3000`, Frontend `:3001`, seeded `padelpulse_dev`
- **CI/staging:** Dedicated test users; never prod credentials
- **Parallelization:** Auth per worker via `storageState`; isolate tests that mutate same game

### Playwright E2E (implemented)

```bash
cd Frontend
# guest smoke only (no credentials):
npm run test:e2e:guest

# authenticated single-user (User A):
npm run test:e2e:auth

# two-user / C2C (User A + User B):
npm run test:e2e:two-user

# full suite (all projects):
npm run test:e2e

# headed / UI runner:
npm run test:e2e:headed
npm run test:e2e:ui
```

Config: `Frontend/playwright.config.ts` — starts Backend + Frontend dev servers when not already running (`reuseExistingServer` locally). Auth bootstrap: `e2e/global-setup.ts` → `e2e/.auth/user-a.json`, `user-b.json` (legacy `user.json` = User A). Example env: `Frontend/e2e/.env.example`.

**E2E users (local dev):** User A `+79672825552`, User B `+79672820000`, password `Metal4me` for both. Override with `E2E_PHONE` / `E2E_PHONE_B`.

**Cross-refs to two-user automation:** `CH-12`/`CH-18` (sender) → receive side `T2-CH-01` in `docs/UI_TEST_PLAN_TWO_USER.md`; `X-06`/`X-07` → `T2-X-01`/`T2-X-02`; `LS-10` → `T2-LS-01`; `M-27` → `T2-M-02`; `GD-42` → `T2-GD-42` (P2).

### Flake mitigation
- Wait for network idle after navigation, not fixed sleeps
- Stub external media upload in CI if S3 empty
- Use `expect.poll` for socket-driven UI (bets, auction, live score)
- Reset filters/localStorage keys (`gameFiltersStorage`, marketplace draft) between tests

### Coverage gaps to track
- Playwright smoke in `Frontend/e2e/specs/smoke/` — expand toward §20 P0 list
- Capacitor-native flows remain manual checklists
- Multisport: automate one sport deeply, sample others in matrix

---

## 22. Suggested first implementation slices

1. **Auth fixture + smoke** — login API, P0 list
2. **Find + join** — filters persistence + join from card
3. **Create game** — GAME template minimal path
4. **Game details edit** — EditGameInfoModal tabs
5. **Chat send** — text + optimistic + offline retry
6. **Marketplace** — create buy-it-now + open drawer
7. **URL overlays** — `?player=` and `?item=` open/close
8. **Onboarding gates** — name gate + past-games subtab

### 22.1 Automated smoke (Playwright)

| ID | Spec | Expected |
|----|------|----------|
| E2E-S01 | `guest.spec.ts` unauthenticated `/` | Redirect to `/login` |
| E2E-S02 | `guest.spec.ts` login shell | Phone + Telegram entry visible |
| E2E-S03 | `login.spec.ts` phone login | Lands on home with bottom tabs |
| E2E-S04 | `navigation.spec.ts` tabs | My / Find / Chats / Market visible |
| E2E-S05 | `navigation.spec.ts` routing | Tab clicks update URL |

---

## 23. Two-user interaction testing

Full catalog: **`docs/UI_TEST_PLAN_TWO_USER.md`**.

Playwright project `two-user` runs specs under `Frontend/e2e/specs/two-user/` tagged `@two-user`. Uses dual `storageState` files and `openDualSession()` (`e2e/fixtures/two-user.fixture.ts`). Prefer `expect.poll` for socket-driven assertions.

| T2-P0 (automated) | Maps from main plan |
|-------------------|---------------------|
| T2-CH-01, T2-CH-02 | CH-12, CH-18, X-07 |
| T2-GD-01, T2-GD-03 | GD-08, X-06 |
| T2-X-01, T2-X-02 | X-07, X-06 |

---

## 24. References

- Routes: `Frontend/src/App.tsx`
- URL schema & overlays: `Frontend/src/utils/urlSchema.ts`
- URL ↔ store sync: `Frontend/src/hooks/useUrlStoreSync.ts`
- Main shell: `Frontend/src/pages/MainPage.tsx`
- Push tap routing: `Frontend/src/utils/pushNotificationBracketRouting.util.ts`
- Playwright E2E: `Frontend/playwright.config.ts`, `Frontend/e2e/`
- Automated test plan: `docs/AUTO_TEST_PLAN.md`
