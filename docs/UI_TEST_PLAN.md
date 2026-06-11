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
| G-12 | Pull to refresh | Pull on My / Find / Profile | List refreshes, no crash |
| G-13 | Deep link game | Open `/games/:id` | Game details loads |
| G-14 | Deep link game chat | Open `/games/:id/chat` | Game chat thread opens |
| G-15 | Deep link user chat | Open `/user-chat/:id` | DM thread opens |
| G-16 | Deep link marketplace item | Open `/marketplace/:id` | Item drawer/detail |
| G-17 | Player card overlay | URL with player overlay param | Bottom sheet opens |
| G-18 | i18n switch | Change language in profile | UI strings update |
| G-19 | Dark/light theme | Toggle theme | Persisted appearance |
| G-20 | Desktop split chat | `@desktop` open `/chats` + select thread | List + thread side by side |
| G-21 | Home URL subtab sync | Open `/?tab=past-games`; legacy `/?tab=list` | Past subtab; list URL redirects to calendar |
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
| OG-06 | City prompt banner | User missing city context | `CityPromptBanner` with action |
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
| A-17 | New user no city | User without `currentCity` | Select city screen |
| A-18 | City already set | Visit `/select-city` | Redirect home |
| A-19 | Pick city | Select from list | Profile updated, proceed |

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
| H-01 | Calendar view | Open My tab | Calendar + games render |
| H-02 | Calendar date select | Pick date on calendar | Games for that day |
| H-03 | Empty my games | User with no games | Empty state |
| H-04 | Stories rail visible | Logged in home | Stories bubbles render |
| H-05 | Sport questionnaire prompt | Incomplete questionnaire | Prompt shown, links to flow |
| H-06 | City prompt banner | User missing city prefs | Banner shown |
| H-07 | Gender prompt banner | When applicable | Banner + action |
| H-08 | User teams section | User in teams | Teams row visible |
| H-09 | Your leagues section | User in leagues | League cards visible |
| H-10 | Past games section | User with history | Past games listed |
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
| H-36 | Finished section excludes archived | User with FINISHED and ARCHIVED games on list/calendar | Finished divider lists only FINISHED games; ARCHIVED only on past-games subtab |

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

### 6.5 Home subtabs & URL

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-28 | Past games subtab | Header → Past | Past games list loads |
| H-29 | Past games unread badge | Unread on past game | Badge on Past subtab |
| H-31 | Calendar subtab default | Open home | Calendar view default |
| H-32 | URL deep link past games | `/?tab=past-games` | Past subtab selected |
| H-33 | Subtab survives refresh | On past-games subtab → reload | Still on past-games |
| H-34 | Restore calendar after create | Create game from calendar | Returns to calendar + game date selected |
| H-35 | Invite friend to app | `InviteFriendToBandejaButton` | Share sheet / copy invite link |
| H-37 | Club booking connect banner (My tab) | User in city with BOOKTIME club, not connected | Connect banner on My tab → settings page |
| H-38 | Club booking upcoming cards (My tab) | Connected user with upcoming bookings | Up to 3 cards + "See all" |
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
| F-18 | Sport filter | Switch primary/all sport | API refetch with sport |
| F-19 | Social vs match tier | `@multisport` tier toggle | Correct tier games |
| F-20 | No-rating filter | Enable no-rating | Only casual games |
| F-21 | Show private games | `@admin` toggle | Private games appear |
| F-22 | Reset filters | Reset button | Defaults restored |
| F-23 | Filter persistence | Set filters → reload | Filters restored from storage |

### 7.4 Game discovery actions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-24 | Open game details | Tap card | Navigate to game |
| F-25 | Quick join from Find | Join button on card | Joined + toast + navigate |
| F-26 | Join queue | Full game with queue | Added to queue toast |
| F-27 | Join blocked no name | `@P5` join attempt | Name gate modal |
| F-28 | Trainers list section | When training filter | Trainers visible |
| F-29 | Empty find results | Filters with no match | Empty state |
| F-30 | Change city from header | Find header city button → `CityModal` | City changes; games refetch |
| F-31 | Filter button active state | Apply any advanced filter | Filter button highlighted |
| F-32 | Favorite trainer highlight | `@user with favoriteTrainerId` + training filter | Favorite trainer games emphasized on calendar |
| F-33 | Gender-restricted game card | MEN/WOMEN/MIX game | Gender badge on card |
| F-34 | Join blocked wrong gender | User gender incompatible | Error toast / join blocked |
| F-35 | Level out of range | User level outside game range | Join blocked or warning |
| F-36 | Confirmed court badge on card | Game with `timeIsSet`, `hasBookedCourt`, club + court | Blue “Booked” pill after time on game card |

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
| C-12 | Rating vs social game | Toggle affects rating | Flag persisted on create |
| C-40 | Non-default match format | Padel → singles (1v1) or tennis → doubles (2v2) in participants setup | Format card summary shows Singles/Doubles; expanded details show Teams format row with 1v1/2v2 hint |
| C-41 | Padel singles templates | Create padel game → participants 1v1 → open format templates | Match tab: Best-of-3 (Official) + Single set; Social tab: Singles Americano (24 pts) when roster ≥4 |

