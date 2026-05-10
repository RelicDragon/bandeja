# Plan: Live scoring sync (web / Capacitor / watch / backend) and TV mode

## Goals

- Same capabilities as the watch app today: serve side, who serves, 15–30–40–Ad (or simple points), match timer visibility, first-serve flow.
- Persist **live** state in the DB, not only set rows, so all clients see the same in-progress match.
- Sync **web (and Capacitor mobile)**, **watch**, and **backend**; users can still enter scores the ordinary way (table / set rows).
- **Live scoring** UX on all scorer devices; optional **TV mode**: full-screen, minimal chrome, readable on a court-side display; control from phone/watch/iPad or score on iPad in TV layout.

---

## Current codebase (anchor)

- **DB:** `Match` has `metadata Json?`, timer fields (`timerStatus`, `timerStartedAt`, …). `Set` has `teamAScore` / `teamBScore` (games in set for tennis-style padel, not intra-game points).
- **Watch:** `MatchScoringViewModel` holds classic point state in memory; `saveCurrentSets()` sends `updateMatch` with teams + sets. Serve / first server / `classicPointsPlayedInGame` for deuce: **`WatchServeGuideSessionStore`** (local), not API.
- **Realtime:** Socket `game-updated` (full game); `match-timer-updated` for timer snapshots (`Frontend/src/services/socketService.ts`, `socketEventsStore`).
- **Web layout hooks:** `useIsLandscape`, table-view overrides on game details (`GameDetailsPage.tsx`).

---

## Architecture: two layers

### 1. Authoritative results layer (existing)

- `Set` rows + `updateMatch` + results status.
- Source for standings, ordinary table entry, anything that must survive refresh.

### 2. Live session layer (new)

Everything needed to render and continue **point-by-point** without inferring from set totals alone:

- Active set index (align with watch indexing).
- Mode: classic vs americano / simple points (same branching as `usesBallCapPerSetUI`, `usesTennisStyleServeGuide` on watch).
- Classic: serialised `PadelPointState`, `withinSetTieBreak`, `tieBreakA` / `tieBreakB`, `classicPointsPlayedInGame`.
- Serve hints: `firstServerTeam`, `firstServerDoublesPlayerIndex`, `serveGuideSkipped`.
- Concurrency: `revision` (integer), server `updatedAt`, optional `writerUserId`.

**Match time:** reuse existing **match timer** DB fields and APIs; do not duplicate a second clock in JSON unless product explicitly needs “wall time since X”. Live UI shows timer + same transitions as today.

---

## Persistence

**Recommendation (v1):** versioned JSON under `Match.metadata`, e.g. `metadata.liveScoring` with `v`, fields above, `revision`. Avoids many new columns; promote hot fields later if needed.

**Alternative:** dedicated `MatchLiveState` table keyed by `matchId` if you prefer strict typing and migrations.

---

## API and sync

1. **Read path:** include live blob whenever matches are returned (game detail / results payloads) so Capacitor + web hydrate like watch `load()`.

2. **Write path:** `PATCH .../matches/:matchId/live-scoring` (or sub-resource) with partial payload + `baseRevision`. Server: auth (who may score), merge, bump `revision`, validate if/when rules are ported server-side.

3. **Socket:** emit **`match-live-scoring-updated`** with `{ gameId, matchId, liveScoring }` where `liveScoring` is the full envelope (includes `revision`) or `null` after table save.

4. **When clients PATCH:** every point (debounced 200–400 ms), first-serve pick / skip, set/game boundaries (coordinate with `updateMatch` for sets — use a clear ordering or single transaction).

5. **Ordinary `updateMatch`:** when sets are edited from the table UI, **reconcile** with live blob: v1 pragmatic approach — reset incompatible live state or return a flag so clients show “live point state was reset.”

---

## Shared rules (watch + web)

- Extract **pure transition functions** into **TypeScript** for web; keep Swift on watch; lock alignment with **golden JSON fixtures** (both directions) so `scorePoint` / undo / tie-break / game-win confirm behave the same.
- Backend can start trust + revision; grow to full server-side validation.

---

## Watch changes

- Treat server live blob as source of truth on load; merge socket events by `revision`.
- Keep local cache + outbox for offline (same spirit as `ScoringOutbox`); resolve conflicts when online using `revision`.
- Stop relying on **only** `WatchServeGuideSessionStore` for cross-device serve state.

---

## Web / Capacitor: Live UX

### Surfaces

| Surface   | Goal                         | Writes                          |
|----------|------------------------------|---------------------------------|
| Ordinary | Fast set / table entry       | `updateMatch`                   |
| Live     | Point-by-point + serve/timer | PATCH live + `updateMatch` edges |
| TV       | Display (+ optional control) | Same as Live or read-only       |

