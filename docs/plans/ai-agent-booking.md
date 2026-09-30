# AI agent: Phase 7, Booking (design, 2026-09-30)

Parent plan: [ai-agent.md](./ai-agent.md) §14. Domain: [booking.md](../domains/booking.md). The design comes from a read-only spike; file:line references are as of 2026-09-30.

**Key constraint:** today the backend can book only NSPADELSUPABASE and WELTNER. BOOKTIME and PADELOO outbound calls from the backend are forbidden on purpose: `booktimeNoOutboundHttp.test.ts` and `padelooNoOutboundHttp.test.ts` fail the build if they happen.

## 14.1 Provider capability matrix

| | (a) list user's bookings | (b) availability | (c) book | (d) cancel | (e) creds | (f) BE w/o user |
|---|---|---|---|---|---|---|
| BOOKTIME | FE only `/booking/get-upcoming` (`Frontend/src/integrations/booktime/client.ts:473`) | public, no token (`client.ts:398`), FE only; BE has only FE-written snapshots | FE `confirmBooktimeBooking`: live re-check, price quote, then book (`booktime/bookFlow.ts:118-180`) | FE (`bookFlow.ts:194-213`), then unlink from games | `UserClubBooktimeAuth` (`schema.prisma:456`) encrypted access+refresh; FE keeps a copy and syncs refreshes back; the refresh token rotates (`client.ts:225`) | **Blocked by design.** Needs new code, dropping the guard, and shared rotation |
| PADELOO | FE `/Reservation/my` (`padeloo/client.ts:192`) | FE only; BE snapshot | FE (`client.ts:184`) | FE (`client.ts:196`) | `UserClubPadelooAuth` (`:494`) access token only, no refresh; expiry means redoing the email OTP | **Blocked.** The token dies and the BE can't renew it |
| KLIKTEREN | via BE proxy (`klikteren/client.ts:399`) | via proxy, public (`client.ts:350`) | via proxy (`:417`) | via proxy (`:446`) | `UserClubKlikterenAuth` (`:532`) encrypted, plus an upstream cookie in FE memory only (`client.ts:310-318`) | **Possible with new code.** `forwardKlikterenUpstream` already allows bookings/create and bookings/cancel (`klikterenUpstream.service.ts:3`); cookie dependency unverified; no refresh |
| NSPADELSUPABASE | **none**: no per-user upstream list, no local receipts, only `nspadel:` ids in `GameExternalBooking` | BE live (`nspadelBookings.service.ts:212`) | BE (`:299`), using the user's profile name and phone; synthetic id (`:295`) | **impossible** (`nspadel/client.ts:236`; via the club) | `UserClubNspadelAuth` exists but no code path uses it | **Book and availability work today** |
| WELTNER | BE local receipts (`weltner.service.ts:132`) | BE live, exact `{start,duration}` tuples (`:103`) | BE, once, idempotent receipt (`:146`) | **impossible** (booking.md) | `UserClubWeltnerAuth` = phone only | **Book, list and availability work today** |

**Durations.**
- Booktime: the company's `bookingDurations`, falling back to 60/120 (`booktime/durations.ts:16`).
- Padeloo, Klikteren and Nspadel: 60/90/120. Klikteren needs two or more 30-minute steps.
- Weltner: 60/90/120/180.

**Multi-court.**
- Each court is booked separately, in sequence (`BooktimeCreateGameConfirmModal.tsx:268-330`).
- If one fails, the courts already booked are cancelled in turn (`@shared/gameBooking/rollbackBooktimeBookings.ts`; modal `:239-257`, `:360-364`).
- Nspadel and Weltner can't roll back, so a partial booking stays booked.

## 14.2 Game ↔ booking today

