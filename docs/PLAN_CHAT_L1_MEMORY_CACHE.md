# Plan: L1 in-memory chat thread cache (web, mobile browsers, Capacitor)

## Context

Inspired by a three-level messenger cache (in-memory → local DB → server), this plan adds **L1: synchronous in-memory LRU** so reopening a thread can paint before Dexie/network complete. **Dexie + sync + API remain the source of truth.**

Targets: **web app**, **mobile browsers**, **Capacitor** (same WebView + JS). No native-only dependency for L1.

## Non-goals (initial slice)

- Replacing Dexie with SQLite or changing backend sync protocol.
- Persisting L1 across process kill (volatile RAM only).
- Storing anything in L1 that is not already represented in normal in-memory `ChatMessage` handling.

## Code anchors (existing)

- **Thread key:** `chatSyncTailKey` in `Frontend/src/utils/chatSyncScope.ts` — same string as `threadScrollKey` passed to `MessageList` in `Frontend/src/pages/GameChat.tsx`.
- **Message state / bootstrap:** `Frontend/src/pages/GameChat/useGameChatMessages.ts` — `useState([])`, **`useLayoutEffect` L1 seed**, `bootstrapThread`, `paintFromDexie`, `loadMessages` (non-append), `loadMoreMessages`; uses `currentIdRef` for navigation races.
- **Thread reset on navigation:** `Frontend/src/pages/GameChat.tsx` — `useEffect` on `id` resets context / pagination / flags; **message list and `messagesRef` are reset in `useGameChatMessages`** (layout effect) so L1 can seed before paint without being wiped by the parent effect.
- **Forced reload:** `GameChat.tsx` — `useEffect` on `locationState?.forceReload` clears `hasLoadedRef` / `loadingIdRef` and calls **`deleteChatThreadMemory(threadScrollKey)`** when the key is known.
- **Initial load orchestration:** `Frontend/src/pages/GameChat/useGameChatInitialLoad.ts` — calls `bootstrapThread`; when L1 seeded, `messagesRef.current.length > 0` skips forcing `setIsInitialLoad(true)` / `setIsLoadingMessages(true)` at start of load (existing behaviour).
- **Logout:** `Frontend/src/store/authStore.ts` — `clearChatThreadMemory()` next to `clearChatLocalStores()` / sync scheduler teardown.

## Implementation status (2026)

**Module:** `Frontend/src/services/chat/chatThreadMemoryCache.ts`

- Exports: `peekChatThreadMemory`, `putChatThreadMemory`, `deleteChatThreadMemory`, `clearChatThreadMemory`, `scheduleChatThreadL1DebouncedPut`, `flushChatThreadL1DebouncedPut`.
- Caps: **120** threads, **400** messages per thread tail; **TTL 5 min** on peek (stale entries removed from map).
- Drops rows with `_optimisticId` or `_status` `SENDING` / `FAILED` before storage; shallow-clones message objects for stored tail.
- LRU via `Map` delete/re-insert on read/write; evicts oldest key when over cap.
- **Flush on thread exit:** `useGameChatMessages` `useLayoutEffect` cleanup calls `flushChatThreadL1DebouncedPut` for the previous thread key so the latest `messagesRef` is persisted before switching away; cleanup then **`seededThreadKeyRef.current = null`** so React Strict Mode remount re-runs `peek` (avoids empty list until network).
- **`loadMessages` (non-append):** if `messagesRef.current.length > 0` (e.g. L1 seed), skip forcing `setIsLoadingMessages(true)` / `setIsInitialLoad(true)` at fetch start so the UI does not flash a full reload spinner.

**Integration**

- **`useGameChatMessages`:** layout seed from `peekChatThreadMemory`; immediate `putChatThreadMemory` after Dexie paint and after non-append `loadMessages` + reconcile; debounced put after append `loadMessages`, `loadMoreMessages`, `loadMessagesBeforeMessageId`, and post–`runBackgroundReconcile` bootstrap (800 ms); `seededThreadKeyRef` skips re-seeding on same key.
- **`useGameChatSocket`:** `currentIdRef` prop; debounced L1 write after missed-message merge and after processing a non-empty socket batch.
- **`useGameChatActions`:** `putChatThreadMemory` in `handleChatTypeChange` `finally` (GAME tab switch).
- **`GameChat.tsx`:** removed `setMessages` / `messagesRef` / initial loading flags from the `id`-change effect; `forceReload` → `deleteChatThreadMemory`.
- **`authStore` `logout`:** `clearChatThreadMemory()`.

