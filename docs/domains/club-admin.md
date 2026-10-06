# Club admin

Users with `clubAdminClubs`. FAB entry. Shell: `Frontend/src/clubAdmin/ClubManagementApp.tsx` under `/my-clubs/*`.

| Route | Page |
|-------|------|
| `/my-clubs` | Club picker (`MyClubsPage`, search, infinite) |
| `/my-clubs/:clubId` | Dashboard — today stats, conflicts |
| `/my-clubs/:clubId/schedule` | Grid: block slot (hold + reason), edit hold, cancel game on slot (optional DM preview), clear court. External sync status when integrated |
| `/my-clubs/:clubId/reservations` | Reservations infinite list |
| `/my-clubs/:clubId/courts` | Courts CRUD |
| `/my-clubs/:clubId/settings` | Cancellation notice hours, integration flags |

Holds are occupancy `kind: 'hold'` (`CourtOccupancyService` + `clubAdminSchedule.service.ts`). View-as-player modal. First-time admin coach marks.

Courts CRUD carries `Court.isIndoor` as a two-option **Indoor · Outdoor** segmented switch (defaulting to Outdoor), and the schedule grid puts a roof icon on indoor column headers. It is a user-visible data-quality field because outdoor detection drives weather alerts — [weather.md](./weather.md).

BE: `/club-admin` (`Backend/src/routes/clubAdmin.routes.ts`). Contract: `Frontend/shared/clubAdmin/contract.ts` (types, capabilities, error codes) + `clubTime.ts` (club-local time); backend imports them as `@bandeja/shared/clubAdmin/*`.

## Roles and capabilities (server-side)

`ClubAdmin.role` is `ADMIN` or `STAFF`; a platform admin (`User.isAdmin`) acts as `ADMIN` at every club. `CLUB_ADMIN_ROLE_CAPABILITIES` maps roles to capabilities — STAFF is the front desk (`schedule.view`, `schedule.edit`, `bookings.view`, `billing.collect`); ADMIN has all of them (`club.edit`, `courts.edit`, `team.manage`, `reports.*`, `billing.configure`, `activity.view`, `reviews.view`).

Every club route runs `clubAdminContext` (resolves role, club time zone and currency once → `req.clubAdmin`) then `requireCapability(cap)` (`Backend/src/middleware/clubAdminContext.ts`). The legacy routes are guarded too: `PATCH /clubs/:clubId` → `club.edit`; courts create/patch/deactivate → `courts.edit`; holds and cancel/clear → `schedule.edit`; schedule/courts list → `schedule.view`; reservations/bookings → `bookings.view`. Non-members get 403 `clubAdmin.forbidden`; a missing capability is 403 `clubAdmin.capability`.

Errors are `ApiError` with `data: { code, details? }` (spread into the body): `clubAdmin.validation` (400, `details: [{ field, message }]`), `notFound`, `holdOverlap` (409, `details: HoldOverlapDetails`), `holdInPast`, `courtInactive`, `resultsEntered`, `entityTypeLocked`, `lastAdmin`, `alreadyMember`, `rangeTooLarge` (`services/clubAdmin/clubAdminErrors.ts`).

## Club-local time

The club time zone is `club.city.timezone`. "Today", the schedule day, dashboard days and booking date filters are club-local calendar days (`clubDayWindowUtc`: 23 h / 25 h on DST days) — never the server's UTC date or the device date. `GET /schedule` without `date` means club-local today; a malformed date is 400.

**A game belongs to a club** when `Game.clubId`, its primary court's club, or any `GameCourt` court's club is that club (`gameBelongsToClubWhere`, `services/clubAdmin/clubAdminGameScope.ts`). Schedule, bookings, cancel, clear, impact and the club list all use it.

## Opening hours

`ClubWeeklyHours` (ISO weekday 1–7, `closed`, open/close minutes) + `ClubClosure` (club-local date, closed all day or special hours). `close <= open` runs past midnight (08:00–01:00); `00:00` close = midnight. No weekly rows → hours derive from legacy `Club.openingTime/closingTime`, else 08:00–23:00 (`configured: false`). `PUT /hours` replaces weekly rows and upcoming closures (past closures stay) and mirrors the first open weekday (from Monday) into `openingTime/closingTime` for shipped builds. One resolver for every surface: `services/clubAdmin/clubAdminHours.service.ts` (`resolveDayHours`).

## Holds

Holds are occupancy `kind: 'hold'` (`CourtOccupancyService` + `clubAdminSchedule.service.ts`). Create/update validate the label, ISO instants, `end > start`, ≤ 24 h, not entirely past (`holdInPast`) and an active court of this club (`courtInactive`). v2 additions (`services/clubAdmin/clubAdminHold.service.ts`):

