# Final gate — fixes

Closes every item in `critic-final.md` that the brief assigned: 1 BLOCKER, 2 MAJORs, 4 MINORs.
Nothing was executed (no `tsc`, build, lint, vitest or Prisma) — the orchestrator runs the suites.

---

## [BLOCKER] `Game.paymentHint` served unauthenticated by `GET /api/games/:id`

**Defect.** `Backend/src/routes/game.routes.ts:118` is `optionalAuth`, and
`GameReadService.getGameById` ran `include: gameWithRoundsAndOutcomes` — a **top-level Prisma
`include`**, so every `Game` scalar shipped, PRD 348's `paymentHint` (an IBAN or a Revolut handle)
among them. `curl https://<host>/api/games/<id>` with no `Authorization` header returned it.
The nested `club: { include: … }` / `court: { include: { club: true } }` shipped
`Club.integrationConfig` and `Club.ptMeta` the same way, and every nested user carried `bio` /
`verbalStatus` / `weeklyAvailability` / `availabilityBucketBoundaries` / `socialLevel`.

**Fix.** New whitelist projection module, built to the house shape
(`availableGamesCard.projection.ts` + `results/gameResults.projection.ts`): explicit `select`,
machine-readable forbidden lists, contract asserter.

`Backend/src/services/game/gameDetail.projection.ts` (new)

- `GAME_DETAIL_GAME_SCALAR_SELECT` — every `Game` scalar the detail payload may carry.
  `paymentHint` is **not in it**, and a new column does not reach the endpoint until someone
  writes it down.
- `getGameDetailSelect({ viewerIsAuthenticated })` — scalars + the complete relation tree
  `gameWithRoundsAndOutcomes` used to produce (all 18 relations, verified key by key), with two
  audiences:
  - signed-in: unchanged payload, including `Club.integrationConfig` (parsed by
    `clubHasBookingIntegration` / `clubToBooktimeRow` on `GameLinkedBookingsSection`) and the
    roster bios the player card renders;
  - guest: same shape minus `integrationConfig`, `ptMeta` and the five personal user fields.
- `GAME_PAYMENT_HINT_SELECT` + `isEntitledToGamePaymentHint(roster, viewer)` — the hint is read by
  a **second, separate query that only runs after the server authorised the viewer against the
  loaded roster**, so the value never enters the process for a caller who may not have it. The
  entitlement mirrors `canViewCostShares` (`gameCost/costSharePermissions.ts`): platform staff,
  organizers, anyone holding a roster row in any `ParticipantStatus`. Fails closed on no viewer id.
- The `parent` (a league-season / tournament `Game` row) never carries `paymentHint` at all.
- `collectGameDetailGuestContractIssues` / `assertGameDetailGuestContract` — the asserter, used by
  both the unit and the integration test.

`Backend/src/services/game/read.service.ts`

- `getGameById` switched from `include` to `select: getGameDetailSelect(...)`, plus the authorised
  follow-up read that merges `paymentHint` only for entitled viewers.
- **Also fixed the byte-identical leak on `GET /api/games`** (`read.service.getGames`), which is
  `optionalAuth` too (`game.routes.ts:48`) and ran the same top-level include for *every row a
  filter matched*. It now uses `getGameListSelect(...)` — the same scalar whitelist minus
  `paymentHint`, with the list's relation subset (no rounds / outcomes / gameCourts / external
  bookings). The now-dead `getBaseGameInclude` / `getGamesCourtInclude` / `getGamesParentInclude` /
  `getLeagueSeasonInclude` locals were removed.

**Callers checked before changing the shape** (a missing field here is a blank screen, not a
compile error):

| Caller | Outcome |
|---|---|
| `GET /api/games/:id` (game details, chat header, create/edit prefill, `?join=1`, deep links) | Every `Game` scalar except `paymentHint` still selected; `EditGameInfoModal` (`game.paymentHint`) and `CreateGame` duplicate-prefill are organizer paths and therefore entitled |
| Socket `game-updated` (`socket.service.ts:1180`, `gamePhoto.events`, `update.service`, `participantMessageHelper`) | Payload is broadcast to `game-${id}`, whose join gate is roster membership (`MessageService.validateGameAccess`) — the same entitlement, so the hint stays available to the edit modal after a socket refresh |
| `metatags.controller.ts:150` (`getGameById(id, undefined, true)`) | Guest projection; reads only name/description/avatar |
| `chat.controller.ts:906`, `invite.controller.ts:250`, `results.controller.ts:184` | Authenticated projection, unchanged fields |
| `attachLocalizedTextToGame` | Reads `id`, `parentId`, `parent.id`, `parent.leagueSeason.game.id`, `leagueSeason.game.id` — all present |
| `projectGamePhotoPayload` / `canViewGamePhotos` / `getOwnerIsPremiumFromGame` / `withLegacyGoldenPointField` | All inputs present (`forbidOthersPhotosView`, `parent.participants`, `resultsArtifacts*`, `deucesBeforeGoldenPoint`) |
| Telegram `/mygames` (`GameReadService.getGames`) | Reads participants, entityType, status, `court.name`, club place — all in the list select |
| `gamesApi.getAll` (FE) | **Zero call sites**; the list route is effectively dead FE surface, which is why no entitled variant was built for it |

