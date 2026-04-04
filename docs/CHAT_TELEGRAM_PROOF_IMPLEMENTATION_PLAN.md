# Chat: Telegram-Proof Implementation Plan

Full roadmap to make chat **super-reliable**, **offline-first** (local source of truth + DB sync), **fast**, and aligned with modern Telegram-like UX.

## Implementation progress

| Phase | Item | Status | Notes |
|-------|------|--------|--------|
| A | A1 Read / delivery batching | **Done** | Chunk retries + outer flush backoff (capped); 401/403 drops pending + stops timer; visibility flush resets streak. |
| A | A2 Chunked local thread paint | **Done** | Progressive path + `yieldToMain()` before full sort to reduce long-task blocking. |
| A | A3 Virtual list accuracy | **Done** | LRU + `MAX_PX` + tail preload key; row measure `useLayoutEffect` keyed by virtual item size signature (not full `messages`). |
| A | A4 Typing indicators | **Done** | Emit when not `OFFLINE` (allows `SYNCING` + connected); server adds `timestamp`; client drops stale inbound (>15s). |
| A | A5 Drafts in Dexie | **Done** | `chatDrafts` table (v8); `draftStorage` reads/writes Dexie, migrates from idb-keyval on read, dual-write to idb for redundancy; cleared with `clearChatLocalStores`. |
| B | B1 Mutation queue schema | **Done** | Dexie v9 `mutationQueue`; kinds include `edit`, `delete`, `reaction_add`, `reaction_remove`, `pin`, `unpin`, `mark_read_batch`; cleared with `clearChatLocalStores`. |
| B | B2 Unified flusher | **Done** | `chatUnifiedOfflineFlush.ts`: sequential `flushChatMutationQueue` → `retryFailedChatOutbox`; scheduled on foreground / `App` network store / `appLifecycle`; per-row enqueue still calls `scheduleChatMutationFlush` for low latency. |
| B | B3 Optimistic apply | **Done** | `chatMutationEnqueue.ts` + `chatLocalApply` (`applyLocalMessageEditOptimistic`, `applyLocalReactionOptimisticReplace`, `markLocalMessageDeleted`); rollback queue row if local apply throws; edit flush calls `putLocalMessage` after API success. |
| B | B4 Conflict policy | **Done** | Comment in `chatMutationEnqueue.ts`; delete prunes prior queued ops for same `messageId`; server `payloadHash` + `ChatMutationIdempotency` rejects mismatched replay. |
| B | B5 Wire GameChat | **Done** | `MessageInput` (edit), `useGameChatReactions`, `useGameChatPinned`, `useGameChatInitialLoad` / `useGameChatActions` (mark-read batch), `useGameChatMutationRetry` + banner; `chatMutationNetwork.ts` / `chatMutationEvents.ts`. |
| D | D1–D3 Media / attachments | **Done** | v10 blobs + atomic enqueue + send/rehydrate validation + `queueMicrotask` sends + MIME filenames + thumb prefetch + cache cap + diagnostics + rehydrate `blob:` revoke + fullscreen cache warm (see Phase D rows + §9). |
| C | C1 Web Worker + patch apply | **Done** | Worker fetch/parse sync pages; main `chatSyncEventsToPatches` → `bulkPut` slice apply + 401/base URL fixes (see `chatSyncFetch.worker.ts`, `chatSyncApplyPatches.ts`). |
| C | C2 SQLite + OPFS | Not started | Optional; defer until Dexie/worker path is stable in production. |
| C | C3 Hot-thread prefetch | **Done** | Dexie v11 `chatThreads.lastOpenedAt` / `openCount` / `lastGameChatType`; `recordChatThreadOpened` from `GameChat`; idle prefetch `pullMissed` + `enqueueChatSyncPull` for top K (WiFi-only on native; `chatHotThreadPrefetch.ts`). |
| E–G | — | Not started | — |

---

## 1. Goals

| Goal | Definition |
|------|------------|
| Offline-first | Open threads, read history, compose, and queue mutations without network; reconcile when online. |
| DB-backed sync | Server remains authority; clients use **sync log** (`ChatSyncEvent` + cursors) + **missed messages** + **batch head** as today, extended where needed. |
| Reliability | No silent data loss; idempotent sends (`clientMutationId`); recover from stale cursors; multi-tab safe. |
| Performance | No long main-thread stalls; smooth virtual list; fast cold open of frequent threads. |
| Modern UX | Batched reads, sensible typing/read states, progressive media, optional local search. |

