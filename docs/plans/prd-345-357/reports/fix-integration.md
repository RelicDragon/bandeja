# Fix report — three DB-backed integration failures (PRDs 347, 350, 355)

One sentence per verdict:

| # | Test | Verdict | Side changed |
|---|---|---|---|
| 1 | `gameSeat.integration.test.ts` | real product gap | **implementation** (+ one fixture flag in the test) |
| 2 | `suggestedUsers.integration.test.ts` | wrong arithmetic in the test, plus a genuine boundary bug | **test** (assertions) + **implementation** (window bound) |
| 3 | `shop.integration.test.ts` | under-funded fixture | **test** (fixture only — the money guard is untouched) |

---

## Failure 1 — PRD 347, the "Join now" deep link was a dead button

### Root cause

`ParticipantService.joinGame` rejected **every** caller whose participant row was
`IN_QUEUE` with `400 games.alreadyInJoinQueue`, before any other logic:

```ts
if (existingParticipant.status === IN_QUEUE_STATUS) {
  throw new ApiError(400, 'games.alreadyInJoinQueue');
}
```

PRD 347 user story 1 is *"As a queued player, I want a push the moment a seat
opens, with a 'Join now' deep link, so that I get in first"*, and the UX section
says the action *"deep-links to the game with `?join=1`, which triggers the
normal join flow (gates and overlap confirm apply)"*. `?join=1` runs
`GameDetailsShell.handleJoin` → `POST /games/:id/join` → `joinGame`. So the
notification's own audience could not act on its only button. This is a product
gap, not a bad test.

(The frontend made it quieter rather than better: `JoinFromDeepLink` was handed
`alreadyInvolved = isParticipant || isInJoinQueue || …`, and `isParticipant`
here is `isParticipantNonGuest`, which is **true for a queue row**. So the deep
link was swallowed entirely for the queued player — no request, no error, no
seat. Either way the button did nothing useful.)

### What I changed and why

**Backend — `Backend/src/services/game/participant.service.ts`** (the only
behaviour change; everything else is a caller or a test):

* The `IN_QUEUE` hard-reject is gone. A queued caller now falls through the
  existing-participant branch, which already runs `validateGenderForGame`,
  `validatePlayerCanJoinGame` (roster lock → level band → gender → capacity),
  `assertSlotOverlapConfirmed`, and the in-transaction re-validation. No gate
  was skipped, loosened or reordered for the non-queue cases.
* `allowDirectJoin === false` (organizer accepts manually) refuses
  self-promotion, because that seat is the organizer's decision and
  `acceptNonPlayingParticipant` is the path for it. It refuses with
  `400 spots.queue.waitForOrganizer` — *"You're in the queue. The organizer
  seats players for this game."* — instead of the raw already-in-queue error.
  The roster lock is checked **first** in that branch
  (`validateGameCanAcceptParticipants(game)`), so a locked game still answers
  `errors.games.cannotJoinResultsStarted`, unchanged.
* When the gates say "queue this player" and they are *already* queued, the
  method returns the reason (`games.addedToQueueLevelOutOfRange`,
  `errors.invites.gameFull`, …) **without** calling
  `moveExistingParticipantToQueue`. Calling it would have re-announced
  "X joined the waiting list" in the admin chat on every tap.

Unchanged on purpose: `Already joined this game as a player` for a PLAYING
caller, the non-queue existing-participant path (invite / non-playing / guest),
the brand-new-participant path, and every message string those produce.

**Frontend** — so the button actually fires:

* `Frontend/src/features/spot-opened/joinDeepLink.ts` — new pure predicate
  `shouldSwallowJoinDeepLink(viewer)`. A queued viewer runs the join; the single
  exception is `allowDirectJoin === false`, where the request would only earn a
  red toast, so the link just opens the page and the queue panel's existing
  "Organizer accepts manually" line explains the wait.
* `Frontend/src/pages/GameDetailsShell.tsx` — uses that predicate for
  `alreadyInvolved` instead of the inline boolean.
* `JoinFromDeepLink.tsx` / `SpotOpenedGameSection.tsx` — prop docs corrected.

**i18n** — `spots.queue.waitForOrganizer` written in all 11 locales
(`Frontend/src/i18n/locales/<code>/spots.json`). Real translations, no
placeholders, no plural family; passes `localeParity.test.ts` rules.

**Test fixture** — `gameSeat.integration.test.ts` created its games with the
schema default `allowDirectJoin: false`, so its own "the queued player can still
take the seat" step was asking for exactly the behaviour PRD 347 says must be
refused. `makeGame` now takes `allowDirectJoin` and the section-1 game sets it
`true`; the manual-accept variant is covered in the new regression suite.

### Regression test added

`Backend/src/services/game/joinFromQueue.integration.test.ts` — six cases
against `padelpulse_dev`, all namespaced and cleaned up:

1. queued player takes a genuinely free seat → `games.joinedSuccessfully`,
   status `PLAYING`, exactly one promotion;
2. `allowDirectJoin: false` → `400 spots.queue.waitForOrganizer`, queue slot
   intact, **no new chat message** (proves the queue join is not re-announced);
3. level band failed → `games.addedToQueueLevelOutOfRange`, stays `IN_QUEUE`,
   no new chat message;
4. full roster → `errors.invites.gameFull`, stays `IN_QUEUE`, roster still 2/2;
5. already `PLAYING` → `Already joined this game as a player` (unchanged);
6. locked roster (`resultsStatus: IN_PROGRESS`) → `errors.games.cannotJoinResultsStarted`
   for **both** `allowDirectJoin` values, i.e. the lock still answers first.

Frontend: four new cases for `shouldSwallowJoinDeepLink` in
`Frontend/src/features/spot-opened/JoinFromDeepLink.test.ts`.

### Risk in the shared join path

`participant.service.ts` is on every join surface (game details, Find,
`CourtLobbySheet`, the controller). Known and accepted consequences:

* A queued player tapping **Join** anywhere — not only from the push — can now
  be seated on a direct-join game with a free seat. That is the same decision
  the organizer already delegated by turning `allowDirectJoin` on, and the same
  promotion auto-fill performs, so I consider it correct rather than a
  side-effect. It is nevertheless a live behaviour change on a hot path.
* `addOrUpdateParticipant` clears `inviteUserTeamId` when it promotes. A queued
  player who reached the queue through a **team** invite therefore loses the
  team link on self-join, where `acceptNonPlayingParticipant` would have run
  `applyUserTeamToFixedTeamsIfReady`. This was already true for every other
  existing-participant join; I did not widen it, and I did not fix it either.
* I deliberately did **not** emit `game-seat-filled` from this path (auto-fill
  still does). The join already emits `game-updated` via
  `performPostJoinOperations`, so the roster refreshes; the organizer just does
  not get the "X joined from the queue" toast for a self-serve join.
* An OWNER/ADMIN sitting in their own queue on a manual-accept game now sees the
  "the organizer seats players" message instead of "already in join queue".
  Both are 400s and neither is a path the UI offers them (`togglePlayingStatus`
  and accept-self are). I chose not to add an owner bypass to `joinGame`,
  to keep the diff minimal.

---

## Failure 2 — PRD 350, "People to follow"

### Root cause

Two separate things, one of which was only visible because of the other.