- `repeatWeeks` 1–26: weekly occurrences at the same club-local wall time (DST-safe), sharing a `seriesId`.
- Overlap with a live game slot, another hold or a provider booking on that court → 409 `holdOverlap` with every clash, unless `force`. With a repeat, clashing weeks are skipped (`skipped[]`); all clashing → 409.
- `customerName` / `customerPhone` are stored on the hold and shown only in the console (schedule, bookings) — never on occupancy blocks, which also feed player-facing availability.
- Delete is **soft** (`deletedAt`, `deletedById`); `?scope=following` deletes this and later holds of the series. Every hold read filters `deletedAt: null`.
- `POST /clubs/:clubId/holds` keeps the legacy response (the hold row) and adds `holdIds`, `seriesId`, `skipped`. Legacy `PATCH /holds/:holdId` never checks overlaps (shipped builds never send `force`); `PATCH /clubs/:clubId/holds/:holdId` does.

## Cancel and clear court

Both are refused for past or unscheduled games. **Cancel** deletes the game (`GameDeleteService`, writes `CancelledGame.clubId/courtId`); refused when results are entered (`resultsEntered`) and for `LEAGUE` / `LEAGUE_SEASON` / `TOURNAMENT` fixtures (`entityTypeLocked`). **Clear court** releases the club's courts through `GameUpdateService.updateGame` with `clubAdminScope` (only `courtId`/`timeIsSet` may change; never the platform-admin bypass): this club's `GameCourt` rows and the app's links to bookings on its courts are removed and reports cleared — the provider reservation itself is never cancelled. Both DM the host unless `notifyHost: false`.

## Console v2 endpoints

All under `/api/club-admin/clubs/:clubId`.

| Endpoint | Capability | Notes |
|----------|------------|-------|
| `GET /context` | member | role, capabilities, club (tz, currency), club-local `today`, setup checklist |
| `GET /dashboard` | `schedule.view` | today's occupancy (booked court-minutes ∩ opening window / active courts × open minutes, overlaps per court counted once, MAINTENANCE holds excluded), counts, attention items, next 6 bookings, 7-day strip. Revenue KPIs only with `reports.revenue` (null until billing) |
| `GET /bookings` | `bookings.view` | keyset list over games ∪ holds ∪ snapshot slots (below) |
| `GET /schedule` | `schedule.view` | legacy + additive `date`, `timezone`, `hours`, `slotMinutes`, ordered `courts`, `maxParticipants`, hold series/customer, `billing` |
| `GET/PUT /hours` | view / `club.edit` | weekly hours + upcoming closures |
| `GET/PATCH /profile` | view / `club.edit` | `photos` are stored original URLs; PATCH only reorders/removes them (upload via `POST /media/upload/club/photo`) |
| `GET/POST /courts`, `PATCH /courts/:courtId` | view / `courts.edit` | legacy rows + `pricePerHourCents`; ordered by `sortOrder` |
| `POST /courts/reorder` | `courts.edit` | `{ courtIds }` = every club court once |
| `GET /courts/:courtId/impact` | `courts.edit` | future games/holds before deactivating |
| `POST /holds`, `PATCH/DELETE /holds/:holdId` | `schedule.edit` | see Holds |
| `GET/POST /team`, `PATCH/DELETE /team/:userId` | `team.manage` | the last ADMIN can't be removed or demoted (`lastAdmin`, rows locked); `GET /me` reads `clubAdminClubs` uncached |

**Bookings paging.** Order is `(startTime, itemId)` ascending (`upcoming`: not yet ended) or descending (`past`); item ids are `game:<id>`, `hold:<id>`, `external:<courtId>:<start>`. The opaque cursor carries the last item's start and id; each DB source takes `limit + 1` rows after it and the merge keeps `limit`, so pages never repeat or skip. Snapshot slots load only for dates that have snapshot rows, and a provider booking linked to an app game is shown as that game. Filters: `from`/`to` (club-local, ≤ 400 days), `courtId`, `kinds`, `payment` (`ChargeStatus` or `NONE`), `q` (game name / host, hold customer / note). Legacy `/reservations` keeps its offset API but reads at most `offset + limit + 1` rows per source.

**Activity.** Every console mutation writes a `ClubActivity` row (`services/clubAdmin/clubAdminActivity.service.ts`) with short render-safe `meta`.

**Billing hooks.** Schedule/bookings `billing` summaries read live (non-VOID) `ClubCharge` rows (`clubAdminBillingSummary.service.ts`); `quoteCents` comes from a provider the pricing module registers (`setBookingQuoteProvider`), and the dashboard's `unpaid_past` / revenue KPIs from `setDashboardBillingProvider` — both null/absent until billing lands.

