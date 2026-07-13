# Plan: Padeloo external booking provider

Companion specs: [PLAN_BOOKTIME_INTEGRATION.md](./PLAN_BOOKTIME_INTEGRATION.md), [PLAN_CLUB_BOOKING_UX.md](./PLAN_CLUB_BOOKING_UX.md), [ADR-006](./adr/ADR-006-external-booking-provider-ports.md).

Decompilation reference: `../Decomp/Padeloo/FINDINGS.md`, `../Decomp/Padeloo/api.json`.

Verified against live API + APK decompilation 2026-07-13.

---

## Summary

Add **Padeloo** (`api.padeloo.app`) as a second external booking provider, using the same architecture as Booktime post-#131:

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | All Padeloo HTTP — auth, slots, book, cancel, list upcoming, snapshot fetch |
| **Backend** | Encrypt/store tokens; busy snapshots; game↔booking joins — **no outbound Padeloo HTTP** |
| **Club record** | `integrationType: PADELOO` + `integrationConfig: { "clubId": <int> }`; `Court.externalCourtId` = Padeloo court id (string) |

**~80% FE / ~20% BE** — same split as Booktime.

Padeloo-specific win: `GET /Club/{id}/available-slots` is **public** → no scout-token pool needed for availability snapshots (FE fetches without user session).

---

## Padeloo vs Booktime

| | Booktime | Padeloo |
|---|----------|---------|
| Model | White-label app per club | One marketplace app, many clubs |
| Venue key | `companyId` (UUID) in config | `clubId` (int) in config |
| Court key | UUID `externalCourtId` | int as string (`"5"`, `"6"`, …) |
| Auth | Phone SMS OTP | Email OTP (+ Google / Apple) |
| API base | `https://api.booktime.rs` | `https://api.padeloo.app/api` |
| Public availability | Partial (`/public/*`) | Full `GET /Club/{id}/available-slots` |
| Durations | 60 / 120 (per company) | 60 / 90 / 120 |
| Stack | Capacitor + Angular | Expo + React Native |

---

## Clubs on Padeloo (live API, 2026-07-13)

**Court booking** — only these two records exist:

| Padeloo `clubId` | Name | Address | Courts (`courtId`) |
|------------------|------|---------|---------------------|
| 2 | Avantura Padel | Miladina Pećinara bb (Avantura Park) | Teren 1 (5) |
| 3 | Avantura Padel 2 | Ulica Sportova bb (TRK) | Teren 1 (6), Teren 2 (7) |

Bandeja: **one DB club row per Padeloo `clubId`** with matching `integrationConfig`.

**Not bookable on Padeloo:**

- **The Padel Novi Sad** — court booking stays on **Booktime** (`rs.booktime.thepadel`). The Padel appears on Padeloo only as a **tournament Organization** (`organizationId` 5), not as a `Club` record.

---

## Architecture

Follow [ADR-006](./adr/ADR-006-external-booking-provider-ports.md):

```
Feature UI (create game, My tab)
        │
useClubBookingFlow(club)          ← generic hook (new)
reservationIntent (generic fields)
        │
createClubBookingProvider(club, mode)   ← registry (new)
        ├── BooktimeClubBookingProvider
        └── PadelooClubBookingProvider
                │
        integrations/{booktime|padeloo}/*
                │ FE HTTP only
        api.booktime.rs / api.padeloo.app

Backend (persistence only)
        /clubs/:id/{provider}/auth
        /clubs/:id/{provider}/snapshot
        GameExternalBooking rows
```

Shared types unchanged: `@shared/booking/` (`BusySnapshotPayload`, `ExternalBookingResult`, error codes).

---

## Design principles

1. **Port, not fork** — book / cancel / list / snapshot via `ClubBookingProvider`.
2. **Registry dispatch** — `createClubBookingProvider(club, 'hydrated' | 'scout')`; stop calling `booktime/*` from feature code.
3. **Provider modules stay thin** — `client.ts` = HTTP; `slots.ts` = mapping; adapter = port impl.
4. **Backend = vault + cache** — tokens, snapshots, joins only.
5. **Provider tag from club** — `externalBookingProvider: club.integrationType`, not hardcoded `'BOOKTIME'`.

