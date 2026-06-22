# Booktime timezone — gaps & upcoming work

> **Context:** Create-game from an existing Booktime booking stored game + linked snapshot times **2 hours early** (e.g. booking 18:00–20:00 → game 16:00–18:00). My Bookings stayed correct because it reads live API data normalized once at the client boundary.
>
> **Root cause:** Double-ingest of already-normalized stored UTC (`.000Z`) through `booktimeIngestToStoredUtcIso` / `normalizeFakeOrStoredUtcIso`, which treats digit hours as Belgrade wall clock again.
>
> **Fixed (code):** Split ingest vs pass-through — see `booktimeIsoToUtcIso`, `normalizeBooktimeIngestIso`, `normalizeBooktimeWireIngestIso` in `Frontend/shared/booktime/localTime.ts` and `Backend/src/shared/booktime/`.

---

## Time model (canonical)

| Stage | Example | Handler | When |
|-------|---------|---------|------|
| **API wire** | `2026-06-15T18:00:00.000Z` (fake-Z) or `2026-06-15T18:00` (naive) | `booktimeIngestToStoredUtcIso` | **Once** at Booktime client boundary (`client.normalizeBooking`) and raw busy-slot ingest |
| **Stored UTC** | `2026-06-15T16:00:00.000Z` | `storedUtcIsoToInstant` / `booktimeIsoToUtcIso` | Everywhere after normalization — **no re-ingest** |

Display: format stored UTC in club IANA timezone (`formatBooktimeBookingWhen`, `getGameTimeDisplay`).

Regression tests: `Frontend/shared/booktime/booktimeTimezone.test.ts`, `Backend/src/shared/booktime/ingest.test.ts`.

---

## Verified in sync (post-fix)

| Surface | Path | Status |
|---------|------|--------|
| My bookings (tab + connected clubs) | `client.normalizeBooking` → `formatBooktimeBookingWhen` | OK |
| Create game → Bookings picker | `buildBookingSnapshots` (no `timeZone`) → create POST → `normalizeBooktimeIngestIso` pass-through | OK |
| Game card / details / chat time | `getGameTimeDisplay` + `game.city.timezone` | OK (if DB correct) |
| Linked bookings in game details | DB → `serializeLinkedBooking` → `BooktimeBookingRow` | OK (if DB correct) |
| Coverage badge | `evaluateLinkedBookingCoverage` → `deriveGameTimeFromBookings` with pass-through Z | OK |
| Edit game — add bookings (snapshot path) | `buildBookingSnapshots` without `timeZone` on normalized records | OK |
| Book court on create (time slots) | naive `buildBookingIsoRange` → `buildBookingSnapshots` **with** `timeZone` | OK |
| Backend busy slots | `normalizeBooktimeWireIngestIso` on raw API fake-Z | OK |

**Manual check (18:00–20:00 Belgrade booking):**

- My bookings row: `18:00 – 20:00`
- POST `/games` body: `startTime` / `bookingSnapshots[].bookingStart` = `…T16:00:00.000Z`, end = `…T18:00:00.000Z`
- Game card + linked booking row: `18:00 – 20:00`

---

## Gap A — `buildBookingSnapshots` re-ingests normalized data — **FIXED**

**File:** `Frontend/shared/gameBooking/buildBookingSnapshots.ts`

When `options.timeZone` is set, called `booktimeIngestToStoredUtcIso` on inputs that may **already** be stored UTC from `client.normalizeBooking`. Afternoon times shifted **−2h** again (`16:00Z` → `14:00Z`).

**Callers at risk:**

| Caller | Flow |
|--------|------|
| `buildLinkBookingSnapshot` | Link booking → existing game (`BooktimeLinkGameModal`, `applyLinkBookingAdds`) |
| `buildCreateGameDeepLinkParams` | “Create game” from booking row (URL `startTime` / `endTime`) |

**Not at risk:** create-game Bookings picker, edit-game snapshot PUT (no `timeZone` on normalized records).

**Fix options (pick one):**

1. **Preferred:** In `buildBookingSnapshots`, use `booktimeIsoToUtcIso` (pass-through Z) instead of `booktimeIngestToStoredUtcIso`; reserve wire ingest for naive-only inputs.
2. Omit `timeZone` when bookings come from `getUpcomingBookings` (already normalized); keep `timeZone` only for naive `buildBookingIsoRange` output.
3. Make `booktimeIngestToStoredUtcIso` idempotent for stored UTC (hard — fake-Z and stored UTC are ambiguous from digits alone).

**Fix applied:** `booktimeIsoToUtcIso` (pass-through Z, naive wire ingest). Tests in `buildBookingSnapshots.test.ts`, `linkBookingToGame.test.ts`.

---

## Gap B — Existing DB rows with wrong times — **SCRIPT READY** (prod not run)


