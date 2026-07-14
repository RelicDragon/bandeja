# ADR-004: TanStack Query v5 for frontend server state

**Status:** Accepted  
**Date:** 2026-06-08  
**Deciders:** Human review (issue #66 grill)  
**Unblocks:** #67, #68  
**Parent:** #49

## Context

The frontend has no shared server-state layer. Game list hooks (`useMyGames`, `useAvailableGames`, `usePastGames`) reimplement cache keys, loading/error state, and manual socket patching. Profile stats load via raw `useEffect` / `usersApi.getUserStats`. Chat uses a separate Dexie/L1/Zustand offline stack (#19) and must not be conflated with REST list caching.

## Decision

### 1. Library

Adopt **TanStack Query v5** (`@tanstack/react-query`). Reject a thin in-house `createResource` wrapper.

### 2. Zustand vs Query boundary

| Layer | Owns |
| ----- | ---- |
| **Query** | REST `GET` server entities: user stats, game lists, later isolated GETs |
| **Zustand** | UI/client state (`authStore`, `themeStore`, `shellNavStore`, …), `socketEventsStore` (event bus), chat Dexie/L1 stack, presence, media/upload stores |
| **Out of scope (this wave)** | `playersStore` — migrate only in a future dedicated slice |

### 3. Query key convention

```
['users', 'stats', userId, sport]
['games', 'my', userId]
['games', 'available', filterHash]
['games', 'past', userId]
```

### 4. Socket invalidation (hybrid, invalidate-first)

- Keep `socketEventsStore` as the event bus.
- Add a single `queryInvalidationBridge` wired at app init.
- Game/invite events → scoped `queryClient.invalidateQueries` on `['games', …]` keys.
- Chat/presence events → no Query invalidation.
- Add `setQueryData` optimistic patches only if scoped invalidation causes visible UX regression.

**Footnote (Find cost, epic #280 / #283–#287):** The bridge must **not** prefix-invalidate `['games']`. Invites refresh **My** only (`['games','my',userId]`). Live `game-updated` payloads **patch by game id** into My / Find caches when present; My is invalidated only when the update cannot be patched onto the My slice. Find available / upcoming are left alone unless the game id is already in those caches (patch), so busy My/room traffic does not force Fat Find refetches. Invalidate-first remains at the slice level.

Find available / upcoming caches store `{ games, meta }` (hard `take` ≤ 300, `cursor` pagination via `meta.nextCursor`). Calendar first page also carries light `meta.dayIndex` for accurate day badges without unbounded fat DTOs; selected day uses a day-scoped available query. Core list fetch does **not** await notes/weather/reactions — `GET /games/available/enrichment?ids=` merges afterward (chunked ≤100). Structural filters travel in the query string and filterHash. Prefetch inactive view + adjacent months while Find is ready (`staleTime` 30s).

**TTFP (cold Find):** when the client sends `format=card` (current web/app FE), core available/upcoming returns after slim `findMany` + card project only — notes/weather/reactions merge via `GET /games/available/enrichment?ids=` after paint. Clients that omit `format` (older store builds) keep **inline enrich** on the same routes so Find cards still show notes/weather/reactions; hard `take` ≤ 300 still applies. Explicit `enrich=true|false` overrides the default. Expected server TTFP for Find core (`format=card`) ≈ Prisma card query time; enrichment must not clear the list on failure.

### 5. Offline / stale defaults (Capacitor + web)

Wire Query `onlineManager` to existing `useNetworkStore`.

| Setting | Value |
| ------- | ----- |
| `networkMode` | `'online'` |
| `staleTime` | stats **5 min**, game lists **30 s** |
| `gcTime` | **10 min** (in-memory only; no disk persist in v1) |
| `retry` | **2** with exponential backoff; paused when offline |
| Offline UX | Show last cached data + existing `OfflineBanner`; pull-to-refresh refetches when online |
| Socket invalidation offline | Drop invalidations; `refetchOnReconnect: true` |
| Non-goals v1 | No Query persistence to IndexedDB |

### 6. Migration order

| Wave | Issue | Scope |
| ---- | ----- | ----- |
| 1 | #67 | `QueryClientProvider` bootstrap + `useUserStatsQuery` pilot |
| 2 | #68 | Games list hooks → Query + invalidation bridge |
| 3 | Future issue | Consolidate standalone `getUserStats` callers onto `useUserStatsQuery` |

### 7. Chat / Dexie compatibility

Query cache is in-memory REST only. Chat offline (Dexie, L1, outbox, sync) remains unchanged. No shared persistence layer between Query and chat.

## Consequences

- Add `@tanstack/react-query` and `@tanstack/react-query-devtools` (dev only).
- New modules: `queryClient` config, query hooks under `Frontend/src/queries/` (or equivalent), `queryInvalidationBridge`.
- #67 and #68 can proceed as AFK implementation slices.
