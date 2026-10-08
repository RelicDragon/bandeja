# Architecture constraints

Do not “simplify” these without explicit product intent. Code comments point at `docs/APP_FUNCTIONALITY.md` §2.2; that file inlines the same table and links here.

Each block: what, why, exact paths.

## Scores use saved revisions, not device clocks or arrival order

Manual edits and offline snapshots carry their original `baseVersion`; live patches carry `baseRevision`. Validate under the same game transaction lock that writes scores, acquiring any bracket-round lock first. An old queued payload cannot overwrite a newer saved score. Manual corrections retain an incremented live tombstone (`state: null`) so stale live sessions cannot reuse revision zero. Clients must not silently rebase rejected edits or let older HTTP/socket replies roll back a newer revision. See `Backend/src/services/results/resultsConcurrency.ts`, `results.service.ts`, `matchLiveScoring.service.ts`, and `docs/domains/results.md`.

## Create templates ≠ league/playoff formats

Casual create uses the template registry. League seasons and playoffs use separate wizards/seeds. Do not add `league` / `playoff` template tiers to the create matrix.

- FE create: `Frontend/src/sport/createFlow.ts`
- Shared matrix: `Frontend/shared/createTemplates.ts` (Backend: `@bandeja/shared` + `Backend/src/shared/createTemplates.ts`; FE Vite `@shared`)
- BE copy checked by parity: `Backend/src/shared/createTemplates.ts`
- Parity test: `Frontend/src/sport/createTemplates.parity.test.ts`
- Playoff UI seeds: `Frontend/src/components/GameDetails/playoffTemplates.ts`
- BE playoff game-type templates: `Backend/src/services/league/gameCreation.util.ts` (`PLAYOFF_GAME_TYPE_TEMPLATES`)

## Template matrix source of truth

FE + `@shared/createTemplates` define templates. FE/BE parity is the test file above. Do not maintain a separate matrix markdown.

## Sport level confirmation

Per-sport flags live on `UserSportProfile.approved*`. Legacy `User.approved*` is a **PADEL-only** denormalized mirror for older clients — not a primary-sport projection. Non-padel confirmation lives only on the sport profile.

- `Frontend/src/utils/profileSports.ts` (comment cites §2.2)
- `Frontend/src/types/index.ts`
- `Backend/src/services/user/userSportProfile.service.ts`
- `Backend/src/services/user/userMerge.service.ts`
- `Backend/src/services/training.service.ts`

## `Game.status` is derived — never gate mutations on it

`calculateGameStatus` computes `status` from the clock plus `resultsStatus`: `STARTED` also means "now is inside `[startTime, endTime)`", and `FINISHED` also means "the slot ended while `resultsStatus` was still `NONE`". Gating invites, joins, participant management or settings on `status` therefore froze games nobody had scored, purely because their court time passed.

**`resultsStatus !== 'NONE'` is the mutation lock.** `ARCHIVED` stays a separate hard stop as a retention boundary. Both live in one shared predicate — do not reintroduce `status === 'STARTED'` or `status === 'FINISHED'` checks in permission code.

- Shared predicates: `Frontend/shared/gameMutationLock.ts` (`canMutateGameRoster`, `isGameResultsLocked`, `isGameArchived`); backend imports `@bandeja/shared/gameMutationLock`
- Derivation: `Backend/src/utils/gameStatus.ts` `calculateGameStatus`; recomputed by `Backend/src/services/gameStatusScheduler.service.ts`

A clock-derived `FINISHED` is **never persisted** for results-based entity types (`GAME`, `LEAGUE`, `TOURNAMENT`, `TRAINING`) while `resultsStatus` is `NONE` — `isUnscoredClockFinished` / `calculatePersistableGameStatus` in `gameStatus.ts`. Every writer of `Game.status` must go through `calculatePersistableGameStatus` (the scheduler skips the write instead). Storing that value would cancel the game's pending invites through `cleanupInviteParticipantsForEndedGame`, which fires on the `FINISHED`/`ARCHIVED` transition. Unscored games are still bounded: `GAME`/`TOURNAMENT` archive 7 days after `startTime`, `TRAINING` 2 days after `endTime`.

- Writers: `Backend/src/services/gameStatusScheduler.service.ts`, `Backend/src/services/game/update.service.ts`, `Backend/src/services/results.service.ts` (results reset). Clients cannot set `status` — `update.service.ts` ignores `data.status`
- Invite cleanup trigger: `Backend/src/utils/gameInviteCleanup.ts`
- Roster/join guard: `Backend/src/utils/participantValidation.ts` `validateGameCanAcceptParticipants`
- Roster-management routes (kick, add/revoke admin, trainer, ownership, join queue, participant chats): `canManageGameRoster` / `canManageGameRosterAsOwner` (`requireRosterMutable` in `Backend/src/middleware/auth.ts`). Plain `canEditGame` only blocks `ARCHIVED` — do not use it for roster mutations
- Settings guard + frozen field list: `Backend/src/services/game/gameResultsLockedFields.ts`, applied in `Backend/src/services/game/update.service.ts`
- FE gates: `Frontend/src/pages/GameDetailsShell.tsx` (`canMutateRoster`, `canViewSettings`, `canInvitePlayers`), `Frontend/src/components/GameDetails/roster/RosterJoinPanel.tsx` (`canJoinOrInvite`), `Frontend/src/components/ManageUsersModal.tsx`