---

## 2. Current Baseline (Repo)

**Frontend**

- Dexie DB `BandejaChatLocal` (`chatLocalDb.ts`): `messages`, `chatSyncCursor`, `outbox`, **`outboxMediaBlobs`**, `chatThreads`, `threadIndex`, `messageContextHead`, `threadScroll`, **`messageRowHeights`**, **`chatDrafts`**, **`mutationQueue`** (schema **v10**; `mutationQueue` since v9).
- Apply path: `chatLocalApply.ts` (persist, sync pull, progressive local load + `yieldToMain`, socket helpers), `chatSyncScheduler.ts`, `chatSyncBatchWarm.ts`.
- Delivery confirm batching: `chatDeliveryConfirmBatcher.ts` → `POST /api/chat/messages/confirm-receipt-batch`.
- Row height cache: `chatMessageHeights.ts` (Dexie + in-memory LRU); consumed by `MessageList.tsx` (TanStack Virtual, dynamic overscan, tail-id preload signature).
- Drafts: `draftStorage.ts` (Dexie `chatDrafts` + idb-keyval dual-write / migration); cleared with `clearChatLocalStores`.
- Send path: `chatMessageQueueStorage.ts` (outbox + **`outboxMediaBlobs` in one `transaction` on enqueue**; **`revokeOutboxRehydrateBlobUrls` on `remove`**) → `chatSendService.ts` (retries, deadline; strict pending-blob checks; **`logChatOutboxBlobMismatch`**) → `applyQueuedMessagesToState.ts` (rehydrate, **`registerOutboxRehydrateBlobUrls`**, mark `failed`, **`queueMicrotask`** send).
- Offline mutations: `chatMutationEnqueue.ts`, `chatMutationFlush.ts` (`navigator.locks` when available), `chatMutationQueueStorage.ts`, `chatUnifiedOfflineFlush.ts`, `foregroundChatSyncRegistry.ts` (avoids `networkStatus` ↔ `appLifecycle` import cycle).
- UI: `GameChat` + hooks, `ChatList`, `MessageList`, `MessageInput`.
- Media: `chatMediaCache.ts` (Cache API; quota **`logChatMediaCacheQuota`**); `FullscreenImageViewer.tsx` warms full-size cache on open for remote URLs.

**Backend**

- REST under `/api/chat`, sync: `/sync/head`, `/sync/events`, `/sync/batch-head`; **`/messages/confirm-receipt-batch`** for batched delivery marks.
- **`ChatMutationIdempotency`** Prisma model + `ChatMutationIdempotencyService`: optional `clientMutationId` on edit / delete (query) / reactions / pin / unpin; cached JSON response on replay; weekly prune when `CHAT_MUTATION_IDEM_RETENTION_DAYS` > 0 (see `chatSyncStatsScheduler.service.ts`). **Deploy:** run migration `20260405120000_chat_mutation_idempotency`.
- `ChatSyncEvent` + `ConversationSyncState`; types include read batch, pins, thread invalidate, etc.
- Socket: `chat:*` events, rooms per context; **`typing-indicator` payloads include `timestamp`** (client stale filter).

**Gaps** (vs full Telegram-proof target): sync + Dexie + message apply still **main thread**; send remains **outbox** (mutations are separate queue, unified flush drains both); idempotency rows grow until retention env set; **Web Locks** missing on some clients → weaker multi-tab serialization; search/API-only; **large local threads** still pay full Dexie `toArray()` cost where not progressive; large UI files (`ChatList`, `MessageInput`) not split (Phase G).

---

## 3. Guiding Principles

1. **Single writer per context** — keep serialized apply per thread (extend `chatLocalApplyQueue` pattern if workers split).
2. **Idempotency** — stable `clientMutationId` for create message; non-create chat mutations use `ChatMutationIdempotency` + optional client id (see Phase B / §5).
3. **Observable state** — `chatOfflineStore` / banner reflect sync depth; surface “sync failed, tap to retry” per thread.
4. **Incremental delivery** — prefer chunked UI updates and smaller HTTP payloads over one giant state dump.

---

## 4. Phased Roadmap

### Phase A — Quick wins (low risk, high UX)

