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
- Home screen Next Game widgets (iOS + Android) — covered as manual `@widget` checklist in §18.11
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
| E2E | **Playwright** | `Frontend/e2e/`, projects: guest / auth / two-user / etc. |
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
- `@widget` — Capacitor home-screen Next Game widget (iOS and/or Android device)

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
| G-11 | Tab unread badges | Seed unread DM; open chats inbox | Chats badge on Chats bottom tab / chats subtabs; My and Market bottom tabs show no unread badge |
| G-29 | Chats badge clears after read | Seed unread DM; open thread from inbox; return | Row unread badge on that DM is gone |
| G-20 | Tab badges stable on navigation | Seed unread; switch My → Find → Chats → Market without reconnect | Chats tab badge count unchanged (no full unread snapshot refetch flicker) |
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
| G-30 | My tab games after login | User with games logs out and back in (or fresh install login) | Home/My shows upcoming games, not empty state |
| G-31 | Next-game deep link with upcoming | Auth’d user with upcoming game opens `/next-game` (web or Cap) | Navigates to that game’s details |
| G-32 | Next-game deep link empty | Auth’d user with no upcoming/recent games opens `/next-game` | Lands on My tab (`/`) |
| G-33 | Next-game deep link guest | Logged-out user opens `/next-game` | Lands on `/login` |
| G-34 | Siri Find / Next game (iOS) | Cap iOS: “Find games in Bandeja” / “Open my next game in Bandeja” | Opens Find today / next game (or My/login fallback) |
| G-35 | Gemini/Assistant Find (Android) | Cap Android: ask Assistant/Gemini to open Find in Bandeja (or long-press Find shortcut) | Opens Find tab (today via catalog `findToday` / dayOffset=0) |
| G-36 | Cap Find dayOffset | Cap open `/find?view=calendar&dayOffset=1` | Find calendar on tomorrow’s day |
| G-37 | Cap Find date | Cap open `/find?view=calendar&date=YYYY-MM-DD` | Find calendar on that day |
| G-38 | Invites focus deep link | Auth’d open `/?focus=invites` | My calendar tab; invites section scrolled/highlighted |
| G-39 | Next-game open=chat | Auth’d with upcoming game opens `/next-game?open=chat` | Game chat thread |
| G-40 | Next-game open=live | Auth’d with upcoming game opens `/next-game?open=live` | Live scoring |
| G-41 | Siri game chat / live (iOS) | “Open chat for my next game” / “Start scoring my next game” | Chat or live for next widget game (or resolve via `/next-game?open=`) |
| G-42 | Siri open game by name (iOS) | “Open [title] in Bandeja” (title from widget cache) | `/games/:id` |
| G-43 | Join phrase is open only | “Join my next game in Bandeja” | Opens game details — does **not** auto-join |
| G-44 | Android dynamic game shortcuts | After My games sync with upcoming games | Long-press app icon shows up to 4 upcoming game shortcuts |
| G-45 | Catalog deep-link parity (full set) | Run `npm run test:deep-link-catalog` | Passes: all named actions + game templates match TS mirror, iOS `BandejaDeepLink` / HomeWidget, Android shortcuts + `WidgetDeepLinks` |
| G-46 | Catalog smoke (Assistant/widget URLs) | Cap: open catalog URLs for find tomorrow, invites, next game, create game (and long-press Android shortcuts) | Each lands on the matching Find/My/create/next-game screen |
| G-47 | Android cache-first next game | Cap Android with synced next-games envelope: Assistant / long-press “Next game” (also chat / live scoring) | Opens `/games/:id` (or `/chat` / `/live`) from envelope without JS my-games re-resolve; empty/unauth still `/next-game` → My/login |
| G-48 | Cap `/next-game` single owner | Cap launch / `appUrlOpen` for `/next-game` (`?open=chat\|live`) | Navigates to `/next-game` route; `NextGameRedirect` resolves (same destinations as web) |
| G-49 | Assistant feature vs game-entity layers | Run `npm run test:deep-link-catalog`; Cap: after My-games sync, “Find games today” / “Open chat for my next game” / “Open [cached title] in Bandeja”; Android long-press static vs `dyn_game_*` | Suite green; Find/next-chat use feature intents; named game uses entity (Siri params refreshed on sync); static shortcuts ≠ dynamic open-game shortcuts |
| G-50 | App Shortcuts priority cap (iOS) | Inspect Siri / App Shortcuts donated set after install | At most 10 donated shortcuts; Create league + entity chat/live not in donated set (still in Shortcuts library) |
| G-51 | Environment favicon highlighting | Open local Vite dev, `thisistestfor.bandeja.me`, and production `bandeja.me` | Dev favicon has a red background; test-production favicon has a yellow background; production favicon is unchanged |

### 4.2 Onboarding gates & prompts

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| OG-01 | Profile name gate | `@P5` join / create / invite action | `NameSetModal` blocks until name saved |
| OG-02 | Name gate resume | Save name in gate modal | Pending action completes |
| OG-03 | Primary sport gate | User needs primary sport | `PrimarySportSetModal` shown |
| OG-04 | Gender prompt banner | User without gender set | Banner on home/find; opens `GenderSetModal` |
| OG-05 | Gender prompt dismiss | Dismiss gender banner | Banner hidden; mixed-gender games may stay limited |
| OG-06 | City prompt banner | User with auto-city, after sport gate | `CityPromptBanner` on home |
| OG-07 | Sport questionnaire (home) | New user, city set, primary sport | `SportQuestionnairePrompt` on home |
| OG-08 | Sport questionnaire skip | Dismiss home questionnaire | Padel profile `questionnaireSkippedAt` set; prompt gone |
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
| A-05 | Register link hidden | Open `/login` | No "Don't have an account? Register" CTA |
| A-05a | Welcome heading | Open `/login` as guest | Shows **Bandeja** brand heading (Outfit) or returning-user title above Google CTA; no subtitle |
| A-06 | Google OAuth return | `?google_code=` mock exchange | Login success (web) |
| A-06a | Google email already registered | Sign in with Google whose verified email matches an existing phone/Apple/Telegram account (no `googleId` yet) | Logs into that account and attaches Google — no “merge in Profile” error |
| A-07 | Google OAuth error | `?google_error=` | Error shown |
| A-08 | Telegram auto-login route | `/login/:telegramKey` | Auto login or error |
| A-09 | Privacy Policy & Terms link | Open Privacy Policy & Terms of Service | External/legal page opens |
| A-09a | Web store download buttons | Open `/login` in browser (not Capacitor) | App Store + Google Play badges visible under same OR divider style as phone sign-in; links open store pages |
| A-09b | Cap hides store buttons | Open `/login` inside Capacitor app | Store download badges not shown |
| A-27 | Android Google login stable session | Capacitor Android: logout → Google sign-in → complete | Lands on My tab; no bounce back to `/login` within 10s |
| A-28 | Android Telegram login stable session | Capacitor Android: logout → Telegram bot link opens Chrome → tap Open Bandeja app | Native app opens, lands on My tab, and does not return to the browser handoff or `/login` within 10s |
| A-28a | Android Telegram cold/warm handoff | Repeat A-28 with Bandeja force-stopped, then with Bandeja already running in background | Both launches consume the same custom-scheme route through `getLaunchUrl` / `appUrlOpen`; login completes once |
| A-28b | Android Telegram browser fallback | Open bot login link without Bandeja installed, or tap Continue in browser on the handoff page | Browser login completes; failed app launch does not consume the key and the six-digit OTP remains usable |

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
| A-30 | No Cities/Clubs switch | Open `/select-city` | No Cities/Clubs mode toggle; chrome is search hero + Near me + Map/List only |
| A-31 | Browse countries → cities | Open `/select-city`, tap a country | City list for that country (not clubs); pick city → Confirm works |
| A-32 | Near me → city | Tap Near me with location | Nearest **city** focused/scrolled (or map pending city); not a clubs list |
| A-33 | Unified city/club search | On `/select-city`, type ≥2 chars matching a city and a club | One stream with soft Cities/Clubs(/Countries) headers; placeholder “Search city or club…” |
| A-34 | Pick city via club search | Search a club name → tap club row | Onboarding selects that club’s **city** (Confirm still required); no home-club concept |
| A-35 | Search hero primary | Open `/select-city` after load | Full-width search is the top control; Near me + Map sit below as secondary chrome |
| A-36 | Suggested nearest/current | Open `/select-city` with empty search; nearest and/or selected city known | Suggested block shows one-tap nearest and/or current; hidden while searching |
| A-37 | Near me calm failure | Tap Near me with location denied/unavailable | Soft hint under chrome (not stacked red banner); search/map still usable |
| A-38 | RU/SR club count plurals | App language RU (or SR); open country list | Counts ending in 1 but not 11 (e.g. Austria 131, Argentina 1401) show full number (`131 клуб` / `1401 клуб`), not literal `1 клуб` |
| A-39 | Country name localization | App language RU; open country list; scroll past Andorra/Belgium/Czechia | Primary names localized (Андорра, Бельгия, Чехия), not English keys; native endonym shown when different |
| A-39 | Map chrome overlay | Tap Map (list or change-city modal) | Map fills content; Near me + List overlay inside map (not above); List returns to search list |

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
| A-26a | Slow cold-start refresh | Expire access token; delay `/auth/refresh` several seconds | Splash waits for refresh to settle; cached shell stays signed in; no login redirect |
| A-26b | Lost refresh response | Let server rotate refresh token, drop response, then retry with the same persisted request ID | Server returns the exact committed successor; no session loss |
| A-26c | Native resume after days | Background iOS/Android beyond access-token expiry, then resume | Refresh completes before socket/push/chat sync; live connection uses new access token |
| A-26d | Native secure-storage outage | Make Keychain/Keystore temporarily unavailable during resume | Session is preserved in recovery state and retries later; not treated as missing/revoked |
| A-26e | Concurrent refresh | Trigger foreground, API 401, and another tab refresh together | Calls converge on one successor; stale callers reload the durable credential; no logout |
| A-26f | Web credential exposure | Sign in and inspect response body/local storage/cookies | Refresh token is absent from JSON/local storage and present only in a Secure HttpOnly cookie |
| A-26g | Cookie refresh CSRF | POST cookie-only refresh/logout from an untrusted Origin | Request is rejected; trusted production origin succeeds |
| A-26h | Watch resume after days | Let Watch access JWT expire, then open a Watch screen with phone unavailable | Watch uses shared refresh credential, rotates safely, retries request once, stays signed in |
| A-26i | Android invite after days | Let Android access JWT expire, then accept/decline from a notification | Scoped action succeeds without opening app; notification closes after definitive response |
| A-26j | Idle several days then open | Leave app closed 2–7 days (access expired, refresh still valid) | Returns to last screen signed in; no login flash |
| A-26k | Phone + Watch concurrent refresh | Open Watch and iPhone together after access expiry | Both stay signed in; they share the live successor refresh credential |

---

## 6. My tab (Home `/`)

### 6.1 Layout & sub-views

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-01 | Calendar view | Open My tab | Calendar + games render; Bookings / Teams / Leagues switch row below stories |
| H-54 | My tab panel switcher | Logged in → My tab below stories | One switch row: Bookings (ticket), Teams, Leagues; none selected by default |
| H-55 | My tab panel single select | Tap Bookings then Teams | Bookings panel animates out; Teams panel animates in; only Teams highlighted |
| H-57 | My tab panel switcher counts | User with bookings, teams, and leagues | Bookings / Teams / Leagues buttons show matching counts; hidden when zero |
| H-02 | Calendar date select | Pick date on calendar | Games for that day |
| H-41 | Selected date heading | Pick date on My tab calendar | Long localized date (e.g. "Thursday, 11 June") with Today/Tomorrow badge shown below calendar; updates on re-select, localized per language |
| H-63 | Empty selected date hint | User with upcoming games on other days → pick a day with no games | Localized "No games on this date" below selected date heading; Upcoming games section still shown |
| H-60 | Calendar weekday headers | My tab or Find calendar with app language set to Russian, then English | Column headers use locale short weekday (ru: 2-letter e.g. пн/вт; en: 3-letter e.g. Mon/Tue), not truncated full names |
| H-40 | Overflow month day select | Navigate month → tap gray adjacent-month cell with game badge | Selected day highlights; that day's games in list (not upcoming sections) |
| H-03 | Empty my games | User with no games | Empty state |
| H-04 | Stories rail visible | Logged in home | Stories bubbles render |
| H-05 | Sport questionnaire prompt | Incomplete questionnaire | Prompt shown, links to flow |
| H-06 | City prompt banner | User missing city prefs | Banner shown |
| H-07 | Gender prompt banner | When applicable | Banner + action |
| H-08 | User teams section | User in teams | My tab → Teams switch shows teams row |
| H-09 | Your leagues section | User in leagues | My tab → Leagues switch shows league cards |
| H-10 | League game sections collapse | My tab → Leagues → league hub with scheduled/unscheduled and FINAL games → tap section header | Section collapses/expands with chevron; both sections expanded by default; FINAL games appear in neither section |
| H-72 | Playoff game metadata | My tab → Leagues → league hub with playoff and regular-round games | Playoff cards omit the redundant round number (for example, `R12`) while regular league cards keep it; group names remain visible |
| H-11 | Mark all read banner | Unread games exist | Banner + action clears counts |

### 6.2 Invites

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-12 | View pending invite | Seed invite | Card shows game info |
| H-13 | Accept invite | Accept | Joined game, invite gone |
| H-14 | Decline invite | Decline → confirm modal | Invite removed |
| H-15 | Decline with note | Add note in modal | Note posted to game chat (with notifications), then invite declined |
| H-15a | Telegram decline with response | Telegram game invite → Decline with response → send reason (or `/skip` / `/skip@Bot`) | Same as H-15 when reason sent; invite declined and Telegram invite message updated; `/skip` declines without chat message; prompt expires after 10m; Accept/Decline clears pending prompt |
| H-16 | Invite note on game | Save note without accept/decline | Persisted |
| H-61 | Invite cleared after accept from game | My tab invite → open game → accept invite on game page → back to My tab | Invite card gone immediately; second accept not offered |

### 6.3 My games interactions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-17 | Open game from list | Tap game card | `/games/:id` |
| H-18 | Unread badge on game | Game with chat unread | Badge on card |
| H-19 | Create game entry | Header/FAB create | `/create-game` with entity picker |
| H-20 | Create from calendar date | Select date → create | Pre-filled date |
| H-36 | Selected date shows archived/finished | User with FINISHED and ARCHIVED games on a past calendar day | Select that day on My tab calendar; both FINISHED and ARCHIVED games appear under Finished section |
| H-64 | Same-day start-time order | Day with ≥2 active My games at different times | Active games earliest-first; finished/archived after active |

### 6.4 Stories

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-21 | Open story viewer | Tap story bubble | Fullscreen viewer |
| H-22 | Story navigation | Tap next/prev | Changes slide |
| H-70 | Story viewer stays responsive | Open video + image stories on Capacitor/web → hold to pause → release outside frame → advance through several segments | Progress advances smoothly; release always unpauses; no WebView freeze; mute starts on native |
| H-23 | Create story sheet | Tap own bubble / header action | Create sheet opens |
| H-24 | Photo story publish | Pick photo → publish | Appears in rail |
| H-25 | Video story publish | Pick video → publish | Appears in rail |
| H-26 | Story engagement | Like / comment (if enabled) | Count updates |
| H-27 | Report story comment | Report flow | Modal submits |
| H-54 | Owner story menu | Open own story (manual or game auto) | Top-right ⋮ visible; tap opens dark action sheet with spring animation (playback paused) |
| H-55 | Delete own story | Own story → ⋮ → Delete my story → Delete | Sheet closes; segment gone for followers; manual soft-delete; auto slides dismissed (season result dismiss keeps champion; plain-game result also flips results switch); dismissed slides cannot reappear via socket; fail → toast + feed refresh |




| H-42 | Story DM reply lands in user chat | Open another user's story → type DM text → send → open user chat with owner | Message in DM thread shows story thumbnail card + "Replied to your story"/"You replied to their story" label above the bubble |
| H-43 | Story quick-reaction emoji reply | Open another user's story → focus DM input → tap one of the six quick emojis | Emoji sent to DM with same story-reply card; flyout animation plays in viewer |
| H-44 | Story reply card without media | Reply to GAME_CREATED/GAME_RESULT story without photo | DM shows story-reply label with placeholder thumbnail; tap does nothing harmful |
| H-45 | Story editor live drag WYSIWYG | Photo editor → add text/sticker → drag it (mouse and touch) | Layer follows the pointer live on the visible preview, no jump on release |
| H-46 | Story editor live resize/rotate WYSIWYG | Select sticker/text → drag transformer corner / rotate handle | Preview scales/rotates live; final state matches preview during gesture |
| H-47 | Story text edit wrap parity | Type long text (incl. one very long unbroken word) in text overlay → commit | Line breaks in edit overlay identical to committed canvas text; long word breaks instead of overflowing |
| H-48 | Published story matches editor preview | Add text + sticker + adjust filter → move/scale them → publish → view own story | Viewer shows pixel-equivalent composition (positions, sizes, styles, filters) to the editor preview |
| H-49 | Story layer drag clamp | Drag text/sticker hard toward screen edge | Layer stops at canvas padding; preview and hit target stay aligned |
| H-50 | Story layer max scale clamp | Scale sticker/text past max via corner handle | Preview and handle stop at max scale without overshoot jump on release |
| H-51 | Rotated story text edit | Add text → rotate → double-tap to edit | Edit overlay keeps rotation while typing; committed text unchanged |
| H-52 | Story text edit canvas preview | Type in text overlay (classic/neon/outline/gradient/blackBox) | Visible glyphs match canvas/export renderer, not CSS approximation |
| H-53 | Story photo rotate snap live | Pinch-rotate photo near 0°/90° | Rotation snaps live in preview, not only on release |
| H-56 | Story editor 9:16 frame parity | Open photo editor on tall phone viewport | Canvas is true 9:16 (letterboxed), not stretched full-height; published story matches editor framing |
| H-57 | Story editor pinch/pan/wheel | Capacitor + mobile browser: two-finger pinch/rotate/pan + double-tap; Desktop: drag pan, mouse wheel zoom, trackpad pinch, Alt/Shift-drag rotate | No page scroll/zoom steal; no double zoom on trackpad; zoom in/out + rubberband; double-tap cover↔2× |
| H-58 | Story layer handles (IG) | Add sticker/text → select → drag corner / rotate | Soft white circular handles + thin white border + rotate stem; photo has no selection box |
| H-59 | Story photo double-tap zoom | At cover fit → double-tap; again when zoomed | First zooms ~2× under tap; second returns to cover fit |
| H-60 | Story tap photo deselects layer | Select sticker → tap empty photo area | Layer deselects; further drag pans the photo |
| H-61 | Story editor chrome (IG) | Open photo editor; pinch-pan photo; open tools | Glass top/rail chrome; white Share pill; crop guide fades in while reframing |
| H-62 | Story multi-slide publish retry | Multi-photo → Share fails mid-batch → edit a slide → Share again | Changed slides re-publish (old item deleted); unchanged slides skipped; no duplicates |
| H-63 | Story text edit no ghost | Add text → edit | Overlay only (no duplicate compositor glyph behind) |
| H-67 | Story discard after partial publish | Multi-photo Share fails mid-batch → discard editor | Already-published slides removed (or cleanup error toast) |
| H-68 | Story adjust live preview | Open Adjust → drag brightness | Canvas updates while dragging; release commits undo step |
| H-69 | Story crop failure toast | Force crop error (invalid image) → Done | Toast shown; editor stays on crop screen |
| H-71 | Story crop fills 9:16 | Crop photo → Done (desktop + mobile browser + Capacitor iOS/Android) | Result fills story frame exactly (no letterbox / aspect jump vs cropper); Done works even if canvas.toBlob returns null |

