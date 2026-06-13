# ADR-006: External booking provider ports (FE + BE)

**Status:** Accepted  
**Date:** 2026-06-13  
**Issue:** #124  
**Epic:** #117 (Booking system architecture deepening)

## Context

Club online booking is implemented only for Booktime today, but logic is spread across FE `client.ts` / `bookFlow.ts` and BE `booktimeApi.client.ts` / `booktimeBookingRollback.service.ts`. A second provider is not planned yet; we need thin, provider-agnostic seams so future providers or #121 controller refactors can swap implementations without renaming persistence (`ClubBooktimeBusySnapshot` stays as-is).

## Decision

**Two ports** with shared types in `@shared/booking/`:

| Port | Tier | Adapter (today) |
| ---- | ---- | ---------------- |
| `ClubBookingProvider` | FE | `BooktimeClubBookingProvider` |
| `ExternalBookingProvider` | BE | `BooktimeExternalBookingProvider` |

Dispatch on BE uses `ClubIntegrationType` via `getExternalBookingProvider`. Auth/session remains in existing Booktime auth routes + `session.ts` (not on FE port).

### Module mapping

| Current module | After scaffold | Notes |
| -------------- | -------------- | ----- |
| `Frontend/src/integrations/booktime/client.ts` + `bookFlow.ts` | Behind `BooktimeClubBookingProvider` | **Deferred:** callers (`bookFlow` hooks, confirm modal) still use modules directly |
| `Backend/src/services/booktime/booktimeBookingRollback.service.ts` | Routes through `ExternalBookingProvider.rollbackBookings` | Migrated in #124 |
| `Backend/src/services/booktime/booktimeApi.client.ts` | Used by `BooktimeExternalBookingProvider` | Cancel + company resolve |
| `Backend/src/services/admin/booktimeImportCourts.service.ts` | Wrapped by `BooktimeExternalBookingProvider.importCourts` | Optional port method |
| `gameExternalBooking.service.ts` | Unchanged | Provider enum on join rows |
| `CourtOccupancyService` (#123) | Unchanged | Consumes generic blocks; not on booking port |
| `ClubBooktimeBusySnapshot` table | Unchanged | Port exposes `BusySnapshotPayload`; only Booktime adapter reads/writes |

### Shared types (`@shared/booking/`)

- `BusySnapshotPayload` / `BusySnapshotCourt` — generic snapshot PUT shape
- `ExternalBookingResult` — `{ externalBookingId, bookingStart, bookingEnd, price? }`
- Error codes: `SlotTaken`, `AuthExpired`, `RollbackFailed`
- `RollbackBookingResult` — BE rollback row shape

### Deferred

Full FE caller migration (`bookFlow`, confirm modal, hooks) until provider #2 or #121 controller refactor.

## Consequences

- BE rollback is testable through the port (mock provider or injected deps).
- FE adapter exists but is unused by callers until a follow-up slice.
- New providers add adapters + `getExternalBookingProvider` registry entry; shared types stay stable.
