# PadelPulse UI Test Plan

> End-to-end and manual UI test catalog for the web app. Based on routes (`App.tsx`), tabs (`MainPage`, `BottomTabBar`), and feature modules in `Frontend/`.

---

## 1. Scope & goals

### In scope
- Web app (Vite dev / preview) — primary automation target
- Responsive layouts: mobile viewport, desktop split views, landscape game details
- All authenticated main tabs: **My**, **Find**, **Chats**, **Market**, **Leaderboard**, **Profile**
- Standalone flows: create game/league, game details, live scoring, club admin, first-run onboarding (`/welcome`), shop (`/shop`), game series (`/series/:id`)
- Guest-readable pages: game details, user profile, **club page** (`/clubs/:id`)
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
- `@shade` — a notification **action button** in the OS shade / lock screen. `invite_actions`, `play_intent_actions` and `attendance_actions` are wired natively; series and weather actions currently exist on Telegram and in-app only (`docs/product/not-shipped.md`)

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
| G-10a | Premium navigation appearance | Sign in as Premium; open Home, Find, Chats, Market, Top, Profile | Gold embossed Bandeja tiger/wordmark on a full-width obsidian header using the welcome accept button’s marble texture, with clearly visible, continuous vein drift from the first seconds using the same dedicated stone texture as “I accept”, and a slow light sweep only across the branding area and top safe area; the texture softly fades and darkens at the left/right component areas while staying clear in the center; a soft gold glow spills from the branding seam into the top of the tab/controls row and fades before its bottom; text and controls stay stationary and clickable, menus remain unclipped; scroll repeatedly in Chrome’s mobile layout with no flicker or animation restart, and reduced motion freezes the texture, with PREMIUM centered beneath BANDEJA between straight, thin gold long dashes and no Inner circle tagline; matching bottom tabs where normally visible; original compact width, spacing, icon sizes, active-label hiding and animations are preserved; page surfaces/accent colors use the warm Premium palette |
| G-10m | Premium glowing names | View premium, opted-out premium and standard users in avatar captions, profiles, rosters, invites, followers, rankings and chat; toggle visibility; check 320px, long names, light/dark, RTL and avatar-only modes | Opted-in premium names have gold fill, a thin dark letter outline and soft gold glow; glyph edges stay readable in both themes and on colored surfaces; fonts/layout remain unchanged with no underlines or containers; opted-out/standard users have no treatment or Premium tooltip; avatar-only views have no added marker |
| G-10b | Premium membership changes | Refresh user from Premium to standard, then back; log out | Appearance responds without reload; standard users retain original header height/palette; no Premium status-bar color leaks after logout or leaving the shell |
| G-10c | Premium responsive/safe-area layout | Check 320px, 390px, desktop and landscape; open split Home/Find/Chats and game details | Content starts below the full header; controls, back/table/chat actions and brand do not overlap; bottom bar fits, respects bottom inset, and keeps existing split-panel placement |
| G-10d | Premium appearance/accessibility | Switch light/dark/system; check Arabic RTL, keyboard focus, reduced motion, no enabled sports and unread chats | Theme preference stays intact; header remains dark with readable controls; visible focus; reduced entry motion; My/Find still hidden without sports; unread counts and navigation work |
| G-10e | Premium Capacitor bars | On iOS and Android, switch Premium light/dark and enter/leave a header route | Top safe area matches dark header with light status icons; bottom system bar follows page theme; normal system-bar style restores on leaving Premium header |
| G-10h | Premium first welcome | Launch a Premium account with null `premiumOnboardingCompletedAt`, in Classic and Premium themes | Server state checked after startup; gold tiger seal and light seam precede dark panels opening; Inner Circle poster starts at 130% scale for a pronounced close-up and settles gently to its full uncropped view, one gold light pass finishes, a balanced field of 24 softly glowing, varied-size gold particles builds in the lower portion of the poster after the doors open, keeping the same low origins and rising toward the middle before fading out below the headline; lamplight and clearly visible drifting particles continue after 30 seconds; replay restarts the entrance, image loading delays the sequence, image failure shows a readable welcome; localized “I accept” compact obsidian pill with muted gold text fades up as soon as the doors finish opening, while the poster continues settling, with a sharp black-and-gold marble texture matching the poster orbiting continuously beneath the centered text-only label, with a feathered dark center keeping the lettering clear, without reversing or snapping at the loop boundary and a slow light sweep; it reserves only 64px below the uncropped poster and stays within safe areas on portrait, landscape and desktop; check every language, including Arabic RTL |
| G-10i | Premium dismissal persistence | Accept welcome; reload and sign in on another device; repeat with a failed save/offline connection | Accept always dismisses immediately, including slow/failed/offline saves; first acceptance immediately switches Classic to Premium without changing Light/Dark/System; successful background save persists both Premium main theme and the timestamp across reloads/devices and suppresses future automatic welcomes; failed saves show no blocking error and reconnect does not reopen the screen in the same session; viewing alone never saves |
| G-10j | Premium replay/accessibility | Tap Premium header after completion; accept with button, dismiss with Escape or native Back; enable reduced motion | Same reveal replays without navigation or another write and preserves any later Classic/Premium theme choice; keyboard focus stays within dialog and returns on close; reduced motion shows the full static poster and acceptance button immediately without panels, zoom or ambient motion; underlying app cannot be operated |
| G-10k | Premium branding | Switch Classic/Premium and Light/Dark/System; inspect footer, route loading and cold launch on web/iOS/Android | Premium uses golden tiger and matching warm background; Classic restores sport/racket branding; standard users never receive Premium branding or welcome; account switch never shows the previous account's welcome |
| G-10f | Premium chat appearance | As Premium, open Chats and DM, group, channel, game and marketplace threads in light/dark; check desktop split view and standalone mobile | Warm ivory/charcoal list and messages, gold selection and unread badges, dark metal conversation header, bronze outgoing bubbles and gold send/record controls; incoming messages, links, timestamps and ticks remain readable; no row/composer size changes |
| G-10g | Premium chat transitions/media | Toggle membership, open/close standalone chats and nested panels; check replies, polls, photos, stickers/GIFs, search highlights, archived threads, RTL and keyboard | Standard palette restores after downgrade; status bar stays dark while a Premium header is mounted and restores after the last one leaves; stickers/GIFs stay unboxed, search target stays visible, read-only gates and keyboard/safe-area offsets remain intact |
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
| G-49 | Game text locale cache | Change app language while Find/My games are cached | Lists refetch for the new locale; cached titles do not stay on the previous language’s `localizedText` |
| G-54 | Find/My card localized titles | Game with ready `localizedText.name` for viewer locale appears on Find, My upcoming, and past lists; while viewing, translation arrives for a pending card | Card title shows localized name with existing truncation; no spinner/badge/language picker; pending still shows original until ready; title updates in place without remount; scroll position and list order unchanged |
| G-55 | Event poster / chat list localized titles | EVENT with ready localized name on Find Events rail/list; game chat inbox row with localizedText | Poster and chat list titles show localized name (pending → original); no translation badges on those surfaces |
| G-56 | Guest uses app UI language | `@guest` set UI language (e.g. localStorage/`LanguageSelector`) to a non-English locale → open Find with a game that has ready `localizedText` for that locale | Card title uses that app UI language; chat preferred incoming-translation language is ignored |
| G-57 | Nested season title on LEAGUE card | LEAGUE fixture whose parent season game has ready localized season name | Card shows league name + localized parent season name (not untranslated season `name` when projection is ready) |
| G-58 | Empty-name card fallback with localization | GAME with empty/null name (classic vs non-classic) and TOURNAMENT/BAR/etc. with empty name; `localizedText` pending/empty_source; open Find/My | Existing entity-type / game-type title fallbacks still show; no invented AI title; pending localization does not blank the card title |
| G-59 | Stale My scheduled row localized title | My tab stale/amber scheduled game row (`UpcomingGamesList`) for a game with ready `localizedText.name` | Row title shows localized name (pending → original); same resolver as cards; no translation badge |
| G-60 | Chat-list nested season localized title | LEAGUE fixture chat inbox row whose parent season has ready localized season name | Inbox title is `league · localizedSeason` via `getGameChatListTitle` (pending → authored season name); not untranslated season when projection is ready |)
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
| G-52 | Player overlay training attendance | Open `?player=` for a user who attended TRAINING as PLAYING (past/finished; not a future RSVP). Switch sport. | Compact `N games · M trainings` next to that sport’s level; rated gamesPlayed unchanged; trainings match the selected sport |
| G-53 | Player overlay training attendance zero | Open `?player=` for a user with 0 TRAINING attendance, or only upcoming TRAINING RSVPs | Shows 0 trainings (quiet empty); no crash |

### 4.1b Fullscreen memo editor (`ExpandableTextarea`)

Long free-text fields (game/event/league description, marketplace listing, profile bio,
club description & policy, FAQ answer, review comment, bug description, game-text
translation drafts) render an expand control in the field's top trailing corner that opens
`FullscreenTextEditor`. The overlay edits the same value live — closing never discards text.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| FTE-01 | Expand control present | Open any long text field listed above | Small expand icon pinned top-trailing inside the field; first line of text is not covered |
| FTE-02 | Open & seed | Tap the expand control | Fullscreen editor slides up; textarea focused with the caret where it was inline; header shows the field label + Done |
| FTE-03 | Live value | Type in the fullscreen editor, then Done | Inline field already holds the typed text; caret restored inline |
| FTE-04 | Back / Escape keeps text | Open editor, type, then Android back / Escape / iOS back gesture | Editor closes, text kept (no discard prompt) |
| FTE-05 | `@mobile` keyboard layout | Cap iOS/Android or mobile Safari: open the editor with the software keyboard up | Panel shrinks to the visual viewport (`--vv-offset-top` / `--overlay-bottom-inset`); header, caret and counter all stay above the keyboard; no double keyboard inset |
| FTE-06 | `@mobile` keyboard show/hide | Toggle the keyboard while the editor is open | Panel height animates between full screen and the above-keyboard frame; no content jump behind the keyboard |
| FTE-07 | Scrolled visual viewport | iOS Safari with the page scrolled inside the visual viewport | Panel top follows `--vv-offset-top`; header never hides under the status bar |
| FTE-08 | Counter | Field with `maxLength` (bio 128, review 1000, bug 1000) | Footer shows `used/max characters`; typing stops at the cap |
| FTE-09 | Close animation | Tap Done | Editor animates out, then unmounts; underlying form unchanged apart from the new text |
| FTE-10 | Disabled / read-only | Field disabled (e.g. translation draft while saving) | No expand control |
| FTE-11 | Desktop shortcut | Focus the fullscreen textarea → `Cmd/Ctrl+Enter` | Editor closes, text kept |
| FTE-12 | RTL | App language العربية | Expand control sits top-left (inline-end); editor header mirrors |

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
| OG-11 | Gender join gate | `genderIsSet` false user taps join/request on a MEN/WOMEN/MIX event | `GenderSetModal` opens; join/request is not sent until gender is saved |
| OG-12 | Gender join resume | Set gender in the join gate sheet | Original join/request proceeds |
| OG-13 | Gender join skipped when set | `genderIsSet` true user joins a gendered event | No extra gender sheet |
| OG-14 | Gender join cancel | Dismiss the join gender sheet | Join/request is not sent |

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
| A-10 | Full registration | All required fields + EULA | Account created, logged in, and landed on **`/welcome`** (§24) — not Home. `Frontend/e2e/specs/auth/register.spec.ts` asserts this |
| A-11 | Validation errors | Submit empty form | Field errors, scroll to first |
| A-12 | Password mismatch | Different confirm | Error on confirm |
| A-13 | Phone format | Phone without `+` | Validation error |
| A-14 | Gender prefer-not-to-say | Without acknowledgment | Blocked |
| A-15 | Primary sport selection | Pick sport at register | Saved on profile; the onboarding Sport step (§24.3) opens with it already selected |
| A-16 | Optional email invalid | Bad email format | Validation error |
| A-40 | Serbia city currency | Register (phone/Google/Apple/Telegram) with auto-assigned city in Serbia | `defaultCurrency` is RSD without opening Profile |
| A-41 | Local city currency | Register with city in a non-euro country (e.g. UK/US/CZ) | Default currency is local (GBP/USD/CZK), not leftover EUR |

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
| A-42 | First city confirm currency | Auto-assigned a non-Serbia city (`cityIsSet` false), pick a Serbia city in CityModal / `/select-city` | `defaultCurrency` becomes RSD; later city changes do not overwrite a Profile pick |

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
| A-26o | Watch rotates twice, phone suspended | Keep iPhone app suspended > 2 access TTLs while `@watch` keeps scoring; then foreground the iPhone | Watch hands each rotated credential back over WatchConnectivity; phone refreshes with the successor and stays signed in (no `auth.refreshReused`) |
| A-26p | Watch proactive refresh on private game | `@watch` idle past access expiry on a **private** game, phone unreachable | Watch refreshes before the request; game/results stay visible; backend `optionalAuth` answers 401 `auth.accessExpired` for an expired bearer instead of a guest 404 |
| A-26q | Logout with queued watch transfers | Log out on iPhone while `@watch` is out of range with pending credential transfers | Watch shows sign-in screen when back in range; no stale token re-authenticates it |
| A-26l | Web refresh cookie missing | Leave a desktop tab open until access JWT expires with no `pp_rt` cookie (`POST /auth/refresh` body `{}` → 400 `auth.refreshTokenRequired`) | Reload sends the user to login; no 401 storm on games / play-intents |
| A-26m | Refresh requires request id | Call `POST /auth/refresh` with a valid cookie/body credential and no `X-Refresh-Request-Id` | 400 `auth.refreshRequestIdRequired`; session is not rotated onto a stable token |
| A-26n | Leftover long JWT rejected | Present a non-`typ=access` JWT after login | 401; user must sign in again (force-update still via Admin App Versions) |

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
| H-41 | Selected date weather card | Pick date on My tab calendar | One card under calendar: eyebrow Today/Tomorrow/Yesterday OR weekday (not both) + day/month left; large temp + weather icon right; single meta line (condition · range · precip>0 · wind>0); tap opens forecast; no second “Today” title under the card |
| H-85 | Day list section title | Pick today, then a non-today date; calendar on then off | Calendar on: day+weather only in `SelectedDateWeatherCard` (no second title under it); List control in calendar header. Calendar off: section title is Today / Tomorrow / Yesterday / short date + calendar expand control |
| H-63 | Empty selected date hint | User with upcoming games on other days → pick a day with no games | Localized "No games on this date" below selected date heading; Upcoming games section still shown |
| H-60 | Calendar weekday headers | My tab or Find calendar with app language set to Russian, then English | Column headers use locale short weekday (ru: 2-letter e.g. пн/вт; en: 3-letter e.g. Mon/Tue), not truncated full names |
| H-80 | Calendar day cell readability | Open My or Find calendar on a ~320px phone viewport with busy days | Day-of-month is fully visible and centered; a tiny hairline sits under the date when the cell has games or weather (hidden on empty days); game count is a small numeral under the date (not covering it); entity types show as color dots; selected day highlights without overlapping neighbors |
| H-84 | My calendar league type mark | Open My calendar on a day with a league game | That day shows the league (blue) type mark; Find still hides league marks unless the League chip is on (F-82) |
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
| H-13a | Accept overlapping PLAYING invite | PLAYING in game A; accept invite to overlapping game B → confirm; repeat and cancel | Confirm: joined B; Cancel: still invited to B, still PLAYING in A |
| H-13b | Notification Accept overlapping invite | PLAYING in game A; tap Accept on in-app invite notification for overlapping game B | Slot-overlap modal; cancel leaves invite pending; continue accepts |
| H-14 | Decline invite | Decline → confirm modal | Invite removed |
| H-15 | Decline with note | Add note in modal | Note posted to game chat (with notifications), then invite declined |
| H-15a | Telegram decline with response | Telegram game invite → Decline with response → send reason (or `/skip` / `/skip@Bot`) | Same as H-15 when reason sent; invite declined and Telegram invite message updated; `/skip` declines without chat message; prompt expires after 10m; Accept/Decline clears pending prompt |
| H-16 | Invite note on game | Save note without accept/decline | Persisted |
| H-61 | Invite cleared after accept from game | My tab invite → open game → accept invite on game page → back to My tab | Invite card gone immediately; second accept not offered |
| H-73 | Full roster hides home invite | Seed pending INVITED row on a game whose PLAYING count equals max participants | Home `home-invites-section` omits the card; header invite badge does not count it; `new-invite` is not emitted while hidden; participant row remains INVITED on the game; game is also absent from the My games list (INVITED-only) |
| H-74 | Leave reopens home invite | From H-73, a PLAYING player leaves so a slot opens | Invite card returns on Home (socket `new-invite` re-adds it to My-tab cache, then refetch); badge increments; invited user receives an invite push |
| H-75 | Accept while roster is full | Pending invite on a full game (e.g. via game page or stale card) → Accept | Does not join over cap; queued (`games.addedToJoinQueue`) or a game-full error; PLAYING count stays ≤ max participants |
| H-76 | MIX_PAIRS gender-full hides invite | MIX_PAIRS game, max 4, 2 PLAYING of the invitee's gender and the other gender still open | Home/badge omit that invite; opposite-gender invite still shown; same-gender leave restores it with push |
| H-77 | Invite survives past end time | Pending invite on a game whose `endTime` passed with `resultsStatus=NONE` (derived `status=FINISHED`) | Invite card still on Home and counted in the badge; Accept still joins |
| H-78 | Invite hidden once results start | Pending invite on a game whose owner starts results entry (`resultsStatus=IN_PROGRESS`), and separately an `ARCHIVED` game | Invite card absent and uncounted in both cases |

### 6.3 My games interactions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-17 | Open game from list | Tap game card | `/games/:id` |
| H-18 | Unread badge on game | Game with chat unread | Badge on card |
| H-19 | Create game entry | Header/FAB create | `/create-game` with entity picker |
| H-20 | Create from calendar date | Select date → create | Pre-filled date |
| H-36 | Selected date shows archived/finished | User with FINISHED and ARCHIVED games on a past calendar day | Select that day on My tab calendar; both FINISHED and ARCHIVED games appear under Finished section |
| H-64 | Same-day start-time order | Day with ≥2 active My games at different times | Active games earliest-first; finished/archived after active |
| H-81 | Pending invite not duplicated in list | User is INVITED-only on a game (not PLAYING / queue / guest) | Invite card in `home-invites-section` (when a slot is open); same game is absent from the My games list and calendar |
| H-86 | Organizer Event/Ad on My | Post Event/Ad as I’m organizing; do not tap I’m going or Need a partner | Listing is on My list and My calendar; organizer is not Going; someone else’s listing without RSVP is absent |

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
| H-38p | Cancellation after club deadline | Expanded booking card less than the club's required cancellation notice before start | Cancel stays visible with the deadline hint. Tap → extra warning states required notice and that cancellation is outside the club's allowed window; Continue → usual cancellation confirmation. No provider request until final confirmation; dismissing either step changes nothing. Within the allowed window, only the usual confirmation appears. If the provider rejects cancellation, retain the card and show an error. |
| H-38o | Verify external booking (My tab / settings / club) | Expanded upcoming booking card, including a slot inside a grouped card | Verify remains available after the cancellation deadline; fresh provider lookup shows a still-booked modal when found. If missing, ConfirmationModal offers removal from Bandeja and linked games while keeping games on the calendar; dismiss changes nothing. Confirm checks again, removes saved links and cached card only, without cancelling externally. Network/auth failures never offer removal; failed link removal keeps the card for retry. |
| H-38m | Padeloo upcoming (My tab) | User connected to Padeloo club (e.g. Avantura) with upcoming reservation | Bookings switch shows Padeloo booking card with provider label; cancel/link actions work |
| H-38n | Klikteren upcoming (My tab) | User connected to Klikteren club (Padel Pro NS) with upcoming booking | Bookings switch shows Klikteren booking card with provider label; cancel/link actions work |
| H-77 | Unlinked booking reminder | Connected user with an upcoming booking that is not fully covered by linked games | Below stories, above Play hero: booked-court cards with link/create/cancel already expanded on the first card; Bookings CTA hidden |
| H-78 | Fully linked booking not in reminder | Upcoming booking whose linked game(s) fully cover the slot | Reminder section absent; compact Bookings CTA still available |
| H-79 | Link fetch failure | Upcoming booking, linked-games request fails | Reminder does not appear; Bookings CTA still available |
| H-58 | My tab list view | My tab → tap Calendar in panel switcher to turn it off | Calendar hidden; UpcomingGamesList sections; preference persists after reload for that user; desktop has no split view; bookings/teams/leagues panel state stays open |
| H-58b | My calendar pref per user | User A sets calendar off → logout → User B (fresh) opens My → logout → login A | A restores off; B defaults on (no leak from A); A still off after B session |
| H-59 | My tab games calendar view | Tap Calendar in panel switcher (first icon) when off | Calendar expands/shown; no List button in calendar header; day selection works as before; desktop uses split view without remounting main content |
| H-59a | Calendar toggle on My | My tab with zero games, or only FINISHED/ARCHIVED | Calendar switch still available; calendar mounts only when switch is on |
| H-64 | Calendar weather toggle | My tab calendar expanded → tap cloud/sun icon in header | Icon highlights; day cells show a compact weather caption (small icon + muted temp) under date/type marks, not a floating high-contrast badge; date select/filter unchanged |
| H-65 | Calendar weather toggle off | With weather mode on → tap cloud/sun again | Entity-type pills return; weather pills hidden |
| H-66 | Calendar weather toggle disabled | User without selected city | Cloud/sun control disabled; no weather requests; entity-type pills unchanged |
| H-67 | Calendar weather mode persists | Enable weather on My tab → reload | Weather mode still active; pills restored after fetch |
| H-67a | Weather month navigation performance | On My and Find, enable weather; load two past months, then repeatedly navigate between them on a phone | Month slides remain responsive with cached hourly weather; day selection and weather badges stay correct. Check a month spanning a daylight-saving change as well |
| H-67b | Month transition separation | On My and Find, navigate months forward/backward, tap arrows rapidly, then reverse direction; repeat with reduced motion enabled | Outgoing grid and heading fade out before the incoming month fades in (100 ms out, 40 ms pause, 280 ms in); no doubled dates, badges, or headings. Latest requested month wins; selected day is preserved/clamped. Reduced motion switches without slide or timed fades |
| H-68 | Selected date weather card | My tab calendar with city → pick date | Unified date+weather card shows temp tile, condition, day range, precip and wind; tap opens day forecast modal without game window; past dates show mm precipitation and archived hourly data |
| H-39 | My tab bookings refresh | Switch away from My tab and back | Upcoming bookings refetched from club booking system |

### 6.6 Attendance glance on my cards

Attendance is a courtesy signal only — a card must never gain urgency chrome because of it (see §9.11).

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| H-AT-01 | Stack on my games | My games card for a game you are PLAYING in | Mini avatar stack with a status dot per player and a `3/4` fraction in the right rail |
| H-AT-02 | No stack when not playing | Card for a game you are not in | No stack, no fraction |
| H-AT-03 | No urgency treatment | Compare a 1/4 card with a 4/4 card | Identical border, background and badges; no red, no "only 1 confirmed!" nudge |
| H-AT-04 | Fraction refreshes in place | Confirm from game details → back to Home | Fraction increased without a reload (card memo includes the prop; a stale value means `rightRailPropsEqual` is missing it) |
| H-AT-05 | RTL | App language العربية | Stack overlaps in the mirrored direction; fraction sits on the correct side |

### 6.7 Monthly recap (story rail)

Generated on the 1st–3rd for the month that just ended. An unshared recap is private — it creates no story row (see `docs/domains/stories.md`).

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| RC-01 | Recap bubble | 1st–3rd of a month, player with ≥2 finished games last month | Bubble at the very front of the story rail, before **Your story**: sky→violet gradient ring (not the pink/violet conic story ring) + sparkle glyph |
| RC-02 | Month label locale | Same, app language ru / ja / ar | Label reads "Your Sep recap" with that locale's month name, never an English one. `@manual` |
| RC-03 | Pulse once | Open Home, scroll the rail away and back | Bubble pulses once on first appearance, then stays still; no re-trigger |
| RC-04 | Reduced motion | OS Reduce Motion on | No pulse at all. `@manual` |
| RC-05 | Survives empty social rail | Player with no followers and no follows | Rail hides its social bubbles but the recap bubble is still shown |
| RC-06 | Viewed state | Open the recap, close it | Bubble gone from the rail; the month is still under Profile → Statistics → Recaps (`PR-RC-01`) |
| RC-07 | Offline | Go offline, tap the bubble | Bubble is absent or inert; never a half-open black screen. `@manual` |
| RC-08 | Themes + RTL | Light / Dark / Classic / Premium; then العربية | Ring legible in all four; in `ar` the rail mirrors and the recap bubble sits at the start (right) edge |
| RC-10 | Viewer chrome | Tap the bubble | Full-screen reel, one progress bar per slide; right half advances, left half goes back; advancing past the last slide closes |
| RC-11 | Press and hold | Hold anywhere | Playback pauses and the active bar freezes; release resumes from where it stopped |
| RC-12 | Gestures | Swipe down; swipe left/right | Down closes; left/right move between slides |
| RC-13 | Web keys | `←` / `→` / space | Previous / next / pause. `@manual` |
| RC-14 | Close control | Inspect the close button in en and ar | Top **end** corner (right in en, left in ar), ≥44 px, never overlapping the progress bars |
| RC-15 | Screen reader | VoiceOver / TalkBack through the reel | One-line description per slide as it becomes active ("14 games played in September 2026"). `@manual` `@a11y` |
| RC-16 | Reduced motion viewer | Reduce Motion on | No auto-advance; a **Next** button appears near the bottom; every chart draws in its final state. `@manual` |
| RC-20 | Cover slide | Open any recap | Avatar, name, month ("September 2026"), one chip per sport played; a Premium member's cover is gold instead of sky→violet |
| RC-21 | Games slide | Check a month starting on a Sunday (Feb 2026) and one starting on a Friday | Count counts up from 0 in ≤600 ms; 7 × N dot calendar in whole weeks; played days glow, unplayed dim |
| RC-22 | Wins slide | Open a month with decided games | Radial ring draws to the win percentage over ~500 ms; win count counts up inside; percentage below in the locale's percent format |
| RC-23 | Level slide | Month where the level rose; then `ar` | "3.9 → 4.1" plus a mini sparkline; in `ar` the arrow points the other way |
| RC-24 | Level slide, negative month | Month where the level fell | Caption reads "Level moved to 3.8" — neutral, no red, no down arrow, no "you dropped". Product requirement, not a style preference. `@manual` |
| RC-25 | Best partner | Month with a repeat partner | Partner avatar, name, "5 wins together with Ana" and the chemistry chip (§14.2). No chemistry baseline → no chip at all, never a confident `0` |
| RC-26 | Streak / club / outro | Continue through the reel | Streak: flame + consecutive weeks counting up, personal best only when higher than the current streak. Club: avatar (or building glyph), name, games played there. Outro: "See you on court in October" + **Share with followers** and **Save image** |
| RC-27 | Missing data | Month with no club or no partner | That slide is simply not in the reel — never an empty shell |
| RC-28 | Legibility | 375 px width, every slide | Full-bleed, one accent colour, captions legible over the gradient. `@a11y` |
| RC-30 | Multisport | Player who finished games in two sports last month | Sport tab strip under the progress bars; selecting a sport re-scopes the reel, cover/streak/outro stay in both, progress bars re-count and playback restarts at slide 1; each tab ≥44 px and mirrors in `ar` |
| RC-31 | Low-activity variant | Player with 0–1 finished games last month but activity in the previous 90 days | Exactly three slides: cover, "1 game in September", outro. No games calendar, no win ring, no level slide |
| RC-32 | Low-activity outro | Same, tap the primary action | Primary is **I want to play**, not Share; it closes the reel and opens the play-intent compose sheet on Home. **Save image** is still offered |
| RC-40 | Share sheet | Outro → **Share with followers** | Bottom sheet lists the slides as rows: coloured thumbnail, short label, checkbox |
| RC-41 | Sensitive default | Month where the level fell | Everything ticked except the level row, which carries an "Off by default" hint. `@manual` |
| RC-42 | Untick all | Clear every checkbox | **Share** disables |
| RC-43 | Preview strip | Tick / untick boxes in any order | One coloured tile per ticked slide, updating immediately, always in reel order |
| RC-44 | Share | Tap **Share** | Success toast, sheet closes; a story with exactly the ticked slides (as images, in reel order) appears in the player's own rail and in a follower's rail. `@two-user` |
| RC-45 | Shared story behaves normally | Open the shared story | Expires after 24 h like any story; likes, comments and replies work. `@manual` |
| RC-46 | Re-share narrower | Share the same month again with fewer slides | The previous reel disappears from the rail; only the new slides remain. `@two-user` |
| RC-47 | Selection remembered | Reopen the share sheet after sharing | The previously shared slides are the ticked ones |
| RC-48 | Back gesture | Android/iOS back with the sheet open | Sheet closes; the reel behind it stays open. `@manual` |
| RC-49 | Share failure | Network off → **Share** | Error toast; sheet stays open with the selection intact |
| RC-50 | Save image | Tap **Save image** | Button reads "Preparing image…" while the card renders |
| RC-51 | Save image mobile | Native share sheet | PNG card with the month, name, headline numbers and the Bandeja wordmark. `@manual` |
| RC-52 | Save image web | Web | Downloads `bandeja-recap-2026-09.png`. `@manual` |
| RC-53 | Cancel is not failure | Dismiss the native share sheet | No error toast. `@manual` |
| RC-54 | Card language | Switch app language, save again | Card text, month name and number formats follow the app language. `@manual` |

