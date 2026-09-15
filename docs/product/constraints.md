# Architecture constraints

Do not “simplify” these without explicit product intent. Code comments point at `docs/APP_FUNCTIONALITY.md` §2.2; that file inlines the same table and links here.

Each block: what, why, exact paths.

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

## Court occupancy

FE owns external snapshot refresh (`useClubSnapshotRefresh`). BE `CourtOccupancyService` merges app games + admin holds + **Booktime/Padeloo/Klikteren** busy snapshots (`queryExternalBlocks` — those three `ClubIntegrationType`s only). **NSPADELSUPABASE is not in that merge**; availability is `/api/nspadel/*`. Snapshot freshness: `BOOKTIME_SNAPSHOT_FRESH_MS` = 60s (`Frontend/shared/gameBooking/booktimeSnapshotFreshness.ts`) for Booktime/Padeloo/Klikteren (and nspadel slot UI staleness where that constant is imported).

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

QR/store landing records UTM + `aid` **once**. Later UTMs do not overwrite stored first-touch (`mergeAttributionFirstTouch`). Carry `aid` through cookie, localStorage, clipboard (`bandeja-aid:`), then attach on register/login (`POST /auth/attribution`, auth payloads). User row is the converted mark; `LinkToAppAttribution.firstTouchUsers` is the relation.

- Static page: `Frontend/public/link-to-app/index.html` (Vite `/link-to-app/`)
- SPA `/link-to-app` **redirects** to `/` or `/login` (`App.tsx`) — do not expect React to render the landing
- Native deep link `/link-to-app` → `/login` + query (`Frontend/src/hooks/useDeepLink.ts`)
- FE merge/bootstrap: `Frontend/src/utils/appAttribution.ts`, `appAttributionBootstrap.ts`
- Public API: `Backend/src/routes/linkToApp.routes.ts` mounted at `/api/public/link-to-app` (`hit`, `go/:choice`)
- Auth attach: `postAuthAttribution` in `Backend/src/controllers/linkToApp.controller.ts`; login/register kinds `register` \| `login`
- Admin: `GET /api/admin/link-to-app/stats`, `Admin/link-to-app.js`, Users QR/UTM column in `Admin/app.js`
- Event kinds: `view` \| `ios` \| `android` \| `web`

Do not generate a new `aid` on every page view when one already exists. Do not treat SPA `/link-to-app` as the QR UI.