- **Routes.** `PATCH /games/:id/bookings`, `POST /games/:id/link-booking` and `PUT /games/:id/booking-snapshots` sit behind `canEditGame` (OWNER/ADMIN; `game.routes.ts:167-171`). The service checks again with `canMutateGameBookings`, which also accepts the parent game's owner/admin (`gameExternalBooking.service.ts:405,475,562`).
- **Game sync.** Every mutation calls `syncGameBookingState` (`:288`). It recomputes `bookingStatus` (`NONE|MANUAL|EXTERNAL_PARTIAL|EXTERNAL_FULL`) and takes the game's times from the bookings unless `timeOverride` is set.
- **Trust.** Except for `weltner:` ids (`weltnerBookingLinks.ts:5`), the BE stores whatever booking id and times the client sends (`:196-210`, `:598-606`). **The agent must never pass ids or times written by the model.**
- **"Cancel game" is a delete.** `DELETE /games/:id` is OWNER-only (`game.routes.ts:175`) and handled by `GameDeleteService` (`delete.service.ts:19-183`). It:
  - refuses games that have results or child games;
  - writes a `CancelledGame` row, archives the chat, closes invites and notifies players;
  - hard-deletes the game. That cascades to `GameExternalBooking`, `GameCostShare` (`schema:4265`) and `Bet`, with **no refund**. Coin bets are charged at creation and simply disappear; this is a separate task.
- **No cancelled state.** There is no `CANCELLED` status; `Game.status` follows the clock.
- **No combined "cancel game + bookings" flow exists.**
  - The UI only warns that reservations stay (`DeleteGameBookingsWarningModal.tsx`, `GameDetailsShell.tsx:2289`).
  - Booking-only cancel lives in `BooktimeBookingRow.tsx:160-180` (hidden for Weltner, `:190`) and unlinks best-effort (`unlinkBookingFromLinkedGames.ts`).
  - The club-admin "cancel game" is only a delete (`clubAdminGame.service.ts:52-113`).

## 14.3 Availability the BE can compute without a user token

`CourtOccupancyService.getOccupancy` (`courtOccupancy.service.ts:279`) merges:
- app games in ANNOUNCED or STARTED;
- club-admin holds;
- external snapshots, for BOOKTIME, PADELOO and KLIKTEREN only (`:183-229`).

Snapshots are weak evidence:
- They are written by the FE, with its own `fetchedAt` (`snapshotStorage.ts:25`).
- They only exist for dates somebody viewed.
- They are fresh for just 60s (`BOOKTIME_SNAPSHOT_FRESH_MS`).
- A missing busy entry does not mean the slot is free.

What the agent may say, by source:

| Provider | Confidence | Agent may say |
|---|---|---|
| Nspadel, Weltner | `live` | exact free slots |
| Klikteren | `live` once 7b ports the slot parser, otherwise `snapshot` | same, per confidence |
| Booktime, Padeloo | `snapshot` | "no known conflicts as of HH:MM", never "free". The app card re-checks live; Telegram says "open the club page to check live". |
| No integration | `app_only` | only conflicts with app games and holds |

## 14.4 Ownership and security

- **Only the booker can cancel.** Provider bookings belong to whoever made them, and only that session can cancel.
- **Game OWNER/ADMIN** may link and unlink bookings, but can't cancel someone else's provider booking.
- **Club admin** has no provider powers.
- **Shared reservations.** A booking linked to more than one game is skipped by `cancel_game`, and the agent says so.
- **Schema gap.** `GameExternalBooking` has no booker. Add a nullable `bookedByUserId`, set on create and link.
- **Existing leak:** `GET /booktime/linked-games/:id` returns linked games to any authenticated user without scoping (`booktimeGameLink.service.ts:37-57`). The agent must use its own scoped lookup. A separate fix task exists.

## 14.5 Executing provider writes

- **(iii) Hand-off deep links, the universal fallback.** Used for Telegram, old app builds, and users who aren't connected:
  - `/create-game?clubId=&courtId=&date=|startTime=&endTime=` (plus `&bookingIds=`)
  - `/profile/connected-clubs`
  - `/clubs/:id`
