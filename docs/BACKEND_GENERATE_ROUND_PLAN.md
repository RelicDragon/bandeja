# Plan: Server-side “add round” (generate round) + Watch

## Goals

- Move **all round generation** (matches, teams implied by `Team` + `TeamPlayer`, sets) to the **Backend** only. The **frontend must not** keep generation logic after migration—only call the API and render/edit results.
- Frontend (and Watch) **only trigger** creation: call a **new** route with **no generation payload** (no round/match structure in the body). The server reads authoritative state from the DB, generates the next round, persists it, and returns it for display.
- **Backward compatibility:** keep existing **`POST /results/game/:gameId/rounds`** (client-supplied round `id`, empty round shell) **unchanged** for old clients.
- **Backward compatibility (start results entry):** the **existing** way to open results entry—typically **`PUT /games/:gameId`** (or equivalent) setting **`resultsStatus: IN_PROGRESS`** without any new flag—must **not** auto-generate a first round on the server. Old clients rely on **client-side** first round + **`sync`** (or empty server state until they sync). Only the **new** dedicated start+generate API (see below) may create round 1 on the server.
- **Apple Watch:** add a **new** endpoint case and point Watch “add / generate round” flows at it; keep the old Watch path pointing at the legacy route for already-shipped binaries.
- **Start results entry:** the **first round** should be created by **server generation** at the same moment the user starts results entry (not a client-built first round + **`sync`**). **Prefer one API call** that both transitions the game into results entry (e.g. `resultsStatus: IN_PROGRESS` and related `status` / fields) **and** runs the same generate-first-round logic—fewer round trips, no intermediate “IN_PROGRESS but zero rounds” state, easier to align web and Watch.

---

## Current behavior (baseline)

### Frontend

- **`GameResultsEngine.addRound`** (`Frontend/src/services/gameResultsEngine.ts`):
  - Generates a round id locally (`cuid2`).
  - Runs **`RoundGenerator`** (`Frontend/src/services/roundGenerator.ts`), which delegates to `Frontend/src/services/predefinedResults/*`.
  - Updates Zustand + local storage.
  - **`syncToServer()`** → **`POST /results/game/:gameId/sync`** with the **full `rounds` array**.
- **`syncResults`** on the backend **deletes all** rounds/matches/teams/sets for the game and **recreates** them from the client payload (`Backend/src/services/results.service.ts`). So “add round” today is effectively **“replace entire results graph from client truth.”**

### Legacy round create

- **`POST /results/game/:gameId/rounds`** with body `{ id }` → **`createRound`** creates only an **empty** `Round` row (no matches). Not used for the main generated flow on web; **must remain** for old frontends / contracts.

### Watch

- **`Endpoint.createRound`** in `Frontend/ios/App/BandejaWatch Watch App/Services/Endpoint.swift` maps to **`/results/game/:gameId/rounds`** (POST). It may be unused in current ViewModels; **do not remove**—old builds may rely on it.
- **`startResultsEntry`** in `GameDetailViewModel` uses **`PUT` game + `syncGameResults`** with a client-built first round (`WatchResultsRoundBuilder`), not `createRound`.

---

## Match generation types (must match Prisma + app)

Prisma enum **`MatchGenerationType`** (`Backend/prisma/schema.prisma`):

`HANDMADE` | `FIXED` | `RANDOM` | `ROUND_ROBIN` | `ESCALERA` | `RATING` | `WINNERS_COURT`

Frontend switch (`Frontend/src/services/roundGenerator.ts`):

| Type | Current behavior |
|------|-------------------|
| `HANDMADE` / missing | `generateHandmadeRound` — 2p/4p presets or one empty match |
| `FIXED` | `generateFixedRound` — first round template; later rounds copy previous teams + first round’s `courtId` per index |
| `RANDOM` | `generateRandomRound` (large module: fixed teams vs dynamic, gender, courts, …) |
| `RATING` | `generateRatingRound` — **synchronous** in current frontend |
| `WINNERS_COURT` | `generateWinnersCourtRound` — **`async`** (calls **`leaguesApi.getStandings(game.parentId)`** on the client today) |
| `ESCALERA` | `generateEscaleraRound` |
| `ROUND_ROBIN` | returns **`[]`** (stub) |

