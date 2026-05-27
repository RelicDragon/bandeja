# Plan: Chat open / sync / composer hardening

**Symptom (mobile):** After messaging in several chats, every opened chat shows an indefinite amber spinner in the header (avatar slot). Messages from cache/Dexie look correct and incoming traffic works, but the composer is missing or unusable.

**Last updated:** 2026-05-27 (Phases 1–4 done including optional 1.6, 4.3b, 4.4; Phase 5 manual QA pending)

---

## Symptoms mapped to code

| User-visible | Mechanism | Scope |
|--------------|-----------|--------|
| Amber `Loader2` in header instead of avatar | `useChatOfflineStore.chatConnectionState === 'SYNCING'` → `headerStatusSlot` in `GameChatHeader.tsx` | **Global** — all chats |
| No message input / cannot send | `GameChatFooter` hidden while `isInitialLoad === true` on non-embedded mobile (`GameChat.tsx`) | **Per open thread** |
| Read ticks on **own** sent messages flicker on/off | `readReceipts` cleared then re-applied on merge/reload (Bug J); see Root cause 3 | **Per open thread** |
| Read ticks on own messages never update live | **Fixed (4.3)** — sync `readBatch` now patches open React via `BANDEJA_CHAT_READ_BATCH_APPLIED` | **Per open thread** |

Sending is **not** gated on `chatConnectionState`; the header spinner and missing composer are separate P0 bugs that often appear together.

### Known transient behaviour (non-goal)

| User-visible | Mechanism | Notes |
|--------------|-----------|--------|
| Title/avatar empty briefly on thread switch | `GameChat.tsx` `useLayoutEffect` on `id` clears `userChat` / `groupChannel` before `loadContext` completes | Intentional stale-header prevention; generic “Chat” title until context loads. **Not** the infinite header spinner or missing composer. |

---

## Code anchors

| Area | Path |
|------|------|
| Header spinner | `Frontend/src/pages/GameChat/GameChatHeader.tsx` — `headerStatusSlot` when `SYNCING` |
| Global connection UI state | `Frontend/src/store/chatOfflineStore.ts` |
| Banner computation | `Frontend/src/services/chat/chatOfflineBanner.ts` — `activeChatSyncPullDepth`, `refreshChatOfflineBanner` |
| Foreground bulk sync | `Frontend/src/services/chat/chatSyncService.ts` — `syncAllContexts`, `syncInProgress` |
| App resume sync | `Frontend/src/services/appLifecycle.service.ts` — `runForegroundSync` |
| Socket rejoin sync | `Frontend/src/services/socketService.ts` — `rejoinActiveChatRooms` |
| Per-thread pull queue | `Frontend/src/services/chat/chatSyncScheduler.ts` — `chatSyncPullStarted` / `chatSyncPullEnded` |
| Gap-fill pulls | `Frontend/src/services/chat/chatLocalApplySocketInbound.ts` |
| Footer visibility | `Frontend/src/pages/GameChat.tsx` — `isInitialLoad` guard around `GameChatFooter` |
| L1 seed / initial load | `Frontend/src/pages/GameChat/useGameChatMessages.ts` |
| Open reconcile | `Frontend/src/services/chat/chatOpenReconcile.ts` — `isOpenSyncing` |
| Initial load orchestration | `Frontend/src/pages/GameChat/useGameChatInitialLoad.ts` |
| Context load | `Frontend/src/pages/GameChat/useGameChatContext.ts` |
| Related prior work | `docs/PLAN_CHAT_L1_MEMORY_CACHE.md`, `docs/PLAN_CHAT_OUTBOX_SEND_NEXT_STEPS.md` |
| Read ticks UI | `Frontend/src/components/MessageItem/MessageBubble.tsx` — `tickRead` |
| Message merge | `Frontend/src/utils/chatMessageSort.ts` — `mergeChatMessagesAscending`, `shouldPreferIncomingMessage` |
| Read receipt handler | `Frontend/src/pages/GameChat/useGameChatReactions.ts` — `handleReadReceipt` |
| Socket read events | `Frontend/src/pages/GameChat/useGameChatSocket.ts` — `readReceipt`, skips `allRead` |
| Sync read batches | `Frontend/src/services/chat/chatSyncApplyPatches.ts` — `readBatch` (Dexie only) |
| Receipt merge helper | `Frontend/src/services/chat/chatSyncEventsToPatches.ts` — `mergeReadReceiptSync` |
| Mark-read coordinator | `Frontend/src/services/chat/unreadCoordinator.ts` |
| Unread architecture | `docs/unread-counts-architecture.md` |

