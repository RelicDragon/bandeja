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

BE: `/club-admin`.

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
