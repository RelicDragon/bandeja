# Closing gate

## Verdict

**DO NOT SHIP** — one BLOCKER, introduced by this cycle's own headline fix.

Everything the previous gate asked for is genuinely closed. I re-ran all seven findings on
paper and every one is FIXED, not papered over: the `paymentHint` whitelist is a real
whitelist (I diffed `GAME_DETAIL_GAME_SCALAR_SELECT` against `schema.prisma` field by field —
it is *exactly* the `Game` scalar set minus `paymentHint`), the second leak on `GET /api/games`
is closed too, the row lock is the first statement of all three seat-granting transactions and
the loser gets `errors.invites.gameFull`, user story 18 and the organizer "add a regular"
control are both wired with all eight new strings present in all eleven locales, and the four
MINORs are each closed at the right layer.

The single worst thing is the one thing the brief predicted: **a signed-in caller lost a field
it reads, and the consumer writes that field back unconditionally.** `getGameById` now omits
`paymentHint` for a viewer who is not on the roster — and `ParticipantMessageHelper.emitGameUpdate`
computes the socket `game-updated` payload from the perspective of the actor, who in the most
common case (`leaveGame`) has just had their roster row **deleted**. So when any player leaves a
game, every other client in the room — including the organizer's open Game Details screen — has
its `game` object replaced with one that has no `paymentHint` key. `EditGameInfoModal` seeds
`paymentHint: game.paymentHint ?? ''` and then writes `updateData.paymentHint = price.paymentHint.trim() || null`
**unconditionally** on any save of a paid game. The organizer edits the description, hits Save,
and their IBAN is silently deleted from the database. That is a destructive write, not a blank
screen, and it is a regression this cycle created. Before the fix, `getGameById` returned
`paymentHint` to every caller, so the organizer's state could never be missing it.

Everything else I found is MINOR. Fix the wipe and this ships.

---

## Previous gate findings re-checked