Push: `PN-RC-01`–`PN-RC-03` in §18.8. Archive: `PR-RC-01`–`PR-RC-05` in §13.4.

---

## 7. Find tab (`/find`)

### 7.1 Views & date navigation

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-01 | Calendar view default | Open Find | Calendar + games |
| F-81 | Find calendar day cell readability | Open Find calendar on a ~320px phone viewport with busy days | Same as H-80: date fully visible; hairline under the date only when the cell has games or weather; count and type dots sit under the date without covering it |
| F-02 | List view | Tap List in Find calendar header | Calendar collapses; weather toggle hidden; upcoming games from today grouped by date |
| F-03 | List → calendar | Tap Calendar in collapsed header | Calendar expands; day-filtered games |
| F-45 | Find calendar weather toggle | Find calendar expanded → tap cloud/sun icon | Weather pills on forecast days replace entity-type pills; filters and day selection unchanged |
| F-46 | Find selected date weather card | Find calendar → pick date | Unified date+weather card shows day range; tap opens day forecast modal |
| F-04 | Month calendar expand | Open month picker | Range changes |
| F-05 | Go to today | Header action | Jumps to current date |
| F-06 | Desktop calendar split | `@desktop` | Split layout |
| F-37 | Overflow month day select | Navigate month → tap gray adjacent-month cell with game count badge | Games for that day appear in list |
| F-38 | Selected date weather card | Select date on Find calendar (mobile + `@desktop` split) | Unified date+weather card with Today/Tomorrow/Yesterday + weather; updates when another date selected |

### 7.2 Category filters (chips)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-07 | Games filter | Toggle games | Only games shown; other entity chips stay off |
| F-08 | Training filter | Toggle training | Training events |
| F-09 | Tournament filter | Toggle tournaments | Tournaments only |
| F-10 | Leagues filter | Toggle leagues | League seasons |
| F-86 | Entity chips multi-select | Toggle Games then Tournaments | Both chips stay on (`aria-pressed=true`); list/calendar show games OR tournaments; Training/Leagues/Other Events remain off; tapping Games again leaves Tournaments on |
| F-83 | Entity chip type dots | Open Find filters (Game / Tournament, League / Training, full-row Other Events) | Two-column rows then a full-width Other Events chip; each chip shows a color dot matching calendar day marks: game whitish, tournament red, league blue, training green, events indigo |
| F-87 | Events out of default list river | Open Find list with Other Events chip off and city has upcoming EVENTs | List river does not include EVENT rows; **Events** poster rail is below the calendar (desktop: games column), titled Events not “this week”; one EVENT is a full-width poster row, two or three use a horizontal carousel |
| F-91 | Events on idle calendar | Open Find calendar with all entity chips off and a day has an EVENT | That day shows an indigo EVENT mark; selected-day list includes the EVENT poster |
| F-88 | Events chip on | Toggle Other Events chip | Chip `aria-pressed=true`; river shows **APPROVED** EVENTs as full-width poster cards (large image, sport, level band, price, going/looking, no type glyph, no 3/4 slots); poster rail hides; occupancy/slots filter does not hide events; suitable rating / level still apply |
| F-89 | Pending events hidden | City has an `ON_APPROVE` EVENT | Non-owner non-admin Find (rail + Other Events chip) does not show it; owner and `isAdmin` can see it with a pending badge |
| F-89 | Events chip empty | Other Events chip on alone with no matching events | Empty copy “No events found”; event cards are posters (no Join to play / n/max slots) when events exist |
| F-90 | Events rail See all | Open Find with Other Events chip off and upcoming EVENTs | Tap **See all** on the Events rail; Other Events chip turns on (`aria-pressed=true`); rail hides; river shows event posters |
| F-11 | User-created filter | Toggle user games | Filters creator |
| F-12 | Combined filters | Entity chips + panel toggles | Entity chips OR each other; panel filters AND with that union |

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
| F-CLB-01 | Club chip chevron | Open the club list in the advanced panel | Each club chip has a trailing chevron. Tapping the chip **body** toggles the filter; tapping the chevron opens `/clubs/:id` (§27) |
| F-CLB-02 | Chevron accessible name | Screen reader over twenty chips | Each chevron's name includes its own club name |
| F-CLB-03 | Chevron RTL | App language العربية | Chevron sits on the correct side and points the correct way |

### 7.4 Game discovery actions

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-24 | Open game details | Tap card | Navigate to game |
| F-25 | Quick join from Find | Join button on card | Joined + toast + navigate |
| F-76 | Find overlapping join confirm | PLAYING in game A; Find join on overlapping game B (after card confirm) | Slot-overlap modal; continue joins B |
| F-77 | Find overlapping join cancel | Same as F-76 → Cancel | Stay on Find; not in B |
| F-78 | Find overlapping queue join | PLAYING in game A; Find join-queue on overlapping full game B | Queue confirm only (no slot-overlap modal); added to B queue; still PLAYING in A |
| F-26 | Join queue | Full game with queue | Added to queue toast |
| F-79 | Card join after slot ended | Card for a game whose `startTime`/`endTime` passed with `resultsStatus=NONE` | Join button still rendered and joins successfully |
| F-80 | Card join hidden once results start | Card for a game with `resultsStatus` `IN_PROGRESS`/`FINAL`, and one with `status=ARCHIVED` | Join button absent in both cases |
| F-27 | Join blocked no name | `@P5` join attempt | Name gate modal |
| F-28 | Trainers list section | Training filter on | Trainers carousel visible; hint “tap a trainer to filter” |
| F-29 | Empty find results | Filters with no match | Empty state |
| F-37 | Trainer without slots filters | Training filter → tap trainer chip body (no count badge) | “Trainings by …” banner; list empty with trainer-specific no-slots message |
| F-38 | Trainer avatar opens profile | Training filter → tap trainer avatar (with or without slots) | Player card opens; trainer filter unchanged |
| F-30 | Change city from header | Find header city button → `CityModal` | Tall bottom sheet opens (search hero + Near me + Map; no Cities/Clubs switch); dismiss via X / handle drag / outside (no Cancel footer) |
| F-84 | City selector scroll stays open | Open city selector → scroll the country/city list; pan the map | Sheet stays open; scrolling/panning does not dismiss; only handle drag / X / overlay closes it |
| F-85 | City selector keyboard sizing | Open city selector → focus search (Capacitor / mobile web software keyboard) | Sheet shrinks to sit above the keyboard; search, title, and close stay visible; results remain scrollable; dismiss keyboard restores tall sheet |
| F-59 | Change-city no mode switch | Open change-city sheet from Find header | No Cities/Clubs toggle; browse is country → cities only |
| F-60 | Change-city via club search | Open change-city → search club name → tap club | Commits that club’s city immediately (no Confirm); sheet closes |
| F-61 | Change-city search hero + Suggested | Open change-city with empty search | Suggested is top of every browse list (countries and cities), then the rows; scrolls away with the list |
| F-62 | Belgium / microstates in city picker | Change-city → browse/search Belgium, Andorra, Luxembourg, Monaco, Malta, Liechtenstein, San Marino, or Iceland | Country appears; cities with clubs open (e.g. Brussels, Andorra la Vella) |
| F-31 | Filter button active state | Apply any advanced filter | Filter button highlighted |
| F-32 | Favorite trainer highlight | `@user with favoriteTrainerId` + training filter | Favorite trainer games emphasized on calendar |
| F-33 | Gender-restricted game card | MEN/WOMEN/MIX game | Gender badge on card |
| F-34 | Join blocked wrong gender | User gender incompatible (`genderIsSet` true) | Error toast with men/women/mix copy; join blocked; not the unset prompt |
| F-76 | Join gated gender unset | `genderIsSet` false user joins a gendered Find card | Gender sheet before join; after save the original join proceeds |
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
| F-49 | Find load stable under socket noise | Open Find (calendar + list) while unrelated My/game room socket bumps arrive; then burst-update a game present only in the month index | Calendar day counts and upcoming list do not flash empty or refetch wholesale; cached cards patch in place. Index correctness refreshes are coalesced per month key, wait for any active page/continuation walk, and produce at most one active refresh plus one queued refresh |
| F-50 | Find filter list/calendar parity | Apply entity + slots + suitable rating (+ optional private/no-rating) toggles | Day badge counts match the filtered games shown for that day; list view applies the same filters |
| F-51 | Find progressive enrichment | Open Find cold; wait for cards then badges/weather/notes | Cards paint before notes/weather/reactions; enrichment failure leaves list intact |
| F-52 | Find busy-city progressive index | Busy city month with >300 public games, including a synthetic >5,000-row month; delay/fail page 2, switch months mid-load, and test a very large page chain | Month fetch is indexOnly (dayIndex badges, no month card dump). Page-1 badges paint without awaiting page 2; continuation pages de-duplicate and merge in the background. Retryable page failure keeps page 1/truncated state, retries its cursor, then performs at most one delayed cursor resume (never page 1); permanent 4xx/cursor failures do not auto-resume. Month placeholders never start continuation work. Repeated cursors, unmount/identity changes, 12 continuation pages, or 12s stop safely while still truncated; only the terminal page clears truncation. Selected day remains day-scoped |
| F-66 | Find calendar keeps archived history | Busy city month with hundreds of ARCHIVED on early days and live games late | Early-day badges still reflect archived city games via dayIndex; selecting today/late day still lists live games via day-scoped fetch (not blank) |
| F-67 | Find empty day settles empty | Select a day with no games (dayIndex count 0); or force day-scoped `[]` with `hasMore=false` | List shows empty for that day (month no longer supplies card fallback). If day-scoped `hasMore=true` and empty, keep day authority + Load more |
| F-68 | Find city-TZ day bucket | Device TZ ≠ city TZ; open Find for a city day that has early-morning UTC games | Day badges and selected-day list include those games (bucketed/filtered in city TZ, same as API bounds) |
| F-69 | Find calendar type pills from dayIndex | Busy city month: badges/pills driven by dayIndex only | Late-day cells still show entity-type pills (GAME/TRAINING/…), not badge-only empty cells |
| F-82 | League mark only with league filter | Find calendar on a busy month with league games; league chip off, then on | Off: no league (blue) type mark on day cells; On: league marks appear on days that have leagues |
| F-72 | Find calendar unread + my-game pills (indexOnly) | User is participant / has unread on a game; open Find calendar | Day cell still shows unread dot and participant-type pill (from dayIndex + unread store), not only when month cards were loaded |
| F-53 | Find warm view / month + day prefetch | Open calendar, switch to list (and back); flip to prev/next month; tap adjacent day after the selected day has painted; change a filter or receive a socket refresh while the visible month is paging | ±1 selected days warm immediately after visible month/day settle. Inactive view + adjacent months wait for idle and never start while the visible list/month is fetching or the visible month index is continuing. Prefetches must not cancel or delay the selected-day card fetch |
| F-73 | Find seed empty day from dayIndex | Month indexOnly settled; select in-range day with dayIndex count 0 | Day list settles empty via seed (no sticky false-empty for out-of-range D±1); never seeds from keepPreviousData month placeholder |
| F-74 | Find day list not blocked by month index | Calendar visible; month index still pending or slow; select a day that day-scopes to `[]` (or settles with cards) | Day list shows empty/cards — not endless skeleton; pull-to-refresh still works while a fetch is in flight |
| F-79 | Find day cards leave skeleton after settle | Open Find so weather + calendar occupancy paint; day `/games/available` 200s in Network | Cards (or empty/retry) replace skeletons as soon as the day page is in cache — list must not stay on skeletons while occupancy is already showing |
| F-80 | Find adjacent-day prefetch still paints | Open Find (skeletons visible ok); tap another day in the same week, then a day after next week | Same-week days must show cards/empty (not stay on skeletons because ±1 was prefetched). Far day also paints; after that, returning to the first week still paints |
| F-75 | Find day load error + retry | Calendar; force day-scoped `/games/available` to fail with no cached day page (offline, 5xx, or >~4s) | Within ~4s×2 (one auto-retry), empty shows load-failed + Retry (not “no games”); Retry refetches that day. Settled empty day that later fails a background refetch keeps “no games”, not error |
| F-54 | Find structural filters server-align | Toggle club / entity / hide BAR / level band / available slots | Results match prior UX; filter changes refetch with new hash (not silent client-only discard of a fat payload) |
| F-55 | Find selected-day detail under truncate | Busy month; pick a late-month day | Day list comes from day-scoped fetch (complete for that day / load more), not from month cards |
| F-56 | Find day switch no wrong-day flash | Calendar: tap day A then day B quickly | No wrong-day cards; while day fetch resolves, loading — not previous day’s cards |
| F-57 | Find old app on new BE (enrich) | Store build that omits `format=card` against current API | Notes/weather/reactions still present on Find cards (inline enrich); month still capped ≤300 |
| F-58 | Find calendar LEAGUE_SEASON day bound | Open calendar; pick a day that is not the season’s startTime day | That day’s list does not show the LEAGUE_SEASON; it only appears on its actual calendar day (list/upcoming may still show shells) |
| F-63 | Same-day start-time order | Day with ≥2 active games at different times (e.g. 19:00 and 20:00); calendar selected day + list view | Active games list earliest-first (19:00 above 20:00); finished/archived remain after active |

#### 7.4b Card pills from enrichment

`GameCard` is shared by Find, Home and My tab, so run each row on all three. Every pill below arrives through the card enrichment pipeline (`registerAvailableGamesEnricher`) — an enrichment failure must leave the card intact (`F-51`).

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| F-SO-01 | Spot opened pill | A visible game loses a PLAYING participant | Within 2 h its card shows a sky-tinted **Spot opened** pill with a small dot. `@two-user` |
| F-SO-02 | Dot pulses twice | Watch the pill, then scroll the list | Dot pulses twice (1.2 s per cycle) then holds still; it must not restart on scroll. `@manual` |
| F-SO-03 | Reduced motion | OS Reduce Motion on | Dot static from the first frame; the join button does not shimmer. `@manual` |
| F-SO-04 | Screen reader | VoiceOver / TalkBack over the pill | Reads "A spot opened 2 minutes ago" — a localised relative time. The dot itself is never announced. `@manual` |
| F-SO-05 | Join sweep once | First paint of the pill, then re-render / scroll | Join button sweeps once (~240 ms) and never again |
| F-SO-06 | Window closes | More than 2 h after the event | Pill gone; card sorts normally again |
| F-SO-07 | Sorting | Two pilled and several un-pilled cards in one day group | Pilled cards float to the top of their day group on Find, Home and My tab; two pilled cards keep start-time order between themselves; un-pilled keep start-time order below |
| F-SO-08 | Results lock the pill | Game with `resultsStatus !== NONE` that freed a seat minutes ago | No pill |
| F-SO-09 | Themes + RTL | Light / Dark / Classic / Premium; then العربية | Legible in all four; pill and dot mirror with the row |
| F-CS-01 | Per-head price | Game priced `Total 40 €` with 4 seats | Info row reads "≈ 10,00 € per player" |
| F-CS-02 | Divides by seats, not roster | Same game with only the owner joined | Still divides by the seat count — the card answers "what will this cost me if I join?" |
| F-CS-03 | Total on long press | Long-press the price on touch; hover on desktop | "Total 40,00 € · 4 players" revealed, and present as the accessible name |
| F-CS-04 | Exact after final | Finished, priced game | The `≈` is gone; the figure matches the frozen share |
| F-CS-05 | No price, no row | Game with no price | No price element on the card |
| F-WX-01 | Rain pill | Outdoor game within 48 h over the rain threshold | Amber pill in the tag row: rain-drop icon + percentage in the locale's format |
| F-WX-02 | Wind pill | Wind-driven risk | Wind icon + speed, in slate |
| F-WX-03 | Screen reader | VoiceOver / TalkBack over the pill | "Rain likely, 70 percent at 19:00" (or the wind equivalent) — not a bare number |
| F-WX-04 | Tooltip | Long-press the pill; then short-tap it | Long press shows "Forecast for 19:00" and fades after a couple of seconds; a short tap does not open it and the card's own tap target still works |
| F-WX-05 | Kept as planned | Organizer chose **Keep as planned** (`GD-WX-20`) | Pill is neutral grey and reads "Playing rain or shine" |
| F-WX-06 | Silence | Indoor games; games >48 h out; games under the threshold; games with no forecast | **No** pill in every case — never a "weather unavailable" pill |
| F-WX-07 | Tag row not collapsed | Card whose only tag would be the weather pill | The tag row still renders |
| F-WX-08 | Calendar cells unchanged | Month calendar with day weather on | Day cells unchanged; no weather pill was added to them |

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
| C-14w | Edit reservation actions | Edit integrated game | With linked bookings: keep current, change time only, unlink (3 chips, no scroll) — **use existing**, **reserve new**, and **game only** hidden until links are fully removed and saved; change-club gate + lock badge; tapping locked club selects Unlink and opens club picker. Time only does not change courts. After unlink save: use existing / reserve new / game only shown (unavailable actions hidden, not greyed out); picker only for use existing |
| C-14x | Edit unlink save | Edit → Unlink reservation → Save | Consequence warns club reservation stays active + policy; confirm before save; club picker unlocked so a new club can be chosen on the same unlink save |
| C-14y | useExisting hidden without reservations | Integrated club; connected; selected date has no club bookings | **I already have a booking** intent not shown (not blank strip / empty-state card) |
| C-14z | Edit multi-court shared slot hint | Edit integrated game → Reserve new; 2 courts; no intersecting slots | Amber hint: try different courts, date, or duration |
| C-24 | Date/time | Change start + duration | End time updates |
| C-25 | Level range slider | Adjust range | Min ≤ max |
| C-26 | Max participants (tournament/league) | Change tournament or league roster count | Roster options update within user cap |
| C-49 | Game match format only | Create GAME on padel/tennis | No participant-count grid; 1v1/2v2 selector sets roster to 2 or 4 |
| C-50 | Game fixed roster | Create GAME singles then doubles | Roster slots and `maxParticipants` follow format (2 ↔ 4) |
| C-27 | Fixed pairs segmented switch | Create GAME doubles → pick Rotating or Fixed pairs | Team setup shown when Fixed pairs selected |
| C-27t | Tournament match format + fixed pairs | Create TOURNAMENT → pick participant count cards → 1v1/2v2 then Rotating/Fixed pairs | Same controls as GAME; roster cards unchanged; Fixed pairs only when 2v2 |
| C-28 | Game name & miscellaneous | Name input inside Name & photo card at top; description and price in Miscellaneous section | Saved on submit; description has the fullscreen expand control (`FTE-01`…`FTE-12`) |
| C-71 | Authored text auto-translate helper | Open `/create-game` Name & photo / miscellaneous name+description; open `/create-event` name+description | Helper “Automatically translated for players in other languages.” under authored fields; no translation language picker or wait step before create |
| C-72 | Create not blocked by translation | Create GAME/EVENT with name+description while generation is pending or disabled (`GAME_TEXT_LOCALIZATION_GENERATION_ENABLED` off / worker slow) | Create succeeds immediately after DB save; navigates to details; no wait for AI/translations |
| C-73 | Duplicate seeds authored originals | Game with ready localized display ≠ authored name; Duplicate from details | Create form name/description are authored originals only (`authoredGameTextForEdit`); not the viewer’s localized display |)
| C-29 | Price fields | Set price type/currency/total under Miscellaneous | Saved correctly |
| C-30 | Avatar upload | Upload game image via Name & photo card (avatar left of name input) | Preview shown |
| C-31 | Invite players | Open player list → select | Invites sent on create |
| C-31a | Create invite picker omits busy | Date/time/club set; city user is PLAYING in an overlapping Bandeja game | Busy user absent from Search list |
| C-32 | Participants setup tags | Configure setup | Tags on game |
| C-33 | Multiple courts | Enable multi-court | Court count selector |
| C-34 | Submit create | Complete valid form | Game created → details page |
| C-34a | Create overlapping PLAYING confirm | PLAYING in game A; create game B in overlapping slot with Add me on | Slot-overlap modal; continue creates B with creator PLAYING |
| C-34b | Create overlapping PLAYING cancel | Same as C-34a → Cancel | Modal closes; no game created; still PLAYING only in A |
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
| C-59a | Club modal venue city | Open club picker | Header city chip is venue city (not profile browse); empty search lists that city |
| C-59b | Club in another city | Search a club name in another city → pick it | Game city follows `club.cityId`; courts/bookings reset |
| C-59c | Club city picker in-dialog | Open club picker → tap venue city chip | City list covers the same dialog (tappable); Back/Escape returns to clubs, does not close the club modal |
| C-59d | Venue city independent of browse | Hop browse city in chat or invite, then open club picker | Club chip is venue/home, not the browse city |
| C-59e | Club modal card visible | Create/edit → Select Club | Dim overlay and the club dialog card both appear (not overlay-only) |
| C-60 | Location sub-step value pills | Pick date, court, time in location block (create + edit location tab) | Sub-step headers show current selection as right-aligned pill (Date: “Sat, Jul 12”; Court: name or “2/3” in multi-court; Start time: “18:00–19:30”); pill is green when the sub-step is done |
| C-61 | Calendar picker dialog | Tap calendar tile in Date row | Calendar opens as modal dialog with title and close button; picking a date applies it and closes; X, outside tap, or hardware back dismiss without changing the date |
| C-62 | Create game Looking | Set date/time, open invite picker, Looking tab, pick a looking player, create | Looking tab only after date/time; create sends invite with their play intent linked |
| C-63 | No looking chrome | Wallet / team / trainer picker | No Search \| Looking switch |

#### 8.3b Price — per-head preview and payment hint

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-CS-01 | Live per-head preview | Price `Total 40 €` → change seats from 4 to 8 | Preview updates live from "≈ 10,00 € each for 4 players" to "≈ 5,00 € each for 8 players" |
| C-CS-02 | Hidden without a price | Price type `Not known` or `Free` | No preview line and no payment-hint field |
| C-CS-03 | Hint saved on create | Enter "IBAN RS35 …" and create | The hint appears in the settle sheet for participants (`GD-CS-14`) |
| C-CS-04 | Hint length | Type more than 120 characters | Input stops at 120; the remaining-characters counter reaches 0; the API rejects a longer forged value |
| C-CS-05 | Hint edited later | Edit game → Price → change the hint → Save | New hint in the sheet; clearing it removes the copyable field |

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
| C-38a | Inactive players at bottom | Open invite picker; city has an inactive player (`inactive` on player: <5 rated games or no rated game in 90 days) and an active player | Inactive player is listed below active players by default (same flag as Level leaderboard); availability still ranks first |
| C-39 | Booking overlap warning | Booked court conflict | Warning before submit |

### 8.5 Create event (`/create-event`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-64 | Create Event/Ad entry | Header create menu → Event/Ad | Opens `/create-event`; bottom tabs hidden |
| C-66 | Event poster form | Open `/create-event` | Intent chips, kind chips (External tournament / External league / Camp), optional sport if multi-sport, player level, required name (no circular avatar), required hero photos immediately after name, description, city, optional club XOR venue text, date range, price + note, optional registration URL. No public/results/rating/court/template/gender blocks |
| C-67 | Event create required fields | Submit without intent, kind, city, name, or photos | Footer hint; event not created |
| C-68 | Event create success | Fill required fields → Post event | Navigates to `/games/:id`; listing is `ON_APPROVE` (not public); owner sees pending banner; Find/Events strip does not show it to other users |
| C-69 | Event guest blocked | Logged-out open `/create-event` | Redirect to login |
| C-70 | Event organizing vs looking | `/create-event` with kind, level, heroes → Post as Organizing vs Need a partner | Organizing: creator is listing owner only (`NON_PLAYING`, not looking) and the listing **is** on My/calendar. Looking: creator on partner board (`NON_PLAYING` + lookingForPartner); also on My; both land on `/games/:id` |

### 8.6 Repeat (recurring series)