Show **which mode is active** (“Live scoring on” vs “Table edit”) to reduce confusion when both exist.

### Entry points

- Prominent **“Live score”** on active match; **“Open TV mode”** (dedicated URL, e.g. `?tv=1`).
- Deep link: `/games/:id/live?matchId=...` for QR / push.

### Mobile layout

- **Portrait:** scrollable middle (teams, games, point, serve, timer); **sticky bottom** large Team A / Team B zones (thumb-safe, `safe-area-inset-bottom`).
- **Landscape (phone):** two columns for teams + tap zones; **narrow center gutter** for point + serve + timer.
- **Tablet:** widen center; optional user toggle “Court / stack” aligned with existing landscape overrides (`useIsLandscape` + optional nav-store override like table view).

### Touch

- Debounce / guard double-tap; game-win **bottom sheet** confirm (watch parity); optional haptics on Capacitor.

### Sync UX

- Connection pill (live / reconnecting / offline queue).
- Toasts for remote updates; pull-to-refresh; plain-language conflict copy + refresh.

### Ordinary vs Live

- Opening table edit while live exists: confirm **“may reset live point display”** or require **“End live session”** (pick one product rule).

---

## TV mode

- Full viewport, minimal chrome; **tap to reveal** short-lived toolbar (timer, exit, optional QR for “control from phone”).
- Typography: `clamp()`-scaled team names and game counts; high contrast default for glare.
- **Read-only TV + QR** to scorer on phone/watch is a strong default for gym TVs.
- iPad as controller: use Live layout in landscape; TV on external display is optional future work.

---

## Accessibility and i18n

- Reflow when font scales; VoiceOver order: scores → point → server → timer → actions.
- Do not encode serve by color alone (icon + text). RTL: mirror columns.

---

## Phased delivery

1. Schema/metadata shape + PATCH + socket + include in reads.
2. TS scoring core + golden tests; web Live page + orientation shells.
3. Watch: load/save/sync live blob; socket merge.
4. TV route + chromeless + QR.
5. Reconciliation polish for ordinary `updateMatch` vs live.

---

## Risks

- **Two writers:** require `revision` + user-visible merge or reload; optional “single controller” later.
- **Security:** validate live transitions server-side when integrity matters.
- **Rotate / safe-area:** one shared layout shell per variant (`portrait` | `landscape` | `tv`) to avoid jank.

---

## References (code)

- `Backend/prisma/schema.prisma` — `Match`, `Set`, timer fields.
- `Frontend/ios/.../MatchScoringViewModel.swift` — classic state, `saveCurrentSets`, local serve store.
- `Frontend/src/services/socketService.ts` — `game-updated`, `match-timer-updated`, `match-live-scoring-updated`.
- `Frontend/src/pages/GameDetailsPage.tsx` — `useIsLandscape`, table layout overrides.
- `Backend/src/services/results/matchLiveScoring.service.ts` — `PATCH` handler, revision, idempotent `clientMessageId`.
- `Backend/src/routes/results.routes.ts` — `PATCH /results/game/:gameId/matches/:matchId/live-scoring`.
- `Frontend/src/pages/GameLiveMatchPage.tsx` — `/games/:id/live` (query `matchId`, `tv=1`).

## Implemented (baseline)

- **DB:** `Match.metadata.liveScoring` envelope `{ v: 1, revision, updatedAt, writerUserId?, lastClientMessageId?, state }`.
- **API:** authenticated `PATCH` with `state`, `baseRevision`, optional `clientMessageId`; **409** with `revision` on mismatch; idempotent replay for same `clientMessageId`.
- **Socket:** `match-live-scoring-updated` `{ gameId, matchId, liveScoring }` (`liveScoring` may be `null` after table `updateMatch`).
- **Ordinary `updateMatch`:** clears `liveScoring` from match metadata and emits `liveScoring: null`.
- **Web:** `GameLiveMatchPage`, links from `HorizontalMatchCard`, wake lock hook, `useSocketEventsStore.lastMatchLiveScoringUpdated`.
- **Watch (iOS):** `Endpoint.patchMatchLiveScoring`, `APIClient.patch` (call from VM when wiring serve + classic state).

## Adjacent upgrades (backlog)

- Smarter reconnect: replay by `revision` after socket drop.
- Idempotent `opId` dedupe on server beyond `clientMessageId`.
- Full server-side transition validation (golden vectors).
- Spectator read-only token + QR for TV without login.
- Scoring lock (organiser-only) for leagues.
- Audit log of live vs table edits.
- Capacitor wake lock fallback where Screen Wake Lock unsupported.
- Load tests on `game-{id}` room fan-out.
- Watch complication / glance for active live match.
- Feature flag `VITE_MATCH_LIVE_SCORING` if you need staged rollout (currently always on for API).
