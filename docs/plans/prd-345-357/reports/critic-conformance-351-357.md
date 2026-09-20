# Critic: PRD conformance 351–357

Scope: PRDs 351, 352, 353, 354, 355, 356, 357 on branch `feat/prd-345-357`.
Method: read the CONTRACT, each PRD story-by-story and bullet-by-bullet, then the implementation
(located independently of the builders' file lists). No heavy commands were run; no file outside
this report was modified. Findings are ordered by severity within each PRD.

## Verdict per PRD

| PRD | Verdict | One-line reason |
|---|---|---|
| 351 Referral program | GAPS | Money path is sound and idempotent; the invites list can display a payout that never happened. |
| 352 Pair leaderboard | GAPS | Full feature is real and wired end to end; the "scroll to my pair" pill is permanently visible for a top-3 viewer pair. |
| 353 Monthly recap | COMPLETE | Every story has working code: scheduler, payload, viewer, share, export, profile row, push. |
| 354 Public club page | GAPS | Guests are shown a login card **instead of** the reviews the PRD says must render; Telegram club links not implemented. |
| 355 Virtual goods shop | SERIOUS GAPS | `requireAdmin` fix is correct, but a re-withdrawn item deletes ownership without refunding, and sticker-pack "Equip" is a no-op. |
| 356 Telegram /play and /live | COMPLETE | Commands, callbacks, prefixes, menu and rate limits all registered and reachable; group deviation documented. |
| 357 Weather alerts | GAPS | Alerting is careful and restart-safe, but "Move indoor" silently drops the other courts of a multi-court game. |

---

## Findings

### [MAJOR] PRD 355 — A second withdrawal of a re-activated item deletes ownership without refunding

- **Where:** `Backend/src/services/shop/shopPurchase.service.ts:217-226`
- **Defect:** The refund idempotency key is "does this user hold *any* REFUND transaction row for this
  `goodsId`", which is permanent, but the `UserGoods` row it protects is deleted unconditionally at
  line 224 — so a second purchase/withdraw cycle of the same item destroys the ownership and pays
  nothing.
- **Failure scenario:**
  1. Admin creates "Neon Frame", price 120. Player A buys it (120 coins debited).
  2. Admin → Goods → Withdraw. `refundGoodsOwners` refunds A 120 coins, deletes the `UserGoods` row,
     and `ShopAdminService.withdraw` sets `isActive = false`.
  3. Admin edits the item and re-ticks **Active** (`Admin/index.html:1911`, `goodsIsActive`;
     `ShopAdminService.update` accepts `isActive`), so the item is back in the catalogue.
  4. Player A buys it again — another 120 coins debited, a new `UserGoods` row.
  5. Admin withdraws it again. `alreadyRefunded` counts the REFUND row from step 2, so the branch at
     line 226 returns `false` — but `tx.userGoods.delete` on line 224 has already run.
  Net result: A paid 240 coins, was refunded 120, and owns nothing. The admin UI reports the owner as
  "skipped" with no indication that coins were kept. The invariant in the file header — "Refund every
  owner of a withdrawn item **exactly once**" — holds per goods id forever, not per withdrawal.
- **PRD requirement:** "As a player, I want a refund path when an admin withdraws an item, so that I
  am not short-changed." / Testing Decisions: "withdraw refunds every owner once".

### [MAJOR] PRD 354 — Guests see a login card instead of the club's reviews

- **Where:** `Frontend/src/pages/ClubPage.tsx:335-356`
- **Defect:** The whole Reviews section is gated on `isAuthenticated`; an unauthenticated visitor gets
  an `EmptyStateCard` with a sign-in button and no review content at all, even though the underlying
  endpoint and component are both guest-safe.
- **Failure scenario:** Open `https://bandeja.me/clubs/<id>` in a private window (the route is
  deliberately un-`ProtectedRoute`d, `Frontend/src/App.tsx:804-812`). The hero, action row, games,
  courts, info and regulars all render; the Reviews section shows "sign in" instead of the 4.6 ★ / 38
  reviews the hero header already advertises. `GET /clubs/:id/reviews` is `optionalAuth`
  (`Backend/src/routes/club.routes.ts:139`) and `ClubReviewsSection` already skips the eligible-games
  fetch when there is no user (`Frontend/src/components/ClubReviewsSection.tsx:123-125`), so nothing
  technical forces this gate.
- **PRD requirement:** "**Guest behavior** — Everything renders; Favorite, Create, Book, Write review
  prompt login with the remembered return path." and "Reviews: `ClubReviewsSection` with the star
  breakdown at the top and **Write a review** when the viewer has an eligible game; guests see a login
  prompt." (the *write action* prompts login, not the section).

### [MAJOR] PRD 357 — "Move indoor" silently drops every other court of a multi-court game

- **Where:** `Frontend/src/components/weather/MoveIndoorSheet.tsx:76-80`
- **Defect:** Applying an indoor court sends `courtIds: [court.id]`, replacing the game's whole court
  set rather than swapping the one outdoor court the sheet says it is moving.
- **Failure scenario:** A game is booked on Court 5 (outdoor) and Court 6 (indoor). The banner and the
  sheet both display "1 of 2 courts outdoor" (`MoveIndoorSheet.tsx:107-110` renders
  `weatherAlerts.courtsOutdoor` from `outdoorCourtCount`/`totalCourtCount`). The organizer taps free
  indoor Court 1. `saveLocationTime` is called with `courtIds: [court-1]`, so the game ends up on a
  single court: Court 6 is silently removed and half the roster's court capacity disappears, with a
  success toast and a chat line "Moved to Court 1 (indoor)". Nothing in the UI tells the organizer a
  court was removed.
- **PRD requirement:** "Multi-court games: at-risk if any selected court is outdoor; 'Move indoor'
  handles one court at a time with a count '1 of 2 courts outdoor'." (Handling one court at a time
  means replacing that court, not the set.)

