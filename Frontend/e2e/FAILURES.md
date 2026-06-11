# Playwright E2E failures

Run: 2026-06-11 (13.2m) · `npm run test:e2e` · exit code 1

| Result | Count |
|--------|------:|
| Total | 294 |
| Passed | 108 |
| Failed | 96 |
| Skipped | 53 |
| Did not run | 37 |

HTML report: `Frontend/playwright-report` (`npm run test:e2e:report`)

---

## Failure clusters

### 1. Registration / onboarding (20) — likely root cause

**Tests:** A-10–A-16, A-17, A-19, OG-01–OG-10

| Error | Detail |
|-------|--------|
| `getByLabel(/^first name$/i)` not found | Register form locator mismatch (A-10–A-16) |
| `register failed (400): phone: Valid phone number is required` | E2E register helper phone format rejected by backend (onboarding + select-city) |
| Validation UI | A-11: `p.text-red-500` not visible |

**Files:** `e2e/pages/register.page.ts`, `e2e/specs/auth/register.spec.ts`, `e2e/specs/onboarding/onboarding-gates.spec.ts`

---

### 2. Find tab (20) — auth shell not ready

**Tests:** F-01–F-05, F-07, F-09–F-12, F-13–F-18, F-22–F-24, F-29, F-31

`FindPage.waitForShell()` — `getByRole('button', { name: /^chats$/i })` timeout 30s.

**Files:** `e2e/pages/find.page.ts`, `e2e/specs/find/*.spec.ts`

---

### 3. Strict mode — duplicate text (10)

`getByText(title)` matches list card and detail heading.

| Test | Locator issue |
|------|---------------|
| M-10, M-11, M-14, M-22, M-26, M-35 | `[E2E] M-*` titles |
| T2-M-02 | marketplace auction |
| H-12 | invite label |
| GD-01 (guest) | `/join to participate!\|login or register to join/i` |

**Fix:** `.first()`, `getByRole('heading')`, or scoped locators.

---

### 4. Chat (11)

| Test | Error |
|------|-------|
| CH-19–CH-23, CH-28 | `waitForResponse` POST `/messages` timeout 30s |
| CH-32, CH-33 | Strict: 2× `Create poll` button |
| CH-13 | Game name text timeout |

**Files:** `e2e/pages/chats.page.ts`, `e2e/specs/chats/thread.spec.ts`

---

### 5. Two-user / realtime (6)

| Test | Error |
|------|-------|
| T2-CH-01, T2-CH-10 | TanStack Query DevTools (`tsqd-parent-container`) intercepts Send click |
| T2-X-01 | Message bubble not visible on B (socket/realtime) |
| T2-GD-01 | Join UI update poll timeout |
| GD-02 | `Private` badge `hidden sm:inline` — not visible in mobile viewport |
| T2-M-02 | Strict mode (marketplace title) |

---

### 6. Profile (5)

| Test | Error |
|------|-------|
| PR-01, PR-10, PR-23 | `getByLabel(/^first name$/i)` / `show online status` not found |
| A-21 (settings) | `sessions.pageTitle is not a function` — page object bug |
| PR-02 | Strict: spinner OR svg matches tab icon + spinner |

**Files:** `e2e/pages/profile.page.ts`, `e2e/pages/sessions.page.ts`, `e2e/specs/profile/*.spec.ts`

---

### 7. Offline (4)

| Test | Error |
|------|-------|
| G-07 (guest login) | `ERR_INTERNET_DISCONNECTED` on `page.goto('/login')` while offline |
| G-06, G-07 (auth), X-10 | `no internet connection` heading not found |

**Files:** `e2e/pages/offline.page.ts`, `e2e/specs/shell/offline.spec.ts`

---

### 8. Shell / navigation (9)

| Test | Error |
|------|-------|
| X-15, smoke nav (3) | Bottom tab buttons (`Find`, `Chats`, etc.) not visible |
| G-17, G-26 (overlays) | Player overlay URL / dismiss |
| G-18, G-19, G-27, G-28 | i18n, theme, re-tap Find, cache clear |
| G-11 | Unread tab badges |

---