### 8.3 Core fields

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-13 | Club selection | Pick club | Courts load |
| C-13a | Club booking connect banner | Open club detail for BOOKTIME club, not connected | Connect banner shown |
| C-13b | Club booking OTP connect | Phone + OTP (existing account) | Connected chip; GET auth has no tokens |
| C-13c | Club booking connect hidden | BOOKTIME club already connected | No connect banner |
| C-13d | Club booking cold-start refresh | Open create-game or club detail for BOOKTIME club with stale/missing snapshot | "Updating club availability…" then grid shows external busy |
| C-13e | Club booking no sync banner | Unconnected user, empty scout pool, no snapshot today | "No sync yet today" or scout-pool degraded banner |
| C-13f | Club booking availability sheet | Open BOOKTIME club detail with mapped courts | Free slot grid per court; duration toggle matches club API `bookingDurations` |
| C-13t | Integrated club duration options | Create GAME or TOURNAMENT at BOOKTIME club | Duration buttons match club API (e.g. 1h/2h only); tournament extras (3h/4h/6h) hidden when unsupported |
| C-13g | Club booking slot connect gate | Tap slot while not connected to club booking | ConnectClubSheet opens |
| C-13h | Club booking last sync | After snapshot refresh on club detail | "Last synced …" shown on availability section |
| C-13i | External booking unmapped courts hidden | Club has unmapped external booking courts | Only mapped courts appear in availability sheet |
| C-13j | Club booking with price | Connected user taps free slot → confirm | Price shown; booking succeeds; success modal with "Create game here" |
| C-13k | Club booking slot taken | Confirm book while slot becomes busy | Toast "That slot was just taken"; grid refreshes |
| C-13l | Club booking cancel | Connected user → upcoming list → cancel | Policy confirm modal; booking removed; snapshot refreshes |
| C-13m | Club booking create game CTA | After book success tap "Create game here" | Create-game opens with club/court/time pre-filled |
| C-13n | Club booking create game soft link | Create game from booking with externalBookingId | Game saved with `hasBookedCourt: true` and external link |
| C-13o | Club booking cancel linked game warn | Cancel booking that has linked game | Success + non-blocking "Your game is still on the calendar" + Open game |
| C-13p | Club booking orphan link notice | Game with external link but booking cancelled elsewhere | Game details shows "Court may no longer be reserved" |
| C-13q | Club booking signup connect | ConnectClubSheet → new user signup + OTP | Account created; connected chip shown |
| C-13r | Club booking create-game grid refresh | Open create-game for BOOKTIME club with stale snapshot | Banner then red external cells after snapshot PUT |
| C-13s | Club booking scout pool degraded | Unconnected user, empty scout pool | "Live availability unavailable" banner on create-game/club detail |
| C-13u | BOOKTIME court name labels | Open club detail, availability sheet, or court picker for BOOKTIME club where Bandeja court name differs from BookTime resource name | Primary label shows Bandeja court name; smaller secondary line shows BookTime integration name |
| C-14 | Court not booked | Select "not booked" | Allowed |
| C-15 | Court booked | Pick court | Overlap warning if conflict |
| C-16 | Mark court booked modal | Confirm booking | Court marked |
| C-17 | Date/time | Change start + duration | End time updates |
| C-18 | Level range slider | Adjust range | Min ≤ max |
| C-19 | Max participants | Change count | Roster options update |
| C-20 | Fixed teams toggle | Enable for doubles | Team setup shown |
| C-21 | Game name & comments | Fill text | Saved on submit |
| C-22 | Price section | Set price type/currency/total | Saved correctly |
| C-23 | Avatar upload | Upload game image | Preview shown |
| C-24 | Invite players | Open player list → select | Invites sent on create |
| C-25 | Participants setup tags | Configure setup | Tags on game |
| C-26 | Multiple courts | Enable multi-court | Court count selector |
| C-27 | Submit create | Complete valid form | Game created → details page |
| C-28 | Validation errors | Submit incomplete | Errors shown, no create |

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
| GD-07 | Open game chat | Chat button | `/games/:id/chat` |
| GD-73 | Scroll-more hint | Open long game details; scroll partway down | Bottom gradient + bouncing chevron; hides at page bottom |
| GD-74 | Scroll-more hint tap | Tap chevron on long game details | Smooth scroll to bottom; hint hides when at bottom |
| GD-75 | Scroll-above hint | Scroll down on long game details | Top gradient + bouncing chevron up; hides at page top |
| GD-76 | Scroll-above hint tap | Tap top chevron on long game details | Smooth scroll to top; hint hides when at top |
| GD-78 | Date/time info row layout | Open game with `timeIsSet` on wide viewport; repeat on narrow | Wide: date and time on one row with vertical divider; narrow: stacked rows |
| GD-79 | Time period clock icon | Open game with `timeIsSet` and start/end times (e.g. 18:00–20:00) | Clock icon shows golden period arc with primary-colored outline matching the displayed time range |
| GD-80 | Sport tag placement | Open game details | Sport and match-format tags appear in main app header between Back and Chat |
| GD-81 | Compact game details back | Narrow viewport; game with sport + format tags and Chat visible | Back shows arrow only (no label) so tags and Chat fit on one row |

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
| GD-20 | Edit when | When tab | Start time updated |
| GD-21 | Edit where | Where tab | Club/court updated |
| GD-22 | Edit price | Price tab | Price fields updated |
| GD-23 | Edit level range | Level modal | Min/max saved |
| GD-24 | Edit max participants | Max participants modal | Capacity updated |
| GD-25 | Edit game format | Format wizard (pre-results) | Format updated |
| GD-82 | Fixed pairs roster section | Open padel game with fixed pairs enabled, 4+ even roster, no results | Standalone Fixed Pairs card below format; team slots editable; no toggle in format card |
| GD-83 | Fixed pairs section hidden | Same game after results start, or `hasFixedTeams` off, or odd roster | Fixed Pairs card absent |
| GD-77 | Non-default match format display | Game with padel singles or tennis doubles | Format section summary + expanded details show non-default match format |
| GD-26 | Edit blocked after results final | `@finished` | Edit disabled |
| GD-27 | Archive/cancel game | Owner cancel flow | Status archived/cancelled |

