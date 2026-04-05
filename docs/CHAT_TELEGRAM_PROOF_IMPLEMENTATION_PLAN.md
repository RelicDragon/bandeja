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
| C | C1 Web Worker + patch apply | **Done** | Worker: `fetch` + `JSON.parse` for `/chat/sync/events` (`chatSyncFetch.worker.ts` → `chatSyncFetchWorkerClient.ts`). Main: `processDeletedUsers` then `chatSyncEventsToPatches` → `applyChatSyncPatchesInSlice` (`bulkPut` per slice) inside `withChatLocalBulkApply` + `pullEventsLoop` tx. Shared `apiBaseUrl.ts` + `handleApiUnauthorizedIfNeeded` for 401 parity with axios. |
| C | C2 SQLite + OPFS | Not started | Optional; defer until Dexie/worker path is stable in production. |
| C | C3 Hot-thread prefetch | **Done** | Dexie v11 `chatThreads` indexes + `lastOpenedAt` / `openCount` / `lastGameChatType`; `recordChatThreadOpened` from `GameChat.tsx`; `scheduleChatHotThreadPrefetchFromIdle` after warm bootstrap (`chatSyncBatchWarm.ts`) and when authenticated on foreground (`appLifecycle.service.ts`). `runHotThreadPrefetchNow`: top K by score, skip **cellular** on Capacitor (WiFi / unknown / none ok); web unrestricted. Env: `VITE_CHAT_HOT_PREFETCH_*`. |
| E | E1 Local search index | **Done** | v12 `searchText`; `chatLocalMessageSearchText.ts` / `chatLocalMessageSearch.ts`; `ChatMessageSearchResults` merges API + Dexie; offline search; `fromLocalCache` label. |
| E | E2 Compact sync + gzip | **Done** | `chatSyncMessageUpdatePayload.ts` + `MESSAGE_UPDATED` patch; `patchMessage` + **GET fallback** when no local row (`chatSyncApplyPatches` → `getChatMessageById` + `persistChatMessagesFromApi`); `readReceipt.service` single read → `MESSAGES_READ_BATCH`; `compression` in `app.ts`. |
| F | F1 Background Sync + F2 native flush | **Done** | `SyncManager.register('chat-offline-flush')` from `chatBackgroundSyncRegister.ts` + `scheduleUnifiedChatOfflineFlush`; SW `public/sw.js` — one target window (`pickFlushClient`), **MessageChannel** flush request → page runs `flushAllChatOfflineQueues` → **ACK**; **`waitUntil` rejects** on ACK timeout so the browser can retry sync; probe `GET /api/health` then `/health` (credentials); **`GET /api/health`** in `Backend/src/routes/index.ts`. Unified flush under **`navigator.locks`** `bandeja-chat-unified-offline-flush-v1` (`chatUnifiedOfflineFlush.ts`). Page verifies **`event.source === navigator.serviceWorker`**. Capacitor: **no SW** — `flushAllChatOfflineQueues()` on **`appStateChange` `!isActive`**; network-up already calls `triggerForegroundChatSync`. **Limits:** flush needs a **client** (Dexie on main); **zero tabs** → probe only; Background Sync **Chromium-weighted**; **iOS Safari / WebView** ≈ resume + foreground + online (see Phase F below). |
| G | G1 Split `ChatList.tsx` | **Partial** | `chatListModuleCache.ts`, `ChatListLoadingSkeleton.tsx`, `ChatListEmptyPanel.tsx`; main file still large — further extraction: data hook + scroll/search view. |
| G | G2 Split `MessageInput.tsx` | **Partial** | `messageInputDraftUtils.ts`, `MessageInputImagePreviewStrip.tsx`; core composer still in `MessageInput.tsx`. |
| G | G3 Trim `chatLocalApply.ts` | **Done** | Facade `chatLocalApply.ts` re-exports; modules: `chatLocalApplyBulk`, `Cursor`, `SyncTimers`, `Write`, `PatchFields`, `Pull`, `SocketInbound`, `ThreadLoad`. |
| H | H1 Windowed Dexie thread load | **Done** | Dexie v14 `[contextType+contextId+chatType+sortKey]` + `sortKey` on rows; v15 migration recomputes keys after lex seq encoding. `loadLocalThreadBootstrap` / indexed tail + `loadLocalMessagesOlderThan`; `computeMessageSortKey` (`chatMessageSort.ts`); reconcile path `loadLocalMessagesForThread` still full ordered read. |
| H | H2 Socket inbound reliability | **Done** | `socketEventsStore`: per-room FIFO + `takeChatRoomQueue`, `chatRoomPushSeq`; list / user / group queues + seq fields; `logChatSocketQueueTrim` when caps trim; `syncRequiredEpoch` + baseline ref + `lastSyncRequired` hybrid in `useGameChatSocket`; `useChatListSocketEffects` / `playersStore` / `useGroupChannelUnreadCounts` drain queues. |
| H | H3 Persistent storage + eviction UX | **Done** | `chatPersistentStorage.ts`: `ensureChatPersistentStorageOnce()` + `probeChatStoragePressure()` from `runForegroundSync` when authenticated; `logChatPersistentStorageDenied` / `logChatStoragePressure` in `chatDiagnostics.ts` (console; no in-app banner yet). |
| H | H4 Read cursor + unread aggregation | **Done** | `ChatReadCursor` + migration backfill from receipts; merge on mark-read paths; unread counts use receipt **or** cursor (`chatReadUnreadSql`); `MESSAGES_READ_BATCH` + per-message receipts unchanged; user merge remaps cursors. **Deploy:** apply Prisma migration before relying on unread SQL in prod (see **§11**). |
| H | H5 Socket.IO horizontal scale | **Done** | Optional `REDIS_URL` / `SOCKET_IO_REDIS_URL` → `@socket.io/redis-adapter` + static `createClient` typing; `notify-user-{userId}` + `notify-developers` rooms; user-chat / invites / wallet / unread / game-updated direct path use `io.to()`; room membership queries use `fetchSockets`; `messageDeliveryAttempts` / `connectedUsers` per-process. **Ops:** if URL is set and Redis connect fails, process still starts without adapter (**split-brain** risk for multi-replica); validate two nodes + one Redis in staging (see **§11**). |
| H | H6 Local search v2 | **Done** | v13 `messageSearchTokens` + token intersect → chunked `bulkGet` → substring verify; caps `MAX_TOKEN_CANDIDATE_IDS` (6000, **desc `localeCompare` id** before slice for CUID skew) + `GLOBAL_MATCH_MAX` (1200) + `SCAN_CAP` scan fallback; `hasMoreLocal` merges section pagination + truncation flags. `ChatMessageSearchResults`: **`localSearchEpoch` + ref** for device page size (no duplicate fetch on query change). GROUP buckets from `threadIndex` `listFilter` + `itemJson` stub; empty index → user/group section. |
| H | H7 Sync seq contract | **Done** | `serverSyncSeq` on **create, edit, delete, delivery state** (`updateMessageState`); idempotent create **`serverSyncSeq ?? headSeq`**; client `MESSAGE_CREATED` / compact full message use row seq; **`MESSAGE_STATE_UPDATED`** → `stateUpdated` patch sets `serverSyncSeq` on apply. **Reactions / poll votes / etc.** do **not** bump `ChatMessage.serverSyncSeq` (sync log only); Prisma comment documents this. |
| H | H8 Multi-asset send semantics | **Done** | All-or-nothing batch upload + `uploadChatImageFileWithRetry` (composer + outbox); `ChatImageBatchUploadError` + per-slot retry UI (`MessageInputImagePreviewStrip`); video/docs still future (Phase D). |
| H | H9 Chat list reactivity | **Done** | `useLiveQuery` on Dexie `threadIndex` (`useChatListThreadIndexLive.tsx`); debounced `mergeChatListFromThreadIndexDexie` + `threadIndexLiveMergeSig` (lastMessage id / outbox state) in `useChatListModel.tsx`. |
| H | H10 Product UX parity | **Done** | Forward (share or clipboard) + external URL strip + favicon; ticks: `SENT` / `DELIVERED` / `READ` in `MessageBubble`. **DELIVERED** persisted: `MessageService.tryPromoteToDeliveredWhenRecipientsAcked` on confirm-receipt — USER/GAME/BUG require all recipients acked; **GROUP** first ack; `MESSAGE_STATE_UPDATED` + `chat:message-updated`. Edit history still backlog. |

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

