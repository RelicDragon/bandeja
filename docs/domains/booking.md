# Booking

`ClubIntegrationType` (`schema.prisma` + `@shared/clubIntegration`): `BOOKTIME` | `PADELOO` | `KLIKTEREN` | `NSPADELSUPABASE` | `WELTNER`.

FE owns snapshot refresh. BE merges occupancy: app games + admin holds + external busy (`CourtOccupancyService.getOccupancy`). Freshness: `BOOKTIME_SNAPSHOT_FRESH_MS` = 60s (`@shared/gameBooking/booktimeSnapshotFreshness`) — used for Booktime/Padeloo/Klikteren snapshot staleness.

Occupancy merge `queryExternalBlocks` loads snapshots for BOOKTIME, PADELOO, KLIKTEREN only. NSPADELSUPABASE availability is the Nspadel adapter + `/nspadel/*`, not that merge path.

### Read-only occupancy surfaces

Two surfaces read occupancy without booking anything, and both inherit those constraints unchanged:

- **The public club page's "Today at a glance" strip** (`GET /clubs/:id/today-availability`, [club-admin.md](./club-admin.md)). Our own database only. Klikteren is proxy-only and no provider URL — least of all a club's Supabase URL — may reach the browser, so the response is hour buckets plus one timestamp and nothing else. Only **hard** blocks paint a court grey (`isOccupancyHardBlock`: a club booking or a hold); a game without a booked court is a soft block and leaves the hour green, because the court is still bookable. Hour buckets are built one `fromZonedTime` call per hour in the **club's** city timezone (`buildHourBuckets`), so a DST transition inside the day does not shear the strip. The window comes from the flat `Club.openingTime` / `closingTime` strings; a club that closes after midnight is rendered to end of day rather than wrapping. The strip is decoration: fetched only when `booking.available` is true, never blocking first paint, and a failure simply means no strip.
- **`GET /games/:id/indoor-alternatives`**, the move-indoor sheet ([weather.md](./weather.md)). A court is busy when an overlapping block is a hard block or another app game; the game's **own** blocks are ignored. It reports exactly what the club schedule grid reports.

## Provider ports

`@shared/booking` (`types.ts`, `errorKeys.ts`): busy snapshot payload, `ExternalBookingResult`, `SlotTaken` / `AuthExpired` / `RollbackFailed`. FE adapters: `Frontend/src/integrations/{booktime,padeloo,klikteren,nspadel}/` + `createClubBookingProvider`. Config parsers: `companyId` / Padeloo `clubId` / Klikteren UUID `venueId` / Nspadel `https://*.supabase.co`.

Persistence: `UserClub*Auth` + `Club*BusySnapshot` per provider.

Auth: Booktime phone OTP; Padeloo email OTP; Klikteren email+password; Nspadel club-config + backend booking (no per-user listing/cancel — cancel via club).

## HTTP

Booktime/Padeloo: FE may call providers (CORS `*`). **KLIKTEREN:** all HTTP to `api.klikteren.com` via `GET/POST /api/klikteren/upstream/*` (`getKlikterenApiUrl`). **NSPADEL:** availability/book via `/api/nspadel/*` (server-side Supabase); optional `/nspadel/upstream` for club-gated proxy.

Also per-club `/clubs/:id/booktime|padeloo|klikteren/...` snapshot/auth.

## Connected clubs `/profile/connected-clubs`

Bookings tab: upcoming/past for connected clubs; TZ = club city; link/cancel. Integrations tab: connect/disconnect. Deep link `?bookingIds=` into create-game.

## Game ↔ booking

`GameExternalBooking` + `@shared/gameBooking` (`evaluateLinkedBookingCoverage`, `computeGameBookingStatus`, `linkBookingToGame`, `parseCreateGameDeepLinkSearch`). Coverage: court count + time window vs game start/end. Badges: fully booked vs partial. Shared reservation across games is informational. Delete game does not cancel club bookings. Rollback where the provider supports cancellation; Weltner preserves the receipt and retries game saving.

Create/edit booking flow: `supportsClubBookingFlow` — create GAME/TRAINING/TOURNAMENT; edit those + LEAGUE. EVENT cannot book/link (`eventCreateDefaults.applyEventUpdateInvariants`).