| Finding | Severity | Status | Evidence |
|---|---|---|---|
| `Game.paymentHint` unauthenticated on `GET /api/games/:id` | BLOCKER | **FIXED** (see regression below) | `read.service.ts:284-287` is now `select: getGameDetailSelect(...)`. `gameDetail.projection.ts:77-164` is a literal scalar whitelist; I diffed it against the `Game` model in `prisma/schema.prisma` — 85 scalars present, `paymentHint` the only omission, nothing named that is not a column. The hint is a separate `findUnique` at `read.service.ts:404-408` gated on `isEntitledToGamePaymentHint` (`gameDetail.projection.ts:551-559`), which fails closed on a missing viewer id. Guest select also drops `integrationConfig` / `ptMeta` / the five personal user fields; `parent` never carries the hint (`gameDetail.projection.ts:478-488`). |
| …same leak on `GET /api/games` (found by the fix agent) | — | **FIXED** | `read.service.ts:506-512` → `getGameListSelect` (`gameDetail.projection.ts:514-530`). I diffed the new list select against the deleted `getBaseGameInclude`/`getGamesCourtInclude`/`getGamesParentInclude` in `git diff Backend/src/services/game/read.service.ts`: it is a strict superset of the old relation set minus `paymentHint` and `ptMeta`. Sole non-dead consumer is Telegram `/mygames` (`telegram/commands/myGames.command.ts:44`), which reads only `participants`, `entityType`, `status`, `court.name`, club place — all present. |
| `joinGame` takes no row lock | MAJOR | **FIXED** | `lockGameRowForSeating` at `participant.service.ts:74-79` is the **first** statement of all three seat-granting transactions: `:148` (queued promote), `:210` (new joiner), `:703` (`acceptNonPlayingParticipant`, which is also the auto-fill path). Single row, same row, same position → no lock-order cycle; I checked all 27 `FOR UPDATE` sites in `Backend/src` and no other path locks a `GameParticipant` before a `Game`. Prisma interactive transactions run at the DB default (READ COMMITTED), so the re-read at `:149`/`:211` sees the winner's commit, `canAddPlayerToGame` returns `errors.invites.gameFull` (`participantValidation.ts:127/137/147`) and `:152`/`:215` throws it as a 400. |
| Regulars roster read-only for non-owners (US 18) | MAJOR | **FIXED** | `seriesRosterActions.ts:29-40` (`seriesRegularAction`, own row wins over ownership, ended series → `'none'`), rendered at `SeriesPage.tsx:652-665` with a distinct destructive `'leave'` control at `:139-148` behind a `ConfirmationModal` (`:707-716`) that only calls `DELETE /series/:id/regulars/:userId` for the viewer's own id (`:255-267`). Backend permits it (`gameSeriesAccess.ts:57-64`) and a regular is a `isSeriesInsider` so `/series/:id` is reachable for them (`gameSeriesAccess.ts:83-90`). `addRegular` is now wired (`SeriesPage.tsx:667-701` → `:270-285`), candidates from the series' own occurrences (`seriesRosterActions.ts:54-79`). All 9 new/used `series.*` keys present in en ru sr es cs ar zh id hi th ja. |
| Join-failure toast tone | MINOR | **FIXED** | `joinOutcomeTone.ts` maps `errors.*` by prefix plus three unprefixed refusal keys to `'error'`; applied at all three join surfaces (`GameDetailsShell.tsx:669`, `FindTab.tsx:535`, `CourtLobbySheet.tsx:579`). Unknown/legacy text still defaults to success, so nothing regresses. |
| `/games/available/enrichment` series leak | MINOR | **FIXED** | `availableGamesEnrichment.ts:221-240` now applies `OR: [{isPublic}, {participants.some}, {parent.participants.some}]` to its own query, so an unentitled id produces no entry rather than a `seriesLabel`/`perHeadPrice`. |
| "Spot opened" pill survives a refill | MINOR | **FIXED** | Backend `spotOpenedEnricher.ts:40-56` selects `maxParticipants` + PLAYING rows and skips full games (fails open on a missing cap, `:62-65`); client mirror `spotOpenedWindow.ts:48-56,58-66` does the same, so a cached card also drops the pill and the `sortDayGroupGames` boost. |
| `setShareConfirmed` releases an in-flight COINS claim | MINOR | **FIXED** | `gameCost.service.ts:747-752` is now `updateMany({ where: { …, method: { not: 'COINS' } } })` with a 0-row match raising `errors.cost.alreadySettled` (`:753`). `method: 'COINS'` is written only by the coin path (`:673`), never by `markOwnSharePaid` (`:639-644`), so a user cannot poison their own row into un-tickability. |
| Two frontend test files in no npm script | MINOR | **NOT FIXED** (declared) | `fix-final-gate.md:269-274` states it and names the exact edits; `Frontend/package.json` was off limits to the fix agent. Still outstanding. |

---

## New findings

### [BLOCKER] A player leaving a game makes the organizer's next "Save" wipe `Game.paymentHint`

