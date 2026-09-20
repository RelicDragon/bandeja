# Fix — the `paymentHint` data-loss regression (closing BLOCKER)

Closes the BLOCKER and both MINORs in `critic-closing.md`. Nothing was executed:
no `tsc`, build, lint, test runner, Prisma or HTTP call. The orchestrator owns
the lanes.

---

## 1. The exact sequence that deleted an organizer's IBAN

1. Organizer sets "How to pay you" on a paid game → `Game.paymentHint` =
   `IBAN RS35 …`.
2. She stays on Game Details. A player taps **Leave**.
   `ParticipantService.leaveGame` deletes his `GameParticipant` row
   (`participant.service.ts:286`) and then emits
   `ParticipantMessageHelper.emitGameUpdate(gameId, userId)` (`:294`) — with
   `userId` being the player who just left.
3. `emitGameUpdate` projects the payload for that actor:
   `GameService.getGameById(gameId, senderId)`. `isEntitledToGamePaymentHint`
   answers **false** (his roster row is gone), so `read.service.ts:398-409`
   never merges the key. Correct per-viewer, wrong per-broadcast.
4. `SocketService.emitGameUpdate` broadcast that one payload to the whole
   `game-${id}` room (`socket.service.ts:1232`, `:1246`).
5. `GameDetailsShell.tsx:463` replaced its `game` object wholesale
   (`let merged: Game = updatedGame`) — including on the organizer's screen.
6. The organizer opens **Edit game info**, changes the description, taps Save.
   `EditGameInfoModal` seeds `paymentHint: game.paymentHint ?? ''` → `''`
   (the key is absent), and wrote
   `updateData.paymentHint = price.paymentHint.trim() || null` on *every* save
   of a paid game.
7. `update.service.ts:127`/`:161` accepts the `null`. The IBAN is gone from the
   database, from her edit screen and from every player's `CostSettleSheet`.
   No error, no confirmation, no undo, nothing restored by a reload.

Same end state from an invite decline (`invite.service.ts:461`, `:519`) and
invite cleanup (`utils/gameInviteCleanup.ts:83`) — all three emit for an actor
whose row was just removed.

The mirror-image leak was live on the same line: `update.service.ts:1023` emits
a game loaded **for the organizer**, so on every organizer save the room —
including a league-season player who is not on the fixture roster — received the
payment handle over the socket that `GET /api/games/:id` correctly refuses them
(MINOR 1).

---

## 2. Belt one — fix the projection (backend)

### The rule chosen

> **A `game-updated` broadcast is projected for the least-entitled member of the
> room, and an absent key means "not transmitted", never "cleared".**

Implemented as `projectGameForBroadcast()` in
`Backend/src/services/game/gameDetail.projection.ts`, applied once in
`SocketService.emitGameUpdate` — the single chokepoint every one of the ~30
emit call sites passes through (`grep "'game-updated'"` returns exactly the two
emits in `socket.service.ts`, both now sending `game: broadcastGame`).

It strips `GAME_BROADCAST_STRIPPED_KEYS`:

| key | why |
|---|---|
| `paymentHint` | entitlement-gated (roster / organizer / platform staff) |
| `userNote` | viewer-scoped — the *asking* user's private note on the game |
| `isClubFavorite` | viewer-scoped — the asking user's own favourite flag |

### Why this rule and not the alternatives

- **Not "project for the organizer / the game".** The value would then be on the
  wire for every socket in the room. The room is deliberately *wider* than the
  entitlement: `socket.service.ts:251` admits anyone `validateGameAccess`
  accepts, and that includes parent-game (league season) participants
  (`chat/message.service.ts:181-187`). Sending the hint to the game's "own"
  audience is exactly MINOR 1.
- **Not per-recipient projection.** Socket.IO broadcasts one serialized body per
  room; per-recipient would mean one `getGameById` + one emit per socket, i.e.
  N extra queries per roster change on the hottest event in the app, and a new
  entitlement evaluation in the transport layer that can drift from the HTTP
  one. Rejected on cost and on having two places that decide the same thing.
- **The safe-for-everyone payload plus a client that keeps what it holds.** The
  sensitive field has exactly one consumer — the organizer's edit form — and
  exactly one authoritative source, `GET /api/games/:id`, where entitlement is
  evaluated *per caller*. Nothing needs it to travel live. `CostSettleSheet`
  already reads the hint from `GET /games/:id/cost-shares`, not from the game
  object, so no player-facing surface loses freshness.

Staleness accepted: if the organizer clears the hint on device A, device B's
already-open Game Details keeps the old value in memory until its next HTTP
read. A stale-but-present value is strictly better than the silent deletion it
replaces, and the edit form no longer writes an unchanged field back.