**Regression test.** `Backend/src/services/game/availableGamesCard.projection.test.ts` (wired:
`npm run test:available-games`) — `runGameDetail()` asserts the scalar whitelist omits
`paymentHint` while still selecting the 17 fields the detail screen reads, that the guest select
omits `integrationConfig` / `ptMeta` / `bio` / `weeklyAvailability` / `socialLevel`, that the
signed-in select keeps `integrationConfig`, that `parent` never carries `paymentHint`, the full
entitlement truth table, the list select, and each branch of the contract asserter.
`Backend/src/services/gameCost/gameCostSettle.integration.test.ts` (wired:
`npm run test:prd-integration`) proves it end to end against the database: an unauthenticated
caller and a signed-in stranger get no `paymentHint` key at all (and the guest payload passes
`collectGameDetailGuestContractIssues`), while a roster member and the organizer both get the
value. Both fail on the current code.

---

## [MAJOR] `joinGame` took no row lock, so a game could overfill

**Defect.** Capacity is a check-then-act: `validatePlayerCanJoinGame` counts PLAYING and
`addOrUpdateParticipant` writes the seat, at READ COMMITTED with nothing locked and no DB-level
capacity constraint (`GameParticipant` has only `@@unique([userId, gameId])`). PRD 347 makes that
the *designed* path — when a seat frees up and auto-fill is off,
`dispatchSpotOpenedNotifications` pushes "Join now" to the **whole queue** at once.

**Fix.** `Backend/src/services/game/participant.service.ts` — new module-local
`lockGameRowForSeating(tx, gameId)` issuing
`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`, the same guard `acceptSeat` uses
(`gameSeries/gameSeriesCarryOver.service.ts:462`; house pattern also at `gameTeam.service.ts:68`
and `gamePhoto.create.service.ts:97`). Applied as the **first statement** of the three
seat-granting transactions:

- `joinGame` — queued-player promote branch;
- `joinGame` — new-joiner branch;
- `acceptNonPlayingParticipant` — the organizer accept, which is also the auto-fill path
  (`gameSeat.service.ts` → `ParticipantService.acceptNonPlayingParticipant`), so auto-fill and a
  self-join racing for the last seat serialise against each other too.

Brief's constraints, each honoured:

- **Inside the existing write transaction** — no new transaction was opened.
- **No behaviour change off the seating path** — queue moves, the already-PLAYING short-circuit,
  the manual-accept refusal and every `shouldQueue` branch answer *before* the transaction opens,
  so an ordinary read never waits on the lock.
- **Validation order unchanged** — the lock is taken, then the existing re-read + re-validate runs
  exactly as before.
- **No deadlock** — every seating path takes the same single lock first, so there is no lock-order
  cycle; the loser simply waits for the winner's commit.
- **Correct existing error for the loser** — after the lock, `validatePlayerCanJoinGame` returns
  `errors.invites.gameFull` and the existing `throw new ApiError(400, txJoinResult.reason …)`
  carries it. No 500, no raw database failure.

**Regression test.** `Backend/src/services/game/joinFromQueue.integration.test.ts` §7 (wired:
`npm run test:prd-integration`) — three rounds of two queued players calling
`ParticipantService.joinGame` concurrently for one seat in a 3-slot game. Asserts the PLAYING
roster is exactly 3 every time, exactly one caller returns `games.joinedSuccessfully`, the loser
gets `errors.invites.gameFull` (as the 200-path reason or as an `ApiError(400)` — the race decides
which, both are correct), and the loser keeps their queue slot.

---

## [MAJOR] PRD 345 user story 18 had no UI

**Defect.** `Frontend/src/pages/SeriesPage.tsx:535` gated the only remove control on
`series.isOwner`, so a regular could never reach the self-removal the backend has always permitted
(`gameSeriesAccess.ts:62-64`). Separately, `seriesApi.addRegular` had zero call sites.

**Fix.**

`Frontend/src/features/game-series/seriesRosterActions.ts` (new, pure):

- `seriesRegularAction({ isOwner, isEnded, viewerUserId, regularUserId })` →
  `'none' | 'remove' | 'leave'`. Own row wins over ownership, so an organizer sitting on their own
  roster sees "leave", not "remove"; an ended series is a read-only archive.