`status` remains fine for display (`GameStatusIcon`) and for "active now" list scoping (`sortGames.ts`, `MyTab.tsx`, `homeStaleScheduledGame.ts`, `courtOccupancy.service.ts`).

### Substitution is the one roster change allowed while results run

An injured player must be replaceable mid-game, so `POST /games/:id/substitute-participant` is deliberately gated by `canEditGame` (owner/admin, blocks `ARCHIVED`) rather than `canManageGameRoster`. The lifecycle window lives in the service: `resultsStatus` must be `IN_PROGRESS` — `NONE` uses the normal invite/kick flow, `FINAL` must be undone first.

It is a **seat handoff, never a roster expansion**: the outgoing player is demoted to `NON_PLAYING` and the substitute becomes `PLAYING` in the same seat, so `maxParticipants` stays in `GAME_RESULTS_LOCKED_FIELDS` and this path can never grow the roster past it.

The substitute **inherits** the seat: every `TeamPlayer` row for the game is rewritten, including matches already scored, so results read as if they had played throughout and the outgoing player keeps no rating or standing. This is why the fixed-team update is in place (`gameTeamPlayer.update`) — `setGameTeams` recreates `GameTeam` ids and would orphan the `Team.metadata.gameTeamId` back-references that match sides rely on. Rating attribution needs no special casing because `generateGameOutcomes` builds its player set from `status: 'PLAYING'` participants.

**League games are excluded** (`LEAGUE`, `LEAGUE_SEASON` → `errors.games.substituteNotSupportedForLeague`). League standings resolve a fixture to a `LeagueParticipant` by roster key plus `LeagueTeamRosterAlias` (`leagueGroupStandingsFixtures.ts`), so rewriting a fixture roster here would leave it matching no team and silently drop it from the standings. League roster changes go through `LeagueTeamPlayerSwapService`, which registers the alias and refuses to touch scored or in-progress fixtures.

Because the rewrite changes results data, the service emits **`game-results-updated`** as well as the game update — the results engine only reloads rounds on the former (`useGameResultsEngine`), so viewers would otherwise keep seeing the replaced player.

- Service: `Backend/src/services/game/participantSubstitution.service.ts`
- Gender rules are evaluated with the outgoing player excluded, otherwise a like-for-like swap reads as full
- The trainer holds a role, not a seat, so they are changed through game settings and are not offered as substitutable
- FE: `Frontend/src/components/GameDetails/ResultsRosterCard.tsx` + `Frontend/src/components/GameDetails/substitute/`

### Leaving a playing seat is blocked once results run

`leaveGame` rejects a `PLAYING` participant while `resultsStatus !== 'NONE'` (`errors.games.cannotLeaveResultsStarted`). A non-owner leave **deletes** the `GameParticipant` row and clears their fixed-team slots, while their `TeamPlayer` rows in scored matches survive — and `generateGameOutcomes` seeds its player set from `PLAYING` participants only, so those matches would lose their rating snapshot. This matches kick, which `canManageGameRoster` already blocks. The sanctioned mid-results roster change is substitution; resetting results to `NONE` reopens leaving. Guest and `NON_PLAYING` chat leaves are unaffected.

## Court occupancy

FE owns external snapshot refresh (`useClubSnapshotRefresh`). BE `CourtOccupancyService` merges app games + admin holds + **Booktime/Padeloo/Klikteren** busy snapshots (`queryExternalBlocks` — those three `ClubIntegrationType`s only). **NSPADELSUPABASE and WELTNER are not in that merge**; availability is `/api/nspadel/*` and `/api/weltner/*` respectively. Snapshot freshness: `BOOKTIME_SNAPSHOT_FRESH_MS` = 60s (`Frontend/shared/gameBooking/booktimeSnapshotFreshness.ts`) for Booktime/Padeloo/Klikteren (and nspadel slot UI staleness where that constant is imported).

- FE refresh: `Frontend/src/hooks/useClubSnapshotRefresh.ts`
- Booktime/Padeloo/Klikteren slot freshness: `Frontend/src/integrations/{booktime,padeloo,klikteren}/slots.ts`
- Occupancy merge (no nspadel): `Backend/src/services/game/courtOccupancy.service.ts` `queryExternalBlocks`
- BE snapshot rate limit: `Backend/src/services/booktime/booktimeSnapshot.rateLimit.ts`
- Overlap vs occupancy: `Backend/src/services/game/gameSlotOverlap.service.ts`

## Find month index is progressive

Busy-city page 1 must commit before lightweight cursor continuation. Continuation is a cancellable per-query-key job with cursor-local retry, one bounded delayed resume for retryable failure, and page/time budgets. Partial indexes stay `dayIndexTruncated` and cannot seed an empty day. `keepPreviousData` placeholders never start jobs. Socket-derived index refreshes are coalesced and wait for active month work. Do not move continuation back into the main query promise.

- `Frontend/src/queries/games/availableGamesDayIndexContinuation.ts`
- `Frontend/src/queries/games/useAvailableGamesQuery.ts`
- `Frontend/src/queries/games/findQueryRevalidation.ts`
- `Frontend/src/queries/games/seedDayScopedAvailableCache.ts`
- BE page meta: `Backend/src/services/game/availableGamesQuery.ts`

