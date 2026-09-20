# Conformance fixes — PRDs 345–357

Closes the findings filed in `critic-conformance-345-350.md` and
`critic-conformance-351-357.md`, minus the items explicitly owned by other
agents (listed at the bottom). No heavy commands were run.

---

## MAJOR

### PRD 350 / PRD 353 — `?playIntentOpen=1` had no consumer

**What was wrong.** `NotificationsStep.tsx:9` (`PLAY_INTENT_DESTINATION`) and
`RecapStoryViewer.tsx:165` both navigate to `/?playIntentOpen=1`.
`PlayIntentProvider` only ever *wrote* that param (`pushIntentUrl`) and *cleared*
it (close path, back-sync). Nothing read it as an entry point, so the onboarding
finale's primary call to action landed on plain Home with a stray query string.

**Fix.** Added a consumer effect in `PlayIntentProvider`, modelled directly on
the existing `?lobby=1` handler (open the sheet, then `setSearchParams(…, {
replace: true })` to strip the param). Three guards keep it from colliding with
the existing mechanisms:

- `acceptSharedDeepLinks` — only the My-tab provider claims the param, so the
  Find-tab provider can never open a duplicate sheet (same ownership rule the
  file already documents for shared play-intent deep links).
- `sheetOpenedViaUrlRef` — an opening this provider *pushed itself* keeps the
  param; that is its back-stack entry.
- waits for the pool to settle, then picks the same mode the strips would
  (`lobby` while looking, else `compose`).

One consumer closes both call sites; neither `NotificationsStep` nor
`RecapStoryViewer` needed a change.

- Files: `Frontend/src/components/playIntent/PlayIntentFindBar.tsx`
- Test: `Frontend/src/components/playIntent/PlayIntentDeepLink.test.tsx` (new) —
  compose open + param stripped, lobby mode while looking, waits while the pool
  loads, other params preserved, no-op without the param.

### PRD 354 — guests could not read club reviews

**What was wrong.** `ClubPage.tsx` gated the whole Reviews section on
`isAuthenticated` and showed a sign-in `EmptyStateCard` *instead of* the reviews.
Nothing required it: `GET /clubs/:id/reviews` is `optionalAuth`, and
`ClubReviewsSection` already skips its eligible-games / my-review fetches when
there is no user, and renders no composer for a guest.

**Fix.** `ClubReviewsSection` now renders for everyone; the sign-in card stays,
below the section, for guests only — i.e. only *writing* a review prompts login,
per the PRD's "Guest behavior". `clubPage.reviews.guestTitle` was reworded from
"Sign in to read and write reviews" to "Sign in to write a review" in **all 11
locales** (value change only, no new keys, so key parity is untouched).

- Files: `Frontend/src/pages/ClubPage.tsx`,
  `Frontend/src/i18n/locales/<11>/clubPage.json`
- Test: `Frontend/src/pages/ClubPage.test.tsx` — the guest case now asserts the
  reviews section renders *and* the write prompt is shown; a new case asserts the
  prompt disappears once signed in.

### PRD 357 — "Move indoor" dropped the game's other courts

**What was wrong.** `MoveIndoorSheet` sent `courtIds: [court.id]`, and
`saveLocationTime` → `POST /game-courts/game/:id` **replaces** the whole set. A
two-court game (one outdoor, one indoor) that moved its outdoor court silently
ended up on a single court — with a success toast, while the sheet was still
displaying "1 of 2 courts outdoor".

**Fix.** `GET /games/:id/indoor-alternatives` now returns `currentCourts`
(`{ id, name, isIndoor }[]`, in `gameCourts` order — the service already loaded
exactly these rows as `linkedCourts`). The sheet swaps *only* the outdoor court
being moved and keeps the rest, following the existing `courtId = courtIds[0]`
idiom from `useSaveGameLocationTime`.

- Files: `Backend/src/services/weather/indoorAlternatives.service.ts`,
  `Frontend/src/api/gameWeather.ts`,
  `Frontend/src/features/weather-alerts/planIndoorCourtSwap.ts` (new — the pure
  helper lives in a `.ts` so the `.tsx` stays component-only),
  `Frontend/src/components/weather/MoveIndoorSheet.tsx`
- Tests: `Frontend/src/features/weather-alerts/planIndoorCourtSwap.test.ts`
  (new) and a new case in `MoveIndoorSheet.test.tsx` asserting
  `courtIds: ['c1', 'c6']` for the two-court scenario.