**DB-aware requirement:** generator inputs must come from a **server load** of the game (participants, `fixedTeams`, `gameCourts`, scalars like `matchGenerationType`, `fixedNumberOfSets`, `genderTeams`, …) and **all existing rounds** with matches, team players, sets, courts—mapped to the same **`Round[]` / `Game`** in-memory shape the **ported** algorithms use (today that shape is defined by the frontend implementation you port from).

**`WINNERS_COURT` port note:** On the web, standings come from an **HTTP** call. On the backend, replace that with a **direct call** into the same logic the standings API uses (no self-HTTP), or you risk deadlocks, extra latency, and auth complexity inside generation.

---

## Backend: new route and service

### Route

- **`POST /results/game/:gameId/rounds/generate`** (name can vary; keep it distinct from **`/rounds`**).
- **Body:** none or `{}` — **no** client-provided round/match ids or team lineups.
- **Auth:** same as existing results mutations: **`authenticate`** + **`requireCanModifyResults`** (as for `sync`, `createRound`).
- **Response:** e.g. `{ success: true, data: { round: <RoundDTO> } }` where `RoundDTO` matches what the app needs to append (round `id`, `matches[]` with `id`, `teamA` / `teamB` user id arrays, `sets`, `courtId`, etc.). Prefer the same shape the client already builds after **`convertServerResultsToState`** (`gameResultsEngine.ts`) to avoid parallel schemas.

### Service outline (`generateAndCreateRound(gameId)` or similar)

1. **Transaction strategy**
   - Load game + existing results with includes sufficient for generation (mirror **`GameReadService.getGameById`** / `getGameInclude()` for game fields; mirror **`getGameResults`** tree for rounds → matches → teams → players → sets).
   - Map Prisma → **`Game` + `Round[]`** (same semantics as **`convertServerResultsToState`** for rounds/matches).
2. **Compute** `nextRoundNumber = existingRoundCount + 1` (or `max(roundNumber)+1` if gaps matter).
3. **Run generation** on the server only: **port** the behavior of today’s **`RoundGenerator`** + **`predefinedResults/*`** into backend modules (use the existing frontend code as the **spec / reference**). Pass `roundNumber` consistently with today’s `state.rounds.length + 1`.
4. **Persist (append-only)** inside a transaction:
   - `Round` / `Match` / etc. ids: Prisma models use **`@default(cuid())`** — omit explicit ids on create unless you need client-stable ids for migration.
   - For each match: `Match` + two `Team` + `TeamPlayer` + `Set` rows — same structure as the inner loop in **`syncResults`** (`results.service.ts`).
5. **Game row update:** mirror **`createRound`** post-create logic (`resultsStatus`, `status` via **`calculateGameStatus`**).
6. **Sockets:** emit **`emitGameResultsUpdated`** (or equivalent) like **`syncResults`** so other clients refresh.
7. **Return** the created round (re-query by id or assemble from create results).

### Edge cases

- **`ROUND_ROBIN` / empty `[]`:** define behavior explicitly: **400** “not supported”, or create round with zero matches only if UI supports it.
- **Concurrency:** two clients “add round” simultaneously—choose **row lock** / serializable transaction on `Game` or document “last writer wins” for `roundNumber`.
- **`RoundOutcome` / derived data:** **`syncResults`** deletes `roundOutcome` for the whole game before rewrite; **append-only generate must not** copy that blindly—only touch outcomes if domain rules require when structure changes.

### Legacy route (unchanged)

- **`POST /results/game/:gameId/rounds`** + validation `body.id` — **leave behavior and contract as today** for old frontends.

### Start results entry + first round (recommended: one call)