**Loading behaviour (§4):** **Option A** — on L1 hit, `isLoadingMessages` and `isInitialLoad` are set false so the main list spinner path is skipped while bootstrap still runs (`useGameChatInitialLoad` sees `messagesRef.length > 0`).

## Relation to `useChatSyncStore` / Dexie

- **L1 does not replace** `lastMessageIdByContext`, `missedMessagesByContext`, Dexie tables, or `reconcileChatThreadOpen`. Those remain authoritative for **gaps, sync, and persistence**.
- L1 only seeds **the visible message list** for first paint; all existing bootstrap / reconcile / socket flows still run afterward.

## Architecture

### 1. Module `chatThreadMemoryCache` (implemented)

- Singleton **LRU map**: thread key → snapshot.
- Thread key: **`chatSyncTailKey(contextType, contextId, gameChatType?)`** only — do not introduce a second key scheme.
- Snapshot: stored messages array + `savedAt` (implementation detail inside module).
- **Caps:** see Implementation status; evict entire thread on LRU eviction.
- **API (actual exports):** `peekChatThreadMemory`, `putChatThreadMemory`, `deleteChatThreadMemory`, `clearChatThreadMemory`, `scheduleChatThreadL1DebouncedPut`, `flushChatThreadL1DebouncedPut`.
- **LRU implementation:** ES `Map` preserves insertion order; on `get`, delete/re-insert the key to mark MRU; on eviction delete `map.keys().next().value` (oldest LRU) — same pattern as common JS LRU-on-Map articles. Alternatively a tiny tested util; behaviour must match LRU semantics.
- Avoid fragile `window` usage in module init; `Date` / in-memory only is enough for Capacitor WebView.

### 2. Snapshot immutability

- **`put` must not store live React state references:** allocate a **new array** and copy only the tail slice; prefer shallow-copied message objects or `structuredClone` on the bounded tail so later merges never mutate a cached entry.
- **`peek` returns a fresh copy** for React state, or document that consumers treat it as read-only and clone once when calling `setMessages` — avoid shared mutable arrays between cache and `messagesRef`.

### 3. When to read (sync path)

- On **thread identity change** (align with existing reset when `id` / context / game chat type changes): seed from **`peek(key)`** instead of always starting from `[]`.
- Prefer **`useLayoutEffect`** keyed by thread identity so the first paint after navigation can use cache (mobile Safari + Capacitor benefit vs `useEffect`).
- First open with no cache: unchanged (empty or existing skeleton).

### 4. Loading / skeleton behaviour (`isInitialLoad`, `isLoadingMessages`, embedded)

- Decide explicitly when `peek` **hits**:
  - **Option A — hide main spinner:** set `isLoadingMessages` / `isInitialLoad` false for the embedded vs full-screen rules already used (`isLoadingMessages && !isEmbedded`, etc.) so `MessageList` does not flash a full blocking empty state; background bootstrap still runs.
  - **Option B — keep subtle loading:** still run bootstrap immediately; optional small “syncing” affordance is product choice.
- Document the chosen option in the PR; defaults should match how `MessageList` interprets `isLoadingMessages` / `isInitialLoad` today.

### 5. When to write

- After trusted paints: e.g. **`paintFromDexie`** in `bootstrapThread`, post-merge in **`loadMessages`** (non-append), and/or after reconcile completes — pick **one primary write path per logical refresh** to avoid thrashing (or coalesce in a microtask).
- **`put`:** slice to tail window to respect caps.
- **Rule:** do not persist misleading optimistic rows; strip or exclude `QUEUED` / failed tails from L1, or only cache rows that match server persistence rules.
- **Live session / socket:** do not `put` on every socket tick. Prefer **debounced `put`** (e.g. 1–2 s after the last list mutation) and/or **`put` when leaving the route** / blur, so L1 stays fresh without hot-loop work.

### 6. Concurrency

