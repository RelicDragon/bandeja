# Plan: Table-type regular season (fixed-teams league)

League seasons with **fixed teams** get an optional **round-robin table** UX: one action to generate all regular rounds, a **table/matrix view** (portrait–landscape aware), fixture cells with **W/L/T** (or scores), **fire** when a match is fully scheduled, and a **detail modal** on cell tap. Scope is **fixed-teams league seasons only**.

### User story (non-technical)

Organisers of a **fixed-team** league season want to **generate every regular-season matchup in one step**, then **see a clear grid** of who plays whom, which matches are **scheduled** (with a visible “live” cue), and **tap any cell** for match details. Players and guests benefit from the same grid **read-only**. The layout must stay usable **on a phone in portrait or landscape**.

## 0. Implementation status (shipped)

| Area | Status | Notes |
|------|--------|--------|
| Batch endpoint | Done | `POST /leagues/:leagueSeasonId/rounds/full-round-robin` → `LeagueCreateService.createFullRegularRoundRobin` |
| Transaction + generation | Done | `prisma.$transaction`; `TeamForRoundGeneration.generateGamesForRound(roundId, tx)` and `createLeagueGame(..., { db })` use interactive client; `GameReadinessService.updateGameReadiness` accepts optional DB client |
| Existing rounds policy | **Stricter than §2 “games only”** | Any **`REGULAR` `LeagueRound`** for the season blocks the batch (`count > 0`). Frontend disables the CTA when any regular round exists. Delete those rounds in the UI first. |
| Mixed group sizes | Done | Same team count per group; backend + `LeagueScheduleTab` gates |
| Frontend API | Done | `leaguesApi.createFullRoundRobin` in `Frontend/src/api/leagues.ts` |
| Navigation / layout | Done | `leagueSeasonTableViewOverride`, `leagueSeasonFixtureTableEligible` in `navigationStore`; cleared on `GameDetailsPage` route `id` change; league override cleared on landscape flip in `GameDetailsShell`; header toggle in `GameDetailsHeaderContent`; full-bleed via `GameDetailsPage` `layoutLeagueFixtureTable` |
| Schedule tab | Done | `LeagueScheduleTab`: full RR card, matrix when table view + REGULAR, playoff note in table + playoff filter, `GroupFilterDropdown` + banner when “All groups” + multiple groups |
| Matrix | Done | `Frontend/src/components/GameDetails/LeagueFixtureMatrix.tsx`; pairing util `Frontend/src/utils/leagueFixtureMatrix.ts` |
| Detail UI | Done | `LeagueFixtureDetailSheet` (portal overlay); lazy `gamesApi.getById` per game; Escape + initial focus; fire + `prefers-reduced-motion` static `Flame` |
| i18n | Done | `gameDetails` fixture strings + `leagues.fullRoundRobin.*` in `en`, `es`, `ru`, `cs`, `sr` |
| QA | Done | `Backend/scripts/qa-leagueRoundGeneration.ts` section 7 asserts 4-team batch |
| Not done / deferred | — | `clientRequestId` idempotency; confirm modal before destructive batch (replaced by hard reject); dedicated focus-trap library; true bottom-sheet vs dialog split by breakpoint is simplified |

**Primary files:** `Backend/src/services/league/create.service.ts`, `Backend/src/routes/league.routes.ts`, `Backend/src/controllers/league.controller.ts`, `Backend/src/services/league/generation/TeamForRoundGeneration.ts`, `Backend/src/services/league/gameCreation.util.ts`, `Backend/src/services/game/readiness.service.ts`, `Frontend/src/store/navigationStore.ts`, `Frontend/src/pages/GameDetailsShell.tsx`, `Frontend/src/components/GameDetails/LeagueScheduleTab.tsx`, `Frontend/src/components/GameDetails/LeagueFixtureMatrix.tsx`, `Frontend/src/components/GameDetails/LeagueFixtureDetailSheet.tsx`, `Frontend/src/pages/GameDetailsPage.tsx`, `Frontend/src/components/headerContent/GameDetailsHeaderContent.tsx`.

---

## 1. Current codebase anchors

