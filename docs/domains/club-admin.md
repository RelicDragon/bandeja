# Club admin

Users with `clubAdminClubs` (platform admins see every club). Entry: the "My clubs" FAB above the tab bar, or **Manage** on a club page (opens that club directly). Console: `Frontend/src/clubAdmin/ClubManagementApp.tsx` under `/my-clubs/*`.

## Console (frontend)

| Route | Screen | Capability |
|-------|--------|------------|
| `/my-clubs` | Club picker (`MyClubsPage`): search, infinite list, "open now" on each club's own wall clock. One club → straight into it (replace) | member |
| `/my-clubs/:clubId` | **Today** (`ClubTodayPage`): KPIs (occupancy, booked hours, games, players; expected/collected only with `reports.revenue` and non-null values), Needs attention, Up next, 7-day occupancy chart, setup checklist | member |
| `…/schedule?date=&view=day\|week&court=&focus=` | **Schedule** (`ClubSchedulePage`): day grid courts × time, week grid one court × 7 days | `schedule.view` (edit actions `schedule.edit`) |
| `…/bookings?scope=&court=&kinds=&payment=&q=` | **Bookings** (`ClubBookingsPage`): infinite list grouped by club-local day | `bookings.view` |
| `…/reports?period=7\|30\|90\|custom&from=&to=&compare=1` | **Reports** (`ClubReportsPage`) | `reports.view` (revenue, collected KPI, payments CSV: `reports.revenue`) |
| `…/payments?from=&to=&method=` | **Payments ledger** (`ClubPaymentsPage`; tab highlight = Bookings) | `billing.collect` (STAFF included) |
| `…/club` | Club hub (`ClubHubPage`): rows per settings screen the role may open, setup checklist, View as player | any club capability |
| `…/club/profile` | **Profile** (`ClubProfilePage`) | `club.edit` |
| `…/club/hours` | **Opening hours** (`ClubHoursPage`) | `club.edit` |
| `…/club/courts` | **Courts** (`ClubCourtsPage`) | `courts.edit` |
| `…/club/pricing` | **Pricing** (`ClubPricingPage`) | `billing.configure` |
| `…/club/team` | **Team** (`ClubTeamPage`) | `team.manage` |
| `…/club/activity?group=` | **Activity** (`ClubActivityPage`) | `activity.view` |
| `…/club/reviews` | **Reviews** (`ClubReviewsPage`) | `reviews.view` |

Old paths redirect (query kept): `reservations` → `bookings`, `courts` → `club/courts`, `settings` → `club/profile`, anything unknown → Today. Club routes, hub rows and guards all come from `CLUB_PAGES` in `consoleNav.ts`.

**Shell** (`ConsoleLayout.tsx`). Phones: top bar (club switcher = avatar + name + section, or back + title on drilled pages; page actions via the `HeaderActions` portal) and a bottom tab bar Today · Schedule · Bookings · Reports · Club, filtered by capability (STAFF sees Today, Schedule, Bookings). Desktop ≥ 1024 px: left sidebar (switcher, sections, All my clubs, Back to the app) and wide content. The club switcher sheet keeps the current section when changing club. Its rows navigate through `useGuardedNavigate` (`club/guardedNavigate.ts`), so with a dirty Club form they open the same leave prompt as an in-app link. Back pops real history (`useConsoleBack`: `navigate(-1)` when the app has history, else the fallback with replace); the content animates by navigation type (POP slides back), 160 ms, none under reduced motion.

**Context.** `GET /context` gives role, capabilities, club time zone/currency and setup checklist (`useClubConsoleContextQuery`). Against an older backend (bare 404) the console derives it from the legacy club row as a full ADMIN (`queries/clubAdmin/legacyContext.ts`). Routes the role cannot use render a forbidden state, never the page. "Today" is recomputed every minute from the device instant **in the club zone** (`ClubConsoleContext`), so a console left open past midnight rolls over with the club.