## External booking ports

Provider ports in `Frontend/shared/booking/` with adapters:

| `ClubIntegrationType` | FE adapter | Auth / snapshot models |
|-----------------------|------------|-------------------------|
| `BOOKTIME` | `Frontend/src/integrations/booktime/` | `UserClubBooktimeAuth`, Booktime busy snapshot |
| `PADELOO` | `Frontend/src/integrations/padeloo/` | `UserClubPadelooAuth` |
| `KLIKTEREN` | `Frontend/src/integrations/klikteren/` | `UserClubKlikterenAuth` |
| `NSPADELSUPABASE` | `Frontend/src/integrations/nspadel/` | `UserClubNspadelAuth`, `ClubNspadelBusySnapshot` |
| `WELTNER` | `Frontend/src/api/weltner.ts` + availability/confirmation hooks | `UserClubWeltnerAuth`, `WeltnerBooking` receipts; no busy snapshot |

Hydration: `Frontend/src/integrations/booking/createClubBookingProvider.ts`. Types: `Frontend/shared/clubIntegration.ts`. Coverage helpers: `Frontend/shared/gameBooking`.

Booktime and Padeloo browsers may call provider APIs directly (CORS `*`). Klikteren and nspadel may not — see below.

## Open chat thread (live projection)

Live projection (`threadLiveProjection`) keeps an open thread applying inbound + read-receipt paths while the inbox updates. Bootstrap invariants are in `Frontend/src/services/chat/threadOpen/types.ts`. Dexie writes go through `applyThreadEvent` (`Frontend/src/services/chat/chatLocalApplyThreadEvent.ts`). Unread is a third authority (`@bandeja/unread-contract`). Do not collapse the three.

- `Frontend/src/services/chat/threadLiveProjection.ts` (cites §2.2)

## Chat read cursor is the only authority

Unread and own-message ticks (✓✓) use **`ChatReadCursor`** only. Mark-read merges the actor cursor forward (`ChatReadCursorService.mergeFromMessage`). Tick = at least one **peer** cursor covers the message, not “read by everyone”. Do not restore `MessageReadReceipt` as live unread/tick authority. Contract events `MESSAGE_READ_RECEIPT` / `MESSAGES_READ_BATCH` are historic. Detail: `docs/domains/chat.md`.

- BE unread SQL: `Backend/src/services/chat/chatReadUnreadSql.ts`
- FE ticks: `messageTickState.resolveOwnMessageTicks`, `peerReadCursorStore.ts`

## Play-intent notifications

Intent/game matching is transactionally queued. Recipient delivery is persisted per event + user + channel, revalidated before send, retried with backoff, and deduplicated by that key. Do not replace with post-commit fire-and-forget sends.

- Enqueue: `Backend/src/services/playIntent/playIntentNotify.service.ts`
- Drain/retry: `Backend/src/services/playIntent/playIntentNotificationDeliveryQueue.service.ts`

## Play-intent radar games ≠ notify

Court-lobby matching games are `matchingGames[]` on the pool, not `PoolMember`. Sport radar: public `GAME` + `TOURNAMENT`. BAR radar: `BAR` only. Skip TRAINING, leagues, EVENT, private, full, no time, owner, already `PLAYING` / `INVITED` / `IN_QUEUE`. Cap 4 (`MATCHING_GAMES_VISIBLE_CAP`). `GAME_MATCHES_INTENT` notify stays **GAME/BAR only**. Do not stuff games into player physics or tighten notify to `allowDirectJoin`.

- Entity filter: `Backend/src/services/playIntent/playIntentMatchingGames.ts` `radarEntityTypes`
- List: `Backend/src/services/playIntent/playIntentMatchingGames.service.ts`
- Notify entity guard: `playIntentNotify.service.ts` (~line 373), `playIntentNotificationDeliveryQueue.service.ts` (~line 163)
- FE radar: `Frontend/src/components/playIntent/CourtLobbyArena.tsx`, `matchingLobbyGames.ts`

## Device refresh sessions are retry-safe

Access JWTs stay short-lived (`DEFAULT_JWT_ACCESS_EXPIRES_IN` `30m`). Clients rotate refresh credentials with a persistent request id so a lost-response retry receives the exact committed successor. **Refresh without `X-Refresh-Request-Id` is rejected.** Never rotate without this replay protocol.

- Header read + 400 codes: `Backend/src/controllers/authRefresh.controller.ts` (`auth.refreshRequestIdRequired`, `auth.refreshRequestIdInvalid`, pattern `^[A-Za-z0-9._:-]{16,128}$`)
- Rotation + replay: `Backend/src/services/auth/userRefreshSession.service.ts` (`refreshActiveSession`, `rotationRequestId`)
- CORS allowlist: `Backend/src/app.ts`, `Backend/src/middleware/errorHandler.ts`
- FE: `Frontend/src/api/authRefresh.ts` (`headers: { 'X-Refresh-Request-Id': refreshRequestId }`)
- Admin: `Admin/app.js` (`adminRefreshRequestId()`)
- TTL / session cap: `Backend/src/config/jwtAuthConfig.ts`, `config.authMaxActiveSessionsPerUser` default 20
- Web refresh: HttpOnly cookie (`refreshWebHttpOnlyCookie`); native Keychain/Keystore

---

## PRD 345–357 invariants