- **Where:**
  `Backend/src/services/game/participant.service.ts:293` (`emitGameUpdate(gameId, userId)` fired
  *after* the leaver's row is deleted at `:286`) →
  `Backend/src/services/game/participantMessageHelper.ts:111` (`getGameById(gameId, senderId)`) →
  `Backend/src/services/game/read.service.ts:398-409` (entitlement returns false → key absent) →
  `Backend/src/services/socket.service.ts:1236-1238` (that one payload is broadcast to the whole
  `game-${id}` room) →
  `Frontend/src/pages/GameDetailsShell.tsx:463` (`let merged: Game = updatedGame` — a wholesale
  replacement for any update not from self) →
  `Frontend/src/components/GameDetails/EditGameInfoModal.tsx:120` (`paymentHint: game.paymentHint ?? ''`)
  and **`:839`** (`updateData.paymentHint = price.paymentHint.trim() || null`, written on every
  save of a paid game, *not* gated on `priceDirty`).
  Backend accepts the null: `update.service.ts:127` has `paymentHint` in the writable scalar list
  and `:161-162` normalises `''` → `null`.
- **Defect:** the socket `game-updated` payload is projected for the **actor**, and three common
  actors are no longer entitled to `paymentHint` because their roster row was just removed. The
  edit modal re-seeds from that stripped object and then writes the field back unconditionally,
  so an unrelated edit destroys it.
- **Failure scenario:** Organizer creates a paid game, opens "How to pay you" and types
  `IBAN RS35 1234 …`. She stays on Game Details (exactly where PRD 347 expects her — she is
  watching the roster). A player taps Leave; `leaveGame` deletes his `GameParticipant` row and
  emits `game-updated` computed as *him*, so the payload carries no `paymentHint` key. Her
  `game` state is replaced. She opens Edit game info, shortens the description, taps Save.
  `executeSave` sends `paymentHint: null`. The IBAN is gone from the database, from her own edit
  screen and from every player's `CostSettleSheet` — with no error, no confirmation and no undo.
  A page reload afterwards restores nothing.
  Two more actors reach the same state: `invite.service.ts:461` / `:519`
  (`emitGameUpdate(gameId, receiverId)` after a decline that deletes the invite row) and
  `utils/gameInviteCleanup.ts:83`.
- **Introduced by:** this fix cycle. Before it, `getGameById` used a top-level `include`, so every
  `game-updated` payload carried `paymentHint` and the unconditional write at
  `EditGameInfoModal.tsx:839` was harmless. Neither the new unit test
  (`availableGamesCard.projection.test.ts`) nor the new integration test
  (`gameCostSettle.integration.test.ts`) exercises the socket projection or the edit round-trip,
  which is why it is green.
- **Shape of the fix (two independent belts, take both):** (1) in
  `EditGameInfoModal.tsx:839`, only send `paymentHint` when the field is actually dirty
  (`price.paymentHint.trim() !== initialPrice.paymentHint.trim()`) — the dirty expression already
  exists at `:616`; (2) in `participantMessageHelper.ts:107-119`, project the broadcast payload
  for the **game**, not the actor — the room is roster-scoped, so resolve entitlement from the
  organizer/roster rather than from `senderId`, or read the hint unconditionally for a payload
  that only ever goes to `game-${id}`.

### [MINOR] `game-updated` hands `paymentHint` to league-season players who are not on the fixture roster

- **Where:** `Backend/src/services/socket.service.ts:251` gates room entry on
  `MessageService.validateGameAccess`, whose `isParticipant` is
  `isDirectParticipant || hasParentGamePermissionWithUserCheck(...)`
  (`Backend/src/services/chat/message.service.ts:181-187`). The entitlement the projection uses
  is direct roster membership only (`gameDetail.projection.ts:551-559`). The broadcast at
  `socket.service.ts:1236-1238` goes to every socket in the room.
- **Defect:** the transport is broader than the entitlement the fix defined, so the row-level
  gate is not the effective gate for the socket copy of the same payload.
- **Failure scenario:** A league season has 40 players. A fixture between four of them has a
  `paymentHint`. Any of the other 36 opens that fixture's chat (allowed — they hold a season
  roster row), joins `game-${fixtureId}`, and receives the organizer's payment handle on the next
  `game-updated`. They cannot get it from `GET /games/:id`.
- **Introduced by:** this fix cycle (it is the first cycle in which `paymentHint` had an
  entitlement at all). Closing the BLOCKER by projecting the socket payload for the game rather
  than the actor closes this too, if the projection is given the room's audience.

### [MINOR] `GET /api/results/game/:gameId/outcome/:userId/explanation` has no read gate

- **Where:** `Backend/src/routes/results.routes.ts:34` (`optionalAuth`) →
  `Backend/src/controllers/results.controller.ts:384-387`. Contrast `:50`, where `getGameResults`
  calls `assertCanReadGameResults`. The same omission applies to the two sibling routes at
  `results.routes.ts:35-42` (`rating-explanation-llm`, `…/translation`).
- **Defect:** the programme hardened `GET /results/game/:gameId` and its round/match variants and
  wrote the rule into `docs/product/constraints.md` ("a private game answers 404"), but the
  outcome-explanation siblings on the same router were not brought along.
- **Failure scenario:** `curl 'https://<host>/api/results/game/<privateGameId>/outcome/<userId>/explanation'`
  with no `Authorization` header returns that player's `levelBefore` / `levelAfter` /
  `levelChange` / `reliability*` and the match breakdown with co-player names
  (`outcomeExplanation.service.ts:700-760`), for a game whose scoreboard now correctly 404s.
  Needs both ids, so it is a targeted read, not a scrape.
