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