---

## Integration config

```json
{ "clubId": 2 }
```

| Field | Required | Notes |
|-------|----------|-------|
| `clubId` | yes | Padeloo integer club id |

Parse in `Frontend/shared/clubIntegration.ts` (+ Backend mirror). Extend `ClubIntegrationType` enum: `BOOKTIME | PADELOO`.

Discriminated union (target):

```typescript
type ClubIntegrationConfig =
  | BooktimeIntegrationConfig   // { companyId, ... }
  | PadelooIntegrationConfig;   // { clubId: number }
```

Generalize helpers:

- `clubHasBookingIntegration(club)` — dispatch on `integrationType`
- `getExternalVenueId(club)` — `companyId` or `String(clubId)`
- Keep `isBooktimeClub` / `getBooktimeCompanyId` as thin wrappers (no mass rename in v1).

---

## Padeloo API (booking-relevant)

Base: `https://api.padeloo.app/api`

### Public (no auth)

| Method | Path |
|--------|------|
| GET | `/App/version` |
| GET | `/Club/cities` |
| GET | `/Club/{clubId}` |
| GET | `/Club/search?cityId=&date=` |
| GET | `/Club/{clubId}/available-slots?date=&durationMinutes=60\|90\|120` |

### Authenticated (`Authorization: Bearer <token>`)

| Method | Path |
|--------|------|
| POST | `/Auth/send-code` `{ email }` |
| POST | `/Auth/verify-code` `{ email, code }` → `{ token, user }` |
| POST | `/Auth/google` `{ idToken }` |
| POST | `/Auth/apple` `{ identityToken }` |
| POST | `/Reservation` — create |
| GET | `/Reservation/my` |
| DELETE | `/Reservation/{id}` |
| GET | `/User/profile`, `/User/saved-clubs`, … |

Full catalog: `../Decomp/Padeloo/api.json`.

---

## Data model (Prisma)

Split enum migration per PostgreSQL rules (add `PADELOO` in migration 1; use in models in migration 2).

### New tables (mirror Booktime)

```prisma
model UserClubPadelooAuth {
  id             String   @id @default(cuid())
  userId         String
  clubId         String   // Bandeja club id
  externalUserId String
  accessToken    String   // encrypted
  refreshToken   String?  // if API adds refresh later
  scoutOptIn     Boolean  @default(true)
  scoutInvalidAt DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([userId, clubId])
}

model ClubPadelooBusySnapshot {
  clubId          String
  courtId         String?
  externalCourtId String
  externalCourtName String?
  date            DateTime @db.Date
  busySlots       Json
  fetchedAt       DateTime
  @@unique([clubId, courtId, date])
}
```

`ClubBooktimeBusySnapshot` stays as-is (ADR-006). Extract shared snapshot ingest logic to `Backend/src/services/booking/snapshotStorage.ts` (DRY with Booktime).

`GameExternalBooking.externalBookingProvider` — add `PADELOO` to `ClubIntegrationType` enum.

---

## Frontend modules

### New: `Frontend/src/integrations/padeloo/`

| File | Role |
|------|------|
| `client.ts` | HTTP to `api.padeloo.app` |
| `session.ts` | In-memory client + session hydration |
| `booktimeBackendSync.ts` analogue → `padelooBackendSync.ts` | Token sync to BE |
| `slots.ts` | Free slots → `BusySnapshotCourt[]` |
| `availability.ts` | Time-picker grid (public API) |
| `bookFlow.ts` | Confirm recheck + `bookSlot` orchestration |
| `config.ts` | Base URL, durations `[60, 90, 120]` |

### New adapter

`Frontend/src/integrations/booking/providers/PadelooClubBookingProvider.ts` — implements `ClubBookingProvider`.

### Registry

`Frontend/src/integrations/booking/createClubBookingProvider.ts`:

```typescript
export function createClubBookingProvider(
  club: Club,
  mode: 'hydrated' | 'scout',
): ClubBookingProvider | null;
```

- **Booktime `scout` mode** — pooled scout token from BE.
- **Padeloo `scout` mode** — public `available-slots` (no token).