Gated on `VITE_GAME_SERIES_ENABLED` (frontend) and `GAME_SERIES_ENABLED` (backend). With either `false` the whole surface must be absent — no row, no pill, no request (`C-SER-10`). The series page itself is §25.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| C-SER-01 | Repeat row | Create game → Scheduling | A **Repeat** row under Date/Time: `Once · Weekly · Every 2 weeks`, with `Once` selected |
| C-SER-02 | Weekly summary | Select **Weekly**, then change the date to another weekday | Summary line "Every &lt;weekday&gt; at &lt;time&gt;, from &lt;date&gt;", derived from the game's own date and following it |
| C-SER-03 | Biweekly summary | Select **Every 2 weeks** | Summary switches to the "every other" wording |
| C-SER-04 | Until chip | Tap **Until** → pick a date → clear it | Chip opens a date field, then reads "Until 30 Nov" with a clear (×); clearing restores the plain chip |
| C-SER-05 | Summary-bar chip | With a cadence selected, scroll past Scheduling | `CreateGameSummaryBar` gains a **Repeat** chip showing the cadence; it stays visible |
| C-SER-06 | Back to Once | Select **Once** | Summary, Until chip and summary-bar chip all disappear |
| C-SER-07 | Create weekly | Create the game with **Weekly** | The game is created first, then converted (`POST /games/:id/series`). Land on the game; card and details show the `↻ Weekly` pill; `/series/:id` exists with occurrence #1 |
| C-SER-08 | Entity types | Switch entity chips | Repeat row present for GAME, TRAINING and TOURNAMENT; absent for EVENT, LEAGUE and LEAGUE_SEASON |
| C-SER-09 | Owner cap | Owner with 10 active series | **Weekly** and **Every 2 weeks** disabled; helper "You have 10 active series. End one to add another." with a link. `@manual` |
| C-SER-10 | Flag off | `VITE_GAME_SERIES_ENABLED=false` | Repeat row absent; no `/series` request in the network panel |
| C-SER-11 | Keyboard | Focus the segmented control → arrow keys | Moves between the three cadence options |
| C-SER-12 | RTL | App language العربية | Repeat row, summary line and Until chip mirror; nothing clipped |

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
| GD-08a | Overlapping PLAYING join confirm | PLAYING in game A; join game B whose time overlaps A | Confirm modal; confirm proceeds; both memberships kept |
| GD-08b | Overlapping PLAYING join cancel | Same as GD-08a → Cancel | Modal closes; still not in B; A unchanged |
| GD-08c | Add-me overlapping PLAYING confirm | Guest/queue on game B that overlaps PLAYING game A; tap Add me | Slot-overlap modal; confirm becomes PLAYING on B; cancel leaves B unchanged |
| GD-09 | Leave game | Leave → confirm | Removed; local game chat thread purged so background sync does not keep hitting 403 |
| GD-09a | Leave chat only | Guest/non-playing leave chat from details | Chat access removed; local game chat purged |
| GD-10 | Decline pending invite | From participants | Invite declined |
| GD-11 | Join queue | Full game | Queue position shown |
| GD-12 | Owner accept queue | Accept queued user | User becomes participant |
| GD-13 | Owner decline queue | Decline queued user | Removed from queue |
| GD-14 | Cancel own queue request | Cancel queue | Removed |
| GD-15 | Invite players | Owner opens player list → invite | Pending invites shown |
| GD-148 | Invite modal tabs | Owner opens invite picker | Search is the default tab; Looking tab shows a live looking-count badge (including 0) |
| GD-149 | Looking rank + gray | Looking tab with mixed fits | Full matches first; misses dimmed with a mismatch line; still selectable |
| GD-150 | Looking invite reserves | Invite an OPEN looking player | Pending invite; their intent becomes MATCHED; they drop off Looking live |
| GD-151 | In-a-match invite | Invite a player badged “In a match” | Invite sends; their lobby match is not stolen; toast that they’re already in a match |
| GD-152 | Empty Looking | No live play intents in the browse city | Looking tab still visible, badge 0, “Nobody’s looking in {city}”, Search still works |
| GD-153 | Invite browse city | Open invite picker Search/Looking | City chip shows Home city; lists are that city only |
| GD-154 | Invite hop city | Tap city chip → pick another city | Search and Looking reload for that city; profile Home city unchanged |
| GD-155 | Invite nearby people | Browse city has 0 name hits; nearby city has the person | Grouped Nearby section; View city sets browse city |
| GD-156 | Invite city picker pins Home | Browse another city → open city chip | “Your city” is profile Home; picking it returns the lens to Home without `switchCity` |
| GD-157 | Invite city picker back | Open city picker from invite → Back / Escape | Picker closes; invite modal stays open |
| GD-158 | Invite modal card visible | Owner opens invite picker | Dim overlay and the invite dialog card both appear (not overlay-only) |
| GD-15a | Invite search Cyrillic→Latin | Open invite list; type Cyrillic prefix of a Latin-named player (e.g. `ив` for Ivan) | Player stays in results after debounce (does not flash then vanish) |
| GD-15f | Invite search Serbian Latin via Russian Cyrillic | Open invite list; type `Анджела` or `Дьерманович` for Andjela Djermanovic (or `Спринцхунас` for Polina Sprinzhunas) | Player remains in results after debounce; same person is still visible in the unfiltered city player list |
| GD-15b | Invite search clear | Open invite list; type 2+ chars so results update; clear the search field | List stays mounted (no full-modal spinner); default invitable list restores after debounce |
| GD-15c | Invite picker omits busy | Open Search invite list for a timed game; city user is PLAYING in another overlapping Bandeja game | Busy user is absent from the list; INVITED-only or non-overlapping PLAYING users still appear |
| GD-15e | Invite inactive at bottom | Open invite picker; one player is rating-inactive | Inactive player sorts below active players by default (same `inactive` flag as Level leaderboard) |
| GD-15d | Invite search keeps focus | Open invite picker → type in Search | Caret stays in the field after each character; search field is not replaced by the list spinner |
| GD-16 | Cancel invite | Owner cancels pending | Invite removed |
| GD-16a | Expired invite outcome | Let a pending invite expire → open player list | Player appears under invite responses with “Invite expired”, not “Invite cancelled” |
| GD-17 | Guest join chat only | Join as guest | Chat access without full join |
| GD-18 | Carousel vs list participants | Toggle view mode | Layout switches |
| GD-225 | Spots-left copy matches badge | Open a LEAGUE_SEASON (or any game) with 21/72 PLAYING in ru/sr | Header badge is `21/72`; remaining copy shows 51 (not hardcoded 1); progress bar matches 21/72 |
| GD-18c | Long carousel names | Show adjacent players with long Latin/Cyrillic names (e.g. Daniil Gabidullin, Наталья Красильникова, Alexander Plyaskin), including Premium members, on narrow and desktop screens | Slots grow to fit names from 64px up to 128px; longer names wrap within the cap without touching adjacent names; horizontal scrolling remains available and avatars/badges stay centered together |
| GD-18a | Invite not in game chat | Owner invites player from participants list | Pending invite on participants panel; no "X invites Y" system message in game chat; other participants get no chat/push notification for the invite |
| GD-18b | Invitee/guest roster chat | As INVITED or GUEST, others join / decline / accept / leave | No join/decline/accept/leave system messages in game chat, chat list, push, or Telegram; normal user messages still appear |
| GD-148 | Organizer add unset gender | Owner invites/adds a player with `genderIsSet` false to a gendered event | Player is not added; toast that they haven't set gender (not the wrong-gender copy) |
| GD-149 | Organizer self-add gender unset | Unset organizer taps add-me / join on their own gendered event | Gender sheet; after set, add/join proceeds |
| GD-150 | League assign unset gender | Owner assigns an unset player to a gendered league round | Player is not assigned; toast that they haven't set gender (not the wrong-gender copy) |
| GD-204 | Invite after start time passed | Game whose `startTime` is in the past and `endTime` in the future (derived `status=STARTED`), `resultsStatus=NONE` | Invite CTA still shown; invite sends and creates a pending invite; no "after the game has started" error |
| GD-205 | Join after slot ended | Game whose `endTime` has passed with `resultsStatus=NONE` (derived `status=FINISHED`) | Add-me / join-queue CTAs still shown and succeed; API does not return the archived-or-finished error |
| GD-206 | Invite blocked once results start | Owner starts results entry (`resultsStatus=IN_PROGRESS`) → open participants | Invite, add-me, join-queue and manage-users actions all absent; direct API invite returns the results-started error |
| GD-207 | Manage users blocked once results start | Open Manage users on a game with `resultsStatus` `IN_PROGRESS` or `FINAL` | No kick / promote / revoke / transfer-ownership / set-trainer actions offered; direct `POST /games/:id/{kick-user,add-admin,revoke-admin,set-trainer,transfer-ownership,accept-join-queue,decline-join-queue}` returns the results-started error |
| GD-208 | Roster still frozen on archived game | Game with `status=ARCHIVED` and `resultsStatus=NONE` | Invite / join / manage actions absent; API returns the archived error |
| GD-152 | Broken player avatar on team slot | Game details participants / fixed-team slot whose avatar CDN URL 404s (tiny and/or full) | Initials (or blank initials circle) shown; no broken-image / iOS "?" glyph |
| GD-153 | Empty participant slot unchanged | Game with an open/guest slot (no user) | Dashed User placeholder or invite plus; no "?" glyph |
| GD-154 | Valid player avatars still load | Game details team list with working avatar URLs | Photos shown; not forced to initials |

### 9.2b Cost split

A ledger, not a payment system: no money moves in the app. The only value transfer is the existing in-app coin `TRANSFER`, which is optional and off until an admin sets `COINS_PER_CURRENCY_UNIT`. Gated on `COST_SPLIT_ENABLED` / `VITE_COST_SPLIT_ENABLED`.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-CS-01 | Hidden without a price | Game with `Price type = Not known` | No Cost card anywhere on the General tab; no `/cost-shares` request in the network log |
| GD-CS-02 | Hidden for a free game | `Price type = Free` | No Cost card |
| GD-CS-03 | Hidden for a team price | Game priced `Per team` | No Cost card — a team price yields no game total |
| GD-CS-04 | Shows for a total price | 4-player game priced `Total 40 €` | Cost card: "Total 40,00 €", four rows of 10,00 €, the payer's avatar in the header |
| GD-CS-05 | Per-head rounding | 3-player game priced `Total 10 €` | Rows read 3,33 / 3,34 / 3,33 — the extra cent sits on the payer's row and the rows sum to exactly the total |
| GD-CS-06 | Viewer row pinned | Open as a non-payer participant | Your row is first and highlighted; the wide **I paid** button sits under the list |
| GD-CS-07 | Payer has no settle button | Open as the payer | No **I paid**; your own row reads **Settled** |
| GD-CS-08 | Mark paid outside the app | **I paid** → **Outside the app** | Sheet closes; toast "Marked as paid"; chip cross-fades to **Marked paid**; no coins leave your wallet |
| GD-CS-09 | Coins hidden by default | **I paid** with `COINS_PER_CURRENCY_UNIT` unset in Admin | Only **Outside the app**; no coin button exists |
| GD-CS-10 | Coins appear with a rate | Admin → Platform Settings → Cost Split → `100` → reopen the sheet | **Send N coins** with the correct coin count and your balance |
| GD-CS-11 | Coins hidden when unaffordable | Rate set so the share costs more coins than you hold | Coin button absent (not merely disabled) |
| GD-CS-12 | Settle with coins | Tap **Send N coins** | Coins move to the payer via the normal P2P transfer; toast "N coins sent · settled"; the row turns **Settled** and tints green for ~600 ms; the Wallet shows "Game share · &lt;game&gt;" |
| GD-CS-13 | Insufficient coins is clean | Spend the balance down in another tab, then settle | Error toast; the share is **not** marked paid; retrying after topping up works and does not double-charge. The share row is claimed before the transfer and handed back untouched on failure |
| GD-CS-14 | Payment hint copyable | Payer sets "How to pay you"; participant opens the sheet | Hint at the top with a copy button; copying shows "Copied" |
| GD-CS-15 | Received toggle | Payer ticks **Received** on a player's row | That row turns **Settled** for both users within a second (socket `game-cost-updated`); the summary strip counts up. `@two-user` |
| GD-CS-16 | Participant cannot self-confirm | Participant inspects their own row | No **Received** checkbox; the API rejects a forged request with 403 |
| GD-CS-17 | Summary strip | Organizer view with 3 of 4 settled | "3 of 4 settled · 10,00 € outstanding" plus **Remind unpaid** |
| GD-CS-18 | Remind unpaid | Tap **Remind unpaid** | Toast naming how many were nudged; the button disables and the cooldown caption appears |
| GD-CS-19 | Cooldown survives a reload | Nudge → reload → reopen the card | Button still disabled; cooldown caption still shows the remaining hours |
| GD-CS-20 | Edit share override | Organizer → pencil on a guest's row → keypad → 5,00 → Save | That row reads 5,00 €; the other rows absorb the difference; the rows still sum to the total |
| GD-CS-21 | Split remainder off | Same with `splitRemainderEvenly` off | The other rows keep the plain even split; the sum is deliberately below the total |
| GD-CS-22 | Keypad vs keyboard | `@mobile` focus the amount field in Edit share | Sheet lifts against the visual viewport; Save stays above the keyboard; nothing clipped. `@manual` |
| GD-CS-23 | Roster change re-splits | Before any result is entered, a fifth player joins | Amounts drop to a fifth each; a quiet "Shares updated" caption shows for ~5 s |
| GD-CS-24 | Leaver drops out | A player leaves before the game | Their row disappears; the remaining rows re-split the whole total |
| GD-CS-25 | Substitution inherits the share | A player marks paid, then the organizer substitutes them out | The substitute holds the row **and** its "Marked paid" state; the outgoing player has no row. `@two-user` |
| GD-CS-26 | Freeze at final | Enter results to FINAL and reopen the card | Lock chip with the "Shares fixed at final score" tooltip; no pencil; amounts no longer move when the roster is touched |
| GD-CS-27 | Coins-settled row never moves | Settle with coins, then add a player before FINAL | The coin-settled row keeps its exact amount; only unsettled rows re-split |
| GD-CS-28 | Deep link to the section | `/games/:id?section=cost` | Card scrolls into view; the query parameter is stripped |
| GD-CS-29 | Deep link to the sheet | `/games/:id?settle=1` as an unpaid participant | "How did you pay?" opens; the parameter is stripped so a refresh does not reopen it |
| GD-CS-30 | Reminder push | Set `costFrozenAt` more than 24 h in the past and run the hourly sweep | One push per unpaid player, in their language, with the amount in the game's currency; tapping opens the game. `@manual` |
| GD-CS-31 | Reminder survives a restart | Run the sweep → restart the backend → run it again | No second push for the same game (the dedupe is persisted, never an in-memory `Set`). `@manual` |
| GD-CS-32 | Flag off | `VITE_COST_SPLIT_ENABLED=false` | No Cost card, no Wallet Owed sections, no per-head price on cards (§7.4b), no cost requests at all |
| GD-CS-33 | Reduced motion | Reduce motion on → change a chip state | Chip switches instantly; the green settle flash is skipped; the deep-link scroll jumps rather than smooth-scrolls |
| GD-CS-34 | Themes | Light / Dark / Classic / Premium | Chips, the green settle tint and the lock chip stay legible |
| GD-CS-35 | RTL | App language العربية | Rows, chips, the amount column and the sheets mirror; nothing overlaps |
| GD-CS-36 | Profile payment defaults draft | Profile → payment defaults: add a method, wait, type a handle, then Save; repeat with Cancel or a failed save | Blank input stays visible while typing; only Save sends the validated list; Cancel restores saved defaults; failed saves and profile refreshes preserve the draft |
| GD-CS-37 | Tracker viewer access | Open a priced game as PLAYING, non-playing OWNER/ADMIN, and platform admin; repeat as queue member, invitee, GUEST, ordinary NON_PLAYING, stranger and signed-out user | Only the first three groups see the tracker. Excluded viewers make no cost request and see no loading/error card. Authenticated excluded users receive 403 from direct cost endpoints, even with an old share |
| GD-CS-38 | League season excluded | Open a priced LEAGUE_SEASON as owner and platform admin, including via `?section=cost&settle=1`; then open its priced LEAGUE fixture as a playing participant | Season has no tracker or cost request; direct season cost endpoints return 404, sync creates no shares, and existing season records do not appear in Wallet or reminders. Fixture tracker works normally |
| GD-CS-39 | Access after leaving | Open a priced game as PLAYING, then move to a non-playing status without an organizer role, including after shares freeze | Tracker disappears; old share does not grant access through the API or Wallet cost entries |

Wallet side: `PR-CS-01`–`PR-CS-05` in §13.3. Cards: `F-CS-01`–`F-CS-05` in §7.4b. Create/edit: `C-CS-01`–`C-CS-05` in §8.3b.