Added with the 13-PRD programme (PRDs 345–357). Each of these was a real defect found in audit before it was closed — they are not theoretical.

### Attendance is a courtesy signal, never a contract

PRD 346 may write **only** `GameParticipant.attendance` / `attendanceUpdatedAt` / `noShowNotedById` / `noShowNotedAt` and the two informational counters `UserSportProfile.attendedCount` / `noShowCount`. It must never touch `level`, `reliability`, `ratingUncertainty`, `LevelChangeEvent`, a seat, or a queue position, and there is no deadline and no auto-release. The eligibility gate is `resultsStatus` plus explicit times — an earlier version gated on `Game.status` and therefore **failed open** for backdated games, inflating the public "Shows up %".

The **owner's yes is implicit and derived, never stored**: the owner is not asked, and every reader coerces their PLAYING row to `CONFIRMED` (`isImplicitlyConfirmedOwner`). Storing it instead would freeze the rule at creation time, miss existing games and drift the moment a game changes hands — see [games.md](../domains/games.md#attendance).

- Rules: `Backend/src/services/gameAttendance/attendanceRules.ts`
- Enforced three ways: a runtime allow-list, a source scan over `services/gameAttendance/`, and `gameAttendance.invariants.integration.test.ts`, which snapshots the roster, users, sport profiles and game before and after every operation

### A time change resets attendance and never moves a booking