### 6.5 Home subtabs & URL

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-28 | Past games subtab | Header → Past (History) | Past games list only (no stories, bookings, invites, or banners); load more when available; URL `/?tab=past-games` |
| H-29a | Past games empty | User with no past games → Past subtab | Empty state "No past games" |
| H-29b | FINAL card standing places | Past / My / Find card with `resultsStatus=FINAL` and outcomes that include `position` | Player row sorted by place; place badge above each avatar |
| H-29c | Non-standing card no places | Card not FINAL, or FINAL without positioned outcomes (e.g. training rating-only) | Player carousel order unchanged; no place badges above avatars |
| H-29d | Normal match place medals | FINAL 1v1/2v2 (or other non-tournament) game card | Place 1 shows gold trophy (ties share gold); other places show numbers |
| H-29e | Tournament place medals | FINAL `entityType=TOURNAMENT` card | Places 1–3 show gold/silver/bronze medals (ties share medal); 4+ show numbers |
| H-31 | Calendar subtab default | Open home | Calendar view default; no `tab` query param; Calendar/Past segmented control shows no unread badges |
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
| H-38j | Booking slot occupancy pill | Upcoming booking with partial or full linked game coverage | Small pill beside slot time: uncovered half empty, covered half tinted (emerald only when the whole slot is linked); 2h booking + 1h game must not show all-green |
| H-38f | Standalone booking card actions (My tab) | Connected user with at least one non-grouped upcoming booking | Tap standalone card → link/create/cancel actions animate in and card highlights; tap another standalone card → first collapses, second expands; tap same card again → actions collapse |
| H-38k | Grouped booking card actions (My tab) | Connected user with adjacent same-court upcoming slots | Tap grouped card → per-slot rows animate in with link/create/cancel; only one card expanded at a time; tap again collapses |
| H-38m | Padeloo upcoming (My tab) | User connected to Padeloo club (e.g. Avantura) with upcoming reservation | Bookings switch shows Padeloo booking card with provider label; cancel/link actions work |
| H-38n | Klikteren upcoming (My tab) | User connected to Klikteren club (Padel Pro NS) with upcoming booking | Bookings switch shows Klikteren booking card with provider label; cancel/link actions work |
| H-58 | My tab list view | My tab → tap Calendar in panel switcher to turn it off | Calendar hidden; UpcomingGamesList sections; preference persists after reload for that user; desktop has no split view; bookings/teams/leagues panel state stays open |
| H-58b | My calendar pref per user | User A sets calendar off → logout → User B (fresh) opens My → logout → login A | A restores off; B defaults on (no leak from A); A still off after B session |
| H-59 | My tab games calendar view | Tap Calendar in panel switcher (first icon) when off | Calendar expands/shown; no List button in calendar header; day selection works as before; desktop uses split view without remounting main content |
| H-59a | Calendar toggle on My | My tab with zero games, or only FINISHED/ARCHIVED | Calendar switch still available; calendar mounts only when switch is on |
| H-64 | Calendar weather toggle | My tab calendar expanded → tap cloud/sun icon in header | Icon highlights; day cells show weather pill (icon + temp) instead of entity-type pill where forecast exists; date select/filter unchanged |
| H-65 | Calendar weather toggle off | With weather mode on → tap cloud/sun again | Entity-type pills return; weather pills hidden |
| H-66 | Calendar weather toggle disabled | User without selected city | Cloud/sun control disabled; no weather requests; entity-type pills unchanged |
| H-67 | Calendar weather mode persists | Enable weather on My tab → reload | Weather mode still active; pills restored after fetch |
| H-68 | Selected date weather row | My tab calendar with city → pick date | Full-width weather row below date heading shows current temp, day range pill, precip and wind; tap opens day forecast modal without game window; past dates show mm precipitation and archived hourly data |
| H-39 | My tab bookings refresh | Switch away from My tab and back | Upcoming bookings refetched from club booking system |

---

## 7. Find tab (`/find`)

### 7.1 Views & date navigation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-01 | Calendar view default | Open Find | Calendar + games |
| F-02 | List view | Tap List in Find calendar header | Calendar collapses; weather toggle hidden; upcoming games from today grouped by date |
| F-03 | List → calendar | Tap Calendar in collapsed header | Calendar expands; day-filtered games |
| F-45 | Find calendar weather toggle | Find calendar expanded → tap cloud/sun icon | Weather pills on forecast days replace entity-type pills; filters and day selection unchanged |
| F-46 | Find selected date weather row | Find calendar → pick date | Weather row below date heading shows day range pill; tap opens day forecast modal |
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
| F-64 | Panel closed when no filters | Leave panel open with no criteria → leave Find → return (or reload) | Filters panel stays closed |
| F-14 | Club filter | Select club(s) | Games at club only |
| F-65 | Filters persist game→Back | Set panel filters (slots/rating/hide-bar/clubs/bars/time/level/no-rating/private) + entity chip + sport → open game → Back | Same total filter state restored in panel and chips |
| F-15 | Favorite clubs shortcut | Use favorites in panel | Clubs pre-selected |
| F-16 | Time range filter | Set start/end time | Games outside range hidden |
| F-17 | Level range filter | Adjust min/max level with regular games and BAR events present | Out-of-range regular games hidden; BAR events remain visible |
| F-18 | Sport filter | Switch primary/all sport | API refetch with sport; club list matches sport |
| F-20 | No-rating filter | Enable no-rating | Only casual games |
| F-21 | Show private games | `@admin` toggle | Private games appear |
| F-22 | Reset filters | Reset button | Defaults restored |
| F-23 | Filter persistence | Set filters → reload; leave Find and return | Filters restored from storage |
| F-42 | Available slots filter | Enable available slots toggle | Full games hidden |
| F-43 | Suitable rating filter | Enable suitable rating toggle with regular games and BAR events present | Out-of-band regular games hidden; BAR events remain visible |
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
| F-30 | Change city from header | Find header city button → `CityModal` | Tall bottom sheet opens (search hero + Near me + Map; no Cities/Clubs switch); dismiss via X / drag / outside (no Cancel footer) |
| F-59 | Change-city no mode switch | Open change-city sheet from Find header | No Cities/Clubs toggle; browse is country → cities only |
| F-60 | Change-city via club search | Open change-city → search club name → tap club | Commits that club’s city immediately (no Confirm); sheet closes |
| F-61 | Change-city search hero + Suggested | Open change-city with empty search | Suggested is top of every browse list (countries and cities), then the rows; scrolls away with the list |
| F-62 | Belgium / microstates in city picker | Change-city → browse/search Belgium, Andorra, Luxembourg, Monaco, Malta, Liechtenstein, San Marino, or Iceland | Country appears; cities with clubs open (e.g. Brussels, Andorra la Vella) |
| F-31 | Filter button active state | Apply any advanced filter | Filter button highlighted |
| F-32 | Favorite trainer highlight | `@user with favoriteTrainerId` + training filter | Favorite trainer games emphasized on calendar |
| F-33 | Gender-restricted game card | MEN/WOMEN/MIX game | Gender badge on card |
| F-34 | Join blocked wrong gender | User gender incompatible | Error toast / join blocked |
| F-35 | Level out of range | User level outside game range | Join blocked or warning |
| F-36 | Confirmed court badge on card | Game with `timeIsSet`, `hasBookedCourt`, club + court, no `externalBookingId` | Blue “Booked” pill (no checkmark) after time on game card |
| F-39 | Linked booking badge on card | Game with `bookingStatus=EXTERNAL_FULL` (Find tab / available games or game details) | Green “Booked” pill with checkmark after time on game card |
| F-40 | Booking row also-used-in pill | Link same booking to second game | Booking row shows soft pill with other game name(s) |
| F-41 | Game card badge partial external link | Game with `bookingStatus=EXTERNAL_PARTIAL` | Blue “Booked” pill (no checkmark) after time on game card |
| F-42 | Vertical scroll over participants strip (touch) | On a touch device, flick-scroll the game list vertically with the finger landing on a card's participant avatars row | List keeps scrolling vertically (not halted); a deliberate horizontal swipe on that row still scrolls the participants carousel |
| F-45 | Game card unified header | View cards of each entity type (game, training, tournament, league, bar) | Title row shows color-coded entity glyph (non-GAME) + name (entity-type label as fallback when unnamed); all pills (sport, participation, private, gender, no-rating, fixed teams, results) sit in one wrap row under the title; no duplicate entity pill |
| F-47 | Game card date tile | Cards with set time, today/tomorrow, and `timeIsSet=false` | Calendar tile (weekday/day/month) tinted by entity type; bold time range + club beside it; "Today"/"Tomorrow" chip for near dates; crossed-calendar tile + "not set" text when time unset |
| F-48 | Game card photo beside players | Cards with main photo (with/without players; league-season photo-only) | Square photo sits left of the participants carousel, stretched to the full carousel row height; carousel scrolls independently to the right |
| F-70 | Find FINAL card standing places | Find (incl. archived/finished) FINAL game with positioned outcomes | Card shows place badges (medal/number) above avatars, sorted by standing |
| F-71 | Find standings survive incomplete socket patch | FINAL Find card with places; receive socket update that omits outcomes or sends `[]`/`null` while still FINAL | Place badges remain; order unchanged |
| F-49 | Find load stable under socket noise | Open Find (calendar + list) while unrelated My/game room socket bumps arrive | Calendar day counts and upcoming list do not flash empty or refetch wholesale; games already on Find patch in place when that game updates |
| F-50 | Find filter list/calendar parity | Apply entity + slots + suitable rating (+ optional private/no-rating) toggles | Day badge counts match the filtered games shown for that day; list view applies the same filters |
| F-51 | Find progressive enrichment | Open Find cold; wait for cards then badges/weather/notes | Cards paint before notes/weather/reactions; enrichment failure leaves list intact |
| F-52 | Find busy-city ceiling | Busy city month with >300 public games; watch calendar/list | Month fetch is indexOnly (dayIndex badges, no month card dump); selected day loads day-scoped cards; “Load more games” when day `meta.hasMore` |
| F-66 | Find calendar keeps archived history | Busy city month with hundreds of ARCHIVED on early days and live games late | Early-day badges still reflect archived city games via dayIndex; selecting today/late day still lists live games via day-scoped fetch (not blank) |
| F-67 | Find empty day settles empty | Select a day with no games (dayIndex count 0); or force day-scoped `[]` with `hasMore=false` | List shows empty for that day (month no longer supplies card fallback). If day-scoped `hasMore=true` and empty, keep day authority + Load more |
| F-68 | Find city-TZ day bucket | Device TZ ≠ city TZ; open Find for a city day that has early-morning UTC games | Day badges and selected-day list include those games (bucketed/filtered in city TZ, same as API bounds) |
| F-69 | Find calendar type pills from dayIndex | Busy city month: badges/pills driven by dayIndex only | Late-day cells still show entity-type pills (GAME/TRAINING/…), not badge-only empty cells |
| F-72 | Find calendar unread + my-game pills (indexOnly) | User is participant / has unread on a game; open Find calendar | Day cell still shows unread dot and participant-type pill (from dayIndex + unread store), not only when month cards were loaded |
| F-53 | Find warm view / month + day prefetch | Open calendar, switch to list (and back); flip to prev/next month; tap adjacent day within ~30s | Inactive view + adjacent months (indexOnly) + ±1 selected days (cards) often hit warm cache |
| F-73 | Find seed empty day from dayIndex | Month indexOnly settled; select in-range day with dayIndex count 0 | Day list settles empty via seed (no sticky false-empty for out-of-range D±1); never seeds from keepPreviousData month placeholder |
| F-74 | Find day list not blocked by month index | Calendar visible; month index still pending or slow; select a day that day-scopes to `[]` (or settles with cards) | Day list shows empty/cards — not endless skeleton; pull-to-refresh still works while a fetch is in flight |
| F-75 | Find day load error + retry | Calendar; force day-scoped `/games/available` to fail with no cached day page (offline, 5xx, or >~4s) | Within ~4s×2 (one auto-retry), empty shows load-failed + Retry (not “no games”); Retry refetches that day. Settled empty day that later fails a background refetch keeps “no games”, not error |
| F-54 | Find structural filters server-align | Toggle club / entity / hide BAR / level band / available slots | Results match prior UX; filter changes refetch with new hash (not silent client-only discard of a fat payload) |
| F-55 | Find selected-day detail under truncate | Busy month; pick a late-month day | Day list comes from day-scoped fetch (complete for that day / load more), not from month cards |
| F-56 | Find day switch no wrong-day flash | Calendar: tap day A then day B quickly | No wrong-day cards; while day fetch resolves, loading — not previous day’s cards |
| F-57 | Find old app on new BE (enrich) | Store build that omits `format=card` against current API | Notes/weather/reactions still present on Find cards (inline enrich); month still capped ≤300 |
| F-58 | Find calendar LEAGUE_SEASON day bound | Open calendar; pick a day that is not the season’s startTime day | That day’s list does not show the LEAGUE_SEASON; it only appears on its actual calendar day (list/upcoming may still show shells) |
| F-63 | Same-day start-time order | Day with ≥2 active games at different times (e.g. 19:00 and 20:00); calendar selected day + list view | Active games list earliest-first (19:00 above 20:00); finished/archived remain after active |

---

## 8. Create game (`/create-game`)

### 8.1 Entry & entity types

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-01 | Invalid create route | `/create-game` without state | Redirect home |
| C-02 | Create GAME | Pick GAME intent | Wizard loads |
| C-03 | Create BAR | Pick BAR and create the event | Bar-specific fields; created BAR has no level band and never affects rating |
| C-04 | Create TRAINING | Pick TRAINING | Trainer fields |
| C-05 | Create TOURNAMENT | Pick TOURNAMENT (any logged-in user) | Roster/tournament defaults; cap 8–12 for normal users, up to 32 for `canCreateTournament` |
| C-06 | Duplicate game | From game details duplicate | Pre-filled form |
| C-07 | Bottom tabs hidden | On create page | Tab bar hidden |
| C-08 | Back navigation | Back button | Returns home |

