# Padel Potvrda: existing integration reference

Research date: 2026-09-21. Scope: current local repository only. This note establishes the reusable Bandeja seams; it does **not** establish Padel Potvrda's upstream capabilities. The companion upstream investigation must determine its authentication, availability, booking, listing and cancellation contract before selecting an implementation.

The working tree was already extensively modified when inspected. In particular, Weltner services, migration and several UI files are untracked, and shared integration/game-booking files have local modifications. These findings describe that working tree, **not verified deployed behavior**. No application code, database, external booking or production club configuration was changed during this research. No tests were run for this documentation-only task.

## Recommendation

Add Padel Potvrda as a distinct provider, provisionally `PADELPOTVRDA`, while reusing Bandeja's club/court selection, create/edit-game shell, booking links and coverage badges. Choose its auth and reservation flow from observed upstream capabilities. Booktime and Weltner are useful references for different parts of the job, but they are not interchangeable templates.

- Booktime is a full account integration: phone OTP, persisted tokens, live account bookings, prices, cancellation, verification and busy snapshots.
- Weltner is a guest-submission integration: a saved contact phone, exact live availability, durable local submission receipts, and manual recovery with the club when the outcome is uncertain.
- Do not implement fake cancellation, fake account verification or inferred busy ranges merely to satisfy the existing frontend provider interface. That interface currently assumes capabilities Weltner deliberately does not offer.

## Architecture and capability comparison

| Concern | Booktime reference | Weltner reference | Reuse decision for Padel Potvrda |
|---|---|---|---|
| Provider configuration | `companyId`, optional legal URLs and service IDs | Fixed upstream origin; club config null; court slugs mapped individually | Own provider key and validated config; never reuse another club's identifiers |
| Authentication | Phone login/signup OTP; access and refresh tokens | Bandeja login plus saved club-specific phone; no provider account | Follow observed upstream auth, including any phone verification requirement |
| HTTP | Browser calls upstream; backend persists auth/snapshots | Browser calls Bandeja; backend calls fixed upstream | Backend-only is a suitable default for sessions, controlled egress and durable writes; confirm CORS independently |
| Availability | Available ranges become court-day busy snapshots | Exact start/end/duration tuples | Preserve upstream semantics; range and exact-slot models cannot be substituted |
| Booking result | Provider UUID plus times and price | Local receipt ID, optional separate upstream reference | Preserve real provider references; use an explicitly local reference if no provider ID exists |
| Failed game save | Attempt compensating booking cancellation | Preserve confirmed reservation; retry game save using same receipt | Rollback only when a supported, verified cancellation operation exists |
| Unknown POST result | Current Booktime flow lacks Weltner's durable attempt protocol | Persist UNKNOWN; refuse repeat submission | Reuse durable attempt discipline when upstream cannot provide idempotency/reconciliation |
| Existing reservations | Live upcoming/past account list | Only submissions made through Bandeja | Match proven upstream listing capability; never imply a complete booking history from receipts |

## 1. Provider contract and registration

`Frontend/src/integrations/booking/ClubBookingProvider.ts:22` requires `bookSlot`, `cancelBooking`, `listUpcoming` and `fetchSnapshotCourts`; only `verifyBooking` is optional. `Frontend/shared/booking/types.ts:18` has a compact success shape (`externalBookingId`, start/end, optional price), while its error union at line 25 only covers SlotTaken/AuthExpired/RollbackFailed. It has no pending or unknown result.

`Frontend/src/integrations/booking/createClubBookingProvider.ts:90` and `:126` dispatch Booktime/Padeloo/Klikteren/Nspadel. Weltner is intentionally absent and returns null. Its live availability and confirmation are dispatched in feature-level hooks/components instead. This is an important distinction: adding one adapter to this factory is **not** sufficient to integrate a provider throughout the app.

Registration surfaces:

- `Frontend/shared/clubIntegration.ts:3`: provider union; `:24`: config union; `:140`: `clubHasBookingIntegration`; `:150`: mapped-court gate. Booktime parses company config at `:40`; Weltner has `isWeltnerClub` at `:215`.
- `Backend/src/shared/clubIntegration.ts:143`: validates and normalizes Admin configuration. Weltner branch at `:158` deliberately returns null config.
- `Frontend/shared/gameBooking/contracts.ts:1` and its backend mirror: external booking provider union.
- `Backend/prisma/schema.prisma:440`: Prisma enum; club `integrationType`/`integrationConfig` and court `externalCourtId`/`integrationCourtName` are the existing persistence seams.

