# Bandeja (PadelPulse) — compatibility index

Product behavior lives in `docs/product/` and `docs/domains/`. This file keeps **§2** anchors that code comments still cite (`docs/APP_FUNCTIONALITY.md` §2.2). Do not treat `CLAUDE.md` enums as truth (`GameStatus` is `ANNOUNCED`/`STARTED`/`FINISHED`/`ARCHIVED`, not `READY`/`PLAYING`).

| Need | Read |
|------|------|
| What the product is | `docs/product/overview.md` |
| Words / enums / overloaded terms | `docs/product/glossary.md` |
| Do-not-simplify rules | `docs/product/constraints.md` (table also inlined in §2.2 below) |
| Platforms / deep links / widgets | `docs/product/platforms.md` |
| Not shipped | `docs/product/not-shipped.md` |
| QA / E2E catalog | `docs/UI_TEST_PLAN.md` |
| Prod ops | `docs/PRODUCTION.md` |
| Doc tree | `docs/README.md` |

---

## 2. Architecture at a glance

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Vite, Tailwind, Zustand, React Query, React Router v7 |
| Backend | Express 5, TypeScript, Prisma, PostgreSQL, Redis |
| Real-time | Socket.IO with Redis adapter |
| Storage | AWS S3 (media) |
| Mobile | Capacitor 8 (`com.funified.bandeja`) |
| Chat | Offline-first: IndexedDB (Dexie) + `@bandeja/chat-contract` |
| Unread | `@bandeja/unread-contract` — merge/totals; FE `unreadStore` + snapshot sync |
| Server state (FE) | TanStack Query v5 for REST lists; Zustand for client UI; chat stays on Dexie/L1 (not Query) |

Most authenticated UX lives in a **MainPage shell** with five bottom tabs (My, Find, Chats, Market, Top). Standalone routes: create flows, live scoring, league fullscreen, sessions, connected clubs, club admin, `/next-game`. See `docs/product/overview.md`.

### 2.1 Domain glossary & lifecycles

Canonical vocabulary, enum tables (`EntityType`, `GameStatus`, `ResultsStatus`, `ParticipantStatus`, `PlayIntentStatus`, `EventKind`, `EventApprovalStatus`), city roles, follow vs favorites, play-intent vs radar vs `GAME_MATCHES_INTENT`, chat live projection vs `applyThreadEvent` vs unread, league-withdrawal terms: **`docs/product/glossary.md`**.

Do not copy enum lists here. Schema: `Backend/prisma/schema.prisma`.

### 2.2 Architecture constraints

Full narrative + new constraints (nspadel, Klikteren proxy-only, link-to-app first-touch, `X-Refresh-Request-Id`): **`docs/product/constraints.md`**.

Do not “simplify” without intent. Table kept inline because code cites this heading:

| Constraint | Why it stays |
|------------|--------------|
| **Create templates ≠ league/playoff formats** | Casual create uses the template registry (`Frontend/src/sport/createFlow.ts` / `Frontend/shared/createTemplates.ts`). League seasons and playoffs use separate wizards/seeds (`Frontend/src/components/GameDetails/playoffTemplates.ts`, `PLAYOFF_GAME_TYPE_TEMPLATES` in `Backend/src/services/league/gameCreation.util.ts`). Do not add `league`/`playoff` template tiers. |
| **Template matrix source of truth** | FE + `@shared/createTemplates` define templates; FE/BE parity via `Frontend/src/sport/createTemplates.parity.test.ts`. Do not maintain a separate matrix markdown. |
| **Sport level confirmation** | Per-sport on `UserSportProfile.approved*`. Legacy `User.approved*` is a **PADEL-only** denormalized mirror for older clients — not a primary-sport projection. Non-padel confirmation lives only on the sport profile. |
| **Court occupancy** | FE owns external snapshot refresh (`useClubSnapshotRefresh`); BE merges app games + admin holds + Booktime/Padeloo/Klikteren busy snapshots (`queryExternalBlocks`). NSPADELSUPABASE and WELTNER are **not** in that merge (`/api/nspadel/*`, `/api/weltner/*`). Freshness: `BOOKTIME_SNAPSHOT_FRESH_MS` (60s). |
| **Find month index is progressive** | Busy-city page 1 must commit before lightweight cursor continuation (`availableGamesDayIndexContinuation.ts`). Continuation is a cancellable per-query-key job with cursor-local retry, one bounded delayed resume, and page/time budgets; partial indexes remain `dayIndexTruncated` and cannot seed an empty day. Keep-previous-data placeholders never start jobs. Socket-derived index refreshes are coalesced (`findQueryRevalidation.ts`) and wait for active month work. Do not move continuation back into the main query promise. |
| **External booking** | Provider ports in `@shared/booking/` plus provider-specific booking flows for **Booktime**, **Padeloo**, **Klikteren**, **Nspadel**, and **Weltner** (`ClubIntegrationType`: `BOOKTIME` \| `PADELOO` \| `KLIKTEREN` \| `NSPADELSUPABASE` \| `WELTNER`). Separate persistence per provider (`UserClub*Auth` + `Club*BusySnapshot`; Weltner uses durable booking receipts instead of busy snapshots). Shared freshness constant `BOOKTIME_SNAPSHOT_FRESH_MS` (60s). |
| **Open chat thread** | Live projection module (`Frontend/src/services/chat/threadLiveProjection.ts`) — inbox can update while an open thread must still apply inbound + read-receipt paths without requiring refresh. Dexie durability is `applyThreadEvent` (`chatLocalApplyThreadEvent.ts`). Bootstrap invariants: `Frontend/src/services/chat/threadOpen/types.ts`. Unread is `@bandeja/unread-contract`, not the live reducer. |
| **Chat read cursor is the only authority** | Unread + own-message ✓✓ use `ChatReadCursor` only. Tick = a peer cursor covers the message, not “read by all”. Do not restore `MessageReadReceipt` as live authority. Detail: `docs/domains/chat.md`. |
| **Play-intent notifications** | Intent/game matching is transactionally queued (`playIntentNotify.service.ts`). Recipient delivery is persisted per event + user + channel, revalidated before send, retried with backoff, and deduplicated by that key (`playIntentNotificationDeliveryQueue.service.ts`). Do not replace it with post-commit fire-and-forget sends. |
| **Play-intent radar games ≠ notify** | Court-lobby matching games are a separate `matchingGames[]` on the pool (not `PoolMember`). Sport radar includes public GAME + TOURNAMENT; BAR radar is BAR only (`radarEntityTypes`). `GAME_MATCHES_INTENT` notify stays GAME/BAR only. Do not stuff games into player physics or tighten notify to `allowDirectJoin`. |
| **Device refresh sessions are retry-safe** | Access JWTs stay short-lived (`30m`). Clients rotate refresh credentials with a persistent request ID, so a lost-response retry receives the exact committed successor. Refresh without `X-Refresh-Request-Id` is rejected (`auth.refreshRequestIdRequired` / `auth.refreshRequestIdInvalid` in `authRefresh.controller.ts`). Never rotate without this replay protocol. |
| **Nspadel is proxy/server-side** | `NSPADELSUPABASE` is a live provider. Club Supabase is same-origin gated; anon key never leaves the backend. FE uses `/api/nspadel/*` only (`nspadel.routes.ts`). |
| **Weltner saved contact and receipts** | Per-user/per-club saved phone; no provider session or phone verification. Fixed-origin backend uses exact availability tuples. Persist before POST, reuse confirmed receipts, block retries after unknown outcomes. Links require owned confirmed receipts with stored court/times. No upstream listing/verification/cancellation or automatic rollback; contact the club. |
| **Klikteren is proxy-only CORS** | `api.klikteren.com` allows Origin `klikteren.com` only. All FE HTTP goes through `/api/klikteren/upstream/*`. Do not call Klikteren from the browser or from non-proxy backend modules. |
| **Rating explanation is English-original** | The LLM insight on `GameOutcome.metadata.llmRatingExplanation` is generated once in English (`RATING_EXPLANATION_SOURCE_LANG`); other locales are translations of it, never regenerations. A translation equal to the source is never stored — `[[NO_TRANSLATION_NEEDED]]` and near-duplicate rewrites are only believed when `sourcePassthroughIsPlausible` agrees (`translationFrancCheck.ts`), else retry then fail. Chat stays permissive (short text, and it discards redundant rows). |
| **Link-to-app first-touch** | QR landing (`Frontend/public/link-to-app/index.html`) records `aid` + UTM once; stored UTM wins (`mergeAttributionFirstTouch`). Cookie `bandeja_aid`, localStorage `bandeja.attribution`, clipboard `bandeja-aid:`. SPA `/link-to-app` redirects; do not treat it as the landing UI. Attach on auth (`POST /auth/attribution`). Referral codes ride the same row (`?ref=`), under the same first-touch rule. |
| **Attendance is a courtesy signal** | PRD 346 writes only `GameParticipant.attendance*` / `noShowNoted*` plus the two informational counters. Never a seat, a queue position, a level, reliability or uncertainty; no deadline, no auto-release. Eligibility is `resultsStatus` + explicit times — **not** `Game.status`, which fails open for backdated games (`gameAttendance/attendanceRules.ts`). |
| **Coins are atomic, idempotent and server-authorised** | Cost split claims the `GameCostShare` row with a conditional `updateMany` before any coins move; shop debits with `updateMany({ wallet: { gte: price } })` inside the purchase transaction; refunds are idempotent per *ownership instance* (the `UserGoods` delete is the claim); the referral payout claims the unique `ReferralReward.referredUserId` first. Coins are never purchasable with real money. |
| **Delivery is persisted, revalidated and deduped** | Seat-opened, live-start, weather and series carry-over each claim a durable row **before** dispatch and revalidate on retry, exactly like play-intent. In-process `Set` dedupe is forbidden for anything that must not double-fire — it is lost on restart. |
| **Card enrichment is a closed contract** | `availableGamesEnrichmentTypes.ts` and `Frontend/src/types/gameCardEnrichment.ts` are hand-mirrored with no compile-time link, and the client merge is the only source of these fields for Find/Home. The merge walks `GAME_CARD_ENRICHMENT_KEYS` with an exhaustiveness guard, and `buildGameRenderSignature` must name every field the card renders. |
| **Guest-readable endpoints are whitelist projections** | `GET /clubs/:id/public` and `GET /api/results/game/:gameId` (and its round/match variants) serve unauthenticated callers through explicit `select` whitelists, never a top-level `include`. A private game answers **404**, not 403. |
| **i18n plural families** | Locale parity compares plural *families*, not raw keys: a locale must carry exactly the CLDR categories its grammar needs, or i18next falls through to English and recomputes the suffix for English (`Frontend/src/i18n/localeParity.test.ts`). |