---

## Investigation summary (A–L)

| ID | Verdict | Priority | Action |
|----|---------|----------|--------|
| **A** | **Done (Phase 1)** — 28s bounded `syncAllContexts`, generation mutex, rejoin skip, banner refresh on `syncInProgress` | **P0** | — |
| **B** | **Done (with A)** — foreground skip recovers once bounded `finally` clears flag | **P0** (with A) | Compounding factor only; not separate root cause |
| **C** | Real overlap (rejoin vs foreground) — cosmetic/duplicate work only; does **not** cause stuck `SYNCING` | — | Merge into Phase 1.2/1.3 under A; no standalone bug |
| **D** | NOT a pairing leak; hung pull = same class as A | — | Remove dedicated bug; optional hardening only if `SYNCING` persists with `syncInProgress === false` after Phase 1 |
| **E** | **Done (Phase 2.1)** — L1 seed now sets `isInitialLoad=false` with `isLoadingMessages=false` | **P0** | — |
| **F** | **Done (Phase 2.2–2.4)** — `paintOpenSnapshot` clears `isInitialLoad` without scroll-ready gate; L1 path skips `isInitialLoad=true` when peek non-empty | **P0** | — |
| **G** | Intentional stale-header prevention on `id` change; transient generic title | — | Non-goal (see table above); not spinner/composer |
| **H** | **Done (Phase 3.1)** — `isOpenSyncing` leak on navigate away mid-reconcile | **P1** | — |
| **I** | **Done (Phase 3.2–3.3)** — own `finally` clears `isLoadingContext`; `userChatRef` + in-flight early-return only when `hasLoadedRef` | **P1** | — |
| **J** | **Done** (4.1, 4.2, 4.5) — `mergeChatMessagesAscending` merges `readReceipts` via `mergeReadReceiptSync`; tie keeps existing (`<` not `<=`) | **P0/P1** | — |
| **K** | **Done** (4.3) — `BANDEJA_CHAT_READ_BATCH_APPLIED` patches open React after Dexie `readBatch` | **P0** | Optional: `allRead` socket / 4.3b seq audit |
| **L** | **Done** (4.6/4.7) — client confirmed mark-read skip; server no-op when unread already 0 | **P1** | — |

---

## Root cause 1 — Global `SYNCING` never returns to `ONLINE`

### How `SYNCING` is computed

```ts
// chatOfflineBanner.ts — computeDesiredChatConnectionState()
if (activeChatSyncPullDepth > 0 || useChatSyncStore.getState().syncInProgress) return 'SYNCING';
return 'ONLINE';
```

`refreshChatOfflineBanner()` is called from pull start/end, `syncAllContexts` finally, socket connection changes, and network store subscription (`App.tsx`).

### Bug A — `syncInProgress` and pull depth keep banner on `SYNCING` (P0)

`chatSyncService.syncAllContexts()` (`Frontend/src/services/chat/chatSyncService.ts`):

1. Sets `syncInProgress = true` and refreshes banner → `SYNCING`.
2. Enqueues foreground pulls for every room.
3. `await Promise.all(rooms.map(syncContext))` — **no app-level deadline** on the bulk wave. Per-request HTTP uses axios default timeout (~10s), not zero; a slow or retried room still blocks `finally` until the wave completes or a request fails/times out at the transport layer.
4. **GAME** contexts: `syncContext` runs up to **three sequential** `pullMissedAndPersistToDexie` calls (one per tab head) per room — multiplies wall-clock time on mobile after visiting many chats.
5. Clears `syncInProgress` only in `finally`.

**Failure modes:**

- Hung or very slow room(s) in `Promise.all` delay `syncInProgress` clearing → global header spinner on **every** chat.
- `activeChatSyncPullDepth` can remain `> 0` after `syncInProgress` clears (in-flight per-thread pulls from scheduler / gap-fill), so banner stays `SYNCING` until those pulls end.