Tests: `cd Backend && npm run test:club-admin` (HTTP-level permission holes, capabilities, hours/DST, overlap, keyset paging, last admin).

## The public club page

`/clubs/:id` is the only **guest-readable** club surface. It is hosted by `MainPage` as place `club`, is not wrapped in `ProtectedRoute`, and is on the offline-gate exception list in `App.tsx`. It doubles as a public landing page: a shared link from Telegram or a browser must render without an account.

That makes the payload boundary the load-bearing part of this feature. **`GET /clubs/:id` returns the raw `Club` row, including `integrationConfig`** — booking-provider credentials and venue ids (Booktime `companyId`, Padeloo `clubId`, Klikteren `venueId`, NSPadel `supabaseUrl`). The public page therefore reads from a separate router:

| Endpoint | Auth | Returns |
|----------|------|---------|
| `GET /clubs/:id/public` | `optionalAuth` | projected club + courts + review summary + hours + booking **capability** + viewer flags |
| `GET /clubs/:id/regulars` | `optionalAuth` | up to 8 public player faces, 90-day window, 10-min cache |
| `GET /clubs/:id/public-games` | `optionalAuth` | up to 10 upcoming public games at this club, as Find cards |
| `GET /clubs/:id/today-availability` | `optionalAuth` | per-court hour buckets for today + snapshot timestamp |

All four live in `Backend/src/routes/clubPublic.routes.ts`, mounted at `/api/clubs` **before** `club.routes.ts` so the parameterised `/:id` routes there cannot shadow them. Never declare a bare `/:id` in `clubPublic.routes.ts`.

**The projection is a whitelist, not a denylist.** `PUBLIC_CLUB_SELECT` / `PUBLIC_COURT_SELECT` (`services/clubPublic/clubPublic.projection.ts`) are Prisma `select` objects, so a column added to `Club` tomorrow is absent from this payload until somebody deliberately adds it. `PUBLIC_CLUB_FORBIDDEN_KEYS` / `PUBLIC_COURT_FORBIDDEN_KEYS` and `findPublicClubContractIssues()` are a **second** belt, asserted by `clubPublic.projection.test.ts`. `projectPublicClub()` is the only function allowed to produce a public club payload — nothing in `services/clubPublic/` may return a raw `Club` row. This is the same discipline as the guest-readable results projection ([results.md](./results.md)) and is recorded in [constraints.md](../product/constraints.md).

Booking is exposed as **capability only**:

```ts
booking: { available: boolean; provider: ClubIntegrationType | null }
```

`available` is `clubHasBookingIntegration()` from `@bandeja/shared/clubIntegration`, i.e. the config both exists and parses; a malformed config reports `provider: null` too, so the UI cannot offer a connect flow that would immediately fail. **The config itself never leaves the server on this path.** Because the page cannot see it, the **Book** button hands the player to the create-game wizard rather than opening `ConnectClubSheet` directly — create-game loads the full club for an authenticated user and already owns both halves (connected → provider slots, not connected → connect sheet). Do not "improve" this by shipping the config to the club page.

Viewer-dependent fields are always present and never `undefined`: `isFavorite` (a `UserFavoriteClub` row) and `isAdmin` (a `ClubAdmin` row), both `false` for guests. `isAdmin` gates the **Manage** button only — `/my-clubs` is still protected server-side, so a tampered flag buys nothing. An inactive club (`isActive: false`) is treated as missing (404, "This club isn't available") rather than rendered as a stale landing page.

### Regulars privacy

`services/clubPublic/clubPublicRegulars.service.ts` returns the eight players with the most `PLAYING` participations at the club in the last 90 days. Four rules, all load-bearing:

1. Only **public profiles** count: `isActive: true, nameIsSet: true`. There is no profile-visibility column on `User`; if one is ever added it belongs in that `where` and nowhere else.
2. Blocks are honoured in **both** directions.
3. The 10-minute cache holds the **club-level public candidate list only**. The per-viewer block filter (`applyRegularsBlockFilter`, pure and unit-tested) runs *after* the cache, so one viewer's block list can never leak into another's page. The candidate list is over-fetched 3× so a viewer with blocks still gets a full row.
4. The response carries **no play counts and no game ids**. Private games count towards the tally — the *player* is public — but nothing in the payload lets a stranger infer a private schedule.

Occupancy strip: [booking.md](./booking.md). "See all on Find" (`?clubIds=`): [home-and-find.md](./home-and-find.md).
