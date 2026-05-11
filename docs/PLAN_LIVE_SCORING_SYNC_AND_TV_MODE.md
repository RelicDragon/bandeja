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

3. **Socket:** emit **`match-live-scoring-updated`** with `{ gameId, matchId, liveScoring }` where `liveScoring` is the full envelope (includes `revision`) or `null` when a table **`updateMatch` removes** an existing live session (not on every table save; see Phase 5).

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

| Surface    | Goal                         | Writes                          |
|-----------|------------------------------|---------------------------------|
| Ordinary  | Fast set / table entry       | `updateMatch`                   |
| Live      | Point-by-point + serve/timer | PATCH live + `updateMatch` edges |
| TV        | Court display (+ QR to control) | Read-only board (Phase 4)   |
| Broadcast | Stream overlay (OBS browser source) | **Never** (read-only)   |

Show **which mode is active** (“Live scoring on” vs “Table edit”) to reduce confusion when both exist.

### Entry points

- Prominent **“Live score”** on active match; **“Open TV mode”** (dedicated URL, e.g. `?tv=1`); **“Broadcast / stream overlay”** (dedicated URL — Phase 7).
- Deep link: `/games/:id/live?matchId=...` for QR / push; optional shortcut **`/games/:id/live/tv?matchId=...`** redirects to `.../live?matchId=...&tv=1`.

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
- **Shipped behaviour (Phase 5):** table `updateMatch` **preserves** live when rosters and the set grid still match the live blob; otherwise live is cleared and clients get `liveScoringCleared` + optional toast (see **Implemented (Phase 5)**).

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
4. ~~TV route + chromeless + QR.~~ **Done** — see **Implemented (Phase 4)**.
5. Reconciliation polish for ordinary `updateMatch` vs live **(implemented — see Phase 5)**.
6. Hardening, integrity, TV spectators without login, audit, native wake lock, watch complications — **implemented — see Implemented (Phase 6)**.
7. **Broadcast** (OBS-friendly overlay URL alongside live/TV) — **implemented (v1) — see Implemented (Phase 7)**; wire **spectatorToken** on broadcast URL remains a small follow-up (see Phase 7 remainder).

---

## Risks

- **Two writers:** require `revision` + user-visible merge or reload; optional “single controller” later.
- **Security:** validate live transitions server-side when integrity matters.
- **Rotate / safe-area:** one shared layout shell per variant (`portrait` | `landscape` | `tv` | `broadcast`) to avoid jank.

---

## References (code)

- `Backend/prisma/schema.prisma` — `Match`, `Set`, timer fields.
- `Frontend/ios/.../MatchScoringViewModel.swift` — classic state, `saveCurrentSets`, local serve store.
- `Frontend/src/services/socketService.ts` — `game-updated`, `match-timer-updated`, `match-live-scoring-updated`.
- `Frontend/src/pages/GameDetailsPage.tsx` — `useIsLandscape`, table layout overrides.
- `Backend/src/services/results/matchLiveScoring.service.ts` — `PATCH` handler, revision, idempotent `clientMessageId`; helpers `readMatchLiveScoringEnvelope`, `readNormalizedSetsFromLiveMetadata`, `normalizedMatchSetRowsEqual`.
- `Backend/src/services/results.service.ts` — `updateMatch` live reconcile + `liveScoringCleared` in return value.
- `Backend/src/routes/results.routes.ts` — `PATCH /results/game/:gameId/matches/:matchId/live-scoring`.
- `Backend/scripts/qa-matchLiveScoring.ts` — QA: PATCH, revision, idempotent replay, preserve vs clear on `updateMatch`.
- `Frontend/src/pages/GameLiveMatchPage.tsx` — `/games/:id/live` (query `matchId`, `tv=1`).
- `Frontend/src/services/gameResultsEngine.ts` — toast when `PUT .../matches/:id` returns `data.liveScoringCleared`.
- `Frontend/src/pages/GameLiveTvRedirect.tsx` — `/games/:id/live/tv?matchId=…` → canonical live URL with `&tv=1`.
- `Frontend/src/components/liveScoring/LiveTvToolbar.tsx` — TV toolbar (exit, timer, QR, copy).
- `Frontend/src/App.tsx` — TV + broadcast chromeless root + offline allowlist for live, TV shortcut, **broadcast**, and **live/broadcast** shortcut.
- `Frontend/src/hooks/useLiveMatchBoardState.ts` — shared load / socket / timer / revision state for live and broadcast boards.
- `Frontend/src/pages/GameBroadcastMatchPage.tsx` — read-only broadcast surface (`transparent=1`, `pill=0` query flags).
- `Frontend/src/pages/GameLiveBroadcastRedirect.tsx` — `/games/:id/live/broadcast?matchId=…` → `/games/:id/broadcast?…`.
- `Frontend/src/index.css` — `html.broadcast-transparent-root` for OBS transparent browser source.