**Triggers:** App foreground (`appLifecycle.service.ts` → `runForegroundSync`), socket reconnect (`socketService.ts` → `rejoinActiveChatRooms`). Foreground sync merges socket active rooms + navigation “viewing” ids + warm unread contexts — heavy on mobile.

**Concurrent callers:** App lifecycle guards with `syncInProgress`; `rejoinActiveChatRooms` does **not** — two `syncAllContexts` runs can overlap (duplicate work, early `finally` on one generation). Overlap does **not** by itself explain indefinite stuck `SYNCING`; bounded sync + generation mutex (Phase 1.2/1.3) addresses both hung sync and overlap.

**Pull depth (post–Phase 1 only):** `chatSyncPullStarted` / `chatSyncPullEnded` are paired in `chatSyncScheduler.ts` and `chatLocalApplySocketInbound.ts` inside `finally`. If header stays `SYNCING` with `syncInProgress === false` after Phase 1, re-audit `activeChatSyncPullDepth` (optional: reset on `clearChatSyncScheduler`, dev assert) — not treated as a separate root cause (former Bug D).

### Bug B — Foreground sync skipped while flag stuck (compounds A)

```ts
// appLifecycle.service.ts — runForegroundSync
if (useChatSyncStore.getState().syncInProgress) return;
```

When `syncInProgress` is stuck `true` (Bug A), subsequent foreground sync attempts are dropped until reload. This is intentional debounce when sync is healthy; it is **not** an independent P0 — it prevents recovery from a hung `syncAllContexts`.

### Debounce path (not the stuck-ONLINE bug)

When entering `SYNCING`, a 350ms debounce avoids flicker. Timer callback only sets `SYNCING` if `computeDesiredChatConnectionState()` is still `SYNCING`. Transition to `ONLINE` clears the timer when `refreshChatOfflineBanner` runs after sync ends — correct when sync completes.

---

## Root cause 2 — Composer hidden while messages are visible (P0)

### Footer gate (mobile / non-embedded)

```tsx
// GameChat.tsx
{((!isInitialLoad || isEmbedded || (isEmbedded && messages.length > 0)) ||
  footerVariant?.type === 'contextLoading') &&
  footerVariant != null && (
  <GameChatFooter ... />
)}
```

On mobile chat routes, `isEmbedded === false`. If `isInitialLoad` stays `true`, **footer is not mounted** — no `MessageInput`, even with a full message list.

### Bug E — L1 cache hit does not clear `isInitialLoad`

In `useGameChatMessages.ts` thread `useLayoutEffect`:

- If `peekChatThreadMemory(key)` returns messages: sets `isLoadingMessages = false` but **does not** set `isInitialLoad = false`.
- If no cache: sets `isInitialLoad = true`.

Contradicts `docs/PLAN_CHAT_L1_MEMORY_CACHE.md` Option A intent. Hides mobile footer/composer while messages are already painted.

`isInitialLoad` otherwise clears when:

1. L1 seed (`cached.length > 0`) in thread `useLayoutEffect` (Phase 2.1), or
2. `loadOpenScrollState` completes and `messagesRef.current.length > 0` (Phase 2.3), or
3. `paintOpenSnapshot` runs with `currentIdRef === requestId` — scroll key not required (Phase 2.2), or
4. Network `loadMessages` / bootstrap fallback completes.

### Bug F — Fast chat switching cancels scroll readiness (coupled with E)

`loadOpenScrollState` is async; changing `id` sets `cancelled = true` in the effect cleanup (`useGameChatMessages.ts`).

**Failure mode:** User switches A → B → C quickly (typical on mobile):

- L1 paints messages for C (Bug E: `isInitialLoad` still `true`).
- `openScrollReadyKeyRef` never set for C (cancelled).
- `paintOpenSnapshot` skips `setIsInitialLoad(false)` because `openScrollReadyKeyRef !== memKey`.
- Footer stays hidden; messages look fine.

Can repeat on every chat if the user never dwells long enough for scroll setup to finish.

**Fix:** Phase 2.1 (L1 clears `isInitialLoad`) + 2.2 (`paintOpenSnapshot` must not require scroll-ready key for composer).

---

## P1 — Reconcile / embedded initial-load cleanup