- Dexie DB `BandejaChatLocal` (`chatLocalDb.ts`): `messages`, `chatSyncCursor`, `outbox`, **`outboxMediaBlobs`**, `chatThreads`, `threadIndex`, `messageContextHead`, `threadScroll`, **`messageRowHeights`**, **`chatDrafts`**, **`mutationQueue`**, **`messageSearchTokens`** — **current schema v15** (v12 `searchText`; v13 `messageSearchTokens`; v14 `[contextType+contextId+chatType+sortKey]` + `sortKey`; v15 recomputes `sortKey` after encoding change).
- Apply path: `chatLocalApply*.ts` (barrel + pull/write/patch/socket/thread-load), `chatSyncScheduler.ts`, `chatSyncBatchWarm.ts`; sync event pages: worker fetch/parse + main patch apply (`chatSyncEventsToPatches.ts`, `chatSyncApplyPatches.ts`).
- Delivery confirm batching: `chatDeliveryConfirmBatcher.ts` → `POST /api/chat/messages/confirm-receipt-batch`.
- Row height cache: `chatMessageHeights.ts` (Dexie + in-memory LRU); consumed by `MessageList.tsx` (TanStack Virtual, dynamic overscan, tail-id preload signature).
- Drafts: `draftStorage.ts` (Dexie `chatDrafts` + idb-keyval dual-write / migration); cleared with `clearChatLocalStores`.
- Send path: `chatMessageQueueStorage.ts` (outbox + **`outboxMediaBlobs` in one `transaction` on enqueue**; **`revokeOutboxRehydrateBlobUrls` on `remove`**) → `chatSendService.ts` (retries, deadline; strict pending-blob checks; **`logChatOutboxBlobMismatch`**) → `applyQueuedMessagesToState.ts` (rehydrate, **`registerOutboxRehydrateBlobUrls`**, mark `failed`, **`queueMicrotask`** send).
- Offline mutations: `chatMutationEnqueue.ts`, `chatMutationFlush.ts` (`navigator.locks` when available), `chatMutationQueueStorage.ts`, `chatUnifiedOfflineFlush.ts` (unified **`bandeja-chat-unified-offline-flush-v1`** lock + `requestChatOfflineBackgroundSync`), `chatBackgroundSyncRegister.ts`, `chatBackgroundSync.ts`, `foregroundChatSyncRegistry.ts` (avoids `networkStatus` ↔ `appLifecycle` import cycle). **PWA:** `public/sw.js` Background Sync tag `chat-offline-flush`; **`main.tsx`** registers SW (web only) + `initChatBackgroundSyncClient()`.
- UI: `GameChat` + hooks, `ChatList`, `MessageList`, `MessageInput`.
- Media: `chatMediaCache.ts` (Cache API; quota **`logChatMediaCacheQuota`**); `FullscreenImageViewer.tsx` warms full-size cache on open for remote URLs.