### API client to backend

`Frontend/src/api/padeloo.ts` — mirror `api/booktime.ts` (`PUT auth`, `GET/PUT snapshot`, `GET session-token`).

### Hooks (generic wrappers)

| Generic | Delegates to |
|---------|----------------|
| `useClubSnapshotRefresh(club)` | `useBooktime*` \| `usePadeloo*` |
| `useClubCourtAvailability(club)` | same |
| `useClubBookingAuth(club)` | same |

### Reservation intent

Rename (non-breaking aliases ok in v1):

- `requiresBooktimeAuth` → `requiresProviderAuth`
- `opensBooktimeConfirm` → `opensProviderConfirm`
- `hasBooktimeAuthPath` → `hasProviderAuthPath`

### UI (phased)

v1: Padeloo-specific connect form (email OTP) alongside Booktime phone OTP.

v2: Consolidate under `components/clubBooking/` — shared shell, provider-specific inner forms.

---

## Integrations & Bookings (Connected Clubs)

Same requirement as Booktime: Padeloo clubs must appear in **Profile → Bookings** (`/profile/connected-clubs`) and in the **My tab** bookings preview. Today this surface is Booktime-only (`useBooktimeMyClubs`, `useMyTabBooktime`, `ConnectedClubs*Tab`).

**Prerequisite:** Avantura rows in Bandeja DB with `integrationType: PADELOO` and `integrationConfig.clubId` — otherwise they never list.

### Page tabs (`ConnectedClubsBookingsPage`)

| Tab | Booktime today | Padeloo target |
|-----|----------------|----------------|
| **Integrations** | City clubs with `BOOKTIME` + connect / disconnect (phone OTP) | Also `PADELOO` clubs in user's city (e.g. Zlatibor → Avantura Park + Avantura 2); connect via email OTP / Google |
| **Bookings** | Upcoming + past from connected Booktime accounts | Merge Padeloo `GET /Reservation/my` into same lists (provider badge on row) |

My tab gear icon → `?tab=integrations`; "See all" → `?tab=bookings` (unchanged routes; provider-agnostic data).

### Backend

Mirror `booktimeMyClubs.service.ts` → `padelooMyClubs.service.ts`:

- `GET /padeloo/my-clubs` — city clubs with `integrationType: PADELOO` + `connected` from `UserClubPadelooAuth` + extra connected clubs outside city (same pattern as Booktime).

Optional v2: single `GET /booking/my-clubs` merging both providers (DRY); v1 can keep parallel routes like auth/snapshot.

### Frontend

| Today (Booktime) | Generalize to |
|------------------|---------------|
| `useBooktimeMyClubs` | `useConnectedBookingClubs()` — merges Booktime + Padeloo payloads |
| `useBooktimeAllUpcoming` | `useAllUpcomingClubBookings()` — `provider.listUpcoming()` per connected club |
| `useMyTabBooktime` | `useMyTabClubBookings` |
| `ConnectedClubCard` | Show provider label (Booktime / Padeloo); connect opens correct sheet |
| `ConnectClubSheet` | Dispatch on `club.integrationType` (phone vs email OTP forms) |
| `disconnectBooktimeClub` | `disconnectClubBooking(club)` per provider |

### UX parity checklist

- [ ] Avantura appears on **Integrations** tab when user's city is Zlatibor (or when previously connected)
- [ ] Connect / disconnect Padeloo account from Integrations tab
- [ ] Upcoming Padeloo reservations on **Bookings** tab + My tab preview (max 3 cards)
- [ ] Cancel Padeloo booking from connected-clubs row (FE → Padeloo API)
- [ ] Link to game / create game from Padeloo booking card (same as Booktime)
- [ ] Update `docs/UI_TEST_PLAN.md` §H-38 / §PR-56–57 with Padeloo rows when shipped

---

## Backend modules

Thin mirror of Booktime — **no Padeloo HTTP**:

| Module | Routes |
|--------|--------|
| `padelooAuth.service.ts` | `PUT/GET/DELETE /clubs/:clubId/padeloo/auth`, `POST .../session-token` |
| `padelooSnapshot.service.ts` | `GET/PUT /clubs/:clubId/padeloo/snapshot` |
| `padelooImportCourts.service.ts` | Admin import (browser fetches `GET /Club/{id}`, POST payload) |

Extend `booktimeNoOutboundHttp.test.ts` → deny `api.padeloo.app` in `Backend/src/`.

Hardcoded `ClubIntegrationType.BOOKTIME` in `gameExternalBooking.service.ts`, `create.service.ts` → use club's `integrationType`.

---

## Admin

`Admin/modals.js`:

- `integrationType` option: `PADELOO`
- Config field: `clubId` (integer)

Import courts: browser calls Padeloo public `GET /Club/{clubId}` → map `courts[].id` → `externalCourtId`.

---

## Implementation slices (PR order)

| # | Scope | User-visible |
|---|--------|--------------|
| 1 | Prisma enum + `PadelooIntegrationConfig` parser + admin UI | Admin can tag Avantura |
| 2 | `createClubBookingProvider` registry + generic hook wrappers | None (Booktime unchanged) |
| 3 | Padeloo snapshot + public availability | Avantura slots in create-game |
| 4 | Court import (admin / script) | Courts mapped |
| 5 | Padeloo auth (email OTP + Google) + connect sheet | User can link account |
| 6 | `bookSlot` + confirm modal + game link | Full booking flow |
| 7 | Connected Clubs page: Integrations + Bookings tabs, My tab preview, `my-clubs` API | Avantura in integrations list; Padeloo bookings alongside Booktime |
| 8 | UI consolidation + intent field rename cleanup | Cleaner codebase |

Slice 3 is independently valuable before auth (public slots).

---

## Testing

| Layer | Focus |
|-------|--------|
| Unit | Config parser, slot→busy mapping, registry dispatch |
| Contract | Mock responses from `Decomp/Padeloo/api.json` |
| BE | Snapshot ingest (shared with Booktime fixture pattern) |
| Guard | No `api.padeloo.app` in `Backend/src/` |
| E2E | Avantura: view slots → connect → book → My tab + `/profile/connected-clubs` both tabs |

---

## Out of scope (v1)

- Padeloo tournaments / organizations (The Padel org profile)
- Unified `UserClubBookingAuth` table (migrate Booktime later)
- Renaming `ClubBooktimeBusySnapshot` → generic table
- Big-bang rename `components/booktime/` tree
- Backend HTTP proxy to Padeloo

---

## Key files to touch

```
Backend/prisma/schema.prisma
Frontend/shared/clubIntegration.ts
Frontend/shared/gameBooking/contracts.ts
Frontend/src/integrations/padeloo/*
Frontend/src/integrations/booking/createClubBookingProvider.ts
Frontend/src/integrations/booking/providers/PadelooClubBookingProvider.ts
Frontend/src/api/padeloo.ts
Backend/src/services/padeloo/*
Backend/src/services/padeloo/padelooMyClubs.service.ts
Backend/src/routes/booktime.routes.ts   (or booking.routes.ts — my-clubs)
Backend/src/routes/club.routes.ts
Frontend/src/pages/settings/ConnectedClubsBookingsPage.tsx
Frontend/src/components/booktime/ConnectedClubsIntegrationsTab.tsx
Frontend/src/components/booktime/ConnectedClubsBookingsTab.tsx
Frontend/src/hooks/useMyTabBooktime.ts   → useMyTabClubBookings
Backend/src/services/booking/snapshotStorage.ts   (extracted shared)
Admin/modals.js
docs/adr/ADR-006-external-booking-provider-ports.md   (add Padeloo note)
```

---

## Verify commands

```bash
# Padeloo API smoke
curl -s https://api.padeloo.app/api/App/version
curl -s https://api.padeloo.app/api/Club/2
curl -s 'https://api.padeloo.app/api/Club/2/available-slots?date=2026-07-14&durationMinutes=60'

# After integration: Bandeja club with integrationType=PADELOO, integrationConfig={"clubId":2}
# Create-game flow shows Avantura slots; book requires connected Padeloo account
```