- `seriesRegularCandidates(occurrences, regulars)` — seated players from the series' own
  occurrences who are not on the roster yet, deduped, past-first.
- `seriesRegularName(user, fallback)`.

`Frontend/src/pages/SeriesPage.tsx`:

- `RegularRow` takes `action` instead of `canRemove`; the `'leave'` variant renders a distinct,
  destructive-toned control (44 px min height, logical spacing) reading `series.leaveRegulars`.
- Leaving goes through a `ConfirmationModal` whose copy is explicit that this is **"not next
  week", not "not tonight"** — `series.leaveRegularsTitle` / `…Body` / `…Confirm`, and a
  `series.leftRegulars` toast. `handleLeaveRegulars` calls
  `DELETE /series/:id/regulars/:userId` for the viewer's own id, which touches only the
  `GameSeriesRegular` row and never the occurrence roster.
- **The "add a regular" endpoint is now wired** rather than deleted. `POST /series/:id/regulars` is
  owner-only *by design* (being a regular unlocks the carry-over seat and the private series chat,
  so self-add is refused server-side — `gameSeries.service.ts:1211-1231`), and there is no people
  search on this surface, so the organizer's control offers the series' own players: a collapsible
  `series.addRegular` button on the Regulars tab listing `seriesRegularCandidates`, each with an
  `Add` action. That satisfies `prd-345.md:55`'s "remove/**add** for organizer" without inventing a
  new endpoint or a new picker. (The unused `series.joinRegulars` string stays unused on purpose —
  self-join is exactly what the backend refuses.)

**Strings.** Eight new keys in `series.json` in all 11 locales (`en ru sr es cs ar zh id hi th ja`):
`leaveRegularsTitle`, `leaveRegularsBody`, `leaveRegularsConfirm`, `leftRegulars`, `addRegular`,
`addRegularAction`, `addRegularHint`, `addRegularEmpty`. Verified: identical key sets across
locales apart from the pre-existing CLDR plural families, and no non-`en` value byte-identical to
English.

**Regression test.** `Frontend/src/features/game-series/seriesFormat.test.ts` (wired:
`npm run test:series`) — the full `seriesRegularAction` matrix (regular leaves own row, regular
gets nothing on another row, organizer keeps remove, organizer's own row is "leave", ended series
offers nothing, no user id / signed-out viewer), plus `seriesRegularCandidates` (dedupe, ordering,
ignores IN_QUEUE / INVITED / NON_PLAYING, empty when everyone is already a regular) and
`seriesRegularName`. The first case fails on the current code, where the control did not exist.

---

## [MINOR] Green success toast reading "Game is full"

**Fix.** `Frontend/src/features/spot-opened/joinOutcomeTone.ts` (new, pure): maps the join
endpoint's 200-path message to `'success' | 'error'`. Seated and newly-queued outcomes are a
success; `errors.*` (matched by prefix — "Game is full" arrives as `errors.invites.gameFull`),
`games.alreadyInJoinQueue`, `games.addedToQueueLevelOutOfRange` and `spots.queue.waitForOrganizer`
are a failure. Unknown/legacy plain text stays a success, so nothing regresses.

Applied at all three join surfaces: `Frontend/src/pages/GameDetailsShell.tsx` (`handleJoin`),
`Frontend/src/pages/FindTab.tsx` (`joinWithGates` — Find is where the "Spot opened" pill lives),
and `Frontend/src/components/playIntent/CourtLobbySheet.tsx` (the fallback branch). The message
text itself is unchanged; only the tone follows the outcome. Two tones, not three, so the
renderers keep using `toast.success` / `toast.error` and no surface needs a callable bare `toast`.

**Regression test.** `Frontend/src/features/spot-opened/queueState.test.ts` (wired:
`npm run test:spot-opened`) — `errors.invites.gameFull` must be `'error'`, which fails on the
current code path.

---

## [MINOR] `/games/available/enrichment` leaked a private series' name and schedule

**Fix.** `Backend/src/services/game/availableGamesEnrichment.ts` —
`enrichAvailableGamesByIds` now applies the viewer gate to its own query instead of trusting the
id list:

```
OR: [
  { isPublic: true },
  { participants: { some: { userId } } },
  { parent: { participants: { some: { userId } } } },
]
```

Same predicate Find itself uses (`availableGamesQuery.ts` `buildVisibilityOr`), plus the parent
branch league fixtures rely on. One gate covers the whole batch, so `seriesLabel`, `perHeadPrice`
and every future enricher are scoped at once. A game the viewer may not see produces **no entry**
— an absent key already means "no change" to the client merge, so this is not an existence oracle
either.