- **Today (web):** e.g. `gamesApi.update` with `resultsStatus: 'IN_PROGRESS'`, then the client eventually seeds the first round via **`initializeDefaultRound`** / **`initializePresetMatches`** + **`sync`** or local generation (`GameDetails.tsx` and `GameResultsEngine`).
- **Today (Watch):** `PUT` game + **`syncGameResults`** with **`WatchResultsRoundBuilder.firstRound`** (`GameDetailViewModel`).
- **Legacy contract (do not break):** **`PUT /games/:gameId`** (and any other **existing** “only set `IN_PROGRESS`” entrypoint) must keep **today’s semantics**: update game/results flags **only**—**no** implicit **`POST …/rounds/generate`**, no first round created by the server. Old app versions must continue to work until deprecated.
- **Target (new clients only):** one **new** **`POST`** (e.g. under **`/results/`** or namespaced clearly—**not** an unconditional change to `PUT /games/:id`) that:
  1. Validates the same permissions/readiness as “start entry” today.
  2. Sets **`resultsStatus`** (and **`Game.status`** via **`calculateGameStatus`**, etc.) to match current “start results entry” behavior.
  3. If there are **no rounds** yet, runs the **same** generation path as **`POST …/rounds/generate`** for round 1 and persists it in the **same transaction** where possible.
  4. Returns **game patch + first `round`** (or a shape the clients already use after `getGameResults`) so the UI can render without a second round-trip.
- **Alternative (two calls) for new clients:** **`PUT` game** (same as legacy, still **no** server generate) then immediately **`POST …/rounds/generate`**—acceptable if a single route is deferred; document ordering and failure rollback (avoid leaving new clients stuck with **`IN_PROGRESS`** and zero rounds if **`generate`** fails).

---

## Backend-only generation (no shared package)

- **Single source of truth:** all algorithms live under the backend (e.g. `Backend/src/services/results/generation/`). **Do not** keep a parallel implementation on the frontend for creating rounds.
- **Migration:** copy or re-implement from `Frontend/src/services/roundGenerator.ts` and `Frontend/src/services/predefinedResults/*` (plus helpers like `matchUtils`), then **remove** frontend generation used for **`addRound`**, **`initializeDefaultRound`**, and **`initializePresetMatches`** once **`POST …/rounds/generate`** and the **start results entry + first round** flow cover them.
- **No monorepo shared package** is required; it was only an optional DRY tactic. Prefer **one** codebase (backend) over a shared package unless you later need identical behavior in a non-Node client.
- **`initializeDefaultRound`** / **`initializePresetMatches`** should be **removed or reduced** once “start results entry” returns the first round: they should not re-generate on the client. If anything still runs on first paint with `IN_PROGRESS`, it should **refetch** results or merge server state only.

---

## Frontend changes

- **“Start results entry”** (`GameDetails.tsx` / related): new app versions call the **new start+generate** API (see above); **do not** change **`gamesApi.update(..., IN_PROGRESS)`** on the backend to imply generation (old clients still use that **`PUT`** alone). Then hydrate **`GameResultsEngine`** from the response or **`getGameResults`**.
- **`addRound`:** stop using **`RoundGenerator`** + **`syncResults`** for this path. Call **`POST .../rounds/generate`**, append **`data.round`** to store, expand new round, **`ResultsStorage.saveResults`**, handle **`serverProblem`** like other mutations. After migration, **delete** unused **`RoundGenerator`** / **`predefinedResults`** imports and dead code paths tied only to server-side generation.
- **`resultsApi`:** add **`generateRound(gameId)`** with no payload; add **`startResultsEntryWithGeneratedRound(gameId)`** (name TBD) for the **one-call** flow, or document the two-call fallback.
- **Manual “Sync to server”** (`syncToServer`) can remain for recovery until full sync is deprecated elsewhere.

---

## Apple Watch

### `Endpoint.swift`

- **Add** e.g. **`generateRound(gameId:)`** → **`POST`** path **`/results/game/<gameId>/rounds/generate`** (exact path must match backend).
- **Keep** **`createRound(gameId:)`** → **`POST`** **`/results/game/<gameId>/rounds`** for **backward compatibility** with old Watch builds.

### ViewModels / UI

- Any **new** “add round” / “next round” flow on Watch must use **`generateRound`** with **empty body**, parse response, then **merge** or **refetch** **`gameResults`**.
- **`startResultsEntry`:** switch to the **same one-call** start+first-round API as web (replace **`PUT` + `WatchResultsRoundBuilder` + `syncGameResults`**). If the backend ships **`POST …/rounds/generate`** before the combined start route, use **two-call** fallback with documented ordering.

---

## Verification checklist