### [MINOR] PRD 352 — "Scroll to my pair" pill is permanently visible when the viewer's pair is on the podium

- **Where:** `Frontend/src/components/pairs/PairLeaderboard.tsx:108-124`
- **Defect:** The visibility observer looks the viewer's pair up with
  `listRef.current?.querySelector('[data-pair-id=…]')`, but `listRef` is the `<ul>` that renders
  `pairs.slice(3)` only (line 195). A top-3 pair lives in `PairPodium`, outside that ref, so `node` is
  `null` and the code takes the `setMyPairVisible(false)` branch on line 118.
- **Failure scenario:** A viewer whose best pair is ranked #1 opens Top → Pairs. Their pair is the
  tallest podium card at the very top of the screen, yet the sticky "Jump to your pair (rank 1)" pill
  renders over the list and never goes away — tapping it scrolls to a card that is already on screen
  (`scrollToMyPair` uses `document.querySelector`, so the podium card is found).
- **PRD requirement:** "**Scroll to my pair** floating pill appears when the viewer has any ranked pair
  **below the fold**."

### [MINOR] PRD 351 — Invites list can show "Played · +50" for a referrer who received nothing

- **Where:** `Backend/src/services/referral/referral.service.ts:430-449`
- **Defect:** `rewardByUser` falls back to the configured reward amount when `referrerTx` is `null`
  (`row.referrerTx?.total ?? amounts.referrer`), but `referrerTxId` is deliberately left `null` when the
  referrer's coin grant failed and only the referred side succeeded
  (`referralReward.service.ts:124-146` keeps the claim row in exactly that case).
- **Failure scenario:** `grantCoins(referrerUserId, …)` throws (wallet write contention, transaction
  service failure). The `ReferralReward` row is written with `referrerTxId = null` and
  `referredTxId = <id>`. The referrer opens Profile → Invite friends: the row for that friend shows
  state `PLAYED` with `rewardCoins: 50` and the green "Played · +50" chip, while their wallet shows no
  referral transaction and no retry is possible (the claim row blocks a second attempt).
- **PRD requirement:** "As a player, I want to see who I referred and their status (registered /
  played)" with the state chip "**Played · +50** (green)" — the chip asserts a payout that did not
  happen.

### [MINOR] PRD 355 — "Equip" on a sticker pack is a no-op

- **Where:** `Backend/src/services/shop/shop.service.ts:151-164` and `:202-216`
- **Defect:** `ShopService.equip` happily flips `UserGoods.equipped` for a `STICKER_PACK`, but
  `projectViewerEquipped` / `readViewerEquipped` / `getPublicEquipped` only ever project
  `PROFILE_FRAME`, `NAME_COLOR` and `CHAT_ACCENT`; sticker-pack access is derived from *ownership*
  alone (`shopStickerAccess.ts:getOwnedStickerPackIds`), never from `equipped`.