---

## MINOR

### PRD 352 — "scroll to my pair" pill stuck on for a top-3 viewer

The intersection observer looked the viewer's pair up inside `listRef`, the
`<ul>` that renders `pairs.slice(3)`. A podium pair is outside that ref, so
`node` was always `null` and the code took the `setMyPairVisible(false)` branch —
the pill rendered permanently over a card that was already on screen.

Fix: the ref moved to the board wrapper `<div>`, which contains podium *and*
list. `scrollToMyPair` already used `document.querySelector`, so it was
unaffected.

- File: `Frontend/src/components/pairs/PairLeaderboard.tsx`
- Test: `PairLeaderboard.test.tsx` — the fake `IntersectionObserver` now reports
  a test-controlled visibility and records its targets; a new case puts the
  viewer's pair at rank 1 and asserts the podium card *is* observed and the pill
  is absent.

### PRD 351 — "Played · +50" for a referrer who was paid nothing

`rewardByUser` fell back to the configured amount when `referrerTx` was `null`,
but `referralReward.service.ts` deliberately keeps the claim row with
`referrerTxId = null` when only the referred side's grant landed. Fix: the map is
now keyed on the *claim* (so the state stays `PLAYED` — the friend really did
play) and valued on the actual transaction (`referrerTx?.total ?? null`). The FE
chip already handles `PLAYED` + `rewardCoins === null` by dropping the amount
(`referralInviteChip.ts:42`), so no frontend change was needed.

- File: `Backend/src/services/referral/referral.service.ts`

### PRD 355 — sticker-pack Equip/Unequip was a no-op

Sticker access is derived from ownership (`shopStickerAccess.ts`), never from
`UserGoods.equipped`, and `projectViewerEquipped` / `getPublicEquipped` only
project the three wearable kinds. Flipping `equipped` on a pack changed nothing
anywhere.

Fix: the affordance is gone rather than silently broken, on both ends.

- Backend: `EQUIPPABLE_GOODS_KINDS` / `isEquippableKind` in `shopRules.ts`;
  `ShopService.equip` rejects a non-equippable kind with `400 shop.notEquippable`.
  `unequip` is deliberately left permissive so any legacy `equipped` row can
  still be cleared.
- Frontend: `isEquippableKind` in `shopFormat.ts`; the Collection tile renders as
  a non-interactive tile with an `sr-only` "Unlocked in your sticker picker"
  instead of a button; the item sheet shows the same line instead of the
  Equip/Unequip button. `itemActionKey` returns `shop.stickerPackUnlocked` for an
  owned pack.
- i18n: new key `shop.stickerPackUnlocked` in **all 11 locales**.
- Tests: new cases in `CollectionSection.test.tsx` (no button, unlocked tile) and
  `shopFormat.test.ts` (`isEquippableKind`, `itemActionKey`).

### PRD 357 — "Keep as planned" did not suppress the 12 h alert

`decideAlert` checked `state.keepAsPlannedAt` only on the `second` window; the
`first` branch returned on `sentCount > 0` and never looked at the flag. Because
the card pill and the details banner run on a 48 h horizon, an organizer can tap
"Keep as planned" well before the 12 h pass — and then still get pushed.

Fix: the keep check moved above both window branches.

- File: `Backend/src/services/weather/weatherRisk.ts`
- Test: `weatherRisk.test.ts` — a `first`-window decision with `keepAsPlannedAt`
  set and `sentAt: []` must return `keptAsPlanned`.

### PRD 348 — the settle reminder's clock was the sweep, not FINAL

`Game.costFrozenAt` is what `AUTO_REMIND_DELAY_MS` counts from, but nothing wrote
it at the FINAL transition — the hourly `CostShareReminderScheduler` froze
whichever games it happened to notice, so a game that went FINAL at 20:05 froze
at 21:00 and was nudged at 21:00 the next day. Worse, a game whose `updatedAt`
fell outside the 7-day sweep window (outage, or a backlog deeper than
`AUTO_REMIND_BATCH_SIZE`) was never frozen and never reminded.

Fix: a post-commit `onGameFinalizedForCost(gameId)` hook in
`recalculateGameOutcomes`, sitting with the attendance / pair-stat / referral
hooks and following the same rules (idempotent, flag-guarded, never able to roll
back a result). The sweep's freeze step is now documented as a backstop.