Recommended scope: keep upstream client/parser and booking state machine provider-specific. Share capabilities explicitly if a small capability registry reduces repeated switches, but avoid a large booking-framework refactor as a prerequisite.

## 2. Authentication and storage

Booktime's upstream login, confirmation and signup live in `Frontend/src/integrations/booktime/client.ts:319`, `:339`, `:356`, `:370`. Its session layer maintains per-club clients, `sessionStorage`, token refresh and hydration from Bandeja (`Frontend/src/integrations/booktime/session.ts:72`, `:160`, `:253`). Successful connection persists both locally and to the backend at `:337`; unrecoverable sessions clear auth and emit reauth notifications at `:110`.

`Backend/src/services/booktime/booktimeAuth.service.ts:87` encrypts access/refresh tokens at rest using `tokenEncryption`; `:121` returns decrypted tokens only through the user's session path. `UserClubBooktimeAuth` (`Backend/prisma/schema.prisma:449`) is unique on user/club and also holds profile details and scout preferences. This machinery is only justified if Padel Potvrda actually has a provider session.

Weltner saves a phone, not tokens: `Backend/src/services/weltner/weltner.service.ts:23`–`:43`. `UserClubWeltnerAuth` at `Backend/prisma/schema.prisma:4318` is unique on user/club. `weltner.routes.ts:36` requires Bandeja authentication for connection, receipts and booking submission; only availability is optionally authenticated at `:23`. The booking service derives the name from the authenticated Bandeja profile at `weltner.service.ts:162`, rather than trusting a client-supplied identity.

Frontend dispatch is in `Frontend/src/hooks/useClubBookingAuth.ts:56`, `Frontend/src/components/booktime/ConnectClubSheet.tsx:32`, and `ClubBookingConnectInline.tsx`. Connection forms are provider-specific. Existing saved phone must not silently be replaced by the profile phone; `WeltnerConnectForm.test.tsx:46` documents this behavior.

## 3. Availability and occupancy

Booktime fetches upstream available ranges and maps them to snapshot courts via `BooktimeClubBookingProvider.ts:96`; `Frontend/src/integrations/booktime/slots.ts` contains the range conversion and freshness checks. FE owns refresh. Backend snapshot ingestion validates court mapping and busy ranges, rate-limits writes, and atomically replaces a club-day under a PostgreSQL advisory lock (`Backend/src/services/booktime/booktimeSnapshot.service.ts:118`, `:174`).

`Backend/src/services/game/courtOccupancy.service.ts:183` merges external busy snapshots only for BOOKTIME, PADELOO and KLIKTEREN (`:196`). Weltner is excluded. The public club Today strip therefore cannot establish live Weltner availability.

Weltner serves exact tuples through `Backend/src/services/weltner/weltner.service.ts:103`. `weltnerContract.ts:60` validates response identity and slot shapes; `:38` computes authoritative UTC start/end using the club timezone. Its current 60/90/120/180-minute durations and 30-day horizon are **Weltner rules**, not defaults for the new provider.

`Frontend/src/hooks/useWeltnerTimeOptions.ts:28` filters exact duration and intersects start times across selected courts. It refuses absent courts and never stitches shorter slots. `useWeltnerAvailability.ts:24` uses a request sequence and keyed results so stale responses cannot paint the newly selected club/date. `useWeltnerSnapshotRefresh.ts:13` explicitly refreshes live availability without storing a busy snapshot.

Frontend seams to cover together:

- `Frontend/src/hooks/useClubAvailability.ts:9` — club availability sheet.
- `Frontend/src/hooks/useClubTimeOptions.ts:18` — game time selection.
- `Frontend/src/hooks/useClubIntegrationDurations.ts:27` — available durations.
- `Frontend/src/hooks/useClubSnapshotRefresh.ts:41` — refresh/banner state.
- `Frontend/src/components/booktime/ClubAvailabilitySheet.tsx` — slot presentation and create-game entry point.

Use `Europe/Belgrade` for the Niš club via its city timezone; use verified local court-to-upstream mappings. Do not substitute device timezone or infer Padel Spot identity from the Niš name shared with X-Padel/Weltner.

## 4. Booking writes, retries and game-save recovery

Booktime's flow rechecks the selected interval, resolves its service, fetches price, submits and refreshes availability (`Frontend/src/integrations/booktime/bookFlow.ts:118`). `BooktimeClubBookingProvider.ts:28` normalizes successful data and SlotTaken/AuthExpired errors. Cancellation performs provider cancellation and then unlinks related game bookings (`bookFlow.ts:194`).