**Backend**

- REST under `/api/chat`, sync: `/sync/head`, `/sync/events`, `/sync/batch-head`; **`/messages/confirm-receipt-batch`** for batched delivery marks; **`GET /api/health`** (light JSON for SW / reachability probe; same shape as root `/health`).
- **`ChatMutationIdempotency`** Prisma model + `ChatMutationIdempotencyService`: optional `clientMutationId` on edit / delete (query) / reactions / pin / unpin; cached JSON response on replay; weekly prune when `CHAT_MUTATION_IDEM_RETENTION_DAYS` > 0 (see `chatSyncStatsScheduler.service.ts`). **Deploy:** run migration `20260405120000_chat_mutation_idempotency`.
- `ChatSyncEvent` + `ConversationSyncState`; types include read batch, pins, thread invalidate, etc.
- Socket: `chat:*` events, rooms per context; **`typing-indicator` payloads include `timestamp`** (client stale filter).

**Gaps** (vs full Telegram-proof target): **`/chat/sync/events` response** still **structured-cloned** to main and **patch conversion + Dexie apply** run on main (worker does not emit patch messages); send remains **outbox** (mutations separate queue, unified flush drains both); idempotency rows grow until retention env set; **Web Locks** missing on some clients → weaker multi-tab serialization; **reconcile / full-thread paint** still uses ordered full read for `loadLocalMessagesForThread` (bootstrap + `loadOlder` are windowed/indexed); **socket inbound queues** are capped — extreme bursts still drop oldest after `logChatSocketQueueTrim`; **Phase F** improves background flush but **cannot drain Dexie with zero open tabs** (no queue logic in SW); Phase **C exit criteria** (profile: 500+ sync events vs input latency) **not instrumented** in-repo; **`ChatList.tsx` / `MessageInput.tsx` / `useChatListModel.tsx`** still large (Phase G partial); optional server-side sync event compaction window not implemented. H4/H5/H6/H7 address read cursor, Redis adapter, search v2 tokens, and sync seq on server; see **Phase H** table.

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
| C1 | **Web Worker (or SharedWorker) for sync** | ~~Implemented (pragmatic):~~ Worker **fetch + `JSON.parse`** only; main **`processDeletedUsers`** then **`chatSyncEventsToPatches`** → **`applyChatSyncPatchesInSlice`** (`bulkPut` per slice) inside **`withChatLocalBulkApply`** + Dexie tx. ~~Original doc:~~ worker-produced patches over `postMessage` — skipped so i18n/deleted-user processing stays on main. SharedWorker / worker-side Dexie still optional. |
| C2 | **SQLite + OPFS (optional later)** | Evaluate `wa-sqlite` + OPFS for bulk read/write and FTS; migration tool from Dexie export/import once per device. **Only after** worker protocol is stable. |
| C3 | **Prefetch hot threads** | ~~Done:~~ v11 `chatThreads` open stats + indexes; `GameChat.tsx` → `recordChatThreadOpened`; idle callback from `chatSyncBatchWarm` bootstrap + `appLifecycle` foreground; `pullMissedAndPersistToDexie` + `enqueueChatSyncPull` (COOP); **cellular skipped** on Capacitor only. |

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
| E1 | **Local search index** | ~~Done:~~ v12 `searchText` on `ChatLocalRow`; `chatLocalMessageSearchText.ts` (aligned with server normalization); `chatLocalMessageSearch.ts` + `ChatMessageSearchResults` merge with API / offline-only. |
| E2 | **Delta / compact sync payloads** | ~~Done:~~ compact `MESSAGE_UPDATED` + client `patchMessage`; if message absent locally, `getChatMessageById` + `persistChatMessagesFromApi` after tx; single-message read → `MESSAGES_READ_BATCH`; `compression` on API app; optional compaction window still future. |