**Data layer** (`Frontend/src/queries/clubAdmin/`, TanStack Query). Keys under `['clubAdmin', 'club', clubId, …]` (`keys.ts`). Every query passes its AbortSignal and never retries a 4xx. v2 endpoints fall back to legacy ones on a bare 404 and remember it (`/dashboard` → derived from today's schedule, `/bookings` → `/reservations` upcoming with client-side filters, club-scoped hold PATCH/DELETE → `/holds/:id`). Writes (`mutations.ts`): hold create/move/delete are optimistic on every cached schedule day and roll back on failure; game cancel removes the game optimistically; all invalidate schedule, bookings, dashboard and the picker (`invalidation.ts`). Errors toast the server `code` as `clubAdmin:errors.*` (`toastError.ts`); sheets close only on success. The schedule polls every 15 s (5 s while the provider snapshot loads), never while the document is hidden or a console sheet is open (`useConsoleOverlayOpen`).

**Schedule grid** (`components/clubAdmin/schedule/`). `scheduleModel.ts` is pure: rows are club wall-clock minutes from `hours` + `slotMinutes` (fallback: legacy club hours, then 08:00–23:00; overnight hours run past midnight; a closed day shows "Closed" unless something is booked), widened to cover every slot; each row's instant is computed once (DST-correct) and slots are placed by binary search, so there is no per-cell scan or `Intl` construction. Overlaps on one court sit side by side with a red outline. One scroll container: header row and time column are sticky; every vertical position is `calc(var(--ca-row-h) * row)`, including the "now" line. Kinds differ by colour **and** pattern (reserved game solid, planned dashed, block stripes `bg-stripes`, club system dots `bg-dots`, no-court amber dashed). Every free cell and booking is a labelled button; past cells are dimmed and say "past". Desktop: drag down a column to select a range. Phones: swipe the date bar to change day.

- **Block sheet** (`HoldSheets.tsx`): court, start, 60/90/120 min, reason, customer name/phone, note, repeat weekly 1–26 (v2 only). Create and move send `detectOverlap: true`; a 409 `holdOverlap` opens "This time is already taken" listing the clashes, and **Create anyway** retries with `force`.
- **Booking detail** (`BookingDetail.tsx`): sheet on phones, side rail on desktop. Game: open game, message host, release court, cancel game. Block: edit/move, remove (only this one / this and later ones for a series). Club-system bookings are read-only. Ended games and blocks lose their schedule-edit actions; the "this booking is over" note sits with the actions (below the payment section), never above it — payments stay collectable after the booking ends.
- **Cancel / release** (`CourtActionSheet.tsx`): reason chips (required), optional note, "Message the host" toggle, editable message. The preview is built on the club wall clock in the operator's language (`cancelMessage.ts`); untouched it is **not** sent and the server writes it in the host's language; once edited, the operator's text is sent verbatim.
- Sync banners (provider down, updating, no sync today, unmapped courts → Link courts, double bookings) sit above the grid.

**Bookings list.** `GET /bookings` (cursor) grouped by the club-local start date under sticky day headers; Upcoming/Past, type/court/payment chips (payment only with billing capabilities and a v2 backend), debounced search, pull to refresh; a failed page stops infinite scroll until Retry. Rows open the schedule on that date with the booking selected (`focus=`). Billing chips (Paid / Unpaid / Partly paid / Waived / Void) show wherever `billing` is present.

**Club area** (`pages/clubAdmin/Club*Page.tsx`, `components/clubAdmin/club/`, data in `queries/clubAdmin/clubArea.ts`, HTTP in `api/clubAdminClub.ts`). Profile, hours and pricing edit a local draft: a sticky save bar (Discard / Save) appears when it differs from the server, sits above the bottom tabs and rides `--keyboard-height` above the software keyboard (Capacitor `resize: none`); leaving with unsaved edits (console back, in-app links, Android back, unload) asks first (`UnsavedChangesGuard`). Client validation runs before sending; a `clubAdmin.validation` error lands on its field (`details`). Every Club write invalidates the club prefix (`invalidateAfterClubChange`), so the setup checklist, schedule columns and the picker refresh.
- **Profile**: text fields, contacts (email / `http(s)://` link / phone checked client-side like the server), amenities (contract `string[]`; `Club.amenities` is stored as `{ [key]: true }` — the shape the public club page and shipped store builds read — so `GET /profile` normalises any stored shape (legacy object, admin-panel `string[]`) and writes convert back; the legacy `PATCH /clubs/:clubId` also accepts the object) and sports chips (`aria-pressed`, at least one sport), slot length, cancellation notice, currency, policy text. Logo and photos change immediately (upload via `/media/upload/club/avatar|photo`; reorder by drag on desktop or ‹ › on phones and remove-with-confirm via `PATCH /profile { photos }`; the first photo is the cover).
- **Opening hours**: seven weekday rows (open switch, time pickers, "closes the next day" when `close <= open`), Copy Monday to all, closures (date, closed all day or special hours, note); a club never configured shows the derived hours with "Save these hours". Pure rules in `hoursModel.ts`.
- **Courts**: console order with drag / up-down reorder (optimistic `POST /courts/reorder`), add/edit sheet (`ClubAdminCourtForm`: sport, Indoor·Outdoor, type, surface, base rate in major units → `pricePerHourCents`, camera link), switch off/on; switching off first shows `GET /courts/:id/impact` ("3 future games, 5 blocks — they stay booked").
- **Pricing**: currency, per-court base rates (saved with `PATCH /courts/:id` before `PUT /pricing`), rules (label, all courts or one, weekday chips, `[from, until)` with `00:00` = midnight, price), a weekly preview resolved exactly like the quote engine (court rule beats club-wide, later start, smaller id; uncovered minutes fall back to the base rate; `pricingModel.ts`), billable block reasons (never Maintenance) and a quote tester against the **saved** prices.
- **Team**: members with role badge; tap → role picker (Admin vs Staff explained) and Remove (confirm). Add = the app's player search (`PlayerListModal`, existing members filtered out) then a role. The only admin's row is locked; the server's `lastAdmin` still toasts.
- **Activity**: infinite, grouped by club-local day, one sentence per action from `meta` (`activityModel.ts`). Group chips (bookings, courts, settings, payments, team) send the group's actions as `GET /activity?action=A,B,…`, so filtering and paging are server-side.
- **Reviews**: all-time summary (average, 5→1 distribution) + infinite list; read-only.

**Money display.** Every console amount is `*Cents` = amount × 100 in `Club.currency`, for **every** currency (RSD, JPY, … too) — format only with `formatCents(cents, currency, fmt.locale)` from `components/clubAdmin/billing/money.ts`; `useConsoleFormat` has no money formatter on purpose (the app-wide `formatPrice` uses per-currency minor units and must not read `*Cents`). Input goes through `parseMoneyInput` / `centsToInput`.

**Reports** (`ClubReportsPage`, charts in `components/clubAdmin/reports/`). Period chips 7 / 30 / 90 days or a custom club-local range, `compare=1` deltas vs the previous period of the same length; KPI row, daily trend (one metric at a time), weekday × hour heatmap, per-court and game-type bars, revenue (expected / charged / outstanding / collected, by method) with a link to the ledger when the viewer has `billing.collect`, top regulars, rating trend, CSV export (`bookings`, `players`; `payments` only with `reports.revenue`). Everything revenue is hidden without `reports.revenue`. Definitions are the server's (Reports below).

**Billing UI** (`components/clubAdmin/billing/BookingPayment.tsx`). The payment section sits in the schedule booking detail and in the payment sheet the bookings list opens: quote or live charge (amount, paid, balance, payments). With `billing.collect`: create charge (amount prefilled from the quote), **Take payment** (amount defaults to the balance, method chips, `paymentExceedsBalance` shown inline), void a payment, waive the balance, void the charge — destructive ones behind an inline confirm. Without it the section is read-only.

**Payments ledger** (`ClubPaymentsPage`, `…/payments`, `billing.collect`). Club-local date range (default today), method filter, server totals for the whole range (collected, by method; voided excluded), keyset list grouped by payment day with voided rows marked. A row opens its booking in the schedule when the viewer has `schedule.view` (a manual charge opens its day with nothing selected). Reached from the Bookings header, the Today collected KPI and Reports → revenue.

**Design.** Console tokens live in `Frontend/src/styles/club-console.css` (`bg-ca-surface`, `bg-ca-sunken`, `ca-game`, `ca-warn`, …, `bg-stripes`, `bg-dots`, `ca-skeleton`); primitives in `components/clubAdmin/console/` (Section, KpiTile, AttentionRow, EmptyState, ErrorState, SkeletonRows, FilterChips, SegmentedControl, BillingChip, `ConsoleSheet` = vaul drawer, bottom sheet above the keyboard on phones, side panel on desktop, Android back closes it). All club times go through `useConsoleFormat(timeZone)` (club zone, app locale, user 12/24 h).

**i18n.** Owned namespace `clubAdmin` (`i18n/namespaces.ts`), nested keys, 11 locales; the console reads `useTranslation('clubAdmin')`, other code borrows `t('clubAdmin:…')`. `clubAdmin:myClubs` stays top-level because agent-help pins it.

Tests: `cd Frontend && npm run test:club-admin` (grid model, DST/overnight, slot index, keys/invalidation, optimistic edits, polling, capability gating, cancel message tz + language, legacy fallbacks); e2e `Frontend/e2e/specs/club-admin/`. UI cases: [UI_TEST_PLAN §17](../UI_TEST_PLAN.md).

Courts CRUD carries `Court.isIndoor` as a two-option **Indoor · Outdoor** segmented switch (defaulting to Outdoor), and the schedule grid puts a roof icon on indoor column headers. It is a user-visible data-quality field because outdoor detection drives weather alerts — [weather.md](./weather.md).

BE: `/club-admin` (`Backend/src/routes/clubAdmin.routes.ts`). Contract: `Frontend/shared/clubAdmin/contract.ts` (types, capabilities, error codes) + `clubTime.ts` (club-local time); backend imports them as `@bandeja/shared/clubAdmin/*`.

## Roles and capabilities (server-side)

`ClubAdmin.role` is `ADMIN` or `STAFF`; a platform admin (`User.isAdmin`) acts as `ADMIN` at every club. `CLUB_ADMIN_ROLE_CAPABILITIES` maps roles to capabilities — STAFF is the front desk (`schedule.view`, `schedule.edit`, `bookings.view`, `billing.collect`); ADMIN has all of them (`club.edit`, `courts.edit`, `team.manage`, `reports.*`, `billing.configure`, `activity.view`, `reviews.view`).

Every club route runs `clubAdminContext` (resolves role, club time zone and currency once → `req.clubAdmin`) then `requireCapability(cap)` (`Backend/src/middleware/clubAdminContext.ts`). The legacy routes are guarded too: `PATCH /clubs/:clubId` → `club.edit`; courts create/patch/deactivate → `courts.edit`; holds and cancel/clear → `schedule.edit`; schedule/courts list → `schedule.view`; reservations/bookings → `bookings.view`. Non-members get 403 `clubAdmin.forbidden`; a missing capability is 403 `clubAdmin.capability`.

Errors are `ApiError` with `data: { code, details? }` (spread into the body): `clubAdmin.validation` (400, `details: [{ field, message }]`), `notFound`, `holdOverlap` (409, `details: HoldOverlapDetails`), `holdInPast`, `courtInactive`, `resultsEntered`, `entityTypeLocked`, `lastAdmin`, `alreadyMember`, `rangeTooLarge`, `chargeExists` (409), `chargeVoid` (409), `paymentExceedsBalance` (409, `details: { balanceCents }`) (`services/clubAdmin/clubAdminErrors.ts`).

## Club-local time

The club time zone is `club.city.timezone`. "Today", the schedule day, dashboard days and booking date filters are club-local calendar days (`clubDayWindowUtc`: 23 h / 25 h on DST days) — never the server's UTC date or the device date. `GET /schedule` without `date` means club-local today; a malformed date is 400.

**A game belongs to a club** when `Game.clubId`, its primary court's club, or any `GameCourt` court's club is that club (`gameBelongsToClubWhere`, `services/clubAdmin/clubAdminGameScope.ts`). Schedule, bookings, cancel, clear, impact and the club list all use it.

## Opening hours

`ClubWeeklyHours` (ISO weekday 1–7, `closed`, open/close minutes) + `ClubClosure` (club-local date, closed all day or special hours). `close <= open` runs past midnight (08:00–01:00); `00:00` close = midnight. No weekly rows → hours derive from legacy `Club.openingTime/closingTime`, else 08:00–23:00 (`configured: false`). `PUT /hours` replaces weekly rows and upcoming closures (past closures stay) and mirrors the first open weekday (from Monday) into `openingTime/closingTime` for shipped builds. One resolver for every surface: `services/clubAdmin/clubAdminHours.service.ts` (`resolveDayHours`).

## Holds

Holds are occupancy `kind: 'hold'` (`CourtOccupancyService` + `clubAdminSchedule.service.ts`). Create/update validate the label, ISO instants, `end > start`, ≤ 24 h, not entirely past (`holdInPast`) and an active court of this club (`courtInactive`). v2 additions (`services/clubAdmin/clubAdminHold.service.ts`):

- `repeatWeeks` 1–26: weekly occurrences at the same club-local wall time (DST-safe), sharing a `seriesId`.
- Overlap detection is **opt-in**: only a body with `detectOverlap: true` is checked. Then an overlap with a live game slot, another hold or a provider booking on that court → 409 `holdOverlap` with every clash, unless `force`; with a repeat, clashing weeks are skipped (`skipped[]`), all clashing → 409. Store builds post to the same path without the flag and swallow errors, so without it the hold is always created (no 409, no skipping).
- `customerName` / `customerPhone` are stored on the hold and shown only in the console (schedule, bookings) — never on occupancy blocks, which also feed player-facing availability.
- Delete is **soft** (`deletedAt`, `deletedById`); `?scope=following` deletes this and later holds of the series. Every hold read filters `deletedAt: null`.
- `POST /clubs/:clubId/holds` keeps the legacy response (the hold row) and adds `holdIds`, `seriesId`, `skipped`. Legacy `PATCH /holds/:holdId` never checks overlaps; `PATCH /clubs/:clubId/holds/:holdId` checks them only with `detectOverlap: true`.

## Cancel and clear court

Both are refused for past or unscheduled games. **Cancel** deletes the game (`GameDeleteService`, writes `CancelledGame.clubId/courtId`); refused when results are entered (`resultsEntered`) and for `LEAGUE` / `LEAGUE_SEASON` / `TOURNAMENT` fixtures (`entityTypeLocked`). **Clear court** releases the club's courts through `GameUpdateService.updateGame` with `clubAdminScope` (only `courtId`/`timeIsSet` may change; never the platform-admin bypass): this club's `GameCourt` rows and the app's links to bookings on its courts are removed and reports cleared — the provider reservation itself is never cancelled. Both DM the host unless `notifyHost: false`.

## Console v2 endpoints

All under `/api/club-admin/clubs/:clubId`.

| Endpoint | Capability | Notes |
|----------|------------|-------|
| `GET /context` | member | role, capabilities, club (tz, currency), club-local `today`, setup checklist |
| `GET /dashboard` | `schedule.view` | today's occupancy (booked court-minutes ∩ opening window / active courts × open minutes, overlaps per court counted once, MAINTENANCE holds excluded), counts, attention items, next 6 bookings, 7-day strip. Revenue KPIs only with `reports.revenue` (see Billing) |
| `GET /bookings` | `bookings.view` | keyset list over games ∪ holds ∪ snapshot slots (below) |
| `GET /schedule` | `schedule.view` | legacy + additive `date`, `timezone`, `hours`, `slotMinutes`, ordered `courts`, `maxParticipants`, hold series/customer, `billing` |
| `GET/PUT /hours` | view / `club.edit` | weekly hours + upcoming closures |
| `GET/PATCH /profile` | view / `club.edit` | `photos` are stored original URLs; PATCH only reorders/removes them (upload via `POST /media/upload/club/photo`) |
| `GET/POST /courts`, `PATCH /courts/:courtId` | view / `courts.edit` | legacy rows + `pricePerHourCents`; ordered by `sortOrder` |
| `POST /courts/reorder` | `courts.edit` | `{ courtIds }` = every club court once |
| `GET /courts/:courtId/impact` | `courts.edit` | future games/holds before deactivating |
| `POST /holds`, `PATCH/DELETE /holds/:holdId` | `schedule.edit` | see Holds |
| `GET/POST /team`, `PATCH/DELETE /team/:userId` | `team.manage` | the last ADMIN can't be removed or demoted (`lastAdmin`, rows locked); `GET /me` reads `clubAdminClubs` uncached |
| `GET /pricing`, `GET /pricing/quote` | `bookings.view` | rules, currency, billable hold labels; quote for `courtId` + instants (≤ 7 days) |
| `PUT /pricing` | `billing.configure` | replace-all (see Pricing) |
| `POST /charges`, `PATCH /charges/:chargeId` | `billing.collect` | see Billing |
| `GET /charges/:chargeId` | `bookings.view` | charge with every payment (voided ones carry `voidedAt`) |
| `POST /charges/:chargeId/payments`, `DELETE …/payments/:paymentId` | `billing.collect` | record / void a payment |
| `GET /payments` | `billing.collect` | ledger: `from`/`to` club-local (≤ 400 days), `method`, keyset `(paidAt, id)` desc, `limit` ≤ 100; voided rows listed, totals exclude them |
| `GET /reports`, `GET /reports/export.csv` | `reports.view` | see Reports; revenue needs `reports.revenue` |
| `GET /activity` | `activity.view` | `ClubActivity` keyset `(createdAt, id)` desc, `?action=` one action or a comma-separated list (each must be a `ClubActivityAction`, else 400 `validation`); actor `{ id: '', … null }` when the user is gone |
| `GET /reviews` | `reviews.view` | keyset `(createdAt, id)` desc + all-time summary (average, 1–5 distribution); a deactivated author shows as an empty person ref |

**Bookings paging.** Order is `(startTime, itemId)` ascending (`upcoming`: not yet ended) or descending (`past`); item ids are `game:<id>`, `hold:<id>`, `external:<courtId>:<start>`. The opaque cursor carries the last item's start and id; each DB source takes `limit + 1` rows after it and the merge keeps `limit`, so pages never repeat or skip. Snapshot slots load only for dates that have snapshot rows, and a provider booking linked to an app game is shown as that game. Filters: `from`/`to` (club-local, ≤ 400 days), `courtId`, `kinds`, `payment` (`ChargeStatus` or `NONE`), `q` (game name / host, hold customer / note). Legacy `/reservations` keeps its offset API but reads at most `offset + limit + 1` rows per source.

**Activity.** Every console mutation writes a `ClubActivity` row (`services/clubAdmin/clubAdminActivity.service.ts`) with short render-safe `meta`.

**Billing hooks.** Schedule/bookings `billing` summaries read live (non-VOID) `ClubCharge` rows (`clubAdminBillingSummary.service.ts`); `quoteCents` comes from the provider `clubAdminBilling.service.ts` registers on import (`setBookingQuoteProvider` → `quoteBookingRequests`: one pricing load, one game-courts query, one hold-label query per page), and the dashboard's `unpaid_past` / revenue KPIs from `setDashboardBillingProvider` (`dashboardBilling`). A hold whose label is not billable and has no charge gets `billing: null`.

## Pricing

Money is **integer cents** in `Club.currency` everywhere (`*Cents`); never floats. `ClubPriceRule`: optional `courtId` (null = every court), ISO `weekdays` (non-empty), club-local `[startMinute, endMinute)` with `0 <= start < end <= 1440` (no wrap-around rule — split it at midnight), `pricePerHourCents >= 0`, at most 200 rules. `PUT /pricing` replaces every rule, the currency and `billableHoldLabels` in one transaction (a rule keeps its id when the client sends one of this club's ids), logs `PRICING_UPDATED` and orphans cached reports. `MAINTENANCE` is dropped from `billableHoldLabels` on write and never billable on read. `Court.pricePerHour` (legacy, major units; `pricePerHourCents` in the console) stays the court's **fallback rate**.

**Quote** (`clubAdminQuote.ts`, pure, unit-tested): the booking `[start, end)` is split at every club-local day boundary and rule edge; each piece is billed for its **real elapsed minutes** (a 25 h day bills 25 h) at the rule covering its wall-clock minute. Rule choice per minute: court-specific beats club-wide, then the later `startMinute`, then the smaller id. Minutes no rule covers use the court's fallback rate; if there is none, the whole quote is **`null`** (never a partial price). Rounded to cents once, at the end. A wall-clock edge inside a spring-forward gap maps to the transition instant (`wallInstantMs`), so pieces never overlap. Bookings: a **game** is quoted per court it uses **at this club** (its `GameCourt` slots here, else its primary court if here) and summed — null if any court is unpriced or none is here; a **hold** only when its label is billable; a court-less request uses club-wide rules only.

## Billing

**Money semantics.** Every contract `*Cents` field is the amount × 100 for **every** currency (zero-decimal currencies included); the backend stores and returns it that way and the console formats it only with `formatCents` (`billing/money.ts`), never with per-currency minor-unit helpers.

`ClubCharge` = what the club expects for a booking (`source`: game / hold / manual). `POST /charges` resolves the source at this club (game via `gameBelongsToClubWhere`, live hold; `MAINTENANCE` holds → 400), stores its first club court and times, and defaults `amountCents` to the quote — no quote and no amount → 400 `validation`. **One live (non-VOID) charge per (club, game) and per hold**: checked in the transaction and guaranteed by the partial unique indexes `ClubCharge_live_game_key` / `ClubCharge_live_hold_key` (`chargeExists`). A cancelled game's charge keeps its row (FK set null) and reads back as `source.kind: 'manual'`.

Status is derived from non-voided payments — `paid >= amount` → `PAID` (a 0 charge is `PAID`), `0 < paid` → `PARTIAL`, else `UNPAID` — while `WAIVED` and `VOID` are explicit and stick (`clubAdminBillingMath.ts`). `PATCH`: `amountCents` never below what is paid (400), `description`, `status: 'WAIVED'` (forgives the balance; payments stay collected), `status: 'VOID'` only with no live payments; a VOID charge accepts no edits or payments (`chargeVoid`). Payments: `amountCents > 0` and `<=` the balance (`amount − paid`, 0 when WAIVED) → else `paymentExceedsBalance`; `method` CASH/CARD/TRANSFER/ONLINE/OTHER; `paidAt` defaults to now and may not be in the future (5 min skew); optional `payerName`, `payerUserId` (must exist), `note`. `DELETE …/payments/:id` voids (keeps the row, sets `voidedAt/voidedById`) and is idempotent. Every money mutation runs in a transaction that `SELECT … FOR UPDATE`s the charge, then writes `CHARGE_CREATED` / `CHARGE_UPDATED` / `PAYMENT_RECORDED` / `PAYMENT_VOIDED` and bumps the report cache generation.

**Dashboard.** `expectedRevenueCents` = sum of quotes of today's billable bookings by start (null when the club has no price at all); `collectedCents` = non-voided payments with `paidAt` in today's club-local window — both only with `reports.revenue`. `unpaid_past` (with `billing.collect`): bookings that started in the last 30 days and have ended whose live charge is UNPAID/PARTIAL (amount = balance) or that have a positive quote and no live charge (amount = quote); manual charges are not bookings and are not counted.

## Reports

`GET /reports?from&to&compare=1` (`clubAdminReports.service.ts`). `from`/`to` are club-local dates, inclusive, `from <= to`, at most `CLUB_REPORT_MAX_DAYS` (366) days → else `rangeTooLarge`. `compare=1` adds `previous` = the same number of days immediately before. Every metric is computed on club-local days with one query per metric family (thin interval rows for occupancy, SQL aggregates with `AT TIME ZONE` for players/revenue/reviews). Definitions — load-bearing, the UI labels depend on them:

- **Report games** = games whose start is in the period, belonging to the club (club, primary court or a court slot here), `timeIsSet`, **every `Game.status`** (`ARCHIVED` is the normal end state of a played game; cancelled games are deleted), excluding `LEAGUE_SEASON` containers.
- **Occupancy** = booked court-minutes ∩ opening windows / (active courts × open minutes). Booked = court-time of games (each `GameCourt` slot here, else the primary court; any status), live holds except `MAINTENANCE`, and stored provider snapshot slots (Booktime/Padeloo/Klikteren; only days somebody loaded exist — no backfill). Overlaps on one court count once. Opening windows come from `resolveDayHours` per date (current weekly hours + closures — weekly hours have no history) × **currently active** courts. `heatmap[weekday 0=Mon][hour]` splits each window at club-local clock hours (a past-midnight hour belongs to the next weekday; a skipped DST hour has no bucket, a repeated one is a 2 h bucket). `perCourt` (active courts in console order) and `daily` use the same math; `perCourt.games` counts report games with court-time on that court.
- **Games** `total`, `byEntityType`; `cancelled` = `CancelledGame` rows with `clubId` here and `startTime` in the period; `noShows` = PLAYING participants of report games with `noShowNotedAt`.
- **Holds** = live holds starting in the period, every label (`byLabel`).
- **Players**: `unique` = distinct `PLAYING` participants of report games; `new` = those whose **first-ever** PLAYING report game at this club starts inside the period; `returning = unique − new`.
- **Revenue** (only with `reports.revenue`; also `perCourt`/`daily` `collectedCents`): `expected` = quotes of billable bookings starting in the period (pricing as of now); `charged` = amounts of charges not VOID/WAIVED whose booking start is in the period (manual charges, or charges without a time, by `createdAt`); `outstanding` = Σ max(amount − non-voided paid, 0) over those; `collected` / `byMethod` = non-voided payments with `paidAt` in the period (also on WAIVED charges); per-court collected uses the charge's court.
- **Reviews**: count / average (2 decimals) of `ClubReview.createdAt` in the period; `ratingTrend` per week starting Monday (club-local), every week of the period, empty weeks `count: 0, averageStars: null`.
- **topRegulars**: 10 users by PLAYING report games — **public profiles only**, exactly the public club page's rule: `isActive && nameIsSet`, blocks honoured in **both** directions against the viewing admin, no contact data (person ref only).

**Cache** (`clubAdminReportsCache.ts`): Redis (process-local fallback) keyed by club + range + compare + revenue capability + tz, 10 min, 60 s when the range reaches today; keys embed a per-club generation that pricing and every billing mutation `INCR`s, so edits show at once. The cached regulars are the viewer-independent public candidate list (30); the block filter runs per request after the cache, so one admin's blocks never leak into another's report.

**Export** `GET /reports/export.csv?from&to&dataset=bookings|payments|players` (`clubAdminReportsExport.service.ts`): streamed, UTF-8 BOM, CRLF, club-local dates/times, rows read in 500-row keyset pages. Cells are RFC 4180-quoted and text starting with `= + - @`, tab or CR gets a leading `'` (formula injection), plain numbers excepted (`clubAdminCsv.ts`). `bookings` = report games + live holds in start order (hold customer name, never phone); quote/charged/paid/status columns only with `reports.revenue`. `payments` needs `reports.revenue` (403 `capability`), lists voided rows with `voided=yes`. `players` = the topRegulars rule (public profiles, blocks) with games, first game at the club, last game in the period, new flag; no contact data. Validation errors return JSON before the first byte; a failure mid-stream aborts the download.

Tests: `cd Backend && npm run test:club-admin` (HTTP-level permission holes, capabilities, hours/DST, overlap opt-in, keyset paging, last admin; quote engine, charge status, CSV escaping, report period math; charge lifecycle, duplicate charge, STAFF limits, exact report numbers on a seeded day, regulars privacy, cache invalidation, export).

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