- Files: `Backend/src/services/gameCost/onGameFinalizedForCost.ts` (new),
  `Backend/src/services/results/outcomes.service.ts`,
  `Backend/src/services/gameCost/costShareReminder.service.ts` (doc comment only)
- `gameCost.service.ts` was **not** touched (owned by another agent).

### PRD 349 — `useLiveGames` released rooms it never retained

The retain loop is asynchronous and aborts on `released`, but the cleanup
unconditionally released every id in `visibleIdsKey`. `releaseGameRoom` treats
`current <= 1` — including `0` — as "last holder", so releasing an unretained id
drives *another* subscriber's count to zero, leaves the socket room and bumps
`joinEpoch`.

Fix: the effect tracks the ids it actually took; cleanup releases exactly those.
A join that lands after the cleanup releases itself instead of leaking.

- File: `Frontend/src/features/live/useLiveGames.ts`
- Test: `useLiveGames.test.tsx` — the room mock can now stall a specific join; a
  new case interrupts the loop mid-list and asserts only the retained id is
  released, then unblocks the stalled join and asserts it releases itself.

### PRD 346 — own no-show notes hidden below the 5-game floor

`shouldShowAttendanceRate` gated the entire section, including the notes list
whose chat link is what the no-show push promises ("if that's wrong, reply in the
game chat"). The PRD attaches the 5-game floor to the *tile* only.

Fix: the floor now gates the tile and the sparkline (`ShowsUpTile` already
self-gates); the notes list always renders on the viewer's own profile. The
section still renders nothing when there is neither a rate nor a note.

- File: `Frontend/src/features/attendance/AttendanceStatisticsSection.tsx`

### PRD 345 — off-phase seed occurrence when the weekday is overridden

Converting a game to a series with a *different* weekday moved `anchorDayKey`
with `alignDayKeyToWeekday`, which stays inside the seed's own Monday-based week
— so the generator produced a second occurrence in that same week and every later
"week N" was off by one. (Reachable from the UI: `SeriesRepeatSheet` in `create`
mode posts the weekday chip.)

Fix: new `nextWeekdayAfterDayKey(dayKey, isoWeekday)` returns the first such
weekday **strictly after** the seed. The seed game keeps its own date as
occurrence #1 (positional numbering, see `gameSeriesCardEnricher.ts`), and the
cadence grid starts the following week. The `PATCH /series/:id` path is
unchanged — there is no seed to collide with there.

- Files: `Backend/src/services/gameSeries/gameSeriesOccurrenceDates.ts`,
  `Backend/src/services/gameSeries/gameSeries.service.ts` (the one `anchorDayKey`
  expression in `createFromGame`, nothing else)
- Test: `gameSeriesOccurrenceDates.test.ts`

### PRD 345 — organizer strip was owner-only

Fixed as **owner or platform admin**, not owner or game-`ADMIN`. `Skip next` and
`Edit series` both go through `assertSeriesOwner`, which accepts the series owner
or a platform admin (`isSeriesManager`) — showing the strip to a game-`ADMIN`
participant would render buttons that 403. The FE reads `user.isAdmin` from the
auth store, so no backend projection change (and no edit to the carry-over
service another agent owns).

- File: `Frontend/src/features/game-series/SeriesGameSection.tsx`

### PRD 345 — dead cap-helper link

`SeriesRepeatRow`'s `onManageSeries` escape hatch was behind a prop that
`CreateGame` never passed, so the cap branch rendered helper text with no way
out. `SeriesMakeWeeklyRow` already passes `onManageSeries={() => navigate('/profile')}`
to the same helper in `SeriesRepeatSheet`; `CreateGame` now does the same, which
is both consistent and what the PRD asks for ("and a link to Profile").

- File: `Frontend/src/pages/CreateGame.tsx`
- Note: the Profile → "Your regular games" *section* still does not exist (the
  builder's report §4.7 flagged it). The link now goes somewhere real instead of
  not rendering at all, but that section remains open work.

### PRD 354 — Telegram game messages did not link the club name

`locationLine` rendered the club name as escaped plain text. Now it is a
Markdown link to `${FRONTEND_URL}/clubs/:id` — the route is guest-readable and
already in the deep-link catalog. An `EVENT`'s free-text `venueText` has no club
and stays plain.

Added `markdownLink()` to `services/telegram/utils.ts`: `escapeMarkdown` guards
`[` but not `]`, which is fine for plain text and not fine inside a link label (a
club named "Padel [B] Centar" would leak the raw URL).

- Files: `Backend/src/services/telegram/utils.ts`,
  `Backend/src/services/telegram/notifications/game-card.notification.ts`

### PRD 357 — `?section=weather` without `action=moveIndoor` did nothing

`useWeatherDeepLink` computed `section: true` and `GameDetailsShell` only ever
read `autoOpenMoveIndoor`, so the "View forecast" push action every participant
gets stripped the params and left the user at the top of a long page.

Fix: `WeatherRiskBanner` takes `autoScrollIntoView` and scrolls its own root into
view (`block: 'center'`, `behavior: 'auto'` under reduced motion), then consumes
the intent.

- Files: `Frontend/src/components/weather/WeatherRiskBanner.tsx`,
  `Frontend/src/pages/GameDetailsShell.tsx`
- Test: new case in `WeatherRiskBanner.test.tsx`.

---

## Filed findings that are **not** defects (or are no longer)

### PRD 355 — "Gifting bypasses the block relationship" — already fixed

`Backend/src/services/shop/shopPurchase.service.ts:66-75` (current working tree)
already contains the check, *before* the transaction:

```ts
// A gift is an unsolicited push carrying the sender's name, so it must honour
// the block list in both directions. Answered as "no such recipient" rather
// than "blocked", which would confirm the block to the sender.
if (isGift && (await isBlocked(input.buyerUserId, ownerUserId))) {
  throw new ApiError(404, 'shop.recipientNotFound', …);
}
```

`isBlocked` comes from `services/social-graph/socialGraph.block` and is
bidirectional, which is exactly what the finding asked for. This file is one of
the two I was told not to edit, so this is another agent's landed fix — no action
taken, nothing left to do.

### PRD 345 — "organizer strip is owner-only, not owner/admin" — partially misfiled

The finding reads "admin" as a game `ParticipantRole.ADMIN`. The backend's
`assertSeriesOwner` / `isSeriesManager` accept the series owner or a **platform**
admin (`req.user.isAdmin`) and know nothing about per-game roles, so showing the
strip to a game-`ADMIN` co-organizer would produce two buttons that both 403. I
fixed the real gap (platform admins were excluded) and deliberately did **not**
extend it to game admins. If the PRD really means game co-organizers, that is a
backend permission change, not a UI change.

---

## Deliberately out of scope (owned elsewhere / excluded by the brief)

| Finding | Why untouched |
|---|---|
| PRD 345 — `GET /games/:id/series-next` and `GET /series/:id` have no access check | `gameSeries/` authorization, another agent. The working tree already carries `gameSeriesAccess.ts` (`isSeriesInsider` / `isSeriesManager`) and `viewerIsSeriesInsider`, so this looks handled. |
| PRD 345 — `ensureSeriesChat` only asserts on the create branch | same owner |
| PRD 346 — native push shade actions (Android `ChatReplyMessagingService`, iOS `UNNotificationCategory`) | excluded by the brief |
| PRD 347 — spot-opened push has no "Join now" shade button | same native-shade exclusion; the Telegram mirror already implements it and tapping the body carries `?join=1` |
| PRD 348 — coin settle is not idempotent past the transfer | `gameCost.service.ts`, assigned elsewhere; that file was not edited |
| PRD 355 — a second withdrawal of a re-activated item deletes ownership without refunding | `shopPurchase.service.ts`, assigned elsewhere; that file was not edited |

---

## Verification status

Per the brief, no heavy commands were run here — no `tsc`, no vitest, no lint, no
Prisma. The orchestrator runs them.

Highest-risk spots for a compile error in this change set:

- `IndoorAlternatives.currentCourts` crosses the API boundary; the backend type
  and `Frontend/src/api/gameWeather.ts` were changed together and
  `MoveIndoorSheet.test.tsx`'s `alternatives()` factory was updated, but any
  other fixture of that shape would now be missing a field (a repo-wide grep
  found none).
- `WeatherRiskBanner` uses a **callback** ref (`(node: HTMLElement | null) => void`)
  because the same handle is attached to a `motion.p` and a `motion.section`; a
  `RefObject<HTMLElement>` would not type-check against either.
- `shopFormat.ts` now imports the `GoodsKind` type from `@/api/shop`.