| ID | Work | Details |
|----|------|---------|
| A1 | **Read receipt batching** | ~~Done: delivery confirm batching~~ (`confirm-receipt-batch` + client batcher). *Future:* scroll-coalesced `mark read` API if per-message read is added. |
| A2 | **Chunked local thread paint** | ~~Done: `loadLocalMessagesForThreadProgressive` + tail-first heap (48) + `yieldToMain()` before full sort.~~ |
| A3 | **Virtual list accuracy** | ~~Done: `messageRowHeights` + preload (tail id key) + dynamic overscan + measure effect keyed by virtual item signature + in-memory LRU.~~ |
| A4 | **Typing indicators** | ~~Done: emit when not `OFFLINE`; server `timestamp`; client stale drop.~~ |
| A5 | **Drafts in Dexie** | ~~Done: `chatDrafts` in `BandejaChatLocal` + migration from idb-keyval.~~ |

**Exit criteria:** Fewer HTTP calls on scroll; thread with large local cache opens without noticeable freeze; scroll-to-message more stable; no ghost typing after offline.

---

### Phase B — Offline mutations (true offline-first)

| ID | Work | Details |
|----|------|---------|
| B1 | **Mutation queue schema** | ~~Done: Dexie `mutationQueue` (v9)~~ — kinds above + `mark_read_batch`; `lastError` / `nextRetryAt` on failures. |
| B2 | **Unified flusher** | ~~Done: `chatUnifiedOfflineFlush`~~ — mutations then outbox; `flushChatMutationQueue` uses backoff, 404/401/403 drop, 409 short re-queue; `CHAT_MUTATION_FLUSH_*` events; banner + tap retry in `GameChat`. |
| B3 | **Optimistic apply** | ~~Done~~ — local Dexie + `putLocalMessage` after successful edit flush; server idempotency limits duplicate side effects. |
| B4 | **Conflict policy** | ~~Done (client doc + server hash)~~ — delete prunes queued edit/react/pin/unpin for that message; edit/reaction_add payload hash on server. |
| B5 | **Wire GameChat actions** | ~~Done~~ — offline / retryable network: enqueue; UI rollback when enqueue fails (react/delete). |

**Exit criteria:** Airplane mode: send (outbox), edit, react, delete, pin/unpin, mark-read batch queue and sync after reconnect; duplicate replay mitigated by `clientMutationId` + `ChatMutationIdempotency` (requires migration deployed).

---

### Phase C — Performance architecture

| ID | Work | Details |
|----|------|---------|
| C1 | **Web Worker (or SharedWorker) for sync** | Worker owns: fetch sync pages, parse JSON, produce **patches** (put/update/delete message ids). Main thread applies patches in batches via `postMessage` + existing `withChatLocalBulkApply`. Alternative: worker holds separate Dexie — harder; prefer patch protocol first. |
| C2 | **SQLite + OPFS (optional later)** | Evaluate `wa-sqlite` + OPFS for bulk read/write and FTS; migration tool from Dexie export/import once per device. **Only after** worker protocol is stable. |
| C3 | **Prefetch hot threads** | ~~Done:~~ Dexie `chatThreads` v11 fields; `GameChat` records opens; `scheduleChatHotThreadPrefetchFromIdle` after warm bootstrap + foreground (missed messages + low-priority sync pull; cellular skipped on native). |

**Exit criteria:** Profile: sync catch-up (500+ events) does not block input > 50 ms slices; optional FPS target during scroll maintained.

---

### Phase D — Media and attachments

| ID | Work | Details |
|----|------|---------|
| D1 | **Durable outbox blobs** | ~~Done:~~ Dexie v10 `outboxMediaBlobs` (per-slot image rows + voice row); **`messageQueueStorage.add`** writes blobs + outbox row in **one Dexie transaction** (no orphan blobs if `put` fails). Outbox row: `pendingImageBlobCount` / `hasPendingVoiceBlob`; migration from legacy inline `pendingImageBlobs`. **`chatSendService`:** if voice flag set but blob missing, or image count ≠ loaded slots → **`failed`** + `logChatOutboxBlobMismatch('send', …)`. **`applyQueuedMessagesToState`:** same mismatch → `logChatOutboxBlobMismatch('rehydrate', …)` + `updateStatus('failed')` + `handleMarkFailed`; **`chatOutboxRehydrateUrls`** revokes prior `blob:` URLs per `tempId` on successful rehydrate and on **`remove`**. Queued voice uploads from stored blob after reconnect. |
| D2 | **Proactive thumbnail cache** | ~~Done:~~ `scheduleChatMediaThumbPrefetchForMessage` from `putLocalMessage` / `persistChatMessagesFromApi`; idle batched `fetch` + `writeCachedMediaResponse`; **write-order eviction cap** via `trackedKeys` in `chatMediaCache.ts` on each successful `put` (not read-LRU). **`writeCachedMediaResponse`** logs **`logChatMediaCacheQuota`** on quota-style failures. |
| D3 | **Progressive display** | ~~Done:~~ `MessageItem` `getThumbnailUrl` prefers `thumbnailUrls[i]`; `MessageMediaGrid` / `ChatMediaImage` use that for list; open uses full `mediaUrls[i]`; **`FullscreenImageViewer`** warms Cache API (read hit → object URL, else `fetch` + `writeCachedMediaResponse`) for remote URLs. |