## Implemented (baseline)

- **DB:** `Match.metadata.liveScoring` envelope `{ v: 1, revision, updatedAt, writerUserId?, lastClientMessageId?, state }`.
- **API:** authenticated `PATCH` with `state`, `baseRevision`, optional `clientMessageId`; **409** with `revision` on mismatch; idempotent replay for same `clientMessageId`.
- **Socket:** `match-live-scoring-updated` `{ gameId, matchId, liveScoring }` (`liveScoring: null` only when live was actually cleared — Phase 5).
- **Ordinary `updateMatch`:** Phase 5 reconcile (preserve vs strip); `PUT` response includes `data.liveScoringCleared` (true only when a live envelope existed and was removed).
- **Web:** `GameLiveMatchPage`, links from `HorizontalMatchCard`, wake lock hook, `useSocketEventsStore.lastMatchLiveScoringUpdated`.
- **Watch (iOS):** `Endpoint.patchMatchLiveScoring`, `APIClient.patchMatchLiveScoring` (409-aware; used from `MatchScoringViewModel`).

## Implemented (Phase 2)

- **TS scoring core:** `Frontend/src/utils/liveScoring/` with classic point transitions, undo, game-win confirm, in-set tie-break completion, simple points mode, state parsing, and display helpers.
- **Golden tests:** `Frontend/src/utils/liveScoring/core.test.ts` plus `Frontend/src/utils/liveScoring/fixtures/golden.json` cover classic point/undo, raw watch point counts, game-win confirm, deuce/advantage, tie-break finish, next-set advance, and points mode. Run with `npm run test:live-scoring`.
- **Web Live page:** `GameLiveMatchPage` now hydrates `metadata.liveScoring.state`, creates an initial state from match sets when missing, persists point actions through `PATCH live-scoring`, advances sets, and merges socket updates by revision.
- **Backend set sync:** `PATCH live-scoring` keeps `Set` rows aligned with `state.sets` in the same transaction as the live metadata update, without triggering ordinary table-edit live-state clearing.
- **Orientation shells:** `Frontend/src/components/liveScoring/` provides portrait, landscape, and TV-style score shells with large tap targets, first-server selection, sync/error copy, next-set controls, and confirmation controls.

## Implemented (Phase 3)

- **Watch live models:** `WatchLiveScoringEnvelope` / `WatchLiveScoringState` decode `Match.metadata.liveScoring` and encode PATCH payloads compatible with the web state shape.
- **Watch hydrate:** `MatchScoringViewModel.load()` applies newer live revisions on load, restoring active set, sets, classic point/deuce/advantage state, in-set tie-break counters, pending game confirmation, and serve-guide seed fields.
- **Watch save:** scoring changes, undo, next-set transitions, supplemental rows, Americano changes, first-serve flow, and explicit save now schedule a debounced live-scoring PATCH with `baseRevision`.
- **Watch merge hook:** `applyLiveScoringEnvelopeIfNewer()` ignores stale revisions and can be reused by a future socket/phone relay; current watchOS target has no direct socket client.

## Phase 3B (hardening)