### `?date=` on `/create-game`

`parseCreateGameDeepLinkSearch` also parses `?date=yyyy-MM-dd`, used by the club page's court chips (`/create-game?clubId=&courtId=&date=`).

- The value must be a real calendar date; a malformed or impossible one is dropped rather than passed through, so the wizard never seeds an `Invalid Date`.
- `createGameDataFromDeepLinkSearch` turns it into `startTime` at **local noon**, the same convention `headerStore.setCreateGameInitialDate` already uses. That pins the wizard's date without pretending a slot was picked.
- An explicit `startTime` always wins; `date` is ignored when both are present.

A linked `GameExternalBooking` is never rebooked or cancelled by any in-app court change — including the move-indoor path, which returns `hasLinkedBooking` and `linkedBookingCourtNames` so the organizer is told in words that the old booking stays.

Club admin schedule holds: `club-admin.md`.

## Weltner: saved phone and guest reservations

`WELTNER` connects a player's phone number separately for each club. This is a booking contact, not a verified phone or a Weltner login/token. Bandeja authentication is required to save/change/disconnect it and to submit or read reservations. The backend supplies the authenticated player's profile name. Phone numbers must include a country code.

- Fixed upstream: `https://booking.weltner.site`; the frontend only calls `/api/weltner/*`.
- Admin selects `WELTNER`; `integrationConfig` is null. Map each court's `externalCourtId` to its actual Weltner slug. X-Padel Niš: Yucatán → `teren-1-yucatan`, Azteca → `teren-2-azteca`. Club city timezone: `Europe/Belgrade`. Do not match these to another club by name alone.
- Availability is exact `{start,end,duration}` tuples, with durations 60/90/120/180 minutes and an inclusive today-to-30-days horizon. Never infer physical busy ranges by inverting duration-specific availability. Weltner is not part of `queryExternalBlocks`; the local Today strip cannot establish upstream availability. The booking backend rechecks the exact tuple before submission.
- `POST /api/weltner/clubs/:clubId/bookings` resolves the mapped court and saved contact, then submits `{court,date,start,duration,name,phone}` once. `duration` is a string upstream. Midnight ends carry over to the next calendar day in the receipt.
- `WeltnerBooking` records SUBMITTING/CONFIRMED/REJECTED/UNKNOWN. The unique user/club/court/date/start/duration key reuses a confirmed receipt after a failed game save. Uncertain attempts block resubmission. There is no automatic rollback or automatic POST retry. A partial multi-court success stays booked and is shown to the player.
- `weltner:<id>` is a local receipt ID, never an invented provider reference. A provider ID is retained separately only when returned. Game links require a confirmed receipt belonging to the acting player and the game's club; snapshot court/times come from the stored receipt.
- Confirmed receipts participate in the shared My-tab, club, upcoming/past settings, and existing-reservation lists. Settings separately shows uncertain outcomes and preserves receipts after disconnect. All lists show only bookings submitted through Bandeja. Existing confirmed receipts can be selected while creating/editing a game. Removing the saved phone does not delete receipts or cancel reservations. Prices, payment, cancellation and uncertain outcomes require contacting the club. No upstream customer list/cancel/verify API has been observed; do not offer those actions or apply missing-booking cleanup.

Migration: `20260920120000_add_weltner_booking`. Apply through the normal migration deployment before enabling any club. No production club configuration is changed by this migration. The success response handling follows the public client's HTTP-success behavior; live creation/cancellation has not been exercised against a real reservation.

Validation: `npm --prefix Backend run test:weltner` covers the upstream contract, saved-contact isolation, exact slots, receipt ownership, retry outcomes and account merging with mock database/upstream. `npm --prefix Frontend run test:weltner` covers phone connection, exact availability, confirmation/recovery, shared lists, linked receipt ownership and account-switch/late-response isolation. These checks do not submit real bookings.

Account merge transfers all Weltner receipt states without changing their IDs, and carries over saved contacts where the surviving account has none. A same-slot receipt conflict rejects the merge transaction rather than deleting booking evidence. Shared receipt caches are scoped by Bandeja user and invalidated after connection changes and reservation submissions.