- **Failure scenario:** A player buys a sticker pack. In Profile → Appearance → Collection the tile is
  tappable with `aria-label "… Tap to equip"` (`CollectionSection.tsx:107`); tapping it shows a check
  mark and the item sheet's primary button reads **Equip**/**Unequip**. Neither action changes anything
  anywhere in the app, and "Unequip" does not remove the pack from the sticker picker either. The
  player is given a control that does nothing.
- **PRD requirement:** "tapping equips with a check; only one item per kind can be equipped" combined
  with "Sticker packs: ownership unlocks the pack in `UserStickerPrefs`" — a pack is unlocked, not
  equipped, so it should not offer an equip affordance.

### [MINOR] PRD 357 — "Keep as planned" does not suppress the first (12 h) alert

- **Where:** `Backend/src/services/weather/weatherRisk.ts:379-382`
- **Defect:** `decideAlert` checks `state.keepAsPlannedAt` only on the `second` window; the `first`
  window branch returns early on `sentCount > 0` and never looks at the keep flag.
- **Failure scenario:** A game starts in 30 h. The card pill and the details banner are already live
  (`computeWeatherRiskForGames` uses a 48 h horizon, `WEATHER_RISK_CARD_HORIZON_HOURS = 48`), so the
  organizer opens the game and taps **Keep as planned**; the banner collapses to "Playing rain or
  shine ✓". 18 h later the game enters the 11.5–12.5 h window, `sentAt` is still empty, and every
  participant receives the "Rain likely for tomorrow's game ☔" push anyway.
- **PRD requirement:** "As an organizer, I want a 'Keep as planned' action that silences further alerts
  for this game."

### [MINOR] PRD 354 — Telegram game messages do not link the club name

- **Where:** `Backend/src/services/telegram/notifications/game-card.notification.ts:144-149`
- **Defect:** `locationLine` renders the club name as escaped plain text; no `/clubs/:id` URL is
  produced anywhere under `Backend/src/services/telegram/` (a repo-wide grep for `clubs/` in that tree
  returns nothing).
- **Failure scenario:** A game card posted to a Telegram club group shows "📍 Padel Centar · Court 3"
  as inert text. A Telegram user who wants the venue page has no way to reach `/clubs/<id>` from the
  message, even though the route, the deep-link catalog entry (`Frontend/src/deepLinks/catalog.ts:71`)
  and the `useDeepLink` branch (`Frontend/src/hooks/useDeepLink.ts:118-121`) all exist and work.
- **PRD requirement:** Implementation Decisions — "Links: deep link catalog entry `/clubs/:id` in
  `deepLinks/catalog.ts` and `useDeepLink.ts`; **Telegram game messages link the club name**."

### [MINOR] PRD 355 — Gifting bypasses the block relationship

- **Where:** `Backend/src/services/shop/shopPurchase.service.ts:77-114` (and
  `Backend/src/controllers/shop.controller.ts:104-120`)
- **Defect:** `purchaseGoods` validates only that the recipient exists and `isActive`; there is no
  `BlockedUser` check anywhere in `Backend/src/services/shop/` or the controller, and the gift push is
  dispatched unconditionally.
- **Failure scenario:** User B blocks user A. A calls `POST /api/shop/purchase` with
  `{ goodsId, recipientUserId: <B> }` (the FE gift picker lists followers, but the endpoint accepts any
  id). B receives a push "A sent you a gift 🎁" and a `UserGoods` row attributed to A
  (`giftedByUserId`), which then renders a sparkle in B's Collection. Other notification producers in
  this codebase do filter on blocks — e.g. `Backend/src/services/live/liveGameNotify.service.ts` and
  `Backend/src/services/storyEngagement/storyEngagement.comment.service.ts` — so this path is
  inconsistent with the app's own rule.
- **PRD requirement:** Not stated in PRD 355; filed against CONTRACT §13 "Backend: permission checks on
  every mutating endpoint". Treat as a hardening gap rather than a PRD miss.

### [MINOR] PRD 357 — `?section=weather` without `action=moveIndoor` does nothing

- **Where:** `Frontend/src/features/weather-alerts/useWeatherDeepLink.ts:49-53` and
  `Frontend/src/pages/GameDetailsShell.tsx:784, 1543-1554`
- **Defect:** The hook returns `section: true`, but `GameDetailsShell` only consumes
  `weatherDeepLink.autoOpenMoveIndoor`; nothing scrolls to or focuses the banner, so the `section`
  field is computed and discarded.
- **Failure scenario:** A participant (non-organizer) taps the "View forecast" action on the weather
  push, which deep-links to `/games/<id>?section=weather`. The app opens game details at the top with
  the param stripped; on a long game page the weather banner may be off-screen and nothing indicates
  where to look. (Organizers with `action=moveIndoor` do get the sheet.)