- **Round creation:** `POST /leagues/:leagueSeasonId/rounds` with `{ creationType: 'TEAM_FOR_ROUND' }` creates one `LeagueRound` and runs `TeamForRoundGeneration.generateGamesForRound` for every group (`LeagueScheduleTab`, `LeagueCreateService.handleRoundCreationType`).
- **Round-robin math:** `Backend/src/services/league/generation/fixedTeamsRoundRobin.ts` — `roundsInSingleRoundRobinCycle(n)` is `n - 1` (even `n`) or `n` (odd `n`). Pairings per round use `pairIndicesForRoundRobinSlot`.
- **Fixed-teams generation:** `TeamForRoundGeneration.generateGamesForFixedTeamsGroup` — invariants (teams with two players, optional `allowUserInMultipleTeams` overlap rules).
- **Tournament table view pattern:** `useNavigationStore` — `gameDetailsTableViewOverride`, `gameDetailsCanShowTableView`; `GameDetailsHeaderContent` uses `effectiveTableView = override ?? useIsLandscape()`; `GameDetailsPage` uses `useTableViewLayout` when `canShowTournamentTableView` (`Frontend/src/utils/gameResults.ts` — tournaments only today).
- **Landscape hook:** `Frontend/src/hooks/useIsLandscape.ts` — `resize` + `orientationchange`.
- **Fire animation:** `Frontend/src/components/AnnouncedFireIcon.tsx` (Lottie). Do **not** reuse `GameCard` premium/`ANNOUNCED`/slots logic for league cells; use an explicit rule (below).

---

## 2. Product scope and gates

- **Show** “Create all regular rounds”, table toggle, and matrix only when:
  - Season shell **`game.hasFixedTeams === true`** on the `LEAGUE_SEASON` entity (this is what `GameDetailsShell` already passes into schedule/standings tabs today), and
  - Groups exist, and
  - Each group has enough **TEAM** participants with two players (same readiness as generation).
- **League-level `hasFixedTeams`:** `Backend/src/services/game/read.service.ts` → `getLeagueSeasonInclude()` currently selects `league: { id, name }` only. If product requires an explicit cross-check with `League.hasFixedTeams`, extend that include with `hasFixedTeams: true` and gate in the UI on `game.leagueSeason?.league?.hasFixedTeams`; otherwise **season `game.hasFixedTeams` is sufficient** (it is created in line with the league).
- Optional **DB flag** on `LeagueSeason` (e.g. `regularSeasonScheduleMode`) if you need to distinguish “table RR” from ad-hoc rounds; otherwise treat as UX + batch API only.

### Roles and visibility

- **Everyone who can open the season schedule** (participants, guests per existing game visibility): show **table toggle** and **fixture matrix** when gates pass; cell tap opens **read-only** detail (or detail + “Open match” if they can navigate to the child game).
- **Create all regular rounds** (and any destructive confirm): only when **`canEdit`** / same rules as `LeagueScheduleTab` today (owner/admin on season shell). Disable with a one-line reason when not allowed.
- **Admins:** follow existing admin bypass patterns used elsewhere for league actions.

### Mixed group sizes

One global `orderIndex` / `priorRegularRounds` drives a **different** `slot % cycle` per group (`TeamForRoundGeneration`). **Decide explicitly:**

- **Recommended:** allow “full table” creation only when **every group has the same team count**; otherwise show a clear error or disable the action.
- Alternatives: `max(cycle_g)` rounds (smaller groups repeat pairings) or per-group APIs — more product/backend surface.

### Existing rounds

- **Implemented:** if **any** `REGULAR` `LeagueRound` already exists for the season, the batch endpoint returns **409** (`leagues.fullRoundRobin.regularRoundsAlreadyExist`). The schedule CTA is disabled in the same case. Organisers must **delete** those rounds in the UI before running “Create all regular rounds” (stricter than “only when rounds contain games”).

---

## 3. Backend: batch “Create table”