`Frontend/src/components/createGame/BooktimeCreateGameConfirmModal.tsx:239` retains created IDs in component memory; `:260` books multiple courts serially, creates the game and attempts rollback on partial failure or failed game saving (`:362`). This is not durable idempotency and should not be copied as protection against unknown upstream writes.

Weltner's `createWeltnerBooking` (`Backend/src/services/weltner/weltner.service.ts:146`) is the better reference for uncertain writes:

1. Resolve active club, mapped court and saved user contact.
2. Use the durable user/club/court/date/start/duration unique key. Return an existing CONFIRMED receipt; reject existing SUBMITTING/UNKNOWN (`:168`).
3. Validate time/horizon and recheck exact upstream availability (`:173`).
4. Create SUBMITTING before external POST; conditionally reclaim only REJECTED and reject unique-key races (`:180`).
5. Send one upstream request, persist CONFIRMED on known success or REJECTED/UNKNOWN on failure (`:199`).

`Backend/src/services/weltner/weltnerClient.ts:18` intentionally performs no POST retry, has a 15-second timeout and refuses redirects. Its HTTP/body success and rejection classifications are provider-specific and must be re-established for Padel Potvrda.

`WeltnerBooking` (`Backend/prisma/schema.prisma:4337`) records durable state and authoritative times. `weltnerReceipt` (`weltner.service.ts:120`) labels `weltner:<id>` as LOCAL_RECEIPT and keeps `upstreamBookingId` separate. This reference is never an invented cancellation token.

`Frontend/src/components/createGame/WeltnerCreateGameConfirmModal.tsx:25` books courts serially and then saves the game. A confirmed court remains booked after game-save failure; a retry reuses backend receipts. Partial success is displayed and UNKNOWN disables retry (`:55`, `:123`). These semantics are reusable if Padel Potvrda lacks safe cancellation or reconciliation, but not its endpoint payload or response parser.

The exact-key dedupe protects repeat submissions for that one request tuple; it is not a guarantee against overlapping intervals, different users or bookings made through the provider site. Upstream must remain the authority for actual allocation. If upstream supports an idempotency key, persist and reuse it as well.

## 5. Game links and reservation coverage

`GameExternalBooking` (`Backend/prisma/schema.prisma:908`) is already provider-tagged and stores court plus start/end. Its unique key is game/externalBookingId, so namespace IDs for the new provider to avoid collisions with other vendors or local receipts.

Generic reuse:

- `Frontend/shared/gameBooking/evaluateLinkedBookingCoverage.ts:31` and `computeGameBookingStatus.ts:23`: coverage and NONE/MANUAL/EXTERNAL_PARTIAL/EXTERNAL_FULL status.
- `Frontend/shared/gameBooking/supportsClubBookingFlow.ts`: create GAME/TRAINING/TOURNAMENT; editing also supports LEAGUE. EVENT cannot reserve/link courts.
- `Frontend/shared/gameBooking/parseCreateGameDeepLinkSearch.ts`: existing booking deep links.
- `Backend/src/services/game/gameExternalBooking.service.ts`: link creation, snapshot updates, time derivation and permission checks.

Weltner adds authoritative evidence checks through `Backend/src/services/weltner/weltnerBookingLinks.ts:5`: confirmed receipt, correct club and actor ownership when adding links. Court/times are read from storage, not a browser snapshot. Call sites are `gameExternalBooking.service.ts:244` (initial/batch joins), `:472` (snapshot update, already authorized game editor), and `:602` (single link).

For a new provider, extend every writer, not just create-game. A client must not link another user's reservation or fake confirmed booking times. Changing or deleting a Bandeja game must not silently change or cancel its upstream reservation.

## 6. UI and discovery seams beyond the primary button