**Exit criteria:** Kill app mid-send with photo queued; reopen — still sendable after network returns.

---

### Phase E — Search and server efficiency

| ID | Work | Details |
|----|------|---------|
| E1 | **Local search index** | Denormalize `searchText` on `ChatLocalRow` or side table; Dexie prefix / `MiniSearch` build from thread scope; merge with API results when online. |
| E2 | **Delta / compact sync payloads** | Server: smaller patches for `MESSAGE_UPDATED`; batch read events; gzip responses; optional event compaction window server-side. |

**Exit criteria:** Offline search returns results for cached threads; sync payload size down on large catch-up (measure before/after).

---

### Phase F — Background and native

| ID | Work | Details |
|----|------|---------|
| F1 | **Service Worker: Background Sync** | Register `sync` for outbox + mutation flush; minimal SW fetch to same API origin; align with existing PWA/Capacitor setup. |
| F2 | **Capacitor** | Map to native background fetch / push data refresh where available; share same flush logic as web. |

**Exit criteria:** Queued sends eventually complete after short background window (platform-dependent); document limitations (iOS vs Android).

---

### Phase G — Code health

| ID | Work | Details |
|----|------|---------|
| G1 | **Split `ChatList.tsx`** | Data hook, sections, search, pull-to-refresh, socket subscriptions. |
| G2 | **Split `MessageInput.tsx`** | Media, voice, mentions, polls, core textarea. |
| G3 | **Trim `chatLocalApply.ts`** | Extract socket handlers, sync event reducers, and persistence into named modules. |

**Exit criteria:** No file > ~600 lines without strong reason; imports remain tree-shake friendly.

---

## 5. Backend Additions (Cross-Cutting)

| Need | Suggestion |
|------|------------|
| Batch read API | `POST /chat/mark-all-read` (existing) used by queued `mark_read_batch`; optional future: read-up-to by `syncSeq`. |
| Idempotent non-create ops | ~~Implemented:~~ `clientMutationId` + `ChatMutationIdempotency` for edit, delete, reactions, pin, unpin (payload hash where applicable). |
| Sync payload size | Document max events per page; consider field-level diff for updates. |
| Retention | Keep `ChatSyncEvent` retention aligned with client cursor recovery (`THREAD_LOCAL_INVALIDATE` / full resync story documented). |

Coordinate each change with `chatSyncEvent.service.ts` and affected services (`readReceipt`, `message`, `pinnedMessage`, etc.).

---

## 6. Testing and Verification (Manual / Staging)

- Airplane mode matrix: send, multi-message, edit, delete, reaction, open second tab.
- Cold start with 10k+ local messages: time to first interactive frame.
- Reconnect after 24h: cursor gap, stale head, `dispatchChatSyncStale` recovery.
- Storage quota: near-full device behavior (Dexie + Cache API).
- Multi-tab: one tab sends, other tab list + thread consistency.

(Automated tests only if the team policy allows; current repo preference may skip test files.)

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Worker + Dexie complexity | Start with patch-based worker; single Dexie on main. |
| SQLite migration cost | Defer until offline queue + worker proven; one-time migration UX. |
| Background sync unreliable on iOS | Document; rely on foreground flush + push. |
| Duplicate mutations | Strict idempotency keys server-side. |

---

## 8. Suggested Order of Execution

1. **A1, A2, A3** — immediate perceived performance and fewer requests.  
2. **B1–B5** — offline-first completeness.  
3. **D1** — attachment reliability.  
4. **C1** — scale to power users / large catch-up.  
5. **E1, E2** — search and bandwidth.  
6. **F1, F2** — background completion.  
7. **C2** — if Dexie becomes the bottleneck.  
8. **G1–G3** — ongoing alongside phases above.