### 8.2 Template & format wizard

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-09 | Sport selector | Multi-sport user switches sport | Format limits update |
| C-10 | Template picker | Select template | Format + rating defaults applied |
| C-10a | Padel Automatic default | Create padel doubles game (default load) | **Automatic** template selected (Match badge); `CLASSIC_AUTOMATIC` preset; generation Automatic; rating game on |
| C-10b | Automatic customize demote | Automatic template → Customize format → change any param | Custom/advanced card; template no longer matches |
| C-10c | Automatic set entry | Automatic game → set 1: SegmentedSwitch Set/games vs Americano points (match-level); set 2+ uses same mode; at 1–1 decider can pick super tiebreak; next match can differ | Set/games 0–10; after 1–1 third set defaults to match mode (not STB); STB only after switch; switching decider mode clears scores to 0–0 and saves without sync/offline banner; STB hint says first-to + win-by-2 and chips are 10–8 / 11–9 / 12–10 (not 6–0 set scores); non-blocking; title shows STB suffix only when STB selected |
| C-10d | Padel Super tie-break template | Create padel doubles → pick **Super tie-break** | `CLASSIC_SUPER_TIEBREAK` preset; Match badge; rating on; duration estimate shown; reopening format picker keeps template selected |
| C-11 | Game format wizard | Open/close wizard | Scoring preset saved |
| C-47 | Golden point deuce count | Create/edit classic game → Set structure step → pick Off / At 40–40 / After 1–4 deuces | Setting saved on game; live scoring uses advantage until threshold then sudden death at 40–40; watch matches web |
| C-12 | Rating vs social game | Toggle affects rating | Flag persisted on create |
| C-40 | Non-default match format | Padel → singles (1v1) or tennis → doubles (2v2) via team format control | Format card summary shows Singles/Doubles; roster is 2 or 4 |
| C-41 | Padel singles templates | Create padel game → 1v1 → open format templates | Match tab: Best-of-3 (Official) + Single set; no large-roster social templates |
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
| C-13n | Club booking create game soft link | Create game from booking row (`bookingIds=…` or legacy `locationTimeMode=bookings&bookingIds=…`) | Unified location & time surface; reservation card pre-selected; game saved with `hasBookedCourt: true` and linked bookings |
| C-13o | Club booking cancel linked game warn | Cancel booking that has linked game | Success + non-blocking "Your game is still on the calendar" + Open game; linked game no longer shows "Fully booked" badge (booking unlinked) |
| C-13q | Club booking signup connect | ConnectClubSheet → new user signup + OTP | Account created; connected chip shown |
| C-13r | Club booking create-game grid refresh | Open create-game for BOOKTIME club with stale snapshot | Banner then red external cells after snapshot PUT |
| C-13s | Club booking scout pool degraded | Unconnected user, empty scout pool | "Live availability unavailable" banner on create-game/club detail |
| C-13u | BOOKTIME court name labels | Open club detail, availability sheet, or court picker for BOOKTIME club where Bandeja court name differs from BookTime resource name | Primary label shows Bandeja court name; smaller integration name on same row |
| C-13v | BOOKTIME create-game time grid | Create GAME at BOOKTIME club on a day with gaps in `get-available-slots` (e.g. 08:00–10:00, 12:00–19:00) | Time picker shows only starts inside available ranges for selected duration; gap times (fiesta/blocked) absent; reserved gaps show as club-booked |
| C-13w | Create-game scheduling layout | Open create-game, pick BOOKTIME club | Single location & time card: club → **How are you getting the court?** segmented chip picker (sliding selection + detail panel) → date → courts/time or reservation list per intent |
| C-13x | Reservation intent (integrated club) | BOOKTIME club on create | **Book a court** and **Skip court booking** always; **I already have a booking** only when user has club reservation(s) on selected date — **recommended** and auto-selected when reservations exist on date; no "Don't book real court" toggle |
| C-13x1 | Reservation intent (non-integrated club) | Club without BOOKTIME integration on create | **Skip court booking** (default) and **Already booked manually** only; **Book a court** and **I already have a booking** hidden |
| C-14p | No court yet time grid | BOOKTIME club, intent Skip court booking, tap "No court yet" | Full club schedule; red external cells selectable; bookable-days strip only for Book a court |
| C-14q | Game only on external overlap | Intent Skip court booking; pick slot overlapping red external booking | Save succeeds (info banner ok); no hard-block toast |
| C-13y | Create-game reserve CTA | Intent Book a court; pick integrated court(s), connected, time | CTA "Reserve court and create game" (or "Reserve N courts…" for multi-court); court grid has no **No court yet** option |
| C-13y1 | Reserve court now requires court | BOOKTIME club, intent Book a court | **No court yet** hidden; duration and no-time-slots hint hidden until court selected; dashed **Select a court first** hint shown instead; create blocked until required integrated court(s) selected |
| C-13z | Create-game inline auth gate | Intent Book a court or I already have a booking; not connected | Auth inline in panel; date/courts/duration/time/reservation summary hidden until connected; weather hidden until time selected; Create/Reserve CTA always enabled; tap without auth shows sign-in toast and scrolls to auth gate |
| C-14a | Create-game confirm morph | Reservation ON, connected, pick slot → Create | Single dialog: review → reserve → create → success → calendar |
| C-14b | Create-game bookable days strip | Reservation ON, connected | Date strip only (no calendar); days clamped to club `bookableDays` |
| C-14c | Create-game no overlap when reserving | Reservation ON | No yellow/red overlay; overlap gate skipped on submit |
| C-14d | Create-game slot taken on confirm | Slot taken between confirm and API | Step 1 error; dialog closes to time grid |
| C-14e | Create-game snapshot block | Reservation ON, `noSyncToday` banner | Confirm disabled until snapshot usable |
| C-14r | Create-game sync banner false positive | BOOKTIME club, user connected (bookings visible on My bookings); open create-game and select club | No amber "sync isn't active" banner while availability loads; banner only if snapshot refresh actually fails |
| C-14f | bookingIds deep link | Open create-game from booking row (`bookingIds=…` or legacy `locationTimeMode=bookings&bookingIds=…`) | Unified location & time; reservation card + green grid pre-selected; preselected banner; create succeeds without book confirm |
| C-14g | Create-game confirm closes on edit | Open confirm; change time/court/date | Dialog closes automatically |
| C-14h | Create-game !liveApiEnabled | BOOKTIME club without scout/connection | No reservation UI; generic time grid |
| C-14i | Create-game rollback on create fail | Reservation ON; force game create API error after successful book | Confirm shows create-failed copy; court reservation rolled back (or rollback-failed message if cancel fails) |
| C-14j | Create-game no request loop | Reservation ON, connected; open create-game for BOOKTIME club | Snapshot/slots/club fetches settle once per date/court change — no repeating network storm |
| C-14k | Create-game court grid occupancy | Pick club with multiple courts; change date | Court picker is inline grid (not dropdown); each compact card shows court name (+ indoor icon) and integration name on the left, smaller occupancy ring on the right with fill % for selected date |
| C-14l | Create-game multi-court selection | Set max participants > 4; open court grid | Hint shows required court count; tap toggles courts up to min(ceil(participants/4), club courts); numbered badges on selected cards |
| C-14m | Create-game multi-court create | Create game with 2+ courts selected | Game created with `courtIds`; primary `courtId` is first; gameCourts populated |
| C-14n | Create-game selected time summary | Pick club + date + duration; tap a time slot | Below time grid, card shows selected start → end and duration badge; updates when time or duration changes |
| C-53 | Create-game time slot weather pills | Create-game or edit Location & time; club with `cityId`; pick today or forecast date | Each time slot shows calendar-style weather pill (icon + temp) when hourly forecast exists; booked/blocked slots use muted pill; no pills without city |
| C-54 | Create-game time slot weather toggle | Open create-game or edit Location & time time grid | Cloud/sun toggle on Select time row; on by default; tap hides/shows slot pills; disabled without city; preference persists on reload |
| C-14p | Create-game no time slots | Pick club/court/date with zero available slots (or late day with no times left) | No time grid or duration (except BOOKTIME: duration stays to try another length); dashed hint explains no times; no stale selected-slot summary |
| C-14o | Create-game direct create overlay | Create without reservation pipeline (no integrated book confirm) | Page fades; fullscreen creating overlay; brief success; navigates to calendar |
| C-14s | Create-game no court camera link | Select court with `webCameraUrl` on create-game | No “watch live” / web camera card below court grid; cameras remain on game details after create |
| C-14 | Court not booked | Intent Skip court booking → "No court yet" | Allowed; summary says no real reservation |
| C-15 | Court booked | Pick court | Overlap warning if conflict |
| C-16 | Mark court booked modal | Confirm booking | Court marked |
| C-17 | Unified location-time panel (integrated club) | Pick BOOKTIME club on create | Intent-first scheduling; no "Pick a time" \| "Bookings" segmented switch; reservations list only when **I already have a booking** |
| C-18 | Book a court flow | Intent Book a court; integrated courts + time | Summary states real reservation; confirm modal on create; no negative opt-out toggle |
| C-19 | Reservations strip multi-select | Intent I already have a booking; connected user; reservations on date; multi-court format (max > 1) | Court-labeled cards; progress bar (N/max) while selecting; green completion chip with linked time when min met; at-max hint when further rows dimmed; no progress UI for single-court (max 1) games |
| C-19a | Reservations strip club TZ display | Create-game at club whose city TZ ≠ Europe/Belgrade | Reservation row wall-clock matches My bookings for same reservation |
| C-19b | useExisting hidden without reservations | Integrated club; connected; date with no user reservations | **I already have a booking** intent not shown in picker |
| C-19c | Reservations strip adjacent group | 2+ consecutive same-court slots on selected date | Grouped card with segmented hour picker; each hour selectable independently; different courts never group |
| C-19d | Reservation grid overlay sync | Intent I already have a booking; reservations on selected date | Green cells on grid; selected reservations stronger green + check; legend under time label |
| C-19e | Linked reservation row | Intent I already have a booking; select 1+ reservations | Selected row shows court name + time window + price when available; linked-game amber warning badge on row when applicable; no separate hint card |
| C-19f | Schedule sync from reservations | Intent I already have a booking; select reservation(s) | Form date, time, duration, court chips update from booking union; completion chip shows linked window for 1 court; sticky summary bar for 2+ linked reservations |
| C-19g | Multi-court link create | Intent I already have a booking; select 2 reservations on different courts | Game persists 2 linked bookings and both court IDs; no book confirm modal |
| C-20 | Override time when linking | Intent I already have a booking; toggle adjust game time | Expand animates; create uses shorter window within reservation bounds |
| C-21 | Multi-court confirm 2 steps | Intent Book a court; 2 integrated courts → Create | Stepper: 2 reserve steps + create; rollback on fail |
| C-22 | Deep link bookingIds | `?bookingIds=uuid` | Intent defaults to I already have a booking; preselected banner; grid selected; create without book confirm |
| C-22a | Adjacent reservations strip group | I already have a booking with 2+ consecutive same-court slots | Grouped card; select one hour inside group when max=1; remaining hours stay available for other games; deselect respects min selection |
| C-14t | Multi-court shared slot hint | Intent Book a court; 2 courts selected; no intersecting Booktime slots | Amber hint: try different courts, date, or duration |
| C-14u | Create validation toasts | Submit without court/time/auth per intent | Inline toast + scroll to location section (not silent abort) |
| C-14v | Edit keep current reservation | Edit game with linked bookings | Default **Keep current reservation**; read-only linked list + consequence summary; no reservation picker |
| C-14w | Edit reservation actions | Edit integrated game | Actions: keep current, change time only, use existing, reserve new, unlink, game only — unavailable actions hidden (not greyed out); picker only for use existing |
| C-14x | Edit unlink save | Edit → Unlink reservation → Save | Consequence warns club reservation stays active + policy; confirm before save |
| C-14y | useExisting hidden without reservations | Integrated club; connected; selected date has no club bookings | **I already have a booking** intent not shown (not blank strip / empty-state card) |
| C-14z | Edit multi-court shared slot hint | Edit integrated game → Reserve new; 2 courts; no intersecting slots | Amber hint: try different courts, date, or duration |
| C-24 | Date/time | Change start + duration | End time updates |
| C-25 | Level range slider | Adjust range | Min ≤ max |
| C-26 | Max participants (tournament/league) | Change tournament or league roster count | Roster options update within user cap |
| C-49 | Game match format only | Create GAME on padel/tennis | No participant-count grid; 1v1/2v2 selector sets roster to 2 or 4 |
| C-50 | Game fixed roster | Create GAME singles then doubles | Roster slots and `maxParticipants` follow format (2 ↔ 4) |
| C-27 | Fixed pairs segmented switch | Create GAME doubles → pick Rotating or Fixed pairs | Team setup shown when Fixed pairs selected |
| C-27t | Tournament match format + fixed pairs | Create TOURNAMENT → pick participant count cards → 1v1/2v2 then Rotating/Fixed pairs | Same controls as GAME; roster cards unchanged; Fixed pairs only when 2v2 |
| C-28 | Game name & miscellaneous | Name input inside Name & photo card at top; description and price in Miscellaneous section | Saved on submit |
| C-29 | Price fields | Set price type/currency/total under Miscellaneous | Saved correctly |
| C-30 | Avatar upload | Upload game image via Name & photo card (avatar left of name input) | Preview shown |
| C-31 | Invite players | Open player list → select | Invites sent on create |
| C-32 | Participants setup tags | Configure setup | Tags on game |
| C-33 | Multiple courts | Enable multi-court | Court count selector |
| C-34 | Submit create | Complete valid form | Game created → details page |
| C-35 | Validation errors | Submit incomplete | Errors shown, no create |
| C-36 | Floating summary bar | Fill club/time/etc., scroll down past those sections | Animated chip bar appears under header summarizing scrolled-out values (sport, roster, format, club, date·time·duration·court, participants/level, name, price) |
| C-37 | Summary chip scroll-back | Tap a chip in the summary bar | Page smooth-scrolls back to that section; chip disappears once section is visible |
| C-38 | Summary bar empty values | Scroll past sections with nothing entered (no name, price not known) | No chip shown for empty sections; bar hidden when no chips |
| C-52 | Settings collapse | Create game → Settings section | Collapsed by default (title + chevron only); tap header, padding, or chevron to expand/collapse; toggle rows only flip their switch (do not collapse); expand animates toggles and hints button in |
| C-53 | Numbered step headers | Open create game (any entity type) | Sections grouped under numbered headers (Game setup, Location & time, Players, Settings & details); BAR without multi-sport skips Game setup and renumbers from 1 |
| C-54 | Sticky create footer | Open create game, scroll anywhere | Create button always visible in sticky bottom bar; not part of scroll content |
| C-55 | Footer readiness hint | No club selected (then club but no time) | Amber hint in footer (“Choose a club to continue” / time-validation message); tap scrolls to and highlights the offending section; hint disappears when form is ready |
| C-56 | Empty setup card hidden | Create BAR event | No empty “Participants” card rendered before location section |
| C-57 | Location sub-step order | Open create game location block (with and without integrated club) | Order: Club → booking intent → Date → Court → Start time; date/court/time hidden until club selected (dashed “Select club first” hint below club picker) |
| C-58 | Location sub-step completion ticks | Pick club, then court, then time | Each sub-step header (Club, Date, Court, Start time) flips its icon to a green check as it’s completed; Date is checked by default |
| C-59 | Club picker states | View club picker before/after selection (create + edit location tab) | Unselected: dashed primary CTA with pin icon + “Select Club”; selected: club avatar, name, address, chevron; tap opens club modal |
| C-60 | Location sub-step value pills | Pick date, court, time in location block (create + edit location tab) | Sub-step headers show current selection as right-aligned pill (Date: “Sat, Jul 12”; Court: name or “2/3” in multi-court; Start time: “18:00–19:30”); pill is green when the sub-step is done |
| C-61 | Calendar picker dialog | Tap calendar tile in Date row | Calendar opens as modal dialog with title and close button; picking a date applies it and closes; X, outside tap, or hardware back dismiss without changing the date |

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
| GD-05a | Group standings FAQ | League season with fixed teams **or** 1v1 (`playersPerMatch === 2`, not fixed); open FAQ tab (and owner General FAQ editor); deep-link `?tab=faq` | Auto Q&A explains group order (wins → H2H → mini-table); FAQ tab visible with no custom FAQs; editor shows read-only Automatic entry; deep-link stays on FAQ; all locales; **not** shown for 2v2 non-fixed |
| GD-06 | Photos section | Upload/view photos | Gallery works |
| GD-06a | Open photos API | FINAL game, `forbidOthersPhotosView` off; anonymous `GET /games/:id/photos` | Returns photo list (200) |
| GD-06b | Open photos UI guest | Same game; guest opens game details and games list | PhotosSection and GameCard thumbnail visible without login |
| GD-06c | Restricted photos | FINAL + `forbidOthersPhotosView` on; stranger or anonymous | Gallery and thumb hidden; participant sees gallery |
| GD-06d | Photos before FINAL | Game with `resultsStatus` not FINAL | Nobody sees photos section or card thumb (any viewer) |
| GD-06e | Photo privacy toggle | FINAL game with visible Photos section; owner/admin toggles in gallery header | Setting persists; visibility matches matrix |
| GD-06f | Photo upload permissions | Participant uploads; stranger cannot upload/set main | Upload/set-main succeed for participant/admin only |
| GD-06g | Fullscreen game photo original + gestures | Open Photos section → tap a photo | Viewer loads `originalUrl`; pinch/rotate/wheel/double-click behave like CH-30c–CH-30e |
| GD-07 | Open game chat | Chat button | `/games/:id/chat` |
| GD-104 | Weather dialog opens on game day | Game with weather summary → open forecast dialog | Full-day hourly chart/list for game day; game hours tagged “Game” |
| GD-106 | Weather dialog archive day | Past game with weather → open dialog | Full 24h archive day (not game-window only); hourly rows and chart show precipitation in mm |
| GD-107 | Weather dialog scroll archive days | In weather dialog on past game → previous/next day | Each day loads full hours via `/weather/day`; data persists (no refetch on revisit) |
| GD-105 | Weather dialog day navigation | In weather dialog → next/previous day chevrons | Day label and chart animate; counter updates; “Go to game day” appears when away from game day and returns on tap |
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
| GD-86b | Linked booking occupancy pill | Game details “From your reservations” row for a booking longer than the game window | Occupancy pill matches My Bookings for that reservation (partial when game covers only part of the slot) |
| GD-89 | Linked bookings coverage badge | Game with linked bookings where count or booking window does not cover game courts/time; viewer owns linked reservation | Section header shows blue “Not fully booked” badge |
| GD-90 | Linked bookings fully covered badge | Game with enough linked bookings spanning full `startTime`–`endTime` for required courts; viewer owns linked reservation | Section header shows green check “Fully booked” badge |
| GD-103 | Linked booking status in game info (non-owner) | Game with `linkedBookings`; viewer is not the Booktime reservation owner (participant, guest, or other user) | “From your reservations” section hidden; game info club row shows green “Fully booked” or blue “Not fully booked” badge instead of manual court booked text |
| GD-117 | Court booking status change notify | Participant or waitlisted player on game; owner toggles court booked / links or unlinks reservation so `bookingStatus` changes | Game chat system message with new status; push + Telegram to playing + waitlist (not pending invites), same channels as club/date-time change |
| GD-87 | Linked booking refresh (owner) | Game details linked booking that exists in viewer's Booktime account | Refresh icon on row; success toast if still active |
| GD-88 | Linked booking absent unlink | Refresh when booking gone from viewer's Booktime account | Modal explains link removal; game stays; confirm removes link from this game |
| GD-91 | Delete game with linked bookings | Owner deletes game with `linkedBookings` → confirm → second modal | Lists linked reservations; explains club bookings stay active; "Delete anyway" proceeds |
| GD-92 | Delete game without linked bookings | Owner deletes game with no `linkedBookings` | Single confirm modal only; delete proceeds immediately |
| GD-93 | Court cameras section visible | FINAL game on court(s) with `webCameraUrl` | “Court cameras” card lists each court with “Web camera” link; link opens URL |
| GD-94 | Court cameras section hidden | Game not FINAL, or FINAL but no played court has `webCameraUrl` | Court cameras section absent; web camera link absent from game info club row |
| GD-97 | Participants chat section visible | Owner opens game with `resultsStatus` NONE before participant chats enabled | “Participants-only chat” card with create button |
| GD-98 | Enable participant chats | Tap create → confirm | Section animates away; game chat shows Participants + Organizers tabs with system messages |
| GD-99 | Parent admin enable participant chats | League owner opens child game | Same as GD-98 |
| GD-100 | Participants chat section hidden | Open game after chats enabled | Section absent |
| GD-101 | Non-admin no participants chat section | Regular playing participant | Section not shown |
| GD-102 | NON_PLAYING private chat unread | NON_PLAYING participant; new message in Participants (PRIVATE) tab | Game chat badge increments; push delivered when not viewing chat |
| GD-103 | Participants chat section hidden after results start | Owner opens game with `resultsStatus` IN_PROGRESS or FINAL | Section absent even if participant chats not yet enabled |

### 9.2 Participation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-08 | Join open game | Join CTA | Participant added |
| GD-09 | Leave game | Leave → confirm | Removed; local game chat thread purged so background sync does not keep hitting 403 |
| GD-09a | Leave chat only | Guest/non-playing leave chat from details | Chat access removed; local game chat purged |
| GD-10 | Decline pending invite | From participants | Invite declined |
| GD-11 | Join queue | Full game | Queue position shown |
| GD-12 | Owner accept queue | Accept queued user | User becomes participant |
| GD-13 | Owner decline queue | Decline queued user | Removed from queue |
| GD-14 | Cancel own queue request | Cancel queue | Removed |
| GD-15 | Invite players | Owner opens player list → invite | Pending invites shown |
| GD-15a | Invite search Cyrillic→Latin | Open invite list; type Cyrillic prefix of a Latin-named player (e.g. `ив` for Ivan) | Player stays in results after debounce (does not flash then vanish) |
| GD-15b | Invite search clear | Open invite list; type 2+ chars so results update; clear the search field | List stays mounted (no full-modal spinner); default invitable list restores after debounce |
| GD-16 | Cancel invite | Owner cancels pending | Invite removed |
| GD-16a | Expired invite outcome | Let a pending invite expire → open player list | Player appears under invite responses with “Invite expired”, not “Invite cancelled” |
| GD-17 | Guest join chat only | Join as guest | Chat access without full join |
| GD-18 | Carousel vs list participants | Toggle view mode | Layout switches |
| GD-18a | Invite not in game chat | Owner invites player from participants list | Pending invite on participants panel; no "X invites Y" system message in game chat; other participants get no chat/push notification for the invite |