**Exit criteria:** Offline search returns results for cached threads; sync payload size down on large catch-up (measure before/after).

---

### Phase F — Background and native

| ID | Work | Details |
|----|------|---------|
| F1 | **Service Worker: Background Sync** | ~~Done:~~ **`chat-offline-flush`** via `SyncManager.register` (`chatBackgroundSyncRegister.ts`), triggered from `scheduleUnifiedChatOfflineFlush` and on **web** `visibilitychange` → `hidden` (`chatBackgroundSync.ts`). SW (`public/sw.js`): **`sync`** → `clients.matchAll` → **one** client (`pickFlushClient`: focused visible → visible → any) → **MessageChannel** (`CHAT_OFFLINE_FLUSH_REQUEST` / `CHAT_OFFLINE_FLUSH_ACK`); **`event.waitUntil` rejects** if no ACK within **30s** (or `postMessage` throws) so Chromium can **retry** one-shot sync. Then **`GET /api/health`** else **`GET /health`** (credentials, `no-store`). Client: **`event.source === navigator.serviceWorker`** before handling; runs `flushAllChatOfflineQueues()`. **Unified flush** wrapped in **`bandeja-chat-unified-offline-flush-v1`** (`chatUnifiedOfflineFlush.ts`) alongside existing mutation lock. SW **does not** intercept `/api/*` fetches. |
| F2 | **Capacitor** | ~~Done (pragmatic):~~ **No service worker** (`main.tsx`). **`flushAllChatOfflineQueues()`** on **`App` `appStateChange` `!isActive`** (`appLifecycle.service.ts`). **`@capacitor/network`** `networkStatusChange` → **`triggerForegroundChatSync`** (existing) covers reconnect. **Not implemented:** native **Background Fetch** / **BGTaskScheduler** plugins — would duplicate policy; revisit if product requires true headless upload. |

**Platform limits (document for support / QA)**

| Platform | F1 (Background Sync) | Flush path |
|----------|----------------------|------------|
| **Chrome / Edge / Android Chrome (PWA)** | One-shot sync when supported; **retry** on ACK timeout | Tab/window + SW message + optional sync event |
| **iOS Safari, iOS WKWebView, in-app browsers** | **Unreliable / absent** | Foreground, **`visibilitychange` → visible**, **`online`**, Capacitor **resume** |
| **Capacitor native** | N/A (SW not registered) | **Backgrounding** → immediate flush attempt; **resume** → `runForegroundSync` |
| **All (architectural)** | If **no** `WindowClient` exists, SW only **probes** `/api/health` / `/health` — **queues stay in Dexie** until next app open | — |

**Exit criteria:** Best-effort drain when a client exists + online + authenticated (existing guards in `flushChatMutationQueue` / outbox); **documented** limits above; no claim of headless Dexie flush without a running page.

---

### Phase G — Code health

| ID | Work | Details |
|----|------|---------|
| G1 | **Split `ChatList.tsx`** | ~~Partial:~~ module cache + loading skeleton + empty-state panel extracted; remaining: data hook, scroll/search body, socket subscription effects. |
| G2 | **Split `MessageInput.tsx`** | ~~Partial:~~ draft retry/constants/cache + image preview strip; remaining: attach stack, voice, translation bar, send pipeline. |
| G3 | **Trim `chatLocalApply.ts`** | ~~Done:~~ `chatLocalApply.ts` is a thin facade; pull loop, socket inbound, writes, patches, thread load, cursor, sync timers, bulk suppress in separate files. |

**Exit criteria:** No file > ~600 lines without strong reason; imports remain tree-shake friendly. *(Chat list + message input still above budget; continue incremental splits.)*

---

### Phase H — Telegram-scale (next wave)

Priority order for execution (see **§8**):