### Bug H — **Done (Phase 3.1)** — `isOpenSyncing` leak on navigate away mid-reconcile

`reconcileChatThreadOpen` (`Frontend/src/services/chat/chatOpenReconcile.ts`) previously cleared `isOpenSyncing` only when `currentIdRef.current === contextId` in `finally`, so navigating away mid-reconcile could leave the flag stuck `true` (affects `BANDEJA_CHAT_SYNC_STALE` defer in `useGameChatSocket.ts` only; not header `SYNCING` or composer).

**Shipped:** Module `openReconcileGeneration` — each reconcile bumps generation; `finally` always calls `setOpenSyncing(false)` when `generation === openReconcileGeneration` (stale runs after a newer reconcile do not clear the flag). Reconcile commits gated on `currentIdRef` + active generation.

### Bug I — `useGameChatInitialLoad` / `isLoadingContext`

`Frontend/src/pages/GameChat/useGameChatInitialLoad.ts`:

- Sets `setIsLoadingContext(true)` at start; does **not** set `false` in its own `finally` — relies on `loadContext` finally with `currentIdRef === requestId`.
- Early return when `isLoadingRef.current && loadingIdRef.current === currentLoadId` can skip a second load for the same thread while the first is in flight.

Drives `showLoadingHeader` when `isEmbedded` only — **not** mobile global `SYNCING` or composer gate.

**Fix:** Phase 3.2/3.3 — **done** (`userChatRef`, `finally` clears when `loadingIdRef` matches, early-return gated on `hasLoadedRef`).

---

## Root cause 3 — Read ticks on own sent messages

**Reported after:** mark-read-on-enter / mark-read-on-send work (`unreadCoordinator`, backend `markSenderContextReadAfterSend`). Not caused by missing `Bug.groupChannelId` — bug threads use `GROUP:<groupChannelId>` via `GroupChannel.bugId` (FK on channel, not on bug).

**J vs K:** Bug **J** = flicker (receipts present, then wiped by merge). Bug **K** = live ticks never update until full reload (Dexie updated, React not). Both need Phase 4; ship **4.1 + 4.3 together**.

### How ticks are computed

```tsx
// MessageBubble.tsx
const tickRead = message.state === 'READ' || (message.readReceipts?.length ?? 0) > 0;
```

For **your** messages, “read by the other person” = `readReceipts` contains their `userId`. Backend `markAllMessagesAsRead` only creates receipts on messages where `senderId !== you` — your own mark-read does **not** attach your userId to your sent messages.

### Bug J — **Fixed** (4.1, 4.2, 4.5) — `mergeChatMessagesAscending` wiped `readReceipts` (P0/P1)

```ts
// chatMessageSort.ts
else if (shouldPreferIncomingMessage(cur, m))
  map.set(m.id, { ...cur, ...m });

function shouldPreferIncomingMessage(existing, incoming) {
  return compareChatMessagesAscending(existing, incoming) <= 0; // tie → incoming wins
}
```

When incoming row is same id with **equal or newer** sort key (`compare <= 0`) but **empty or stale** `readReceipts` (API page, Dexie tail, `putMessage` without receipts), spread replaces React state and **drops** receipts that were just added via socket.

**Failure mode:** Socket adds receipt → tick on → merge/reload prefers incoming without receipts → tick off → socket/sync again → tick on. Looks random.

**Dexie path is correct:** `chatSyncApplyPatches` `readBatch` merges with `mergeReadReceiptSync`. Defect is **React merge only**.

**Fix:** Phase 4.1 — field-wise `readReceipts` merge (reuse `mergeReadReceiptSync` pattern); 4.5 unit test; optional 4.2 strict `<` instead of `<=` on tie.

#### High-risk merge call sites (who wins on tie)

| Call site | Incoming source | On tie (`compare <= 0`) | Receipt risk |
|-----------|-----------------|-------------------------|--------------|
| `loadMessages` first page | API / `mergeServerPageWithPendingOptimistics` | Incoming wins | API row often lacks `readReceipts` → wipe |
| `reloadMessagesFirstPage` | Full `loadMessages(false)` | Same as above | Full list replace after mark-read |
| `mergeOpenSnapshot` / `reconcileChatThreadOpen` | Dexie + server reconcile | Incoming wins | Dexie message may omit receipts |
| Bootstrap with Dexie/L1 | Cached tail + network head | Incoming wins | L1/API head without receipts |