**Regression test.** `Backend/src/services/gameSeat/gameSeat.integration.test.ts` §8 (wired:
`npm run test:prd-integration`) — an outsider gets the public game enriched and no entry at all for
the private one; a player on the private game's roster still gets their own game enriched.

---

## [MINOR] The "Spot opened" pill survived the seat being refilled

**Fix.** The pill is now keyed on *a seat **is** open*, not *a seat opened recently*.

- `Backend/src/services/gameSeat/spotOpenedEnricher.ts` — the query also selects
  `maxParticipants` and the PLAYING participant rows, and skips any game whose roster is full
  again. Fails **open** on a missing/zero `maxParticipants`.
- `Frontend/src/features/spot-opened/spotOpenedWindow.ts` — the client mirror does the same in
  `resolveSpotOpenedAt`, so a cached card that outlives the response also drops the pill (and with
  it the `sortDayGroupGames` day-group boost). Fails open when the card carries no roster.

`buildGameRenderSignature` already includes `playingParticipantsKey` and `maxParticipants`, so the
memoised card repaints when the seat is taken.

**Regression test.** `Frontend/src/features/spot-opened/spotOpenedWindow.test.ts` (wired:
`npm run test:spot-opened`) — pill dropped when full, kept when a seat is genuinely open, queued /
invited rows not counted, fails open with no roster, and a full game loses the day-group boost.
`gameSeat.integration.test.ts` §7 proves the same against the database through the enricher.

---

## [MINOR] `setShareConfirmed` could release an in-flight COINS claim

**Defect.** `settleOwnShareWithCoins` stamps `confirmedAt = claimedAt, method = COINS` and writes
`transactionId` only after `createGuardedTransfer` returns. The guard at
`gameCost.service.ts:726` sees `transactionId == null` for that whole window, so the unconditional
`update` cleared `confirmedAt` mid-transfer, the claimant's own stamp
(`where: { confirmedAt: claimedAt, transactionId: null }`) matched 0 rows, and the next "Pay with
coins" transferred a second time for one share.

**Fix.** `Backend/src/services/gameCost/gameCost.service.ts` — the write is now an `updateMany`
scoped to `method: { not: 'COINS' }` (both the tick and the un-tick, since writing `confirmedAt`
mid-transfer breaks the stamp predicate either way), and a 0-row match is a refusal
(`ApiError(400, 'errors.cost.alreadySettled')`), never a silent no-op. A COINS row is owned by the
coin path from claim to stamp. The FE already renders this as `cost.errors.confirmFailed`, so no
new strings.

**Regression test.** `Backend/src/services/gameCost/gameCostSettle.integration.test.ts` (wired:
`npm run test:prd-integration`) — constructs the exact in-flight state
(`method: COINS, confirmedAt: claimedAt, transactionId: null`), asserts the un-tick is refused with
a 400 and the claim survives intact, then flips the row to MANUAL and asserts the ordinary un-tick
still works unchanged.

---

## Not closed, and why

- **`critic-final.md`'s seventh MINOR — two frontend test files in no npm script**
  (`PlayIntentDeepLink.test.tsx`, `TeamPlayerSelector.test.tsx`). Not in this brief's list, and
  `Frontend/package.json` is off limits. **Action required by someone who may edit it:** append
  `src/components/playIntent/PlayIntentDeepLink.test.tsx` to `test:play-intent` and
  `src/components/GameDetails/TeamPlayerSelector.test.tsx` to `test:user-team`. Every test I added
  went into a file an existing script already names, precisely so this cannot recur.
- **No migration is needed.** Every fix is query-shape or application logic. Had I been allowed a
  schema change, the sturdiest form of MAJOR-2 would be a DB-level capacity constraint, which
  Postgres cannot express declaratively across rows — it would need a `BEFORE INSERT OR UPDATE`
  trigger on `GameParticipant` counting `status = 'PLAYING'` against `Game.maxParticipants`. The
  row lock is the house pattern and is sufficient; the trigger is not proposed.
- **`GET /games/:id/cost` and `GET /past-games` / `my-games` still use top-level includes.** Both
  are `authenticate`d *and* membership-scoped by their `where` clause, so every recipient is
  already entitled to `paymentHint`; `gamePrismaIncludes.ts:282-294` documents this for My Tab
  deliberately. Left alone.
- **One pre-existing edge the COINS scoping narrows:** a share stranded as
  `method: COINS, transactionId: null` by a hard process kill mid-transfer can no longer be
  un-ticked back to life. It was already unusable by the coin path (`ALREADY_SETTLED`), so this
  does not create the stranding — but recovery is now admin/DB work rather than an organizer tap.
  Worth a follow-up if it is ever observed.
- **The `↻ Weekly` card pill is still not a link**, and Profile → "Your regular games" still does
  not exist. Both were already on `critic-final.md`'s accepted-gaps list and are outside this
  brief.