- **(ii) Client-executed actions**, for Booktime, Padeloo and Klikteren until (i) is proven:
  1. At propose time the server stores `plan.executor='client'` and a `clientPlan` (provider, clubId, courts, date, start, duration, post-step).
  2. `POST /agent/actions/:id/claim` re-authorizes with a fresh principal, then moves PENDING→CONFIRMED with a lease (`attemptId`, 3 min) and returns the `clientPlan`.
  3. The app runs `createHydratedClubBookingProvider(...).bookSlot/cancelBooking`, which includes the live re-check and the price quote.
  4. The app calls `POST /agent/actions/:id/report {attemptId, results[]}`. The server validates the results against the plan: same provider, court and time, and no more bookings than planned.
  5. The server then does the game side itself: create, link, unlink or delete. The report is trusted exactly as much as today's FE.
  6. The app persists the attempt in localStorage and re-reports on resume.
  7. The sweep marks expired leases UNKNOWN ("check Connected clubs"). A late report with the same `attemptId` upgrades it to EXECUTED.
  8. Capability: the app sends `X-Agent-Client-Caps: booking-v1`, stored on the run. Old builds and Telegram get 409 `CLIENT_EXECUTION_REQUIRED` on `/confirm`, and Telegram shows "Open in app" instead of ✅.
- **(i) Server-side:**
  - Nspadel and Weltner now, with the existing services.
  - Klikteren later, behind a flag, once we confirm it works without the cookie.
  - Booktime and Padeloo not without an owner decision.

## 14.6 Tool catalogue

The model never sees raw provider ids.
- `bookingRef` is server-minted and resolved per user: `geb:<GameExternalBooking.id>`, `weltner:<id>` or `mirror:<id>`.
- `slotRef` is signed with a 15 min TTL and carries club, courts, start, duration and provider.