- **PRD requirement:** CONTRACT §7.5 deep-link table — "`?section=weather&action=moveIndoor` on
  `/games/:id` | open the weather banner / move-indoor sheet".

---

## What I verified as genuinely working

**PRD 351 (referral).** The coin path is the strongest part of this set. `ReferralReward.referredUserId`
is `@unique` and the claim row is inserted *before* any coins move, with P2002 short-circuiting a
concurrent or retried payout (`referralReward.service.ts:109-121`); a total grant failure deletes the
claim so a later finalization can retry, a partial success keeps it. The hook is post-commit from
`recalculateGameOutcomes` (`outcomes.service.ts:1080`) and is gated on `resultsStatus === 'FINAL'` and
`GAME|TOURNAMENT|LEAGUE`. `attachReferrer` enforces first touch with
`updateMany … where: { referredByUserId: null }` and applies the same rule to
`LinkToAppAttribution.referrerUserId`. Abuse rules (self, shared Telegram, phone, push token, device)
are re-evaluated at payout, not only at conversion, and the 50-cap excludes revoked rows. The `ref`
parameter genuinely rides the existing pipeline end to end: static landing
(`Frontend/public/link-to-app/index.html:483-502`) → localStorage snapshot (`utils/appAttribution.ts`)
→ `POST /auth/attribution` body → `parseLinkToAppAttributionInput` → `attachReferrerFromAttribution`.
UI surfaces are all mounted: `InviteFriendsCard` (Profile:784), `ReferralCaptureBanner` (Register:204),
`ReferralWelcomeBanner` (WelcomeStep:77), `InviteFriendToGameButton` (ShareModal:90), the wallet
highlight (`navigationService.ts:166` → `Profile.tsx:113` → `WalletModal` `highlightTransactionId`),
the admin page (`Admin/referrals.js`, sidebar + `bootAdmin` scripts array + `loadPageData` case, routes
at `admin.routes.ts:255-258`), and `/invite` in the bot.

**PRD 352 (pairs).** `PairStat` is genuinely materialized and refreshed from both the write path
(`outcomes.service.ts:1072`) and all three destructive paths in `results.service.ts` (243/316/441 →
293/414/486), with `collectPairRefreshTargets` captured *before* the roster-deleting transaction. The
recompute-from-scratch design makes apply and revert symmetric. The ≥5-games floor is applied on both
the SQL path (`pairRanking.service.ts:312`) and the windowed path (`orderPairCandidates` →
`qualifiesForPairRank`). The cursor is fingerprinted against `cityId|sport|period|sort` and rejects a
mid-scroll filter change with a 400. `GET /users/:userId/partners` really is registered
(`user.routes.ts:280`). The `?pair=a,b` overlay is in the `Overlay` union, `OVERLAY_TYPES`,
`parseLocation`'s strip list, and `PairSheetManager` is mounted in `App.tsx:580`.

**PRD 353 (recap).** Scheduler is instantiated, started and stopped in `server.ts` (124-125, 185) on
`0 4 1-3 * *`; idempotency is `MonthlyRecap @@unique([userId, monthKey])` plus an `isRecapGenerationDay`
guard. The rail bubble, the viewer with count-ups and the multisport sport-tab strip
(`RecapStoryViewer.tsx:216-240`), the share sheet with per-slide checkboxes, the server-rendered share
(`recapShare.service.ts` → real `UserStory` + `UserStoryItem` rows with `STORY_TTL_MS` and
`emitStoryNew`), the export card, `ProfileRecapsRow` with its own viewer instance, and the
`?recap=YYYY-MM` push deep link are all present and connected. Re-sharing supersedes the previous reel
rather than duplicating it.

**PRD 354 (club page).** `GET /clubs/:id/public` is an explicit whitelist projection that strips
`integrationType`/`integrationConfig` and derives a `booking` capability instead
(`clubPublic.projection.ts:125-155`), with a `findPublicClubContractIssues` guardrail. Regulars are
filtered on `isActive`, `nameIsSet` and blocks in both directions. The route is guest-readable and
exempt from the offline gate (`App.tsx:508, 527`). Entry points all exist: `GameInfo.tsx:987`,
`ClubModal.tsx:263`, `FiltersPanel` chevrons (286/317), and `/find?clubIds=` via
`applyFindClubIdsFromUrl`.