### Bug K — **CONFIRMED** — separate gap: sync read batch does not update React (P0)

`MESSAGES_READ_BATCH` sync events are applied in `chatSyncApplyPatches.ts` → Dexie `readBatch` only. **No** corresponding patch to the open thread’s React `messages` state.

Live tick updates today depend on:

- Socket `chat:read-receipt` with **`messageId`** + `userId` → `handleReadReceipt` (React)
- Full reload / merge from API (must include `readReceipts` in payload)

**Socket gaps:**

- Mark-read emits `read-receipt` with `{ allRead: true }` only (no `messageId`).
- `useGameChatSocket.ts` skips Dexie patch when `allRead`.
- `handleReadReceipt` cannot match a message without `messageId`.

**Symptom:** Other user reads your messages; ticks stay grey until you leave and re-open or reload — **not** the rapid on/off of Bug J.

**Fix:** Phase 4.3 — **Done** — after Dexie `readBatch`, `dispatchChatReadBatchApplied`; open thread listens in `useGameChatSocket` and patches `messages` via `applySyncReadBatchToMessages` (`mergeReadReceiptSync`). Optionally handle `allRead` or per-message socket payloads.

**4.3b (done):** Consecutive `syncSeq` no longer cursor-only bump — `pullEventsLoop` applies `MESSAGES_READ_BATCH` at `last+1`.

### Bug L — **CONFIRMED amplifier** — mark-read churn (P1, not root cause)

Amplifies Bug J via extra reconcile/reload/merge cycles. Does **not** replace J or K.

| Path | Behaviour |
|------|-----------|
| Client `POST /chat/mark-context-read` | Debounced **280ms** (`unreadCoordinator`) |
| Server `markSenderContextReadAfterSend` | Runs on **every** send — **not** debounced |
| `MESSAGES_READ_BATCH` sync event | Emitted only when `markedCount > 0` |
| Socket read-receipt on send | Client POST emits when marks occur; **`markSenderContextReadAfterSend` does not** emit read-receipt socket |

Churn triggers `pullAndApplyChatSyncEvents`, `reconcileChatThreadOpen`, or `BANDEJA_CHAT_SYNC_STALE` → `reloadMessagesFirstPage` → more Bug J merges.

**Fix (done):** Phase 4.6 — client skips debounced `mark-context-read` when local unread is 0, no pending optimistic restore, and a prior flush confirmed read for that context key (invalidated on socket `unreadCount > 0`). Phase 4.7 — `markSenderContextReadAfterSend` no-ops when `getUnreadCountForContext` is 0 before `markContextRead`.

### Confirm in DevTools

| Observation | Likely bug |
|---------------|------------|
| `readReceipts` toggles `[{ userId: other }]` ↔ `[]` while chat stays open | **J** (merge/reload) |
| `readReceipts` stays `[]` in React but Dexie has receipts; ticks appear after re-open | **K** (no React patch) |
| Flicker correlates with `GET .../messages`, `mergeOpenSnapshot`, `reloadMessagesFirstPage` | **J** (+ **L** amplifier) |

---

## Reproduction hints (DevTools / debug)

On a stuck session, inspect Zustand / React:

| Field | Stuck value | Likely cause |
|-------|-------------|--------------|
| `useChatOfflineStore.chatConnectionState` | `'SYNCING'` | Bug A (+ B compounds recovery) |
| `useChatSyncStore.syncInProgress` | `true` | Hung `syncAllContexts` (Bug A) |
| `activeChatSyncPullDepth` (`chatOfflineBanner.ts`) | `> 0` with `syncInProgress === false` | In-flight pulls; re-check after Phase 1 only |
| React `isInitialLoad` in open `GameChat` | `true` with `messages.length > 0` | Bug E/F |
| Own message `readReceipts` toggles `[]` ↔ `[{…}]` while chat open | Merge/reload | Bug J (+ L) |
| Own message `readReceipts` always `[]` in React; Dexie has data | No React readBatch patch | Bug K |

---

## Implementation plan

### Phase 1 — Stop global `SYNCING` hangs (P0)