The owner (or an admin) is authoritative over the schedule: there is no proposal or reconfirmation flow, an edit simply *is* the new time. When start/end moves on a game with a set time, every PLAYING answer is cleared (the editor's own answer and the owner's derived yes survive), attendance buttons sent before the change are refused (`GameTimeChange.attendanceResetAt` vs the push token `iat` / Telegram message date), and PLAYING players except the editor get **one** coalesced "time changed" notice. Linked bookings are only *flagged* when they no longer cover the game — the app never moves or cancels a reservation. The logic lives in the shared update path (`GameUpdateService.updateGame` → `services/gameTimeChange/`), so every caller (game page, league fixtures, series edits, club admin, AI agent tools) inherits it; do not re-implement it per surface. The reset still goes through the attendance allow-list (`buildAttendanceResetUpdate`), and the notice claim is a durable versioned row, never an in-process set. Detail: [games.md](../domains/games.md#time-change).

### Coins: atomic, idempotent, and authorised server-side

Every grant, purchase, gift and refund is atomic with the row it implies and idempotent under retry and concurrent duplicates.

- **Cost split** claims the `GameCostShare` row with a conditional `updateMany` **before** any coins move; the loser of a double-tap is refused and never transfers (`services/gameCost/gameCost.service.ts`).
- **Shop** debits with `updateMany({ where: { id, wallet: { gte: price } } })` inside the purchase transaction — a plain read-then-decrement let N concurrent buys of N *different* items each pass their balance check and overdraw the wallet (`services/shop/shopPurchase.service.ts`).
- **Refunds** are idempotent per *ownership instance*: deleting the `UserGoods` row is the claim. Keying on "has this user ever been refunded for this goods id" loses the money on a withdraw → reactivate → re-buy → withdraw cycle.
- **Game delete** returns every coin the game holds — held bet stakes and coin-settled cost shares — inside the delete transaction, because `Bet` and `GameCostShare` cascade with the game and nothing is left to reconcile. What cannot be returned (payer already spent a coin share, bet payout still pending) refuses the delete (`services/game/gameDeleteCoinRefunds.ts`).
- **Coin-settled cost shares** are reversed payer → player whenever the row would leave the ledger (leave, kick, price removed, delete); a payer who cannot cover it yet keeps a hidden refund claim that is retried, never dropped. The settle transfer stamps its share row in the same transaction and rolls back if the row is gone (`services/gameCost/coinShareReversal.ts`).
- **Referral payout** claims the unique `ReferralReward.referredUserId` row before granting either side.
- Coins are never purchasable with real money (store compliance).

### Delivery is persisted, revalidated and deduped — never fire-and-forget

Same discipline as play-intent (above). Seat-opened, live-start, weather and series carry-over all claim a durable row **before** dispatch and revalidate on retry. In-process `Set` dedupe is forbidden for anything that must not double-fire: it is lost on restart. `SpotOpenedDelivery` is deliberately shared between the spot-opened and play-intent paths so one seat cannot produce two pushes.

### Card enrichment is a closed contract

`Backend/src/services/game/availableGamesEnrichmentTypes.ts` and `Frontend/src/types/gameCardEnrichment.ts` are hand-mirrored with no compile-time link, and the client merge is the **only** source of these fields for Find/Home (both list queries send `format: 'card'`). A merge that names fields individually silently drops the rest — this is how six PRDs' card surfaces shipped dead with green builds and passing tests. The merge now walks `GAME_CARD_ENRICHMENT_KEYS` with an exhaustiveness guard, and `buildGameRenderSignature` must include every field the card renders or the memoised card never repaints.

- `Frontend/src/utils/attachAvailableGamesEnrichment.ts`, `Frontend/src/utils/gameCardPropsEqual.ts`

### Private means unlisted (the direct-link model)

`Game.isPublic = false` keeps a game out of Find, search, the Live rail, radars and other strangers' lists. It is **not** an access list: a signed-in user holding the link can open it (`GET /games/:id`) and use `POST /games/:id/join` exactly as on a public game. "Share game" and the PRD 351 invite link (shown on private games too) depend on this, and shipped store builds cannot be updated, so do not add an `isPublic` / invite gate to read or join. The organizer's control over strangers is `allowDirectJoin`: off → a link holder only lands in the join queue. **League fixtures (`LEAGUE`) are the exception: they are closed.** Players request to join the `LEAGUE_SEASON`; fixture rosters come only from league assignment (auto or season owner/admin), so `/join` and self `toggle-playing-status` on a fixture answer 400 `errors.games.joinNotSupportedForLeagueFixture` and the `?join=1` deep link is ignored there. The AI agent is deliberately stricter (public ∪ roster ∪ league content, see below) because it searches; previews and guest endpoints still answer 404 for private games so nothing *lists* them. Pinned by `npm run test:game-join-access`.

- `Backend/src/services/game/read.service.ts`, `Backend/src/services/game/participant.service.ts`

### Guest-readable endpoints are whitelist projections

`GET /clubs/:id/public` and `GET /api/results/game/:gameId` (plus its round/match variants **and the three `outcome/:userId/…explanation` siblings**) serve unauthenticated callers. They use explicit `select` whitelists, never a top-level `include`: `integrationConfig`, `ptMeta`, `bio`, `weeklyAvailability` and `socialLevel` must never reach a client. A private game answers **404**, not 403, so the endpoint is not an existence oracle.

### A broadcast is projected for the least-entitled recipient, and an absent key means "not transmitted"

The socket `game-updated` payload has one body and many audiences: the `game-${id}` room holds roster members, invited users, watchers of a public game, and — through `MessageService.validateGameAccess` — every player of a league **season** for any of its fixtures. There is no per-socket entitlement check on the broadcast path, so `SocketService.emitGameUpdate` re-projects whatever game its caller handed it through `projectGameForBroadcast` (`services/game/gameDetail.projection.ts`): no viewer-scoped `userNote` / `isClubFavorite`. `senderId` names the actor, never the audience — projecting the payload *for* a more-entitled actor to keep a field puts it on every socket in the room.

The client half is the other belt, and it is the one that cost data: a key a payload omits was **not transmitted**, it was not *cleared*. Screens that replace their game object from a broadcast carry these fields over (`queries/games/preserveUntransmittedGameFields.ts`), and a form never writes back a field the viewer may not have received unless it actually changed (`features/cost/gameEditPricePayload.ts`). Without both, a player leaving a game made the organizer's next unrelated save delete her saved IBAN.

### i18n plural families

The locale parity test compares plural **families**, not raw keys, so each locale carries exactly the CLDR categories its grammar needs. Shipping only `_one`/`_other` in Arabic does not fall back gracefully: i18next misses, falls through to English, and recomputes the suffix *for English*, so an Arabic user sees Latin-script English on an RTL screen. `Frontend/src/i18n/localeParity.test.ts` asserts per-locale category completeness and rejects unreachable categories.

### i18n namespaces: one owner per key, migrated one namespace at a time

Decision for the i18n namespace migration (issues #71/#72). The ~70 JSON files per locale are spread into one flat default namespace `translation` by `locales/<lng>/index.ts`. That spread is **shallow**: two files sharing a top-level key silently replace each other's whole subtree. No collision exists today, but nothing prevented one.

- **Target:** i18next multi-namespace, not prefix-only. A feature that is migrated becomes an **owned namespace**, listed in `Frontend/src/i18n/namespaces.ts` (`FEATURE_NAMESPACES`), registered as its own namespace for every locale and **removed** from the flat spread. No alias is kept. Two live spellings of one string is what the split exists to remove, and the guard below makes a leftover flat call site fail CI.
- **File format is unchanged.** `<ns>.json` keeps its single `{ "<ns>": { … } }` wrapper, and each `index.ts` exports the unwrapped body as `featureNamespaces.<ns>`. Parity tests, `scripts/i18n/*` and translators see the same files and the same dotted paths.
- **Call sites:** components owned by the feature use `useTranslation('<ns>')` + `t('key')` and do not take a `t` prop for those strings. Any other component borrows with `t('<ns>:key')` from its existing default `t`. Existing `useTranslation()` calls stay as they are, because `defaultNS` is still `translation`.
- **Loading:** eager and bundled, as today. Namespacing moves no bytes: each JSON is imported once either way, so the Capacitor bundle does not grow. Per-namespace lazy loading is rejected for now. The app runs from local files (no network gain), offline startup must render every string, and async namespaces add Suspense and flash-of-raw-key risk. Bundle size is handled **per language** instead: `en` (the fallback) is bundled, every other locale is its own chunk loaded by the backend in `i18n/config.ts` before first render (`main.tsx` awaits `i18nReady`). Capacitor loads that chunk from local files, so offline startup still renders every string. Eager all-locale bundling was ≈ 5 MB of the startup JS.
- **Migration:** one namespace per change, never a big bang. Order: `playerCard` (pilot, done) → `playerProfile`, `profile` → self-contained leaf features already parity-clean (`agent`, `recap`, `series`, `pairs`, `shop`, `referral`, `spots`, …) → large shared ones (`gameDetails`, `createGame`, `games`, `chat`) → `common` / `errors` last, or never. `clubAdmin` stores flat dotted keys (`"clubAdmin.myClubs"`) and `common.json` / `errors.json` carry several top-level keys, so those files need reshaping before they can move.
- **Recipe per namespace:** add it to `FEATURE_NAMESPACES`. Move the spread into `featureNamespaces` in all 11 `index.ts`. Switch the feature's own components to `useTranslation('<ns>')`. Rewrite every other `'<ns>.` literal to `'<ns>:` (including template keys and key maps). Make test `useTranslation` mocks namespace-aware (`ns:key`). Run `npm run test:i18n-parity`.
- **Guard:** `Frontend/src/i18n/namespaceCollisions.test.ts` (in `npm run test:i18n-parity`, which CI runs). Per locale, every top-level key of the flat bundle has exactly one owner file. Owned namespaces are registered everywhere and absent from `translation`. No source file still uses `'<ns>.key'` for an owned namespace, and every static `<ns>:key` (or bare key in a file whose only hook is `useTranslation('<ns>')`) exists in `en`.

---

## Club admin console: roles server-side, club-local days, additive legacy shapes

Club admin access is a `ClubAdmin` row (`role` `ADMIN` \| `STAFF`); a platform admin acts as `ADMIN`. Capabilities are the contract table `CLUB_ADMIN_ROLE_CAPABILITIES` (`Frontend/shared/clubAdmin/contract.ts`) — STAFF is the front desk: `schedule.view`, `schedule.edit`, `bookings.view`, `billing.collect`, nothing else. **Every** `/club-admin` club route runs `clubAdminContext` + `requireCapability` (`Backend/src/middleware/clubAdminContext.ts`, `routes/clubAdmin.routes.ts`), including the legacy routes shipped builds call — a hidden button is not a permission. Club admins never get platform-admin powers: `clear-court` goes through `GameUpdateService.updateGame` with the narrow `clubAdminScope` option (court/time release only), never `isAdmin = true`; courts' `clubId` / integration mapping and hard delete are platform-admin only.

"Today", day windows and opening hours are **club-local** (`club.city.timezone`, `@bandeja/shared/clubAdmin/clubTime`), never the server's or the device's zone; a club day is 23 h / 25 h on DST days and opening windows may run past midnight. One resolver serves every surface (`services/clubAdmin/clubAdminHours.service.ts`). A game belongs to a club when its club, primary court or any court slot is there (`clubAdminGameScope.ts`) — one predicate for every club-scoped read and write.

Legacy club-admin endpoints and response shapes keep working for store builds: fields are only **added** (e.g. `POST /holds` returns the hold row plus `holdIds/seriesId/skipped`). New refusals on a path store builds call must be **opt-in**: hold overlap detection (409 `holdOverlap`) runs only when the body sends `detectOverlap: true`, because shipped builds post to the same `POST /clubs/:clubId/holds`, swallow non-403 errors and would silently lose the hold. Hold deletes are soft (`CourtSlotHold.deletedAt`): every hold read filters `deletedAt: null`.

Console money is **integer cents** in the club currency (`*Cents`, `ClubCharge`, `ClubPayment`, `ClubPriceRule`), rounded once per quote; payments are voided, never deleted; one live charge per booking is a partial unique index, and every money mutation row-locks its charge in a transaction. Reports' top regulars and the players export follow the public club page's regulars rule — public profiles only (`isActive && nameIsSet`), blocks in both directions against the viewing admin applied **after** the shared cache, no contact data. Detail: [club-admin.md](../domains/club-admin.md).

## Novice rank never blocks routes (PRD 358)

Novice mode hides **navigation entry points** only (bottom tabs, home sections, create menus, ads). It never blocks a route: deep links, push taps, invite links, DM and game-chat links must open at any rank. Gate with `hasNoviceFeature` from `@bandeja/shared/novice`, never in a route guard.

- A payload without novice fields is **not** in novice mode (`isNoviceModeActive` → false), so old API shapes and guests never lose UI.
- `User.noviceRank` is monotonic: recounts (`recountNoviceProgress`) raise it and never lower it, even when results are undone. Counts are recomputed from the DB, never incremented.
- Existing users were grandfathered (`noviceUnlockedAllAt` set by the migration); only accounts from the last 30 days with no counted game entered novice mode.
- Paths: `Frontend/shared/novice/index.ts`, `Backend/src/services/novice/`, [domains/novice.md](../domains/novice.md).

---

## Constraints §2.2 originally missed (still load-bearing)

### Nspadel is a real booking provider (`NSPADELSUPABASE`)

Not a stub. Club Supabase is same-origin gated. Anon key never leaves the backend. FE uses `/api/nspadel/availability`, `POST /api/nspadel/bookings`, and `/api/nspadel/upstream/*`.

- Routes: `Backend/src/routes/nspadel.routes.ts`
- Upstream proxy: `Backend/src/controllers/nspadelUpstream.controller.ts`
- Bookings: `Backend/src/services/nspadel/nspadelBookings.service.ts`
- FE client: `Frontend/src/integrations/nspadel/client.ts` (`getNspadelApiUrl()` + `/upstream`)
- Confirm on create: `Frontend/src/components/createGame/NspadelCreateGameConfirmModal.tsx`
- Schema: `ClubIntegrationType.NSPADELSUPABASE`, `UserClubNspadelAuth`, `ClubNspadelBusySnapshot`

Do not teach the browser to call the club Supabase URL. Do not omit nspadel from occupancy/booking work.

### Klikteren is proxy-only (CORS)

`api.klikteren.com` CORS allows Origin `klikteren.com` only. All FE HTTP goes through Bandeja `/api/klikteren/upstream/*`. Backend must not call Klikteren except that proxy (`klikterenNoOutboundHttp.test.ts`).

- FE: `Frontend/src/integrations/klikteren/config.ts`, `client.ts` (`X-Klikteren-Cookie`)
- BE: `Backend/src/routes/klikteren.routes.ts`, `Backend/src/services/klikteren/klikterenUpstream.service.ts` (`KLIKTEREN_UPSTREAM_BASE`)
- CORS header allowlist includes `X-Klikteren-Cookie` (`Backend/src/middleware/errorHandler.ts`)

### Link-to-app first-touch

QR/store landing records UTM + `aid` **once**. Later UTMs do not overwrite stored first-touch (`mergeAttributionFirstTouch`). Carry `aid` through URLs, cookie and localStorage, then attach on register/login (`POST /auth/attribution`, auth payloads). Attribution must not read or write the clipboard: native startup and deep links must not trigger paste permission prompts. There is no clipboard handoff across a new store install. User row is the converted mark; `LinkToAppAttribution.firstTouchUsers` is the relation.

- Static page: `Frontend/public/link-to-app/index.html` (Vite `/link-to-app/`)
- SPA `/link-to-app` **redirects** to `/` or `/login` (`App.tsx`) — do not expect React to render the landing
- Native deep link `/link-to-app` → `/login` + query (`Frontend/src/hooks/useDeepLink.ts`)
- FE merge/bootstrap: `Frontend/src/utils/appAttribution.ts`, `appAttributionBootstrap.ts`
- Public API: `Backend/src/routes/linkToApp.routes.ts` mounted at `/api/public/link-to-app` (`hit`, `go/:choice`)
- Auth attach: `postAuthAttribution` in `Backend/src/controllers/linkToApp.controller.ts`; login/register kinds `register` \| `login`
- Admin: `GET /api/admin/link-to-app/stats`, `Admin/link-to-app.js`, Users QR/UTM column in `Admin/app.js`
- Event kinds: `view` \| `ios` \| `android` \| `web`

Do not generate a new `aid` on every page view when one already exists. Do not treat SPA `/link-to-app` as the QR UI.

### Rating explanation: English original, translated per locale

The LLM rating insight on `GameOutcome.metadata.llmRatingExplanation` is generated **once, always in English** (`RATING_EXPLANATION_SOURCE_LANG`). Every other locale is served by translating that original — the source is never regenerated per language. Generating in the first viewer's locale made the canonical text depend on who opened the outcome first, and forced translation *out of* Russian for a third of all rows.

A translation is **never** stored when it equals the source. An LLM that answers `[[NO_TRANSLATION_NEEDED]]` (or returns a near-duplicate rewrite) is only believed when `sourcePassthroughIsPlausible` agrees the source could already be in the target language; otherwise the call retries and then fails. DeepSeek Flash emits that marker for plainly cross-language pairs (18% of prod calls), and a stored passthrough is cached forever and served as `kind: 'translation'`.

Changing model name is **not** a mitigation: `deepseek-chat` and `deepseek-v4-flash` are legacy aliases that DeepSeek now serves with `deepseek-flash` (V4.1-Flash). `DEEPSEEK_DEFAULT_MODEL` uses the canonical id so `LlmUsageLog.model` records what actually served the request — the old alias logged a model that was no longer running.

- Source generation: `Backend/src/services/results/ratingExplanationLlm.service.ts`
- Translation + storage guard: `Backend/src/services/results/ratingExplanationLlmTranslate.service.ts`
- Blob shape + source-language constant: `Backend/src/services/results/ratingExplanationLlmStorage.ts`
- Passthrough guard: `Backend/src/services/chat/translationFrancCheck.ts` (`sourcePassthroughIsPlausible`)
- Marker/redundancy handling: `Backend/src/services/chat/translation.service.ts`
- Tests: `npm run test:translation-guard` (Backend)

Chat keeps the permissive path on purpose: short messages are where detection is unreliable and the model's judgement is worth more, and chat discards a redundant translation row instead of persisting it.

### Weltner saved contact and durable booking attempts

WELTNER uses a per-user/per-club saved phone, never a fabricated provider session or phone verification. All upstream requests go through the fixed-origin backend. Availability consists of exact start/duration tuples, never inferred busy snapshots. Persist a unique attempt before POST; reuse confirmed receipts and block resubmission after unknown outcomes. Game links use owned, confirmed receipts and authoritative stored court/times. No automatic cancellation, rollback, upstream listing or verification. Contact the club for changes or uncertain outcomes. See [booking](../domains/booking.md#weltner-saved-phone-and-guest-reservations).

### `User.language` is not a locale tag

`User.language` defaults to **`"auto"`** — "follow the device" — and can also hold
`system` or an empty string. None of those is a BCP-47 tag, so
`new Intl.DateTimeFormat(user.language, …)` throws
`RangeError: Incorrect locale information provided`.

That throw is dangerous rather than noisy: notification builders run inside a
`.catch()` on the fan-out path, so the exception is swallowed and the push is
simply **never sent** — for the majority of accounts, which have never picked a
language. PRD 345's "Same time next week?" prompt shipped with exactly this bug
and delivered nothing to default-language users until it was found by an
integration test.

Always resolve the value first:

```ts
import { resolveIntlLocale } from '../../utils/intlLocale';
new Intl.DateTimeFormat(resolveIntlLocale(user.language), { … });
```

`sr` is Serbian **Latin** in this product; `resolveIntlLocale` maps it, because
the bare `sr` tag resolves to Cyrillic. Copy bundles that already allow-list
their own languages (`weatherAlertCopy.safeLocale`, `resolveRecapImageLanguage`)
are equivalent and need no change.

- Helper + tests: `Backend/src/utils/intlLocale.ts`, `intlLocale.test.ts` (`npm run test:series`)

---

## AI agent authorizes per tool call against the DB principal

The in-app AI agent (`/api/agent`, [agent domain](../domains/agent.md)) is a user-facing surface driven by an untrusted model.

- **Principal from the DB, never from the model.** `loadAgentPrincipal(userId)` runs at run start; every tool handler authorizes against it. No tool takes a user id / actor argument for "who am I".
- **Agent game visibility is stricter than `GET /games/:id`, except for leagues.** Visible = public (and the parent is public) ∪ roster row on the game or its parent (`PLAYING | NON_PLAYING | IN_QUEUE | GUEST | INVITED`) ∪ platform admin ∪ **all league content** (`LEAGUE_SEASON` games and their fixtures; system games stay hidden); unapproved EVENTs only for their owner. Anything else answers the same not-found as a missing id (`assertAgentCanViewGame`, `agentVisibleGamesWhere` in `services/agent/access/agentGameAccess.ts`). Leagues are for everyone (product decision): league reads use `assertAgentCanViewLeagueSeason` (missing / non-season id = 404, nothing else hidden), like `GET /leagues/:id/*`; league writes still need season OWNER/ADMIN (403 otherwise).
- **Tool output is an agent DTO** (`services/agent/dto/`): users are public card fields only; never email, phone, Telegram ids/usernames, operator club fields or tokens. Money tools link the game's cost section.
- **Writes only via a confirmed `AgentPendingAction`.** Writes need confirmation unless the user stored ALWAYS_ALLOW for a standard-tier tool; critical tools always confirm (every write tool declares `riskTier`; `update_game` escalates to critical per call when it changes `isPublic` or moves the start by > 24 h). A run tainted by untrusted content (a read tool declaring `untrustedContent`, e.g. `summarize_game_chat`, `web_search`, `web_fetch`, returned content earlier in that run) never auto-approves: ALWAYS_ALLOW is ignored and the card is shown. An ALWAYS_ALLOW write still creates the pending action and runs the same confirm path (fresh principal → re-authorize → execute), audited with `autoApproved=true`; it only skips the tap. A `kind: 'write'` tool validates, checks permission and saves a pending action with a server-rendered preview; the run stops `AWAITING_CONFIRMATION`. Only the user's confirm (app card or Telegram ✅) re-checks permission against a freshly loaded principal and runs the same service the HTTP route uses; reject, 15-minute expiry or a new user message closes it without writing. Admins confirm too. One pending action per chat. Shipped writes: `update_game`, `invite_players`, `join_game`, `leave_game`, `create_game` (casual create templates only, never league/playoff/EVENT); `update_game_booking` is not offered. Money writes (Phase 10) touch only the cost split ledger through the `gameCost` services and their predicates: `mark_my_share_paid` and `confirm_share_received` are standard (they record a payment made outside the app); `pay_my_share_with_coins` moves coins and is critical (never ALWAYS_ALLOW; the service's `expect` guard refuses a claim at any other amount, coin cost or payer than the card showed); `set_game_price` (casual types only, never a league fixture or season) escalates to critical when a share is paid, a coin share exists, the currency changes or the split is removed; `remind_unpaid_shares` is standard and keeps the app's 24 h cooldown. The card's amounts come from the server (a price is exactly the number the user said) and a changed split refuses the card.
- **Web access is backend-only, GET-only and allow-listed** (Phase 13, `tools/web.tools.ts`): `web_search` / `web_fetch` are `untrustedContent` reads (they taint the run); `web_fetch` reads only URLs a `web_search` returned in that chat or the user typed, through the SSRF guard (public addresses only, connect pinned, redirects re-checked, booking-provider and own hosts refused); queries with personal data are refused before any provider call; no tool lets the model choose a method, headers or body (no generic curl). Assistant pictures (`web_images`) load only through the signed image proxy, and only for ids a `web_images` step of that chat returned; model-written image URLs never render.
- **Voice never confirms a write.** A voice conversation sends ordinary turns (`voice: true` only changes the reply style); a pending write still needs the tap on its card (or the user's stored ALWAYS_ALLOW), and the voice session stops listening while a card waits. Never map a spoken "yes" to confirm.
- **Adding a tool needs an authorization test**: `tools/__tests__/agentToolCoverage.ts` + the matrix test (`npm run test:agent`); the registry invariant test fails otherwise.

- Code: `Backend/src/services/agent/` (`tools/registry.ts`, `access/`, `agentRun.service.ts`)
- Tests: `npm run test:agent`, `npm run test:agent-access`