- **Introduced by:** pre-existing. Not a regression from this programme and not on the critical
  path for the release; listed because the programme's own new invariant now claims this class is
  closed and it is not.

**Nothing else reached MINOR.** Specifically, I looked hard at and found clean: the Admin panel's
two new pages (every `onclick` target is defined and exported to `window`; all 20 DOM ids
referenced by `goods.js` exist exactly once in `index.html`; both files are in the loader list at
`Admin/index.html:2134-2150`; every path matches `goods.routes.ts` / `referral.routes.ts`, all
behind `requireAdmin`); the `/play` and `/live` Telegram commands (`/live` reads through
`LIVE_RAIL_WHERE` so a group only ever sees public rail-visible games, and the `spectatorToken`
query param the Watch button mints is correctly translated to `st` by
`Frontend/src/api/results.ts:208` and redeemed with a full token + `assertSpectatorGameStillWatchable`
check at `results.controller.ts`); router mount order in `routes/index.ts:112-119` (no early PRD
router declares a path the later domain router also declares, and only `gameSeries.routes.ts` has
a top-level `router.use`, which exits with `next('router')` so it cannot swallow `/api/games/*`);
and feature-flag-off behaviour for all three flags (routes `Navigate to="/"` at `App.tsx:820/834`,
every query hook carries `enabled: … && isXEnabled()`, `equippedGoodsStore.request` returns early
at `equippedGoodsStore.ts:42`, and the backend answers 404 via `requireShopEnabled` /
`requireSeriesEnabled` / the `costSplitEnabled` controller guards).

---

## Regression check on the widened `getGameById` / `getGames` projections

What I checked, mechanically:

- **Scalars.** Parsed `model Game` out of `prisma/schema.prisma` and set-differenced it against
  `GAME_DETAIL_GAME_SCALAR_SELECT`. Missing: `paymentHint` only. Extra: none. Same exercise for
  `Club` (missing `integrationConfig`, re-added for signed-in viewers at
  `gameDetail.projection.ts:278`; missing `ptMeta`, which has **zero** consumers in
  `Frontend/src`, `Backend/src` and `Admin`), `Court` (complete, all 14) and `LeagueSeason`
  (complete, all 7).
- **Relations.** Walked `gameWithRoundsAndOutcomes` (`gamePrismaIncludes.ts:204-234`) key by key
  against `detailRelationSelect` (`gameDetail.projection.ts:327-490`). All 18 relations present
  with the same nesting, the same `orderBy` clauses and the same user selects for signed-in
  viewers. `club.city` and `court.club.city` are now *wider* than before (`{name, timezone}` vs
  `{name}` / absent). `participants` deliberately stayed an `include`, so every roster scalar —
  `activeMatchId`, `inviteUserTeamId`, the PRD 346 attendance quartet — still ships.
- **List.** Diffed `getGameListSelect` against the three deleted local includes in
  `git diff Backend/src/services/game/read.service.ts`. Strict superset minus `paymentHint` /
  `ptMeta`. No caller loses anything.
- **Consumers walked.** Game details (`GameDetailsShell`), chat header
  (`chat.controller.ts:906`, authenticated projection), create/edit prefill
  (`EditGameInfoModal` — **this is the one that broke**, see the BLOCKER), deep links
  (`?join=1` → `handleJoin` → `gamesApi.getById`), socket `game-updated` (**broke**),
  metatags (`metatags.controller.ts:150`, guest, reads name/description/avatar only), Telegram
  `/mygames` (guest list projection, reads nothing dropped), `projectGamePhotoPayload` /
  `canViewGamePhotos` / `getOwnerIsPremiumFromGame` / `withLegacyGoldenPointField` /
  `attachLocalizedTextToGame` / `computeJoinQueuesFromParticipants` (every input present),
  `projectUserForSportContext` (reads only `sportProfiles` + the confirmation fields, both kept in
  the guest select).
- **Lock ordering.** Enumerated all 27 `FOR UPDATE` statements under `Backend/src`. Every
  `Game`-row locker takes exactly one row and takes it first; nothing locks a `GameParticipant`
  or a `GameCostShare` before a `Game`, so `lockGameRowForSeating` cannot participate in a cycle.