- **Remote watch updates:** watch polls game results on appear then every ~4s while `MatchScoringExperience` is visible; `applyLiveScoringEnvelopeIfNewer()` merges newer `metadata.liveScoring` from the server (no watch socket client).
- **Conflict recovery:** watch `PATCH live-scoring` uses a dedicated client path that decodes `409` with `revision` and optional `liveScoring` payload, applies the server envelope or refetches results, and refreshes `liveScoringRevision` (debounced saves merge silently).
- **Mid-session watch save:** “Save set” calls `flushLiveScoringSnapshot()` (live PATCH only). Finish / review flow still uses `saveCurrentSets()` → `updateMatch` (clears live only when that payload diverges from the stored live grid or rosters; otherwise preserved).
- **Backend validation/status:** `PATCH live-scoring` runs the same normalized-set validation as `updateMatch` when `state.sets` is non-empty; refuses empty `sets` arrays for DB sync; sets game `resultsStatus` to `IN_PROGRESS` (with `calculateGameStatus`) when prior status was neither `IN_PROGRESS` nor `FINAL`. `409` responses include `liveScoring` when a current envelope exists.
- **Web conflict recovery:** on `409`, applies `liveScoring` from the error body when present, otherwise refetches results for the match without a full-page loading gate; clears the error when the body envelope is applied.

## Implemented (Phase 4)

- **TV URLs:** Primary `GET /games/:gameId/live?matchId=:matchId&tv=1`. Shortcut `GET /games/:gameId/live/tv?matchId=:matchId` (`GameLiveTvRedirect`) issues a client `Navigate` to the canonical URL with `tv=1` (same `ProtectedRoute` + auth as live).
- **Offline / no-internet gate:** `App.tsx` treats both `/games/:id/live` and `/games/:id/live/tv` as live surfaces (`isGameLiveMatchPage`) so `NoInternetScreen` does not block the TV shortcut while offline (parity with the live scorer route).
- **Chromeless shell:** When `tv=1` on `/games/:id/live`, `isGameLiveTv` uses a black full-viewport root and hides `OfflineBanner`; optional-update modal and the rest of the app tree still mount above the route.
- **Read-only board:** `LiveScoreShell` TV branch shows set / games / classic point strip only (no tap-to-score on TV).
- **Tap → toolbar:** `GameLiveMatchPage` uses `onPointerDown` to show `LiveTvToolbar` for ~4.2s (auto-hide). Toolbar: exit link to game, title, Live/Offline pill, optional match timer (HTTP + `lastMatchTimerUpdated` when `rawMatch.id === matchId`), QR (`qrcode.react`) encoding the **control** URL (same path with `tv` removed), copy with toasts.
- **Always-visible connection on TV:** When the toolbar is hidden, a small top-right pill shows Live/Offline (`pointer-events-none`, safe-area aware).
- **Wake lock:** `useWakeScreenForLiveScoring` runs for live **and** TV (`gameId` + `matchId` present).
- **i18n:** `gameDetails.liveTvExit`, `liveTvScoreOnPhone`, `liveTvCopyLink`, `liveTvPillLive`, `liveTvPillOffline` in `en` / `es` / `cs` / `ru` / `sr`; copy toasts reuse `gameDetails.linkCopied` / `copyError`.

## Implemented (Phase 5)

- **`updateMatch` reconcile:** If `readMatchLiveScoringEnvelope(metadata)` is present **and** incoming team A/B user id lists match the DB order (`TeamPlayer` ordered by `createdAt`) **and** normalized table `sets` equal `readNormalizedSetsFromLiveMetadata(metadata)` (`normalizedMatchSetRowsEqual`), **preserve** full match metadata (live `revision` unchanged). Otherwise **strip** `liveScoring` via `stripLiveScoringFromMatchMetadata` (same `Set` / team rewrite transaction as before).
- **`data.liveScoringCleared`:** On `PUT .../results/game/:gameId/matches/:matchId`, `liveScoringCleared` is **true** only when a v1 live envelope existed before the call and was removed (`hadLiveEnvelope && !preserve`). **False** when there was no live session or when live was preserved — avoids spurious `match-live-scoring-updated` with `liveScoring: null` and spurious scorer toasts.
- **Controller:** `notifyMatchLiveScoringCleared` runs only when `liveScoringCleared` is true.
- **Web:** `gameResultsEngine` toasts `gameResults.liveScoringResetByTable` when the PUT response reports `liveScoringCleared` (copy in `en` / `cs` / `es` / `ru` / `sr`).
- **QA:** `Backend/scripts/qa-matchLiveScoring.ts` covers no-live `updateMatch` (flag false), PATCH sync of `state.sets`, compatible `updateMatch` (preserve + flag false), incompatible `updateMatch` (strip + flag true).

