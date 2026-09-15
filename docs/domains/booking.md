# Booking

`ClubIntegrationType` (`schema.prisma` + `@shared/clubIntegration`): `BOOKTIME` | `PADELOO` | `KLIKTEREN` | `NSPADELSUPABASE`.

FE owns snapshot refresh. BE merges occupancy: app games + admin holds + external busy (`CourtOccupancyService.getOccupancy`). Freshness: `BOOKTIME_SNAPSHOT_FRESH_MS` = 60s (`@shared/gameBooking/booktimeSnapshotFreshness`) — used for Booktime/Padeloo/Klikteren snapshot staleness.

Occupancy merge `queryExternalBlocks` loads snapshots for BOOKTIME, PADELOO, KLIKTEREN only. NSPADELSUPABASE availability is the Nspadel adapter + `/nspadel/*`, not that merge path.

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

`GameExternalBooking` + `@shared/gameBooking` (`evaluateLinkedBookingCoverage`, `computeGameBookingStatus`, `linkBookingToGame`, `parseCreateGameDeepLinkSearch`). Coverage: court count + time window vs game start/end. Badges: fully booked vs partial. Shared reservation across games is informational. Delete game does not cancel club bookings. Rollback reservation if create fails.

Create/edit booking flow: `supportsClubBookingFlow` — create GAME/TRAINING/TOURNAMENT; edit those + LEAGUE. EVENT cannot book/link (`eventCreateDefaults.applyEventUpdateInvariants`).

Club admin schedule holds: `club-admin.md`.