| ID | Work | Details |
|----|------|---------|
| H1 | **Windowed Dexie thread load** | ~~Done:~~ v14–v15 `sortKey` + compound index; `chatLocalApplyThreadLoad.ts` tail window + indexed `loadLocalMessagesOlderThan`; full ordered read retained for reconcile merge. |
| H2 | **Socket inbound reliability** | ~~Done:~~ FIFO queues + seq, `takeChatRoomQueue` / list & user drains, trim logging, `syncRequiredEpoch` burst handling in `useGameChatSocket`. |
| H3 | **Storage persistence** | ~~Done:~~ `chatPersistentStorage.ts` + foreground hooks; diagnostics logs (persist denied + quota pressure); UI surfacing optional. |
| H4 | **Read cursor + unread** | ~~Done:~~ `ChatReadCursor` (`readMaxServerSyncSeq` + `readMaxCreatedAt` + `readMaxMessageId` per user/context/chatType); merge on mark-read; unread SQL treats receipt **or** cursor as read; migration backfills from receipts; receipts + `MESSAGES_READ_BATCH` unchanged. **Prod:** **§11** (migration gate). |
| H5 | **Multi-instance sockets** | ~~Done:~~ Optional Redis adapter via `REDIS_URL` / `SOCKET_IO_REDIS_URL`; `notify-user-*` / `notify-developers` rooms; per-process `connectedUsers` / `messageDeliveryAttempts` documented. **Prod:** **§11** (Redis split-brain if URL set + connect fails). |
| H6 | **Local search v2** | ~~Done:~~ Token index + intersect + chunked `bulkGet`; global/candidate/scan caps + sorted id cap; `hasMoreLocal` + ref/`localSearchEpoch` load-more (no double-fetch on new query); GROUP via `threadIndex`. |
| H7 | **Sync seq contract** | ~~Done:~~ Row `serverSyncSeq` for create/edit/delete/state; deduped create; client sync patches aligned; reactions etc. log-only on row (see Prisma comment). |
| H8 | **Multi-asset send** | ~~Done:~~ all-or-nothing + retries (`chatImageUploadRetry.ts`, `messageInputImageUpload.ts`, `chatSendService.ts`); failed-slot retry in composer (`MessageInput` / `MessageInputImagePreviewStrip`). |
| H9 | **Chat list reactivity** | ~~Done:~~ `useChatListThreadIndexLive` + `mergeChatListFromThreadIndexDexie` + `threadIndexLiveMergeSig` in `useChatListModel.tsx`; `chatListHelpers.ts`. |
| H10 | **UX parity backlog** | ~~Done:~~ forward (`chatForwardClipboard.ts`, `GameChat` / `UnifiedMessageMenu`); link preview (`MessageExternalLinkPreview`); ticks + **persisted DELIVERED** (`message.service.ts` + `socket.service.ts` on confirm-receipt). Edit history optional. |

**Exit criteria:** 10k local messages/thread: open without full-thread RAM spike; burst socket updates: zero dropped list/thread patches; read/unread and socket layer sane at 100+ chats; background flush (**Phase F**) implemented for “send while backgrounded” within **platform limits** (see Phase F table).

---

## 5. Backend Additions (Cross-Cutting)

| Need | Suggestion |
|------|------------|
| Batch read API | `POST /chat/mark-all-read` (existing) used by queued `mark_read_batch`; **Phase H4:** read-up-to by `syncSeq` or `messageId` as primary model; batch events remain for sync log. |
| Unread at scale | **H4 (partial):** `ChatReadCursor` + unified unread SQL (receipt OR cursor); optional future: denormalized `unreadCount` on inbox rows to skip counts entirely. |
| Idempotent non-create ops | ~~Implemented:~~ `clientMutationId` + `ChatMutationIdempotency` for edit, delete, reactions, pin, unpin (payload hash where applicable). |
| Sync payload size | Document max events per page; consider field-level diff for updates. |
| Retention | Keep `ChatSyncEvent` retention aligned with client cursor recovery (`THREAD_LOCAL_INVALIDATE` / full resync story documented). |
| Multi-node | **H5:** Redis adapter when `REDIS_URL` / `SOCKET_IO_REDIS_URL` set; same URL for all API replicas; `messageDeliveryAttempts` in-process. **Gap:** adapter attach errors are logged only—multi-replica + misconfigured Redis yields inconsistent fanout until ops fix or code adds fail-fast (see **§11**). |

Coordinate each change with `chatSyncEvent.service.ts` and affected services (`readReceipt`, `message`, `pinnedMessage`, etc.).

---

## 6. Testing and Verification (Manual / Staging)