## Implemented (Phase 6)

**Summary:** `opId` + `recentOpIds[]` idempotent dedupe on `PATCH live-scoring`; socket `onConnect` triggers HTTP resync; ignore stale `match-live-scoring-updated` when `revision` not increasing; server-side multi-step transition check using copied `liveScoringEngine` + BFS (only when both payloads look like structured live state); `MatchLiveScoringAudit` rows on live PATCH and table `updateMatch` when a live envelope existed; JWT `live_spectator` + `POST .../live-spectator-token` + public `GET /results/game/:gameId/spectator?st=`; web `/games/:id/live?spectatorToken=` without login via `GameLiveRoute`; TV mints spectator URL for third QR; spectator polling 3.5s; `@capacitor-community/keep-awake` fallback in `useWakeScreenForLiveScoring`; watch `WatchLiveActiveSnapshotStore` + `LiveActiveMatchWidget`.

- **Hardening:** max `st` length before verify + JWT clock skew tolerance; `gameId` / `matchId` payload shape checks; `opId` / `clientMessageId` trimmed alphanum + length cap; BFS caps on transition verify; spectator GET `Cache-Control: private, no-store` + `nosniff`; `refreshInFlightRef` on HTTP resync; reject oversize spectator token in hook `load()`; release native keep-awake when web `WakeLock` succeeds.

**Suggested order (historical):** `opId` + envelope fields → web reconnect pull by `revision` → server golden validation → audit writes on same paths → spectator token + routes/socket policy (**6.4**; prerequisite for **Phase 7** broadcast URL) → Capacitor wake lock fallback → watch widget + App Group.

**Not in scope / follow-ups:** dedicated Node CI job re-running `golden.json` against `liveScoringEngine` (fixtures still run in frontend `npm run test:live-scoring`); read-only socket room for spectators (HTTP polling only); organiser `GET` for audit rows.

## Phase 7: Broadcast / stream overlay

**Goal:** URL for **OBS / Streamlabs “Browser” source**: read-only scoreboard, minimal chrome, strip layout, optional transparent background—alongside Live and TV.

### Implemented (Phase 7 v1)

- **URLs:** `GET /games/:gameId/broadcast?matchId=:matchId`; shortcut `GET /games/:gameId/live/broadcast?matchId=…` → `Navigate` to canonical broadcast query (`GameLiveBroadcastRedirect`).
- **Query flags:** `transparent=1` toggles `html.broadcast-transparent-root` + transparent `App` shell; `pill=0` hides the Live/Offline pill (timer stays bottom-left when enabled).
- **`App.tsx`:** `isGameBroadcastPage`, offline allowlist with live/TV, hide `OfflineBanner` on broadcast; opaque black shell or transparent shell when `transparent=1`.
- **Data:** `useLiveMatchBoardState` shared with `GameLiveMatchPage` (results HTTP + `joinGameRoom` + `lastMatchLiveScoringUpdated` merge); **no** `useWakeScreenForLiveScoring` on broadcast.
- **UI:** `GameBroadcastMatchPage` read-only; `LiveScoreShell` + `LiveTeamPanel` **`broadcast`** layout (horizontal strip); TV toolbar second QR + **copy broadcast link** (`LiveTvToolbar` + `broadcastUrl` from `GameLiveMatchPage`); links on `HorizontalMatchCard` / `MatchCard`; i18n `liveScoreBroadcast`, `liveTvBroadcastHint`, `liveTvCopyBroadcastLink`.
- **Auth (v1):** `ProtectedRoute` — same session as rest of app (**not** OBS-friendly on a logged-out encoder until **Phase 6.4**).

### Remainder (with Phase 6 spectator)

- Public **spectatorToken** on **broadcast** URL (live/TV already mint + QR); read-only socket policy; QA for token expiry and revision.

### Ops note

- Streamers use **OBS Browser source** (or similar) with this URL; **YouTube** receives the composited output from the encoder, not an in-YouTube overlay URL.

## Adjacent upgrades (backlog)

- Scoring lock (organiser-only) for leagues.
- Load tests on `game-{id}` room fan-out.
- Feature flag `VITE_MATCH_LIVE_SCORING` if you need staged rollout (currently always on for API).