### 9. Games (7)

| Test | Error |
|------|-------|
| C-12–C-14, C-21, C-27 | `waitForURL` / court button / timeout |
| GD-18 | Participants carousel timeout |
| LS-02 | Live scoring click timeout |

---

### 10. Marketplace (1)

| Test | Error |
|------|-------|
| M-03 | `Target page, context or browser has been closed` on category filter |

---

### 11. Misc (2)

| Test | Error |
|------|-------|
| A-06 | OAuth return — shell `Chats` tab never appears (45s) |
| A-21 (session.spec) | Sessions heading/badge not found |

---

## Recommended fix order

Work top-down; re-run targeted suites after each step to confirm before moving on.

### Phase 1 — Registration foundation (~20 tests)

| Step | Action | Files | Unblocks |
|------|--------|-------|----------|
| 1.1 | Fix `generateE2ePhone()` — current `+7900` + 9-digit suffix is 13 digits after `+7` and fails `isMobilePhone('any')` on `POST /auth/register/phone` | `e2e/fixtures/persona.fixture.ts` | A-17, A-19, OG-01–OG-10 (API register helper) |
| 1.2 | Align register page locators with UI — verify `FormField` exposes `first name` label; update `RegisterPage` if label text/association changed (`First Name` vs `first name`) | `e2e/pages/register.page.ts`, `src/pages/Register.tsx` | A-10–A-16 |
| 1.3 | Fix validation error locator if error copy moved off `p.text-red-500` | `e2e/pages/register.page.ts` | A-11 |

**Verify:** `npm run test:e2e -- --project=login e2e/specs/auth/register.spec.ts e2e/specs/onboarding/`

---

### Phase 2 — Authenticated shell / storage state (~30 tests)

Many `@auth` failures share `ShellPage.waitForShellReady()` / `FindPage.waitForShell()` timing out on the `Chats` tab — likely stale or broken `e2e/.auth/user.json`, or app not reaching home after login.

| Step | Action | Files | Unblocks |
|------|--------|-------|----------|
| 2.1 | Re-run `global-setup` / inspect auth storageState; confirm seeded user lands on home with bottom nav | `e2e/global-setup.ts`, `e2e/.auth/user.json` | F-01–F-31, smoke navigation, X-15 |
| 2.2 | Harden shell wait — wait for any bottom-tab button or `/home` URL before feature-specific asserts | `e2e/pages/shell.page.ts`, `e2e/pages/find.page.ts` | Find, games create, home list, marketplace browse |
| 2.3 | OAuth mock return must reach authenticated home (same shell wait) | `e2e/specs/auth/oauth.spec.ts` | A-06 |

**Verify:** `npm run test:e2e:auth -- e2e/specs/smoke/navigation.spec.ts e2e/specs/find/find.spec.ts`

---

### Phase 3 — Quick page-object / locator fixes (~15 tests)

Low effort, no app logic changes.

| Step | Action | Files | Unblocks |
|------|--------|-------|----------|
| 3.1 | Marketplace + invites: scope title to `getByRole('heading')` or `.first()` | `e2e/specs/marketplace/*.spec.ts`, `e2e/pages/marketplace.page.ts`, `e2e/specs/home/invites.spec.ts` | M-10, M-11, M-14, M-22, M-26, M-35, H-12, T2-M-02 |
| 3.2 | Game details guest: use `getByRole('heading', { name: /join to participate/i })` | `e2e/pages/game-details.page.ts` | GD-01 |
| 3.3 | Chat poll: disambiguate `Create poll` button (scope to modal/form) | `e2e/specs/chats/thread.spec.ts` | CH-32, CH-33 |
| 3.4 | Add missing `SessionsPage.pageTitle()` (or use existing `expectSessionsListed`) | `e2e/pages/sessions.page.ts`, `e2e/specs/profile/settings.spec.ts` | A-21 (settings) |
| 3.5 | Profile locators — align `firstNameInput` / online-status with current profile form | `e2e/pages/profile.page.ts` | PR-01, PR-10, PR-23 |
| 3.6 | Statistics tab: narrow spinner locator (exclude tab SVG icons) | `e2e/specs/profile/tabs.spec.ts` | PR-02 |
| 3.7 | Private badge: assert visible badge or use `data-testid` instead of `hidden sm:inline` text | `e2e/pages/game-details.page.ts` | GD-02 |