---

## 9. Key File Map (Reference)

| Area | Primary files |
|------|----------------|
| Local DB | `Frontend/src/services/chat/chatLocalDb.ts` (v10 `outboxMediaBlobs`; v11 `chatThreads` open stats) |
| Phase C (worker + hot prefetch) | `chatSyncFetch.worker.ts`, `chatSyncFetchWorkerClient.ts`, `chatSyncEventsToPatches.ts`, `chatSyncApplyPatches.ts`, `chatHotThreadPrefetch.ts`, `chatThreadOpenStats.ts` |
| Outbox blobs / thumb prefetch / diagnostics | `Frontend/src/services/chat/chatOutboxMediaBlobs.ts`, `Frontend/src/services/chat/chatOutboxRehydrateUrls.ts`, `Frontend/src/services/chat/chatDiagnostics.ts`, `Frontend/src/services/chat/chatMediaThumbPrefetch.ts`, `Frontend/src/services/chat/chatMediaCache.ts` |
| Apply / sync | `Frontend/src/services/chat/chatLocalApply.ts`, `Frontend/src/services/chat/chatSyncScheduler.ts`, `Frontend/src/services/chat/chatSyncBatchWarm.ts` |
| Delivery confirm batch | `Frontend/src/services/chat/chatDeliveryConfirmBatcher.ts`; route in `Backend/src/routes/chat.routes.ts`, handler in `chat.controller.ts` |
| Row heights | `Frontend/src/services/chat/chatMessageHeights.ts`, `Frontend/src/components/MessageList.tsx` |
| Drafts (local) | `Frontend/src/services/draftStorage.ts` (Dexie + idb-keyval) |
| Send / outbox rehydrate | `Frontend/src/services/chatSendService.ts`, `Frontend/src/services/chatMessageQueueStorage.ts`, `Frontend/src/services/applyQueuedMessagesToState.ts` |
| Offline mutations (Phase B) | `Frontend/src/services/chat/chatMutationEnqueue.ts`, `chatMutationFlush.ts`, `chatMutationQueueStorage.ts`, `chatMutationNetwork.ts`, `chatMutationEvents.ts`, `chatUnifiedOfflineFlush.ts`; `Frontend/src/utils/foregroundChatSyncRegistry.ts` |
| Backend mutation idempotency | `Backend/src/services/chat/chatMutationIdempotency.service.ts`, `Backend/src/utils/chatClientMutationId.ts`; controllers in `chat.controller.ts` |
| Thread UI | `Frontend/src/pages/GameChat/useGameChatMessages.ts`, `useGameChatSocket.ts`, `useGameChatOptimistic.ts`, `useGameChatReactions.ts`, `useGameChatPinned.ts`, `useGameChatMutationRetry.ts`, `useGameChatInitialLoad.ts`, `useGameChatActions.ts` |
| List | `Frontend/src/components/chat/ChatList.tsx`, `Frontend/src/services/chat/chatThreadIndex.ts` |
| Virtual list | `Frontend/src/components/MessageList.tsx` |
| Fullscreen image (chat media) | `Frontend/src/components/FullscreenImageViewer.tsx` |
| Socket (FE) | `Frontend/src/services/socketService.ts` (typing filter, `confirmMessageReceipt` → batcher) |
| API | `Frontend/src/api/chat.ts` |
| Backend sync + socket | `Backend/src/services/chat/chatSyncEvent.service.ts`, `Backend/src/routes/chat.routes.ts`, `Backend/src/services/socket.service.ts` |

---

## 10. Definition of Done (Program Level)

- [x] All Phase A exit criteria met (see **Implementation progress**).  
- [x] Offline mutation queue covers primary user actions (send via **outbox**; edit/delete/reaction/pin/unpin/read-via-**mark_read_batch** in **mutationQueue**).  
- [ ] No critical path operation blocks the main thread beyond agreed budget during large sync.  
- [x] Outbox media survives process kill (Dexie `outboxMediaBlobs` + rehydrate in `applyQueuedMessagesToState`).  
- [ ] Documented limits for background sync per platform.  
- [ ] Large components split; onboarding path for new contributors < 1 day for chat area.

---

*Document version: 1.8 — §9 key file map: full paths for `chat/` modules (`chatOutboxRehydrateUrls` and related).*
