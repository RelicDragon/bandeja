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
- FE gates: `Frontend/src/pages/GameDetailsShell.tsx` (`canMutateRoster`, `canViewSettings`, `canInvitePlayers`), `Frontend/src/components/GameDetails/GameParticipants.tsx` (`canJoinOrInvite`), `Frontend/src/components/ManageUsersModal.tsx`

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

Added with the 13-PRD programme (`docs/plans/prd-345-357/`). Each of these was a real defect found in audit before it was closed — they are not theoretical.

### Attendance is a courtesy signal, never a contract

PRD 346 may write **only** `GameParticipant.attendance` / `attendanceUpdatedAt` / `noShowNotedById` / `noShowNotedAt` and the two informational counters `UserSportProfile.attendedCount` / `noShowCount`. It must never touch `level`, `reliability`, `ratingUncertainty`, `LevelChangeEvent`, a seat, or a queue position, and there is no deadline and no auto-release. The eligibility gate is `resultsStatus` plus explicit times — an earlier version gated on `Game.status` and therefore **failed open** for backdated games, inflating the public "Shows up %".

The **owner's yes is implicit and derived, never stored**: the owner is not asked, and every reader coerces their PLAYING row to `CONFIRMED` (`isImplicitlyConfirmedOwner`). Storing it instead would freeze the rule at creation time, miss existing games and drift the moment a game changes hands — see [games.md](../domains/games.md#attendance).

- Rules: `Backend/src/services/gameAttendance/attendanceRules.ts`
- Enforced three ways: a runtime allow-list, a source scan over `services/gameAttendance/`, and `gameAttendance.invariants.integration.test.ts`, which snapshots the roster, users, sport profiles and game before and after every operation

### Coins: atomic, idempotent, and authorised server-side

Every grant, purchase, gift and refund is atomic with the row it implies and idempotent under retry and concurrent duplicates.

- **Cost split** claims the `GameCostShare` row with a conditional `updateMany` **before** any coins move; the loser of a double-tap is refused and never transfers (`services/gameCost/gameCost.service.ts`).
- **Shop** debits with `updateMany({ where: { id, wallet: { gte: price } } })` inside the purchase transaction — a plain read-then-decrement let N concurrent buys of N *different* items each pass their balance check and overdraw the wallet (`services/shop/shopPurchase.service.ts`).
- **Refunds** are idempotent per *ownership instance*: deleting the `UserGoods` row is the claim. Keying on "has this user ever been refunded for this goods id" loses the money on a withdraw → reactivate → re-buy → withdraw cycle.
- **Referral payout** claims the unique `ReferralReward.referredUserId` row before granting either side.
- Coins are never purchasable with real money (store compliance).

### Delivery is persisted, revalidated and deduped — never fire-and-forget

Same discipline as play-intent (above). Seat-opened, live-start, weather and series carry-over all claim a durable row **before** dispatch and revalidate on retry. In-process `Set` dedupe is forbidden for anything that must not double-fire: it is lost on restart. `SpotOpenedDelivery` is deliberately shared between the spot-opened and play-intent paths so one seat cannot produce two pushes.

### Card enrichment is a closed contract

`Backend/src/services/game/availableGamesEnrichmentTypes.ts` and `Frontend/src/types/gameCardEnrichment.ts` are hand-mirrored with no compile-time link, and the client merge is the **only** source of these fields for Find/Home (both list queries send `format: 'card'`). A merge that names fields individually silently drops the rest — this is how six PRDs' card surfaces shipped dead with green builds and passing tests. The merge now walks `GAME_CARD_ENRICHMENT_KEYS` with an exhaustiveness guard, and `buildGameRenderSignature` must include every field the card renders or the memoised card never repaints.

- `Frontend/src/utils/attachAvailableGamesEnrichment.ts`, `Frontend/src/utils/gameCardPropsEqual.ts`

### Guest-readable endpoints are whitelist projections

`GET /clubs/:id/public` and `GET /api/results/game/:gameId` (plus its round/match variants **and the three `outcome/:userId/…explanation` siblings**) serve unauthenticated callers. They use explicit `select` whitelists, never a top-level `include`: `integrationConfig`, `ptMeta`, `paymentHint`, `bio`, `weeklyAvailability` and `socialLevel` must never reach a client. A private game answers **404**, not 403, so the endpoint is not an existence oracle.

### A broadcast is projected for the least-entitled recipient, and an absent key means "not transmitted"

The socket `game-updated` payload has one body and many audiences: the `game-${id}` room holds roster members, invited users, watchers of a public game, and — through `MessageService.validateGameAccess` — every player of a league **season** for any of its fixtures. There is no per-socket entitlement check on the broadcast path, so `SocketService.emitGameUpdate` re-projects whatever game its caller handed it through `projectGameForBroadcast` (`services/game/gameDetail.projection.ts`): no `paymentHint`, no viewer-scoped `userNote` / `isClubFavorite`. `senderId` names the actor, never the audience — projecting the payload *for* a more-entitled actor to keep a field puts it on every socket in the room.

The client half is the other belt, and it is the one that cost data: a key a payload omits was **not transmitted**, it was not *cleared*. Screens that replace their game object from a broadcast carry these fields over (`queries/games/preserveUntransmittedGameFields.ts`), and a form never writes back a field the viewer may not have received unless it actually changed (`features/cost/gameEditPricePayload.ts`). Without both, a player leaving a game made the organizer's next unrelated save delete her saved IBAN.

### i18n plural families

The locale parity test compares plural **families**, not raw keys, so each locale carries exactly the CLDR categories its grammar needs. Shipping only `_one`/`_other` in Arabic does not fall back gracefully: i18next misses, falls through to English, and recomputes the suffix *for English*, so an Arabic user sees Latin-script English on an RTL screen. `Frontend/src/i18n/localeParity.test.ts` asserts per-locale category completeness and rejects unreachable categories.

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