| Surface | Reference |
|---|---|
| Create confirmation dispatch | `Frontend/src/hooks/createGameBookingFlow/useCreateGameBookingFlow.ts:807`; `Frontend/src/components/createGame/ClubCreateGameConfirmModal.tsx:25` |
| Edit confirmation | `Frontend/src/components/GameDetails/EditGameInfoModal.tsx:1359` |
| Provider-specific “existing bookings” branch | `Frontend/src/pages/CreateGame.tsx:562`; `useCreateGameBookingFlow.ts:157` |
| Discover connected clubs | `Frontend/src/hooks/useConnectedBookingClubs.ts:51`; `connectedBookingClubs.ts:88` and `:162` |
| Per-club upcoming reservations | `Frontend/src/hooks/useClubUpcomingBookings.ts:51`; `useWeltnerUpcomingBookings.ts` |
| My/connected-club aggregate lists | `Frontend/src/hooks/useAllUpcomingClubBookings.ts:112`; `useAllPastClubBookings.ts:142` |
| Receipt-to-existing-card adapter | `Frontend/src/integrations/weltner/receipts.ts:12` |
| Uncertain/disconnected receipts | `Frontend/src/components/booktime/WeltnerBookings.tsx:25` |
| Booking ownership display | `Frontend/src/integrations/booktime/userBookingsCheck.ts:30`; `useGameLinkedBookingViewer.ts:25` |
| Cancel/verify capability gates | `Frontend/src/components/booktime/BooktimeBookingRow.tsx:189` and `:350` |

Many generically reused files still have Booktime names/types. Treat these as historical names, not a guarantee that adding Booktime client behavior is correct. Current Weltner lists only confirmed receipts in aggregate upcoming/past lists; uncertain receipts have a separate presentation, and disconnecting the phone preserves receipts.

## 7. Schema, Admin and account lifecycle

Create a named migration for the new enum and only the persistence models justified by the observed contract. Follow the migration deployment path; no `db push`. Weltner's reference migration is `Backend/prisma/migrations/20260920120000_add_weltner_booking/migration.sql`; it does not enable a production club.

Admin integration selector: `Admin/index.html:1438`. Config extraction: `Admin/modals.js:293`–`:314`. Backend validator: `Backend/src/shared/clubIntegration.ts:143`. Add useful provider-specific config and court mapping labels without exposing secrets to public club projections.

Mount routes alongside `Backend/src/routes/index.ts:167`. Apply request validation/rate limiting and authenticate user-specific endpoints as in `Backend/src/routes/weltner.routes.ts`.

Account merge is easy to miss: `Backend/src/services/user/userMerge.service.ts:824` calls `weltnerMerge.ts:5` inside the merge transaction. It transfers receipts, preserves the surviving contact, locks users against concurrent inserts, and rejects colliding receipt keys rather than dropping evidence. Any new user-owned connection/receipt model needs equivalent lifecycle handling.

The current `docs/architecture/database.md` provider enum table is stale relative to the working-tree schema (it omits WELTNER); use the schema/current booking domain file for implementation. This note deliberately does not rewrite another task's in-progress domain documentation.

## 8. Verification plan for implementation

Reuse test cases, not just test file layout:

- Contract fixtures: real captured response shapes; invalid/missing fields fail closed; auth-expiry and error bodies; date, duration, currency and cancellation semantics.
- Availability: exact upstream semantics; concurrent date switches; absent/unmapped court; multi-court intersection; midnight and Belgrade DST boundaries.
- Write safety: persist-before-POST; same-request concurrency; confirmed reuse after failed game save; lost response becomes UNKNOWN; process restart; no automatic retry of uncertain writes; partial success stays recoverable.
- Authorization: cross-user/cross-club link rejection; forged client times ignored; only supported provider actions displayed; disconnect retains reservation evidence.
- Full user flow: club discovery → connection → slot selection → confirmation → game creation/edit → My/connected-club lists → existing booking link; correct receipt/reference wording.
- Lifecycle: account merge collisions preserve evidence; configuration disabled/missing; provider config not leaked in public responses.

Weltner references: `Backend/src/services/weltner/weltner.service.test.ts:122` confirms single POST across game-save retry; `:130` ownership; `:174` unknown outcome; `:192` disconnect preservation. `weltnerContract.test.ts` and `weltnerClient.test.ts` cover parsing/HTTP. `weltnerMerge.test.ts` covers account lifecycle. Frontend tests cover exact-slot intersection, old-date isolation, absent courts, saved-phone hydration, authoritative receipt times and game-save recovery.

Existing serialized commands: `npm --prefix Backend run test:weltner` (`Backend/package.json:135`) and `npm --prefix Frontend run test:weltner` (`Frontend/package.json:83`). The backend Weltner script currently lists contract/client/service tests but **does not include** `weltnerMerge.test.ts`; include lifecycle coverage explicitly when verifying new work. Run additional tests/type checks only through serialized npm scripts or `scripts/run-heavy`; one heavy command per frontend/backend lane.

Acceptance before enabling Padel Spot: verified club identity and court mapping, named migration applied, scoped tests pass, and one authorized real-world validation if the user elects to make a real reservation. Read-only inspection cannot prove that a booking POST or cancellation has the promised effect.