### 2.3 Shared packages & modules

| Package / path | Role |
|----------------|------|
| `packages/chat-contract` (`@bandeja/chat-contract`) | Chat sync event types shared FE/BE. Values are `MESSAGE_CREATED`, `MESSAGE_UPDATED`, `REACTION_ADDED`, … (not `MESSAGE_CREATE`). See `packages/chat-contract/src/chatSyncEventType.ts`. |
| `packages/unread-contract` (`@bandeja/unread-contract`) | Unread snapshot merge, totals, optimistic bump helpers. Reasons: `message_created`, `mark_context_read`, `mark_all_read`, `auto_read`, `message_deleted`, `mute_changed`, `snapshot_repair`, `repair`. Context types: `GAME` \| `USER` \| `GROUP`. |
| `Frontend/shared/` (`@bandeja/shared`) | Canonical shared modules. FE Vite alias `@shared`. Backend: `"@bandeja/shared": "file:../Frontend/shared"` — **no** `@shared` tsconfig paths. Duplicates also in `Backend/src/shared/` (parity tests). Create templates, booking shapes, gameBooking helpers, next-game **policy** (`nextGame/policy.ts` + golden JSON), club integration types (`BOOKTIME` \| `PADELOO` \| `KLIKTEREN` \| `NSPADELSUPABASE` \| `WELTNER`). Runtime `pickNextGame` is `Frontend/src/utils/pickNextGame.ts`. See `docs/architecture/shared-packages.md`. |