| Tool | Input (strict) | Kind / guard | Service | Providers |
|---|---|---|---|---|
| `list_my_bookings` | `{range: upcoming\|past, clubId?, limit≤30}` | read. Bookings on games where the user is OWNER/ADMIN/PLAYING, plus the user's own Weltner receipts and mirror rows | `agentBookingSources.ts` (new) | all. For Booktime/Padeloo/Klikteren without a mirror: linked bookings only, plus "full list in app" |
| `find_available_slots` | `{clubId? \| cityId?, date, timeFrom?, timeTo?, durationMinutes, courts 1–4, sport?}` | read. Active `isForPlaying` clubs; at most 8 clubs per city query | 7b slot engine | confidence as in §14.3 |
| `book_court` | `{slotRef, gameId?}` | write, critical. With `gameId`: `canMutateGameBookings`. Connected check: an auth row exists (Weltner: phone saved; Nspadel: profile name and phone) | Nspadel/Weltner services, or client execution, then `linkBookingToGame` | all. Preview: court(s), local time and club tz, duration, price (app card), cancel deadline |
| `create_game_with_booking` | `create_game` fields, with `slotRef` replacing club/court/time | write, critical. `create_game` guards | book, then `GameCreateService.createGame({externalBookingIds, bookingSnapshots})` | all |
| `cancel_booking` | `{bookingRef}` | write, critical. `bookedByUserId == principal` (or null and the user has an auth row); inside the cancel window | client execution, then `patchGameBookings remove` on linked games the user may edit | Booktime/Padeloo/Klikteren. Weltner/Nspadel are refused, with the club's phone |
| `cancel_game` | `{gameId, cancelBookings: boolean}` | write, critical. `assertAgentGamePermission([OWNER])`; no results or child games; same rules as `DELETE /games/:id` (`GameDeleteService.assertDeletable`). Open coin bets and coin-settled shares are not refused; the preview says they will be refunded (owner decision #4) | bookings (client), then `GameDeleteService.deleteGame` | the game-only path works everywhere |
| `link_booking_to_game` / `unlink_booking` | `{bookingRef, gameId}` | write. `canMutateGameBookings`; the booking must belong to the user and to the game's club | `linkBookingToGame` with times from the server row / `patchGameBookings` | server-side, all |

**Partial-failure semantics:**
- **Multi-court booking.**
  - Where the provider can cancel: roll back. FAILED = "nothing booked"; UNKNOWN if the rollback itself failed, listing the ids still booked.
  - Nspadel and Weltner: EXECUTED with `partial` ("2 of 3 courts booked"), plus a `/create-game?bookingIds=` handoff.
- **Booked, but game creation failed:** roll back where possible. Otherwise EXECUTED `partial` "Booked; game not created", plus a create handoff.
- **`cancel_game` + bookings:**
  - Cancel the bookings first.
  - Delete the game only if every non-shared booking was cancelled. Otherwise unlink the cancelled ones, keep the game, and return `partial` naming the booking that is still active.
  - If the bookings were cancelled but the delete failed: EXECUTED `partial` "Bookings cancelled, game still exists".
- **Needed change:** an `AgentWriteOutcome.partial` field. The FAILED note in `agentActions.service.ts` ("Nothing was changed") must become outcome-driven text.

## 14.7 Contract and UI

- **Contract.**
  - `AgentEntityRef` gets two new types:
    - `{type:'booking', ref, clubId, clubName, courtNames[], start, end, timeZone, provider, state, linkedGameIds[], canCancel}`
    - `{type:'slot', slotRef, clubId, clubName, courtNames[], start, end, timeZone, confidence, asOf}`
  - A new `{type:'handoff', url, label}`.
  - `AgentPendingActionDto.execution: 'server'|'client'`.
  - `AgentActionResult.partial?`.
- **App.**
  - Slot-picker card: tapping a slot sends a user message carrying the `slotRef`, and the model proposes `book_court`. The card fetches the live snapshot and price itself.
  - Booking cards with a Cancel button, which proposes `cancel_booking`.
  - A client-execution action card: claim → adapter → report.
- **Telegram** (`agentBotView.ts`): slots and bookings as escaped text lists, URL buttons for handoff and club entities, and "Open in app" instead of ✅ for client-executed cards.

## 14.8 Slices

| Slice | Lane | Scope | Deps |
|---|---|---|---|
| 7.0 | shared | contract types, `partial` outcome, FAILED-note fix | none |
| 7a | BE | `agentBookingSources` + `bookingRef` + `list_my_bookings` + matrix. **Built (2026-09-30)**: `services/agent/booking/agentBookingSources.ts`, `tools/bookings.tools.ts`, `npm run test:agent-bookings`. `canCancel` uses game OWNER/ADMIN + provider connection until 7c adds `bookedByUserId` | 7.0 |
| 7b | BE | slot engine (per-provider availability, occupancy hard blocks, multi-court intersection, club-tz/DST helpers, `slotRef` signing) + `find_available_slots`. **Built (2026-09-30)**: `services/agent/booking/slotEngine/` (`slotEngine.ts`, `slotRef.ts` with `verifySlotRef`, `liveProviderCache.ts`), `tools/slots.tools.ts`, `npm run test:agent-slots`. Klikteren stays `snapshot` (parser not ported); Booktime uses the 60/120 fallback durations; Weltner after-midnight tuples of the next date are not merged into the previous business day | 7.0 |
| 7c | BE | `bookedByUserId` migration; `link_booking_to_game` / `unlink_booking`. **Built (2026-09-30)**: migration `20260930200000_game_external_booking_booked_by`, `tools/bookingLinks.tools.ts` (both standard), `canCancel` by booker (legacy null → owner/admin + connection), tests in `npm run test:agent-bookings` | 7a |
| 7d | BE | `book_court`, server-side (Nspadel/Weltner) + Nspadel receipts. **Built (2026-09-30)**: `tools/bookCourt.tools.ts` (critical; Booktime / Padeloo / Klikteren refused with a `/clubs/:id` handoff until 7g), `NspadelBooking` (migration `20260930210000_nspadel_booking_receipts`, written by `createNspadelBooking` for the app's HTTP path too; `nspadel:` refs in `agentBookingSources`), `[slot:…]` / `[booking:…]` tokens in the model rules and stripped from chat titles, tests `agentBookCourt.integration.test.ts` in `npm run test:agent-bookings`. `create_game_with_booking` split to **7d2** | 7b, 7c |
| 7d2 | BE | `create_game_with_booking` (book via 7d, then `createGame` with `externalBookingIds`; rollback or `partial` "Booked; game not created"). **Built (2026-09-30)**: `tools/createGameWithBooking.tools.ts` (critical; `create_game` fields + `slotRef`; shared helpers exported from `createGame.tools.ts` / `bookCourt.tools.ts`). Server (Nspadel / Weltner): book → `createGame` with provider ids / times, nothing booked → FAILED "no game created", create fails → EXECUTED `partial` + `/create-game?…bookingIds=` handoff, partial courts → the game on the booked ones. Client (Booktime / Padeloo / Klikteren): `postStep create_game`, `rollbackOnPartial`; post-step validates the report against the server payload, then mirror + `createGame`; create fails → `partial` + handoff (no server rollback). Model rule 2 + descriptions: prefer it when the user has no game yet. Tests `agentCreateGameWithBooking.integration.test.ts` in `npm run test:agent-bookings` | 7d |
| 7e | BE | `cancel_game`, game-only (booking and coin warnings). **Built (2026-09-30)**: `tools/cancelGame.tools.ts` (critical; `DELETE /games/:id` guards via `GameDeleteService.assertDeletable`, execute `GameDeleteService.deleteGame`), `i18n/agentCancelGameI18n.ts`, `npm run test:agent-cancel-game`. Bets / paid shares noted, not refused (decision #4); linked bookings "stay active", shared ones called out; `cancelBookings:true` with linked bookings → `/games/:id` handoff until 7g fills `proposeCancelWithBookings` | 7c |
| 7f | BE | client-execution protocol (claim/report, lease sweep, caps header, 409 for Telegram). **Built** (migration `20260930201700_agent_client_execution`; `services/agent/clientExecution/`, docs/domains/agent.md) | 7.0 |
| 7g | BE | client plans for book / cancel / `cancel_game`+bookings (Booktime/Padeloo/Klikteren). **Book part built (2026-09-30)**: `book_court` client branch in `tools/bookCourt.tools.ts` (proposed with or without the `booking-v1` cap; connected = provider auth row; `rollbackOnPartial`), post-step (mirror upsert via `upsertAgentBookedMirrorRows`, `linkBookingToGame` or create-game handoff), app rollback of partial multi-court bookings (`rolledBack` in the report; all undone → FAILED, undo failed → UNKNOWN naming the courts), slotRef verified as of the proposal at confirm / claim (open decision #1 of 7d). Tests `agentBookCourtClient.integration.test.ts` (`npm run test:agent-bookings`) and FE `agentClientExecutor.test.ts`. **Cancel part built (2026-09-30)**: `tools/cancelBooking.tools.ts` (`cancel_booking`, critical; booker only; Weltner / Nspadel → "only the club" + club phone + `/clubs/:id`; post-step unlinks from games the user may edit, mirror row CANCELLED, games never deleted) and `proposeCancelWithBookings` in `tools/cancelGame.tools.ts` (plans only non-shared bookings the user `canCancel`; the rest "stays active"; none cancellable → no card, game-only offered; post-step: all cancelled → guards re-run + `deleteGame`, else unlink the cancelled ones, keep the game, `partial` naming what is still active; delete refused → `partial` "Bookings cancelled, game still exists"), shared helpers `booking/agentBookingCancel.ts`. Both proposed with or without the `booking-v1` cap. Tests `agentCancelBooking.integration.test.ts` (`npm run test:agent-bookings`) and `npm run test:agent-cancel-game` | 7d, 7e, 7f |
| 7h | FE | client-execution action card. **Built**: `features/agent/agentClientExecutor.ts` (+ `agentClientAttemptStore.ts`, `agentClientExecStore.ts`), `components/agent/AgentClientActionCard.tsx`, `queries/agent/useAgentClientExecution.ts`; caps header on every agent request; tests in `npm run test:agent` (FE). No adapter exposes a pre-write price quote yet; multi-court rollback added in 7g | 7f (mock until 7g) |
| 7i | FE | slot and booking cards | 7.0 |
| 7j | BE | Telegram rendering and handoffs. **Built (2026-09-30)**: `telegram/agent/agentBotEntities.ts` (booking / slot text lists, club tz + tz label vs the user's current-city zone, snapshot/app_only never "free", caps 8 bookings / 12 slots / 3000 chars → "…and N more" + 📱 Open in app), `agentBotView.ts` (handoff URL buttons, client-execution card ✖ Reject · 📱 Open in app, UNKNOWN → Connected clubs, `partial`), `agentBot.ts` (409 `CLIENT_EXECUTION_REQUIRED` → hand-off), `npm run test:telegram-agent` (`agentBotBooking.test.ts`). Club entities still get no buttons | 7.0 |
| 7k | FE+BE | optional booking-list mirror. **Built (2026-09-30)**: migration `20260930211000_external_booking_mirror` (`ExternalBookingMirror`, `ExternalBookingMirrorSync`), `PUT /api/bookings/mirror`, app sync in `features/agent/bookingMirrorSync.ts` (from the Booktime / Padeloo / Klikteren upcoming loaders), `mirror:` items / dedupe / 24 h coverage in `agentBookingSources.ts`, `link_booking_to_game` via `mirror:`, EULA §1.10 sentence (10 languages); tests in `npm run test:agent-bookings` and FE `npm run test:agent`. Booktime durations not synced (not cheap) | 7a |

- **In parallel after 7.0:** 7a, 7b, 7f, 7i, 7j.
- **Then:** 7h after 7f. 7g is last on the BE.

## 14.9 Risks

- **Money.** Booktime and Padeloo prices are app-only; Weltner and Nspadel have no prices. Never book without a confirmed preview, and show the cancel deadline. Deleting a game drops coin state (separate task).
- **Provider ToS and rate limits.** One server IP would act for many users. Only Nspadel and Weltner are called live, cached 60s per club/date/duration. Booktime's in-app limiter is 60/min.
- **Double booking.** Covered by the conditional claim plus `attemptId`, Weltner's unique key, and Nspadel's live overlap check. Booktime re-checks live.
- **Time zones and DST.** Always use the **club's** city tz, never the home city. Reject nonexistent or ambiguous DST times. Weltner bookings can cross midnight.
- **Stale snapshots.** Never say "free" from a snapshot; re-check at execution.

## Open questions for the owner

1. May the backend call Booktime/Padeloo with stored tokens (option (i))? That drops the no-outbound guard and shares Booktime's rotating refresh token with the FE.
2. Build the FE-synced booking-list mirror (7k), so the BE can list and link Booktime/Padeloo/Klikteren bookings?
3. When `cancel_game` can't cancel every booking: keep the game (proposed) or delete it anyway?
4. Should `cancel_game` refuse games with coin bets or coin-paid cost shares until the refund fix lands?
5. Add Nspadel receipts (like Weltner's), so Nspadel bookings are listable and idempotent?

## Pre-existing issues found

- Deleting a game appears to cascade away open coin bets and coin-settled cost shares with no refund. Not confirmed by a test; spun off as a separate task.
- `GET /booktime/linked-games/:id` is unscoped (separate task).

## Owner decisions (2026-09-30)

1. **Booktime/Padeloo run in the app on Confirm (option ii).** Klikteren does too until server-side is proven. The no-outbound guard stays. Telegram and old builds get "Open in app" handoffs.
2. **Build the mirror (7k).** The app syncs provider booking lists to the BE, so the agent and Telegram can list and link them.
3. **`cancel_game` partial:** keep the game, unlink what was cancelled, and report the booking that is still active.
4. **Coin bets and cost shares:** the refund-on-delete fix is landing in parallel (another session). Treat bet/share refund on delete as working. `cancel_game` does **not** refuse games with coin bets; the preview just notes that bets and shares will be refunded or cancelled.
5. Nspadel receipts (like Weltner's): yes (default); fold into 7d. **Done in 7d.**