- Airplane mode matrix: send, multi-message, edit, delete, reaction, open second tab.
- Cold start with 10k+ local messages: time to first interactive frame.
- Reconnect after 24h: cursor gap, stale head, `dispatchChatSyncStale` recovery.
- Storage quota: near-full device behavior (Dexie + Cache API).
- Multi-tab: one tab sends, other tab list + thread consistency.
- **H4:** After migration, spot-check unread badges vs mark-read on GAME / USER / GROUP; confirm no SQL errors if `ChatReadCursor` empty (receipt-only still works).
- **H5 (multi-instance):** Two app replicas + one Redis; open user chat on client tied to replica A, trigger message from path hitting replica B; confirm `notify-user-*` delivery. Reconnect developer account after `isDeveloper` toggles to refresh `notify-developers` membership.
- **H6 (local search):** Offline search ≥2 chars; hit cached thread; “Load more from this device” increases results without repeating the wrong limit after changing query; channel/market listing chats appear under the right section after `threadIndex` has been populated (open list once).
- **H7 (sync seq):** Edit + delete + delivery state change; pull/sync applies without reorder glitches; resend same `clientMutationId` returns stable ordering seq vs conversation head.
- **H8 (multi-image):** Offline/online send with 2+ images; induce one upload failure → composer shows failed slot + retry; full send after all succeed; outbox path still retries per blob in `chatSendService`.
- **H9 (list live):** With main list open (no search), receive message in another tab or sync → row preview/order updates without full refetch; `threadIndex` must be populated for that context.
- **H10 (ticks + forward):** 1:1 chat: recipient opens thread → sender sees double gray (DELIVERED) then read receipts / READ as today; group: first member ack moves to DELIVERED; forward copies or opens share sheet; external URL shows preview row (favicon via Google; CSP/network may block image).
- **F (PWA, Chromium):** With pending mutation/outbox + DevTools **Application → Background Sync** (or `chrome://sync-internals` where applicable), trigger sync / close tab scenario — expect flush or retry after ACK timeout; confirm **`GET /api/health`** returns 200 on same origin as SPA when API is reverse-proxied under `/api`.
- **F (Capacitor):** Background app with queued work → foreground/resume → queues drain; airplane → online via native network listener → existing foreground sync + flush.

(Automated tests only if the team policy allows; current repo preference may skip test files.)

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Worker + Dexie complexity | Start with patch-based worker; single Dexie on main. |
| SQLite migration cost | Defer until offline queue + worker proven; one-time migration UX. |
| Background sync unreliable on iOS | Document; rely on foreground flush + push. |
| Duplicate mutations | Strict idempotency keys server-side. |
| Large thread open | **H1** — windowed reads; profile main-thread and IndexedDB read volume. |
| Browser eviction | **H3** — persistence + user-visible recovery if local DB cleared. |
| Multi-replica Socket.IO + Redis | **H5** — Staging proof with 2+ nodes; monitor logs for `Redis adapter failed`; consider fail-fast when URL set (not implemented in code yet). |
| Wrong unread after seq skew | **H4** — Cursor order ties to `serverSyncSeq` + `(createdAt, id)`; **H7** reduces seq drift; reconcile receipts as source of truth for historical rows. |
| Local search > caps | **H6** — Token candidate set and global match list are capped; rare queries may omit some hits; `hasMoreLocal` + load-more do not raise global caps (by design). |

---

## 8. Suggested Order of Execution

1. **A1, A2, A3** — immediate perceived performance and fewer requests.  
2. **B1–B5** — offline-first completeness.  
3. **D1** — attachment reliability.  
4. **C1** — scale to power users / large catch-up (worker fetch/parse + main patch `bulkPut`).  
4b. **C3** — hot-thread prefetch after C1 (uses `chatThreads` open stats).  
5. **E1, E2** — search and bandwidth.  
6. **F1, F2** — background completion ~~(implemented; see Phase F + **Implementation progress**)~~.  
7. **C2** — if Dexie becomes the bottleneck (pairs with **H6**).  
8. **G1–G3** — ongoing alongside phases above.  
9. **H1, H2, H3** — local thread windowing, socket reliability, storage persistence (highest leverage vs Telegram bar).  
10. **H4, H5** — read cursor + unread aggregation; Redis / multi-instance sockets.  
11. **H6, H7** — search depth + sync seq contract.  
12. **H8, H9, H10** — send semantics, list reactivity, UX parity backlog.

---

## 9. Key File Map (Reference)

