# Per-Match Timer — Implementation Plan

## 1. Data Model (Backend Prisma)

Extend `Match` (not `Game`) with persistent timer state so phone + watch + web agree on the same clock.

Suggested new fields on `Match` in `Backend/prisma/schema.prisma`:

- `timerStatus` — enum `IDLE | RUNNING | PAUSED | STOPPED`
- `timerStartedAt` — `DateTime?` (wall-clock when current run started; null if IDLE/PAUSED)
- `timerPausedAt` — `DateTime?` (wall-clock when last paused)
- `timerElapsedMs` — `Int @default(0)` (accumulated ms across prior runs)
- `timerCapMinutes` — `Int?` (snapshot of `game.matchTimedCapMinutes` at start)
- `timerExpiryNotifiedAt` — `DateTime?` (dedupe cap-expiry push)
- `timerUpdatedBy` — `String?`
- `timerUpdatedAt` — `DateTime?`

**Why on `Match`:** cap already lives on `Game.matchTimedCapMinutes`; the run is per-match. Storing `timerStartedAt + timerElapsedMs` avoids tick-writes. Elapsed when `RUNNING`: `timerElapsedMs + (now - timerStartedAt)`.

Use `npx prisma migrate dev` to auto-create the migration (per workspace migration rule).

---

## 2. Backend API

New routes (e.g. under `/results` or dedicated prefix):

| Method | Path | Action |
|--------|------|--------|
| POST | `/game/:gameId/matches/:matchId/timer/start` | IDLE/STOPPED → RUNNING |
| POST | `.../timer/pause` | RUNNING → PAUSED, flush delta to `timerElapsedMs` |
| POST | `.../timer/resume` | PAUSED → RUNNING |
| POST | `.../timer/stop` | → STOPPED, flush delta |
| POST | `.../timer/reset` | → IDLE, zero elapsed |
| GET | `.../timer` | snapshot |

**Response shape:** `{ status, startedAt, pausedAt, elapsedMs, serverNow, capMinutes, expiresAt }` (`expiresAt` when RUNNING and cap set).

**Service** `matchTimer.service.ts`: transitions in a transaction, permission check aligned with results entry, emit Socket.IO `match-timer-updated`, schedule expiry (see §4).

**Cleanup:** match/round delete and finalize outcomes should reset or stop timer consistently.

---

## 3. Realtime Propagation

In `socket.service.ts`: `emitMatchTimerUpdated(gameId, matchId, snapshot, senderId?)` → room `game-${gameId}`, event `match-timer-updated` (mirror `game-results-updated` pattern).

Frontend: extend `socketService.ts` + `socketEventsStore` to update a `matchTimers` slice / engine rehydration.

---

## 4. Cap Expiry Notification (Backend)

**v1 — in-process:** `Map<matchId, NodeJS.Timeout>` on start/resume; clear on pause/stop/reset. On fire: re-read match; if still RUNNING and elapsed ≥ cap → emit socket, send push via `NotificationService` + new push builder, set `timerExpiryNotifiedAt`.

**v2 / scale-out:** on boot, `resumeSchedules()` re-arms timeouts from DB for all RUNNING matches.

Push payload e.g. `{ type: 'MATCH_TIMER_EXPIRED', gameId, matchId, capMinutes }`. Add translation keys in `translations.ts` and a notification preference (default on).

---

## 5. Frontend (React Web + Capacitor)

- **API** `api/matchTimer.ts` — wrappers for timer endpoints.
- **Engine / store** — `updateMatchTimer` in `gameResultsEngine` or parallel slice; optimistic update + reconcile.
- **Hook** `useMatchTimer.ts` — derive display from snapshot + `serverNow` offset; `setInterval`/`rAF` only when RUNNING; toast on cap crossed (dedupe ref).
- **Components** (split files under `components/matchTimer/`): `MatchTimerDisplay`, `MatchTimerControls`, `MatchTimerChip`, `index.ts`.
- **Integration:** `HorizontalMatchCard`, `MatchCard` (chip); `HorizontalScoreEntryModal` (full controls). Show when `scoringPreset` is `TIMED` or `CLASSIC_TIMED`.
- **i18n** — `matchTimer.*` in locale JSONs.
- **Offline** — queue via existing results outbox if applicable.

---

## 6. Apple Watch

- **WatchGame** — add `matchTimedCapMinutes` from API DTO.
- **Models** — `WatchMatchTimer` (Codable snapshot).
- **Service** — `MatchTimerService.swift`: REST start/pause/resume/stop/reset + GET; UserDefaults cache per matchId.
- **UI** — `MatchTimerBar.swift` in scoring views when timed preset + cap > 0.
- **Cap expiry** — `WKInterfaceDevice` haptic + optional inline banner; backend push as backup.
- **HK workout** — optionally mirror pause/resume/stop with `WorkoutManager` / `ActiveSessionManager` so workout clock and match timer stay aligned.
- **Optional** — `WCSession` `matchTimerUpdated` for lower latency from phone.

---

## 7. Rollout Order

1. Prisma + migrate dev  
2. Backend service/routes/controller + socket  
3. Push + translations + preferences + boot `resumeSchedules`  
4. Frontend API + hook + components + socket handler  
5. Watch model + service + UI + workout wiring  
6. Optional WatchConnectivity timer sync  

---

## 8. Edge Cases

- Concurrent transitions → 409 + client reconcile from socket payload  
- Cap changed on game after start → keep `timerCapMinutes` snapshot until reset  
- Match deleted → stop timer + clear scheduler  
- Server restart → re-arm from DB  
- Clock skew → always anchor to `serverNow` from API/socket  
- Push dedupe → `timerExpiryNotifiedAt`  

---

## 9. Key Files (reference)

**Backend:** `schema.prisma`, new `matchTimer.service.ts` / controller / routes, `socket.service.ts`, `notification.service.ts`, new push notification module, `server.ts`, `results.service` / outcomes finalize hooks.

**Frontend:** `api/matchTimer.ts`, `hooks/useMatchTimer.ts`, `components/matchTimer/*`, `socketService.ts`, `socketEventsStore.ts`, `gameResultsEngine.ts`, `MatchCard.tsx`, `HorizontalMatchCard.tsx`, `HorizontalScoreEntryModal.tsx`, i18n `gameResults` (or dedicated namespace).

**Watch:** `WatchGame.swift`, new `WatchMatchTimer.swift`, `MatchTimerService.swift`, `MatchTimerBar.swift`, scoring views, `WorkoutManager.swift` / `ActiveSessionManager.swift`, API `Endpoint` additions.