**Verify:** `npm run test:e2e:auth -- e2e/specs/marketplace/ e2e/specs/profile/ e2e/specs/games/game-details.spec.ts`

---

### Phase 4 — E2E infra blockers (~8 tests)

| Step | Action | Files | Unblocks |
|------|--------|-------|----------|
| 4.1 | Disable React Query DevTools when `E2E_TEST_HEADER` or `import.meta.env.MODE === 'test'` — devtools overlay intercepts Send clicks | `src/queries/QueryProvider.tsx` | T2-CH-01, T2-CH-10, possibly T2-X-01 |
| 4.2 | Offline tests: use `page.goto(..., { waitUntil: 'domcontentloaded' })` or route mock instead of full navigation while offline; align gate heading locator with current copy | `e2e/specs/shell/offline.spec.ts`, `e2e/pages/offline.page.ts` | G-06, G-07, X-10 |

**Verify:** `npm run test:e2e:two-user` + `npm run test:e2e:guest -- e2e/specs/shell/offline.spec.ts`

---

### Phase 5 — Feature-depth / may need seed data (~15 tests)

Investigate only after Phases 1–4; failures may clear as cascades or may need backend/socket/seed fixes.

| Step | Action | Files | Unblocks |
|------|--------|-------|----------|
| 5.1 | Chat send: fix `waitForResponse` POST `/messages` — thread may not open or send blocked | `e2e/pages/chats.page.ts`, `e2e/specs/chats/thread.spec.ts` | CH-13, CH-19–CH-23, CH-28 |
| 5.2 | Two-user realtime: socket delivery + join UI poll | `e2e/specs/two-user/*` | T2-X-01, T2-GD-01 |
| 5.3 | Games create / live scoring: court picker, `waitForURL` after submit | `e2e/specs/games/*` | C-12–C-27, GD-18, LS-02 |
| 5.4 | Shell overlays, i18n, theme, unread badges, pull-refresh | `e2e/specs/shell/*` | G-11, G-17–G-19, G-26–G-28 |
| 5.5 | Marketplace M-03 category filter — page closed mid-test (likely prior failure or navigation race) | `e2e/specs/marketplace/list.spec.ts` | M-03 |

**Verify:** full `npm run test:e2e`

---

### Summary

| Phase | Focus | ~Tests fixed |
|-------|-------|-------------|
| 1 | Phone format + register locators | 20 |
| 2 | Auth storage + shell readiness | 30 |
| 3 | Strict mode + page objects | 15 |
| 4 | DevTools + offline infra | 8 |
| 5 | Chat, games, shell depth | 15+ |

Phases 1–2 address the largest shared root causes. Phase 3 is parallelizable. Phases 4–5 last.

---

## Full failure list