### 9.4 Results & scoring

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-28 | Enter set results | Results tab → enter scores | Saved locally + server |
| GD-29 | Conflict resolution | Conflicting entries | Conflict modal |
| GD-30 | Submit results | Finalize results | Status updates |
| GD-31 | Recalculate results | Owner recalc | Standings update |
| GD-32 | Training level edit | Training game → level modal | Levels updated |
| GD-33 | Live scoring link | Open live board | `/games/:id/live` |
| GD-34 | TV mode | `?tv=1` on live | TV layout/theme |
| GD-35 | Broadcast view | `/games/:id/broadcast` | Broadcast layout |
| GD-36 | Results share card | Share results | Image/link generated |
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
| GD-54 | User game note | Add private note from game card/modal | Note saved; only visible to self |
| GD-55 | Edit/delete game note | Update note content | Persisted / deleted |
| GD-56 | Game settings panel | Toggle anyoneCanInvite, visibility, etc. | Settings saved |
| GD-57 | Manage users modal | Owner opens manage users | Roles/kick actions available |
| GD-58 | Kick participant | Kick user from game | Removed from roster |
| GD-59 | Kick admin | Owner kicks admin participant | Role change / removal |
| GD-60 | Reduce max participants | Edit max → kick overflow users | Capacity enforced |
| GD-61 | Navigate to parent league | Open league fixture (`parentId`) | Link to season game works |
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
| CH-53 | Bugs filter panel | Filter by status/type/createdByMe | List updates |
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
| M-01 | List loads | Open marketplace | Cards grid/list |
| M-02 | My listings | `/marketplace/my` | Seller's items only |
| M-03 | Category filter | Select category | Filtered results |
| M-04 | City filter | Change city | Items for city |
| M-05 | Sport filter | Change sport context | Categories update |
| M-06 | Search | Text search | Matching items |
| M-07 | Pagination / infinite scroll | Scroll down | More items load |
| M-08 | Unread on card | Item with chat unread | Badge shown |
| M-09 | Empty marketplace | City with no items | Empty state |

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
| M-21 | Open item drawer | Tap card | Detail drawer |
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
| PR-32 | App icon carousel | Change app icon | `@native` manual |
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
| PR-56 | Connected clubs settings entry | Profile → Connected clubs & bookings | Navigates to `/profile/connected-clubs` |
| PR-57 | Connected clubs page tabs | Profile → Connected clubs & bookings | Segmented switch Bookings/Integrations centered; Bookings default |
| PR-57a | Bookings tab | Bookings tab with connected clubs | All upcoming across clubs with club name; linked game chip opens game; Link to game dialog lists announced games with recommended match |
| PR-57b | Integrations tab | Integrations tab | Club list with connect/disconnect state; hint card |
| PR-59 | Club account disconnect | Connected clubs page → Disconnect | Toast "Club account disconnected"; club shows connect CTA |
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