### 9.3 Edit game (owner/admin)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-19 | Edit general info | Edit drawer → general tab | Nearly fullscreen bottom drawer (city-selector style drag handle + close); "Edit details" title; fit-content centered tabs (active tab shows icon+label); avatar and name on one row; name/description updated |
| GD-116 | Edit game info drawer height | Open edit on mobile viewport | Drawer uses most of viewport (`~94dvh`), not a small centered dialog; footer actions sit above home-indicator safe area |
| GD-20 | Edit location & time tab | Edit modal → Location & time | Single tab replaces Where+When; club picker visible; one scheduling panel (date, courts, time grid); no bookings/time segmented switch |
| GD-20b | Edit opt-out full schedule | BOOKTIME game, integrated court, toggle "Don't book real court" ON (or Don't select court) | Full club time grid; red external cells selectable and saveable; same as create-game opt-out |
| GD-20a | Edit game change club | Edit modal → Location & time → change club | Club modal opens; new club selected; courts refresh for new club |
| GD-20c | Edit club modal sport filter | TENNIS game → edit Location & time → open club modal | Only TENNIS-capable clubs listed |
| GD-20d | Edit legacy club kept | TENNIS game at club no longer supporting TENNIS → edit Location & time | Current club still shown in picker; user must change club or pick compatible court |
| GD-20e | Edit court grid sport filter | TENNIS game at multi-sport club → edit Location & time | Court grid shows TENNIS + null-sport courts only; courts API called with `sport=TENNIS` |
| GD-20f | Edit prunes incompatible courts | Multi-sport game with padel court saved → club gains sport tags → reopen edit modal | Incompatible court selections cleared when modal opens |
| GD-20g | Edit sport mismatch rejected | API: update game `clubId` or `courtId` to sport-incompatible venue | 400 with sport mismatch message |
| GD-20h | Edit settings tab | Edit drawer → Settings (gear) tab | Settings always expanded (no collapse chevron, no gear title icon); hints button only; toggles save in place; footer shows "saved automatically" note + Close only, no Save |
| GD-21 | Edit with linked bookings | Game with 2 linked courts at BOOKTIME club → edit Location & time | Unified surface: reservations strip + green grid; both links pre-selected; rows show each linked court |
| GD-21a | Edit add booking link | Edit game with 0 links → select reservation card | Schedule syncs from selected booking; save links game |
| GD-21b | Edit partial unlink | Game with 2 linked courts → deselect one card → Save → confirm | Pending unlink hint; only deselected link removed; other link and courts preserved |
| GD-21c | Edit shared reservation | Reservation card shows other linked games | Informational only; user can still link this game |
| GD-22 | Edit unlink last booking | Deselect last linked reservation card | Pending unlink hint; after save manual time grid available; amber hint that club booking stays active; save asks confirm unlink |
| GD-22a | Edit unlink save confirm | Edit modal → unlink reservation → Save | Confirm modal warns real booking is not cancelled; save unlinks only |
| GD-22b | Edit switch linked booking | Game linked to booking A → edit location/time → pick booking B or book new court → save | Booking A unlinked from game; only B linked; game no longer shows stale "Fully booked" for A |
| GD-23 | Edit price | Price tab | Price type shown as vertical radio list with icons; amount + currency row appears only for paid types; price fields updated |
| GD-108 | Edit modal save gating | Open edit modal, change nothing, then edit name | Save disabled with no changes; after edit an "Unsaved changes" hint appears in footer and Save enables |
| GD-109 | Edit modal discard confirm | Change any field → close via X / swipe dismiss / Cancel | "Discard changes?" confirm shown; Keep editing returns to drawer with edits intact; Discard closes without saving |
| GD-23 | Edit level range | Level modal | Min/max saved |
| GD-24 | Edit max participants | Max participants modal | Capacity updated; GAME modal shows 1v1/2v2 only (no current/maximum summary) |
| GD-24t | Edit tournament match format / fixed pairs | TOURNAMENT → edit participants setup | Modal keeps participant cards; shows 1v1/2v2 + Rotating/Fixed pairs; save updates `playersPerMatch` / `hasFixedTeams` |
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
| GD-109 | Score entry modal layouts | Open set score modal in portrait and landscape | Portrait: 3-column grid — team avatars top row, aligned `− score +` row below with `:` center; landscape: two stacked team rows (avatars left, horizontal stepper right); no overlapping elements; leading score green |
| GD-110 | Score entry number picker | Tap the big score value in score modal | Keypad expands below scoreboard; modal scrolls so keypad bottom is fully visible; header shows stacked avatars + player names for active team; Set/games 0–10; picking a number highlights the cell briefly before auto-advance; first pick on team A slides to team B, first pick on team B slides to team A; second pick closes keypad; closing scrolls back to scoreboard |
| GD-111 | Score entry invalid score hint | Enter illegal set score (e.g. 6:5 classic) | Hint replaces header slot (title/mode switch hidden); scoreboard and keypad stay fixed; suggestion chips apply both scores; Save disabled while invalid |
| GD-112 | Extra set entry switch | Add extra set → open its score modal | Games/Balls segmented switch in header; Balls caps score values |
| GD-29 | Conflict resolution | Conflicting entries | Conflict modal |
| GD-30 | Submit results | Finalize results | Status updates |
| GD-30a | Post-match level feedback eligibility | FINAL GAME/LEAGUE/TOURNAMENT as PLAYING participant | Inline feedback card lists only other PLAYING users who shared an officially scored match; self, non-playing owners, blocked users, unplayed/extra-only matches, BAR, and TRAINING are absent |
| GD-30b | Level feedback autosave | Open card → choose Lower / About right / Higher for each player | One-player sheet advances, progress updates, each tap persists immediately, retry toast + optimistic rollback on failure, answers restore after reload |
| GD-30c | Level feedback edit window | Reopen completed feedback before and after 14-day deadline | Before deadline answers can be changed; after deadline completed summary remains read-only and incomplete prompt is hidden |
| GD-30d | Result reset feedback lifecycle | Submit level feedback → fully reset/delete results → finalize again | Prior evaluations are removed with reset/delete; newly finalized game can be evaluated again |
| GR-streak-1 | Play streak banner on finalize | Rated finish that advances own weekly streak → Results tab | Banner once (“Streak started!” / “Streak · N weeks”); absent on same-week refresh |
| GD-31 | Recalculate results | Owner recalc | Standings update |
| GD-32 | Training level edit | Training game → level modal | Levels updated |
| GD-33 | Live scoring link | Open live board | `/games/:id/live` |
| GD-34 | TV mode | `?tv=1` on live | TV layout/theme |
| GD-35 | Broadcast view | `/games/:id/broadcast` | Broadcast layout |
| GD-113 | Round header match progress | Multi-round game with 2+ matches per round → finish some matches | Round header shows animated progress bar + `finished/total` counter; bar turns green when all matches complete |
| GD-114 | Available players footer header | Edit a match with unassigned players in roster | Bottom sheet shows "Available Players" label with count badge above the draggable carousel |
| GD-115 | Round added summary modal | Add round in results entry with ≤4 playing participants vs 5+ | ≤4: round added inline with no summary modal; 5+: modal lists generated match pairings |
| GD-116 | Round added match layout | Open round-added modal at viewport <490px vs ≥490px | <490: each match stacks team A above swords above team B; ≥490: teams sit side by side; each team is a distinct neutral bordered card with vertical localized Team A/B label on the left and swords between |
| GD-36 | Results card hidden without photo | Final results, no game photo yet | No results photo card; Play again shown only if viewer is PLAYING; stories switch shown only if viewer is PLAYING |
| GD-36b | Results card above tabs | Final results with photo | Results card + Play again (and stories switch if PLAYING) sit above Results/Stats/Scores switch, not inside Results tab |
| GD-36c | Play again only for players | Results as PLAYING participant vs guest/spectator/owner-only | Play again visible only when current user has PLAYING status on this game |
| GD-36d | Show in stories toggle | PLAYING (or outcome) user on FINAL toggles off then on | Switch above tabs; entity label; default on; off removes GAME_RESULT (and bracket champion on league season) from followers live+feed; on restores when eligible; profile shareGameResultsToFollowers still required |
| GD-36e | Stories switch hidden for non-players | View FINAL results as guest/spectator | No "Show this … in my stories" switch |
| GD-36f | Toggle survives tab switch | Toggle off, switch to Scores then back | Switch stays off; card+switch remain above Results/Stats/Scores control |
| GD-36g | League season stories switch | Open LEAGUE_SEASON as player (even if season resultsStatus is not FINAL) | Switch visible; toggles season story visibility including bracket champion |
| GD-36h | Landscape table view switch | FINAL game in landscape/table view as player | Stories switch remains visible above the table (not only in hidden results engine host) |
| GD-36j | Table view for admin | TOURNAMENT IN_PROGRESS; open as isAdmin (non-premium) | Table View toggle opens ResultsTableView |
| GD-36i | Final fixture also gates champion | Toggle off on playoff final (GRAND_FINAL / terminal MAIN) | Hides that fixture GAME_RESULT and mirrors to season participant → BRACKET_CHAMPION hidden too |
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
| GD-44a | My schedule multi-group bookmark | User plays in 2+ groups of same season → Schedule → My | Each card shows flush bottom-left colored group bookmark with group name |
| GD-44b | My schedule single-group no bookmark | User plays in only one group → Schedule → My | No group bookmark on cards |
| GD-44c | My schedule group filter | User plays in 2+ groups → Schedule → My → group selector | Options: All + only groups user plays in; selecting a group shows only that group's fixtures |
| GD-44d | My schedule status filter | Schedule → My → status selector | Options: All / Not scheduled / Scheduled / Played; list filters by timeIsSet + FINAL; empty filtered state when no matches |
| GD-44e | League fixture MatchCard results | Owner/admin or `resultsByAnyone` player on a non-FINAL fixture → Start results; enter sets; finish when match ready. Second client on schedule/bracket/TV/live board/watch sees set tiles + Start/Finish/Edit state update without refresh (including after socket reconnect) | Uses same MatchCard + GameResultsEngine flow as a normal game: start creates round/match with 0:0; set tiles follow scoring rules (next set appears when required); Finish appears while IN_PROGRESS with teams ready; Edit reopens FINAL; walkover/forfeit stay non-editable; live updates via fixture `game-{id}` rooms + shared results cache (status + rounds) |
| GD-45 | Planner tab | `@participant` | Planner accessible |
| GD-46 | Standings tab | View table | Standings correct |
| GD-47 | Fullscreen league table | `/games/:id/league-table` | Fullscreen table |
| GD-48 | Fullscreen bracket | `/games/:id/league-bracket` | Bracket view |
| GD-49 | Edit league teams | Team assignment modal | Teams saved |
| GD-50 | Playoff configuration | Playoff wizard | Bracket generated |
| GD-128 | Playoff player name format | Open playoff creation, seed order, summary, and bracket preview for individual and fixed-team seasons | Every player is shown as initial + last name, matching league standings/matrix formatting |
| GD-129 | Bracket game format templates | Fixed-team season → create bracket playoff → Game Setup | GAME format templates are shown; group fixture format is preselected and unchanged until user selects a template or customizes it; confirmed format applies to bracket games |
| GD-130 | Bracket game setup remount restore | Confirm Game Setup → summary → Back → Game Setup | Previously confirmed template/custom format is restored; Next keeps that payload |
| GD-131 | Bracket handmade season stays Custom | Season fixture uses HANDMADE + classic scoring → Game Setup | Format stays Custom with season generation/scoring; not silently clamped to AUTOMATIC |
| GD-132 | Bracket locked match size templates | Tennis/badminton doubles season → Game Setup | Only templates matching season `playersPerMatch` are listed; singles templates absent |
| GD-133 | Per-group advanced bracket settings | In a multi-group separate bracket, change third-place for Group A; observe mismatch hint; use Copy to other groups; continue to preview | Localized animated hint names only differing eligible groups and states on/off; copy action disappears after values match; copied third-place fixtures appear beneath Final for every eligible group |
| GD-134 | Playoff wizard progress header | Move through playoff creation steps, including Game Setup | Step fraction pill and animated progress bar reflect the current step; title remains visually centered beneath the close button |
| GD-135 | Live bracket third-place placement | Open a created playoff bracket with a third-place match | Third-place heading and match card render beneath Final in the same horizontal column, including fullscreen/export |
| GD-136 | Bracket image export with modern theme colors | Open a populated playoff bracket in light/dark mode → Export image | PNG downloads successfully with Tailwind theme colors and the complete horizontal bracket |
| GD-137 | Custom bye keeps all entrants | Create bracket with custom bye on a non-top seed (e.g. 7 teams, bye seed #3/#4) | Preview and created bracket include every entrant once; play-in count matches non-bye pool; no missing feeder slots |
| GD-138 | Championship walkover | Assign walkover on unfinished Final / third-place / grand final with both contestants | Match finalizes; champion/podium updates; no “no advancement target” error |
| GD-139 | Ineligible advanced options cleared | Enable third place (or consolation) with enough entrants, then reduce selection below eligibility | Toggle disappears; summary/create payload no longer requests the ineligible option |
| GD-140 | Bracket game setup blocks points winner | Bracket Game Setup → Customize → Ranking | Winner-by-points is unavailable; only deterministic match-winner options remain |
| GD-141 | Complete double-elimination progression | Create an 8-team double-elimination playoff; finish winners and losers matches, making the losers-bracket champion win GF1 | Every winners-round loser enters the losers bracket after its first loss; GF1 creates a reset final only when the previously unbeaten team receives its first loss; the reset winner becomes champion |
| GD-142 | Advanced bracket visual preview | Enable consolation or double elimination in per-group and cross-group creation; open Preview | Preview draws every consolation/losers round and grand final; double elimination also shows the conditional reset final; mutually exclusive options cannot remain enabled together |
| GD-143 | Bracket playoff-day scheduler | Create separate 8-team brackets for groups A/B/C → Schedule fixtures; select one club, four courts, C→B→A, 45 minutes, 10:00 → Build | Five-step wizard shows a compact wave×court plan; all 24 quarterfinal/semifinal/final/bronze fixtures are present; no court overlap or feeder timing conflict |
| GD-144 | Bracket schedule fine tuning | Expand Fine-tune; change one future fixture court/start/duration | Grid and validation update immediately; overlapping court or start-before-feeder blocks Next; valid edits persist after Back/Next |
| GD-145 | Planned fixture visibility | Create scheduled bracket before semifinal teams are known; open Schedule → Bracket as another league user | Future slot is visible with date, time, club, court, round and “Teams pending”; there is no fake game chat/join/results action |
| GD-146 | Planned fixture materialization | Finish both feeder games for a scheduled semifinal/final/bronze slot | Real game is created with that slot’s exact time/location, no booking state; manually editing the game schedule updates the slot; undo removes downstream game but preserves planned fixture schedule |
| GD-147 | Regular season after playoffs | Season with finished regular games and a bracket playoff → Schedule → Playoffs → switch Regular season → My or List | URL becomes `subtab=regular`; Regular fixtures stay visible; My/List/Table keeps a selection; switching My or List does not snap back to Playoffs. Opening schedule with no `subtab` while a playoff exists appends `subtab=bracket`. Playoff → My uses `subtab=playoff` so reload stays on Playoffs |
| GD-51 | Walkover / BYE handling | Set walkover | Bracket updates |
| GD-52 | Club favorite toggle | Star on club in game info | Favorited state persists |
| GD-53 | Club mini map | Game with geo | Map renders |
| GD-54 | User game note | Add private note from game info card, game card, or modal | Note saved; only visible to self |
| GD-55 | Edit/delete game note | Update note content | Persisted / deleted |
| GD-56 | Game settings panel | Toggle anyoneCanInvite, visibility, etc. | Each toggle saves immediately; no Edit/Save on settings card |
| GD-108 | Game settings collapse | Owner on game details → Settings card | Collapsed by default (title + chevron only); tap header, padding, or chevron to expand/collapse; toggle rows only flip their switch (do not collapse); expand animates toggles and hints button in |
| GD-57 | Manage users modal | Owner opens manage users | Roles/kick actions available |
| GD-58 | Kick participant | Kick user from game | Removed from roster |
| GD-59 | Kick admin | Owner kicks admin participant | Role change / removal |
| GD-60 | Reduce max participants | Edit max → kick overflow users | Capacity enforced |
| GD-61 | Navigate to parent league | Open league fixture (`parentId`) | Link to season game works |
| GD-85 | League match settings hidden | Open `LEAGUE` fixture as owner/admin before results | Game Settings section absent; season (`LEAGUE_SEASON`) still shows settings when editable |
| GD-86 | League season sport levels | Tennis league season; player with padel 4.0 / tennis 2.5 | Standings, bracket, planner, fixture roster show tennis 2.5; Admin game modal shows tennis level for league fixture participants |
| GD-118 | Mid-season fixed-team player swap | Fixed-team league; Manage groups → swap on team row → pick out/in → confirm | Roster updates; same standings row/points; past FINAL fixtures unchanged; future fixtures use new player; **season table (matrix) still shows past FINAL W/L in that franchise’s cells** |
| GD-119 | Swap respects multi-team flag | Season with `allowUserInMultipleTeams` on; candidate already on another group team | Candidate listed and swap succeeds; off → candidate excluded with single-team hint |
| GD-120 | Season table after roster swap | After GD-118, open Schedule → Table (and fullscreen table) for the group | Cells vs opponents still show prior played results for the franchise; empty only if no fixture existed |
| GD-120 | Group standings tie-break (fixed / 1v1) | Fixed-team **or** 1v1 group: two equal on wins, A beat B | Standings order A above B (H2H); three+ equal wins use mini-table (mutual wins → set Δ → game Δ), then H2H if two remain tied; 2v2 non-fixed stays points-first |
| GD-121 | Playoff wizard uses API standings order | Fixed-team season; open playoff config; pick top teams | Order matches Standings tab (not points-only re-sort) |
| GD-123 | Equal-wins mini-tables on standings | Fixed-team or 1v1; ≥2 tied on wins (not 0–0–0); Standings | **Show explanations** switch appears only with equal-wins clusters for the visible group filter (after bracket UI, before tables); off/hidden → no highlight, **?**, or mini blocks (toggle resets when switch hides); on → highlight + **?** scrolls to mini; deciding metric highlighted only when it differs; order matches main table; tiny avatars + initial+last per player line |
| GD-124 | Withdraw fixed team mid-season | Fixed-team league; Manage groups → withdraw on team row → confirm | Team `withdrawnAt` set; unfinished REGULAR fixtures → technical W for opponents (no score Δ / rating); played FINAL kept; standings: active places 1…N, withdrawn grey bottom with **—**; swap/remove blocked; matrix shows W*/L* for technical |
| GD-125 | Withdraw standings places shift | After GD-124 with ≥3 teams | Remaining active teams keep contiguous places; withdrawn has no place number |
| GD-126 | Withdrawn excluded from playoffs | After GD-124; open playoff config | Withdrawn team not listed/selectable; API rejects if forced |
| GD-127 | No new fixtures vs withdrawn | After withdraw; recreate/fill RR or new REGULAR round | New pairings only among active teams; technical fixtures stay FINAL; Edit results hidden on technical games |
| GD-62 | Pending trainer invite | TRAINING without trainer | Pending trainer row + accept flow |
| GD-63 | FAQ edit (owner) | Edit game FAQs | Content saved |
| GD-64 | Announced game results gate | Enter results on ANNOUNCED game | Confirm modal before entry |
| GD-65 | Reset results | Owner reset all results | Confirm → cleared |
| GD-66 | Sync conflict modal | Local + server results diverge | Choose sync-to-server or load-from-server |
| GD-67 | Outcome explanation | Tap level change explanation | `OutcomeExplanationModal` shows delta |
| GD-67a | Automatic match explanation sets | Open explanation after Automatic-format match (games vs americano vs super TB) | Set chips show raw scores with `pts` for americano rows and `STB` for super tiebreak decider |
| GD-67b | Admin rating uncertainty on explanation | `@admin` open outcome explanation after idle/rated game | Shows Uncertainty value + scale; reliability line unchanged; Reliability Factor includes uncertainty scale |
| GD-67c | Non-admin hides uncertainty | Non-admin open same explanation | Reliability + Reliability Factor visible; Uncertainty line hidden |
| GD-67d | Rating settling chip | Open explanation when idle past 30-day grace | Soft “Rating settling” chip on Reliability Factor; no raw uncertainty for non-admin |
| GD-67e | Grace idle period | Profile with last rated/training activity &lt; 30 days ago | No uncertainty rise / settling chip |
| GD-67f | Training resets idle clock | Finish training (or set trainee level) after long idle | Settling clears; lastRatingActivityAt updated; uncertainty not −10 |
| GD-67g | LLM rating insight (rated game) | Open outcome explanation on `affectsRating` game | Top insight: skeleton → original; if app locale ≠ source, auto-translates to app locale |
| GD-67h | LLM rating insight skipped (non-rated) | Open explanation on non-rating game | No LLM insight section |
| GD-67i | LLM rating insight failure UX | Force AI failure / timeout (authenticated participant) | Soft failure + Retry; numeric summary remains |
| GD-67j | LLM insight translate | Language menu → non-original | Overlay while translating; then translation; Original is instant |
| GD-67k | LLM insight translate cache | Re-select a previously translated language | Instant from client cache |
| GD-67l | LLM insight translate retry | Fail translation → Retry | Restarts translate without regenerating original; re-pick language does not preempt fresh pending |
| GD-67m | LLM insight guest / read-only | Guest (or non-participant) open explanation | Sees ready text if already generated; no start / no Retry on failed |
| GD-68 | Finish results confirm | Finish results action | Confirmation modal |
| GD-69 | Edit finalized results | Edit after finish | Danger confirm modal |
| GD-70 | BAR level changes display | Finished BAR game | Per-player level before/after on list |
| GD-71 | Training review submit | Post-training review | Rating saved on trainer profile |
| GD-72 | Training level/reliability edit | Trainer edits participant levels | `EditLevelModal` saves |
| GD-74 | Training confirms sport only | `@trainer` set level on tennis TRAINING | Tennis profile confirmed; padel confirmation unchanged; avatar checkmark in tennis game only |
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
| LS-05a | Automatic live start mode | Automatic padel → open live on empty match | Sheet asks Set/games vs Americano points before scoring; choice persists on match metadata |
| LS-05b | Automatic continue set | After completing a games set with match still open | Sheet asks Continue vs End match; Continue advances; End finishes early |
| LS-05b2 | Automatic americano finish set | Automatic → Americano points → score several points (non-draw) | Scoring stays open until Finish set; then Continue/End sheet; can keep scoring until Finish |
| LS-05b3 | Automatic continue into set 2 | After set 1 Continue → score points in set 2 (same leader) | Scoring/undo stay open; match does not lock as complete mid-set |
| LS-05c | Automatic 1–1 decider | After 1–1, Continue | Decider sheet: regular (games or points per mode) vs STB (to 10, win by 2); scoring blocked until chosen |
| LS-05d | Watch Automatic record mode | `@watch` Automatic padel → open empty match | Dialog: Set/games vs Americano; scoring blocked until chosen; choice in live state |
| LS-05e | Watch Automatic continue / end | `@watch` finish a games set | Continue vs End dialog; Continue advances; End sets early finish |
| LS-05f | Watch Automatic americano finish | `@watch` Americano points → score non-draw | Primary Finish set CTA; then Continue/End; undo still works after set 1; no silent advance |
| LS-05g | Watch Automatic 1–1 + phone sync | `@two devices` Automatic decisions on `@watch` | Phone sees same mode / early finish / STB; Watch does not strip Automatic fields on PATCH |
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
| LS-35 | Watch dev/staging API host | Build iPhone app with non-prod `VITE_API_BASE_URL` → open app (login if needed) → open `@watch` game list / score a point | Watch REST calls hit same host as phone (not hardcoded prod); avatars load from that host; prod build unchanged |
| LS-36 | Watch Play starts workout without quit | `@watch` active game → tap Play on a match → lower wrist / leave app briefly → raise wrist | App stays in match scoring (not force-quit to watch face); workout session remains active; green Play overlay gone |
| LS-37 | Watch workout Health denied retry | `@watch` deny Health on first Play → swipe to workout page → Retry after allowing Health | Metrics appear; `workoutStartedForGame` true; later matches auto-resume |
| LS-38 | Watch rapid score during live PATCH | `@watch` score several points quickly while network is slow | No points wiped after ACK; board matches taps; revision catches up |
| LS-39 | Watch tab swipe keeps live sync | `@watch` score a point → swipe to workout page → swipe back → score again | Pending live PATCH flushed; no lost points; polling still active after return |
| LS-40 | Watch HK fail shows retry | `@watch` mid-match if workout session fails (or Force Quit Health) → open workout page | “Workout not started” + Retry restores tracking |
| LS-41 | Watch load-fail escape | `@watch` Play → network fail on match load | Retry reloads; Back to matches returns to game match list (not trapped) |
| LS-42 | Watch dirty local beats remote poll | `@watch` score a point then immediately receive older/newer phone revision before ACK | Local point stays; later push reconciles; board never snaps backward mid-rally |

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
| CH-06 | Unread filter toggle | Bugs tab with status filter; tap unread mail icon; open thread; browser back | `?unread=1` in URL; all unread bugs shown; back restores unread filter state |
| CH-07 | Contacts mode | Toggle contacts | City users list |
| CH-08 | Start new DM | Pick user → chat | `/user-chat/:id` |
| CH-09 | Load more pagination | Scroll list end | More threads load |
| CH-10 | Empty inbox | New user no chats | Empty state |
| CH-11 | Muted chat indicator | Mute thread | Muted badge/state |
| CH-81 | Unified unread badge styling | Seed unread on chat row, bottom tab, game card, market card | Red pill, `99+` cap, same mount animation; no per-site gradient/ping variants |
| CH-82 | Stale socket after read | `@two-user` B opens unread DM (badge clears); delayed/stale A-side recount socket with lower revision arrives | B badge stays cleared; row unread stays 0 |
| CH-83 | Tab badges stable on navigation (regression) | Seed unread; navigate My → Chats → thread → back without reconnect | Tab badges unchanged; no full snapshot refetch flicker (see also G-20) |
| CH-84 | Enter thread immediate badge clear | Open unread DM or game chat from list | Row badge and tab badge clear immediately; no wait for socket |
| CH-85 | Muted group tab totals | Mute a group with unread; check Chats tab badge vs row badge | Row may show unread count; tab/subtab totals exclude muted group |
| CH-86 | Tab badge single projection source | Compare bottom-tab Chats badge, list row badge, native app icon badge (Capacitor) after unread changes | All read same projection totals; no divergent feed-store unread patches |
| CH-87 | Inbound DM badge latency (optimistic receive) | `@two-user` B on another tab/screen; A sends DM | B sees chat tab / row badge within ~100ms before authority envelope arrives |
| CH-88 | Viewing thread no badge on inbound | `@two-user` B has DM thread open; A sends message | B message list updates; no badge bump on row or tab; read state catches up |
| CH-95 | Android no tray push while viewing thread | Capacitor Android: B has DM/game/group/bug thread open in foreground; A sends message to that thread | No system notification/heads-up for that chat; message appears in thread; other chats still notify in foreground; backgrounding the app restores tray notifications for the open thread; kill+reopen app does not suppress from a stale prior session |
| CH-96 | Clear tray notification on open/read | Capacitor: A sends chat push while B is backgrounded; B opens that thread (or marks it read) | System notification for that conversation disappears from the tray; other chats’ notifications remain |
| CH-89 | Native icon badge while app backgrounded (Capacitor) | `@two-user` A sends DM while B has app backgrounded/killed (not in thread) | B home-screen icon badge reflects authoritative unread total; opening app keeps tab + icon in sync after resume repair |
| CH-90 | Archived game chat after delete | Participant: create game → send messages → owner deletes game → open `/games/:id/chat` or embedded chat on game details | Message history visible; header shows cancelled time and canceller when available (else time-only fallback); amber read-only banner instead of composer; reply/edit/react/pin disabled |
| CH-91 | Archived game chat non-participant | User who was never a participant opens `/games/:id/chat` after delete | Access denied (403/empty); no composer |
| CH-92 | Archived game chat drops queued sends | Queue or fail a game-chat send → owner deletes game while thread is open, or reopen archived `/games/:id/chat` with pending local outbox row | Pending send disappears instead of retrying; no stale sending/retry UI remains; toast explains game was cancelled and chat is now read-only |
| CH-93 | Unread stable after logout/login | Read all chats (zero unread) → logout → login same user → open Chats | Tab and row badges stay at zero; no transient all-chats-unread spike from sync replay |
| CH-94 | Chat connection line | Open game, bug, group, or DM chat → go offline or trigger sync | Animated line at header bottom (amber sync / red offline); header height unchanged; no tint or inline badge |

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
| CH-152 | Delete normal group (owner) | Owner opens `/group-chat/:id` → participants/settings slide-over → Delete group → type exact group name → confirm | Delete enabled only for owner on normal groups (not city/channel/bug/market); admin without ownership sees no delete; after delete navigates to Chats users tab; group gone for all members |
| CH-153 | Delete group name mismatch | Owner opens delete modal → wrong name → Delete | Confirm stays disabled until name matches exactly |

### 11.3 Messaging features

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-18 | Send text message | Type + send | Optimistic + confirmed |
| CH-95 | Mention @all | In game/group chat composer type `@` → pick `all` → send | Message shows `@all`; all other participants get mention notification |
| CH-19 | Send emoji | Emoji picker | Emoji in message |
| CH-20 | Reply to message | Reply action | Threaded reply |
| CH-21 | Edit message | Edit own message | Updated content |
| CH-22 | Delete message | Delete own | Removed/hidden |
| CH-156 | Delete message survives leave/reopen | Delete a message in Participants (GAME PRIVATE) or any thread → leave → reopen, including a cold reload, within the ~30s skip-pull window | Message stays gone (Dexie tombstone; skip-pull bypass survives reload; not restored from L1/HTTP) |
| CH-157 | Failed delete restores message | Delete own message → non-retryable API error (not 404) | Message reappears immediately and after leave/reopen |
| CH-23 | Reaction | Add reaction on user or system message (e.g. join/leave) | Reaction strip visible; emoji persists |
| CH-24 | Pin message | Pin (if permitted) | Pinned bar shows |
| CH-25 | Unpin message | Unpin | Bar updates |
| CH-26 | Forward message | Long-press → Forward → pick chat | Opens destination immediately; message appears with “Forwarded from” header; body is a live link to the original |
| CH-26a | Forward attribution | Tap “Forwarded from” title on a forwarded message (light + dark theme) | Label readable on chat background; opens the source chat (Back returns to dest); anchors to original when possible |
| CH-26b | Forward media (no re-upload) | Forward image/GIF/video/document/sticker/voice | Media plays in target; request sends only forwardedFromMessageId (no CDN upload); provider-hosted Giphy/Tenor/Klipy URLs are not forwardable (app CDN only) |
| CH-26c | Forward nested | Forward an already-forwarded message | Header still shows original author/source chat; content matches selected bubble |
| CH-26d | Forward offline/retry | Forward while briefly offline | Opens destination; loading toast → fail toast + failed outbox in dest (no premature “Forwarded”) |
| CH-26e | Forward from private game chat | Forward PRIVATE game message → tap attribution | Opens that game’s PRIVATE thread |
| CH-26f | Forward dest filter | Open Forward picker as channel subscriber | Subscriber-only channels and archived games are not listed |
| CH-26l | Forward dest local+network | Open Forward from a thread before Chats tab hydrated; also after a new DM/group/game exists only on server | Picker shows local cache then settles with API list (no empty flash as final); blocked DMs excluded; current chat excluded; avatars match ChatList |
| CH-26m | Forward back stack | Forward to another chat → system/UI Back | Returns to source chat (nav push, not replace) |
| CH-26g | Forward poll (shared votes) | Forward a poll → open dest chat → vote; also re-forward that poll; vote from PRIVATE game thread with PUBLIC forward | Same poll/results as original; vote from either chat updates both; nested forward works; GAME chatType rooms all update live |
| CH-26h | Forward voice | Forward a voice message | Plays in dest with waveform/duration; no re-upload; transcription appears on host and linked forwards |
| CH-26i | Forward edit blocked | Own forwarded TEXT → Edit / ArrowUp | No Edit action; API rejects content update |
| CH-26j | Host edit syncs forwards | Edit original TEXT that was forwarded to another chat | Dest bubble + list preview update live (no stale body) |
| CH-26k | Forward poll list preview | Forward poll → check dest chat list row | Preview shows poll type + question (`[TYPE:POLL]…`), not plain text |
| CH-27 | Copy text | Copy action | Clipboard content |
| CH-28 | Send image | Attach image | Image message renders |
| CH-96 | GIF provider URL-only paste → GIF | In GAME/USER/GROUP/BUG chat, paste only an allowlisted HTTPS URL and send: Giphy (`giphy.com/gifs/…` or `media.giphy.com/…`), Klipy direct (`static*.klipy.com/…gif`) or share page (`klipy.com/gifs/{slug}` with `KLIPY_API_KEY`), Tenor page (`tenor.com/view/…`) or direct media (`media*.tenor.com/….gif`) | Message becomes `IMAGE` with re-hosted media (our CDN/`uploads/chat/…`, not giphy/klipy/tenor hosts); GIF animates with fully transparent bubble panel (Telegram-style, no colored/white chrome); time/ticks overlay the GIF |
| CH-97 | Giphy URL + text stays text | Paste Giphy URL inside a longer sentence (or with other text) and send | Stays `TEXT` with the original URL; no conversion / no media bubble |
| CH-98 | Giphy convert soft-fail | Paste a Giphy URL that cannot be fetched/validated (dead id, oversize, blocked) or spam pastes past ingest rate limit; send | Create succeeds as `TEXT` with the original URL kept; no hard error that drops the message |
| CH-99 | Send sticker by stickerId | Authenticated create with `messageType: STICKER` + valid `stickerId` (catalog pack seeded) | Message persists as `STICKER`, empty `mediaUrls`, `stickerEmoji` set; chat list preview shows emoji or “Sticker” |
| CH-100 | Sticker + mediaUrls rejected | Create with both `stickerId` and `mediaUrls` | `400` / no message created |
| CH-101 | Delete sticker message keeps catalog | Send sticker → delete own sticker message | Message removed; pack/sticker still listed via `GET /stickers/packs` and asset URL still loads |
| CH-102 | View sticker bubble (not photo) | Open thread with a `STICKER` message (seeded catalog) | Fully transparent panel (no blue/white bubble chrome); asset or emoji only; not `MessageMediaGrid`; tap does not open photo fullscreen gallery; time/ticks overlay sticker |
| CH-103 | Sticker list / thread preview | Send or receive sticker → return to chat list | Row shows sticker emoji and/or localized “Sticker”, not blank / “[Media]” / “No message” |
| CH-104 | Reply-to-sticker preview | Long-press sticker → Reply | Composer reply strip shows sticker thumb and/or emoji + “Sticker” (usable, not empty); after send, in-bubble reply preview keeps the same label |
| CH-104a | Reply-to-GIF/photo preview | Long-press GIF or photo → Reply | Composer reply strip shows thumb + “GIF”/“Photo” (not blank); after send, in-bubble reply preview keeps the same label |
| CH-105 | Missing sticker catalog fallback | Open thread with `STICKER` whose catalog id 404s / is unknown | Bubble shows `stickerEmoji` or generic sticker fallback; no crash / blank bubble |
| CH-106 | Official packs after seed | Run `seed:sticker-packs` (or use seeded env) → open sticker tray / `GET /stickers/packs` | `reactions` (sport null, 16) and `padel` (`sport=PADEL`, 16); Fluent 3D WebP covers under `uploads/stickers/packs/...`; list does not auto-create packs |
| CH-107 | Giphy search → send GIF | With `GIPHY_API_KEY` and/or `KLIPY_API_KEY` set: open media tray at 300px width → GIFs → scroll results → tap a result | Results render three per row, edge-to-edge with no gaps or rounded corners, remain painted without blinking while scrolling, and add responsive columns on wider screens; tray closes; message sends as `IMAGE` with re-hosted media (our CDN/`uploads/chat/…`, not giphy.com/klipy.com); GIF animates with transparent panel (no bubble chrome), same as CH-96 |
| CH-108 | GIF search unavailable without keys | Without `GIPHY_API_KEY` and `KLIPY_API_KEY` (or `/giphy/status` available=false): open media tray → GIFs | Stickers and mixed Recent remain usable; GIFs shows unavailable state without blocking tray open; URL-only paste (#CH-96) still works |
| CH-117 | Open sticker and GIF tray from composer | In GAME/USER/GROUP/BUG chat with media allowed → tap sticker button next to attach | Tray opens immediately with search and Recent · Favorites · Packs · GIFs; GIF trending fetch starts only after switching to the GIFs tab; Packs lists seeded stickers |
| CH-147 | Attach flyout entries | Game chat → tap paperclip attach | Flyout shows File, Video, Images, Poll (no GIF); GIFs still via sticker tray (CH-117 / CH-107) |
| CH-148 | Send document file | Attach → File → pick PDF/DOC/DOCX/TXT (desktop, mobile browser, Capacitor) | Optimistic file bubble with name/size; CDN upload; confirmed DOCUMENT; tap opens/downloads (native Share uses unique file URI; web blob download); chat list + push show File/name (not Photo); Copy copies `[file] name` (not image toast); re-open thread while pending still shows file bubble |
| CH-149 | Own ticks backfill on reply/react | `@two-user` A sends image then text; B reacts to or replies after only the later message is marked read | A’s earlier image also shows read (double) ticks — not left as single-tick while the later message is read |
| CH-150 | Own ticks when read arrives before media ack | `@two-user` A sends slow image; B marks thread read (or replies) before A’s upload confirms | After image confirms, A’s image shows read ticks (peer cursor / buffered receipt until message id was in thread) |
| CH-151 | Late media seq-honest unread | `@two-user` A starts image upload; B reads then leaves; image finishes with earlier createdAt but newer serverSyncSeq (`CHAT_READ_RECEIPT_DUAL_WRITE=0` so late-insert receipt backfill is off) | A’s image stays sent (not ✓✓) until B opens/marks again |
| CH-152 | Peer cursor own-message ticks | `@two-user` A sends DM; B opens thread (marks read) while A’s chat stays open | A’s message flips to read ticks from peer `READ_CURSOR_UPDATE` / hydrate `maxPeerCursor` without requiring receipt rows |
| CH-153 | Mark-all advances peer ticks | `@two-user` A sends several messages; B marks context read (or opens near bottom) | All of A’s earlier messages in that chatType show read ticks (monotonic via max peer cursor) |
| CH-154 | Leave game stops chat sync polls | Join game chat → leave game or leave chat from details/thread | Local game thread purged (socket leave + Dexie); no repeating 403 on `/chat/sync/events` or `/chat/messages/missed` for that game |
| CH-155 | Non-admin skips PRIVATE/ADMINS probes | Playing participant (not owner/admin) opens game details | No `GET .../messages?chatType=PRIVATE|ADMINS` probes; participants-only chat section stays hidden |
| CH-118 | Tap sticker sends via outbox | Open tray → tap a sticker in Packs | Optimistic sticker appears in thread immediately (fully transparent panel, no bubble chrome); create confirms via sync; no image upload / pending blobs |
| CH-119 | Sticker send offline retry | Go briefly offline → send sticker from tray → come online | Outbox retries create-only (no media upload); sticker confirms when network returns |
| CH-119a | Sticker cannot be edited | Own sticker → context menu / ArrowUp | No Edit action; API rejects content update if attempted |
| CH-120 | Favorite sticker | Open tray → tap ★ or long-press a stationary sticker; repeat while dragging/scrolling → Favorites tab | Stationary press favorites the sticker and persists after relaunch; pointer movement cancels long-press without accidental favorite |
| CH-121 | Unfavorite sticker | Favorites tab → tap ★ or long-press favorited sticker | Removed from Favorites; ★ cleared |
| CH-122 | Mixed Recent after send | Send a sticker, then a GIF → reopen tray → Recent | GIF is first and sticker follows in one MRU list; selecting either moves it to first; order persists after relaunch |
| CH-122a | Failed GIF is not recent | Select a GIF while import/send is forced to fail → reopen Recent | Failed GIF is absent; previous mixed Recent order is unchanged |
| CH-122b | GIF offline queue and retry | Load GIF results → go offline → select a GIF → reload chat → reconnect or tap Retry | GIF remains as an optimistic outbox message across reload; reconnect/retry imports, re-hosts, and sends it once with the same reply context |
| CH-122c | Sent GIF stays visible at chat tail | From any scroll position → select a GIF with a tall/animated preview | Chat immediately scrolls to the optimistic GIF and remains pinned below it while media dimensions resolve |
| CH-127 | Sticker prefs caps | Favorite >100 distinct stickers / send >40 stickers | Favorites list stays ≤100; Recent stays ≤40 (MRU) |
| CH-123 | Sport pack order in game chat | Open tray in a PADEL game chat | `padel` pack appears before general `reactions` |
| CH-124 | Default pack order outside game | Open tray in DM / group (no game sport) | Pack order matches catalog sortOrder (stable) |
| CH-125 | Contextual tray search hit/miss | Search stickers for “smash”; switch to GIFs and search “celebrate”; enter nonsense | Sticker tabs filter sticker catalog; GIFs performs debounced provider search; each miss shows its own empty state |
| CH-125a | GIF background loading and provider fallback | Open tray on Recent/Packs and verify no GIF request; switch to GIFs; load another page while Giphy starts returning errors and KLIPY is available | Sticker UI remains interactive; GIF loading starts only on the GIF tab; fallback appends KLIPY results without losing the visible Giphy page, keeps scroll position, and shows combined attribution |
| CH-125b | Media tray keyboard and modal behavior | Open tray with keyboard → use Tab, Shift+Tab, arrow keys (including pack rail), Home/End, Escape → reopen | Focus stays in tray, arrows move media and pack tabs with correct selection, Escape closes, opener regains focus, and background page does not scroll while open |
| CH-125b1 | Media tray search expands above keyboard | Open sticker/GIF tray on Capacitor iOS/Android or mobile browser → focus search → type | Tray expands to full height above the software keyboard (`data-expanded=true`) for the rest of that open; GIF/sticker results remain visible and scrollable; closing the tray restores compact height on next open |
| CH-125c | GIF reduced-motion behavior | Enable OS Reduce Motion → open GIF search/Recent → send and open a GIF | Search uses a static Giphy frame when available (Klipy keeps preview tile), Recent tiles show title instead of animating, and sent GIF bubbles/fullscreen use the static thumbnail |
| CH-126 | Animated sticker + reduced motion | Tray Packs → send `padel/ball` or `padel/smash` (has `animatedUrl`); toggle OS “Reduce motion” | Motion on: tray cell + bubble use `.anim.webp` (`data-sticker-motion=animated`) with transparent canvas (no opaque fill behind glyph); reduced motion: both use static `.webp` (`data-sticker-motion=static`) |
| CH-126a | Animated WebP on Capacitor | Same stickers as CH-126 on iOS/Android (min iOS 16 / Android 24 WebViews) | `.anim.webp` decodes and animates when motion allowed; static frame when reduced motion; static-only stickers still render |
| CH-128 | Save image as personal sticker | Long-press eligible chat `IMAGE` (PNG/WebP/GIF with transparency; alpha formats are not JPEG-compressed on upload) → Save as sticker | Toast success; tray (even if already open) shows “My stickers” with the new sticker; sendable via same STICKER path |

| CH-129 | Save as sticker rejects invalid | Save JPEG or fully opaque PNG / undersized image as sticker | Clear error toast (format / alpha / size); no personal sticker created |
| CH-130 | External URL host chip | Send TEXT with a public https URL (not bandeja / giphy) | Under bubble: small host chip with favicon (`chat-link-preview-chip`) appears immediately |
| CH-131 | Rich link preview card | Same message; wait for `/link-preview` success with og:title/image | Chip upgrades to rich card (`chat-link-preview-card`) with title and optional image; tap opens URL in new tab |
| CH-132 | Link preview soft-fail | URL that times out / has no OG / rate-limited | Chip stays; no rich card; message still readable |
| CH-133 | No preview for giphy | Message with only giphy.com URL | No external link chip/card (giphy flows unchanged) |
| CH-134 | Bandeja game link card | Send `https://bandeja.me/games/{id}` (or /chat /live) | Chip “Bandeja” → card (`chat-bandeja-link-preview-card`) with game name, when/where, sport/level when set, player avatars, Game/Chat/Live badge; tap navigates in-app |
| CH-135 | Bandeja profile / chat / group | Send user-profile, user-chat, group-chat, channel-chat, or bugs/{id} link | Card loads name/avatar from DB when allowed; soft-fail keeps chip if private/missing; tap navigates in-app |
| CH-136 | Bandeja general deep link | Send `/`, `/find`, `/create-game`, `/chats`, etc. | Branded Bandeja card with action title (e.g. Find games · Today); tap navigates in-app |
| CH-136a | Persist preview on send | Send TEXT with public bandeja app/profile/market URL | Message may include `linkPreview` for those types; game/DM/group links are never snapshotted (viewer-scoped fetch) |
| CH-136b | YouTube provider shortcut | Send `youtube.com/watch` or `youtu.be` URL → reload thread | Sent card keeps its YouTube title/thumb via the persisted-image proxy; it does not fall back to a favicon chip |
| CH-136c | Composer paste prefetch | Paste eligible https URL into composer (no image) | `/link-preview` prefetch starts before send; after send, rich card appears faster from cache |
| CH-136d | Private game link | Non-participant opens private game URL preview | Generic “Open game” card only — no name/club/roster leak |
| CH-136e | Bandeja in-app open | Tap bandeja chip/card (incl. `*.bandeja.me`) | Navigates in-app (no new tab) |
| CH-137 | Personal stickers owner-only in tray | User A saves personal sticker; User B opens sticker tray | B does not see A’s “My stickers” pack; B can still view A’s sent personal sticker bubble in thread |
| CH-138 | Delete message keeps personal catalog | Send personal sticker → delete message | Message gone; personal sticker still in owner tray; asset still loads |
| CH-139 | Composer preview selection/removal | Type or paste two eligible URLs → select the second preview → remove preview | Loading/rich preview appears before send; selected URL changes; removal leaves URL text unchanged and disables preview for that outgoing message |
| CH-140 | Link preview retry | Make visible preview enrichment fail temporarily → tap Retry preview | Host chip/message remain readable; exactly one user-triggered retry occurs and card upgrades on success; unsupported links show no retry |
| CH-146 | Media/preview scroll stability | Open a long thread containing older GIFs, animated stickers, and unloaded link previews → scroll upward through them and back several times while watching Network | Assets are fetched at most once per page session, cached object URLs are reused after row remount, and the visible messages stay anchored while media loads or a chip upgrades to a card |
| CH-141 | Remove sent link preview | Sender taps remove on their sent card | Card disappears for every client/recipient via sync while URL text remains; recipients cannot remove it |
| CH-142 | Live game card refresh and navigation | Open URL-only and URL-with-caption messages containing game and game-chat links for regular games, tournaments, leagues, bars, and trainings → change game status/time/participants/level → tap each card and its chat button | URL-only messages render as standalone cards without an extra chat bubble; captions retain their bubble; both links use the same compact card without redundant “Game”/“Open game” copy; the top row has the game avatar at left and name/club at right, followed by full-width date/time, status, and participant rows; controls have reserved right padding; non-game entity types show their matching icon; card opens the game, chat button opens game chat, and private ACL is rechecked |
| CH-143 | Live marketplace card refresh | Open marketplace-link message → reserve/sell/edit title, price, or image | Card refreshes availability, title, price, and primary image; sold/reserved state is localized |
| CH-144 | Dedicated provider cards | Send Spotify, Instagram, TikTok, X, GitHub, and Playtomic links | Localized provider label and official metadata appear when available; Instagram uses tokenless Meta oEmbed plus public-page title/thumb metadata; safe generic OG/chip fallback remains usable |
| CH-145 | Composer preview draft restore | Type URL, select among multiple previews or remove preview → leave thread → return | Draft text and selected/removed preview state are restored; stale request was cancelled and image/file paste behavior is unchanged |
| CH-29 | Send video | Attach video | Upload + transcode state |
| CH-30 | Fullscreen media | Tap image/video | Viewer opens |
| CH-30a | Copy fullscreen image | Open image viewer → tap copy | Desktop/native: “Image copied” toast; paste works. Mobile web without clipboard image API: share sheet opens with “Choose Copy or Save…” toast |
| CH-30b | Download fullscreen image | Open image viewer → tap download | Desktop web: file download + “Image downloaded” toast. iOS/Android/native + mobile web: share sheet opens with “Choose Copy or Save…” toast; user can save to Photos/files |
| CH-30c | Fullscreen uses original photo | Send a chat photo (or open game photos gallery) → tap thumbnail to open viewer | Network/img src is the original asset (`…/originals/…`), not the grid thumbnail (`…/thumbnails/…_thumb…`); image looks sharp when zoomed |
| CH-30d | Fullscreen pinch zoom/rotate (mobile) | Open image → two-finger pinch in/out and twist | Image scales and rotates under fingers; reset restores fit; swipe-down dismiss still works only when not zoomed/rotated |
| CH-30e | Fullscreen desktop wheel/trackpad | Open image on desktop → scroll wheel or trackpad pinch; drag when zoomed; double-click | Zooms toward cursor; pan works when zoomed; double-click toggles zoom; Reset restores fit |
| CH-31 | Send voice (if enabled) | Record voice | Audio message |
| CH-32 | Create poll | Poll composer | Poll message |
| CH-33 | Vote on poll | Select option | Vote count updates |
| CH-34 | View poll voters | Open voters modal | Voter list |
| CH-35 | Auto-translate | Enable translate on chat with foreign-language message | Only translated text shown (not original); label reads “Translated” |
| CH-35a | Auto-translate toggle | Tap “Translated” on auto-translated message | Swaps to original with “Original” label; tap again restores translation |
| CH-35b | Preferred incoming translation language | Open Translation modal (composer translate button) → top section → pick e.g. Spanish | Selection saved; reopening modal shows Spanish selected |
| CH-35c | Translate message uses preferred language | Set preferred incoming language to Spanish (app UI may be English) → long-press foreign message → Translate | Menu shows “Translate to Spanish”; message appears in Spanish |
| CH-35d | Auto-translate uses preferred incoming language | Keep app UI in English → set preferred incoming language to Russian → enable English, Russian, and Serbian auto-translate → receive a non-Russian message | Message automatically appears in Russian, including after reopening the chat |
| CH-36 | Draft persistence | Type without send → leave → return | Draft restored |
| CH-36a | Draft stays on source chat (desktop) | Desktop split view: type draft in chat A → switch to chat B → return to A | B composer empty (or B's own draft); A restores the typed draft; draft is not copied into B |
| CH-37 | Offline send queue | `@offline` send | Queued state + retry on online |
| CH-38 | Failed send retry | Force failure → resend | Message sends |
| CH-39 | Read receipts | Open thread | Unread clears |
| CH-70 | Own message read tick vs details | Group chat → send message → long-press → Details before anyone reads | Bubble shows single tick or muted white delivered double tick (not cyan read); Details shows “Delivered — not read yet” (or “Not read yet” if still SENT) |
| CH-71 | Own message read tick after peer reads | Two users in group; B reads A's message | A sees cyan double tick (clearly distinct from muted delivered); Details lists B with read time |
| CH-71a | Read vs delivered tick contrast | Own thread with one read message and one only-delivered message | Read ticks are bright cyan; delivered ticks are muted white; visually distinguishable at a glance |
| CH-72 | Parent league admin read on child match chat | League owner (not match participant) opens child match public chat with unread @mention | Unread clears; sender sees read receipt / double tick on own message |
| CH-73 | Message details shows reactor without read receipt | Peer reacts before read receipt syncs (or legacy data) | Long-press own message → Details lists reactor with emoji and “Reacted …”; not “Not read yet” when reactions exist |
| CH-81 | Message details resolves unknown users | Group chat → long-press own message → Details with read receipts/reactions from users not in local cache | Read-by list shows immediately (may include “Unknown User” placeholders); names/avatars fill in after background fetch without leaving Details |
| CH-80 | Bulk mark-read updates all own ticks | Two-user DM or game chat: A sends two messages with thread open; B opens chat (bulk mark-read) | Both of A's messages show read ticks and Details read state without A refreshing |
| CH-40 | Scroll to replied | Tap reply preview | Scrolls to original |
| CH-41 | Load older messages | Scroll up | Pagination loads history |
| CH-41a | Load older keeps scroll anchor | Long thread → scroll up until older page loads (local or network) while mid-history; also open thread then immediately scroll up while network hydrate finishes | Viewport stays on the same messages; does not jump to latest/bottom; FAB may appear |
| CH-41b | Tail pin survives media growth | At bottom of thread with image/video messages → wait for media height to settle | Stays at latest; does not falsely show FAB or lose append-pin |
| CH-41c | Thread switch after scroll-up | In chat A scroll into history → open chat B (expected at bottom) | Chat B lands at latest; open settling does not leave B stuck mid-list |
| CH-41d | Chat-type switch late reconcile | Game chat → switch PUBLIC/PRIVATE → scroll up quickly while switch finishes | Stays in history; late reconcile does not yank to bottom after leave-tail |
| CH-41e | Scroll up during open settling | Open long thread → immediately scroll into history while open settling/hydrate still running | Settling pins stop; viewport stays in history (no fight back to bottom) |
| CH-42 | Jump to pinned | Tap pinned bar | Scrolls to message |
| CH-61 | Message grouping | Send 3+ messages within 4 min from one sender | Tight spacing; avatar bottom-aligned on last only; sender name on first only; asymmetric bubble corners (small radius between grouped bubbles) |
| CH-62 | Group break | Same sender after >4 min gap or different sender/day | New group: full corners, avatar + name shown again |
| CH-63 | Queued-offline send icon | `@offline` send message | Amber clock icon on bubble (not red alert); tap opens resend/delete menu |
| CH-64 | Queued banner offline | `@offline` with unsent message | Gray "Queued — will sync when you're back online" banner under header; turns into amber tap-to-retry when back online with failures |
| CH-65 | Offline thread access | Go offline → open previously visited chat thread | Cached history renders (no full-page No Internet screen); composer queues sends |
| CH-66 | New message entry animation | Receive/send message near bottom | Message fades + slides in smoothly; no scroll jump |
| CH-79 | Live inbound while thread open | `@two browsers` User B has chat open; User A sends message | B's message list shows A's message within ~2s without refresh or leaving thread |
| CH-67 | Date separator pill | Scroll across day boundary | Rounded pill date label (Today/Yesterday/date) centered between days |
| CH-72 | In-thread message search | Open any chat → tap composer search → type 2+ chars matching a message → tap a result | Debounced panel ~45% viewport above message list (not full-screen); scoped to active tab; avatar + name/time row, preview below; loading spinner while debouncing/searching; count when settled; load-more when >50 local hits; tap scrolls to message (loads history if needed); search field stays open with query; results panel animates closed and input blurs |
| CH-76 | In-thread search refocus results | After CH-72 result tap → tap search field again (same query) | Same results reappear; list scrolls to previously tapped hit; that row stays highlighted |
| CH-74 | In-thread search last result visible | With keyboard open, search until many hits → scroll to bottom of results panel | Last result and load-more (if shown) fully visible inside panel scroll; message list still visible below panel |
| CH-75 | In-thread search scroll to old message | Search → tap result from 2+ months ago (not in loaded window) | Message list fades + spinner only while history loads; lands on target with highlight |
| CH-77 | In-thread search scroll in-window | Search → tap result already in loaded messages | No fade/spinner; direct scroll + highlight; can scroll away immediately without snap-back |
| CH-78 | In-thread search message outlines | Open search → type 2+ chars matching loaded messages | Matching message bubbles (not avatar/name row) show blue ring and yellow highlight on matched text inside the bubble; outlines/highlights clear when search closes |
| CH-75 | Open thread at latest messages | Hard-refresh any chat with 20+ messages (or open after prior failed pin) | Message list lands at bottom; newest messages visible; no “scroll to latest” FAB |
| CH-73 | In-thread search empty | Search for text not in thread | Panel shows no results; count hidden |

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
| CH-60a | Desktop market thread keeps Market subtab | `@desktop` Chats → Market → I'm buyer → open item chat in split view | Right pane opens thread; left pane stays on Market (buyer), not Channels |
| CH-60b | Market chat from Telegram / push | Tap marketplace listing chat notification (Telegram button or push) | Opens `/channel-chat/:id?filter=market`; Market subtab stays active (not Channels / not marketplace browse) |
| CH-61 | Group settings page | Navigate to group settings | Member/admin actions |
| CH-62 | Kick from group settings | Admin kicks member | Member removed |
| CH-63 | Bug chat video attach (iOS) | `@mobile` Capacitor iOS → bug thread → attach gallery MOV | Video accepted; compress toast; message sends |
| CH-63a | Chat video after compress 100% (iOS) | `@mobile` Capacitor iOS → any chat → attach gallery video → wait until compress hits 100% / Preparing | Optimistic VIDEO bubble appears promptly; attach unlocked; poster may be fallback if frame capture times out (≤3s) — never stuck busy |
| CH-64 | Bugs filter survives thread nav | `@mobile` Bugs → turn off Created by me → open non-owned bug → back | Created by me stays off; list still shows all bugs |

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
| M-36 | Share listing | Open item drawer or market chat group info → Share | Native/web share sheet for `/marketplace/:id` (clipboard / modal fallback) |

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
| PR-70 | Profile sport questionnaire status | Profile → sport with 0 games → Show details | Card titled "{{sport}} questionnaire"; status + Fill out / Fill out again |
| PR-71 | Admin player card uncertainty | `@admin` open `?player=` card → level hero | No Uncertainty / settling tags on avatar; reliability % only |
| PR-72 | Player card rating settling | Open player card when idle past 30-day grace | No “Rating settling” chip on card/profile hero |
| PR-73 | Sport level confirmation (player card) | Multi-sport user confirmed only for padel → open card → switch competitive sport to tennis | Padel shows confirmed-by trainer; tennis shows not confirmed |
| PR-74 | Avatar checkmark follows badge sport | Same user in padel game roster vs tennis game roster | Checkmark only when that game’s sport is confirmed |
| PR-75 | Multi-sport picker above profile tabs | Open player card / `/user-profile/:id` for multi-sport user | Sport picker above Statistics/Levels(/Groups); sport change updates both tabs; no cross-user flash; no wrong-sport stats flash |
| PR-76 | Single-sport no external picker | Open card for user with one enabled sport | No sport picker above tabs; Levels still has sport+social selector |
| PR-77 | Default sport prefers viewer primary | Viewer primary tennis; subject has tennis+padel | Card/profile opens on tennis |
| PR-78 | Default sport falls back to subject | Viewer primary tennis; subject padel-only | Opens on padel |
| PR-79 | No sports hides stats/levels UI | Subject `sportsEnabled: []` | No sport picker, no Statistics/Levels switch; common groups shown if any, else only hero |
| PR-80 | Profile URL sport hint | `/user-profile/:id?sport=TENNIS` and subject has tennis | Opens on tennis even if viewer primary is padel |
| PR-81 | Game-open sport hint | Open `?player=` from tennis game; subject has tennis | Card opens on tennis; if subject lacks tennis → viewer primary or subject primary |
| PR-82 | Partners ranking modes (enough data) | Player card Statistics → Partners when Rating/Games change people vs Formulae | Switch visible; each visible mode changes at least one card person; no two tabs with identical people |
| PR-83 | Partners sparse data (one game) | Open card with 1 finished doubles game (e.g. Polina) | Ranking switch hidden; only one partner + one opponent card (no best=worst / favorite=nemesis dupes) |
| PR-streak-1 | Own profile play streak chip | Own profile/card after ≥1 qualifying week | Flame + N weeks; tap opens sheet with current/best/deadline |
| PR-streak-2 | Other profile play streak | Open another user’s card with streak | Current/best visible; no at-risk styling or hours |
| PR-streak-3 | Same week second game | Second rated finish same week window | Count unchanged; results streak banner absent |
| PR-streak-4 | New week while alive | Rated finish after open week, before deadline | Count +1; celebration banner once |
| PR-streak-5 | Past deadline / no current | Open player card or profile after missing deadline (current = 0, best &gt; 0) | Streak chip hidden everywhere; best only inside sheet when an active streak is tapped |
| PR-trophy-1 | Own empty trophy showcase | Own player card / `/user-profile/:id` with no unlocks | Three empty showcase slots under avatar + short hint; no crash |
| PR-trophy-2 | Own empty achievements | Profile → Statistics: after avatar, before followers; player card: after message/favorite buttons (outside stats panel); no unlocks | Title “Achievements” + count; horizontal snap carousel of locked tiles with progress bars; edge fades when scrollable; no body copy under the section title |
| PR-trophy-2b | Achievements carousel | Player card (after message/favorite) / Profile Statistics (after avatar, before followers) with several trophies | Single-row horizontal carousel (unlocked newest first by earned date, then locked by progress); partial next tile peeks; edge fades reflect available scroll direction; touch scrolling has no visible scrollbar on mobile, while desktop exposes a mouse-draggable horizontal scrollbar; single cards open detail; family stacks expand first |
| PR-trophy-2c | Habit family stack | Own Statistics with ≥2 `habit_games_*` / streak / wins (incl. `habit_first_win` + `habit_wins_*`), some locked | Same-family locked + unlocked in one pile: face = best unlocked, under it lower unlocked then locked; expand left→right low→max; emerald chase progress; legendary gold only after unlock; first win stacks with wins ladder; single entry stays a card |
| PR-trophy-2d | Stack expand → detail | Tap a trophy stack in the cabinet | The existing group frame widens while the same piled icon-frames fan into one row inside it; all rail cards share the tallest natural content height (no fixed-height blank area); each column is icon → fixed two-line title slot → compact rarity tag, keeping every tag on one baseline; progress remains pinned below the tags at the frame bottom; collapsed pile depth clears the family label, and its localized subtitle wraps to at most two lines without ellipsis or bottom clipping; only an expanded icon opens detail, while tapping its title/tag or any other group-frame space smoothly collapses the group; a standalone card opens detail from its whole card surface |
| PR-trophy-3 | Visitor empty trophies | Open another user’s card with zero trophies | Showcase hidden; cabinet calm empty (“No trophies yet”) — no locked graveyard |
| PR-trophy-4 | Trophy detail sheet | Tap locked or unlocked trophy tile | Sheet with title, rarity, description; locked progress is centered as current / target with a percentage and polished progress bar directly below; locked trophies without measurable progress show a centered hint; tapping the backdrop dismisses detail from both grouped icons and standalone cards without collapsing an expanded group |
| PR-trophy-4b | Followed achievement earners | Follow users who earned the selected trophy → open its detail sheet | Reserved loading rail avoids layout jump, then matching followed users wrap as compact avatar/name tags without horizontal scrolling; tapping a tag opens that player; long names truncate; users without the achievement and blocked users are absent; load failure offers tap-to-retry |
| PR-trophy-4c | Achievement family leaders | Open a trophy detail for a family with ranked progress | After followed earners, the global all-gender top three for the trophy’s achievement family appear as wrapped rank/avatar/name tags; first-win uses the wins family; tapping a tag opens that player |
| PR-trophy-4d | Achievement family leaders unavailable | Open a trophy detail whose family has no ranked progress, or when ranking load fails | Leader tags remain hidden without blocking or replacing the rest of the detail sheet |
| PR-trophy-5 | Dark/light trophy UI | Toggle theme on Statistics with cabinet visible | Trophy frames/labels readable in both themes |
| PR-trophy-6 | Habit unlock first win | Finish a qualifying rated win when user has 0 prior wins | `habit_first_win` appears on own cabinet/showcase; Common banner on Results once |
| PR-trophy-6a | Habit unlock first padel game | Finish first qualifying PADEL game (0 prior padel finishes) | `habit_first_padel_game` unlocks; Common banner; tennis-only play does not unlock |
| PR-trophy-6c | Rally Starter organize games | Owner of rated PADEL GAME reaches FINAL (1 / 10 / 25 / 50 / 100 / 500) | Matching org-game trophies grant once; non-rating / non-padel / non-OWNER do not |
| PR-trophy-6d | Tournament host organize | Owner of rated PADEL TOURNAMENT reaches FINAL (1 / 5 / 10 / 25 / 50 / 100) | Matching org-tournament trophies grant once |
| PR-trophy-6e | Soul of the party (Bar) | OWNER of BAR reaches FINAL (1 / 5 / 10 / 25 / 50 / 100) | Matching org-bar trophies grant (any sport); no affectsRating required |
| PR-trophy-6f | Giant Killer | Win rated PADEL 2v2 vs team ≥0.5 higher avg; all 4 players reliability >10% (1 / 5 / 10 / 25 / 50) | Matching Giant Killer trophies; non-rated / low reliability / insufficient gap do not count |
| PR-trophy-6g | Dynamic Duo | Win 10 / 50 / 100 qualifying PADEL matches with same partner | Matching Dynamic Duo trophies; progress shows best partner win count |
| PR-trophy-6h | Open Court | Complete qualifying PADEL doubles with 10 / 25 / 50 / 100 / 250 distinct partners (ties count; wins not required) | Matching Open Court trophies |
| PR-trophy-6i | Leto 2026 season medal | User who played Fix Liga Leto 2026 (participant / playoffs / 4th / bronze / silver / gold) | Exactly one exclusive Leto 2026 medal (best tier only); rarity pill shows UNIQUE (above Legendary); fuchsia frame/glow; visitors only see earned; non-participants never see locked slots |

| PR-trophy-6b | Habit unlock wins milestones | Cross 10 / 25 / 50 / 100 / 500 qualifying wins | Matching win trophies grant once; 10–25 Common banner; 50–100 Rare + 500 Legendary celebration |
| PR-trophy-7 | Habit unlock volume | Cross 10 / 50 / 100 / 500 / 1000 qualifying finished games | Matching volume trophy grants once; 10–100 Common banner; 500 Rare + 1000 Legendary celebration sheet |
| PR-trophy-8 | Habit unlock streak 4 | Advance play streak to 4 weeks | `habit_streak_4` unlocks; Common banner on Results; count does not re-banner on same-week finish |
| PR-trophy-9 | Habit unlock idempotent | Re-finalize / edit results after habit already earned | No duplicate instance; banner does not reappear for same unlock |
| PR-trophy-10 | Rare streak celebration | Reach 8 / 12 / 16 / 32-week streak (Rare habit) | Trophy grants; Results opens celebration sheet (not Common banner) with Rare art + rarity badge; light/dark readable |
| PR-trophy-10b | Legendary streak / volume | Reach 64-week streak or 1000 finished games | Legendary celebration sheet; art + badge match Legendary |
| PR-trophy-11 | No historical soft backfill | User already above volume thresholds pre-ship → finish next qualifying game; streak uses current count only | No volume trophies for already-passed thresholds; streak unlocks only when current weeks cross 4/8/12/16/32/64 (not lifetime best dump) |
| PR-trophy-12 | Rarity visual hierarchy | Own cabinet with Common + Rare + Legendary (or locked Legendary silhouette) | Frames, glow, and rarity badges clearly differ; showcase slots use matching rarity treatment |
| PR-trophy-13 | Distinct trophy art | Browse full own cabinet catalog | Each definition shows unique art (podium cups / first-win medal / volume badges / streak flames) — not generic placeholders |
| PR-trophy-14 | Celebration motion + cabinet CTA | Rare/Legendary unlock on Results | Sheet springs in with brief spark accents; View cabinet navigates to own profile; dismissible; works light/dark |
| PR-trophy-15 | Showcase beside streak | Own player card with streak + ≥1 showcase trophy | Showcase under avatar next to play-streak chip (rarity glow, tap → detail) |
| PR-trophy-16 | Tournament podium N≥8 | Finalize TOURNAMENT with ≥8 PLAYING and places 1–3 | Gold/silver/bronze granted; celebration sheet with pin + view cabinet |
| PR-trophy-17 | Tournament podium N<8 | Finalize TOURNAMENT with <8 PLAYING | No podium trophies; no podium celebration |
| PR-trophy-18 | Podium stack per event | Gold in two different qualifying FINAL events | Two distinct gold instances in cabinet |
| PR-trophy-19 | Celebration pin CTA | From Rare/Legendary celebration sheet tap Pin | Showcase pin persists; sheet shows pinned state |
| PR-trophy-19b | Cabinet pin / unpin | Own unlocked trophy → detail → Pin; then Unpin | Optimistic update; pinned ★ on own cabinet tile + own showcase; after unpin falls back to auto showcase |
| PR-trophy-19h | Pinned badge on family stack | Pin one tier inside a habit family stack; view collapsed then expanded | Collapsed: single ★ on group frame (not doubled on face icon); expanded: ★ only on the pinned tier icon(s), group ★ hidden |
| PR-trophy-19i | Showcase ★ owner-only | Own profile with pinned showcase trophy; open same player as visitor | Owner sees ★ under pinned showcase slot; visitor sees trophy art without ★ |
| PR-trophy-19c | Visitor locked visibility | Open another user’s Statistics with some unlocks | Only unlocked tiles; no locked catalog / progress bars |
| PR-trophy-19d | Owner locked progress | Own Statistics with incomplete habit | Locked tiles + progress bars for streak/volume/first-win |
| PR-trophy-19e | Max 3 pins refuse | Own profile with 3 pins → pin a 4th | No optimistic flip; error “unpin one first”; existing pins unchanged |
| PR-trophy-19f | Profile Statistics showcase | Profile → Statistics (own) | Showcase under avatar next to play streak (same as player card); not clipped |
| PR-trophy-19g | Ghost pin after revoke | Pin a podium trophy → standings correction revokes it → pin another | Old pin cleared; new pin succeeds (no false “full”) |
| PR-trophy-20 | League season T2 | FINAL LEAGUE_SEASON ≥8; fixed-team player who played FINAL fixture for placed team (after mid-season swap) | That player gets podium; roster sticker without FINAL fixture play does not |
| PR-trophy-21 | FINAL correction revoke | After FINAL podium grant, correct standings so place-1 changes → re-finalize/recalc | Old gold revoked from wrong user; new gold on correct user; pins on revoked instance cleared |
| PR-trophy-21b | FINAL reopen clears podium | After podium grant, Edit results (leave FINAL) on tournament / season | Active podium for that event gone from cabinet/showcase; pins on those instances cleared; celebration sheet closes if still open |
| PR-trophy-21c | Season fixture re-FINAL sync | FINAL LEAGUE_SEASON with podium; edit fixture that changes places → re-FINAL fixture | Season podium matches corrected standings; revoked pins cleared; no stale Legendary on wrong player |
| PR-trophy-21d | Restart/reset clears podium | After podium grant, Restart results (reset/delete → NONE) on tournament | Podium + pins cleared; no celebration for revoked ids |
| PR-trophy-21e | Admin reset clears podium | Admin `/games/:id/reset-results` after podium grant | Same as 21d — podium + pins cleared |
| PR-trophy-21f | Standings recalc syncs season podium | FINAL LEAGUE_SEASON; admin/organizer recalculate standings after place change | Cabinet matches new top 3; revoked pins cleared |
| PR-trophy-22 | Season podium celebration | Mark LEAGUE_SEASON FINAL (≥8); open own Profile → Statistics or player card (any tab) | Rare/Legendary sheet from pending unlocks (pin + view cabinet) |
| PR-trophy-23 | Recalc keeps pins | Re-save identical FINAL tournament results after pinning a podium trophy | Pin remains; no duplicate instance |
| PR-trophy-24 | No double celebration | Celebrate on Results, then open own profile (or Results + own card same session) | At most one celebration sheet at a time; same id never reopens after dismiss |
| PR-trophy-25 | Bracket final reopen | FINAL season with bracket; reopen grand-final fixture | Season podium cleared/absent until final is FINAL again; no RR standings fallback gold |
| PR-trophy-26 | Walkover no bench trophy | Bracket walkover FINAL where a fixed-team roster has a non-PLAYING name | Only PLAYING players get outcomes/podium eligibility |
| PR-trophy-27 | Multi-group PER_GROUP event podium | FINAL LEAGUE_SEASON with PER_GROUP brackets in 2+ groups | Event-wide top 3 (standings+H2H), not one Legendary gold per group champion |
| PR-trophy-28 | Missed Results celebration | Unlock on Results then leave tab before dismissing sheet | Soft claim released; profile/pending can show until dismiss persists |
| PR-trophy-29 | Status-patch tournament celebration | Patch TOURNAMENT to FINAL (≥8) without outcome recalc | Podium granted; Results outcomes carry podiumUnlocks for sheet |
| PR-trophy-30 | Nested card celebration | Own player-card sheet open when pending Rare/Legendary | Celebration nested drawer works; card does not steal dismiss |
| PR-19 | Change city | City modal | City updated; no Cities/Clubs switch; browse country → cities |
| PR-20 | Phone/password change | If exposed in UI | Auth updated |
| PR-21 | Language selector | Pick language | i18n + profile saved |
| PR-22 | Theme selector | Light/dark/system | Theme applied |
| PR-23 | Online status toggle | Show/hide online | Preference saved |
| PR-24 | Notification settings modal | Open + toggle prefs | Saved |
| PR-63 | Notification cross-channel hint | Push off for a type, Telegram still on → red hint under toggle; tap hint | Switches to Telegram tab; row pulses/highlighted |
| PR-25 | Wallet modal | Tap wallet badge | Balance + actions |
| PR-26 | Send money to user | From wallet/user profile | Transfer flow |
| PR-27 | Link Apple account | OAuth link | Linked state |
| PR-28 | Unlink Apple | Confirm unlink | Removed |
| PR-29 | Link/unlink Google | Same as Apple | |
| PR-30 | OAuth merge modal | Duplicate account detect | Merge flow |
| PR-65 | Link Telegram from profile | Profile → Link Telegram → bot → Open Bandeja while logged in | Telegram row shows linked; username if available |
| PR-66 | Unlink Telegram | User with 2+ auth methods → Unlink Telegram → confirm | Telegram row shows not linked |
| PR-67 | Last auth method guard | User with only one of Google/Apple/Telegram | Unlink disabled + hint; API returns `auth.cannotUnlinkLastAuthMethod` if forced |
| PR-68 | Telegram OAuth merge | Link Telegram already on another account → confirm merge | Accounts combined; survivor keeps session |
| PR-69 | Legacy phone section | User with `phone` + Google/Apple/Telegram | Section visible; Remove clears phone sign-in; hidden when no phone |
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
| PR-47a | Level feedback privacy threshold | Levels tab with 4 distinct evaluators, then 5 evaluators across 3 games | Own profile shows neutral pending state below threshold; other profile hides card; at threshold both show anonymous donut and percentages total exactly 100% |
| PR-47b | Level feedback sport/relevance | Switch profile sport; include feedback older than 12 months or >0.5 from current level | Card follows selected sport; stale or level-irrelevant evaluations are excluded; no voter names, games, or timestamps are exposed |
| PR-48 | Edit sport level on profile | Enabled sport → Show details → Edit level in panel below grid | Panel opens; level saved; Show/Hide on every enabled sport |
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
| PR-57f | Padeloo Integrations tab | Integrations tab in city with Padeloo club (Zlatibor) | Avantura clubs listed; connect opens email OTP sheet; disconnect works |
| PR-57g | Padeloo Bookings tab | Connected Padeloo user with upcoming reservation | Bookings tab lists Padeloo reservation alongside Booktime rows with provider badge |
| PR-57h | Klikteren Integrations tab | Integrations tab in Novi Sad with Padel Pro | Padel Pro listed; connect opens email+password sheet; disconnect works |
| PR-57i | Klikteren Bookings tab | Connected Klikteren user with upcoming booking | Bookings tab lists Klikteren booking alongside other providers with provider badge |
| PR-57j | Klikteren create-game book | Create GAME at Padel Pro → connect → pick free slot → confirm book | Court reserved via Klikteren (Bandeja upstream proxy); game linked with EXTERNAL booking badge |
| PR-57k | Klikteren availability without CORS block | Open Padel Pro club detail availability (web) | Slots load (requests go to `/api/klikteren/upstream/...`, not blocked by klikteren.com CORS) |
| PR-57c | Link booking to game (happy path) | My tab → Bookings → Link to game → pick game (confirm reschedule if times differ) | Single request succeeds; success toast; game shows linked booking with correct time/club |
| PR-57d | Link booking to game (failure) | Link to game while offline or on already-linked booking | Error toast; no partial link (game unchanged if request failed) |
| PR-57e | Bookings back navigation | My tab → See all → back; Profile → Bookings → back | Browser back returns to previous screen (My tab or Profile) |
| PR-59 | Club account disconnect | Bookings page → Integrations tab → Disconnect | Toast "Club account disconnected"; club shows connect CTA |
| PR-59a | Booking auth expired toast | Force external booking 401 with failed refresh while signed in | Unobtrusive toast: title + body; **Reauthorize** → Integrations tab; **Not now** dismisses; app stays usable |
| PR-59b | Needs reauthorize badge | After expired auth (PR-59a) open Bookings → Integrations | Club badge is **Reauthorize** (not Connected/Disconnected); hint visible; primary **Reauthorize** + secondary **Remove connection** |
| PR-59c | Reauthorize recovers | Integrations → Reauthorize → complete connect sheet | Badge becomes Connected; needs-reauth cleared; bookings can sync again |
| PR-59d | Remove connection after expiry | Integrations needs-reauth club → Remove connection | Flag cleared; club shows plain **Connect account** (no reauth state) |
| PR-59e | Club detail reauth banner | Club detail for expired booking connection | Amber renew banner with Reauthorize CTA (not first-time connect copy) |
| PR-60 | Club booking cancel from settings | Settings page upcoming → cancel booking | Same policy modal + snapshot refresh as club detail |

---

## 14. Leaderboard (`/leaderboard`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LB-01 | Leaderboard loads | Open tab | Achievements is the first and active subtab; achievement rankings load |
| LB-02 | Sport filter | Switch sport | Rankings refetch |
| LB-03 | City scope | City-specific board | Filtered players |
| LB-04 | Open player from row | Tap player | Profile/card |
| LB-05 | Empty leaderboard | No ranked players | Empty state |
| LB-06 | Current user highlight | User in list | Highlighted row |
| LB-07 | Gender filter | Switch All / Men / Women | Rankings refetch for that gender cohort; ranks restart at 1 |

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
| UT-07 | Dead custom avatar URL | Team whose `avatar` CDN URL 404/403s | Falls back to member composite / initials (no broken-image icon) |
| UT-08 | Replace team avatar | Owner replaces existing team photo | New image shows; prior URL may 404 without breaking display |

---

## 16. Game subscriptions (`/game-subscriptions`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GS-01 | List subscriptions | Open page | Subscriptions shown |
| GS-02 | Create subscription | Add form | New subscription |
| GS-03 | Edit subscription | Edit existing | Updated |
| GS-04 | Delete subscription | Delete confirm | Removed |
| GS-05 | Club filter in form | Pick clubs | Saved filters |

### 16.1 Play Intents (Find lobby)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PI-01 | Want-to-play CTA | Open Find while logged in and not looking | Compact “I want to play” strip is the topmost Find content, above the hero ad; same slot as Looking |
| PI-02 | Create intent | Tap CTA → pick Today + Anytime → Start looking | The same drawer animates from intent form to radar; idle CTA swaps to Looking status strip |
| PI-03 | Stop looking | Tap × on status strip → Don’t want to play | Confirm overlay (Cancel / Don’t want to play) animates over strip without layout jump; confirm cancels intent; Cancel restores × |
| PI-04 | Empty lobby | Looking with no other pool members → tap status strip | Honest empty copy; no fake avatars |
| PI-05 | Proposal sheet | Open `/find?proposal=<id>` (or tap ready strip) → tap Not now → reopen lobby | Not now only dismisses the drawer; ready match remains and Create is still available when reopened |
| PI-19 | Friend ring in lobby | Favorite is in intersecting pool | Avatar has golden favorite ring |
| PI-20 | Full pool + affinity weight | Looking with mixed-compatible peers | Lobby shows all city peers; near=large+highlighted, mid=smaller, far=smallest/muted outer orbit (not hidden) |
| PI-21 | Roster edit | Open a match-ready deep link with 5+ intersecting → remove one → tap a pool avatar | Removed returns to pool; tap adds into vacancy; court, roster, and count refresh together to full party; Create enabled |
| PI-22 | Match roster progress UI | Open a lobby with a partial and then full selected roster | Progress bar is directly above the player carousel; selected/needed count is in the card’s top-right; title and hint change from Not enough players to Match is ready |
| PI-23 | Direct match editor | Open a lobby with compatible free players → remove one from the roster → add one from the court → tap I’ll create the game inside the editor | Best compatible players start selected around the center court and in the editable roster; available unselected players use a yellow glow and plus only while a vacancy exists; a full roster shows no plus badges; empty slots remain visible below party size; there is no separate footer; Create Game always appears inside the editor and opens with every currently selected player invited |
| PI-06 | Host handoff | Confirm as first confirmer | Navigates to create-game prefilled; invitees preselected |
| PI-07 | Push deep link | Tap PLAY_INTENT_MATCH notification; also retry after a brief offline/network failure before the proposal loads | Opens Find with proposal sheet; transient failures keep `?proposal=` so a retry can recover the same sheet |
| PI-08 | Game-fit deep link | Tap GAME_MATCHES_INTENT notification | Opens matching game details |
| PI-09 | Idle Find discovery | Browse Find without looking, before and after 18:00 city time, with active players for today/tomorrow | The single top strip shows today’s willing-player count and avatars; from 18:00 it includes today and tomorrow; tapping still opens the intent form |
| PI-10 | Matched strip stays | After peer match (MATCHED intent) | Status strip stays; “Match ready” — not idle CTA |
| PI-11 | Host abandon create | Confirm → create-game → Back without saving | Proposal released to PENDING; others can confirm |
| PI-12 | Non-host waiting | Second user opens proposal after host claimed | Waiting copy; Not now available |
| PI-13 | Compose more options | CTA → More options → pick club + level band + Custom time → Start | Intent saves with clubIds, min/max, CUSTOM window |
| PI-14 | Mute play-intent notifs | Profile → Notification settings → turn off Want to play and Friends looking separately | Match/game-fit mute leaves friend/owner social alerts on; social mute leaves match/game-fit on; chat prefs unchanged |
| PI-15 | My tab strip | Open My tab while logged in | Same Want to play / Looking strip sits below stories (and hero ad if shown) and above Bookings/Teams/Leagues switch |
| PI-16 | Activity selector | CTA → pick sport or Bar (first control) → Start | Intent uses chosen sport/BAR; More options clubs filter (bars-only for Bar; sport clubs otherwise) |
| PI-17 | Sport ≠ Find filter | On Find with sport A selected, compose sport B (or Bar) → Start | Looking strip still shows (city-scoped); stop cancels that intent |
| PI-18 | My ↔ Find parity | Start looking on Find → open My (same city) | Looking strip present; stop on either clears both |
| PI-24 | Change intent in radar | Open radar → Change intent → edit day/time/options → Start looking | Same drawer animates to the prefilled intent form, then back to radar with the replacement intent |
| PI-25 | Cancel intent in radar | Open radar → Cancel intent → Cancel, then repeat and confirm Don’t want to play | First Cancel restores radar actions; confirm cancels intent, closes drawer, and restores idle CTA |
| PI-27 | Fill last slot from outside the auto-picked players | Open a lobby where more compatible players exist than party size → remove one from the roster → tap a compatible player that was not auto-selected | Tapped player moves to the court and is counted in the roster, so the count reaches full party (e.g. 4/4) and Create Game invites them |
| PI-26 | Looking strip avatars | Look with at least four compatible nearby players, including one without a photo | Two overlapping tiny player avatars and a final `N+` counter appear; missing photos show initials instead of blank circles |
| PI-28 | Intent lifecycle after game creation | User A creates a game from the match editor with users B–D selected | A’s looking state ends only after successful creation; B–D receive game invites and are reserved from other matching while their looking intents remain pending |
| PI-29 | Intent lifecycle after invite response | From PI-28, B accepts, C declines, and D lets the invite expire | B’s looking intent ends; C’s valid intent returns to the lobby; D’s intent returns only if still valid, otherwise expires; none remain silently reserved |
| PI-30 | No game-fit for past start times | With an open public game that already started earlier today, start looking for Today / Anytime in that city | No “A game fits your wish” notification for the past game; only games starting later than now are offered (and the owner gets no “Players are looking” ping for it) |
| PI-40 | Sport intent ignores training/tournament | Start looking with a sport (GAME) intent while a public TRAINING or TOURNAMENT fits the same city/sport/window; also create a BAR intent near a public BAR | Sport intent only game-fits GAME events (not TRAINING/TOURNAMENT); BAR intent only game-fits BAR |
| PI-31 | Wish expires with its playable window | Start looking for Today / Morning, then cross 12:00 city-local time; refresh Find and try a pending proposal deep link | Looking state disappears, the intent is absent/ineligible in the lobby, stale proposals cannot open or confirm, and no match/game-fit notification is sent |
| PI-32 | Push opens friend intent prompt | Follow user A in the same city with A’s sport enabled, have A create a GAME intent, then tap the localized push (Find may stay mounted in background) | Bandeja opens on My only, shows localized loading feedback, then a single dialog with A, sport, city/clubs, days, time, and level; “I want to play too” is available; Find does not also open the dialog |
| PI-33 | Follower notification privacy and spam controls | Block A (either direction), mute Friends looking (social), leave Want to play (match) on, follow from another city / without the sport enabled, edit A’s intent, then cancel/recreate within six hours | Blocked, socially muted, other-city, or sport-disabled followers receive nothing; match mute alone does not suppress friend alerts; edits and rapid recreation do not repeat the follower notification; BAR intents do not send play wording |
| PI-34 | Join friend intent from push | From PI-32, tap “I want to play too” | A similar intent is created for the follower, the dialog closes, and My opens the Court lobby drawer with the follower and A in the matching pool |
| PI-35 | Join friend intent from Telegram | Tap the localized “I want to play too” Telegram button while authenticated, then repeat while signed out and complete login | The new My deep link survives login, shows localized progress while creating an idempotent similar intent, and opens the Court lobby drawer; reopening the same link does not replace an identical active intent |
| PI-36 | Shared intent unavailable or forbidden | Open a shared-intent link after expiry/cancel/consumption, after unfollowing, or after either user blocks the other | No intent is created; a localized unavailable/access error appears and the stale query parameter is removed |
| PI-37 | Realtime lobby reconciliation | Keep Find open for users in the same city; create, replace, cancel, expire, edit a proposal roster, and convert a proposal from another client; briefly disconnect/reconnect one client | The lobby refetches immediately from authoritative HTTP state for every committed transition; reconnect/focus also reconciles; no 12–30s wait or duplicate visible transition occurs |
| PI-38 | Accessible proposal arrival | Start with an active intent and form a new proposal from other clients while a screen reader is active; repeat with Reduce Motion enabled | The new proposal is announced once through a polite live region; the ready strip celebrates once when motion is allowed and stays static with Reduce Motion |
| PI-39 | Native friend-intent action | Receive a followed-user play-intent push on iOS and Android, then use “I want to play too” from the notification | iOS groups the alert in the play-intent thread; both platforms open the shared-intent confirmation flow with localized action copy; a repeated provider delivery collapses instead of stacking |
| PI-41 | Custom-hours mismatch bubble | Look with Evening while another city player is looking Custom 11:00–13:00 | Far-field bubble shows `11:00–13:00`, not “Custom hours” |
| PI-42 | Custom-hours fit popup | From PI-41, tap the far-field avatar | Fit card Time row subtitle is `11:00–13:00`, not “Custom hours” |
| PI-43 | Discuss from lobby roster | Open a lobby with me + 1 selected player and tap Discuss in group; repeat with me + 2 or more | One other player opens (or creates) the 1:1 chat; two or more opens an existing group with exactly those people or creates `Discussion for <date> · <time> · <club>` and opens it; Create Game remains available |
| PI-44 | Discuss after a player left | In a me + 2 lobby, one selected player stops looking, then tap Discuss in group | Toast says they are no longer in the lobby; roster refreshes; chat does not open |

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
| X-09 | Unread counts refresh | Tab badges update on login, reconnect, or socket delta — not on ordinary tab/route navigation |

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
| X-18 | City selector list view | City list searchable; browse is country → cities only |
| X-19 | City selector map view | `CityMap` shows cities and clubs together (no cities/clubs layer switch) |
| X-20 | Map ↔ list toggle | Switch views without crash; no Cities/Clubs toggle |
| X-21 | Select city from map | Tap city or club pin → sticky “Use {city}” → city selected |
| X-68 | City selector no clubs browse | No Clubs mode/tab; clubs are not a parallel browse list under a country |
| X-69 | Map club pin → city | Pending city is the club’s city; confirm commits city only |
| X-70 | Map pan does not dismiss sheet | Pan/drag map in change-city sheet; sheet stays open; dismiss still via handle/X/outside |
| X-71 | Map country tint zones | Open city map with clubs in Austria/Poland (and other countries with cities); warm fill polygons match those countries; missing GeoJSON country → no tint for that land only |

### 18.6 Ads & sponsored content

| ID | Test | Expected |
|----|------|----------|
| X-22 | Home hero ad slot | Ad renders above My tab segmented switch (or graceful empty) |
| X-23 | Find top ad slot | Ad respects sport context |
| X-24 | Leaderboard banner ad | Ad on leaderboard tab |
| X-25 | Ad click in-app route | Tap ad with internal action → navigates |
| X-26 | Ad click external URL | Tap ad with URL → opens browser |
| X-26a | Personalized click URL | Campaign with append user_name / locale / theme / ad_token on; tap ad | URL gets enabled params; `ad_token` opaque+stable per user↔campaign until expiry/revoke (no mid-life rotate); mint failure omits token but still shows ad |
| X-26b | Ad click static same-host page | Tap home hero with `OPEN_URL` + `/LizaBirthday2026` | Full document load of static landing (not SPA route); page renders birthday wish form |
| X-26c | Static landing URL (dev Vite) | Open `/LizaBirthday2026` (no trailing index.html) on Vite | Serves `public/LizaBirthday2026/index.html`; does not bounce to `/` via SPA catch-all |
| X-26d | Birthday wish submit (linked) | Open `/LizaBirthday2026?ad_token=…` from ad; fill name+message; submit | Wish saved; success message; may submit again |
| X-26e | Birthday wish submit (anonymous) | Open landing without `ad_token` (or with garbage token); submit wish | Wish still saved (no user link); success message |
| X-26f | Birthday wish from native app | Tap ad in Capacitor (absolute `https://bandeja.me/LizaBirthday2026…`) → submit | Opens system/in-app browser to bandeja.me (not WebView SPA bounce); wish POST works |
| X-26g | Birthday wish return on web/dev | From `bandeja.me` or `localhost:3001`, tap the Liza ad → submit → tap Back to Bandeja | Landing uses the current tab and Back restores the exact originating Bandeja screen |
| X-26h | Birthday wish return fallback | Prevent Back to Bandeja from navigating, or tap it twice | A localized animated hint appears below the button after the failed first attempt or immediately after the second tap, asking the user to close the page manually |
| X-26i | Birthday donation excludes user from ad | Open `/LizaBirthday2026?ad_token=…`; submit with Donate RSD/RUB | Wish saved; user id appended to that campaign’s `targeting.excludeUserIds`; ad no longer served to that user |

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
| X-38 | Tap group chat push (Android) | Group message push with app backgrounded/killed → tap | Routes to `/group-chat/:id` |
| X-39 | Tap bug chat push (Android) | Bug thread message push → tap | Routes to `/bugs/:groupChannelId` |
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
| X-54b | Admin via serve + tunnel | `./Admin/run-ssh.sh` → `./Admin/serve.sh` → open `http://127.0.0.1:9010/` → API `/api` → login | Login + admin API succeed (same-origin proxy to tunneled `:3000`) |
| X-54c | Admin file:// blocked | Open `Admin/index.html` as `file://` | Blocking message; instructs serve.sh + `http://127.0.0.1:9010/` |
| X-54d | Admin local backend | Backend on `:3000` → `./Admin/serve.sh --dev` → login API `/api` | Admin talks to local API via proxy |

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
| X-51 | Story DM bar keyboard | Story viewer → focus DM input (iOS/Android) | DM bar sits just above keyboard with quick reactions visible; input does not jump to header |
| X-52 | Keyboard dismiss restores layout | Any of above → dismiss keyboard | Surfaces return to resting position; no leftover bottom padding or shifted dialogs |
| X-52a | Sticker/GIF tray above keyboard | Chat → open Stickers & GIFs → focus search (iOS/Android Capacitor + mobile web) | Tray lifts and expands to fill space above keyboard; results not covered; dismiss restores compact sheet |
| X-55 | Auth login keyboard (Android web) | Mobile Chrome → `/login` → focus phone field | Form sits directly above keyboard; no dark gray scroll gap between card and keyboard |

### 18.11 Home screen Next Game widgets (Capacitor iOS + Android, `@widget` `@manual`)

Cache-only: app writes next-games envelope after My games loads; widgets only read + schedule refresh. Run each case on **both** iOS (`systemSmall` / `systemMedium`) and Android (~2×2 / ~4×2) unless a row says platform-only. Deep links: game → `https://bandeja.me/games/{id}`; empty → `/`; signed out → `/login`.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| X-56 | Add widget signed-out | `@guest` cold install or logged out → add Next Game widget (small + medium) | Sign-in copy shown (en: “Sign in to see your next game”); no game title/club |
| X-57 | Tap signed-out widget → login | Widget in signed-out state → tap | App opens `/login` |
| X-58 | Signed-in empty state | `@auth` user with no upcoming games → open My tab so cache syncs → view widget | Empty copy (en: “No upcoming games”); Bandeja logo + sky brand colors; no stale game from prior session |
| X-59 | Tap empty widget → home | Empty authenticated widget → tap | App opens `/` (My tab) |
| X-60 | Signed-in with upcoming game | `@auth` `@seed:games` user with upcoming game → open My tab → view widget (small + medium) | Shows game title, time (or relative countdown), and club/location; medium shows at least as much as small |
| X-61 | Tap game widget → game details | Widget showing an upcoming game → tap | App opens `/games/{id}` for that game |
| X-62 | Logout clears widget | Widget showing a game → Profile → Logout → return to home screen (no need to re-add widget) | Widget returns to signed-out / sign-in state; previous game data gone |
| X-63 | Login restores next game | After X-62 → log in as user with upcoming game → open My tab once | Widget updates to that next game (title/time/club) without re-adding |
| X-64 | Language sync (incl. cs) | `@auth` Profile → switch UI language to **cs** (also spot-check es/ru/sr) → return to My so sync runs → view widget | Widget chrome/empty/sign-in strings match locale (cs sign-in: “Přihlaste se a uvidíte další zápas”; empty: “Žádné nadcházející zápasy”) |
| X-65 | iOS widget gallery labels | iOS only: long-press home → widgets → search Bandeja / Next Game | Display name + description localized (en: “Next Game” / “Shows your next Bandeja game.”) |
| X-66 | Android widget picker labels | Android only: add widget → pick Next Game | Title + description localized for current app language |
| X-67 | iOS Home widget ignores Watch shared | After Cap sync writes next-games envelope → Home Next Game widget timeline | Widget still reads envelope via `BandejaNextGames` (`NextGamesEnvelopeStore`); no dependency on `BandejaWatchShared` for cache |

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

Offline queues, deep links, OAuth merge, Holland auctions, broadcast/TV modes, delete account, admin-only filters, visual regression, URL overlays, push routing, locale matrix, entity type matrix, home Next Game widgets (`X-56`–`X-67`)

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
- Capacitor-native flows remain manual checklists (incl. §18.11 home widgets)
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
- Unit/integration: `Frontend` / `Backend` `test:*` scripts; CI `.github/workflows/ci.yml`
- Home Next Game widgets: `Frontend/src/services/widgetNextGamesSync.ts`, iOS `BandejaHomeWidgets/` + `BandejaNextGames/`, Android `:bandeja-widgets`
- Watch live-scoring relay (WatchConnectivity): iOS `BandejaWatchShared/` (payloads only; not next-games cache)