- [ ] Every **`MatchGenerationType`** behaves like today, fed only from **DB-loaded** game + rounds.
- [ ] **`WINNERS_COURT`** async path works on Node (standings via **in-process** service, not HTTP to self).
- [ ] **Concurrent** add-round behavior defined and tested manually if no automated tests.
- [ ] **`FIXED`** uses **DB** previous round + first round courts after edits only persisted on server.
- [ ] Old **`POST /rounds`** still works without regression.
- [ ] Watch **new** path hits **`/rounds/generate`**; legacy **`createRound`** URL unchanged.
- [ ] Socket / multi-device refresh verified for web + Watch.
- [ ] **Start results entry** creates the **first round on the server** (prefer **one** API call) **only via the new route**; legacy **`PUT` game** path still **does not** generate a round.
- [ ] Old clients using **`PUT` + sync** still behave as today (no surprise first round from server).

---

## File reference index

| Area | Files |
|------|--------|
| Reference to port, then remove from FE | `Frontend/src/services/roundGenerator.ts`, `Frontend/src/services/predefinedResults/*` |
| Frontend results UI / engine | `Frontend/src/services/gameResultsEngine.ts`, `Frontend/src/pages/GameDetails.tsx` (start results entry) |
| New backend generation | `Backend/src/services/results/generation/` (suggested) |
| Frontend API | `Frontend/src/api/results.ts` |
| Backend results | `Backend/src/services/results.service.ts`, `Backend/src/routes/results.routes.ts`, `Backend/src/controllers/results.controller.ts` |
| Game shape for includes | `Backend/src/services/game/read.service.ts` (`getGameInclude`, etc.) |
| Watch | `Frontend/ios/App/BandejaWatch Watch App/Services/Endpoint.swift`, `.../ViewModels/GameDetailViewModel.swift` |
| Prisma enum | `Backend/prisma/schema.prisma` (`MatchGenerationType`) |

---

## Risks and caveats

- **Do not attach generation to legacy `PUT`:** If **`PUT /games/:id`** with **`IN_PROGRESS`** ever starts creating rounds, old binaries will get **duplicate or conflicting** rounds when they still **`sync`** their own first round. Keep generation behind **only** the new **`POST`** (or explicit new contract).
- **Mixed client fleet:** Old apps can still call **`POST …/sync`** with a full snapshot. That **replaces** all server rounds. New apps use **append-only** `…/generate`. If an old client syncs stale data after a new client added rounds, you can **lose** server rounds—mitigate with version stamps, rejecting sync when server `updatedAt` is newer, or deprecating sync for in-progress games once adoption is high enough.
- **Idempotency:** A double tap or retry on **`POST …/generate`** creates **two** rounds unless you add a client idempotency key (you said no extra body—then accept duplicate rounds on retry or use transport-level deduping only).
- **`resultsStatus === NONE`:** Prefer the **combined start+generate** route so the client never relies on ordering **`PUT` then `generate`** by hand. If you split calls, document rollback when **`generate`** fails after **`IN_PROGRESS`** is set.
- **Offline / `serverProblem`:** Today **`addRound`** updates local state then syncs. With **generate-only-on-server**, “add round” while offline either **fails** clearly or needs a **queue** (out of scope unless you add it).
- **Port fidelity:** Random and court logic can be **order-sensitive** (e.g. `gameCourts` sort). Ensure Prisma **`orderBy`** matches the frontend’s **`sort((a,b) => a.order - b.order)`** everywhere it matters.
- **RNG:** Server-side **`Math.random`** differs from old client draws for the same history; only matters if you ever need **reproducible** audits—then add a documented seed later.
- **Deleting `predefinedResults`:** Today only **`roundGenerator.ts`** imports that barrel; **`gameResultsEngine.ts`** is the only **`RoundGenerator`** caller—safe to remove those modules once the generate route covers **`addRound`**, **`initializeDefaultRound`**, and **`initializePresetMatches`**. Re-scan the repo before deleting (e.g. `test-random-generation.js` at repo root is a separate script).
- **`syncToServer`:** Keeping it for “recovery” keeps the **destructive sync** behavior alive; document who may still call it and under what conditions.

---

## Out of scope (explicit)

- **League** “create round” flows (e.g. `LeagueScheduleTab` + `leaguesApi.createRound` / `TeamForRoundGeneration`) are a **different** product surface unless you explicitly unify them later.