- **Endpoint:** `POST /leagues/:leagueSeasonId/rounds/full-round-robin` (registered **before** `POST .../rounds` in `league.routes.ts`).
- **`LeagueCreateService.createFullRegularRoundRobin`:**
  - Auth: same as `createLeagueRound` (owner/admin on season game).
  - Validate fixed teams, groups, participant invariants.
  - Compute `roundsToCreate` from `roundsInSingleRoundRobinCycle(teamCount)` (per policy for mixed sizes).
  - In a **single transaction**, loop: create `LeagueRound` (`REGULAR`) + `TeamForRoundGeneration.generateGamesForRound(round.id, tx)` (not `handleRoundCreationType`, but same effect).
  - **Rollback** on any failure; return clear API errors (`leagues.fullRoundRobin.*` message keys).
- **Idempotency:** `clientRequestId` **not** implemented (still optional / future).
- **QA:** extend `Backend/scripts/qa-leagueRoundGeneration.ts` or similar — assert round count and fixture counts per group (`n*(n-1)/2` matches per full RR cycle for even `n`).

### Atomicity and client messaging (batch create)

- **Server:** one transaction end-to-end so the client never sees “half the rounds” unless you explicitly choose a chunked design (not recommended for v1).
- **Success:** toast (existing i18n pattern) + **refetch** `getRounds` / schedule payload and clear any “creating…” loading state; optionally expand the newest round accordion if still showing list mode.
- **Failure:** single error toast from API message; no partial local state (discard optimistic updates if any).
- **Timeout / ambiguous network:** if the request errors out after the server may have committed, prefer **refetch on app focus** or a **“Refresh schedule”** affordance rather than auto-retrying the batch blindly. Optional `clientRequestId` helps support diagnose duplicates.

---

## 4. Frontend API

- `Frontend/src/api/leagues.ts`: add e.g. `createFullRoundRobin(leagueSeasonId)`.

---

## 5. Navigation, header, and page layout

- **Separate store keys:** `leagueSeasonTableViewOverride`, `leagueSeasonFixtureTableEligible` (+ setters). Tournament continues to use `gameDetailsTableViewOverride` / `gameDetailsCanShowTableView`. Cleared when season route `id` changes (`GameDetailsPage`); league override also cleared on landscape change (`GameDetailsShell`).
- **`GameDetailsHeaderContent`:** when `leagueSeasonFixtureTableEligible` (set from `LeagueScheduleTab` while schedule tab is active and gates pass), show the **Table** toggle; `effectiveLeagueFixtureTableView = leagueSeasonTableViewOverride ?? useIsLandscape()`. Tournament branch takes precedence if both flags were ever true (not expected on one screen).
- **`GameDetailsPage`:** `useTableViewLayout` is true for tournament table **or** for `layoutLeagueFixtureTable` (league season + `hasFixedTeams` + eligible + effective league table view) so the same **full-bleed** path applies.
- **Narrow portrait:** header center `absolute` cluster may collide with chat — allow **icon-only** table toggle or wrap on small widths.

---

## 6. Schedule tab UX

- **Default:** keep current accordions / round list (familiar).
- **Table mode:** swap or overlay body with matrix component when `effectiveLeagueTableView` is true.
- **CTA copy:** prefer **“Create all regular rounds”** / **“Generate full round-robin”** with a one-line subtitle (“Adds N rounds with all matches for each group”).
- **Pre-flight:** disable button with short reason (no groups, not enough teams, etc.).
- **Round type filter:** in table mode, either force **REGULAR** only or hide playoff filter with a short note.
- **Multi-group:** `GroupFilterDropdown` + persisted `groupFilterStorage`. In **table** mode with **“All groups”** selected and multiple groups, a short **banner** explains the matrix is for the **first** group; pick a group to switch (`fixtureMatrixAllGroupsNote`).

---

## 7. Matrix UI (mobile-first, portrait–landscape)

- **Frozen first column** (team identity + optional season **W/L/T**): `position: sticky; left: 0` + horizontal scroll for the grid.
- **Sticky header row** for opponent labels when vertical scroll is needed.
- **Minimum touch target** (~44px) per cell where possible; large `n` implies horizontal scroll — use edge fade or brief “scroll” hint on first visit.
- **Diagonal:** empty or muted dash; sensible `aria-label` / `aria-hidden` for decorative cells.
- **Row header:** avatars + truncated names; season aggregates in dedicated columns or sub-line under name.

