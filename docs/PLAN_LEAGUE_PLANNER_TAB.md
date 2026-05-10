# League Planner tab — product and UX plan

## Purpose and boundaries

**Purpose:** help a league season answer “when can this match happen?” by combining participant availability, optional venue/court windows, and fixture demand (unscheduled games).

**Non-goals (initially):** automatic scheduling solver; cross-timezone complexity beyond “store UTC, display in user TZ”; billing court reservations inside the app.

**Success:** a member opens Planner, picks a scope (me / team / group / everyone), sees a week, and in one glance understands free vs busy vs “a real league game could go here”; admins can add hard venue context without necessarily touching Profile availability.

**Placement:** add a dedicated **Planner** tab alongside general / schedule / standings / FAQ (`GameDetailsShell`). **Schedule** remains fixtures and results; **Planner** is time negotiation and capacity, not the canonical fixture list.

---

## Alignment with existing codebase

- **Tabs:** `GameDetailsShell` `activeTab` pattern; league props mirror `LeagueScheduleTab` (`leagueSeasonId`, `canEdit`, `hasFixedTeams`, groups).
- **Availability:** `User.weeklyAvailability`, `useAvailabilityEditor`, `AvailabilitySection`, `AvailabilityGrid` / `AvailabilityMobileGrid`, bucket boundaries — reuse shape and UX where possible.
- **Orientation:** `useIsLandscape()`; optional Zustand override similar to `leagueSeasonTableViewOverride` / `gameDetailsTableViewOverride` in `GameDetailsHeaderContent` for a “wide grid” when portrait on tablet.
- **Group filter:** persist per season like `getGroupFilter` / `GroupFilterDropdown` patterns.

---

## Information architecture — layers

Use chips or a small segmented control, not one overloaded grid:

| Layer | Who edits | Meaning |
|--------|-----------|---------|
| **People** | Each user (Edit on) | Soft preference: “I can play” |
| **Venue** | Admin/owner | Hard-ish: “we have a court” |
| **Matches** | Derived | “An unscheduled fixture fits here” |

Default: **People + Matches** on; **Venue** off until expanded.

---

## Top bar — filters, edit, week

1. **Scope:** All | Group | Player / Team (if `hasFixedTeams`, label **Teams**; else **Players**). Disable Group until groups exist. Persist selection per `leagueSeasonId`.
2. **Week:** compact range + prev/next + optional calendar picker. Respect `User.weekStart` (same as `AvailabilityMobileGrid`).
3. **Edit:** visible when editing **own** People layer; hidden or disabled with short copy when viewing All / Group / another participant (“You can only edit your own grid”).
4. **Venue layer edit:** restricted to admin/owner.

---

## Portrait vs landscape

| | Portrait | Landscape |
|---|----------|-----------|
| **Week nav** | Horizontal scroll chips + chevrons; “Today” chip | Same or more compact inline |
| **Grid** | **Day-at-a-time** (day carousel + hour list) **or** bucket rows like `AvailabilityMobileGrid`; avoid tiny 7×N full matrix | Seven columns + time rows; more cells visible |
| **Toolbar** | Sticky bottom: Edit, Layers, Brush (if paint mode) | Sticky top or inline with filters |
| **Sheets** | Full-height bottom sheet | Medium detent acceptable |
| **Override** | Optional “Wide grid” toggle (store next to fixture table override; optionally clear on orientation flip — match existing shell behavior) | Natural wide layout |

**Safe areas / layout:** reuse patterns from `AvailabilityMobileGrid` (`min-w-0`, fluid columns) and header `env(safe-area-inset-top)` where floating controls exist.

---

## Grid cells — states and avatars

Encode with **color + icon/pattern**, not color alone.

- **Empty / unknown** — neutral (no data from others).
- **Unavailable** — muted fill or hatch.
- **Available** — soft fill; own edits read stronger than aggregate.
- **Schedulable (fixture fit)** — **border or corner badge** (e.g. green ring) + small match icon; keep fill subtle (not “confirmed booking”).
- **Venue OK** — distinct pattern (e.g. bottom stripe) when Venue layer on.

**Avatars (All / Group):** max 2–3 faces + `+N`; tap → bottom sheet with full list. **Fixed teams:** team chip or pair stack, not four faces per cell.

**Performance:** for “All”, prefer server **aggregates** (counts); full lists on demand when user opens a cell.

---

## Tap behavior

- **Tap cell (view):** bottom sheet — time range, layer breakdown (“You: free · Venue: none · N matches possible”), participant or fixture list; admin **Set date** / **Open game**.
- **Tap cell (edit, my grid):** toggle bucket or paint (with explicit **Brush** mode so scroll does not paint).
- **Long-press:** always open detail sheet (even in edit) to inspect why a slot is “green”.

---

## Editing — mobile-first

Reuse `useAvailabilityEditor`: debounced commit, local undo-friendly state.

- Default **period buckets** on narrow screens; **hourly** behind toggle (as `AvailabilitySection`).
- **Brush mode** in toolbar or sheet.
- **Clear day / copy** via overflow menu (`AvailabilityPresets`-style).

### Data source (phasing)

- **Phase 1:** Planner reads/writes the same `weeklyAvailability` as Profile (one truth; contextual editor + aggregation).
- **Phase 2:** league-season-scoped availability JSON + merge rules vs profile.

---

## Venue / club layer (admins)

Separate from user JSON: recurring windows or explicit ranges, optional `clubId` / `courtId`.

**UX:** toggle “Show courts”; editing only for admin/owner; members see read-only stripes.

**Intersection for “schedulable”:**

`fixtureSidesFree ∧ (venueLayerOff ∨ venueHasWindow)`

So members still see possible play windows without venue data; Venue **refines** to “here”.

---

## Fixture fit (“green”) — rules

**Inputs:** unscheduled games in season (respect group filter), participant map (player vs fixed team → user ids), optional venue windows, TZ, week bounds in UTC.

**Rules to implement explicitly:**

- **Unscheduled** = no scheduled start (per existing game model).
- **Both sides** available in same bucket; for teams: **all members** vs **any** — product decision (document in code comments).
- **Double booking:** if user in multiple teams, exclude slots conflicting with another committed league game (when data exists).
- **Past** slots: never “match OK”; grey non-interactive.

**Sheet when green:** opponent names, round, **Assign time** → existing game datetime flow.

---

## Accessibility

- Collapsed one-line legend (“Free · Busy · Match OK”) with expand.
- Sensible focus order: week nav → grid → sheet actions.
- Do not rely on green alone.

---

## API sketch

- `GET /league-seasons/:id/planner?week=…&groupId=…` — aggregates + schedulable game ids per slot (or client compute only for small leagues).
- `PUT` user availability — existing profile endpoint if Phase 1.
- `CRUD` venue windows — new resource scoped to season/league.

**Realtime (optional):** invalidate when availability or game schedule changes.

---

## Delivery phases

1. Tab + week nav + read-only aggregate (All/Group) from profile availability + per-cell schedulable games.
2. Edit my grid in-tab (reuse editor + mobile grid styles).
3. Venue layer + intersection + admin CRUD.
4. Orientation override + brush, presets, large-league performance.

---

## Original feature checklist (from discovery)

- Separate tab.
- Filter: participants (players or teams if fixed teams) / group / all.
- Edit switch.
- Week selector + time cells; tiny avatars in aggregate views.
- Cells show when upcoming season games **can** be placed (e.g. green affordance); tap lists those games.
- Admins: club/court time slots; intersection with player availability for “organize here.”
- Mobile-friendly, portrait-landscape aware, friendly UX.