| # | Project | Test ID | Spec |
|---|---------|---------|------|
| 1 | guest | G-07 | `shell/offline.spec.ts` — offline exempt login |
| 2 | login | A-06 | `auth/oauth.spec.ts` — Google OAuth return |
| 3 | login | A-10 | `auth/register.spec.ts` — full registration |
| 4 | login | A-11 | `auth/register.spec.ts` — validation errors |
| 5 | login | A-12 | `auth/register.spec.ts` — password mismatch |
| 6 | login | A-13 | `auth/register.spec.ts` — phone format |
| 7 | login | A-14 | `auth/register.spec.ts` — gender prefer-not-to-say blocked |
| 8 | login | A-15 | `auth/register.spec.ts` — primary sport selection |
| 9 | login | A-16 | `auth/register.spec.ts` — optional email invalid |
| 10 | login | A-17 | `auth/select-city.spec.ts` — new user no city |
| 11 | login | A-19 | `auth/select-city.spec.ts` — pick city |
| 12 | login | OG-01 | `onboarding/onboarding-gates.spec.ts` — profile name gate blocks join |
| 13 | login | OG-02 | `onboarding/onboarding-gates.spec.ts` — name gate resume |
| 14 | login | OG-03 | `onboarding/onboarding-gates.spec.ts` — primary sport gate |
| 15 | login | G-09 | `onboarding/onboarding-gates.spec.ts` — redirect without enabled sports |
| 16 | login | OG-04 | `onboarding/onboarding-gates.spec.ts` — gender prompt banner |
| 17 | login | OG-05 | `onboarding/onboarding-gates.spec.ts` — gender prompt dismiss |
| 18 | login | OG-06 | `onboarding/onboarding-gates.spec.ts` — city prompt banner |
| 19 | login | OG-07 | `onboarding/onboarding-gates.spec.ts` — welcome questionnaire |
| 20 | login | OG-08 | `onboarding/onboarding-gates.spec.ts` — welcome questionnaire skip |
| 21 | login | OG-09 | `onboarding/onboarding-gates.spec.ts` — sport questionnaire prompt |
| 22 | login | OG-10 | `onboarding/onboarding-gates.spec.ts` — sport questionnaire complete |
| 23 | authenticated | A-21 | `auth/session.spec.ts` — sessions list |
| 24 | authenticated | CH-19 | `chats/thread.spec.ts` — Send emoji |
| 25 | authenticated | CH-20 | `chats/thread.spec.ts` — Reply to message |
| 26 | authenticated | CH-21 | `chats/thread.spec.ts` — Edit message |
| 27 | authenticated | CH-22 | `chats/thread.spec.ts` — Delete message |
| 28 | authenticated | CH-23 | `chats/thread.spec.ts` — Reaction |
| 29 | authenticated | CH-28 | `chats/thread.spec.ts` — Send image |
| 30 | authenticated | CH-32 | `chats/thread.spec.ts` — Create poll |
| 31 | authenticated | CH-33 | `chats/thread.spec.ts` — Vote on poll |
| 32 | authenticated | CH-13 | `chats/thread.spec.ts` — Game chat context header |
| 33 | authenticated | X-15 | `cross-cutting/accessibility.spec.ts` — Bottom tab labels visible when inactive |
| 34 | authenticated | X-10 | `cross-cutting/offline.spec.ts` — Offline gate shows no internet screen |
| 35 | authenticated | F-07 | `find/filters.spec.ts` — games filter |
| 36 | authenticated | F-09 | `find/filters.spec.ts` — tournament filter |
| 37 | authenticated | F-11 | `find/filters.spec.ts` — user-created filter |
| 38 | authenticated | F-12 | `find/filters.spec.ts` — combined filters |
| 39 | authenticated | F-13 | `find/filters.spec.ts` — open filters panel |
| 40 | authenticated | F-14 | `find/filters.spec.ts` — club filter |
| 41 | authenticated | F-16 | `find/filters.spec.ts` — time range filter |
| 42 | authenticated | F-17 | `find/filters.spec.ts` — level range filter |
| 43 | authenticated | F-18 | `find/filters.spec.ts` — sport filter |
| 44 | authenticated | F-22 | `find/filters.spec.ts` — reset filters |
| 45 | authenticated | F-23 | `find/filters.spec.ts` — filter persistence on reload |
| 46 | authenticated | F-01 | `find/find.spec.ts` — calendar view default |
| 47 | authenticated | F-02 | `find/find.spec.ts` — list view |
| 48 | authenticated | F-03 | `find/find.spec.ts` — date prev next in list view |
| 49 | authenticated | F-04 | `find/find.spec.ts` — month calendar navigation |
| 50 | authenticated | F-05 | `find/find.spec.ts` — go to today |
| 51 | authenticated | F-29 | `find/find.spec.ts` — empty find results |
| 52 | authenticated | F-24 | `find/find.spec.ts` — open game details |
| 53 | authenticated | F-31 | `find/find.spec.ts` — filter button active state |
| 54 | authenticated | C-12 | `games/create-game-fields.spec.ts` — rating vs social toggle |
| 55 | authenticated | C-13 | `games/create-game-fields.spec.ts` — club selection loads courts |
| 56 | authenticated | C-14 | `games/create-game-fields.spec.ts` — court not booked selection |
| 57 | authenticated | C-21 | `games/create-game-fields.spec.ts` — game name and comments |
| 58 | authenticated | C-27 | `games/create-game.spec.ts` — submit create completes valid form |
| 59 | authenticated | GD-18 | `games/game-details.spec.ts` — carousel vs list participants |
| 60 | authenticated | LS-02 | `games/live-scoring.spec.ts` — point for team B |
| 61 | authenticated | H-12 | `home/invites.spec.ts` — view pending invite |
| 62 | authenticated | H-03 | `home/list.spec.ts` — empty my games |
| 63 | authenticated | H-20 | `home/list.spec.ts` — create from calendar date prefills date |
| 64 | authenticated | H-34 | `home/list.spec.ts` — restore calendar after create |
| 65 | authenticated | M-10 | `marketplace/create.spec.ts` — Create buy-it-now |
| 66 | authenticated | M-11 | `marketplace/create.spec.ts` — Create auction rising |
| 67 | authenticated | M-14 | `marketplace/create.spec.ts` — Create free item |
| 68 | authenticated | M-03 | `marketplace/list.spec.ts` — Category filter |
| 69 | authenticated | M-22 | `marketplace/list.spec.ts` — Deep link item |
| 70 | authenticated | M-35 | `marketplace/list.spec.ts` — Overlay open item |
| 71 | authenticated | M-26 | `marketplace/list.spec.ts` — View bid history |
| 72 | authenticated | PR-01 | `profile/general.spec.ts` — General tab shows settings |
| 73 | authenticated | PR-10 | `profile/settings.spec.ts` — First name autosave shows saved indicator |
| 74 | authenticated | PR-23 | `profile/settings.spec.ts` — Online status toggle visible |
| 75 | authenticated | A-21 | `profile/settings.spec.ts` — Sessions list shows current device |
| 76 | authenticated | PR-02 | `profile/tabs.spec.ts` — Statistics tab shows stats content |
| 77 | authenticated | G-06 | `shell/offline.spec.ts` — offline gate |
| 78 | authenticated | G-07 | `shell/offline.spec.ts` — offline exempt game details |
| 79 | authenticated | G-07 | `shell/offline.spec.ts` — offline exempt user profile |
| 80 | authenticated | G-17, G-24 | `shell/overlays.spec.ts` — player overlay URL |
| 81 | authenticated | G-26 | `shell/overlays.spec.ts` — overlay dismiss player |
| 82 | authenticated | G-28 | `shell/theme-pull-find.spec.ts` — cache clear on refresh Find |
| 83 | authenticated | G-18 | `shell/theme-pull-find.spec.ts` — i18n switch |
| 84 | authenticated | G-19 | `shell/theme-pull-find.spec.ts` — dark light theme |
| 85 | authenticated | G-27 | `shell/theme-pull-find.spec.ts` — re-tap Find tab |
| 86 | authenticated | G-11 | `shell/unread-badges.spec.ts` — tab unread badges |
| 87 | authenticated | — | `smoke/navigation.spec.ts` — home shows bottom nav for inactive tabs |
| 88 | authenticated | — | `smoke/navigation.spec.ts` — can navigate to Chats tab |
| 89 | authenticated | — | `smoke/navigation.spec.ts` — can navigate to Marketplace tab |
| 90 | games-guest | GD-01 | `games/game-details.spec.ts` — guest public view |
| 91 | two-user | T2-CH-01 | `two-user/chat-dm.spec.ts` — DM receive realtime |
| 92 | two-user | T2-CH-10 | `two-user/chat-game.spec.ts` — game chat receive |
| 93 | two-user | T2-X-01 | `two-user/cross-cutting-realtime.spec.ts` — chat message socket |
| 94 | two-user | GD-02 | `two-user/game-details-participation.spec.ts` — private game non-participant |
| 95 | two-user | T2-GD-01 | `two-user/games-join.spec.ts` — join updates owner UI |
| 96 | two-user | T2-M-02 | `two-user/marketplace-auction.spec.ts` — bid updates seller view |