| # | Task | Notes |
|---|------|--------|
| 1.1 | Bounded `syncAllContexts` wave (e.g. 25–30s `Promise.race` on `Promise.all` or per-room cap) | Always hit `finally`; log timed-out rooms; account for GAME 3× sequential pulls per room |
| 1.2 | Generation / mutex for `syncInProgress` | Increment on start; only clear in `finally` if generation matches; prevents overlapping runs (incl. rejoin vs foreground, Bug C) from clearing flag early |
| 1.3 | Guard `rejoinActiveChatRooms` with same mutex or skip if sync already running | Align with `appLifecycle.service.ts`; merge Bug C |
| 1.4 | On timeout: `setSyncInProgress(false)` + `refreshChatOfflineBanner()` | User can send even if one room missed sync |
| 1.5 | Optional: subscribe `useChatSyncStore` to `syncInProgress` and call `refreshChatOfflineBanner` on change | Safety net if a caller forgets refresh |
| 1.6 | Optional (post–Phase 1): if `SYNCING` with `syncInProgress === false`, audit `activeChatSyncPullDepth`; reset on `clearChatSyncScheduler`, dev assert | **Done** — `resetChatSyncPullDepth()` on scheduler clear; DEV warn if depth was &gt; 0 |

**Exit criteria:** Header returns to avatar within bounded time after foreground/reconnect; no permanent `SYNCING` without offline network.

### Phase 2 — Composer visible when L1 has messages (P0)

| # | Task | Notes |
|---|------|--------|
| 2.1 | On L1 seed (`cached.length > 0`), set `isInitialLoad = false` (and keep `isLoadingMessages = false`) | **Done** — Bug E; align with `PLAN_CHAT_L1_MEMORY_CACHE.md` Option A |
| 2.2 | In `paintOpenSnapshot`, clear `isInitialLoad` when `currentIdRef === requestId` regardless of `openScrollReadyKeyRef` | **Done** — Bug F; scroll position can settle async |
| 2.3 | `loadOpenScrollState` completion: keep clearing `isInitialLoad` when messages present | **Done** — redundant safety |
| 2.4 | On thread `id` change, do not set `isInitialLoad = true` if L1 peek will immediately seed non-empty list | **Done** — `willSeedFromL1` branch only clears; empty cache sets `true` |

**Exit criteria:** Open chat with cached messages → footer/input visible within one frame; rapid A→B→C switching still shows composer.

### Phase 3 — Reconcile / initial-load cleanup (P1)

| # | Task | Notes |
|---|------|--------|
| 3.1 | `reconcileChatThreadOpen` `finally`: always `setOpenSyncing(false)` | **Done** — Bug H; `openReconcileGeneration` guards `finally` + commit |
| 3.2 | `useGameChatInitialLoad` `finally`: `setIsLoadingContext(false)` when `loadingIdRef` matches | Bug I; do not rely only on `loadContext` race |
| 3.3 | Audit `useGameChatInitialLoad` early-return + `userChat` in effect deps | Avoid skipped bootstrap when context arrives mid-load |

### Phase 4 — Read receipts stable under merge and sync (P0)

**Ship together:** 4.1 (Bug J) + 4.3 (Bug K). L (4.6/4.7) **done**.

| # | Priority | Task | Notes |
|---|----------|------|--------|
| 4.1 | **P0** | In `mergeChatMessagesAscending`, merge `readReceipts` with `mergeReadReceiptSync` when combining same `id` | **Done** — Bug J |
| 4.2 | P1 | Prefer incoming only when sort key is **strictly** newer (`<` not `<=` on tie) | **Done** |
| 4.3 | **Done** | After sync `readBatch`, `BANDEJA_CHAT_READ_BATCH_APPLIED` → open `GameChat` React patch | Bug K |
| 4.3b | P1 | Audit `onSocketSyncSeq` consecutive-seq skip — may drop readBatch apply | **Done** — any `syncSeq &gt; last` runs `pullEventsLoop` (was cursor-only bump on `last+1`); fixes skipped `MESSAGES_READ_BATCH` |
| 4.4 | P1 | Avoid `reloadMessagesFirstPage` on every `BANDEJA_CHAT_SYNC_STALE` while thread open and painted | **Done** — painted + `cursorStale` → `reconcileChatThreadOpen`; `threadInvalidated` or unpainted → full reload |
| 4.5 | **P0** | Unit test: prev has receipt, incoming same id without receipts → merged keeps receipt | **Done** — `chatMessageSort.test.ts` |
| 4.6 | P1 | Client: skip `mark-context-read` when local unread already 0 and no new inbound | **Done** — `unreadCoordinator` `markReadConfirmedKeys` + socket invalidation |
| 4.7 | P1 | Server: no-op `markSenderContextReadAfterSend` when sender context already fully read | **Done** — early return on `getUnreadCountForContext === 0` |