**PRD 355 (shop, security fix).** Every route on `Backend/src/routes/goods.routes.ts` — including the
previously-unfiltered `GET /` and `GET /:id` — now carries `requireAdmin`, which is a standalone
middleware that extracts and verifies the bearer token itself (`middleware/auth.ts:60-78`), so no
missing `authenticate` can make it a no-op. There are no non-admin consumers of `/api/goods` left. The
purchase is one `prisma.$transaction` covering the ownership insert, the `Transaction` + row and both
wallet writes, with the `UserGoods` unique index as the race guard and P2002 mapped to `ALREADY_OWNED`.
The premium gate is a server rule evaluated inside that transaction against a freshly-read row
(`rejectPurchase` in `shopRules.ts:59-65`) — the UI lock is decoration. Self-gift is blocked at the
controller. Sticker-pack gating is real and wired into `stickerCatalog.service.ts` at all three points
(list, open pack, send sticker). `VITE_SHOP_ENABLED` / `SHOP_ENABLED` gate the page, the Wallet button,
the Collection section and the whole router.

**PRD 356 (Telegram).** The callback regex at `bot.service.ts:66` is exactly the contract's
`/^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/` — the previously-missing `uti`/`sip` are included — and
every `pi:` variant has a real branch in `callback.handler.ts:409-520` (day, back, time, cancel, again,
join). `setMyCommands` is called at startup for the default list and per language
(`botCommandMenu.ts`). Both commands go through `requireUser`, `syncTelegramProfile`, `requireChat` and
`rateLimitChat()`. `/live` calls `listLiveGames` in-process (no HTTP self-call), mints real spectator
tokens via `signLiveSpectatorToken`, and the `/games/:id/broadcast` route it links to exists
(`App.tsx:753`). Group `/play` is Redis-backed rate limited per user per chat.

**PRD 357 (weather).** Dedupe is a persisted `Game.weatherAlertState` blob, not an in-memory `Set`, and
the parser is defensive. Indoor and unknown-court games are excluded at a single choke point
(`detectOutdoor` returning `known: false`), and every caller honours it. The second alert requires a
severity *class* increase. The step lives inside `GameStatusScheduler` at `0,30 * * * *` as the contract
requires. `SEND_WEATHER_ALERTS` exists as enum value, Prisma column, `DEFAULT_PREFERENCES` entry,
`NOTIFICATION_TYPE_TO_PREF` mapping and a row in `NotificationSettingsModal` with copy in all 11
locales. The `game-weather-alert-updated` socket event is emitted (`socket.service.ts:1346`), typed
(`socketService.ts:114`), stored (`socketEventsStore.ts:695`) **and** consumed
(`WeatherRiskBanner.tsx:80`). `weather` is a registered push-action kind, and the token route dispatches
it.

**i18n.** All 12 namespaces exist in all 11 locale directories with plausible per-locale key counts
(en/es/hi at the base count, ru/sr/cs/ar higher for plural families, zh/id/th/ja lower for single-form
plurals) — consistent with the family-aware parity rule in CONTRACT §8.3.

---

## What I could not verify

- **Nothing was compiled, linted or executed.** Per the brief I ran no `tsc`, vitest, Playwright or
  Prisma command. Type errors, lint failures and runtime import-cycle problems are out of reach of this
  pass. In particular the raw SQL in `pairRanking.service.ts` (`::"Sport"` cast, `NULLS LAST`, the
  `ROW_NUMBER()` CTE) and the sharp/librsvg recap renderer were only read.
- **Visual conformance.** Podium heights, the 80 ms stagger, the 500 ms shine sweep, hero parallax,
  reduced-motion paths, RTL mirroring and Light/Dark/Classic/Premium contrast were checked only by
  reading class names and `usePrefersReducedMotion` usage.
- **Real payouts and refunds against a database.** The PRD 355 refund finding above is derived from the
  code path; it was not reproduced against `padelpulse_dev`.
- **Push/Telegram delivery.** Whether `GAME_WEATHER_ALERT` and `GOODS_GIFT_RECEIVED` actually reach a
  device, and whether the native shade actions render (the PRD 357 report already flags that the native
  helpers only know `accept`/`decline`).
- **Forecast provider coverage.** `computeWeatherRiskForGames` is cache-only; whether
  `WeatherForecastCache` is warm for the cities that matter is an operational question.
- **Admin panel behaviour.** `Admin/goods.js` and `Admin/referrals.js` were verified as registered in
  all five required places but not driven through `./Admin/serve.sh`.