- **`optionalAuth` paths returning less to a signed-in user.** Only one real case, and it is not
  the HTTP route: the socket payload projected for a de-rostered actor (the BLOCKER and the first
  MINOR). `GET /api/games/:id` itself returns strictly the same fields to a signed-in viewer as
  before, plus `paymentHint` when entitled.

**Verdict on the projections themselves: field-complete.** The damage is entirely in who the
socket payload is projected *for*, and in a client that writes the missing field back.

---

## Accepted gaps

- All of `critic-final.md`'s accepted-gaps list stands unchanged and is not re-litigated: native
  push-shade actions, the onboarding analytics no-op seam, the three unreachable API surfaces,
  the non-interactive `↻ Weekly` pill, the absent Profile → "Your regular games" section, the
  lost `inviteUserTeamId` on self-promotion, the missing `game-seat-filled` on self-join, and the
  thirteen unowned security MINORs.
- **The two unwired frontend test files** (`PlayIntentDeepLink.test.tsx`, `TeamPlayerSelector.test.tsx`)
  remain outside every npm script. `fix-final-gate.md:269-274` gives the exact one-line edits.
- **A COINS share stranded with `transactionId: null`** by a process kill mid-transfer can no
  longer be un-ticked by the organizer; recovery is DB work. Declared in `fix-final-gate.md:284-288`
  and a strictly better trade than the double-transfer it replaces.
- **`getGameById` now issues one extra primary-key `findUnique`** per entitled detail read. A
  deliberate cost so the value never enters the process for an unentitled caller.
- **Scope note, not a defect:** the working tree also carries ~2,200 lines of Watch/iOS
  **auth-rotation** work (`WatchConnectivityEvent.authRotated`,
  `WatchAuthRotatedPayload`, `WatchSessionManager.adoptRotatedCredentials`, plus the Watch scoring
  and widget files) that belongs to the refresh-session contract, not to PRDs 345–357. It reads
  carefully written — the phone refuses a late rotation when it has no stored refresh token
  (`Frontend/ios/App/App/WatchSessionManager.swift`, `adoptRotatedCredentials`) and stale queued
  transfers are cancelled — but it ships with this branch and no test lane covers it. Worth a
  conscious decision rather than an accident.

## Not verified

- **Nothing was executed.** No `tsc`, build, lint, vitest, Playwright, Prisma, HTTP request or
  device run. Every verdict is from reading the working tree, per the brief.
- **The BLOCKER chain is read-verified end to end but not reproduced.** Four links (roster row
  deleted → payload projected for the deleted actor → wholesale client replacement → unconditional
  write) are each proven by code; I did not run a browser against a live server to watch the IBAN
  disappear. One manual pass — set a payment hint, have a second account leave, edit the
  description, save, reload — settles it in under a minute and is worth doing before the fix.
- **The join race was not run.** The lock's correctness rests on Prisma interactive transactions
  using the Postgres default isolation (READ COMMITTED) so the post-lock re-read sees the winner's
  commit. `joinFromQueue.integration.test.ts` §7 asserts exactly this; the orchestrator reports it
  passing, and I did not re-run it.
- **Connection-pool interaction with the new lock.** `validatePlayerCanJoinGame` issues queries on
  the **global** `prisma` client from inside the interactive transaction
  (`participantValidation.ts:174`, `:190`), so a transaction holding the game row needs a second
  pool connection to finish. With enough simultaneous joiners to exhaust the pool this could stall
  until timeout. The pattern is pre-existing (`validateAndGetGameInTransaction` did the same), the
  lock only lengthens the hold, and I could not size it without running load — so it is listed
  here rather than as a finding.
- **The Admin panel was not opened in a browser.** Verified by reading: script registration, id
  existence, handler export, route/method match. Not verified: rendering, the `?kind=` filter
  round-trip, the preview upload.
- **The Telegram bot was not round-tripped.** `setMyCommands`, the `pi:` wizard and the `/live`
  Watch buttons are read-verified only.
- **No locale was fluency-reviewed.** I checked key presence for the nine `series.*` keys the new
  UI renders across all eleven locales and nothing more.
- **Anything needing a device or a live integration:** push-shade rendering, RTL layout, themes,
  reduced motion, 44 px targets, the Capacitor keyboard contract, Watch decoding against a live
  payload, and the new Watch credential-rotation handshake.