---

## Section map (old § → new file)

Domain librarians copy former section bodies into these paths. Do not keep a second copy of product behavior in this index.

| Old § | Title | Now |
|-------|-------|-----|
| 0 | How to use | this file + `docs/README.md` |
| 1 | Product overview | `docs/product/overview.md` |
| 2.1 | Domain glossary & lifecycles | `docs/product/glossary.md` |
| 2.2 | Architecture constraints | this §2.2 table + `docs/product/constraints.md` |
| 2.3 | Shared packages | this §2.3 + `docs/architecture/shared-packages.md` |
| 3 | Authentication & account | `docs/architecture/auth.md` |
| 4 | App shell & global UX | `docs/product/overview.md` + `docs/architecture/frontend.md` |
| 5 | Home — My tab | `docs/domains/home-and-find.md` |
| 6 | Cities & club discovery | `docs/domains/cities.md` |
| 7 | Find tab | `docs/domains/home-and-find.md` |
| 8 | Create game / event | `docs/domains/create.md` |
| 9 | Create league | `docs/domains/leagues.md` |
| 10 | Game details | `docs/domains/games.md` |
| results | Results / scheduler | `docs/domains/results.md` |
| 11 | Live scoring | `docs/domains/live-scoring.md` |
| 12 | Chats | `docs/domains/chat.md` |
| 13 | Marketplace | `docs/domains/marketplace.md` |
| 14 | Leaderboard | `docs/domains/ratings.md` |
| 15 | Profile | `docs/domains/social-and-profile.md` |
| 16 | Social graph | `docs/domains/social-and-profile.md` |
| 17 | Game subscriptions | `docs/domains/subscriptions.md` |
| 18 | Connected clubs & external booking | `docs/domains/booking.md` |
| 19 | Club admin | `docs/domains/club-admin.md` |
| 20 | Bug tracker | `docs/domains/bugs.md` |
| 21 | In-app economy | `docs/domains/economy.md` |
| 22 | Training & trainers | `docs/domains/training.md` |
| 23 | Stories | `docs/domains/stories.md` |
| 24 | Notifications | `docs/domains/notifications.md` |
| 25 | Ads + link-to-app | `docs/domains/ads-and-attribution.md` |
| 26 | AI & media processing | `docs/architecture/backend.md` |
| 27 | Weather | `docs/domains/weather.md` |
| 28 | Presence & online status | `docs/domains/presence.md` |
| 29 | Ratings & rankings | `docs/domains/ratings.md` |
| 30 | Admin panel | `docs/domains/admin.md` |
| 31 | Background jobs & schedulers | `docs/architecture/backend.md` + `docs/domains/results.md` (game status) |
| 32 | Real-time events (Socket.IO) | `docs/architecture/realtime.md` |
| 33 | Security & permissions | `docs/ops/security.md` |
| 34 | Multisport configuration | `docs/architecture/shared-packages.md` |
| 35 | Testing & quality | `docs/ops/testing.md` |
| 36 | Deployment & environments | `docs/PRODUCTION.md` |
| 37 | Backend API surface | `docs/architecture/code-map.md` + `docs/architecture/backend.md` |
| 38 | Route reference | `docs/product/overview.md` |
| 39 | Platform & native UX matrix | `docs/product/platforms.md` + `docs/domains/native.md` |
| 40 | Not shipped / manual-only | `docs/product/not-shipped.md` |
