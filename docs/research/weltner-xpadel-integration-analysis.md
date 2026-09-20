# Weltner / X-Padel Niš: decomposition and Bandeja integration

Research date: 2026-09-20. Status: investigation and proposed implementation; no production code changed.

## Decision

**X-Padel Niš uses the Weltner web booking app.** Its own [booking page](https://www.xpadel.rs/kontakt) embeds `https://booking.weltner.site/embed/teren-1-yucatan` and `https://booking.weltner.site/embed/teren-2-azteca`. These are the actual targets, rather than unrelated apps called X-Padel in other countries.

Reuse Bandeja's court selection and game-booking UX, with a **new WELTNER provider**, but do not promise the full Booktime lifecycle yet. Public availability is verified and public client booking submission is understood. Customer reservation lookup, cancellation and a stable upstream booking ID are not established. Nspadel is a closer capability match than Booktime, although its limitations should not be copied silently.

The complete public HTML/JS/CSS download, hashes, formatted client and seven extracted sections are in [the local download folder](/Users/relic/Downloads/weltner-analysis-2026-09-20/README.md). This is a downloaded **web client**, not an APK/IPA or server source. Source excerpts are for analysis, not a proposal to copy its UI or assets into Bandeja.

## Evidence and confidence

| Evidence | What it establishes |
|---|---|
| [Official club contact/booking page](https://www.xpadel.rs/kontakt), saved as `original/xpadel-contact.html` | Both court widgets point to Weltner. The wrappers still use Calendly class names and its widget loader; that does not make Calendly's API the integration target. |
| [Public deployed JS](https://booking.weltner.site/assets/index-uf70sxz8.js), SHA-256 `9102cd4480c51b3feedf203651586210e19b61f4f54ed0749be9c0a6e8d4672c` | Actual browser request paths, request body, routes, rendering and iframe messages. Download size 274,321 bytes. |
| [Public deployed CSS](https://booking.weltner.site/assets/index-Dno9DNoS.css) | Client styling; 23,454 bytes. |
| [Yucatán public availability](https://booking.weltner.site/api/availability/teren-1-yucatan?date=2026-09-21) and [Azteca public availability](https://booking.weltner.site/api/availability/teren-2-azteca?date=2026-09-21) | Real unauthenticated HTTP 200 JSON, preserved in `evidence/`. Availability is a point-in-time observation, not a lasting schedule. |
| Browser inspection of Yucatán, September 21, two-hour duration | Calendar, duration buttons, available times, name/phone fields, and alternative-court notice work in the public UI. No form submission. |
| `evidence/http-checks.json` in the download | Read-only origin checks and booking-horizon checks. |
| [Booktime code analysis](booktime-provider-integration-analysis.md) | Existing Bandeja integration behavior and extension points; primary source is local code. |

No customer login, private admin data, booking POST, cancellation or payment was attempted. Statements about booking submission come from the shipped client; a successful booking response and backend transaction behavior remain unverified. Absence of an endpoint in this bundle is not proof that no private partner API exists.

## App broken into pieces

The downloaded bundle contains React, routing/calendar code and Axios. The HTML is a small Vite-style shell. Response headers advertise Express behind nginx; that does not identify the database or calendar service. There is no evidence here that this is a general multi-club marketplace.

| Piece | Observed behavior | Local readable source |
|---|---|---|
| HTTP and language | Axios base URL is `https://booking.weltner.site`; JSON content type; Serbian default, English available; language in localStorage | `sections/01-http-and-language.js`, `02-translations.js` |
| Court routing | Exactly two explicit court routes plus `/statistics` in this build; no customer account route | `sections/07-routing.js` |
| Calendar | Today through today + 30 days in the browser; default duration 120 minutes | `sections/05-booking-form.js`, lines 32–58 and 138 onward |
| Availability | Fetch both courts for selected date, filter exact requested duration, sort by start time | Same file, lines 59–85 |
| Alternative court | If primary court lacks a start/duration offered by the other court, add that option with a warning. Submission uses the selected option's court, not the page's court | Same file, lines 64–79 and 108–116 |
| Guest booking | Require name and phone, trim both, POST selected court/date/start/duration/contact | Same file, lines 100–123 |
| Confirmation | Any resolved Axios POST leads to confirmation using the submitted form; response body is discarded | Same file, line 116; `sections/03-confirmation-screen.js` |
| Embedding | Emits ready, height, success, error and close messages to parent | `sections/04-embed-messages.js` |
| Admin statistics | Separate password input; Bearer header to `/api/statistics`; client renders aggregate hours/revenue and reservation rows | `sections/06-admin-statistics.js`; source inspection only, endpoint not called |

The public booking UI has no payment collection, price quote, customer booking history, cancellation or login in the examined build. This does not establish the club's offline payment process or staff tools.

## Observed HTTP contract

### Availability — live verified

`GET /api/availability/{courtSlug}?date=YYYY-MM-DD`

Court slugs:

- `teren-1-yucatan` → Teren 1 - Yucatán
- `teren-2-azteca` → Teren 2 - Azteca

Response example from the live read:

```json
{
  "court": "teren-1-yucatan",
  "date": "2026-09-21",
  "slots": [
    {"start": "08:00", "end": "09:00", "duration": 60},
    {"start": "08:00", "end": "09:30", "duration": 90},
    {"start": "08:00", "end": "10:00", "duration": 120},
    {"start": "08:00", "end": "11:00", "duration": 180}
  ]
}
```

The recorded September 21 response had 75 tuples for Yucatán and 90 for Azteca. These count distinct start/duration combinations, not independent courts or reservations. Slots in this sample begin on half-hour boundaries and can end at `00:00` the following day. Prices, timezone identifiers, reservation IDs and busy-event details are absent from this response.

On September 20, October 20 returned availability; October 21 returned HTTP 400 with `error: "Date out of range"` and a 30-day limit message. This verifies the availability endpoint's upper bound. Booking endpoint validation was not exercised.

### Create booking — request proven by client, response unverified

`POST /api/book`

The client sends this shape; the contact values below are explanatory placeholders, never submitted:

```json
{
  "court": "teren-1-yucatan",
  "date": "2026-09-21",
  "start": "18:00",
  "duration": "90",
  "name": "<player name>",
  "phone": "<player phone>"
}
```

Duration is a **string in the submitted client payload**, a number in availability tuples. No customer authorization header is configured for this flow. The client recognizes English/Serbian slot-conflict text and the 30-day limit message. A conflict HTTP status, idempotency support and exact successful response schema are unknown.

Do not infer that `/api/book` returns no ID simply because the client ignores its response. Equally, do not invent one and treat it as an upstream reservation reference.

### Transport

Read-only GETs with `Origin: https://bandeja.me` and `Origin: capacitor://localhost` both returned HTTP 200 and matching `Access-Control-Allow-Origin`. OPTIONS for availability and booking with the web origin returned 204, allowed GET/POST/OPTIONS and Content-Type/Authorization. This supports direct requests for those tested origins at research time; it is not a full web/iOS/Android transport test or a successful booking test.

**Recommended implementation:** a narrow Bandeja backend adapter, despite currently permissive CORS. It centralizes request validation, durable submission tracking and recovery when the app closes. This is an architectural choice for Weltner, not a reason to change Booktime's frontend-owned transport. Fix the upstream origin server-side and allow only configured court slugs; do not build an arbitrary URL proxy.

## What carries over from Booktime

### User requirement: Booktime-style authentication/connection

The user resolved this requirement: save the player’s phone number as a per-club Weltner connection in Bandeja, then book through the observed Weltner guest flow. No OTP or upstream user session is required. Implementation and operating limits are documented in [booking](../domains/booking.md#weltner-saved-phone-and-guest-reservations).

The boundaries are different:

- **Bandeja authentication:** require the existing authenticated user/session for connection management and reservation submission. Ownership is server-derived, never accepted from a client-provided user ID.
- **Connection UX:** the Connected clubs entry, connect/disconnect states and name/phone review can follow Booktime. For a guest upstream this represents a Bandeja-managed booking profile, not proof of a Weltner account.
- **Phone verification:** a stored profile phone number is not evidence of possession. Booktime verification calls Booktime's `/users/send-code` and `/users/confirm-login`, receiving provider access/refresh tokens. No equivalent is present in the inspected Weltner client. Genuine OTP requires a confirmed Weltner endpoint or a Bandeja-owned delivery/verification service; reusing Booktime's token does not authenticate Weltner.
- **Provider authentication:** if another Weltner login app exists, inspect that exact surface and implement its real token/session contract. Do not guess login endpoints, fabricate successful verification or use the staff statistics password as a player's credential.

The recommendations below about omitting upstream account/token plumbing apply only to the verified public guest flow. They do not remove the user's requested authenticated connection experience. References: [Bandeja auth](../architecture/auth.md), [Booktime client](../../Frontend/src/integrations/booktime/client.ts), [Booktime auth persistence](../../Backend/src/services/booktime/booktimeAuth.service.ts).

| Concern | Booktime today | Proposed Weltner treatment |
|---|---|---|
| Provider registration | Enum/config plus provider factory | Add `WELTNER` and validated club config; map courts by slug using `Court.externalCourtId` |
| Customer connection | Phone OTP, persisted provider session, refresh | Saved per-user/per-club booking phone; Bandeja authentication protects it; no phone verification or upstream account |
| Slot picker | Provider adapter and create/edit flow | Reuse presentation; accept only exact court/date/start/duration tuples returned by Weltner |
| Pricing | Upstream price call | No quote endpoint observed; use clearly labeled club-configured estimate or omit quote until verified |
| Reserve | Provider returns external ID and UTC interval | Verify actual POST response first; persist a local submission record before the request |
| My bookings | Upstream upcoming/past listing | No public list observed; local Bandeja receipts cover only Bandeja-originated submissions, not all club bookings |
| Link to game | `GameExternalBooking` with coverage helpers | Reuse only when identity/outcome semantics are established; don't turn an iframe message into verified external ownership |
| Cancel | Upstream cancel, unlink and refresh | Explicitly unsupported until a real cancellation contract exists; contact-club flow |
| Verify missing booking | Fresh upstream account lookup | Unsupported; an absent availability tuple does not establish who booked it |
| Failure recovery | Compensating cancellation where possible | Never promise rollback if no cancellation API; preserve receipt and allow retrying local game attachment without reserving again |
| Occupancy | Provider busy snapshots merged with local occupancy | Availability tuples are not a proven busy feed. Keep exact bookability separate until snapshot semantics are established |

Primary local seams: [provider interface](../../Frontend/src/integrations/booking/ClubBookingProvider.ts), [factory](../../Frontend/src/integrations/booking/createClubBookingProvider.ts), [shared provider config](../../Frontend/shared/clubIntegration.ts), [booking types](../../Frontend/shared/booking/types.ts), [Nspadel adapter](../../Frontend/src/integrations/booking/providers/NspadelClubBookingProvider.ts), [Nspadel client](../../Frontend/src/integrations/nspadel/client.ts), [booking domain](../domains/booking.md).

## Important implementation details

1. **Keep court identity exact.** The official UI blends in the other court. Bandeja must update the actual selected court before confirmation; a Yucatán game must not silently reserve Azteca. The external court slug is part of the booking identity.
2. **Use Europe/Belgrade local dates and explicit UTC storage.** This timezone follows the verified Niš venue location; the API itself does not send a zone. Normalize `22:00 + 120` to next-day midnight, not same-day midnight or `24:00` parsing. Test DST and users travelling in another timezone. Do not copy Booktime's provider-specific offset corrections.
3. **Preserve exact duration semantics.** Allow 60/90/120/180 where returned. Do not infer that a longer booking exists from several adjacent shorter options. Do not synthesize unsupported 30-minute or 150-minute bookings.
4. **Do not invert free slots into proven physical occupancy.** A missing 60-minute tuple may reflect a short free gap, opening hours, notice periods or other booking policy. It does not prove a reservation. Current `BusySnapshotCourt` lacks this distinction; don't pollute shared hard-occupancy data with a guessed inverse.
5. **Handle partial read failures.** One court failing must not make both courts appear free or remove earlier blocks. Cache by provider/club/court/date, retain last-good data with stale status, and refetch immediately before submission. Exact tuple must still exist; upstream conflict remains authoritative.
6. **Treat lost POST responses as unknown outcomes.** No idempotency key appears in the client. A timeout may occur after the club calendar was changed. Never retry automatically or claim failure/no reservation solely from a network error. Local deduplication helps Bandeja retries but cannot guarantee upstream exactly-once behavior.
7. **Separate booking success from game creation success.** Store a durable local receipt/attempt independently of the game. If upstream succeeded and game creation fails, offer local game-attachment recovery; don't book a second time or discard evidence. Without cancellation support, automatic rollback is impossible.
8. **Unsupported listing is not an empty account.** Add explicit capability metadata (e.g. account auth, quote, listing, cancellation, verification), gate controls, and avoid applying missing-booking cleanup when listing/verification is unsupported. Nspadel's current empty-list convention is a precedent to improve, not copy.
9. **Scope reservation identity.** `GameExternalBooking` stores provider but its unique key is currently `(gameId, externalBookingId)`. Shared unlink/lookup paths also accept a bare booking ID. Use provider + club + external reference in any generalized lifecycle API; retain compatibility for current providers. A local receipt ID should remain explicitly local.
10. **Do not trust iframe success as a server receipt.** Weltner emits `PADEL_BOOKING_SUCCESS` with the submitted form, not its POST response. If using an iframe, validate `event.origin`, `event.source`, message schema and selected slot. These checks prevent unrelated messages but still do not prove upstream identity or enable cancellation. Success payload includes name/phone, so avoid logging or broadcasting it.
11. **Do not read the statistics API for customer bookings.** It is a separate staff credential boundary, not an observed customer listing endpoint. No admin password belongs in the browser or a shared customer adapter.
12. **Confirm prices independently.** The [public price page](https://www.xpadel.rs/cenovnik) lists 2,000 RSD/hour for 08–17 and 2,400 for 17–24. The shipped statistics UI groups some reports around 16:00 and weekends. That is a reason to verify club pricing, not infer a different tariff from reporting labels. Member discounts, equipment, mixed-rate spans and authoritative totals remain unverified.

## Proposed implementation slices

These are proposed changes, not implemented endpoints or promises of upstream support.

### 1. Provider config and read-only availability

- Add `WELTNER` in Prisma/shared types, corresponding named migration, parser, admin selection and court mapping. Keep origin fixed; configure known court slugs and explicit club timezone.
- Add a narrow authenticated/rate-limited Bandeja availability route resolving `clubId` to approved upstream config, and a Weltner client/normalizer.
- Feed exact slots into the existing court/date/duration UX with per-court loading/staleness. Add the requested connect experience using the authentication boundary established above; public availability itself does not require a provider token.
- Initially offer the official court booking page as handoff. Label completion/verification limits; do not create a verified external-booking link automatically from a return visit.
- Pass gate: both real courts, duration filtering, 30-day limit, midnight, bad payloads, per-court failure, traveller timezone and stale/conflicting selection covered.

### 2. Establish creation and recovery contract

- Obtain a club-provided test environment or an explicitly authorized test reservation; capture the complete successful response, conflict response and any reference/cancellation mechanism.
- Ask the operator for a stable reservation/event ID, customer-scoped receipt/lookup, idempotency and cancellation capabilities. This research sent no messages to the club.
- Add a durable local attempt model with local ID, user/club/court/date/interval, minimal necessary contact snapshot, upstream ID nullable, lifecycle and link-to-game state. Distinguish submitting, confirmed, rejected and unknown; reserve pending-approval/payment states only if upstream evidence requires them.
- Define what counts as confirmation from verified response semantics. A locally generated ID must never be represented as the provider's ID.
- Pass gate: server success + lost local response, application restart, repeated tap, game-save failure, unknown outcome and recovery all retain evidence and avoid blind duplicate reservation.

### 3. Native in-app booking and game attachment

- Add contact confirmation to Bandeja's existing final booking review; make the destination club and submitted name/phone visible. Use the player's chosen/confirmed details.
- Submit through the backend once; persist outcome before reporting success. Reuse game coverage/linking for supported identity semantics.
- Surface supported capabilities honestly: local receipts only, cancel via club, no imported booking history unless upstream provides it.
- Update booking domain and UI test plan with actual behavior. Exercise serialized relevant tests with `scripts/run-heavy` or serialized npm scripts.

### 4. Full Booktime-style parity, if upstream supports it

- Add customer-scoped list/verify/cancel, authoritative prices and safe compensating cancellation only after observing or receiving those contracts.
- Add lifecycle synchronization without assuming that an unavailable slot belongs to this user.
- Expand occupancy merge only when a trustworthy busy-feed model exists, documenting the new constraint explicitly.

## Remaining evidence needed

The unknowns are narrow: successful `/api/book` response and reservation reference; duplicate/conflict and timeout semantics; cancellation/refund rules and endpoint; customer receipt/lookup; real calendar backend and timezone semantics; authoritative price; rate limits; and whether the operator supports other clubs. An actual booking is unnecessary for read-only availability, but required evidence for reliable integrated creation unless the operator supplies documentation/fixtures.

No production code or migrations were changed and no heavy tests were run for this research-only task. Read-only HTTP evidence, source parsing/decomposition and browser behavior were verified. Recommended next engineering step: the availability slice, followed by a controlled creation-contract check before enabling real in-app reservations.