**Exit criteria:** DM — other user reads your messages: blue/double tick **stable** (no J flicker) and **updates live** without reload (no K gap); mark-read / send does not cause rapid on/off without new read activity.

### Phase 5 — QA matrix (manual)

- Mobile: send in chat A, switch to B, send, switch to C, background app, resume.
- Flaky network: DevTools 3G while switching chats.
- Airplane mode on resume → confirm `OFFLINE` (wifi icon), not infinite `SYNCING`.
- Desktop split view (embedded): no regression on `showLoadingHeader`.
- GAME chat: foreground sync with game room (3 tab heads in `syncContext`).
- **Read ticks — flicker (J):** Other user reads your messages; you send several more; ticks on **older** own messages do not rapidly on/off while chat stays open.
- **Read ticks — live update (K):** Other user reads your messages; ticks turn blue/double **without** leaving chat or pull-to-refresh; verify after sync pull (not only socket with `messageId`).
- **Mark-read:** Open chat with unread, send without leaving; return to list — unread badge stays 0 (see `docs/unread-counts-architecture.md`).

**Exit criteria:** No infinite header spinner; composer available when thread opened before and user can write per permissions; stable read ticks (J) and live read ticks (K) on own messages.

---

## Non-goals (this plan)

- Changing Dexie schema or backend sync protocol.
- Removing global sync banner entirely (still useful when legitimately syncing).
- Rewriting `chatSyncScheduler` concurrency model (unless Phase 1 metrics show pull queue starvation).
- Fixing brief empty title/avatar on thread switch (intentional; see transient behaviour table).

---

## Implementation status

| Phase | Status |
|-------|--------|
| Phase 1 — Global `SYNCING` | **Done** — 1.1–1.5: 28s wave `Promise.race`, generation mutex, rejoin skip when `syncInProgress`, timeout clears flag + banner refresh; `chatOfflineBanner` subscribes to `syncInProgress` |
| Phase 2 — Composer / `isInitialLoad` | **Done** — 2.1–2.4 (Bug E/F) |
| Phase 3 — Reconcile / initial-load | **Done** — 3.1 (Bug H); 3.2–3.3 (Bug I) |
| Phase 4 — Read receipts / merge (J+K; L) | **Done** — 4.1–4.7 including optional 4.3b, 4.4 |
| Phase 5 — QA | **Not started** (manual matrix below) |

### Already shipped (unread / mark-read — separate from this plan)

| Item | Status |
|------|--------|
| Early `enterContextAndMarkRead` after `loadContext` | Done |
| `markContextReadOnUserActivity` on send + debounced network | Done |
| Backend `markSenderContextReadAfterSend` on `createMessage` (+ dedup paths) | Done |
| Re-enter dedupe only when local unread is 0 | Done |
| Bug L — skip redundant client `mark-context-read` (4.6) | Done |
| Bug L — skip redundant server `markSenderContextReadAfterSend` (4.7) | Done |
| `markReadAfterSend.ts` helper (incl. BUG + `groupChannelId`) | Done |

---

## Related docs

- `docs/PLAN_CHAT_L1_MEMORY_CACHE.md` — L1 seed behaviour and `isInitialLoad` interaction
- `docs/PLAN_CHAT_OUTBOX_SEND_NEXT_STEPS.md` — send pipeline; `inputBlocked` / `isLoading` in composer
- `docs/game-chat-open-performance-phases.md` — `isOpenSyncing`, socket defer (if present in repo)
- `docs/unread-counts-architecture.md` — unread badges, mark-read coordinator, `GROUP` vs `BUG` keys