### Cell states (row team vs col team, `i !== j`)

1. No fixture: **`-`** (muted).
2. Fixture exists, not fully scheduled: **`-`** (per spec).
3. **Fully scheduled:** `timeIsSet === true` and **club chosen** (`clubId` present; court optional — decide once). Show **`AnnouncedFireIcon`** at small size. Respect **`prefers-reduced-motion`** (static icon fallback).
4. **Played:** show **W/L/T** from row team’s perspective for that matchup and/or compact set score; tap opens detail.

### Double meetings

If data model allows more than one game per pair, cell shows **stack** or “+N”; modal lists all matches.

---

## 8. Detail modal / bottom sheet

- **Phone portrait:** bottom sheet (handle, ~90vh max, scroll inside).
- **Landscape / tablet:** centered dialog with max width.
- Content: teams/participants, club, court, date/time, set scores when available.
- **Lazy load:** `gamesApi.getById(gameId)` on open if list payload is thin.
- **Deep link:** primary action **Open / Edit match** → existing league game edit flow or `/games/:id`.

---

## 9. Data for the matrix

- From `leaguesApi.getRounds` (+ included games): build per group an ordered team list (align with `LeagueStandingsTab` / standings API for TEAM rows).
- Map unordered pair `(teamA, teamB)` → `Game` via `parentId === leagueSeasonId`, `leagueGroupId`, `hasFixedTeams`, and **stable team identity** (sorted player-id sig, matching backend `teamPlayerSig` / `matchupKeyFromSigs` concept). Consider a small shared util front/back or a dedicated **read** endpoint later if payloads are heavy.

---

## 10. Accessibility and polish

- Cells: `aria-label` (“Team A vs Team B, not scheduled”, “scheduled …”, “won …”).
- Modal: Escape to close; initial focus on first action button; no dedicated focus-trap library (see §0).
- Empty matrix: short copy + CTA to generate schedule.

---

## 11. Definition of done (acceptance)

- **Backend:** Batch endpoint creates the intended number of `REGULAR` rounds and games per group under the chosen mixed-size policy; validation errors are stable and localised or machine-readable; transaction rolls back on mid-loop failure.
- **Schedule tab:** “Create all regular rounds” visible only when gates + `canEdit`; disabled states show **why**; confirm path when policy requires it; success/error toasts + refetch.
- **Table view:** Toggle appears only for fixed-team season + schedule context; `effectiveTableView` matches tournament semantics; layout uses full-bleed when specified on desktop/landscape; **no collision** with tournament store keys after route changes.
- **Matrix:** Per-group selection persists; sticky first column + header row work on iOS Safari; cells meet minimum tap targets where feasible; diagonal and mirror cells (`A vs B` / `B vs A`) are consistent; **W/L/T** and fire rules match this doc.
- **Modal / sheet:** Opens from cell; shows core fields; reduced-motion path for fire; Escape + focus-on-open; primary navigation to child game where permitted (full trap optional).
- **i18n:** All new user-visible strings in locale files for supported app languages.

---

## 12. Implementation order (suggested)

1. ~~Backend batch endpoint + validation + tests/QA script.~~
2. ~~API client + `LeagueScheduleTab` CTA~~ (no separate confirm dialog — server rejects; toasts + refetch).
3. ~~Store + header toggle + `GameDetailsPage` layout integration.~~
4. ~~`LeagueFixtureMatrix` (per group) + sticky scroll behavior.~~
5. ~~Fixture detail bottom sheet/modal + `AnnouncedFireIcon` + W/L/T derivation.~~
6. ~~i18n (en + es/ru/cs/sr), edge cases (reduced motion, header icon-only on narrow).~~ — Very large `n` virtualization remains future work.

---

## 13. Risks

- Header crowding with chat + table toggle on small portrait.
- Very large `n`: may need virtualization in a later iteration.
- Stale navigation store if league and tournament share keys without clearing.