| Area | Primary files |
|------|----------------|
| Local DB | `Frontend/src/services/chat/chatLocalDb.ts` (v15 `sortKey` migration; v14 compound `[contextType+contextId+chatType+sortKey]`; v13 `messageSearchTokens`; v12 `searchText`; v10 `outboxMediaBlobs`; v11 `chatThreads` open stats) |
| Phase E (search + compact sync) | `Frontend/src/services/chat/chatLocalMessageSearchText.ts`, `chatLocalMessageSearch.ts`, `chatLocalMessageSearchTokens.ts`; `Frontend/src/components/chat/ChatMessageSearchResults.tsx`; `Backend/src/utils/chatSyncMessageUpdatePayload.ts`, `Backend/src/app.ts` (`compression`) |
| Phase C (worker + patches + hot prefetch) | `Frontend/src/services/chat/chatSyncFetch.worker.ts`, `chatSyncFetchWorkerClient.ts`, `chatSyncEventsToPatches.ts`, `chatSyncEventTypes.ts`, `chatSyncApplyPatches.ts`, `chatSyncRowUtils.ts`, `chatHotThreadPrefetch.ts`, `chatThreadOpenStats.ts`, `chatThreadCursorKeyParse.ts`; `Frontend/src/services/appLifecycle.service.ts` (idle prefetch hook); `Frontend/src/pages/GameChat.tsx` (record opens) |
| API base + 401 (sync worker parity) | `Frontend/src/api/apiBaseUrl.ts`, `Frontend/src/api/handleApiUnauthorized.ts`, `Frontend/src/api/axios.ts` |
| Outbox blobs / thumb prefetch / diagnostics / persistence | `Frontend/src/services/chat/chatOutboxMediaBlobs.ts`, `chatOutboxRehydrateUrls.ts`, `chatDiagnostics.ts`, `chatPersistentStorage.ts`, `chatMediaThumbPrefetch.ts`, `chatMediaCache.ts` |
| Apply / sync | `Frontend/src/services/chat/chatLocalApply.ts` (facade), `chatLocalApplyBulk.ts`, `chatLocalApplyCursor.ts`, `chatLocalApplySyncTimers.ts`, `chatLocalApplyWrite.ts`, `chatLocalApplyPatchFields.ts`, `chatLocalApplyPull.ts`, `chatLocalApplySocketInbound.ts`, `chatLocalApplyThreadLoad.ts`; `chatSyncScheduler.ts`, `chatSyncBatchWarm.ts` |
| Delivery confirm batch | `Frontend/src/services/chat/chatDeliveryConfirmBatcher.ts`; route in `Backend/src/routes/chat.routes.ts`, handler in `chat.controller.ts` |
| Row heights | `Frontend/src/services/chat/chatMessageHeights.ts`, `Frontend/src/components/MessageList.tsx` |
| Drafts (local) | `Frontend/src/services/draftStorage.ts` (Dexie + idb-keyval) |
| Send / outbox rehydrate | `Frontend/src/services/chatSendService.ts`, `Frontend/src/services/chatMessageQueueStorage.ts`, `Frontend/src/services/applyQueuedMessagesToState.ts` |
| Offline mutations (Phase B) | `Frontend/src/services/chat/chatMutationEnqueue.ts`, `chatMutationFlush.ts`, `chatMutationQueueStorage.ts`, `chatMutationNetwork.ts`, `chatMutationEvents.ts`, `chatUnifiedOfflineFlush.ts`; `Frontend/src/utils/foregroundChatSyncRegistry.ts` |
| Phase F (background flush) | `Frontend/public/sw.js` (Background Sync + MessageChannel + probe); `Frontend/src/services/chat/chatBackgroundSyncRegister.ts`, `chatBackgroundSync.ts`; `Frontend/src/main.tsx` (SW register web-only, `initChatBackgroundSyncClient`); `Frontend/src/services/appLifecycle.service.ts` (Capacitor `!isActive` flush); `Backend/src/routes/index.ts` (`GET /api/health`) |
| Backend mutation idempotency | `Backend/src/services/chat/chatMutationIdempotency.service.ts`, `Backend/src/utils/chatClientMutationId.ts`; controllers in `chat.controller.ts` |
| Thread UI | `Frontend/src/pages/GameChat/useGameChatMessages.ts`, `useGameChatSocket.ts`, `useGameChatOptimistic.ts`, `useGameChatReactions.ts`, `useGameChatPinned.ts`, `useGameChatMutationRetry.ts`, `useGameChatInitialLoad.ts`, `useGameChatActions.ts` |
| List | `Frontend/src/components/chat/ChatList.tsx`, `chatListModuleCache.ts`, `ChatListLoadingSkeleton.tsx`, `ChatListEmptyPanel.tsx`, `Frontend/src/services/chat/chatThreadIndex.ts` |
| Virtual list | `Frontend/src/components/MessageList.tsx` |
| Fullscreen image (chat media) | `Frontend/src/components/FullscreenImageViewer.tsx` |
| Socket (FE) | `Frontend/src/services/socketService.ts` (typing filter, `confirmMessageReceipt` → batcher) |
| API | `Frontend/src/api/chat.ts` |
| Backend sync + socket | `Backend/src/services/chat/chatSyncEvent.service.ts`, `Backend/src/routes/chat.routes.ts`, `Backend/src/services/socket.service.ts` |
| Phase H (thread load) | `Frontend/src/services/chat/chatLocalApplyThreadLoad.ts`, `Frontend/src/utils/chatMessageSort.ts` (`computeMessageSortKey`), `Frontend/src/pages/GameChat/useGameChatMessages.ts`, `useGameChatActions.ts`, `Frontend/src/components/MessageList.tsx` |
| Phase H (socket FE) | `Frontend/src/store/socketEventsStore.ts`, `Frontend/src/store/playersStore.ts`, `Frontend/src/components/chat/useChatListSocketEffects.ts`, `Frontend/src/hooks/useGroupChannelUnreadCounts.ts`, `Frontend/src/pages/GameChat/useGameChatSocket.ts` |
| Phase H (read/unread BE) | `Backend/prisma/schema.prisma` (`ChatReadCursor`), `Backend/src/services/chat/readReceipt.service.ts`, `chatReadCursor.service.ts`, `chatReadUnreadSql.ts`, `unreadCountBatch.service.ts` |
| Phase H (multi-instance socket) | `Backend/src/services/socket.service.ts` (`createClient` + `createAdapter`, `REDIS_URL` / `SOCKET_IO_REDIS_URL`), `Backend/src/server.ts` (`await adapterReady`); deploy gates **§11** |
| Phase H8–H10 (send, list live, UX) | `Frontend/src/components/chat/messageInputImageUpload.ts`, `chatImageUploadRetry.ts`, `useChatListThreadIndexLive.tsx`, `chatListHelpers.ts` (`threadIndexLiveMergeSig`, `mergeChatListFromThreadIndexDexie`), `MessageBubble.tsx`, `MessageExternalLinkPreview.tsx`, `chatForwardClipboard.ts`, `GameChat.tsx` / `MessageList.tsx`; **DELIVERED:** `Backend/src/services/chat/message.service.ts` (`tryPromoteToDeliveredWhenRecipientsAcked`), `socket.service.ts` (`markSocketDelivered` / `markPushDelivered`) |