`ParticipantMessageHelper.emitGameUpdate` keeps projecting for the actor —
that is now documented as deliberate, with a note that "fixing" the missing
field by projecting for a more-entitled viewer is the thing that must never come
back.

**MINOR 1 is closed by this**: no socket recipient, season player or otherwise,
receives `paymentHint` at all. The other game-bearing socket events were checked
— `game-cost-updated` carries only `{ gameId }` and the client refetches over
HTTP; no other event ships a game object.

---

## 3. Belt two — gate the write (frontend)

`Frontend/src/features/cost/gameEditPricePayload.ts` (new) owns the price half
of the edit payload. `paymentHint` is sent **only when
`current.trim() !== initial.trim()`**. `EditGameInfoModal.executeSave` spreads
that payload instead of building it inline, and the modal's existing dirty check
now reuses the same `isPaidPriceType` predicate.

Consequences worth naming:
- an unrelated save sends no `paymentHint` key → `pickUncheckedGameScalars`
  (`update.service.ts:138`) never names the column → the stored value is
  untouched;
- a deliberate clear still works (blank vs a non-blank seed *is* a change, and
  sends `null`);
- the PRD 345 "apply to future occurrences" sheet inherits the same payload, so
  an unchanged hint is no longer pushed onto the series template either.

### Client-side: an absent key is "not transmitted"

`Frontend/src/queries/games/preserveUntransmittedGameFields.ts` (new) carries
`paymentHint` / `userNote` / `isClubFavorite` from the game the screen fetched
over HTTP onto a game that arrived over the socket. A key the payload *does*
carry always wins (including an explicit `null`). Applied at both wholesale
replacements: `GameDetailsShell` (the socket effect, before every downstream
merge, so the self branch is covered too) and `EventDetailsContent`.

Without it the write gate alone would still leave the organizer staring at an
empty "How to pay you" field — and invite her to retype an IBAN she already has.
It also fixes a pre-existing display bug: the room used to receive the *actor's*
`isClubFavorite`, so a leave could flip the organizer's favourite star.

The react-query caches were audited and already behave correctly:
`patchGameInGamesCaches`'s `mergeMyOrPast` is `{...existing, ...incoming}` (an
absent key keeps the cached value) and `mergeFindCardGame` names fields
individually.

---

## 4. Every other unconditionally-written field audited

`EditGameInfoModal` is the only surface that writes a game patch built from a
possibly-partial game object. Its full write set:

| field | written | can the viewer be missing it? | verdict |
|---|---|---|---|
| `paymentHint` | was unconditional | **yes** — stripped from every broadcast | **fixed** (dirty-gated) |
| `name` | unconditional | no — in `GAME_DETAIL_GAME_SCALAR_SELECT`, guest + signed-in + broadcast | safe |
| `description` | unconditional | no — same; and the seed uses `authoredGameTextForEdit`, which deliberately ignores `localizedText` (which the socket payload does **not** carry, since it is attached in `game.controller.ts:60`, not in `getGameById`) | safe |
| `priceType` | unconditional | no — whitelisted scalar | safe |
| `priceTotal` / `priceCurrency` | conditional (`!= null`), or an explicit `null` pair when the organizer picks FREE / NOT_KNOWN | no — whitelisted scalars | safe, unchanged |
| `avatar` / `originalAvatar` | only under `general.removeAvatar` | n/a — explicit action | safe |
| `timeIsSet: false` (`:653`) | explicit "remove time" action | n/a | safe |

Other writers of the same column:
- `PUT /games/:id/cost-shares` already gates on `'paymentHint' in raw`
  (`gameCost.controller.ts:66`) and has **no** frontend caller
  (`useUpdateCostShares` is unwired) — no unconditional write there;
- `CreateGame.tsx:1499` sends the hint only when non-empty, on create.

Nothing else in `Frontend/src` reads `game.paymentHint`.

---

## 5. MINOR 2 — the rating-explanation endpoints

`assertCanReadGameResults(gameId, req.userId ?? null)` now runs first in all
three handlers in `results.controller.ts`:
`getOutcomeExplanation`, `getOutcomeRatingExplanationLlm`,
`getOutcomeRatingExplanationTranslation`. Same gate as `getGameResults`, same
**404-not-403** behaviour, so the routes stay non-oracles. The routes keep
`optionalAuth` — a guest reading a *public* game's explanation is intended and
still works.