**Symptom:** Games created **before** the pass-through fix may have `Game.startTime` / `Game.endTime` and `GameExternalBooking.bookingStart` / `bookingEnd` stored **2 hours too early**. My Bookings still shows the correct wall clock (live Booktime API).

**Tables:**

- `padelpulse."Game"` — `startTime`, `endTime`, `timeOverride`, `hasBookedCourt`
- `padelpulse."GameExternalBooking"` — `bookingStart`, `bookingEnd`, `externalBookingId`, `externalBookingProvider`

**Scope candidates:**

```sql
-- Inspect: BOOKTIME-linked games not manually time-overridden
SELECT g.id, g."startTime", g."endTime", g."timeOverride", g."createdAt",
       geb."externalBookingId", geb."bookingStart", geb."bookingEnd"
FROM padelpulse."Game" g
JOIN padelpulse."GameExternalBooking" geb ON geb."gameId" = g.id
WHERE geb."externalBookingProvider" = 'BOOKTIME'
  AND g."timeOverride" = false
  AND g."timeIsSet" = true
ORDER BY g."createdAt" DESC;
```

**Recommended fix — re-sync from Booktime API (safest):**

1. One-off script `Backend/scripts/fix-booktime-game-times.ts` (or admin-only job):
   - For each `GameExternalBooking` with `externalBookingProvider = BOOKTIME` on games where `timeOverride = false`.
   - Hydrate Booktime session / call upcoming or booking-by-id for `externalBookingId`.
   - Normalize with `booktimeIngestToStoredUtcIso` (wire ingest once).
   - If normalized `bookingStart`/`bookingEnd` differ from DB snapshot by exactly the double-shift pattern, update snapshot rows.
   - Re-derive game `startTime`/`endTime` via `deriveGameTimeFromBookings` on linked snapshots (`syncHasBookedCourtAndTimes` logic).
2. Skip games with `timeOverride = true`.
3. Log every change (game id, old/new ISO) for audit.
4. Run on dev first; then prod during low traffic.

**Heuristic SQL-only fix (faster, riskier — summer CEST only):**

Only if API refresh is impractical and volume is small. **Do not** blind `+ interval '2 hours'` on all rows — winter (CET +1) and morning slots need different handling.

```sql
-- EXAMPLE audit: rows where game time matches snapshot but both may be wrong
-- vs live Booktime — must be validated per row before UPDATE
```

Prefer API re-sync over bulk `+2h`.

**Script:** `Backend/scripts/fix-booktime-game-times.ts` — `npm run fix:booktime-game-times -- --dry-run`. API path (default) or `--heuristic-only`. Dev dry-run: 1 game scanned, 0 fixes.

**After DB fix:** Re-run manual checklist (game card = My bookings = linked booking section).

---

## Gap C — Backend uses `BOOKTIME_DEFAULT_TIMEZONE` only — **FIXED**

**Files:** `resolveClubTimezone.ts`, `create.service.ts`, `gameExternalBooking.service.ts`

Resolved `city.timezone` from club/city on create, link, put-snapshots, and patch paths. Busy-slot PUT still defaults to Belgrade (out of scope).

---

## Gap D — Display timezone defaults — **FIXED**

| Location | Issue |
|----------|--------|
| `ReservationsStrip` | `BooktimeBookingRow` without `clubTimezone` → defaults to `Europe/Belgrade` |
| `ConnectedClubsBookingsTab` / `MyTabBookingsSection` | No per-club `clubTimezone` passed to list |
| `BooktimePastBookingRow` | `timezone: null` → same default |

**Impact:** Display only (not stored times). Wrong only when club city TZ ≠ Belgrade.

**Fix:** `cityTimezone` on `/my-clubs`, `resolveBooktimeMyClubTimezone`, passed through picker, upcoming/past lists.

---

## Gap E — `booktimeIngestToStoredUtcIso` not idempotent — **HARDENED** (footgun remains)

Afternoon fake-Z vs stored UTC are ambiguous from digits alone — full idempotency impossible. JSDoc + regression tests document API-boundary-only usage. Direct wire re-ingest on afternoon `.000Z` still shifts −2h.

---

## Remaining work

| P | Task | Status |
|---|------|--------|
| P0 | Prod DB re-sync via `fix:booktime-game-times` | Script ready; dry-run prod before apply |
| P3 | Busy-slot PUT club timezone (`booktimeSnapshot.service.ts`) | Open |

---

## Related docs

- [PLAN_BOOKTIME_CREATE_GAME.md](./PLAN_BOOKTIME_CREATE_GAME.md)
- [PLAN_GAME_BOOKING_MULTI_LINK.md](./PLAN_GAME_BOOKING_MULTI_LINK.md)
- [BOOKTIME_NOVI_SAD_FINDINGS.md](./BOOKTIME_NOVI_SAD_FINDINGS.md)