### 9.3 Edit game (owner/admin)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-19 | Edit general info | Edit drawer → general tab | Nearly fullscreen bottom drawer (city-selector style drag handle + close); "Edit details" title; fit-content centered tabs (active tab shows icon+label); avatar and name on one row; name/description updated |
| GD-116 | Edit game info drawer height | Open edit on mobile viewport | Drawer uses most of viewport (`~94dvh`), not a small centered dialog; footer actions sit above home-indicator safe area |
| GD-151 | Edit game name above keyboard | `@mobile` Edit details → focus game name with software keyboard (iOS Capacitor visualViewport) | Name field and close stay on-screen and tappable; sheet height shrinks to `--overlay-pinned-max-height` (visual viewport frame, including offsetTop) instead of translating the full overlay off-screen |
| GD-20 | Edit location & time tab | Edit modal → Location & time | Single tab replaces Where+When; club picker visible; one scheduling panel (date, courts, time grid); no bookings/time segmented switch |
| GD-20b | Edit opt-out full schedule | BOOKTIME game, integrated court, toggle "Don't book real court" ON (or Don't select court) | Full club time grid; red external cells selectable and saveable; same as create-game opt-out |
| GD-20a | Edit game change club | Edit modal → Location & time → change club | Club modal opens; new club selected; courts refresh for new club |
| GD-20c | Edit club modal sport filter | TENNIS game → edit Location & time → open club modal | Only TENNIS-capable clubs listed |
| GD-20d | Edit legacy club kept | TENNIS game at club no longer supporting TENNIS → edit Location & time | Current club still shown in picker; user must change club or pick compatible court |
| GD-20e | Edit court grid sport filter | TENNIS game at multi-sport club → edit Location & time | Court grid shows TENNIS + null-sport courts only; courts API called with `sport=TENNIS` |
| GD-20f | Edit prunes incompatible courts | Multi-sport game with padel court saved → club gains sport tags → reopen edit modal | Incompatible court selections cleared when modal opens |
| GD-20g | Edit sport mismatch rejected | API: update game `clubId` or `courtId` to sport-incompatible venue | 400 with sport mismatch message |
| GD-20h | Edit settings tab | Edit drawer → Settings (gear) tab | Settings always expanded (no collapse chevron, no gear title icon); hints button only; toggles save in place; footer shows "saved automatically" note + Close only, no Save |
| GD-21 | Edit with linked bookings | Game with 2 linked courts at BOOKTIME club → edit Location & time | Keep current: read-only linked list; **use existing** / **reserve new** / **game only** hidden; change-club gate visible; club row shows Linked lock |
| GD-21a | Edit add booking link | Edit game with 0 links → select reservation card | Schedule syncs from selected booking; save links game |
| GD-21b | Edit partial unlink | Game with 2 linked courts | Partial deselect is not offered while links exist; Unlink removes all links, then a later edit can re-link fewer courts |
| GD-21c | Edit shared reservation | Reservation card shows other linked games | Informational only; user can still link this game |
| GD-22 | Edit unlink last booking | Edit → Unlink reservation | Pending unlink hint; after save manual time grid available; amber hint that club booking stays active; save asks confirm unlink |
| GD-22a | Edit unlink save confirm | Edit modal → unlink reservation → Save | Confirm modal warns real booking is not cancelled; save unlinks only |
| GD-22b | Edit switch linked booking | Game linked to booking A → edit location/time | Cannot pick booking B or book new while A is still linked; Unlink + save, then edit again to link B / book new; game no longer shows stale "Fully booked" for A |
| GD-22c | Edit club locked while linked | Game with linked bookings → Keep current or Time only | Club row shows lock (still tappable); tap selects Unlink and opens club picker; Unlink CTA on gate does the same without opening picker |
| GD-22d | Edit fewer courts after unlink | 16-player tournament previously on 4 linked courts → unlink + save → edit → select 3 courts → link or reserve | Save succeeds with 3 courts; does not demand 4; game shows Fully booked (not partial) |
| GD-22e | Edit time only keeps courts | Game with 3 linked courts → Time only | Date/time controls shown; court grid hidden so linked courts cannot drift |
| GD-22f | Edit unlink club change needs courts | Linked game → Unlink → pick a different club → Save without courts | Blocked: must select at least one court |
| GD-23 | Edit price | Price tab | Price type shown as vertical radio list with icons; amount + currency row appears only for paid types; price fields updated |
| GD-108 | Edit modal save gating | Open edit modal, change nothing, then edit name | Save disabled with no changes; after edit an "Unsaved changes" hint appears in footer and Save enables |
| GD-109 | Edit modal discard confirm | Change any field → close via X / swipe dismiss / Cancel | "Discard changes?" confirm shown; Keep editing returns to drawer with edits intact; Discard closes without saving |
| GD-23 | Edit level range | Level modal | Min/max saved |
| GD-24 | Edit max participants | Max participants modal | Capacity updated; GAME modal shows 1v1/2v2 only (no current/maximum summary) |
| GD-24t | Edit tournament match format / fixed pairs | TOURNAMENT → edit participants setup | Modal keeps participant cards; shows 1v1/2v2 + Rotating/Fixed pairs; save updates `playersPerMatch` / `hasFixedTeams` |
| GD-25 | Edit game format | Format wizard (pre-results) | Format updated |
| GD-25a | Tournament Round Robin persists | TOURNAMENT → format wizard → Round Robin → Done → leave and reopen game | Still Round Robin (`matchGenerationType` / `gameType`); does not snap back to Americano |
| GD-95 | Format summary for read-only viewer | Open padel game pre-results as participant without format edit rights, or non-participant who can view the game | “What kind of game?” picker hidden; format card shows title + summary (includes gender label when not Any); tap help icon expands full format details; no pencil; no gender row below card |
| GD-96 | Format picker for editor | Open same game as owner/admin or `resultsByAnyone` playing participant | “What kind of game?” picker shown; can change template / format |
| GD-82 | Fixed pairs roster section | Open padel game with fixed pairs enabled, 4+ even roster, no results | Standalone Fixed Pairs card below format; team slots editable; no toggle in format card |
| GD-83 | Fixed pairs section hidden | Same game after results start, or `hasFixedTeams` off, or odd roster | Fixed Pairs card absent |
| GD-77 | Non-default match format display | Game with padel singles or tennis doubles | Format section summary + expanded details show non-default match format |
| GD-26 | Edit blocked after results final | `@finished` | Edit disabled |
| GD-209 | Edit still open after start time passed | Game past `startTime` (or past `endTime`) with `resultsStatus=NONE` | Settings card, GameInfo pencils, format section and multi-court selector all still editable; save succeeds |
| GD-210 | Settings blocked once results start | Owner starts results entry → reopen details | Settings card and inline info pencils gone; direct `PUT /games/:id` changing a locked field (time, court, price, maxParticipants, visibility) returns the results-started error |
| GD-211 | Locked field echoed unchanged is allowed | With `resultsStatus=IN_PROGRESS`, `PUT /games/:id` sending locked fields at their current values plus a results/format field | Request succeeds; only the results/format field changes |
| GD-212 | Pending invites survive editing a past unscored game | Game past `endTime`, `resultsStatus=NONE`, one pending invite → owner edits any setting (e.g. name) and saves | Invite stays pending in the receiver's inbox and in the participants list; the game is not flipped to `FINISHED` by the edit |
| GD-213 | Players-on-court card appears during results entry | Owner starts results entry (`resultsStatus=IN_PROGRESS`) on a non-BAR game | "Players on court" card lists every PLAYING participant with a Substitute button and a hint that the roster is otherwise frozen |
| GD-214 | Card hidden when not applicable | View the same game as a non-owner, or with `resultsStatus` `NONE` / `FINAL`, or on a BAR game | No "Players on court" card and no Substitute button |
| GD-215 | Substitute an injured player | During results entry tap Substitute on a player → pick a replacement who is not on the roster → confirm | Two-step modal (pick replacement, then confirm) shows out/in names and the three consequences; on confirm a toast appears, the substitute is PLAYING and the outgoing player is no longer on court |
| GD-216 | Substitute inherits recorded results | Score at least one match, then substitute a player from that match | Every match, including the already-scored one, now lists the substitute; the outgoing player has no rating change or standing for the game; roster size is unchanged |
| GD-217 | Substitute keeps the fixed-team slot | On a `hasFixedTeams` game with rounds generated, substitute one player | The substitute occupies the same team slot; team names and the other slots are untouched; results still render |
| GD-218 | Substitution rejected outside the results window | Call `POST /games/:id/substitute-participant` with `resultsStatus` `NONE`, `FINAL`, and on an `ARCHIVED` game | Returns the not-started, results-final, and archived errors respectively |
| GD-219 | Substitution validation | Attempt to substitute a non-playing user, a user already playing, the same user for themselves, or the trainer of a TRAINING game | Each returns its specific error and no roster change occurs |
| GD-220 | Substitution refused for league games | Open a LEAGUE fixture (or league season) with `resultsStatus=IN_PROGRESS` as owner; also call the endpoint directly | No "Players on court" card is shown, and the endpoint returns the league-not-supported error; league standings for the fixture are unchanged |
| GD-221 | Everyone's results board updates after a substitution | Two viewers with the game results open; owner substitutes a player | Both boards show the substitute in every match without a manual refresh or reopen |
| GD-222 | Substitute is notified | Substitute in a player who was not previously in the game | The incoming player receives the join notification and sees the game in their list with the chat history available |
| GD-223 | Leaving is blocked once results start | As a PLAYING non-owner in a game with `resultsStatus=IN_PROGRESS`, look for the leave action and call `POST /games/:id/leave` directly | No leave card is shown; the direct call returns the results-started error and the participant stays PLAYING with results intact |
| GD-224 | Leaving reopens after undoing results | Undo results back to `resultsStatus=NONE`, then leave the game | Leave card is available again and leaving succeeds |
| GD-27 | Archive/cancel game | Owner cancel flow | Status archived/cancelled |

### 9.4 Results & scoring

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-28 | Enter set results | Results tab → enter scores | Saved locally + server |
| GD-28a | Manual score draft survives refresh | In regular results and a league fixture card, open a set, enter 6:4 slowly using keypad/steppers; trigger a game/results refresh (e.g. another editor saves a different match), then Save | Neither score resets; Save persists 6:4. Repeat with Automatic Americano points, super tiebreak and extra Balls: selected mode/units and scores survive. Applies to manual entry, not live scoring |
| GD-28b | Manual score draft lifecycle | Edit an open set while saved results refresh; Cancel and reopen; then open a different match/set | Open draft stays intact; Cancel does not save; reopened and different match/set dialogs initialize from their latest saved values |
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

### 9.8 Event listings (`entityType=EVENT`)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-159 | Event details landing | Open `/games/:id` for an EVENT | Poster landing (`EventDetailsContent`), not `GameDetailsShell`; full-width hero slideshow from `eventHeroes` only (no circular-avatar fallback); 32px tappable dots; fullscreen swipe gallery; kind + sport + level, name, organizer, dates, venue, price, description; no results, live, bets, courts, trainer, Game Settings, slot 3/4, or “Join to play”; bottom Find/Chats tabs hidden |
| GD-160 | Event going | Logged-in tap I’m going | Viewer is Going (`PLAYING`); sticky CTA selected; tap Going again does not leave; Going row with level badges (not 3/4 slots); appears on My/calendar while OWNER, Going, or Looking |
| GD-161 | Event looking / partner board | Tap Need a partner; optional note; another user opens the event | Looking XOR Going (switching allowed); partner board above Going with avatar, name, Bandeja level for `game.sport`, Message (DM); composer on Need partner; save via looking note |
| GD-162 | Empty partner board | EVENT with nobody looking | Copy: “Need a partner for this? Post here. People will see your Bandeja level.” |
| GD-163 | Event register URL | EVENT with `externalUrl` | Sticky Register opens the external URL (new tab / Capacitor Browser) |
| GD-164 | Event no results | EVENT past endTime | No results entry, live scoring, or FINAL photos-after-results; time-archives after end |
| GD-165 | Event kind chip copy | Camp / external tournament / external league EVENT | Chip is Camp / External tournament / External league — never bare Tournament or League |
| GD-166 | Event share | Share sticky CTA | Same share-link pattern as game details (native share or copy) |
| GD-167 | Event owner edit/delete | Owner opens EVENT → edit listing / cancel | Edit modal has kind, sport, level, name, then ≥1 hero, description, city, venue, dates, PriceSection + note, url; cancel/delete confirm uses `gamesApi.delete` |
| GD-168 | Event desktop chat split | `@desktop` open EVENT as Going or Looking | Listing left, existing game chat right; non-RSVP viewers get listing only (no empty chat pane); `/games/:id/chat` works; no new chat type |
| GD-169 | Event pending visibility | Create EVENT as non-admin; open Find as another user; open `/games/:id` as owner and as other user | New listing is `ON_APPROVE`; owner (and `isAdmin`) can open details with pending banner; other users get not-found; Events rail / Events chip do not show it |
| GD-170 | Event admin approve / decline | `isAdmin` opens pending EVENT | Approve and Decline buttons; each opens a confirmation modal; Approve → `APPROVED` and listing appears in Find for everyone; Decline → `DECLINED`, still only owner/admin can open it |

### 9.9 Game text localization

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-171 | Localized title/description (API ready) | Game with ready translation for viewer locale; open details | Header/description show localized text; pending translation shows authored original without a progress hint, then updates in place when ready; no blocking spinner/toast for players |
| GD-172 | Show original toggle | Game with ready translation; open details → tap `Translated · Show original` | Title and description switch to authored originals together; control becomes `Original · Show translation` |
| GD-173 | Show original session memory | After GD-172, leave details and reopen the same game (or remount) | Still showing originals; choice not reset by remount or background `localizedText` refresh |
| GD-174 | Omit badge when untranslated | Game whose display equals original (same language / not needed) | No Translated/Original toggle; no pending hint while translation work is in progress |
| GD-175 | Event localized listing + toggle | EVENT with ready translation; open poster details | Title/description localized; quiet toggle switches both; edit listing still uses originals |
| GD-176 | Edit forms seed originals only | Game with ready `localizedText` differing from authored name/description; open Edit details / Event edit listing | Name and description inputs show authored originals only (never localized display); helper “Automatically translated…”; when details would show a translation, label “Original text”; save uses existing update |
| GD-177 | Organizer Translations panel | Owner/admin opens Edit details (or Event edit listing) → Translations | Bottom sheet on mobile / dialog on desktop; language list statuses Ready/Edited/Updating/Needs review/Retry/No translation needed; Keep original name control present |
| GD-178 | Organizer correction save | In Translations → pick a language → edit name or description → Save | Correction applies immediately; status becomes Edited; players see correction for that locale |
| GD-179 | Use automatic translation | Edited language → Use automatic translation | Correction cleared; automatic text (or original while pending) shown; regular players cannot open Translations / PATCH |
| GD-180 | Translation conflict toast | Two organizers; A saves a correction; B saves stale expected revision | B gets conflict; draft kept; panel reloads latest source for review |
| GD-181 | Failed translation player fallback | Game whose `localizedText` field state is `failed` (retries exhausted or hard fail) for viewer locale; open details / Find card | Shows authored original; no player error toast or blocking UI; organizer panel may show Retry for that language |
| GD-182 | In-place ready update via focus/refetch | Open details while translation pending; leave app backgrounded or blur then refocus (or reconnect) so details refetch returns ready `localizedText` — without relying on the pending poll or `game-text:invalidate` | Localized text replaces original in place (no overlay); expanded description/scroll/focus preserved; polite a11y “Translation updated”; if Show original was on, stays on originals |
| GD-183 | Offline Show original from cache | With ready `localizedText` cached, open `/games/:id` while offline (`G-07`) → tap Show original | Cached display still usable; toggle switches title+description to originals without requiring network |
| GD-184 | Keep original name in every language | Organizer enables Keep original name → save; viewers in other locales open details/cards | Name stays authored original in every language; description still uses automatic/pending rules; panel shows name-preserved hint |
| GD-185 | Organizer Retry failed language | Translations → locale with Retry status → Retry | Retry queues immediately (toast); status moves toward Updating/Ready; no full game re-save required |
| GD-186 | Needs review after source change | Correct a locale → change authored name/description that invalidates that correction → reopen Translations | Locale shows Needs review + hint; stale correction not served to players; fresh automatic (or original while pending) shown |
| GD-187 | Details language switch refetch | Open game details → change app UI language | Details refetch `localizedText` for the new locale; title/description follow new language (or original while pending); Show original session choice for that gameId still respected |
| GD-188 | Chat preferred language isolated | Set chat preferred incoming-translation language ≠ app UI language; open game details / Find with ready game-text translation | Game name/description follow app UI language only; chat preference does not change game-text display |
| GD-189 | Arabic UI lang + dir=auto + long title | App language العربية; open details for a game whose original is LTR (e.g. English) and a ready Arabic translation; also a very long localized title on `@mobile` card + details | Shell stays `dir=rtl`; game title/description nodes use `dir="auto"` and `lang` when showing translation; original/other-script text does not force wrong bidi; long titles wrap/truncate within existing card/header layout (no horizontal page overflow) |
| GD-190 | Selection-deferred text update | Open details with pending translation; select/highlight title or description text; allow `localizedText` to become ready while selection is active; then clear selection | Display does not yank/replace text while selected; after selection ends, ready translation (or deferred update) applies in place |
| GD-191 | Clear field clears localized display | Owner clears description (or name) in Edit details → save; other viewer opens details / Find | Cleared field no longer shows prior translated text (`empty_source` / null); name clear keeps entity/format fallbacks (`G-58`); no stale localized prose |
| GD-192 | Translations locale layout | Owner → Translations → pick a language; compare `@mobile` vs `@desktop` (wide) | Original and translation stack vertically on mobile; side-by-side (`lg:grid-cols-2`) on desktop |
| GD-193 | Private + pending Event access unchanged | Private game with ready `localizedText`; pending (`ON_APPROVE`) EVENT with localized projection | Non-invitees still cannot Find/open private game; non-owner/non-admin still cannot open pending EVENT (`GD-169`); localization does not leak listing or details |
| GD-194 | Open/join not blocked by translation | Open public game and join while `localizedText` pending or generation disabled | Details open and join/RSVP complete normally; no gate, spinner, or error waiting on translation |
| GD-195 | Calendar/ICS uses displayed text | Game with ready translation and `timeIsSet`; open details → Add to calendar / ICS / Google / native; then tap Show original and add again | Event title and description notes use the same displayed name/description as the details header (localized first; authored originals after Show original); includes game link; does not wait for AI |
| GD-196 | Share/copy uses displayed text | Same game → Share (native sheet or copy fallback); repeat after Show original | Share title/text (or clipboard payload) uses currently displayed name/description plus game link; EVENT sticky Share matches (`GD-166`) |
| GD-197 | Pending details capped poll | Stay on game details (`GameDetailsShell`) while `localizedText` is pending and online; do not leave or manually refresh; wait for worker to publish | Shell polls `GET /games/:id` about every 3s (max ~20 attempts); when ready, title/description update in place (same UX as GD-182); poll stops once ready/failed/offline/hidden |
| GD-198 | Live `game-text:invalidate` on details | Stay on pending game details with socket connected; translation publishes and server emits `game-text:invalidate` for this game/locale | Client invalidates locale caches and refetches details; localized text appears in place without leave/refresh; no translated body in the socket payload |
| GD-199 | Nested season on LEAGUE details | Open LEAGUE fixture details whose parent season has ready localized season name; also open LEAGUE_SEASON details with ready localized season name | Header shows league name + localized season name (same as cards `G-57`); pending uses authored season name |
| GD-200 | Organizer panel polls while Updating | Open Translations while a locale is Updating or Retry; stay on panel online until worker finishes | Panel quiet-polls editor status (~3s, capped); status moves to Ready/Edited without closing; no full-page refresh required |
| GD-201 | Correction while automatic Updating | Locale Updating → Save a name/description correction before AI finishes | Correction applies immediately (Edited); players see override for that locale; later automatic publish does not overwrite the correction |
| GD-202 | Edit not blocked by translation | Edit details / Event edit listing → change name or description while `localizedText` pending or generation disabled → Save | Save succeeds immediately (existing update path); no wait/spinner for AI; returns to details with authored text; translations catch up in background |
| GD-203 | Title-only Show original placement | Game (and EVENT) with ready translation but empty description | `Translated · Show original` sits directly below the title (not beside a Description heading); with a description present, control stays by the description heading (`GD-172` / `GD-175`) |

### 9.10 Series occurrence surfaces

An occurrence is an ordinary game; only these extra surfaces are new. Flag-gated with §8.6 and §25.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-SER-01 | Part-of line | Open an occurrence, signed in and signed out | Quiet line "Part of *Tuesday Regulars* · week 12" **directly under the game title**, navigating to `/series/:id`. Visible to guests too — it carries only the public card label. The week number is 1-based and increments per occurrence |
| GD-SER-01b | Series links row | Open an occurrence as a member | Below the organizer strip: **Open series** and **Open series chat**. The chat link creates the channel on the owner's first tap and opens the existing one for a regular |
| GD-SER-02 | Organizer strip | Owner opens an occurrence while a next occurrence exists | Strip reading "Next: Tue 1 Oct" and "3 of 4 regulars confirmed", with a check badge on each confirmed avatar |
| GD-SER-03 | Strip is live | With the strip open on user A, user B taps **I'm in** on the next occurrence | A's counter and B's badge update without a reload (socket `game-series-confirmations-updated`), with a 200 ms scale spring. `@two-user` |
| GD-SER-04 | Skip next | **Skip next** → confirm "Skip Tue 1 Oct?" | The game for that date is removed and a toast says "Next week skipped"; the series keeps running |
| GD-SER-05 | Edit series | **Edit series** | Repeat sheet prefilled with the cadence, weekday and read-only time |
| GD-SER-06 | Make weekly entry point | Game settings on a one-off game with `resultsStatus === 'NONE'`, as owner; then on an occurrence | **Make this a weekly game** shows only in the first case and disappears once the game is part of a series |
| GD-SER-07 | Regulars toggles | Repeat sheet → **Regulars** | The current PLAYING roster with a "Keep as regular" toggle each, defaulting on. Turn one off, save, check `/series/:id` → Regulars |
| GD-SER-08 | Seat-deadline stepper | Move the stepper to both ends | Steps between 24 / 48 / 72 hours only; − disabled at 24, + at 72; the value is announced (`aria-live`) |
| GD-SER-09 | Horizon helper | Read under "Save series" | "We create the next game 14 days ahead…" |
| GD-SER-10 | Keyboard contract | Open the Repeat sheet on a device, focus the Until date field | Header stays pinned, body scrolls, "Save series" stays above the keyboard. `@manual` |
| GD-SER-11 | Apply-to sheet | Edit an occurrence → Save | **Apply to** offers "This game" / "This and future games"; "This game" just closes |
| GD-SER-12 | Apply to future | Choose "This and future games" when some future occurrence already has results | An **inline** amber note inside the sheet names how many occurrences will keep their current details, visible before Apply; after Apply, one toast with the number updated. The lock is `resultsStatus !== 'NONE'`, never `Game.status` |
| GD-SER-13 | Carry-over card | After an occurrence reaches FINAL, open it as a regular who played | Full-width card at the top: "Same time next week?" with **I'm in** and **Skip** |
| GD-SER-14 | I'm in | Tap **I'm in**, then reload | Button morphs into a green check "You're in for Tue 1 Oct", toast "Seat kept", card collapses after ~1.2 s; it does not come back |
| GD-SER-15 | Skip records nothing | Tap **Skip** | Buttons replaced by the footer note "Your seat opens to others on Sun 29 Sep". Nothing is recorded server-side and no seat is ever reserved — the deadline is display copy, not a job |
| GD-SER-16 | Reduced motion | OS Reduce Motion on | Morph and collapse happen instantly; the check badge does not spring. `@manual` |
| GD-SER-17 | One card on Home | Home → My games with several unanswered finished occurrences | The card appears once, for the most recent unanswered occurrence — never a stack |
| GD-SER-18 | Offline | Tap **I'm in** with the network off | Pending state; the mutation completes when connectivity returns. `@manual` |

| GD-SER-19 | Push shade answer | Receive the "Same time next week?" push on a real device (iOS and Android) | Two buttons, **I'm in** and **Skip**. Tapping either answers without opening the app and replaces the card with "Seat kept" / "your seat opens to others". `@manual` |
| GD-SER-20 | Push body tap | Tap the push body instead | Opens the **finished** occurrence, where the in-app card is. `@manual` |

Push and Telegram: `PN-SER-01`–`PN-SER-02` in §18.8.

### 9.11 Attendance card

**The property every case in §9.11–§9.14 tests is that nothing moves.** Answering, not answering, being nudged and being noted as a no-show must never change a seat, a queue position, a game status, a level, a reliability value or a rating uncertainty. If a case makes something move on the roster it is a bug, not a nuance.

No feature flag. Eligibility is `timeIsSet` + `resultsStatus`/start time — **never** `Game.status`.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-AT-01 | Card present | Open a game with a time set, starting in the future, where you are PLAYING **and are not the owner** | Directly under the game info block: "Are you coming?" with **I'm coming** (filled sky) and **Not sure yet** (outline), each ≥44 px |
| GD-AT-01b | Owner is never asked | Open a game **you created** and are PLAYING in | No "Are you coming?", no buttons and no "Can't make it at all?" — only the organizer strip. Your own avatar still carries a green confirmed dot and you are inside the "x of y confirmed" numerator: a 4-player game you organize can read 4/4 |
| GD-AT-02 | Required caption | Read under the buttons | "Just so the organizer knows. Your seat is yours either way." — required copy; a missing caption fails the case |
| GD-AT-03 | Confirm | Tap **I'm coming** | Buttons collapse into one row "You're confirmed" with a green check and a **Change** text button; toast "Seat confirmed 👍"; the height change takes ~220 ms |
| GD-AT-04 | Change | Tap **Change** | The two buttons return with the same 220 ms transition; the previous answer is kept until you pick again |
| GD-AT-05 | Not sure | Tap **Not sure yet** | Row reads "You're not sure yet" in amber; toast "Noted. You can confirm later." |
| GD-AT-06 | Roster untouched | Compare the roster before and after every answer | Same players, same order, same `x/y` in the participants header, your seat still yours. `@manual` |
| GD-AT-07 | Can't make it at all | Tap "Can't make it at all?" → Cancel | Opens the **existing** leave-game confirmation; cancelling leaves the attendance answer untouched |
| GD-AT-08 | Persisted | Reload | The answered state is restored from the server |
| GD-AT-09 | No time set | Game with `timeIsSet` false | No attendance card at all; no attendance request in the network tab |
| GD-AT-10 | Closed after start | Game whose `startTime` has passed, and a game with `resultsStatus` `IN_PROGRESS`/`FINAL`, and an ARCHIVED game | No card in any of them. Note the gate is start time + `resultsStatus`, not `Game.status`: a game created *after* its own start time keeps `status: 'ANNOUNCED'`, and it must still refuse an answer |
| GD-AT-11 | Offline | Airplane mode → **I'm coming** | Dashed outline with "Saving…", an offline hint under the caption, nothing blocks. Back online → the answer syncs or rolls back with an error toast. `@manual` |
| GD-AT-12 | Reduced motion | OS Reduce Motion on | States swap instantly with no height animation |
| GD-AT-13 | RTL | App language العربية | Whole card mirrors: icon on the right, Change on the left, nothing clipped |
| GD-AT-14 | Themes | Light / Dark / Classic / Premium | Green / amber chips and the sky primary all keep 4.5:1 text contrast |

### 9.12 Roster attendance dots

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-AT-20 | Dots on avatars | Look at the PLAYING avatars in the carousel | Small dot on the lower-trailing corner: green with a check (confirmed), grey empty ring (no answer), amber "?" (not sure) |
| GD-AT-21 | Dots in list view | Switch the participants view to the list | Same dots on the list rows |
| GD-AT-22 | Only PLAYING | Inspect the trainer (`NON_PLAYING`), queue and invited rows | No dot on any of them |
| GD-AT-23 | Never colour-only | Screen reader over each dot | Reads its own label: "Confirmed", "No answer yet", "Not sure yet", "Noted as a no-show". `@manual` |
| GD-AT-24 | Legend | Press a dot, or the **What the dots mean** button under the roster | A bottom sheet lists all four states, each next to its own dot, and repeats "Your seat is yours either way." Works by tap, right-click, keyboard and screen reader — iOS Safari included |
| GD-AT-25 | Organizer caption | As organizer, read under the progress pill | Caption spells out what each colour means |
| GD-AT-26 | Live | Player B taps "I'm coming" on a second device | Within a second player A's dot for B turns green without a reload (socket `game-attendance-updated`). `@two-user` |
| GD-AT-27 | Substitute starts blank | Add a substitute after the reminder went out | Grey ring, not a green check |
| GD-AT-29 | Organizer dot | Look at the owner's PLAYING avatar, in your own game and in someone else's | Always the green confirmed dot, even though they never tapped anything. An owner who is `NON_PLAYING` gets no dot at all |
| GD-AT-28 | Rail on a Find card | Join a game, then find it again on the Find tab | The right rail shows the avatar stack and the fraction there too — it is now one of the viewer's own games. A game the viewer has **not** joined never shows one |

### 9.13 No-show notes

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-AT-30 | Roster list in window | As owner/admin, open a game whose **end time** was less than 7 days ago | The attendance card shows each PLAYING player with their dot and an overflow (⋮) |
| GD-AT-31 | Cannot note yourself | Look at your own row | Reads "You (organizer)" with no overflow |
| GD-AT-32 | Confirm dialog is neutral | ⋮ → **Note as no-show** | "Note Ana as a no-show?" with body "They'll get a friendly heads-up and can reply in chat. You can undo any time within 7 days." The confirm button is the **neutral primary** colour. If it is red, the case fails |
| GD-AT-33 | Note + undo toast | Confirm | Row gains a **grey** "No-show" tag; toast "Noted" with an **Undo** action that stays ~8 s |
| GD-AT-34 | Undo | Tap **Undo** | Tag disappears; toast "No-show note removed" |
| GD-AT-35 | Nothing else moves | Check the noted player's card before and after | Seat, roster position and level unchanged. `Shows up` is the only thing allowed to move. `@manual` |
| GD-AT-36 | Neutral chat message | Open game chat | System message "&lt;name&gt; was noted as a no-show" — grey, not red, no exclamation |
| GD-AT-37 | Push opens chat | Noted player receives the push | Push "Noted as a no-show …" opens the **game chat**, not the game info tab. `@manual` |
| GD-AT-38 | Remove note | ⋮ on an already-noted row | Offers **Remove no-show note** |
| GD-AT-39 | Window closed | Game whose end time was more than 7 days ago | No roster list, no overflow; a hand-made request is rejected with `errors.attendance.noShowWindowClosed` |
| GD-AT-40 | League fixture | Repeat on a league fixture, as the **season** owner/admin | Identical behaviour — the note gate carries parent-game permission. `@two-user` |
| GD-AT-41 | Non-organizer | Open as a plain participant | No overflow control anywhere |

### 9.14 Organizer nudge

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-AT-50 | Progress pill | As organizer of a game accepting answers | Pill "2 of 4 confirmed" and a **Nudge** button |
| GD-AT-51 | Pill animates | Another device confirms | Fill animates over ~300 ms without a page reload. `@two-user` |
| GD-AT-52 | Reduced motion | OS Reduce Motion on | Pill jumps to its new width with no spring |
| GD-AT-53 | Nudge | Tap **Nudge** | Toast "Nudge sent"; every player who has not answered gets one push and the game chat gains one system message. Players who already answered get nothing, and neither does the owner. `@manual` |
| GD-AT-54 | Cooldown | Immediately after nudging | Button disabled; caption "Nudge again in 6 h" |
| GD-AT-55 | Cooldown survives a reload | Reload | Still disabled — the cooldown is read back from the `ATTENDANCE_NUDGED` chat system message, not from memory |
| GD-AT-56 | Everyone answered | Nudge with no unanswered players | "Everyone has already answered"; nothing is sent |
| GD-AT-57 | No enforcement controls | Open Game settings | **No** attendance deadline control, **no** auto-release toggle, **no** attendance setting of any kind. If one appears, the case fails |

Player card / profile: `PR-AT-01`–`PR-AT-07` in §13.4. Push and Telegram: `PN-AT-01`–`PN-AT-06` in §18.8.

### 9.14b Attendance on the Apple Watch

The watch asks the same question and posts the same answer through
`POST /games/:id/attendance`. It never shows a deadline, a countdown or a
consequence.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-AT-60 | `@watch` Marker in the list | On the watch, look at a game starting within 24 h that you have not answered | A quiet amber hand icon on the row. No red, no badge count, no urgency |
| GD-AT-61 | `@watch` No marker otherwise | Look at a game you already answered, one you created, one more than 24 h out, and one you are not PLAYING in | No marker on any of them |
| GD-AT-62 | `@watch` Confirm | Open the game on the watch and tap **I'm coming** | The section collapses to "You're confirmed" with a **Change** button; the phone's game details shows the same answer after a refresh |
| GD-AT-63 | `@watch` Not sure | Tap **Not sure yet** instead | "You're not sure yet", same Change button |
| GD-AT-64 | `@watch` Change your mind | Tap **Change** | The answer flips and the count next to it moves. Answering repeatedly is allowed |
| GD-AT-65 | `@watch` Caption | Read under the buttons | "Your seat is yours either way." in the watch UI language (en/es/ru/sr/cs) |
| GD-AT-66 | `@watch` Nothing to ask | Open a game that already started, one without a time, or one you are not PLAYING in | No attendance section at all — and the rest of the screen is unaffected |
| GD-AT-67 | `@watch` `@offline` Answer fails | Turn the watch offline and tap **I'm coming** | The answer does not land and the question stays; no seat, roster or readiness change. Answering again online works |

### 9.15 Queue, auto-fill and the open seat

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-SO-01 | Queue panel | As a queued player, open the game | Panel reads "You're #2 of 3 · Organizer accepts manually" |
| GD-SO-02 | Auto-fill copy is live | Organizer turns **Auto-fill from queue** on | The same panel reads "…Auto-fill is on, you'll be seated automatically" without a manual refresh. `@two-user` |
| GD-SO-03 | Position drops live | A player ahead of you in the queue leaves | Your position drops to #1 live. `@two-user` |
| GD-SO-04 | Non-queued sees nothing | Open as a player who is not queued | No panel |
| GD-SO-05 | Open-spot row | Immediately after a seat frees | A dashed **Open spot** row fades in over 400 ms (instantly under reduced motion); tap height ≥44 px |
| GD-SO-06 | Results lock the panel | Game with results in progress | Neither the panel nor the open-spot row renders |
| GD-SO-07 | Queued player self-promotes | Queued on a game with **Allow players to join directly** on; a PLAYING seat frees; tap Join (or the push's **Join now**) | You become PLAYING through the normal join, gates and overlap confirm included. Auto-fill does not have to be on |
| GD-SO-08 | Queue-only game refuses self-promotion | Same with **Allow players to join directly** off | Join is refused with `spots.queue.waitForOrganizer`; the queue row is untouched and the organizer still has to accept |
| GD-SO-10 | Settings row placement | Open **Settings** on a game you own | **Auto-fill from queue** sits immediately below "Allow players to join directly" |
| GD-SO-11 | Helper copy | With hints on | "First in line is seated when a spot opens. Gender and level rules still apply." |
| GD-SO-12 | Queue count line | With three queued, then with none | Read-only "3 in queue" / "No one waiting yet", matching the queue list exactly |
| GD-SO-13 | Optimistic toggle | Toggle it; then kill the network and toggle again | Optimistic state then a green save tick; on failure the toggle rolls back with an error toast |
| GD-SO-14 | Disabled after results | Game with results started | Toggle disabled |
| GD-SO-20 | Auto-fill seats one | Full game, auto-fill on, two queued; a PLAYING player leaves | Exactly one player is seated (the first in `joinedAt` order); game chat shows "A spot opened (Luka left)" then "Ana was seated from the queue" in the neutral system style; the organizer gets an "Ana joined from the queue" toast; the seated player gets a "You're in!" push. `@two-user` |
| GD-SO-21 | Level gate still applies | First queued player's level is outside the game's range | They stay queued and the **next** qualifying player is seated — auto-fill pre-checks the level range even though a manual organizer accept skips it. `@two-user` |
| GD-SO-22 | Nobody qualifies | No queued player passes the gates | Nobody is seated; the queue gets the ordinary spot-opened push instead. `@two-user` |
| GD-SO-23 | Auto-fill off | Same with the toggle off | Nobody is seated; the queue is only notified |
| GD-SO-24 | Seated banner once | The auto-filled player opens the game | Green **You were seated from the queue** header once, above the attendance card. No confetti. Leaving and re-entering does not show it again |
| GD-SO-25 | Banner degrades | Same when the attendance card is not rendered (results locked, viewer not playing) | Header appears alone or not at all — never half-drawn |
| GD-SO-30 | Trigger coverage | Each of: a PLAYING player leaves; a PLAYING player toggles themselves to not playing; the organizer kicks a PLAYING player; the last held invite on an otherwise-full roster is declined; the organizer raises **max participants** | Exactly one spot-opened event each, and at most one promotion with auto-fill on. `@two-user` |
| GD-SO-31 | Substitution raises nothing | Substitute a player during results entry | No spot-opened event, no notification, no promotion — the seat never becomes free |

Cards: `F-SO-01`–`F-SO-09` in §7.4b. Notifications: `PN-SO-01`–`PN-SO-09` in §18.8.

### 9.16 Weather risk banner

**The property every case in §9.16–§9.18 tests is silence.** An indoor game, a game whose courts cannot be determined, and a game with no forecast must all produce *nothing* — no banner, no pill, no push, and above all no "weather data unavailable" state. A second alert for the same game is a bug unless the severity **class** genuinely rose.

No feature flag; muted per user from notification preferences.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-WX-01 | Rain banner | ANNOUNCED game on an outdoor court starting within 48 h, forecast ≥60 % rain in the game window | Amber banner directly above the game info block: rain icon, class ("Rain likely") and the number and hour ("70 % at 19:00") in your locale's percent and time format |
| GD-WX-02 | Wind banner | Same with a wind-only risk (≥40 km/h, low rain probability) | Slate banner, wind icon, speed in your locale's units. Check Light / Dark / Classic / Premium: amber and slate both keep 4.5:1 text contrast |
| GD-WX-03 | Hourly strip | Look under the headline; then at the very start and end of the forecast range | Exactly four hourly icons centred on the start time, each with its hour; accessible name "Hourly forecast around the start time"; at the range edges it clamps to four real hours rather than rendering blanks |
| GD-WX-04 | Organizer chips | Open as the organizer | **Move indoor**, **Change time**, **Keep as planned** and **Ask the group** — every chip a real `<button>`, ≥44 px, keyboard-reachable, announced with its label |
| GD-WX-05 | Participant chip | Open as a non-organizer participant | The only chip is **Forecast**, opening the existing `GameWeatherDialog` for the game window |
| GD-WX-06 | Change time | Tap **Change time** | `EditGameInfoModal` opens already on the location/time section, not General |
| GD-WX-07 | Ask the group | Tap **Ask the group**; tap again while the first is in flight | A poll "Play in light rain?" with Yes / No posts into the game chat using the normal poll message type, votable like any other. The second tap must not post a second poll |
| GD-WX-08 | Indoor silence | Indoor game with the same forecast | No banner at all. `@manual` |
| GD-WX-09 | Unknown courts | Game with no `Game.court`, no `GameCourt`, a club with no active courts, or an exact indoor/outdoor tie | No banner. Specifically **not** a neutral or "no data" banner |
| GD-WX-10 | Cold forecast cache | Outdoor game in a city whose forecast cache is cold or out of range | No banner, no spinner, no error |
| GD-WX-11 | Reduced motion | Reduce Motion on | Banner appears with no fade, hourly icons with no stagger, collapse is instant; nothing jumps or double-renders |
| GD-WX-12 | RTL | App language العربية | Banner, chips and hourly strip mirror (logical properties only) |
| GD-WX-13 | Live refresh | With the page open, let the 30-minute pass fire (or emit `game-weather-alert-updated` for that game) | The banner re-reads state without a reload. `@manual` |
| GD-WX-14 | Started / finished / no time | Game already started or finished, or with no time set | No banner |
| GD-WX-14b | Card pill hour format | Set the profile to 12 h, then 24 h; look at an at-risk game on Home and Find | The pill's hour follows the account preference, matching the banner — not the locale default |

### 9.17 Move indoor sheet

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-WX-15 | Court list | Tap **Move indoor** | Bottom sheet of the club's **indoor** courts, each row showing the name and either "Free" (green) or "Busy"; rows ≥44 px |
| GD-WX-16 | Not colour-only | Screen reader over the rows | "Court 1, free" / "Court 2, busy" |
| GD-WX-17 | Busy rows disabled | Tap a busy row | Nothing happens; the row is disabled |
| GD-WX-18 | Move | Tap a free court | Applied through the normal edit path; toast "Moved to Court 1"; a system message in the game chat; the banner collapses over ~240 ms. Re-open the game: the court really changed. `@manual` |
| GD-WX-19 | Organizer push shade | Receive a weather alert as the organizer on a real device (iOS and Android) | Two buttons: **Move indoor** (opens the app on the move-indoor sheet) and **Keep as planned** (posts silently, the card is replaced by "Playing rain or shine", the app never opens). `@manual` |
| GD-WX-20 | Participant push shade | Receive the same alert as a participant | One button, **Forecast**, which opens the game's weather section. No keep/move buttons. `@manual` |
| GD-WX-21 | Push body tap | Tap the alert body rather than a button | Opens `/games/:id?section=weather` (organizer: `&action=moveIndoor`), and the params are cleaned out of the URL. `@manual` |
| GD-WX-19 | Nothing free | Make every indoor court busy for that window (another game, a club booking, or a blocking hold) | "No indoor courts free at 19:00" with **Change time** as the only action, opening `EditGameInfoModal` on the time section |
| GD-WX-20 | No indoor courts | Club with no indoor courts | "This club has no indoor courts" plus the same **Change time** fallback |
| GD-WX-21 | External booking warning | Game with a `GameExternalBooking` linked to one of its courts | Warning that the booking is **not** moved and must be changed with the club directly. Confirm afterwards that the external booking is untouched. `@manual` |
| GD-WX-22 | Multi-court | Game with one outdoor and one indoor court | "1 of 2 courts is outdoor"; the organizer moves one court at a time |
| GD-WX-23 | Failure | Kill the network and tap a free court | Toast reports the failure; the sheet stays open; nothing in the game changed |
| GD-WX-24 | Loading / error | While availability loads; then force it to fail | "Checking indoor courts…" in a live region rather than an empty list; a failure shows a retryable error, never an empty state that reads as "no courts" |
| GD-WX-25 | Back gesture | Android hardware back | Closes the sheet without leaving the game page |

### 9.18 Keep as planned

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-WX-30 | Collapse | Tap **Keep as planned** | Banner collapses over ~240 ms to a single grey line "Playing rain or shine ✓" with no chips |
| GD-WX-31 | Persisted | Reload | The grey line is still there — the state lives on the game, not in memory |
| GD-WX-32 | Card pill follows | Check Home and Find | The pill turns neutral grey and reads "Playing rain or shine" (`F-WX-05`) |
| GD-WX-33 | Suppresses the second alert | Let the 2 h pass run with a worse forecast | No second push for anyone. `@manual` |
| GD-WX-34 | Organizer only | Open as a non-organizer participant; then call the endpoint as one | The chip is absent and the request is refused. `@two-user` |

### 9.19 Live block and Show on Live now

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| GD-LN-01 | Live block | Open a **public** in-progress game as a non-participant | A **Live** block (dot, header, score summary, "Started N min ago") sits where the results entry card normally is, with a large **Watch live** button |
| GD-LN-02 | Watch live | Tap it | The broadcast opens with a spectator token, the same as from the rail (§26.4) |
| GD-LN-03 | Participant sees the entry card | Open the same game as a participant | The ordinary results entry card is there; the Live block is not |
| GD-LN-04 | Private is invisible | Open a **private** in-progress game as a non-participant | No Live block, no Watch button; the game never appeared on the rail |
| GD-LN-05 | Settings row | Game settings on a public game | **Show on Live now** sits immediately below **Public game**, **on** by default — including for games created before the column existed |
| GD-LN-06 | Hidden for private games | Turn **Public game** off | The **Show on Live now** row disappears — a private game can never be on the rail |
| GD-LN-07 | Helper copy | With hints on | "Public games in progress can be watched by anyone in your city." when on; the "stays off the rail" note when off |
| GD-LN-08 | Failure rolls back | Toggle with the network off | Error state on the row, a toast, and the switch rolls back to its previous value |
| GD-LN-09 | Locked with the roster | Game whose roster is locked | Switch disabled, exactly like its neighbours |
| GD-LN-10 | Turning it off | Turn **Show on Live now** off on a live public game | It leaves the rail within one refresh, the Live block disappears, and no new spectator token is minted for it. Tokens already issued keep working until they expire (the pre-existing 48 h contract) |

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
| LS-43 | Broken player avatar on live court | Live scoring court with a participant whose avatar URL 404s | Initials (or blank initials circle); no broken-image / iOS “?” glyph |
| LS-44 | Empty live-court slot | Live court slot with no player / guest | Existing empty slot treatment; no new “?” glyph |

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
| LS-44 | Watch dual-writer merge keeps both | `@two devices` score 1 point on `@watch` (slow network) while phone scores 2 points first | Watch board shows phone's 2 points plus its own; server revision contains all 3; no point erased on either device |
| LS-45 | Watch rally game to completion | `@watch` pickleball / table tennis / badminton / squash: score to 11 (win by 2, e.g. 10-10 → 12-10) | Game-winning point accepted; best-of formats step onto the next game automatically; single-game formats lock the board only when the race is won |
| LS-46 | Watch read-only when not allowed | `@watch` plain player (not owner/admin, `resultsByAnyone` off) opens an IN_PROGRESS game | Continue scoring hidden; match list read-only; no 403 errors; owner/admin who is NON_PLAYING can start and score every court |
| LS-47 | Watch rejected save re-syncs | `@watch` force a 400 on live PATCH (e.g. out-of-graph state) | Board re-syncs to server state; subsequent phone updates still merge |
| LS-48 | Watch leave match without saving | `@watch` start the wrong match → workout page → Leave match → confirm | Returns to the match list; no result saved; game workout keeps running |
| LS-49 | Watch widget tap during session | `@watch` scoring session active → tap Next Game complication for another game | Confirmation dialog; Cancel keeps the session; Exit discards it and opens the other game |
| LS-50 | Watch format dialogs re-openable | `@watch` CLASSIC_AUTOMATIC: dismiss the record-mode / continue-or-end dialog | Orange prompt row stays on the board; tapping it re-opens the dialog; scoring stays gated until chosen |
| LS-51 | Watch timer error surfaced | `@watch` tap timer Start/Pause offline | Short inline error under the timer bar; button re-enabled; no silent no-op |
| LS-52 | Watch timer pause from workout page | `@watch` pause/resume the workout on the workout page | Match timer bar reflects PAUSED/RUNNING immediately (no second request, no drift) |
| LS-53 | Watch small screen boards | `@watch` 40/41 mm: pickleball board with serve row + strict officiating | Undo and More reachable (scrolls if needed); score tap target ≥ 44 pt |
| LS-54 | Watch HealthKit denied hint | `@watch` deny Health once → workout page | Settings › Health path hint shown next to Retry; workout logged as the game's sport (tennis/pickleball/…), never Paddle Sports |
| LS-55 | Watch Live complication | `@watch` score a point → look at Live Active complication → tap it | Localized title, ≤1 refresh per 15 s, tap opens that game; cleared on logout |

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
| CH-07a | Users browse city chip | Chats → Users | City chip in the search field; absent on Bugs/Market/Channels |
| CH-07b | Contacts follow browse | Switch browse city, open contacts | Directory is the browse city; Home city unchanged |
| CH-07c | Users nearby search | Users search with 0 local hits and nearby matches | Nearby groups + View city hops browse |
| CH-07d | Users city picker | Tap city chip in Users search → pick Home or another city | Selector drawer; does not `switchCity`; Home stays first in the picker |
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
| CH-97 | Search typing does not shift the list | Chats → Users → type a query letter by letter | Characters appear instantly; rows below stay still while typing; results and `?q=` update once ~500ms after the last keystroke; clear (X) empties the field and `?q=` immediately |
| CH-98 | Inbox stable under unread traffic | Keep Chats open while another user sends messages to other threads | Only the affected row's badge changes; unaffected rows do not re-animate, reorder-flash, or lose scroll position |
| CH-99 | Filter switch single paint | Switch Users ↔ Bugs ↔ Channels ↔ Market on a warm cache | One paint from cache; no second full-list reshuffle or re-run of row enter animation when the network returns identical rows |
| CH-100 | Pull-to-refresh smoothness | `@mobile` Chats inbox → pull down slowly, release above and below threshold | List follows the finger without stutter; indicator fades/rotates with the pull; release eases back; above threshold refreshes then eases back |

### 11.2 Thread types

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CH-12 | User DM | Send text | Message appears |
| CH-13 | Game chat | Open from game | Game context header |
| CH-13a | Filtered game-chat sync does not loop | As a non-admin participant, open a game whose sync history contains only ADMINS events; repeat with several filtered pages followed by a PUBLIC event | Hidden messages stay hidden; request cursors advance through scanned pages; later visible message arrives; requests stop at the end instead of repeating `afterSeq=0` |
| CH-13b | Empty/pruned sync history | Open a thread whose event log is empty but server head is nonzero; also test a response without `nextAfterSeq` | No immediate self-retry loop and no cursor jump to the global head; a later socket/reconnect trigger still syncs new messages |
| CH-13d | Stalled sync backs off | Force an unresolved server-head gap whose pulls never advance the cursor, then trigger repeated pulls; separately return 429 | Same-gap attempts cool down after 3 pulls for 30s; actual failures respect their retry delay at every priority, even with a newer head |
| CH-13e | Healthy sync stays responsive | Repeat caught-up checks, then advertise a new head; also advance the cursor by socket while a stalled thread is cooling | Caught-up checks do not trigger cooldown; new head/cursor progress allows stalled-gap recovery immediately |
| CH-13f | Deferred sync fairness and merging | Cool two threads, queue a third ready thread, and enqueue a newer head/forced repair while a lease read is pending | Ready thread syncs promptly; delayed thread retains highest head/priority and forced repair; cancelling/clearing deferred work prevents its later wakeup |
| CH-13c | Failed local sync persistence | Fail saving a visible message in a page with a later `nextAfterSeq`, then restore storage and trigger sync again | Cursor does not jump past the unsaved message; next sync can replay it |
| CH-161 | Game chat header localized title | Game with ready `localizedText.name` (and LEAGUE fixture with localized parent season); open `/games/:id/chat` | Thread header title uses `getGameHeaderTitle` / resolved display name (pending → original); nested season name localized when present; not raw authored-only when translation is ready |
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
| CH-157 | Send then switch thread | Send in chat A, immediately open a different game/DM/group before the send confirms | Message stays only in A; chat B does not show A’s bubble among B’s history |
| CH-95 | Mention @all | In game/group chat composer type `@` → pick `all` → send | Message shows `@all`; all other participants get mention notification |
| CH-160 | Mention suggestions responsive | In large league/game chat type `@` | Suggestions appear within ~1s (max 20 users + `@all`); composer stays responsive while list is open; filter by typing narrows list |
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
| CH-151 | Late media seq-honest unread | `@two-user` A starts image upload; B reads then leaves; image finishes with earlier createdAt but newer serverSyncSeq | A’s image stays sent (not ✓✓) until B opens/marks again |
| CH-152 | Peer cursor own-message ticks | `@two-user` A sends DM; B opens thread (marks read) while A’s chat stays open | A’s message flips to read ticks from peer `READ_CURSOR_UPDATE` / hydrate `maxPeerCursor` without requiring receipt rows |
| CH-153 | Mark-all advances peer ticks | `@two-user` A sends several messages; B marks context read (or opens near bottom) | All of A’s earlier messages in that chatType show read ticks (monotonic via max peer cursor) |
| CH-154 | Leave game stops chat sync polls | Join game chat → leave game or leave chat from details/thread | Local game thread purged (socket leave + Dexie); no repeating 403 on `/chat/sync/events` or `/chat/messages/missed` for that game |
| CH-155 | Non-admin skips PRIVATE/ADMINS probes | Playing participant (not owner/admin) opens game details | No `GET .../messages?chatType=PRIVATE|ADMINS` probes; participants-only chat section stays hidden |
| CH-156 | Invitee/guest roster updates | Open game chat as INVITED or GUEST while others join, decline, accept, or leave | Thread and chat-list preview stay on normal messages only; no roster system messages, push, or Telegram for those events; a later user message still appears |
| CH-158 | Inbound photo persist miss | `@two-user` A sends a photo while B has the thread open; leave and reopen after local persist of that image fails | Photo comes back or a durable empty placeholder stays; opening the thread clears unread on the server; no vanished bubble with a stuck badge |
| CH-159 | Cross-thread history leak (regression) | Browse game B (and/or C) chat, then open game A chat (embedded or `/games/:id/chat`); also reopen A after a polluted warm L1; receive a socket payload whose `contextId` differs from the room envelope | Only A’s messages; no B/C bodies; mismatched/missing payload `contextId` never paints into A; leave/reopen A stays clean |
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
| CH-41f | Resize compensation occurs once | Read mid-history; allow a media/preview row above the viewport to grow or shrink | The visible message keeps its pixel position; no overshoot from duplicate corrections |
| CH-41g | Delayed cached height restoration | Reopen a media-heavy thread; delay IndexedDB height reads until after rows are measured | Old persisted sizes do not replace fresh DOM/L1 heights; estimates are never persisted as measured geometry |
| CH-41h | Rapid switch during bottom restore | Open chat A at latest, then immediately switch to a saved history position in chat B | B stays at its restored position through the next animation frames; A's pending pins are cancelled |
| CH-41i | Exact history position | Stop partway through a visible message, leave and reopen with history restoration enabled | Same message and pixel offset restore; buffered offscreen rows are never chosen as the anchor; explicit message links still align to their target |
| CH-41j | First paint at latest | Open a long cached thread at bottom while row layout is settling | First visible frame is at latest; no top/history flash before the bottom alignment; wheel/touch scrolling takes control immediately |

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
| CH-51a | Thread open/close keeps the shell mounted | `@mobile` Chats → open a thread → back → open another | App header and inbox are not torn down and rebuilt on each hop; no chrome flash between list and thread; inbox scroll position and filter survive the round trip |
| CH-52 | Create bug report | Bugs filter → add bug | `BugModal` → bug thread created |
| CH-52a | Create review with stars | Bugs filter → add → type Review → pick 1–5 stars → submit | Submit disabled until stars picked; thread created as Review; stars shown on list row and context panel |
| CH-52b | Review stars vs priority | Open a Review thread and a Bug thread | Review shows star rating (not -2…+2 priority); other types show priority selector |
| CH-52c | Failed create shows in-dialog error | Submit bug with API failure (4xx/5xx, timeout, or network) | Modal stays open; `bug-create-error` alert stays visible above submit (not clipped, not toast-only); network/timeout use translated copy; submit re-enables |
| CH-52d | Hung platform info does not stick submit | `@mobile` Capacitor: `App.getInfo` hangs → submit | Submit does not stay disabled forever; create proceeds with unknown platform or in-dialog error + button re-enabled |
| CH-52e | Close during in-flight create is ignored | Submit → Cancel or X before response | Modal closes; no late toast/error; reopen is idle (not stuck submitting) |
| CH-52f | Bug description caret (Android) | `@mobile` Capacitor Android → Bugs → add bug → type in description → drag caret right; dismiss and reopen keyboard | Caret stays where dragged; keyboard open/close does not jump caret to start; typing at end still inserts at end |
| CH-52g | Bug description caret (iOS) | `@mobile` Capacitor iOS → Bugs → add bug → drag caret, type at end, open/close keyboard | No new caret jump; typing at end still works |
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
| PR-07b | Avatar crop pinch-zoom | Profile → change avatar → pinch-zoom in the circular cropper → Upload (desktop + Capacitor iOS WebView) | Saved avatar matches the zoomed preview, not the unzoomed 1× crop |
| PR-07c | Avatar crop pan | Same → pan the photo in the cropper → Upload (desktop + Capacitor iOS WebView) | Saved avatar matches the panned preview |
| PR-07d | Avatar crop without zoom | Same → leave at 1× (no pinch/pan) → Upload | Saved avatar matches the unzoomed circular preview (centered square; full image if already square) |
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
| PR-92 | Partner place ranks | Statistics → Partners → open Best partner (or other card) when ≥3 people exist for that ranking | Method (Formulae/Rating/Games) under the title; 1st/2nd/3rd switch; 1st default; 2nd/3rd show the next people by that method (e.g. Games: 12W then 11W then 10W) |
| PR-93 | Partner place ranks sparse | Open a partner/target card with only one person in that ranking | Place switch hidden; method still shown |
| PR-84 | Public profile training attendance | Open `/user-profile/:id` for a user who attended TRAINING as PLAYING (not trainer-only, not a future RSVP) | Compact `N games · M trainings` next to that sport's level; rated gamesPlayed unchanged |
| PR-85 | Public profile training attendance zero | Open `/user-profile/:id` with 0 TRAINING attendance, or only upcoming TRAINING RSVPs | Shows 0 trainings (quiet empty); no crash |
| PR-86 | Own Statistics training attendance | Profile → Statistics for a user who attended TRAINING as PLAYING | Same compact games · trainings next to level as public/overlay; upcoming RSVPs excluded |
| PR-87 | Social tab training sport | Public/overlay Levels → Social after viewing another competitive sport | `N games · M trainings` both use the subject's primary sport, not the last competitive sport |
| PR-88 | Other player preferred hand | Open `/user-profile/:id` or `?player=` for a user with only left hand set | L chip selected (filled); R unset (dashed muted), not both-on |
| PR-89 | Other player court side | Same view for a user with only left court side set | L chip selected; R unset |
| PR-90 | Unset vs selected preference chips | Open another player with neither hand nor court side set | All four chips look unset (dashed muted), visually distinct from selected fill |
| PR-91 | Own profile prefs save independently | Profile → General → toggle preferred hand L then R (same for court side) | Each flag saves on its own; other flag unchanged |
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
| PR-trophy-6j | Tie-Breaker | Win official sets on a tie-break: classic 7–6 or flagged super TB (1 / 5 / 12 / 32 / 64); any sport, FINAL results | Matching Tie-Breaker family trophies; 6–4 / Americano points do not count; step 4 (32) is current prod max |
| PR-trophy-6k | Shipped It ladder (bug tracker) | Report bugs/suggestions (not Question); each must hit In progress or Test then Finished/Archived; tiers 1 / 5 / 10 / 25 / 50 | Matching Bug tracker family stack; progress counts shipped reports; questions and ignored (never worked) reports excluded |
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
| PR-19 | Change city | City modal | City updated; no Cities/Clubs switch; browse country → cities; invite/chat browse lens snaps to Home; recent browse cities kept |
| PR-20 | Phone/password change | If exposed in UI | Auth updated |
| PR-21 | Language selector | Pick language (incl. العربية) | i18n + profile saved; for ar, `document.documentElement.dir` is `rtl` |
| PR-21a | Arabic RTL shell | Set language to العربية | UI strings Arabic; page `dir=rtl`; Cairo font; EULA opens Arabic |
| PR-21b | Gulf week start auto | Language العربية (or device ar-*); week start Auto | Calendars start on Saturday |
| PR-21c | Gulf currency default | New user / city in AE or SA (or currency Auto with Gulf city) | Default currency AED or SAR (not stuck on EUR) |
| PR-21d | Arabic plurals | Language العربية; open city list / chat header with counts | Counts use Arabic plural forms (not English fallback for 0/2/3–10) |
| PR-21e | Arabic gendered join copy | Female profile gender; join / queue confirm | Confirmation copy uses feminine أنتِ forms |
| PR-21f | Arabic RTL smoke (automated) | Guest: `localStorage.language=ar` → `/login` | `html[dir=rtl]`, Cairo font; Playwright `smoke/arabic-rtl.spec.ts` |
| PR-21g | Asia language selector | Pick 中文 / Bahasa Indonesia / हिन्दी / ไทย / 日本語 | i18n + profile BCP-47 saved (`zh-CN`/`id-ID`/`hi-IN`/`th-TH`/`ja-JP`); `dir=ltr` |
| PR-21h | Chinese smoke | `localStorage.language=zh` → login | `lang=zh`; Simplified Chinese UI; padel=板式网球; table tennis=乒乓球; Noto Sans SC |
| PR-21i | Indonesian smoke | `localStorage.language=id` → login | Bahasa UI; Tenis meja for table tennis |
| PR-21j | Hindi smoke | `localStorage.language=hi` → login | Hindi UI; Devanagari glyphs |
| PR-21k | Thai smoke | `localStorage.language=th` → login | Thai UI; ปาเดล / เทเบิลเทนนิส |
| PR-21l | Japanese smoke | `localStorage.language=ja` → login | Japanese UI; パデル / 卓球 |
| PR-21m | Asia zero-decimal money | Marketplace with JPY or IDR | 0 fraction digits |
| PR-21n | Asia dual-sport create | Lang zh or id; create padel + table tennis | Correct sport labels; questionnaires localized |
| PR-21o | Asia locales smoke (automated) | Guest each of zh/id/hi/th/ja → `/login`; font stacks for zh/ja/th/hi; zh→en switch | `html[lang=…]`, `dir=ltr`; guest project runs `smoke/asia-locales.spec.ts` |
| PR-22e | Premium main theme | Premium account → Profile → Appearance → Main theme → Classic, then Premium | Two visual radio choices: Classic preview keeps cool neutrals/blue accents; Premium preview keeps obsidian/gold with tiger crest, regardless of active theme. Selected choice has a border and checkmark. Header, page accents, bottom tabs and status bar update after save without reload; premium benefits remain; Light/Dark/System preference is unchanged |
| PR-22k | Main theme selector accessibility | Check 320px/mobile/desktop, light/dark, Arabic RTL, Tab and arrow keys, reduced motion, and a slow save | Both previews fit without overflow; labels remain readable; native radio keyboard selection and visible focus work; preview surfaces follow light/dark; reduced motion removes movement; choices disabled while saving |
| PR-22j | Premium status visibility | Premium account → Appearance → turn Show premium status off/on; view from a second account and guest after refreshing profiles, rosters, followers, rankings, DM headers/messages and game cards in Find/My/Chats | Off hides the gold name treatment and premium owner fire marker; on restores them. Name typography and avatars keep their standard appearance in both states. Premium benefits, main theme and Light/Dark/System remain unchanged; choice persists across reload/device sign-in. Standard users have no switch; downgrade/renewal preserves the preference |
| PR-22k | Premium visibility save/accessibility | Toggle with keyboard, slow network and failed save; try sending non-boolean values or changing visibility as a standard user | Switch has an accessible label and is disabled during save; failure shows an error and preserves prior setting; API rejects invalid types and non-Premium writes |
| PR-22f | Main theme persistence | Save Classic on a Premium account; reload and sign in on another device | Classic persists; switching back to Premium persists too; existing premium accounts default to Premium |
| PR-22g | Main theme membership gate | Open profile as standard user; refresh a Premium account after membership removal/restoration | Selector hidden and Classic shown without membership, even with saved Premium; restoration respects saved choice |
| PR-22h | Main theme failed save | Fail the profile request while switching theme, then retry | Error shown; prior theme remains selected; selector re-enabled for retry |
| PR-22i | App/web background matrix | Classic and Premium × Light, Dark, System (OS light/dark); reload, switch, background/resume | html/body/root, loading screen, chat and surrounding safe areas match the selected palette; no stale Classic or blue backing. Automated: `npm run test:theme-backgrounds` |
| PR-22j | Native background | iOS/Android: switch both preferences; overscroll; relaunch; change OS appearance with System selected | WebView/window backing matches the page; saved preference restored on launch; manual appearance ignores OS changes |
| PR-22 | Theme selector | Light/dark/system | Theme applied |
| PR-22a | System theme resume (dark) | Theme=System; background the app; OS switches to dark; resume | UI is dark without relaunch (`html.dark` present) |
| PR-22b | System theme resume (light) | Theme=System; background the app; OS switches to light; resume | UI is light without relaunch (`html.dark` absent) |
| PR-22c | Manual theme ignores OS on resume | Theme=Light or Dark; background; OS switches to the opposite; resume | UI stays on the manual preference |
| PR-22d | Resume does not flicker | Theme=System already matching OS; background and resume (twice) | Appearance unchanged; no light/dark flash |
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
| PR-45a | Open Telegram from player card | Card/profile Telegram with username; then ID-only with Telegram installed (desktop + mobile); then ID-only without Telegram | Username → `t.me`. ID desktop → `tg://user?id=`; ID mobile → `tg://openmessage?user_id=`. If the app does not take focus, Telegram Web |
| PR-46 | Wallet transaction history | Open wallet modal | Balance + history visible |
| PR-CS-01 | Wallet Owed section | Open the Wallet while owing a share (§9.2b) | **Owed** row with the game title, date, amount and the payer's avatar, above the transaction list |
| PR-CS-02 | Settle from the Wallet | Tap **Settle** on an Owed row | Wallet closes; the game opens with the settle sheet already open |
| PR-CS-03 | Owed to you | Open the Wallet as a payer others still owe | **Owed to you** section listing each debtor |
| PR-CS-04 | Nothing outstanding | Open the Wallet with nothing owed either way | "All settled 🎉" in muted text; no empty section headers |
| PR-CS-05 | Settled rows disappear | Settle a share, reopen the Wallet | Row gone from **Owed** and from the payer's **Owed to you** |
| PR-SH-01 | Shop button | Open the Wallet modal | **Shop** button with a bag icon beside the title, ≥44 px, not overlapping the close (×) |
| PR-SH-02 | Shop opens | Tap **Shop** | Wallet closes and `/shop` opens inside the tab shell (§28); Back returns to the previous tab, not a blank page |
| PR-SH-03 | Collection entry | Profile → **Appearance** → Collection block → **Get more styles** | Also opens `/shop` |
| PR-SH-04 | Flag off | `VITE_SHOP_ENABLED=false` | Neither the Wallet button nor the Collection block renders; no `/api/shop` request. `@manual` |
| PR-RF-01 | Invite friends card | Profile → General | The Invite friends card sits **above** the avatar/wallet block, with a two-avatar illustration (the viewer plus a dashed placeholder). Any case asserting the avatar is the first thing on General needs this |
| PR-RF-02 | Card copy from settings | Read the headline; then change `REFERRAL_REWARD_REFERRER` to 60 in Admin | "Bring a friend, both get 50 coins" / "They get 25 when they play their first game."; the headline reads 60 within a minute |
| PR-RF-03 | Share invite | Tap **Share invite** on iOS/Android, then dismiss the sheet | Native share sheet with the personal link; dismissing does nothing — no toast. `@manual` |
| PR-RF-04 | Share invite on web | Same on desktop web | Link copied, "Link copied" toast |
| PR-RF-05 | Copy code | Tap the code pill | Code copied, green check ~1.5 s, "Copied" toast |
| PR-RF-06 | Code pill a11y | VoiceOver / TalkBack on the pill | Announces "Copy invite code B N D J 7 K 2 Q", spelled out. `@manual` |
| PR-RF-07 | Card loading / failure | Slow network; then force the summary request to fail | Shimmer skeleton, never an empty box; on failure the card renders **nothing** and the rest of the tab is unaffected |
| PR-RF-08 | Tap targets | Measure every control on the card | ≥44 px |
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
| PR-84 | Default currency picker | Profile → General → change default currency | Saved; reload keeps the chosen currency |
| PR-85 | Explicit EUR kept | User in Serbia picks EUR in Profile | Stays EUR after reload; later geo does not overwrite |
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

### 13.4 Statistics — Shows up, partners, recaps

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PR-AT-01 | Below the sample floor | Player card of somebody with fewer than 5 recorded games | **No** "Shows up" tile at all — not a "0 %", not an empty state |
| PR-AT-02 | At or above the floor | Player card of somebody with 5 or more | "Shows up" tile with a percentage and a ring gauge |
| PR-AT-03 | Ring is never a verdict | View the tile at 20 %, 60 % and 95 % | A single sky tone in all three — no red, no amber, no grading. `@manual` |
| PR-AT-04 | Hint | Read under the tile | "Games confirmed and attended in the last 12 months." |
| PR-AT-05 | Screen reader | VoiceOver / TalkBack on the gauge | Announces the percentage as text |
| PR-AT-06 | Own statistics | Own Profile → Statistics | Same tile plus a 12-month sparkline and your own no-show notes, each with a control opening that game's chat |
| PR-AT-07 | Somebody else's | Another player's Profile → Statistics | The tile, but **no** no-show note list |
| PR-PT-01 | Your partners rail | Own Profile → Statistics | **Your partners** rail: avatar, name, "12 games · 66 %" and the chemistry chip (§14.2), ordered by win rate |
| PR-PT-02 | Floor of 3 games | Profile with only 1–2 games with each partner | No section at all — only partners with ≥3 games together appear |
| PR-PT-03 | See all | Profile with more than six partners | **See all** opens a list sheet with every partner as a row |
| PR-PT-04 | Tap a partner | Tap a partner card | Opens the pair sheet, or the team page when a `UserTeam` exists |
| PR-PT-05 | Rail chrome | Scroll the rail at 375 px; then switch to العربية | Scrolls horizontally with no visible scrollbar; mirrors in `ar` |
| PR-RC-01 | Recaps row | Profile → Statistics, under Your partners | **Recaps** heading and a horizontal row of month cards, newest first |
| PR-RC-02 | Card content | Look at a month with decided games and one without | Month, games count and win percentage; just the games count when no game was decided |
| PR-RC-03 | 12-month cap | Player with 13 months of recaps | At most 12 cards; the thirteenth (older) month must not appear |
| PR-RC-04 | Open from the archive | Tap a card, then close | Opens the same reel (§6.7) for that month; closing returns to Statistics with the scroll position intact |
| PR-RC-05 | Empty | Player with no recap at all | No Recaps heading — not an empty card |

---

## 14. Leaderboard (`/leaderboard`)

### 14.1 Players

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LB-01 | Leaderboard loads | Open tab | Achievements is the first and active subtab; achievement rankings load |
| LB-02 | Sport filter | Switch sport | Rankings refetch |
| LB-03 | City scope | City-specific board | Filtered players |
| LB-04 | Open player from row | Tap player | Profile/card |
| LB-05 | Empty leaderboard | No ranked players | Empty state |
| LB-06 | Current user highlight | User in list | Highlighted row |
| LB-07 | Gender filter | Switch All / Men / Women | Rankings refetch for that gender cohort; ranks restart at 1 |
| LB-08 | Rating qualify | Open Level ranking | Players with ≥5 rated games and a rated game in the last 90 days rank normally at the top |
| LB-09 | Rating inactive grayed | Same list, players with <5 rated games or last rated game older than 90 days | Still listed at the bottom, muted (not washed-out opacity), rank shown as a dash (does not take qualifier numbers); a single “Not ranked” caption explains 5 games + 90-day rated match; tapping the row still opens the player card |
| LB-10 | No duplicate activity chips | Open Level ranking | No separate min-games and 90-day filter chips; gender/sport/city filters remain |
| LB-11 | Achievements ranking unchanged | Open Achievements subtab | Family rankings are unchanged; no rating qualify grayed-at-bottom treatment |
| LB-12 | Social ranking unchanged | Open Social subtab | Sort/rank by social level as before; rows are not grayed for rating inactivity |

### 14.2 Pairs

A pair is a derived aggregate, never a rating — there is no pair ELO and nothing here feeds a level. Minimum 5 games together inside the period to rank.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LB-PR-01 | Mode switch | Open **Top** | Segmented **Players · Pairs** control under the filter header, full width, player icon on Players and pair icon on Pairs; Players selected on a cold start |
| LB-PR-02 | Switch to Pairs | Tap **Pairs** | List cross-fades (~200 ms) into the pairs view; the Achievements / Level / Social switcher does not move and its pill does not fly across |
| LB-PR-03 | Filters survive | Switch back to **Players** | Sport picker, gender filter and scope are exactly as they were — mode must not reset another filter |
| LB-PR-04 | Reduced motion | Reduce Motion on | Both switches happen instantly; no cross-fade, no podium rise. `@manual` |
| LB-PR-05 | Keyboard | External keyboard on the control | One tab stop; arrow keys move between Players and Pairs. `@manual` |
| LB-PR-06 | Themes + RTL | Light / Dark / Classic / Premium; then العربية | Legible in all four; the two segments mirror and the active pill still sits under the selected label |
| LB-PR-10 | Podium | At least three ranked pairs, 375 px | Top three as cards above the list, **tallest first** (1st > 2nd > 3rd), no horizontal scroll |
| LB-PR-11 | Podium card content | Look at each card | Two overlapping avatars with a thin ring — gold, silver, bronze in that order — two lines of names, a large win rate and a small games count |
| LB-PR-12 | Podium stagger | First paint; then scroll away and back | Cards rise one after another (~80 ms apart) on first paint only; already-mounted cards do not replay. `@manual` |
| LB-PR-13 | Podium reduced motion | Reduce Motion on | All three in place on the first frame, no stagger. `@manual` |
| LB-PR-14 | Podium a11y | VoiceOver / TalkBack on a podium card | "Number 1, Marko and Ana, 72 percent win rate, 18 games"; activating it opens the pair. `@manual` |
| LB-PR-15 | Podium RTL | App language العربية | Podium mirrors: 1st on the right; each avatar stack overlaps toward the reading direction |
| LB-PR-20 | Row content | Scroll the list in `en`, then `ar`, `cs`/`ru` | Rank number, two avatars overlapping by 24 px, "Marko & Ana", second line "18 games · 72 %"; percentage and count formatted for the locale (Arabic digits in `ar`, comma group separator in `cs`/`ru`) |
| LB-PR-21 | Own pairs | Viewer is in one of the listed pairs | Soft sky border on the **inline-start** edge and a faint sky background; in `ar` that border is on the right |
| LB-PR-22 | Chemistry chip | Look at the right side of each row | Bolt icon and a signed number; green when the pair beats the two members' solo average by ≥5 points, neutral otherwise |
| LB-PR-23 | No chemistry, no chip | Pair where neither member has any solo games | **No chip at all** — never a grey `0` |
| LB-PR-24 | Chemistry tooltip | Long-press the chip; hover and keyboard-focus it on desktop | "Win rate together vs. on your own" appears above it and disappears on release. `@manual` |
| LB-PR-25 | Row a11y | VoiceOver / TalkBack on a row | "Rank 4, Marko and Ana, 18 games, 72 percent win rate, chemistry plus 9". Avatars, the "&" and the bolt icon are not announced. `@manual` |
| LB-PR-26 | Tap targets | Measure the row and the chip | Both ≥44 px tall. `@manual` |
| LB-PR-27 | Load more | Scroll to the end of page 1 → **Load more** | Next page appends; rank numbers continue with no gap and no repeat |
| LB-PR-30 | Sort chips | **Win rate / Games / Level** | Radio group: exactly one active (sky), exactly one in the tab order |
| LB-PR-31 | Sort keyboard | Arrow Left/Right, Home, End; then in `ar` | Arrows move *and* select; Home/End jump to first/last; selection wraps at both ends; in `ar` Arrow Right moves toward the start of the row. `@manual` |
| LB-PR-32 | Sort re-orders | Switch sort | List **and** podium re-order; scroll resets to the top; sport and period are kept |
| LB-PR-33 | Period chips | **All time / Last 30 days / Last 10 days** | Same behaviour; a 10-day window with no qualifying pair shows the empty state, not an empty list |
| LB-PR-34 | No interleaving | Change period or sort while a later page is loaded | The list is rebuilt from rank 1 — two orderings must never interleave (a stale cursor answers `400 errors.pairs.invalidCursor`) |
| LB-PR-40 | Scroll to my pair | Viewer with a ranked pair below the fold | Floating pill above the bottom bar: "Scroll to my pair (12)" |
| LB-PR-41 | Pill scrolls | Tap it | The viewer's row scrolls to the middle of the screen and flashes briefly |
| LB-PR-42 | Pair on an unloaded page | Viewer's pair is on a page not yet fetched | Tapping pulls the intervening pages first, then scrolls. `@manual` |
| LB-PR-43 | Android instant scroll | Android | Scroll is instant (no smooth animation), matching the player leaderboard. `@manual` |
| LB-PR-44 | Pill visibility | Once the row is on screen; then scroll away | Pill disappears, then comes back |
| LB-PR-45 | No ranked pair | Viewer with none | The pill never appears |
| LB-PR-50 | Empty state | City and sport with no qualifying pair | "No pairs ranked yet" / "Play 5 games with the same partner to appear here." and a **Find a game** button opening Find |
| LB-PR-51 | Loading | While the first page loads | Three podium-shaped shimmer blocks and six row skeletons at the real heights, so nothing jumps when data arrives |
| LB-PR-52 | Offline | Network off, then back | Error line, then recovery. `@manual` |
| LB-PR-60 | Pair sheet | Tap a pair with no formal team | Bottom sheet at ~70 % height with both avatars and "Marko & Ana" in the header |
| LB-PR-61 | Stat tiles | Look at the sheet | Games, Win rate, Chemistry. Unknown chemistry shows an em dash and "Not enough solo games yet" |
| LB-PR-62 | Recent together | Scroll the sheet; then open a pair with no shared games | Up to five compact game cards with the house date tile and a Win / Loss chip, each opening that game; otherwise "No shared games yet." |
| LB-PR-63 | Footer actions | Open your own pair; then somebody else's | **Create a team** (primary) and **Invite to a game** (secondary) only when the viewer is one of the two; another pair shows stats and history with no footer |
| LB-PR-64 | Create a team | Tap **Create a team**, then repeat | Creates or reuses the viewer's team, invites the partner and lands on `/user-team/:id` with both members. Doing it twice must not create a second team |
| LB-PR-65 | Invite to a game | Tap **Invite to a game** | Opens the existing "add team to game" sheet for that pair |
| LB-PR-66 | Existing team | Tap a pair that already has a `UserTeam` | Goes straight to `/user-team/:id` — no sheet |
| LB-PR-67 | Deep link | Open `…?pair=a,b` directly, then close the sheet; then the Android back gesture | Sheet opens; closing removes the `pair` parameter and leaves no extra history entry; back closes the sheet rather than the page. `@manual` |
| LB-PR-68 | Sheet themes + RTL | Light / Dark / Classic / Premium; then العربية | Legible in all four; avatars, header and footer all mirror |
| LB-PR-70 | Counts follow results | Play and finish a game with a fixed team | The pair's games count rises by exactly one, and by one win if that team won. `@manual` |
| LB-PR-71 | Reset is symmetric | Reset the results of that game | Count and win return to exactly what they were — not to zero, not one short. `@manual` |
| LB-PR-72 | Edit follows | Edit a finished result to flip the winner | The pair's wins follow the edit with no drift. `@manual` |
| LB-PR-73 | Rotating formats | Americano where four players rotate partners every round | Adds **nothing** to any pair. `@manual` |
| LB-PR-74 | Majority rule | Session where two players stay together for 2 of 3 rounds | Counts as one game for that pair. `@manual` |
| LB-PR-75 | Excluded entity types | A training, a bar meet-up, an event and a league-season row | None of them change any pair. `@manual` |
| LB-PR-76 | Walkover | League fixture finalized as a neutral walkover | Changes no pair. `@manual` |
| LB-PR-77 | Admin rebuild | `POST /rankings/pairs/recalculate` | Every number on the tab is unchanged. `@manual` |

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
| UT-09 | Create-pair explainer | Tap Create team (home or create menu) | Sheet explains pair (not a group), city invites, add-from-page or invite list; confirm creates/opens pair |
| UT-10 | Team page explainer | Open `/user-team/:id` | Explainer visible without hunting; pending vs ready copy |
| UT-11 | Add pair to game | Ready pair → Add to a game → pick upcoming game user can invite to | Both accepted members tagged as that user team; partner invited if not already on the game |
| UT-12 | Add blocked while pending | Incomplete pair (partner not accepted) | Add action unavailable with reason that partner must join first |
| UT-13 | Invite permission filter | User cannot invite to a game | That game is absent from the picker |
| UT-14 | Fixed-pairs seating | Add ready pair to a `hasFixedTeams` game; both become PLAYING | They occupy one pair slot, not two unlinked players |
| UT-15 | Delete team leaves home list | Owner deletes team from team page or home section X → return to Home/My Teams | Deleted team gone immediately and stays gone after tab switch / soft refresh |
| UT-16 | Pair stat band | `/user-team/:id` for a two-person team that has played together | Games · Win rate · Chemistry tiles at the top, showing the same numbers as the pair sheet (`LB-PR-61`) |
| UT-17 | No zeros band | Team with only the owner, or a pair that has never played together | No stat band at all — not a row of zeros |

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
| PI-04 | Empty lobby | Looking with no other pool members and no matching games → tap status strip | Honest empty copy; no fake avatars |
| PI-05 | Proposal sheet | Open `/find?proposal=<id>` (or tap ready strip) → tap Not now → reopen lobby | Not now only dismisses the drawer; ready match remains and Create is still available when reopened |
| PI-19 | Friend ring in lobby | Favorite is in intersecting pool | Avatar has golden favorite ring |
| PI-20 | Full pool + affinity weight | Looking with mixed-compatible peers | Lobby shows all city peers; near=large+highlighted, mid=smaller, far=smallest/muted outer orbit (not hidden) |
| PI-21 | Roster edit | Open a match-ready deep link with 5+ intersecting → remove one → tap a pool avatar | Removed returns to pool; tap adds into vacancy; court, roster, and count refresh together to full party; Create enabled |
| PI-22 | Match roster progress UI | Open a lobby with a partial and then full selected roster | Progress bar is directly above the player carousel; selected/needed count is in the card’s top-right; title and hint change from Not enough players to Match is ready |
| PI-23 | Direct match editor | Open a lobby with compatible free players → remove one from the roster → add one from the court → tap I’ll create the game inside the editor | Best compatible players start selected around the center court and in the editable roster; available unselected players use a yellow glow and plus only while a vacancy exists; a full roster shows no plus badges; empty slots remain visible below party size; there is no separate footer; Create Game always appears inside the editor and opens with every currently selected player invited; matching game nodes stay visible (this is not a real proposal) |
| PI-58 | Radar chrome | Open a looking lobby radar | Top-right shows only the shuffle/refresh button; no orbit-guide dashes, chevrons, or dots |
| PI-59 | Tap-to-add hint | Open a match-ready lobby with an open slot and a tappable free player; repeat with an open slot but no tappable free players | Bottom-left “Tap a player to add” chip shows only when a free eligible player is on the radar |
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
| PI-40 | Sport intent notify ignores training/tournament | Start looking with a sport (GAME) intent while a public TRAINING or TOURNAMENT fits the same city/sport/window; also create a BAR intent near a public BAR | Push/game-fit notify only GAME (not TRAINING/TOURNAMENT); BAR notify only BAR. Radar still shows a fitting public tournament (PI-48) |
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
| PI-45 | Spectator avatar opens player card | Tap I want to play with others looking → tap a compatible court avatar | Player card sheet opens on top of the lobby; focus leaves the court avatar so the lobby is not aria-hidden while still focused |
| PI-46 | Direct-join game node | Look with a public direct-join GAME that fully fits | Circular composite on the inner ring, solid emerald rim, slot pips; tap opens the game card with Join |
| PI-47 | Queue-only game node | Same as PI-46 but `allowDirectJoin` is off and a PLAYING slot is free | Dashed cooler circle, clock badge; card CTA is Ask to join |
| PI-48 | Tournament game node | Public tournament that fully fits a sport intent | Circle + thin red rim + swords; still on the inner ring |
| PI-49 | BAR intent games | BAR intent near a public BAR that fits | BAR node only; sport games and tournaments absent |
| PI-50 | Ineligible games hidden | Full / level miss / gender seat taken / private / no time / already in / owner | No game node |
| PI-51 | Join consumes looking | Join from the card into a free direct-join slot | PLAYING; looking ends; lobby closes or that game is gone |
| PI-52 | Ask keeps looking | Ask to join a queue-only game | IN_QUEUE toast; looking remains |
| PI-53 | Hidden modes | Spectator lobby; lobby with a pending proposal | No game nodes. Direct match editor without a proposal still shows them (PI-23) |
| PI-54 | Last slot taken | Another client takes the last PLAYING seat | Node disappears on pool invalidate |
| PI-55 | Public game appears live | Keep the lobby open; another client creates a fully fitting public GAME or tournament | Node appears after matching-games invalidate, including tournaments |
| PI-56 | Direct-join toggle | Host turns off allowDirectJoin on a visible radar game | Node switches to dashed / Ask to join without a reload |
| PI-57 | Slot reopens | A full fitting game loses a PLAYING seat | Node reappears after matching-games invalidate |
| PI-60 | Create from lobby with MATCH template | Looking any-level with a peer outside host ±0.7 → I’ll create the game → pick Flexible scoring / MATCH → create | Game creates; level band expands to cover the lobby roster (not reset to host ±0.7, not opened to 1–7) |
| PI-61 | Create from play-intent mismatch toast | From lobby create, switch to link a reservation (or pick a time) outside the looking window, or shrink the level band so a selected player no longer fits → tap create | Create does not succeed silently; a toast explains the mismatch (time / level / club / date) |
| PI-62 | Play-intent create ignores leftover reservations | Looking at a bookable club that already has a reservation that day → create from lobby | Default CTA is create game (game-only), not “Link reservation”; looking time is used |

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
| CA-WX-01 | Court cover control | Courts → add a court | Indoor/outdoor is a two-option segmented switch **Indoor · Outdoor** with icons (not a checkbox), with the helper "Outdoor courts get weather alerts before a game." |
| CA-WX-02 | Default and persistence | New court → save → reopen; switch to Indoor → save → reopen | Defaults to **Outdoor**; Indoor persists |
| CA-WX-03 | Edit opens on current value | Edit an existing court | Opens on that court's current value |
| CA-WX-04 | Keyboard | Arrow keys on the control | Moves between the two options; each is announced with its label |
| CA-WX-05 | Schedule grid roof icon | Open the schedule grid with indoor and outdoor courts, including a long court name | Small roof icon in every indoor column header with an "Indoor court" accessible label; outdoor columns have no icon; long names truncate rather than pushing the icon out of view |
| CA-WX-06 | Flip stops alerts | Flip a court from outdoor to indoor | Its games stop producing weather alerts on the next pass (§9.16). `@manual` |

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
| X-26j | Eligible campaign calendar tag | Configure an active campaign with creative, placement, targeting, purple `CAMP` text, and a three-day calendar-tag range; open My and Find calendars as an eligible user | Ultra-small `CAMP` text uses the selected purple font color on light cells and a lifted readable tint of that color on dark and selected cells; it is anchored at the bottom of each cell for all three dates, including both boundary dates, and nowhere outside the range |
| X-26k | Calendar tag targeting isolation | Use two accounts in the same city where only one matches include/exclude, rollout, language, level, or placement sport targeting; switch accounts without reloading | Only the eligible account sees the tag; the second account never flashes or retains the first account’s tag |
| X-26l | Calendar tag Admin validation and refresh | Enable a tag with a missing title/date or end before start, then save a valid range and change it while an eligible client calendar remains open | Invalid configuration is blocked; valid configuration saves; the client reflects campaign changes within one minute or on window focus/reconnect |
| X-26m | Localized selected-day ad message | Configure different calendar-tag messages for English and Russian; select an in-range tagged date using each app language, then select an untagged date | A dedicated message block appears directly below the selected date/weather summary with the matching translation and tag color; it disappears outside the configured range |
| X-26n | Multiple campaign calendar tags | Two eligible campaigns tag the same calendar day | Each tag is on its own row at the bottom of the cell; labels are not joined on one line |
| X-26o | App QR landing with UTM | Open `/link-to-app?utm_source=qr&utm_medium=offline&utm_campaign=test` | Static landing loads (not SPA); records a `view` hit with those UTM fields and an `aid`; sets `bandeja_aid` cookie |
| X-26p | App QR store choice | From that landing tap App Store, Play, or Web | Redirects via `/api/public/link-to-app/go/{ios\|android\|web}` keeping UTM + `aid`; Admin → App QR shows the choice |
| X-26q | App QR unmarked URL | Open `/link-to-app` with no query | Landing still works; events store empty UTM (campaign shows as —) |
| X-26r | QR first-touch register | Scan marked landing → choose Web → register (phone/Google/Apple/Telegram) | User row stores first-touch UTM/`aid`; Admin → App QR shows Registered + attributed user; later campaigns do not overwrite |
| X-26s | QR scan without register | Scan marked landing, do not sign in | Admin → App QR shows view/choice counts; Attributed users stays empty for that `aid` |
| X-26u | App QR campaign visual name | Admin → App QR: save UUID code + visual name (before or after a scan) | Funnel/user/recent tables show the visual name; QR URL still uses the UUID; deleting the mapping falls back to the code |
| X-26v | Referral rides the same row | Repeat X-26o–X-26r with `?ref=<code>` on the landing URL | `ref` is captured, carried and attached under the same first-touch rule as the UTMs. Full cases: §29 |
| X-26w | Native startup has no clipboard access | Copy text in Safari; cold-launch iOS app, background/resume, force-quit and relaunch; repeat signed in and signed out | No paste permission prompt; clipboard unchanged; no clipboard attribution is imported |
| X-26x | Native deep-link attribution without paste | With unrelated clipboard text, open `/link-to-app?aid=FirstTouch123&utm_source=qr&ref=BNDJ-7K2Q` as a native deep link on cold launch and while running | No paste permission prompt; navigates to login; URL attribution/referral persists under first-touch rules and attaches on auth |
| X-26y | QR landing preserves clipboard | Copy text, then open the QR landing and use each store/web choice or automatic redirect | Clipboard unchanged; choice tracking and redirect query parameters still work; a new store install does not import attribution from the clipboard |

### 18.7 Navigation shell

| ID | Test | Expected |
|----|------|----------|
| X-27 | Back button (web) | Browser back from create/game → sensible destination |
| X-28 | Back button (Capacitor) | Hardware back handled | `@manual` |
| X-29 | Player card history | Open overlay → back | Overlay closes, no orphan state |
| X-30 | Resizable splitter | Drag chat/game split | Width persists session |
| X-31 | Bottom tabs hidden on create | `/create-game`, `/create-event` | Tab bar hidden |
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
| X-37 | Permission prompt | Fresh install → login → land on home | No prompt on cold start or login screen; single prompt after leaving auth routes |
| X-37a | Cold start from push (logged in) | Kill app → tap push notification | Routes to correct screen |
| PN-N1 | New game created push tap (Android) | App backgrounded or killed → tap NEW_GAME | Opens `/games/:id` for that game, not only the last tab |
| PN-N2 | New game created push tap (iOS) | App backgrounded or killed → tap NEW_GAME | Opens `/games/:id` for that game |
| X-37b | iOS actions before home paints | Cold start → invite push on lock screen | Accept/Decline actions visible |
| X-37c | Logout → login as different user | User B logs in after User A logout | User B receives pushes; single navigation per tap |
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

#### 18.8b Shade and Telegram actions on the newer types

Every action button below is a **signed push action token** (`kind` + `targetId` + `action`, 48 h) posted to `POST /push/invite-action`, not a URL. The generic contract is the same in every row: the action completes without opening the app, a stale or reused token is a quiet no-op (never a 500, never a seat change), and the Telegram mirror edits its own message and drops the buttons it just consumed. Only per-feature specifics are listed.

> **Attendance shade buttons are wired on both platforms.** Android handles `nativeHandler: 'attendance_actions'` in `ChatReplyMessagingService` → `AttendanceNotificationHelper` → `AttendanceActionReceiver`; iOS registers the `GAME_REMINDER` category (`registerPushNotificationActionTypes.ts`) and answers either through the JS action handler or, on a cold start, through `AttendanceActionHandler`.
> **`series` and `weather` shade buttons are still not wired** — the tokens ship, but no native branch consumes them (`docs/product/not-shipped.md`). Run those rows against **Telegram** and the in-app card; their `@shade` rows are the acceptance criteria for when that work lands.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PN-AT-01 | Attendance reminder | 24 h before a game accepting answers | Every PLAYING player gets a reminder. Its data map carries `attendanceActionToken` / `attendanceUnsureActionToken` and `nativeHandler: 'attendance_actions'`. `@manual` |
| PN-AT-01b | `@shade` Shade buttons | Receive the reminder on Android and on iOS | Both shades offer **I'm coming** and **Not sure yet**, in the recipient's app language (the backend sends the titles; the Android resource and the iOS category registration are the fallbacks). `@manual` |
| PN-AT-02 | `@shade` Shade answer | Tap a shade action, then open the app | The app did **not** open; the reminder is replaced by a quiet "Seat confirmed 👍" / "Noted. You can confirm later." card, and the answer is visible in game details. `@manual` |
| PN-AT-02b | `@shade` Cold start | Force-quit the app first, then tap a shade action | Same result — the answer lands (Android's broadcast receiver; iOS's `AttendanceActionHandler` on the not-yet-ready webview). The app still does not come to the foreground. `@manual` |
| PN-AT-02c | `@shade` `@offline` Offline answer | Turn networking off, tap a shade action | Nothing is claimed: no acknowledgement card and the reminder stays answerable. Answering again online works. There is no deadline, so nothing is lost. `@manual` |
| PN-AT-02d | `@shade` Stale token | Leave the game, then tap a shade action on the old reminder | Quiet no-op: the notification goes away, no error card, no seat or queue change. `@manual` |
| PN-AT-02e | `@shade` Tap, not action | Tap the reminder body instead of a button | Opens the game exactly like a reminder without actions; no answer is recorded. `@manual` |
| PN-AT-01c | Organizer is reminded, not asked | Receive the 24 h reminder for a game you created and play in | Same reminder body, but **no** "Are you coming?" line and no shade buttons — the owner is confirmed by organizing. `@manual` |
| PN-AT-03 | Second reminder filtered | 2 h before the game | Only players who have **not** answered get a second reminder; those who answered at 24 h get nothing, and the owner never does. There is never a third message. `@manual` `@two-user` |
| PN-AT-04 | Telegram attendance | Tap one of the two inline buttons | The message edits to "✅ You're confirmed" / "🤔 Noted, not sure yet" and the two answer buttons are removed while "View game" stays. `@manual` |
| PN-AT-05 | Telegram double tap | Tap an attendance button twice, or after leaving the game | The spinner closes with a friendly message; never a throw. `@manual` |
| PN-AT-06 | Silence is allowed | A player who never answers reaches kick-off | Seat, queue position and level untouched. `@manual` |
| PN-SO-01 | Spot-opened push | Queued player while a seat frees | "A spot just opened" with a body like "Tue 19:00 Padel Centar · level 3.5–4.5 · You're #1 in the queue". `@two-user` |
| PN-SO-02 | Join now | Tap **Join now** | Opens the game and runs the normal join flow: gender/level gates apply and the overlap confirm appears when the player already has a game in that slot. `@two-user` |
| PN-SO-03 | Deep-link param cleaned | After the join flow runs, check the URL and go back/forward | `join=1` is gone; navigation does not re-trigger the join |
| PN-SO-04 | Intent match | Player with an OPEN play intent matching the game, not queued | Receives the same push |
| PN-SO-05 | Follower variant | Follower of a seated player, with and without "Friends' play-intent activity" on | "Marko's game has a free spot" when on; **nothing** when off |
| PN-SO-06 | Owner never notified | Owner of the game | Never receives a spot-opened notification for their own game. `@two-user` |
| PN-SO-07 | One per day | Two players leave the same game within minutes | Each recipient receives **one** notification that day, not two (the dedupe is a persisted delivery row keyed by user + game + city-local day + audience kind). `@two-user` |
| PN-SO-08 | Private game | Private game frees a seat | Only queue members are notified; intent matches and followers are not |
| PN-SO-09 | Telegram mirror | Check the Telegram message | Carries **Join now** (opening the game with the join flow) and the existing **Show Game** button. `@manual` |
| PN-SER-01 | Carry-over push | An occurrence reaches FINAL | Regulars who played get "Same time next week?", carrying `series` accept/decline tokens. `@manual` |
| PN-SER-01b | `@shade` Carry-over shade | Once the native branch exists | **I'm in** / **Not this time** seat or do nothing without opening the app. `@manual` |
| PN-SER-02 | Telegram carry-over | Same in Telegram | Two inline buttons; **I'm in** answers "Seat kept" and seats the user on the next occurrence. `@manual` |
| PN-WX-01 | Weather alert | 12 h before an at-risk outdoor game | One push per PLAYING participant, with different copy for the organizer. The organizer's payload carries the **Move indoor** deep link and a `weather`/`keep` token; participants get **View forecast**. Telegram shows both as buttons; `@shade` for the native buttons. `@manual` |
| PN-WX-02 | Organizer deep link | Tap the organizer push (or its Move indoor action) | Lands on the game with the move-indoor sheet open; `?section=weather&action=moveIndoor` is stripped so a refresh does not reopen it. `@manual` |
| PN-WX-03 | Participant deep link | Tap the participant push | Lands on the game with the banner in view; `?section=weather` is stripped. `@manual` |
| PN-WX-04 | Telegram weather | Organizer's Telegram message → **Keep as planned** | Answers "Playing rain or shine"; only that button disappears, the links stay. `@manual` |
| PN-WX-05 | Preference mute | Turn **Weather alerts** off and repeat | No push and no Telegram message, while other reminders still arrive. `@manual` |
| PN-WX-06 | Second alert needs a class rise | Let the forecast worsen a class (60 % → 90 %, or rain → storm) and run the 2 h pass; then let it stay in the same class | Exactly one more push, titled as "forecast got worse"; no second push at all when the class is unchanged. `@manual` |
| PN-WX-07 | Dedupe survives a restart | Restart the backend between the 12 h and 2 h passes | No duplicate 12 h alert — the dedupe is persisted on the game, not an in-memory `Set`. `@manual` |
| PN-WX-08 | Indoor never alerts | Indoor game, any forecast | No push. `@manual` |
| PN-LN-01 | Follower live push | A follows B; B's public rail-visible game starts live scoring | A receives "B is playing live" once; tapping it opens the game. `@two-user` `@manual` |
| PN-LN-02 | Once ever | More points are scored | No second notification, ever, for that game. `@two-user` |
| PN-LN-03 | Social preference | A turns off "Friends' play-intent activity" | No live notification arrives. `@two-user` |
| PN-LN-04 | Privacy | B's game is private, or has **Show on Live now** off | No notification. `@two-user` |
| PN-LN-05 | Restart | Restart the backend between two scoring bursts | Still no duplicate — the dedupe is a table, not an in-memory set. `@manual` |
| PN-RC-01 | Recap push | With **Reminders** enabled, generate the recap | "Your September recap is ready ✨" in the recipient's language. `@manual` |
| PN-RC-02 | Recap tap | Tap it | Opens Home with the reel already open on that month; `?recap=` is cleaned out of the URL so back does not re-open it. `@manual` |
| PN-RC-03 | Recap mute and repeat | Disable **Reminders**; then let the generator run on the 1st, 2nd and 3rd | No push when disabled; exactly one push across the three runs. `@manual` |
| PN-RF-01 | Referral payout push | A invites B; B registers, joins a game, the game is finalized with results | **Both** get a push: A "…played their first game. +50 coins!", B "Welcome bonus: +25 coins". `@two-user` |
| PN-RF-02 | Referral tap | Tap either push | Opens the **Wallet**; the new row has a soft sky tint for ~1 s, then settles; the balance counts up (≤600 ms) rather than jumping |
| PN-RF-03 | Referral joined push | Somebody signs up with your code (before any game) | `REFERRAL_JOINED` opens **Profile** (the invite card), not the Wallet — no coins have moved yet |
| PN-GF-01 | Gift push | Another player gifts you a shop item | "Ana sent you a gift 🎁"; the item is in your Collection (§28.3). `@two-user` |

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
| X-45 | Centered dialog shift | Open any `ui/Dialog` with input (e.g. game note, poll) → focus input | Dialog shrinks into the visual viewport above the keyboard; title + close stay pinned; only the body scrolls |
| X-46 | Bottom drawer keyboard | Open Vaul drawer with input (story comments, market item, edit game) → focus input | Drawer height clamps to `--overlay-pinned-max-height` (`min(--vv-height, layout − keyboard − offsetTop)` minus leftover safe-top); chrome stays on-screen; body/composer scrolls or sits above keyboard — the full-size sheet is not translated as a unit |
| X-46a | City selector keyboard | Find/profile/browse city sheet → focus search | Tall sheet clamps above keyboard (search not covered / not zoomed off-screen); list still scrolls; other drawers unchanged |
| X-47 | Poll creation keyboard | Game chat → attach → poll → focus question/options | Poll dialog shifts above keyboard; all fields reachable |
| X-48 | Club admin sheets keyboard | Schedule → cancel game / block slot / edit hold → focus reason/note | Sheet pushed above keyboard; submit button visible |
| X-49 | Full-page form input visibility | Create game → focus a bottom field (e.g. comment) | Page scrolls so focused field sits above keyboard with gap |
| X-50 | Story caption & text edit | Photo story editor → caption drawer / text style panel → focus | Caption drawer and style panel ride above keyboard |
| X-51 | Story DM bar keyboard | Story viewer → focus DM input (iOS/Android) | DM bar sits just above keyboard with quick reactions visible; input does not jump to header |
| X-52 | Keyboard dismiss restores layout | Any of above → dismiss keyboard | Surfaces return to resting position; no leftover bottom padding or shifted dialogs |
| X-52a | Sticker/GIF tray above keyboard | Chat → open Stickers & GIFs → focus search (iOS/Android Capacitor + mobile web) | Tray lifts and expands to fill space above keyboard; results not covered; dismiss restores compact sheet |
| X-55 | Auth login keyboard (Android web) | Mobile Chrome → `/login` → focus phone field | Form sits directly above keyboard; no dark gray scroll gap between card and keyboard |
| X-72 | Edit-game-title keyboard chrome | `@mobile` Game details → Edit details → focus name (iOS WebView) | Close + name field remain visible/tappable; overlay is not lifted off-screen |
| X-73 | Club Location search keyboard chrome | `@mobile` Create/edit Location → Select club → focus search | X stays tappable; only the club list (and not the close control) scrolls |
| X-74 | Overlay height ignores visualViewport without keyboard | Pinch-zoom or visualViewport scroll while no software keyboard | Sheet/dialog height stays at resting cap (`min(94dvh, 960px)` / 75vh); `--overlay-pinned-max-height` remains `100dvh` until `keyboard-visible` |

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
| EVENT | create-event | GD-159–170 | Going / looking RSVP | Never | CH-13 (Going+Looking) |

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

Run P0 smoke in each locale: **en**, **ru**, **es**, **sr**, **cs**, **ar**, **zh**, **id**, **hi**, **th**, **ja** — verify no layout overflow on login, Find filters, game card, chat input. For **ar**, also verify `html[dir=rtl]`, Arabic font, and mirrored chrome. For **zh/ja/th/hi**, verify glyphs render (no tofu) and sport labels use locked padel / table-tennis terminology (never “ping-pong”).

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

Leagues, live scoring multisport sample, bets, stories, game subscriptions, user teams, sessions, group settings, club admin schedule, onboarding gates (§4.2), first-run onboarding (§24.1), attendance (§9.11–§9.14), cost split (§9.2b), queue auto-fill (§9.15), weather banner (§9.16–§9.18), Live now rail (§26), club page (§27), pairs (§14.2), shop (§28), past-games subtab, bugs tracker, sync conflict, training reviews

### P3 — Edge / regression backlog

Offline queues, deep links, OAuth merge, Holland auctions, broadcast/TV modes, delete account, admin-only filters, visual regression, URL overlays, push routing (incl. §18.8b), locale matrix, entity type matrix, home Next Game widgets (`X-56`–`X-67`), game series (§25), referrals (§29), Telegram `/play` and `/live` (§30), monthly recap (§6.7)

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

## 24. Onboarding (`/welcome`)

No feature flag. The flow is gated purely on `User.onboardingCompletedAt`, which the Wave 1 migration backfilled for every pre-existing account, so only genuinely new users see it. It is a standalone route, not a tab.

### 24.1 Gating

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| ON-01 | Register lands here | Register a brand-new account | The app lands on `/welcome`, not Home; the tab bar is not visible |
| ON-02 | Completed account skips it | Account that finished the flow, cold start and warm foreground | `/` renders Home directly; `/welcome` is never visited |
| ON-03 | Completed, no enabled sport | Same account with `sportsEnabled` empty → open any protected route | Redirects to `/welcome?step=sport`; headline "Pick a sport to continue"; progress reads "Step 1 of 1"; no Skip |
| ON-04 | Sport step exits cleanly | Pick a sport → Continue | Routes back out and never re-enters the flow |
| ON-05 | No flash on slow cold start | Throttle to Slow 3G and cold-start a *completed* account ten times | `/welcome` never flashes while auth is bootstrapping. `@manual` |
| ON-06 | Failed status is not evidence | Kill the backend, cold-start a completed account | The onboarding status request fails and the user still lands on Home |
| ON-07 | Direct navigation | Open `/welcome` as a completed user | The flow renders (it is a real route), starts at Welcome, and finishing routes to the closing choice. Nothing is corrupted |

### 24.2 Frame, progress and motion

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| ON-10 | Frame anatomy | Any step | 4 px sky progress bar at the very top, Back arrow from step 2 on, Skip top-right where allowed, one `h1`, one interaction, one primary button pinned to the bottom |
| ON-11 | Progress spring | Advance, then go Back | Bar springs between steps (stiffness 260, damping 24) and springs *back* — it never jumps backwards |
| ON-12 | Reduced motion | `prefers-reduced-motion: reduce` | Bar snaps to the new width; steps appear with no slide and no fade; the Welcome mascot appears fully formed; the closing mascot does not bounce. `@manual` |
| ON-13 | Step transition | Advance a step | Slides in horizontally, 24 px, 260 ms, with a fade |
| ON-14 | RTL slide | App language العربية | Slide direction is mirrored — a forward step enters from the left. `@manual` |
| ON-15 | Screen reader | VoiceOver / TalkBack on any step | Progress bar announces "Step 3 of 6"; the step is a landmark labelled by its headline. `@manual` |
| ON-16 | Step count is per account | Account with a name and an avatar; account missing either | 6 steps and 7 steps respectively — every total derives from the visible steps, never from the raw seven |
| ON-17 | Tap targets | Skip, Back, sport tile, Make primary, Follow pill, primary button | All ≥44 px tall |
| ON-18 | Keyboard order | Web, Tab through a step | Back, Skip, every interactive element in the body, then the primary button, in visual order, each with a visible focus ring |
| ON-19 | Themes | Light / Dark / Classic / Premium on every step | Text contrast, radial gradients and sport accents all read correctly. `@manual` |

### 24.3 Steps

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| ON-20 | Welcome | Step 1 | Sport mascot on a soft radial gradient, "Let's find you a game" as the `h1`, "Two minutes to set you up." beneath, a single **Start** button, and **no Skip** |
| ON-21 | Social proof | Detected city with players | "2,400 players in Belgrade", number localised with the locale's thousands separator |
| ON-22 | Plural forms | City with exactly one player, in `ru`/`sr`/`cs` | "1 player in …" (singular) and correct 1 / 2 / 5 forms. `@manual` |
| ON-23 | No social proof | No city, a city with zero players, or a failed `/cities/:id/stats` | The line is simply absent — no "0 players", no spinner, no layout jump |
| ON-24 | Referral banner slot | Arrive from a referral link (§29.2) | The "Invited by …" banner renders here; with no referral the slot renders nothing and leaves no gap |
| ON-30 | Sport tiles | Step 2 | Six tiles, one per sport, each with the registry PNG and the localised name |
| ON-31 | Continue gated | Before selecting anything | Continue is disabled; there is no Skip on this step |
| ON-32 | First tap is primary | Tap one tile, then more | The first tap selects it *and* gives it the "Primary" tag; further taps select without moving the tag |
| ON-33 | Long-press moves primary | Long-press a selected tile ~0.5 s, then tap it | The tag moves to it; the following tap does **not** deselect it |
| ON-34 | Make primary action | Look at a selected non-primary tile | A **Make primary** text action — the accessible and keyboard path to the same result |
| ON-35 | Deselecting the primary | Deselect the primary tile; then the last tile | The tag hands over to another selected sport; clearing the last tile clears the tag and disables Continue |
| ON-36 | Accent follows primary | Move the Primary tag | Progress bar, selected tile border and primary button accent all change with it |
| ON-37 | Long-press context menu | Long-press a tile on a device | No browser/OS context menu. `@manual` |
| ON-38 | Tile a11y | Screen reader on a tile | Toggle button whose pressed state is announced. `@manual` |
| ON-40 | Name and photo, conditional | Account with a name **and** an avatar; account missing either | Never shown / shown immediately after Sport |
| ON-41 | Name is required | Look for a frame-level Skip; submit an empty first name | No Skip: the name is required. Empty → inline error "Enter your first name." tied to the field with `aria-describedby`, and the primary button disables until fixed. The photo is skippable by simply not adding one, as the helper line says |
| ON-42 | Name length | One character; then 31 characters | "Use at least 2 characters."; input stops at 30 |
| ON-43 | Last name optional | Leave it empty | Passes |
| ON-44 | Keyboard | Tap the first-name field on a device | Keyboard opens, the field stays visible and the primary button sits directly above the keyboard. `@manual` |
| ON-45 | Avatar crop | Tap the avatar → crop → confirm | The existing crop modal uploads and shows the new avatar without leaving the step |
| ON-46 | Avatar failure | Force the upload to fail | Toast; the step stays usable and never blocks Continue |
| ON-50 | Level questionnaire | Step 3 | The existing per-sport questionnaire renders inside the frame with the same question cards, and the frame shows **no** primary button (the questionnaire has its own Back / Next / Submit row) |
| ON-51 | Result screen | Answer everything and submit | Onboarding's own result screen — not the questionnaire's congratulations slide |
| ON-52 | Result content | Read it | Level counts up over ≤600 ms, the display scale is named ("On the Playtomic scale" for padel, NTRP for tennis, …), and it reads "You can adjust this any time in Profile." |
| ON-53 | Skip keeps the prompt | Skip the level step | Level stays unset and the existing questionnaire prompt on Home is untouched |
| ON-54 | No questionnaire configured | Sport with no questionnaire | Explanatory variant with a Continue button, never an empty frame |
| ON-55 | Offline submit | Submit with no network | Failure toasts and the answers stay on screen so the user can retry or skip; the flow is never stuck |
| ON-60 | City card | Step 4 | Detected city as a card: map thumbnail, city name and country, helper "We show games and players from your city.", **Yes, that is right** primary and a **Change city** text action |
| ON-61 | No coordinates | City with no coordinates | Gradient pin placeholder at the same height — no layout jump |
| ON-62 | Change city inline | Tap **Change city** | The existing city picker replaces the card *inline*; no sheet is stacked on top of the flow |
| ON-63 | Pick a city | Pick a new city; then pick the city that is already set | Saves and returns to the card showing the new city; picking the current city just returns without a request |
| ON-64 | No city at all | Account with no city | Opens straight into the picker |
| ON-65 | Skip keeps the prompt | Skip | The existing Home city prompt stays in place |
| ON-70 | Follow suggestions | Step 5 | Up to 8 rows: avatar, name (premium treatment for premium members), level badge and "12 games this month" |
| ON-71 | Follow | Tap **Follow** | Pill flips to **Following** immediately with a 200 ms scale and a check icon; under reduced motion it changes with no scale. `@manual` |
| ON-72 | Follow failure | Force a follow to fail | Pill rolls back to **Follow** and toasts; the rest of the list is untouched |
| ON-73 | Follow all | Tap **Follow all**, twice quickly | Follows every visible row then disappears; the double tap does not double-post |
| ON-74 | Exclusions | Check the list | Never includes the viewer, anyone the viewer blocked, anyone who blocked the viewer, or anyone already followed. `@two-user` |
| ON-75 | Scope | Compare against other cities and sports | Suggestions come from the viewer's city and primary sport only |
| ON-76 | Nobody to suggest | Young city with no candidates | Empty-state card, not a blank area; Skip and Continue both still work |
| ON-77 | Loading | While loading | Five shimmer rows |
| ON-78 | Count plurals | 0, 1, 2 and 5 games, in `ru`, `sr`, `cs` and `ar` | "12 games this month" is grammatically correct in every form. `@manual` |
| ON-80 | Notifications card | Step 6 on native | A card with exactly three reasons — Invites, Reminders, Free spots — and a **Turn on notifications** primary. `@manual` |
| ON-81 | OS prompt | Tap it and allow; repeat and deny | Both advance to the closing choice; neither blocks the flow. `@manual` |
| ON-82 | Not now | Tap **Not now** | Advances without prompting |
| ON-83 | Web skips the phase | Step 6 on web | The permission phase is skipped entirely; the closing choice shows straight away |
| ON-84 | Closing choice | Reach the end | Two large cards: **I want to play soon** and **Browse games** |
| ON-85 | You're set | Choose either | Brief full-screen "You're set" with the mascot bouncing for 600 ms, then routes |
| ON-86 | Destinations | **I want to play soon**; then **Browse games** | Home with the play-intent compose sheet open (`?playIntentOpen=1`); `/find` |
| ON-87 | Premium crest | Premium member | Gold crest on the "You're set" screen — and only there; every earlier step uses the normal sport mascot. `@manual` |
| ON-88 | Reduced motion exit | Reduce Motion on | "You're set" appears and routes immediately, with no bounce and no artificial delay |

### 24.4 Resume, deep links, offline and analytics

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| ON-90 | Resume | Reach step 4, force-quit, reopen | Resumes on step 4 with the progress bar filled to 4 of 6. `@manual` |
| ON-91 | Resume after Back | Go Back to step 3, quit, reopen | Resumes on step 3 |
| ON-92 | Pending deep link wins | Open a shared game link while onboarding is unfinished | The gate intercepts it and shows the flow; after the last step the app opens **that game**, not the closing choice's destination |
| ON-93 | No loop | Same, but the pending link is `/welcome` itself | The closing choice's destination is used instead |
| ON-94 | Offline banner, not the gate | Go offline mid-flow | The existing offline banner shows and **not** `NoInternetScreen`; steps keep rendering and Skip keeps working |
| ON-95 | Offline write | Offline, tap Continue on a step that needs the server | Failure toasts; the step stays usable. Nothing is lost except the resume position |
| ON-96 | Back from step 1 | Hardware back / swipe on step 1 | Nothing happens — it does not exit into a route that would bounce straight back. `@manual` |
| ON-97 | Step analytics | Walk the flow | `onboarding_step_viewed` fires exactly once per step shown, with the 1-based position and this account's total; Continue fires `onboarding_step_completed`, Skip fires `onboarding_step_skipped`, never both for the same visit |
| ON-98 | Delayed step analytics | Delay a completed/skipped request until after the next step's viewed request, then repeat after completing onboarding | All three event types appear in server logs; delayed completed/skipped events never move the saved resume position backwards or restore a completed flow's cleared step |

---

## 25. Game series (`/series/:id`)

Flag-gated with §8.6 (`VITE_GAME_SERIES_ENABLED` / `GAME_SERIES_ENABLED`). The page is **series-private**: the `↻ Weekly` card pill is public, the roster and history are not.

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| SER-01 | Hero | Open `/series/:id` for an active series | Cadence line, series name, weekday + time line and a next-occurrence tile |
| SER-02 | Regulars stack | Look at the avatar stack | Green check on every regular already PLAYING next week; each avatar carries a visually hidden "{name} confirmed" / "{name} has not confirmed" label |
| SER-03 | Stats band | First paint | Three tiles — Games, Your win rate, Streak — counting up in ≤600 ms. With no rated occurrence the win rate reads "—", not "0 %" |
| SER-04 | Reduced motion | Reduce Motion on | Numbers appear at their final value with no count-up. `@manual` |
| SER-05 | Ended series | Open an ended series | Neutral "Ended on 30 Nov" ribbon, no next-occurrence tile, no confirmation prompts; History is still browsable |
| SER-10 | Tabs | `SegmentedSwitch` **Upcoming / History / Regulars**; arrow keys | Moves between tabs |
| SER-11 | Upcoming | Open Upcoming | At most the next 4 occurrences as game cards |
| SER-12 | Skipped date | Series with a skipped week, as owner then as a regular | Dimmed row "Skipped · 8 Oct" with an **Undo** text button (owner only); Undo restores the date and the scheduler recreates the game |
| SER-13 | Planned date | Horizon date with no game yet | "Planned · 15 Oct" with the hint "Created closer to the date" |
| SER-14 | History | Open History | Past occurrences newest first with their result chips |
| SER-15 | Regulars tab | Open Regulars as owner, then as a non-owner | Each regular with games played, win rate inside the series and attendance; the owner sees a **Remove** control, other viewers do not |
| SER-16 | Empty history | Series with no past occurrence | `EmptyStateCard` "First week coming up" naming the next date; with no next date, the generic description |
| SER-20 | Series chat | Tap **Open series chat** twice | First tap creates the group channel and navigates; the second goes straight to the existing channel |
| SER-21 | End series | **End series** → confirm | Destructive confirm; then the ended ribbon, past occurrences kept, future results-free occurrences gone |
| SER-22 | Results block deletion | End a series where a future occurrence already has results | That occurrence is kept and a note says how many were kept |
| SER-23 | Non-owner | Open as a regular who is not the owner | Neither **End series** nor the per-regular **Remove**; a direct `PATCH /series/:id` returns 403 `series.notOwner` |
| SER-24 | Stranger | Open a series you have no relationship with | `GET /series/:id` answers 403 `series.notAMember` and the page shows the not-found empty state — the roster, the occurrence list and the chat id never reach a non-insider |
| SER-30 | Loading | Throttle and open | Skeleton hero plus three card skeletons — never a spinner |
| SER-31 | Missing series | Open a deleted or unknown id | "Series not found" empty state with a **Try again** action |
| SER-32 | Tap targets | Measure every control | ≥44 px and labelled |
| SER-33 | Themes | Light / Dark / Classic / Premium | Hero gradient, check badges and dimmed skipped rows all keep 4.5:1 text contrast |
| SER-34 | RTL | App language العربية | Whole page mirrors; the check badge sits on the inline-end of each avatar |
| SER-35 | Flag off | `VITE_GAME_SERIES_ENABLED=false` | `/series/:id` renders nothing and makes no request |
| SER-40 | Profile entry point | Profile → Statistics, as a series **owner** and as a plain **regular** | A "Your regular games" row lists every series you belong to, ended ones last; tapping a card opens `/series/:id`. A user in no series sees no row at all |
| SER-41 | Cap link lands somewhere | Own 10 active series → Create game → Repeat → **Manage your series** | Lands on Profile → Statistics with the "Your regular games" row on screen — never a page with nothing about series on it |
| SER-42 | Series line under the title | Open an occurrence, signed in and then **signed out** | "Part of *X* · week N" sits directly under the game title in both cases and links to the series page |
| SER-43 | Series chat from the occurrence | Open an occurrence as the owner, tap **Open series chat**; repeat as a regular | The owner's first tap creates the channel; a regular opens the existing one, and gets a plain "not open yet" toast when the owner never created it |
| SER-44 | Scope note before the tap | Edit an occurrence, choose **This and future games** while a future occurrence already has results | An inline amber note names how many occurrences will be left alone — visible *before* Apply, not as a toast afterwards |

---

## 26. Live now

No feature flag: the rail is data-driven and simply absent when the city has nothing live. Everything derives from one predicate — public **and** in progress **and** `showOnLiveRail` — so the rail, the game-details Live block (§9.19), the spectator-token mint and Telegram `/live` (§30.3) must always agree.

### 26.1 Find rail

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LN-01 | Nothing live | City with no public game in progress | No rail at all on Find: no empty card, no header, no reserved space; the calendar sits where it always did |
| LN-02 | Rail appears | Start live scoring on a public game in the viewer's city, reload Find | Rail **above the calendar** with a red `● LIVE` dot, the label "Live now" and a count |
| LN-03 | Reveal motion | Watch the reveal; then with `prefers-reduced-motion: reduce` | 240 ms height/opacity fade; under reduced motion it simply appears, fully formed. `@manual` |
| LN-04 | Live dot | Watch the dot; then with reduced motion | Breathes over 2 s; completely static under reduced motion. `@manual` |
| LN-05 | Desktop split | `@desktop` Find in calendar mode | Rail at the **top of the games column** (right panel), above the events rail — not in the calendar column |
| LN-06 | Carousel | Two or more live games | Horizontal snap carousel of 240 px cards; swiping snaps to card boundaries |
| LN-07 | Single game | Exactly one live game | Full-width variant with a **Watch** button on the end side instead of a carousel |
| LN-08 | Cap | Eleven live games in the city | Find shows at most 10 cards |
| LN-09 | Keyboard | Tab into the carousel → ArrowRight / ArrowLeft | Scrolls one card per press with a visible focus ring |
| LN-10 | RTL | App language العربية | Carousel scrolls in the mirrored direction and the card internals mirror; nothing clipped off the start edge. `@manual` |

### 26.2 Score card

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LN-20 | Card content | Look at a card | Club avatar + club · court top-left, score block centred in tabular numerals, both sides as two-avatar stacks with names, "Started 23 min ago" as the footer |
| LN-21 | Rating icon | Rated game vs unrated | Small rating icon in the header only for the rated one |
| LN-22 | Score motion | Score a point on the live board in another session | The changed digit slides vertically (200 ms) and the leading side glows for 400 ms; the unchanged digit does not move. `@two-user` |
| LN-23 | Reduced motion | Repeat LN-22 with reduced motion | Digit changes instantly, no glow, new value correct. `@manual` |
| LN-24 | Long names | Card with long player names | Truncate with an ellipsis rather than wrapping or pushing the score block off centre |
| LN-25 | First set in progress | Game with no completed sets | No set pills, only the current game score |
| LN-26 | Screen reader | VoiceOver / TalkBack on the score block | One sentence, e.g. "Marko and Ana lead 6–4, 3–2". The live dot is not announced. `@manual` |

### 26.3 Loading, socket loss and ordering

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LN-30 | Skeletons | Throttle the network and open Find | Exactly two score-card skeletons with shimmering digit blocks; the header dot is already live |
| LN-31 | Socket loss | Kill the socket (airplane mode, or stop the backend) with the rail on screen | Each card keeps its last score and the footer switches to a small grey "Reconnecting". Nothing blanks out, no card disappears. `@manual` |
| LN-32 | Recovery | Restore the connection | Caption clears and scores catch up — the rail refetches, because frames missed while disconnected are not replayed. `@manual` |
| LN-33 | Your own game first | Viewer is PLAYING in one of the live games | That card is **first** on Find and carries a "You" tag |
| LN-34 | Your season next | Viewer plays in a league season that has a live fixture | That fixture sorts ahead of unrelated live games, but after the viewer's own game. `@two-user` |
| LN-35 | No room leaks | Navigate away from Find and back several times | No duplicate socket rooms retained — membership is ref-counted and released on unmount. `@manual` |
| LN-36 | Out-of-order frames | Replay an older socket frame after a newer one | It is dropped: only a strictly greater revision is applied, so the score never rolls backwards |

### 26.4 Broadcast

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LN-40 | Non-participant watch | Tap a card as a non-participant | The broadcast page opens and shows the live board — no "not allowed" error, no login wall |
| LN-41 | Shared element | Watch the transition; then with reduced motion | Score block scales into the broadcast header; under reduced motion the broadcast simply appears. `@manual` |
| LN-42 | Signed-out link | Copy the `?matchId=…&spectatorToken=…` URL into a signed-out browser | The board still loads |
| LN-43 | Spectator strip | Look at the strip | Back, `Live · Padel Centar · court 3`, and an overflow button. Back returns to the game page, not out of the app |
| LN-44 | Follow from overflow | Open the overflow → tap a player | Every player from both sides is listed; tapping one gives a success toast, turns the row into a checkmark and adds the player to the viewer's following list |
| LN-45 | Follow failure | Tap a player already followed, or follow with the network off | Error toast; the row does not falsely claim success |
| LN-46 | Participant has no strip | Participant opens their own game's broadcast from the game page (no token) | No spectator strip |
| LN-47 | Rail privacy | Private game; game with **Show on Live now** off; game whose results are FINAL | None of them ever appear on the rail, and the spectator endpoint answers a plain 404 so it cannot be used to probe whether a private game exists |

### 26.5 Home rail

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| LN-50 | Suppressed by your own day | Viewer has a game today (their own city day) while the city has live games | Home shows **no** live rail |
| LN-51 | Shown on an empty day | Viewer has no game today and the city has live games | Rail immediately after the action grid, with the softer header "Live in Belgrade" and at most 3 cards |
| LN-52 | See all | Tap **See all on Find** | Lands on Find with the rail visible. The Find rail has no such link |
| LN-53 | City day, not device day | Game at 00:30 local while the device is in another timezone | Suppression is computed in the viewer's *city* day. `@manual` |

---

## 27. Club page (`/clubs/:id`)

No feature flag. The page is **guest-readable**: it is not wrapped in `ProtectedRoute` and it is on the offline-gate exception list, so run every case **signed out** as well as signed in.

### 27.1 Entry points and routing

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CLB-01 | From game details | Game details → chevron beside the club name in the location row | `/clubs/<id>` opens; the game is still behind it in history and Back returns to it |
| CLB-02 | From the club picker | Create-game → club picker → select a club | **Open club page** row at the top of the detail panel; tapping it closes the picker and lands on the club page |
| CLB-03 | From Find filters | Find → advanced filters → a club chip's trailing chevron | Opens the club page; tapping the chip **body** still toggles the filter and does not navigate (`F-CLB-01`) |
| CLB-04 | Deep link | Paste `https://bandeja.me/clubs/<id>` into Telegram and open it with the app installed | The app opens directly on the club page, not the home tab. `@manual` |
| CLB-05 | Signed out | Open `/clubs/<id>` in a signed-out browser | Page renders in full — no login wall, no redirect |
| CLB-06 | Unknown club | Open `/clubs/does-not-exist` | "This club isn't available" with a **Browse clubs** button landing on Find |
| CLB-07 | Deactivated club | Open a deactivated club's link | Same not-available empty state, never a stale page |

### 27.2 Hero and sticky header

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CLB-10 | Photo gallery | Club with several photos; swipe | First photo full-bleed edge to edge with page dots; the gallery snaps photo to photo and the active dot widens |
| CLB-11 | Gallery keyboard | Tab into it → ArrowRight / ArrowLeft, Home, End | Pages one photo at a time and stops at each end; Home/End jump to first and last |
| CLB-12 | Gallery a11y | VoiceOver / TalkBack | Announced as a labelled region ("Photos of &lt;club&gt;"); page changes announce "Photo 2 of 5". `@manual` |
| CLB-13 | No photos | Club with none | Gradient hero, no dots, no empty image frame; name and rating still legible |
| CLB-14 | Avatar ring | Look at the club avatar | Overlaps the bottom edge of the hero with a ring that reads against both a light and a dark photo |
| CLB-15 | Rating | Club with reviews in `en` then `ru`/`es`/`cs`; then a club with none | Stars **and** text ("4.6 · 38 reviews"), localised (`4,6`); with no reviews, "No reviews yet" and no stars |
| CLB-16 | Premium stars | Signed in as a premium member, then as a standard user | Gold stars vs amber/white. `@manual` |
| CLB-17 | Lazy images | Slow 3G | Only the first photo is eager; the rest load as they scroll in. The page paints before the occupancy strip and the games list arrive. `@manual` |
| CLB-20 | Sticky bar | Scroll down ~200 px, then back to the top | Hero collapses into a compact sticky bar with back, club name and the favourite heart; scrolling back fades it out and it is no longer focusable |
| CLB-21 | Hidden bar is untabbable | Tab while the bar is hidden | Focus never lands on its buttons |
| CLB-22 | Parallax | Scroll slowly | Hero image drifts at roughly a third of the page's speed |
| CLB-23 | Reduced motion | `prefers-reduced-motion: reduce` | No parallax; sections appear fully formed with no 12 px lift; the favourite heart changes state without the bounce. The sticky header still appears and disappears. `@manual` |
| CLB-24 | Reveal once | Scroll past a section twice | It reveals once, with a 12 px lift, and does not re-animate |

### 27.3 Actions and today at a glance

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CLB-30 | Actions, no integration | Signed in, club with no booking integration | Three buttons: **Create game here** (primary), **Directions**, and no **Book** |
| CLB-31 | Actions with booking | Signed in, club with a booking integration | **Book** appears between Create and Directions |
| CLB-32 | Create here | Tap **Create game here** | The create-game wizard opens with this club preselected |
| CLB-33 | Directions | Tap **Directions** | The OS maps app opens at the club's coordinates, or its address when it has none. `@manual` |
| CLB-34 | Manage | Signed in as a club admin of this club; then as a non-admin who favourited it | A fourth **Manage** button opening `/my-clubs`; the non-admin never sees it |
| CLB-35 | Signed-out actions | Signed out, tap **Create game here** or **Book** | Goes to login; after signing in the app returns to `/clubs/<id>` |
| CLB-36 | Button sizing | 320 px-wide phone | Every action button ≥44 px tall and its label truncates rather than wrapping to two lines |
| CLB-40 | Occupancy strip | Club with a booking integration and a fresh snapshot | Horizontal strip of court chips, each with a green/grey hour bar and an "n hours free" caption |
| CLB-41 | No integration, no strip | Club with no integration | No strip at all, and no request for it in the network log |
| CLB-42 | Snapshot age | Club with a snapshot timestamp, then one without | "Updated 2 minutes ago" caption (localised relative time) / no caption |
| CLB-43 | Chip → create | Tap a court chip | Create-game opens with **club, court and date** prefilled for today |
| CLB-44 | Signed-out chip | Signed out, tap a court chip | Goes to login and returns here afterwards |
| CLB-45 | Not colour-only | Read a chip and its accessible label | Free/busy is stated in text ("3 hours free"); the label reads "&lt;court&gt;, 3 of 14 hours free today" |
| CLB-46 | Hard blocks only | A game booked at the club vs a game without a booked court | Only the booked one paints its hour grey |
| CLB-47 | Endpoint failure | Force the snapshot endpoint to 500 | The strip is simply absent; the rest of the page is unaffected. `@manual` |
| CLB-48 | NSPadel | NSPadel club | Strip built from games and club holds only — never a request to the club's Supabase URL. Verify in the network log. `@manual` |

### 27.4 Games, courts, info, regulars, reviews

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CLB-50 | Upcoming games | Club with public games | `GameCard`s grouped under day headings, nearest day first, at most 10 cards |
| CLB-51 | See all on Find | Club with more than 10 upcoming games → tap **See all on Find** | Opens `/find?clubIds=<id>` with the club filter applied and the filters panel open |
| CLB-52 | Direct `clubIds` link | Land on `/find?clubIds=<id>`; then navigate to a plain `/find` | The filter is applied; a plain `/find` afterwards does **not** wipe a club filter the player set by hand |
| CLB-53 | No games | Club with no public games | "No public games yet" with a create action |
| CLB-54 | Signed-out games | Signed out | The list still renders; join buttons behave like the rest of the signed-out app |
| CLB-55 | Private game visibility | Private game the viewer is in | Appears for that viewer and for nobody else. `@two-user` |
| CLB-56 | Other city | Viewer whose current city differs from the club's | Still sees the club's games |
| CLB-60 | Courts grid | Open Courts | Name, an indoor/outdoor icon **and** the word, the surface and the sport; accessible label "Court 3, Indoor, Artificial grass, Padel" |
| CLB-61 | Camera glyph | Court with a `webCameraUrl` vs one without | Camera glyph only on the first |
| CLB-62 | Info rows | Open Info | Mini map, address, phone, website and email as tappable rows, each ≥44 px; a missing field simply omits its row |
| CLB-63 | Opening hours | Read the hours | One honest "Open 08:00 – 23:00 / same hours every day" line. There is **no** invented per-weekday table |
| CLB-64 | Amenities | Compare with the club picker's detail panel | Same amenities, as chips |
| CLB-65 | Cancellation policy | Tap the policy header | Collapsed by default; expands with a rotating chevron; the control reports `aria-expanded` |
| CLB-66 | Regulars | Open Regulars; tap a face | Up to 8 faces; tapping one opens the normal player card |
| CLB-67 | Blocks honoured | Block a player who plays at this club, reload | That player is gone from the row and the row is still full. `@two-user` |
| CLB-68 | No regulars | Club with no recent games | No regulars row at all |
| CLB-69 | Reviews | Signed in with an eligible game at this club, then without one, then signed out | **Write a review** / reviews only / a sign-in prompt that returns to the club page |

### 27.5 Share, offline, themes and the payload boundary

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| CLB-70 | Share | Tap **Share** | Offers `https://bandeja.me/clubs/<id>` — the public web origin, never `localhost` or a deep-link scheme |
| CLB-71 | Offline, cached | Open the page, go offline, reopen it | Cached page renders with the offline banner on top; no error screen |
| CLB-72 | Offline, cold | Go offline before ever opening the page | Not-available empty state, not a spinner that never resolves |
| CLB-73 | Themes | Light / Dark / Classic / Premium | Hero gradient, sticky header, free/busy bar and court tiles all keep 4.5:1 text contrast. `@manual` |
| CLB-74 | RTL | App language العربية | Hero, sticky header, court strip and regulars row all mirror; the gallery pages in reading order; nothing clipped on the start edge. `@manual` |
| CLB-75 | Favourite | Favourite from the club page, then open Find | The favourite-clubs filter includes it |
| CLB-76 | Favourite offline | Favourite while offline | The heart reverts and an error toast appears |
| CLB-80 | Projection whitelist | Inspect the `/clubs/:id/public` response in devtools | **No** `integrationConfig`, `ptMeta`, `normalizedName` or `externalCourtId`; `booking` has exactly `available` and `provider` |
| CLB-81 | Viewer flags | Inspect the same response signed out | `isFavorite` and `isAdmin` are both `false`, never absent |
| CLB-82 | Tampering buys nothing | Sign in as a non-admin and force `isAdmin` client-side | No Manage button renders, and `/my-clubs` is still protected server-side |
| CLB-83 | Regulars payload | Inspect `/clubs/:id/regulars` | No play counts and no game ids. `@manual` |

---

## 28. Shop and collection (`/shop`)

Gated on `VITE_SHOP_ENABLED` (frontend) and `SHOP_ENABLED` (backend); with either `false` the whole surface must be absent, including the request (`SH-70`). Cosmetics are bought with **coins only** — there must be no top-up, IAP or price in currency anywhere (`SH-73`).

Seeding: Admin → **Goods** needs at least one active frame, one chat accent, one name colour, one premium-only item and one featured item, with asset keys matching classes in `Frontend/src/styles/collection.css`.

Entry points: `PR-SH-01`–`PR-SH-04` in §13.3.

### 28.1 Shop screen

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| SH-01 | Header | Open `/shop` | Title on the inline-start, balance pill pinned to the inline-end, reading as "Balance: 500 coins" to a screen reader — never a bare number |
| SH-02 | Featured rail | Catalogue with a featured item, then with none | Rail above the chips, scrolling horizontally with snap points; with no featured item the rail is absent entirely (no empty heading) |
| SH-03 | Category chips | Look at the chips; arrow-key between them; select one | **All · Frames · Chat · Stickers · Name colours**; arrows move; selecting filters the grid without resetting the page scroll |
| SH-04 | Grid at 375 px | `@mobile` | Exactly two columns; names do not clip; price pill and state badge stay on one row |
| SH-05 | Live previews | Look at each card kind | Frame drawn around **the viewer's own** avatar, chat accent on a sample bubble, name colour on the viewer's own name, sticker pack as its preview art (or three placeholder tiles when no art is uploaded) |
| SH-06 | States read as text | Cards in each state | **Buy**, **Owned**, **Equipped**, and a padlock with **Premium** for premium-only items. Premium-only cards carry a thin gold border in Light, Dark, Classic **and** Premium |
| SH-07 | Loading | While loading | Shimmer cards, not a spinner or a blank screen |
| SH-08 | Empty catalogue | Deactivate every item in Admin | "The shop opens soon" with the mascot empty-state card and no grid |
| SH-09 | Network failure | Kill the network and reload | Error card with a **Retry** button that refetches. `@manual` |

### 28.2 Item sheet and purchase

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| SH-20 | Sheet | Tap a card | Bottom sheet with the item name, the rotating preview, the description, the price and the primary action |
| SH-21 | Preview rotation | Watch the preview | Rotates **profile → player row → chat bubble** every 2 s with a crossfade; the dots track the current context |
| SH-22 | Pause | Tap **Pause**, then again | Rotation freezes and the control flips to **Play** with `aria-pressed` following; tapping again resumes |
| SH-23 | Reduced motion | OS Reduce motion on | No rotation, profile context only, and the pause control is not rendered. `@manual` |
| SH-24 | Preview alt text | Screen reader on the preview | "Neon Frame, shown on your profile picture" |
| SH-25 | Affordable | Enough coins | Primary reads **Buy for 120 coins** |
| SH-26 | Too few coins | Not enough coins | Button disabled, reading **Need 40 more coins**; a **How do I earn coins?** link expands a line naming bets, transfers and referral rewards, and states that coins can never be bought with money |
| SH-27 | Premium-only | Premium-only item, non-premium viewer | **Premium members only** badge and a disabled button; there is no way to reach the confirm dialog |
| SH-28 | Owned / equipped | After buying; then after equipping | Primary becomes **Equip**, then **Unequip** |
| SH-29 | Sheet chrome | Software keyboard up; then Android back | Actions sit above `--overlay-bottom-inset`; back closes the sheet, not the page |
| SH-30 | Confirm dialog | Tap **Buy for 120 coins** | Compact dialog "Buy Neon Frame for 120 coins?" with **Balance after: 380** and **Confirm** / **Cancel** |
| SH-31 | Cancel | Tap Cancel | Dialog closes and nothing is spent; the balance pill is unchanged |
| SH-32 | Confirm | Tap Confirm | A 500 ms shine sweep crosses the preview, the button morphs to **Equip**, a toast reads "Added to your collection", and the balance **counts down** |
| SH-33 | Reduced motion | Reduce motion on | No shine; the balance jumps straight to the new value. `@manual` |
| SH-34 | Double buy race | Buy the same item from two devices at once | Exactly one purchase succeeds; the loser sees "You already own this item." inline **inside the still-open dialog**, and the balance shown is the true one (re-fetched). `@two-user` |
| SH-35 | Mid-tap failure | Stop the backend mid-tap | The dialog stays open with an inline error and the coin balance is re-read. No coins are lost — coins spent and item granted are the same write, and the conditional wallet decrement is what authorises the spend, so a concurrent purchase can never overdraw. `@manual` |
| SH-36 | Wallet row | Wallet → Transactions | The purchase appears as a **PURCHASE** row carrying the item name |

### 28.3 Collection and where items show

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| SH-40 | Collection block | Profile → Appearance | **Collection** block below Currency, with owned items as small tiles and a **Get more styles** link |
| SH-41 | Nothing owned | Empty collection | "Nothing yet. Pick up a frame or a colour in the shop." |
| SH-42 | Equip | Tap a tile | Check appears on the tile, `aria-pressed` becomes `true`, and the profile avatar above gains the frame **immediately** without a reload |
| SH-43 | One per kind | Equip a second frame | The first unequips — only ever one tile per kind is checked |
| SH-44 | Unequip | Tap the equipped tile again | Unequips; the avatar returns to plain |
| SH-45 | Gift sparkle | Receive a gift from another player, open the block twice | Sparkle the first time, none on later opens. `@two-user` |
| SH-46 | Tile a11y | Measure and read a tile | ≥44 px; accessible name "&lt;item&gt;. Equipped" or "&lt;item&gt;. Tap to equip" |
| SH-50 | Frame everywhere | Equip a frame | Rings the viewer's avatar on profile, the player card, game roster rows, chat avatars (thinner ring on the small variant) and leaderboard rows |
| SH-51 | Visible to others | Another player's equipped frame and name colour | Visible to everybody; updates for a viewer after a refresh. `@two-user` |
| SH-52 | Premium beats a bought colour | Equipped name colour on a member showing premium status | The gold glow wins — a bought colour must not imitate membership |
| SH-53 | Chat accent is private | Equipped chat accent, both sides of a conversation | Tints **only the owner's own outgoing bubbles, in the owner's own session**; the other side sees standard bubbles. `@two-user` |
| SH-54 | Sticker pack gating | Sticker picker before and after buying a gated pack | The pack is absent before purchase — not a greyed-out paywall — and present after |
| SH-55 | RTL | App language العربية | Frame ring, balance pill, price pills, shine sweep and sheet actions all mirror. `@manual` |

### 28.4 Gifting, admin and flags

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| SH-60 | Gift picker | Item sheet → **Gift to a friend**; type to filter | Lists **followers first**, then people the viewer follows; typing filters locally with no request per keystroke |
| SH-61 | Gift confirm | Pick a friend | "Gift Neon Frame to Ana for 120 coins?"; Confirm charges the **giver** |
| SH-62 | Gift lands | Recipient checks their Collection | Push "Ana sent you a gift 🎁" and the item is in their Collection; the giver does **not** own a copy. `@two-user` |
| SH-63 | Already owned | Gift an item the recipient already owns | Clear inline error; nothing is spent |
| SH-64 | Admin create | Admin → **Goods**: create an item (kind, name, asset key, price, flags), reopen it, upload preview art, edit the price | The item appears in the shop and the price change is reflected. `@manual` |
| SH-65 | Withdraw refunds once | Admin → **Goods** → **Withdraw** on an item with owners | "Refund 120 coins to 37 owners (4440 coins in total)…"; confirming refunds every owner exactly once, removes the item from their collections and clears it from their profiles. Running Withdraw again refunds nobody. `@manual` |
| SH-66 | Re-buy after re-activation | Refund an owner via Withdraw, re-activate the item, let that owner buy it again, then Withdraw again | They are refunded a second time — idempotency is per ownership instance, not per `(user, item)` lifetime. `@manual` |
| SH-70 | Flag off | `VITE_SHOP_ENABLED=false` | No Wallet button, no Collection block, no `/shop` content, and **no request**. `@manual` |
| SH-72 | Goods API is admin-only | Non-admin account calling any `/api/goods` route | **403** for create, edit, delete, withdraw and list alike. Player-facing reads live on `/api/shop`. `@manual` |
| SH-73 | Coins stay non-purchasable | Search the whole shop surface | No top-up, no IAP, no price in currency anywhere. `@manual` |

---

## 29. Referrals

No feature flag. Referrals ride the existing link-to-app attribution row (§18.6), so the **first-touch** rule is inherited verbatim: whoever brought the user is decided at first touch and never overwritten. The cap (50 rewarded invites) and the 7-day window are the only other gates. Profile card: `PR-RF-01`–`PR-RF-08` in §13.3. Payout pushes: `PN-RF-01`–`PN-RF-03` in §18.8.

### 29.1 Landing page capture

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| RF-01 | Invited-by chip | Open `https://bandeja.me/link-to-app/?ref=BNDJ-7K2Q` on iOS Safari | "Invited by Marko" chip above the store buttons with the referrer's avatar (or initial). The store buttons are unchanged and are never blocked by the chip request |
| RF-02 | Unknown code | Same URL with a code that does not exist | **No chip**, no error, store buttons normal. `@manual` |
| RF-03 | Invalid alphabet | `?ref=BNDJ-7K2O` (an `O`, not in the alphabet) | No chip, and `localStorage['bandeja.attribution'].ref` stays `null`. The code is rejected, never "corrected" — the alphabet excludes `0`, `O`, `1` and `I`, so a code containing one is a typo, not a near-miss |
| RF-04 | First touch wins | Open with `?ref=BNDJ-7K2Q`, then again with `?ref=AAAA-2222` | Stored `ref` is still `BNDJ7K2Q` |
| RF-05 | Store redirect carries it | Tap a store button | `/api/public/link-to-app/go/<choice>` carries both `aid=` and `ref=BNDJ-7K2Q`; clipboard unchanged |
| RF-06 | Auto-redirect platforms | Android / desktop | The page auto-redirects after ~500 ms so the chip may only flash; the redirect target must still carry `ref`. `@manual` |

### 29.2 Registration and the 7-day window

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| RF-10 | Captured referral banner | Arrive from a referral link, open Register | A quiet banner with the referrer's avatar and "You'll get 25 coins after your first game". No code field is offered |
| RF-11 | Referrer sees the join | Complete registration → referrer opens Profile → Invite friends | The new account shows as **Joined** (sky chip), not **Played** |
| RF-12 | Manual code entry | Arrive with no referral, open Register → tap "Have a code?" | A collapsed text link first, then a monospace, uppercase field |
| RF-13 | Input masking | Type `bndj7k2q`; then type `0`, `O`, `1`, `I` | Renders `BNDJ-7K2Q` with the dash inserted after the 4th character; the excluded characters produce nothing at all |
| RF-14 | Debounced lookup | Stop typing a valid code | After ~300 ms a spinner, then a green check and "Invited by Marko". Only one request fires per pause, and a slow earlier response never overwrites a newer one |
| RF-15 | Non-existent code | Type a complete but unknown code | Red field error "That code isn't valid" |
| RF-16 | Own code | Type your own code while signed in on the Welcome step | "You can't use your own code", shown instantly with **no** network request |
| RF-17 | Banner on Welcome | Register with a referral, then open the onboarding Welcome step | The same banner appears there (`ON-24`) |
| RF-20 | Inside the window | Account created 6 days ago with no referrer | "Have a code?" is offered and a valid code is accepted |
| RF-21 | Outside the window | Account created 8 days ago with no referrer | The field is **gone**, replaced by "Referral codes can be added within 7 days of joining". The window is enforced on the attach path too, not only on manual entry. `@manual` (needs a back-dated `User.createdAt`) |
| RF-22 | Already referred | Account that already has a referrer | Neither the field nor the caption; only the "Invited by …" banner |

### 29.3 Your invites and inviting into a game

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| RF-30 | Empty list | No invites | "No invites yet. Your first friend is one tap away." |
| RF-31 | Pending | A link opened but never signed up | Row reading **Pending** with an **Invited** (grey) chip |
| RF-32 | Joined | Signed up but has not played | Their name with a **Joined** (sky) chip |
| RF-33 | Played | After their first finished game | **Played · +50** (green) |
| RF-34 | Never colour-only | Greyscale screenshot of the list | Every chip carries text |
| RF-35 | RTL | App language العربية | List, chips and card illustration mirror; nothing overlaps and no element is pinned to the wrong edge |
| RF-40 | Invite into a game | Game details → share icon | The sheet includes **Invite a friend to this game** |
| RF-41 | Game invite URL | Tap it | The shared URL is the game URL plus `?ref=<your code>`; the sheet closes after a successful share or copy |
| RF-42 | Signed-out capture | Open that URL in a signed-out browser and register from there | The game page loads, the referral is captured and the referrer is attached |
| RF-43 | Signed out has no code | Signed out, open a game share sheet | The invite option is **not** rendered; the plain copy field still works |
| RF-44 | Empties use the referral link | Home / player-list "Invite a friend to Bandeja" empties | The same share action, with the referral link rather than the bare marketing URL |
| RF-45 | Telegram `/invite` | `/invite` in a private chat, then in a group | Private: the personal link, the code in a monospace span and the two amounts. Group: no personal link. `@manual` |
| RF-46 | Telegram menu | `/` command menu | Lists `invite` with a localized description. `@manual` |

### 29.4 The reward moment, abuse and Admin

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| RF-50 | Wallet row copy | Open the Wallet after a payout | The row reads "Referral bonus" in the active language, never the raw `REFERRAL` |
| RF-51 | No confetti | Watch the payout moment | None anywhere |
| RF-52 | Reduced motion | Reduce Motion on | The row shows the tint and the balance its final value immediately — no transition, no count-up. `@manual` |
| RF-53 | Re-finalize pays once | Re-enter the same game's results so it re-finalizes | **No** second payout, no second push, both balances unchanged. `@two-user` |
| RF-54 | List updates | Check the referrer's invites list | B now shows as **Played · +50** |
| RF-55 | Wallet themes | Light / Dark / Classic / Premium | The highlighted row is legible in all four and the tint never swallows the amount |
| RF-60 | Own code refused | Enter your own code | "You can't use your own code" |
| RF-61 | Shared device | Two accounts on the same device (same push registration) | The code is refused with "That code can't be used from this device"; no `ReferralReward` row is created. The abuse rules are evaluated twice — at attach and again immediately before the coins move. `@two-user` |
| RF-62 | One message for every overlap | Try a shared phone, a shared Telegram id and a shared push token | All identity overlaps collapse to the same user-facing message — naming the matched signal would confirm a second account exists |
| RF-63 | Cap reached | Referrer at 50 rewarded invites | Card shows "You've reached 50 rewarded invites. Keep inviting, no more coins" **and the Share invite button is still enabled** |
| RF-64 | Past the cap | An invite created past the cap | Still appears as Joined/Played in the list, but with no `+50` |
| RF-65 | Admin table | Admin → Referrals | Referrer, code, invited, joined, played, rewarded, coins and last join. Date filters narrow by **invite** date, not payout date |
| RF-66 | Admin export | Admin → Referrals → Export CSV | `referrals.csv` downloads with the same rows as on screen, honouring the active filters |
| RF-67 | Revoke | Admin → Referrals → Payouts → Revoke | The row flips to "Revoked", the referrer's rewarded count drops by one and their cap slot is freed. Coins already granted are **not** clawed back |
| RF-68 | Public endpoint projection | `GET /api/public/referral/<code>` in a browser | Exactly `found`, `firstName` and `avatar`. No id, no last name, no phone, no city |
| RF-69 | Rate limit | Hammer that endpoint | 429 rather than answering indefinitely |

---

## 30. Telegram bot commands

Everything in this section is `@manual`: it needs a real bot, a real Telegram client and — for the group cases — a real group wired to a `City.telegramGroupId`. `@two-user` is marked where a second human is also required.

### 30.1 Command menu

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| TG-01 | Menu contents | Private chat → tap `/` | Lists `play`, `live`, `games`, `my`, `login`, `auth`, `start`, each with a description |
| TG-02 | Localized menu | Switch the Telegram client language to `ru`, then `ar`, then `ja` | Descriptions follow the client language in all three |
| TG-03 | Survives a restart | Restart the backend and reopen the menu | Re-registered and still complete — `setMyCommands` replaces the whole list per scope, so a missing command means it was dropped from the registration module |

### 30.2 `/play`

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| TG-10 | Day question | Linked user with a home city and a chosen sport sends `/play` | One message: "When do you want to play? 🎾" with a single row **Today · Tomorrow · {Weekday}**, the third being the real weekday name two days out, in the user's language |
| TG-11 | Time question | Tap **Tomorrow** | The **same message** is edited in place (no new message) to "Tomorrow · what time?" with a 2×2 keyboard **Anytime · Morning / Afternoon · Evening** and a **← Back** row |
| TG-12 | Back | Tap **← Back** | The same message returns to the day question |
| TG-13 | Confirmation | Tap **Evening** | The message becomes "✅ You're looking to play", "🎾 Padel · Belgrade", "📅 Tomorrow · Evening", the "we'll message you" line, and **Open in app** / **Stop looking** |
| TG-14 | Intent really exists | Check the app's Looking surface | An OPEN intent with tomorrow's date key and the EVENING period, in the user's home city and primary sport |
| TG-15 | No duplicate intent | Send `/play` again | The confirmation block for the **existing** intent; no second intent |
| TG-16 | Stop looking | Tap **Stop looking** | Message edits to "Stopped looking" with a **Look again** button; the intent is cancelled in the app |
| TG-17 | Look again | Tap **Look again** | The day question returns in the same message and the flow can be completed again |
| TG-18 | Idempotent cancel | Tap **Stop looking** twice quickly, or after cancelling in the app | Still edits to "Stopped looking"; no error toast, no stuck spinner |
| TG-19 | Open in app | Tap **Open in app**, signed in and signed out | Opens the play-intent surface; the login hop still lands there |
| TG-20 | Callbacks always answered | Tap any button | The button never spins indefinitely |
| TG-21 | Unlinked account | `/play` from an account not linked to Bandeja | The standard login-link message (the same one `/login` sends), not a play keyboard |
| TG-22 | No city | Linked user with no home city | "Set your city in the app first." with an **Open profile** button |
| TG-23 | No chosen sport | Linked user who never chose a primary sport | The same guidance |
| TG-24 | Stale button | Tap a day/time button from an older message in either of the two cases above | An alert with the same guidance rather than a crash |
| TG-25 | Rate limit | Send `/play` 15 times in a minute | The first 10 answer, the rest are silently dropped, and the bot recovers a minute later |
| TG-30 | Group card | `/play` in a group wired to a city | "🎾 Marko is looking to play … in Belgrade" with **I'm in too** and **Open app** |
| TG-31 | Per-user 6 h limit | `/play` again in the same group within 6 h | "You already posted here recently." and **no** second card |
| TG-32 | Limit is per user | A different member sends `/play` in the same group | Their card posts. `@two-user` |
| TG-33 | I'm in too | Another member taps **I'm in too** | Callback answer plus a private confirmation block with **Stop looking**; their intent matches the poster's day and time window. `@two-user` |
| TG-34 | Never opened a DM | A member who has never opened a chat with the bot taps **I'm in too** | The callback answer still confirms and the intent is still created; the failed DM does not crash. `@two-user` |
| TG-35 | Tapper with no city | A member without a home city taps **I'm in too** | Alert with the city guidance; no intent created. `@two-user` |
| TG-36 | Markdown-safe names | A poster whose name contains `*` or `_` | The message renders as plain text, not broken bold/italic |
| TG-37 | Group with no city | `/play` in a group not wired to a city | Still works for a linked poster, using that poster's own home city |

### 30.3 `/live`

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| TG-40 | Live list | With a public game being scored in the user's city, send `/live` privately | Header "🔴 Live now in Belgrade", then one block per game: club · court / `Marko / Ana  6-4 3-2  Luka / Ivan` / "Started 23 min ago", and a footer "Updated just now · /live to refresh" |
| TG-41 | Monospace alignment | Compare two blocks | The score is monospace and the columns line up |
| TG-42 | Watch button | Tap a block's **Watch** button, including from a signed-out browser | The broadcast page opens and the live board renders |
| TG-43 | Long names | Names longer than 12 characters | Truncated with an ellipsis; the line does not wrap |
| TG-44 | Nothing live | No live game | "Nothing live right now. /games shows what's coming up." and no buttons |
| TG-45 | Cap | Six or more live games | At most five blocks |
| TG-46 | Privacy | A private live game, and a live game with **Show on Live now** off | Neither ever appears — `/live` reads the same predicate as the in-app rail (§26) |
| TG-47 | Group | `/live` in a group wired to a city | The same reply for that group's city, with no personalisation |
| TG-48 | No city | `/live` in a group not wired to a city, and privately as a user with no home city | "Set your city in the app first." in both |
| TG-49 | Localization | Repeat TG-40 with the client language set to `ru`, `ar` and `ja` | Header, "Started …", footer, empty state and the Watch label are all translated, and the message renders (no Markdown parse error) |
| TG-50 | Rate limit | Send `/live` 15 times in a minute | The first 10 answer, the rest are dropped |

---

## 31. References

- Routes: `Frontend/src/App.tsx`
- URL schema & overlays: `Frontend/src/utils/urlSchema.ts`
- URL ↔ store sync: `Frontend/src/hooks/useUrlStoreSync.ts`
- Main shell: `Frontend/src/pages/MainPage.tsx`
- Push tap routing: `Frontend/src/utils/pushNotificationBracketRouting.util.ts`
- Playwright E2E: `Frontend/playwright.config.ts`, `Frontend/e2e/`
- Unit/integration: `Frontend` / `Backend` `test:*` scripts; CI `.github/workflows/ci.yml`
- Home Next Game widgets: `Frontend/src/services/widgetNextGamesSync.ts`, iOS `BandejaHomeWidgets/` + `BandejaNextGames/`, Android `:bandeja-widgets`
- Watch live-scoring relay (WatchConnectivity): iOS `BandejaWatchShared/` (payloads only; not next-games cache)

### Club info selections inside game forms

- In create-game, edit-game location/time, and league fixture editing, open the club selector → information button → choose a free slot. The selector closes; the same form retains its other edits and receives the club, court, calendar date, start time, and duration. Try another club/city and another day, including a device in a different timezone.
- Expand an existing booking (also one within an adjacent group). Check “Link to this game”, Delete, and Verify. Linking closes the selector and stages that booking and its schedule. Canceling the parent form must not create a link. Saving creates the link; replacing existing links uses the unlink confirmation without canceling the external reservation.
- Check ordinary club-info browsing still opens create-game for a free slot and retains generic booking actions. Sport-specific game pickers must not offer another sport’s courts.

### Weltner saved-phone booking

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| WT-01 | Connect/update phone | Configure a WELTNER club with mapped court slugs; choose Book a court; enter international phone; then change it in Connected clubs | Phone saved for this user and this club; no OTP or provider-account claim; new booking uses updated phone and profile name |
| WT-02 | Phone isolation | Connect club A as player A; view club B or sign in as player B | No inherited connection or exposed phone; anonymous users cannot save contacts or reserve |
| WT-03 | Exact availability | Switch date, court, 60/90/120/180 minute durations; choose multiple courts | Only returned tuples offered; multiple courts require matching starts; slow old responses cannot replace the new date; failure never creates free slots |
| WT-04 | Midnight/timezone | Book a returned 22:00 +120-minute slot from a device in another timezone | Correct club date/time; stored end is next local day 00:00; selected court slug preserved |
| WT-05 | Create/edit game | Save phone, select a slot, confirm once using a mocked or club-approved test upstream | Backend sends exactly one mapped request; confirmed receipt linked to game; correct provider, court and UTC interval |
| WT-06 | Failed game save | Weltner succeeds; game save fails; retry or reopen from Settings → Bookings | Confirmation says court remains booked; retry reuses receipt; existing-reservation picker can link it without another upstream POST |
| WT-07 | Unknown outcome | Drop response after upstream submission; repeat same booking | Uncertain outcome and contact-club guidance; no automatic rebooking; receipt visible in Settings; cannot be linked as confirmed |
| WT-08 | Partial multi-court booking | First court confirms, second rejects | First remains booked; confirmed count shown; retry reuses first receipt; no cancellation claim |
| WT-09 | Disconnect/cancel | Remove saved phone after reserving; inspect bookings | Phone connection removed, receipts retained; cancellations/changes directed to club; no unsupported cancel/verify buttons |
| WT-10 | Receipt ownership | Submit another player's receipt, wrong club, or altered snapshot timestamps | Foreign/wrong-club receipt rejected; valid owned receipt supplies authoritative stored court/times |
| WT-11 | Horizon/localization | Today, today+30, today+31; English/Serbian/Russian | Inclusive 30-day limit enforced in club timezone; contact, confirmation, recovery and error copy localized |
| WT-12 | Shared booking lists | Make a mocked confirmed booking and return to My; open club and Settings; move a receipt into the past | Upcoming/past lists include Weltner, retain provider identity, show mapped court; unknown receipts never appear as confirmed |
| WT-13 | Receipt refresh and user switch | Keep My mounted, complete another reservation; log into a different account connected to the same club | Fresh confirmed receipts appear; no other account’s cached receipts flash or persist |
| WT-14 | Slow saved phone load | Delay auth GET and try to edit/submit | Form waits for saved phone; no late response can overwrite an edit |
| WT-15 | Account merge | Merge an account with confirmed/unknown receipts; repeat with same-slot receipts on both accounts | IDs and outcomes preserved with new ownership; conflicting merge fails without deleting either receipt |
| WT-16 | Linked receipt ownership | Open a game with owned confirmed Weltner receipt, then switch to another account; also test after disconnecting the saved phone | Owner sees receipt without Booktime auth; other player sees public coverage only; no upstream refresh/verify/cancel or false absent-booking cleanup |

Live reservation creation requires a designated test slot or club test environment; routine regression tests mock Weltner and never reserve real inventory.