- **Only `put` when `currentIdRef.current` matches** the `contextId` (and game `effectiveChatType` when applicable) for that write — same discipline as network paths, so a fast navigation does not write thread B’s list into thread A’s L1 key.

### 7. Staleness, invalidation, correctness

- Optional **TTL** (e.g. 3–5 minutes): if `savedAt` is older, treat **`peek` as miss for initial seed** only; still run **`bootstrapThread` / `reconcileChatThreadOpen` / sockets`** as today.
- **`locationState?.forceReload`:** invalidate L1 for that thread (`delete(key)`).
- L1 is a **display hint**; Dexie + network + merge utilities remain authoritative.

### 8. Security / lifecycle

- On **logout** or authenticated user change: **`clear()`** so another account never reads prior user’s RAM cache — wire into `authStore` `logout` next to existing chat store clears (see Code anchors).

### 9. Cross-platform notes

| Environment | L1 | L2 (Dexie) |
|-------------|----|------------|
| Desktop / mobile browsers | RAM | IndexedDB (existing) |
| Capacitor | RAM | IndexedDB in WebView (existing) |

- Private mode / IDB quota failures: existing fallbacks apply; L1 still improves **same-session** revisits.
- iOS memory termination clears L1; acceptable.
- **Embedded `GameChat` (`isEmbedded`):** use the **same** `chatSyncTailKey` / L1 behaviour unless product explicitly wants no RAM retention for embedded widgets; if skipped, document why.

### 10. React integration (avoid wrong-thread flash)

- Today: `useState([])` + async bootstrap → empty first frame.
- Options (choose one):
  - **`useLayoutEffect([threadKey])`:** `setMessages(peek(key) ?? [])`, sync `messagesRef`, align loading flags (see §4).
  - **Inner shell with `key={threadScrollKey}`** holding message state and `useState(() => peek(key) ?? [])` — clearest isolation if refactor scope allows.

### 11. Testing matrix

- Desktop: open thread → leave → return; tail visible quickly.
- Mobile Safari / Android Chrome: same flows; rotate if applicable.
- Capacitor iOS & Android: cold open, reopen thread, switch **game chat type** — separate L1 keys per `chatSyncTailKey`.
- Logout / login different user: L1 empty for new user.
- Long history: caps enforced; **load more** / older pages still correct.
- **`forceReload` navigation state:** stale L1 not shown after forced reload.
- **React Strict Mode (dev):** `put` / seed paths idempotent — no duplicate side effects if effects run twice.
- **Optional — bfcache:** mobile Safari back-forward cache may restore a frozen tree; if issues appear, consider `pageshow` / invalidation; otherwise accept same as other in-memory UI state.

## Files touched

- `Frontend/src/services/chat/chatThreadMemoryCache.ts` — new.
- `Frontend/src/pages/GameChat/useGameChatMessages.ts`
- `Frontend/src/pages/GameChat/useGameChatSocket.ts`
- `Frontend/src/pages/GameChat/useGameChatActions.ts`
- `Frontend/src/pages/GameChat.tsx`
- `Frontend/src/store/authStore.ts`

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Stale UI | TTL + always run existing reconcile/bootstrap |
| One frame of previous thread | `key={threadScrollKey}` child or strict layout-effect ordering |
| Optimistic duplicates in cache | Normalize before `put`; exclude non-server rows |
| Memory | LRU thread count + per-thread message tail cap |
| Wrong-thread write after fast navigation | `put` only when `currentIdRef` matches |
| Stale RAM after forced reload | `delete(key)` on `forceReload` |
| Mutable snapshot bugs | Immutable tail copy on `put` / `peek` contract |

## Rollout / PR checklist

- **No feature flag** (per product decision).
- [x] Logout clears L1 with existing chat teardown in `authStore`.
- [x] `forceReload` clears or bypasses L1 for that thread.
- [x] Game **chat type** switch uses distinct keys; no cross-type bleed.
- [x] Embedded (`isEmbedded`) behaviour matches §9 decision (same keys as full chat).
- [x] Loading / skeleton behaviour documented (Option A) and matches `MessageList` props.
- [ ] Manual pass: desktop + one mobile browser + Capacitor build if available.