---

## 10. Definition of Done (Program Level)

- [x] All Phase A exit criteria met (see **Implementation progress**).  
- [x] Offline mutation queue covers primary user actions (send via **outbox**; edit/delete/reaction/pin/unpin/read-via-**mark_read_batch** in **mutationQueue**).  
- [ ] No critical path operation blocks the main thread beyond agreed budget during large sync.  
- [x] Outbox media survives process kill (Dexie `outboxMediaBlobs` + rehydrate in `applyQueuedMessagesToState`).  
- [x] Documented limits for background sync per platform (Phase F **Platform limits** table + gaps note).  
- [ ] Large components split (Phase G: `chatLocalApply` split done; `ChatList` / `MessageInput` / `useChatListModel` partial); onboarding path for new contributors < 1 day for chat area.  
- [x] Phase E: local search over cached messages + compact `MESSAGE_UPDATED` sync payloads + gzip API responses.  
- [x] Phase H1: windowed bootstrap + indexed `loadOlder`; full-thread ordered read remains for reconcile (see **Implementation progress**).  
- [x] Phase H2: FIFO queues + caps with trim logging; staging verification recommended under burst load.  
- [x] Phase H3: `navigator.storage.persist()` once + `storage.estimate` pressure logging on foreground sync.  
- [x] Phase H4 + H5: read/unread model scalable; multi-instance socket documented with production gates (**§11**).  
- [x] Phase H8–H10: multi-image send semantics, Dexie live list merge, forward + link preview + ticks; **DELIVERED** persisted on confirm-receipt (policy: all ack for USER/GAME/BUG, first ack for GROUP).
- [x] Phase F: Background Sync (web) + Capacitor backgrounding flush; `/api/health`; ACK / timeout retry contract documented in Phase F.

---

## 11. Production deployment — H4 & H5

| Gate | Action |
|------|--------|
| **Database** | Run Prisma migration that creates `ChatReadCursor` and backfills from `MessageReadReceipt` (e.g. `20260405140000_chat_read_cursor`). Skipping it breaks unread queries referencing the table. |
| **Single instance** | Omit `REDIS_URL` / `SOCKET_IO_REDIS_URL`: in-memory adapter; `notify-user-*` rooms still work on that process. |
| **Horizontal scale** | Set `REDIS_URL` or `SOCKET_IO_REDIS_URL` on **every** API/socket process (TLS: `rediss://` as supported by the `redis` client). `server.ts` awaits `adapterReady` before `listen`. |
| **Current code behavior** | `attachRedisAdapterIfConfigured` catches errors and **does not exit**; a replica with a bad URL appears healthy but will not participate in cross-node pub/sub. Treat Redis connectivity as a **release checklist** or add env-gated `process.exit(1)` / readiness failure if you require strict guarantees. |
| **Typing / delivery maps** | `typing-indicator` expiry and `messageDeliveryAttempts` remain **per process**; do not use local `connectedUsers` for cross-node “is user online” in cluster mode—room + `fetchSockets` paths are the intended approach. |
| **Global unread API** | H4 improves per-query logic; total unread still loops contexts (see **§5**). Plan denormalized counts if inbox endpoints become hot. |

---

## 12. Production deployment — Phase F (PWA + API)

| Gate | Action |
|------|--------|
| **Same origin / proxy** | SPA and **`/api`** should share the **same origin** as the registered SW (or reverse-proxy **`/api/*`** and **`/api/health`** to the Node app). Static-only CDN **without** `/api` → probe may miss API; flush still works when a **tab is open** and cookies hit the real API. |
| **Rate limits** | **`GET /api/health`** goes through normal **`/api/`** middleware (e.g. rate limiter). High-frequency SW probes alone should be negligible; monitor if abused. |
| **Capacitor** | Confirm **`appStateChange`** fires on background; no SW — users rely on **resume** + **network** listeners for catch-up. |

---

*Document version: 2.8 — Phase F done: Background Sync + MessageChannel ACK / timeout retry, unified flush Web Lock, `/api/health`, Capacitor inactive flush; platform limits + deploy §12.*