1. **The test's arithmetic was wrong.** `top` had finished games 5, 20 and 50
   days ago. `gamesThisMonth` (30-day window) is therefore **2**, not 1 — the
   assertion `'only the 5-day-old game is inside 30 days'` simply forgot the
   20-day-old game. The implementation was right: 60 days for the ranking
   (`SUGGESTED_USERS_WINDOW_DAYS`), 30 days for the display count
   (`SUGGESTED_USERS_RECENT_DAYS`), matching PRD 350 line 59 (*"ranked by
   finished games in the last 60 days"*) and line 36 (*"12 games this month"*).
2. **The window was bounded on the wrong column.** Both group-bys filtered
   `game.startTime >= since`. The window means "games **finished** in the last
   N days", so the bound is `endTime`. For a 90-minute match the two agree; for
   a league season or a multi-day tournament that began before the window and
   ended inside it, only `endTime` is right. Switched both to
   `endTime: { gte: since }` in `suggestedUsers.service.ts`.

`endTime >= startTime`, so this can only ever **add** a straddling game, never
drop one the old bound matched — the change is monotone and cannot shrink
anybody's rank. `Game.endTime` is non-nullable and indexed (`@@index([endTime])`).

Boundary semantics left as they were: `gte`, i.e. inclusive of exactly N days
ago. Both windows use the same rule.

**Copy:** left alone. `onboarding.follow.gamesThisMonth` ("{{count}} games this
month") is the PRD's own wording, and a rolling 30 days is better product
behaviour than a calendar month, which would reset every count to zero on the
1st — exactly when the onboarding list would look dead. Flagged here rather than
silently changed.

### Files touched

* `Backend/src/services/onboarding/suggestedUsers.service.ts` — both group-by
  filters now bound on `endTime`, with the reasoning in a comment.
* `Backend/src/services/onboarding/suggestedUsers.integration.test.ts` —
  `gamesThisMonth` corrected to 2 / 1; `makeFinishedGame` grew an
  `endedDaysAgo` option; a new fixture game for `mid` that **started** 61 days
  ago and **ended** 59 days ago, asserted to count (`gamesInWindow === 2`)
  while staying out of the 30-day count. On the old `startTime` bound that game
  vanishes, so the assertion is a real regression guard.

`suggestedUsers.service.test.ts` (pure) needed no change — it asserts the
constants and the ranking function, neither of which moved.

### Risk

Ranking may now include a long-running entity a caller previously did not see.
That is the intended fix, and the `FINISHED`-only + city + sport filters are
unchanged, so nothing new leaks into the list.

---

## Failure 3 — PRD 355, the shop

### Root cause

**The test under-funded its fixture wallet.** `buyer` started with 500 coins and
spent 120 (frame) + 200 (premium gift) + 80 (name-colour gift) + 60 (second
frame) = 460, leaving 40. Step 9 then re-buys the 80-coin `nameColor` to set up
the two-owner withdraw, and `rejectPurchase` correctly refused it with
`shop.insufficientCoins`. The step-6 purchase of `otherFrame` was simply left
out of the budget when the test was written.

**The hardening is correct and untouched.** I verified each invariant the brief
names, against `Backend/src/services/shop/shopPurchase.service.ts`:

* the conditional `updateMany({ where: { id, wallet: { gte: item.price } } })`
  and the debit are one statement, inside the same `prisma.$transaction` as the
  `UserGoods` insert and the `Transaction` rows;
* the price comes from `item`, read **inside** that transaction — not a stale
  pre-transaction read;
* a gift charges `buyer.id` (`input.buyerUserId`) and grants to `ownerUserId`;
  the recipient's wallet is never touched (step 4 of the test asserts this);
* there is exactly one decrement per purchase, and equip/unequip
  (`ShopService.equip`) never touches `wallet` — no double-debit across
  buy + equip;
* idempotency under retry is the `UserGoods` `@@unique([userId, goodsId])`
  surfacing as `ALREADY_OWNED` / P2002, not a `findFirst` check;
* the concurrency case (step 11) is genuinely exercised: two simultaneous buys
  of *different* items, one fulfilled, one refused with 400, wallet lands on 0.

So the failure was a fixture bug, and softening the guard to fit it would have
been exactly the wrong move.

### Files touched

`Backend/src/services/shop/shop.integration.test.ts` only:

* `buyer` starts with **800** instead of 500, with a comment saying why;
* the four hard-coded balance assertions that were derived from 500 are
  re-derived from 800: `680` (after the frame), `680` ×2 (the two
  "spends nothing" checks), `480` (after the premium gift), `400` (after the
  name-colour gift). Everything from step 9 onward was already expressed
  relative to `beforeBuyer` / `walletsAfter` and needed no change.

New ledger: 800 → 680 → 480 → 400 → 340 (`beforeBuyer`) → 260 (re-buy) → 340
(refund) → 260 (re-buy) → 340 (refund). Every relative assertion in steps 9–12
holds.

### Risk

None to production code — no shop source file was modified. The purchase does
credit the Bandeja bank user, whose wallet the test does not restore; that is
inherent to the code under test and was already true.

---

## Housekeeping

`ChatMessage.gameId` and `ChatSyncEvent.contextId` are plain columns with **no**
foreign key to `Game`, so deleting the game in `finally` left system messages
and sync events behind in `padelpulse_dev`. Both `gameSeat.integration.test.ts`
and the new `joinFromQueue.integration.test.ts` now delete them explicitly
before the game, scoped to ids the test created.

## Files touched

Backend
* `Backend/src/services/game/participant.service.ts`
* `Backend/src/services/onboarding/suggestedUsers.service.ts`

Backend tests
* `Backend/src/services/game/joinFromQueue.integration.test.ts` *(new)*
* `Backend/src/services/gameSeat/gameSeat.integration.test.ts`
* `Backend/src/services/onboarding/suggestedUsers.integration.test.ts`
* `Backend/src/services/shop/shop.integration.test.ts`

Frontend
* `Frontend/src/features/spot-opened/joinDeepLink.ts`
* `Frontend/src/features/spot-opened/JoinFromDeepLink.tsx`
* `Frontend/src/features/spot-opened/SpotOpenedGameSection.tsx`
* `Frontend/src/features/spot-opened/JoinFromDeepLink.test.ts`
* `Frontend/src/pages/GameDetailsShell.tsx`

i18n
* `Frontend/src/i18n/locales/{en,ru,sr,es,cs,ar,zh,id,hi,th,ja}/spots.json`

## For the orchestrator

Add the new backend integration test to the `test:prd-integration` chain in
`Backend/package.json` (I may not edit that file):

```
&& ts-node -r dotenv/config --transpile-only src/services/game/joinFromQueue.integration.test.ts
```

## Invariant worth pinning in `docs/product/constraints.md`

> A queued player (`GameParticipant.status === 'IN_QUEUE'`) may promote
> themselves to `PLAYING` through `ParticipantService.joinGame` **only** when
> `Game.allowDirectJoin` is true and every normal join gate passes. When the
> organizer accepts manually, promotion happens exclusively through
> `ParticipantService.acceptNonPlayingParticipant`.
> (`Backend/src/services/game/participant.service.ts`,
> `Backend/src/services/game/joinFromQueue.integration.test.ts`.)