Legitimate consumers verified:
- the only caller is `OutcomesDisplay.tsx:36`, rendered inside
  `GameResultsEntryEmbedded` — i.e. on a screen that only exists once
  `GET /results/game/:gameId` has already passed **the same gate**. No new 404
  for any user who can see the scoreboard.
- league fixtures: the gate accepts a roster row on the game **or its parent**,
  matching what `MessageService` already allows.
- the spectator/share path uses `GET /results/game/:gameId/spectator` with a
  signed token and does not touch these routes; the LLM services are called by
  the controller only, so background/generation paths are unaffected.
- `Admin/` does not call these endpoints.

---

## 6. Files touched

Backend
- `src/services/game/gameDetail.projection.ts` — `GAME_DETAIL_VIEWER_SCOPED_KEYS`,
  `GAME_BROADCAST_STRIPPED_KEYS`, `projectGameForBroadcast()`
- `src/services/socket.service.ts` — project once, emit the projection twice
- `src/services/game/participantMessageHelper.ts` — documents why the actor
  projection is fine and what must not be "fixed"
- `src/controllers/results.controller.ts` — the three explanation gates

Frontend
- `src/features/cost/gameEditPricePayload.ts` *(new)*
- `src/queries/games/preserveUntransmittedGameFields.ts` *(new)*
- `src/components/GameDetails/EditGameInfoModal.tsx`
- `src/pages/GameDetailsShell.tsx`
- `src/components/eventDetails/EventDetailsContent.tsx`

Docs
- `docs/product/constraints.md` — new invariant "A broadcast is projected for the
  least-entitled recipient…", plus the explanation siblings added to the
  guest-readable-endpoints rule

No `package.json`, no schema, no migration, no CI workflow. No `any`, no
`eslint-disable`, no `console.log`, no TODO added.

## 7. Tests added (all in files an existing npm script already names)

| lane | file | what fails on the pre-fix code |
|---|---|---|
| BE `test:available-games` | `src/services/game/availableGamesCard.projection.test.ts` (`runBroadcastProjection`) | asserts the stripped-key list, that an entitled payload loses `paymentHint`/`userNote`/`isClubFavorite` while everything else survives, that the caller's object is not mutated, that an explicit `paymentHint: null` is stripped too — plus a source scan of `socket.service.ts`: exactly two `game-updated` emits, both sending `game: broadcastGame`, and `game: gameToEmit` appearing nowhere |
| BE `test:live-rail` | `src/services/results/gameResults.projection.test.ts` | each of the three explanation handler bodies must contain `await assertCanReadGameResults(gameId, req.userId ?? null)` |
| BE `test:prd-integration` | `src/services/gameCost/gameCostSettle.integration.test.ts` | real DB: delete the player's roster row (the `leaveGame` state) → his `getGameById` has no hint; the organizer's entitled view projected for broadcast has no hint; `GameUpdateService.updateGame` with a price-only body **preserves** the stored IBAN; and an explicit blank still clears it (so the preservation assertion is not vacuous) |
| FE `test:queries` (`src/queries/games/*.test.ts`) | `src/queries/games/preserveUntransmittedGameFields.test.ts` *(new)* | a payload without `paymentHint` no longer erases the held value; every key in the list is carried; a transmitted value (incl. `null`) wins; no mutation; identity returned when there is nothing to carry |
| FE `test:cost-split` | `src/features/cost/costViewModel.test.ts` (appended `buildGameEditPricePayload` block) | an untouched hint is **absent** from the payload — including when the seed is blank because the broadcast never carried it; a real edit sends the trimmed value; a deliberate clear sends `null`; whitespace-only edits are not changes; FREE/NOT_KNOWN drops amount and hint |

The two regression tests the brief asked for are the BE integration case (socket
payload never carries the hint to an unentitled recipient, both halves) and the
FE `costViewModel` case (an edit that does not touch `paymentHint` preserves it).

## 8. Left open

- **Not executed.** Everything above is read-verified. The BLOCKER's live repro
  (set a hint → second account leaves → edit description → save → reload) is
  still worth one manual pass.
- **The two unwired frontend test files** (`PlayIntentDeepLink.test.tsx`,
  `TeamPlayerSelector.test.tsx`) remain outside every npm script;
  `Frontend/package.json` is off limits to this agent. Unchanged from
  `fix-final-gate.md:269-274`.
- **Cross-device staleness of `paymentHint`** on an already-open Game Details
  screen, as described in §2. Deliberate.
- **Accepted gaps from `critic-final.md` / `critic-closing.md`** are untouched
  and not re-litigated, including the ~2,200 lines of Watch/iOS auth-rotation
  work that ships with this branch and that no lane covers.
