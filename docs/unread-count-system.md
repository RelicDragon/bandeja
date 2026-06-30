# Unread-Count System

A full description of how unread message counts work end-to-end in PadelPulse: how they are computed on the backend, how they are stored and coordinated on the frontend, how they update in real time, and where/how they are displayed (including grouping).

> This is reference documentation distilled from the source. File paths and line numbers are accurate to the `dev` branch at the time of writing but will drift over time — treat them as entry points, not pins.

---

## TL;DR

- **There is no cached unread counter anywhere.** Every unread number is **derived on demand** by counting `ChatMessage` rows that are "not read" relative to two sources: per-message `MessageReadReceipt` rows and a per-context `ChatReadCursor` high-water mark. The cursor exists purely as a query optimization so "everything below here is read" is an O(1) comparison.
- **The server is authoritative for counts.** It pushes **absolute** counts (not deltas) over the `chat:unread-count` socket event. The frontend store never increments counts on incoming messages — it only applies server-provided absolute values.
- **Frontend source of truth is one Zustand store**, `useUnreadStore`, holding a sparse `byContext` map (`GAME:<id>` / `USER:<id>` / `GROUP:<id>` → count) plus a derived `totals` aggregate. UI reads go through selector hooks in `useUnreadBridge.ts`, all gated by a "warm" check.
- **Counts are grouped in two places:** server-side into `totals` buckets (games, userChats, bugs, groups, channels, marketplace, myGames, pastGames), and client-side by reclassifying the single `GROUP:` namespace via per-channel metadata.
- **Muted GROUP channels are excluded from all aggregate badges** but still show their per-row count.
- **Mark-read is optimistic** with rollback: the store clears instantly, stashes the previous value, and restores it if the API call fails.

---

## Architecture at a glance

```
                        ┌──────────────────────────────────────────────────┐
   BACKEND              │  Tables: ChatMessage, MessageReadReceipt,         │
                        │           ChatReadCursor, ChatMute, ChatSyncEvent │
                        │                                                  │
                        │  Unread = COUNT(messages NOT read by viewer)      │
                        │  Computed live via sqlMessageNotReadByViewer      │
                        │                                                  │
                        │  REST:  /chat/unread-objects   (snapshot+totals) │
                        │         /chat/unread-count      (global badge)   │
                        │         /chat/mark-context-read (mark read)      │
                        │         /chat/mark-all-read                      │
                        │  Socket: chat:unread-count  (absolute, per user) │
                        │          chat:read-receipt                         │
                        └──────────────┬─────────────────┬──────────────────┘
                  snapshot (REST)      │                 │  socket delta (absolute)
                                       ▼                 ▼
                ┌────────────────────────────────────────────────────────┐
   FRONTEND     │  useUnreadStore  (src/store/unreadStore.ts)            │
   (memory)     │   byContext[key]: number   (sparse, positive only)     │
                │   totals (recomputed on every mutation)                │
                │   groupChannelMeta, mutedGroupIds                      │
                │   markInFlight, markReadConfirmed, fetchedAt           │
                └────┬──────────────────────────────┬────────────────────┘
       store → Dexie │                              │ selectors
       mirror        │                              ▼
                    ▼                  ┌─────────────────────────────────────┐
   ┌────────────────────────────┐     │  useUnreadBridge hooks              │
   │  Dexie threadIndex rows    │     │   → BottomTabBar badges             │
   │  .unreadCount (offline     │     │   → chat list row badges            │
   │   mirror + per-msg +1)     │     │   → MyTab "mark all" banner         │
   └────────────────────────────┘     │   → marketplace / subtab badges     │
                                      └─────────────────────────────────────┘

   User opens thread / sends message
     → enterContextAndMarkRead / markContextReadOnUserActivity
        → optimisticClear(key)        (stash prev in pendingRestoreByKey)
        → scheduleMarkReadNetwork     (280ms debounce)
        → POST /chat/mark-context-read
             ok:   applySocketDelta(0) + confirmMarkRead
             fail: restoreContext(prev) + refreshContext
```

---

# Part 1 — Backend

## 1.1 Data model

Relevant models in `Backend/prisma/schema.prisma`. The key insight: **read state is stored, unread is derived.**

### `ChatMessage` (L1162–1215)
The message row. Fields used by the unread engine:
- `chatContextType` — `GAME | USER | GROUP | BUG`
- `contextId` — the game id, user-chat id, or group-channel id
- `chatType` — `PUBLIC | PRIVATE | ADMINS` (games have all three)
- `senderId` — own messages never count as unread for the sender
- `serverSyncSeq` (L1187) — monotonic per-context sequence; the primary axis of the read cursor
- `createdAt`, `id`, `deletedAt`
- Indexes `[chatContextType, contextId, serverSyncSeq]` (L1204) and `[contextId]` (L1212) back the count queries.

### `MessageReadReceipt` (L1480–1491)
One row = "user X has read message Y." Inserted idempotently.
```prisma
model MessageReadReceipt {
  id        String      @id @default(cuid())
  messageId String
  userId    String
  readAt    DateTime    @default(now())
  @@unique([messageId, userId])   // idempotent: one receipt per (message, user)
  @@index([messageId])
  @@index([userId])
}
```

### `ChatReadCursor` (L1448–1464)
A **per-(user, context, chatType) high-water mark** — the position of the most-read message. Position is a lexicographic 3-tuple `(serverSyncSeq, createdAt, id)`.
```prisma
model ChatReadCursor {
  userId               String
  chatContextType      ChatContextType   // GAME | USER | GROUP | BUG
  contextId            String
  chatType             ChatType          @default(PUBLIC)
  readMaxServerSyncSeq Int               @default(-1)
  readMaxCreatedAt     DateTime          @default("1970-01-01T00:00:00.000Z")
  readMaxMessageId     String            @default("")
  @@unique([userId, chatContextType, contextId, chatType])
}
```

### Supporting models
- **`ChatMute`** (L1278–1289) — `@@unique([userId, chatContextType, contextId])`. Muted contexts are excluded from totals and from post-send unread emits.
- **`ConversationSyncState`** (L1725–1732) — per-context sync head (`maxSeq`).
- **`ChatSyncEvent`** (L1734–1745) — append-only event log, `@@unique([contextType, contextId, seq])`.
- **`UserChat`** (DM), **`GroupChannel`** — carry `lastMessagePreview` but **no unread column**.

**Enums**: `ChatContextType { GAME, BUG, USER, GROUP }` (L1700); `ChatType { PUBLIC, PRIVATE, ADMINS }` (L1678).

## 1.2 The two read mechanisms (and why both)

Read state is recorded **two ways simultaneously**:

1. **Per-message receipts** (`MessageReadReceipt`) — exact, message-level precision. Needed for "this old message was read but a newer one wasn't."
2. **High-water cursor** (`ChatReadCursor`) — fast "everything at or below this position is read" check, so the unread query can exclude whole ranges with a single comparison instead of a giant `IN` of receipt rows.

Every mark-read operation writes **both**.

### Cursor merge logic — `Backend/src/services/chat/chatReadCursor.service.ts`
- `cmpPos` (L13–21) — orders positions by `seq`, then `createdAt`, then `id` (tie-breaker). Treats null `serverSyncSeq` as `-1`.
- `mergeFromMessage` (L34–78) — loads the existing cursor; if the candidate message position is **greater**, updates the three `readMax*` fields. Idempotent and out-of-order safe.
- `mergeFromMessages` (L80–106) — batches: picks the best message per `(contextType, contextId, chatType)` then merges each.

## 1.3 The unread predicate — `Backend/src/services/chat/chatReadUnreadSql.ts`

The heart of the system. `sqlMessageNotReadByViewer(viewerUserExpr)` produces a SQL fragment used in **every** unread query. A message is **read** if either a receipt exists OR the cursor is at-or-beyond it; **unread = NOT(read)**:

```sql
NOT (
  EXISTS (SELECT 1 FROM "MessageReadReceipt" r
          WHERE r."messageId" = m.id AND r."userId" = ${viewer})
  OR
  EXISTS (SELECT 1 FROM "ChatReadCursor" c
          WHERE c."userId" = ${viewer}
            AND c."chatContextType" = m."chatContextType"
            AND c."contextId" = m."contextId"
            AND c."chatType" = m."chatType"
            AND (
              COALESCE(m."serverSyncSeq", -1) < c."readMaxServerSyncSeq"
              OR (COALESCE(m."serverSyncSeq", -1) = c."readMaxServerSyncSeq"
                  AND m."createdAt" < c."readMaxCreatedAt")
              OR (COALESCE(m."serverSyncSeq", -1) = c."readMaxServerSyncSeq"
                  AND m."createdAt" = c."readMaxCreatedAt"
                  AND m."id" <= c."readMaxMessageId")
            ))
)
```

Exports:
- `sqlMessageNotReadByUser(userId)` (L33) — binds a literal userId.
- `sqlMessageNotReadByViewerColumn(col)` (L38) — for batch multi-viewer queries (correlated column in a `VALUES` join).

## 1.4 Counting queries

### Batched counts — `Backend/src/services/chat/unreadCountBatch.service.ts`
`UnreadCountBatchService` batches to stay under Postgres `IN`-clause limits (`IN_CLAUSE_BATCH_SIZE = 500`):
- `getUnreadCountsByContext(type, ids[], userId)` → `Record<id, number>` for USER/BUG/GROUP. Filters: `deletedAt IS NULL`, `senderId IS NOT NULL`, `senderId != userId`.
- `getGameUnreadCountsByContextAndType(gameIds[], userId)` — grouped by `(contextId, chatType)` because games have PUBLIC/PRIVATE/ADMINS chats.
- `getGameUnreadCount(gameId, userId, chatTypeFilter[])` — single-game scalar.
- `buildGameChatTypeFilter(participant, gameStatus, isParentAdminOrOwner)` (L90–101) — which game chat types a user can see unread for:
  - `PUBLIC` — always
  - `PRIVATE` — only if `status === 'PLAYING' || 'NON_PLAYING'`
  - `ADMINS` — only if role is `OWNER`/`ADMIN` (incl. parent-league-game admins)

### The read/unread facade — `Backend/src/services/chat/readReceipt.service.ts` (754 lines)
- `markMessageAsRead(messageId, userId)` (L15–78) — tx: upsert receipt, merge cursor, append `MESSAGES_READ_BATCH` sync event.
- `markAllMessagesAsRead(gameId, userId, chatTypes[])` (L311–396), `markUserChatAsRead` (L398–451).
- `markAllMessagesAsReadForContext(type, id, userId, chatTypes?)` (L552–753) — unified dispatcher. The GROUP branch (L562–697) uses a single `INSERT ... SELECT ... ON CONFLICT DO NOTHING`, computes `DISTINCT ON (chatType)` winner messages to merge the cursor, and paginates sync-event emission by `readAt`. Runs with a **120s** tx timeout.
- `getUnreadCountForContext` (L456–486), `getUserChatsUnreadCounts` / `getGroupChannelsUnreadCounts` / `getGamesUnreadCounts` — batched variants.
- `getUnreadCountsForContextForUsers(type, id, userIds[])` (L489–547) — **multi-viewer single-context** count via `VALUES` join; powers the per-recipient emit after a send. GAME falls back to parallel per-user queries; BUG always returns 0 (bugs route through their group channel).

**Important:** counts are always computed on the fly. There is no denormalized `unreadCount` column on `GroupChannel`, `UserChat`, or `Game`.

## 1.5 Totals / badge aggregation — `Backend/src/services/chat/unreadSnapshot.service.ts` (309 lines)

This is the badge engine.

**`UnreadTotals`** (L13–23):
```ts
type UnreadTotals = {
  all: number; games: number; userChats: number; bugs: number;
  groups: number; channels: number; marketplace: number;
  myGames: number; pastGames: number;   // last two always 0 here — overlaid by server
};
```

**`getSnapshot(userId)`** (L181–200):
1. `UnreadObjectsService.getUnreadObjects(userId)` — per-object counts (see below).
2. Load muted GROUP context ids via `ChatMuteService.getMutedChats`.
3. `buildByContextFromUnreadObjects` (L67–90) — flatten into `byContext` keyed `"TYPE:id"`.
4. `computeTotals(byContext, { groupChannelMeta, mutedGroupIds })` (L123–171) — sum per category; **muted groups skipped**. `all = games + userChats + bugs + groups + channels + marketplace`.

- `getTotalsAll(userId)` (L202–205) — shortcut: `snapshot.totals.all` (the app-badge number).
- `markContextRead(userId, {type, id, gameChatTypes})` (L207–236) — delegates to the right `mark*AsRead`, returns `{ markedCount, unreadCount: 0, syncSeq }`.
- `markAllAndSnapshot(userId)` (L238–287) — clears everything; emits `chat:unread-count` with `0` for each affected context.

### Per-object counts — `Backend/src/services/chat/unreadObjects.service.ts` (327 lines)
`getUnreadObjects(userId)` (L316–326) runs five queries in parallel, each returning **only items with `unreadCount > 0`** (sparse payload):
- `getGamesWithUnread` — batches 30 at a time (`GAME_COUNT_CONCURRENCY = 30`), hydrates only games with `count > 0`.
- `getUserChatsWithUnread` — DMs.
- `getBugsWithUnread` — bug group channels.
- `getGroupChannelsWithUnread` — non-bug, non-market channels; **muted filtered before counting**.
- `getMarketItemChannelsWithUnread` — marketplace listing channels.

## 1.6 Socket events

### Notifier indirection
- `chatNotifier.ts` — `ChatNotifier` interface; `emitUnreadCountUpdate(type, id, userId, unreadCount, lastMessage?)`.
- `socketChatNotifier.ts` — delegates every method to `(global as any).socketService`.

### The emit — `Backend/src/services/socket.service.ts`
`emitUnreadCountUpdate` (L1264–1279):
```ts
const eventName = 'chat:unread-count';
this.io.to(`notify-user-${userId}`).emit(eventName, {
  contextType, contextId, unreadCount,
  ...(lastMessage ? { lastMessage } : {}),
});
```
Targeted to the per-user room `notify-user-${userId}` so **all of a user's devices/tabs** get it. Payload: `{ contextType, contextId, unreadCount, lastMessage? }`.

### When unread socket events fire
1. **On message send** — `message.service.ts:1164–1201`: after emitting `chat:message`, a `queueMicrotask` computes per-recipient unread via `getUnreadCountsForContextForUsers` and emits `chat:unread-count` to each (GROUP recipients filtered to exclude muted users).
2. **On mark-read** — every mark-read controller handler emits `chat:unread-count` with `0` for the acting user (`chat.controller.ts:1683`, `groupChannel.controller.ts:317`).
3. **On sender composing** — `MessageService.markSenderContextReadAfterSend` (`message.service.ts:501–554`): sending a message forces your own unread for that context to `0` and emits it. Fire-and-forget via `scheduleSenderContextReadAfterSend` (L556–570).
4. **On mark-all** — emits `0` for every affected context.

`emitChatEvent` (L801–854) handles `chat:message`, `chat:read-receipt` (carries `{ readReceipt: { userId, readAt, allRead } }` + `syncSeq`), `chat:reaction`, etc. `chat:read-receipt` is for per-message **ticks**, not unread counts.

## 1.7 API endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/chat/unread-count` | `{ count }` — global badge via `getTotalsAll` |
| GET | `/chat/unread-objects` | full `UnreadSnapshotDto` (objects + totals + byContext), rate-limited, 15s timeout |
| GET | `/chat/games/:gameId/unread-count` | `{ count }` |
| POST | `/chat/games/unread-counts` body `{ gameIds }` | `Record<gameId, number>` |
| GET | `/chat/user-chats/:chatId/unread-count` | `{ count }` |
| POST | `/chat/user-chats/unread-counts` body `{ chatIds }` | `Record<chatId, number>` |
| POST | `/chat/mark-context-read` body `{ contextType, contextId, gameChatTypes? }` | `{ markedCount, unreadCount: 0, syncSeq }` |
| POST | `/chat/mark-all-read` | cleared snapshot |
| POST | `/chat/mark-all-messages-as-read` | context-or-all mark-read |
| POST | `/chat/messages/:messageId/read` | `{ messageId, userId, readAt, syncSeq }` |
| POST | `/group-channels/unread-counts` body `{ groupIds }` | `Record<groupId, number>` |
| GET | `/group-channels/:id/unread-count` | `{ count }` |
| POST | `/group-channels/:id/mark-read` | mark-read result |

The **My Tab** aggregate (`me.controller.ts`, `mytabData.service.ts`) bundles `unreadCounts: Record<gameId, number>` in one call via `GameReadService.getMyGamesWithUnread`.

## 1.8 Sync protocol

### Shared contract — `packages/chat-contract/src/chatSyncEventType.ts`
```ts
ChatSyncEventType = { ..., MESSAGES_READ_BATCH, MESSAGE_READ_RECEIPT, ... }
```
`MESSAGES_READ_BATCH` is the event that drives unread invalidation on clients.

### Event log — `Backend/src/services/chat/chatSyncEvent.service.ts` (133 lines)
- `appendEventInTransaction` (L15–46) — atomically bumps `ConversationSyncState.maxSeq` (`INSERT ... ON CONFLICT DO UPDATE SET maxSeq = maxSeq + 1 RETURNING maxSeq`) then inserts a `ChatSyncEvent` row at that seq.
- `getEventsAfter(type, id, afterSeq, limit)` (L80–96) — clients poll this to catch up; page cap `MAX_SYNC_PAGE = 500`.
- `pruneEventsOlderThanDays(days)` (L125–132) — retention cleanup.

Every mark-read path appends `MESSAGES_READ_BATCH` with payload `{ userId, readAt, messageIds: [...] }`, chunked at `READ_SYNC_CHUNK = 400` ids. The returned `syncSeq` rides the `chat:read-receipt` emit so clients reconcile their local IndexedDB and recompute unread.

> Note: the frontend does **not** drive unread counts from the sync protocol. `MESSAGES_READ_BATCH` / `MESSAGE_READ_RECEIPT` only update per-message **read ticks** in the open thread. Unread counts come solely from `chat:unread-count`.

## 1.9 Auto-read of old messages — `unreadAutoRead.service.ts` + `unreadAutoReadScheduler.service.ts`
A daily cron (`0 4 * * *`) marks messages older than **1 month** (`CUTOFF_MONTHS = 1`) as read for every non-sender participant, then appends `MESSAGES_READ_BATCH` events. This bounds growth of the read tables and prevents stale unreads from accumulating forever.

---

# Part 2 — Frontend state & coordination

## 2.1 The main store — `Frontend/src/store/unreadStore.ts`

Single Zustand store; the source of truth for all badges.

### State shape
```ts
type UnreadStoreState = {
  version: number;                              // snapshot version
  fetchedAt: number;                            // epoch ms of last snapshot (the "warm" gate)
  byContext: Record<ContextKey, number>;        // sparse: only positive counts stored
  totals: UnreadTotals;                         // derived
  groupChannelMeta: Record<string, GroupChannelMeta>;  // classifies GROUP counts
  bugIdToChannelId: Record<string, string>;     // BUG wire id → GROUP channel id
  mutedGroupIds: Set<string>;                   // excluded from totals
  myGameIds: Set<string>;                       // client scope for myGames total
  pastGameIds: Set<string>;                     // client scope for pastGames total
  markInFlight: Set<ContextKey>;                // in-flight mark-read requests
  lastEnteredContextKey: ContextKey | null;
  refreshInFlight: Promise<void> | null;        // dedup for refreshAll
  // actions: refreshAll, setSnapshot, applySocketDelta, enterContextAndMarkRead,
  //          markAllRead, restoreContext, patchGroupChannelMeta, registerBugChannels,
  //          setMutedGroupIds, toggleMutedGroupId, setMyGamesScope, reset
};
```

### Keying
`ContextKey = "${'GAME'|'USER'|'GROUP'}:${id}"`. The store **only ever holds these three prefixes**. `BUG` is a wire-only type, normalized to `GROUP:<channelId>` via metadata before it reaches the store.

### Sparse-map invariant
`setContextUnreadInMap` (L77–89): if the next value is `<= 0`, the key is **deleted**; otherwise set. "Absent" means "0 unread." `recomputeStateSlice` re-runs `computeTotals` after every mutation, so `byContext` and `totals` are never independently mutated.

### Actions
| Action | Purpose |
|---|---|
| `setSnapshot(dto)` | Bulk replace from server snapshot; hydrate meta, rebuild `byContext`, recompute totals (server-preferred), run side effects. |
| `refreshAll()` | Dedup'd `chatApi.getUnreadSnapshot()` → `setSnapshot`. Bootstrap path, called from `App.tsx:198`. |
| `applySocketDelta({type, id, unreadCount})` | Socket delta; normalize context → key; invalidate mark-read-confirmed if `>0`; apply viewing-guarded count; recompute. |
| `enterContextAndMarkRead(params)` | Proxy to `unreadCoordinator`. |
| `markAllRead()` | `chatApi.markAllRead()`; apply returned snapshot or zero the store. |
| `restoreContext(key, count)` | Roll back an optimistic clear on failure. |
| `patchGroupChannelMeta` / `setMutedGroupIds` / `toggleMutedGroupId` | Update classification or mute state; recompute totals. |
| `registerBugChannels` | Hydrate bug metadata when BUG socket arrives before snapshot. |
| `setMyGamesScope` | Align `myGames`/`pastGames` totals with loaded game lists (`UnreadMyGamesScopeSync`). |
| `reset()` | Full reset; called from `authStore` on logout (L253). |

### Selectors (L226–323)
Exported individually and as `unreadStoreSelectors`. All accept an optional `state` (defaulting to `getState()`) so they work as plain functions or Zustand selectors:
- `isUnreadStoreWarm` — `fetchedAt > 0`. **UI uses this to decide whether to trust the store or fall back to a prop.**
- `selectTotalAll`, `selectBottomTabChatsBadge`, `selectBottomTabMyGamesBadge`, `selectBottomTabMarketplaceBadge`.
- `selectChatsSubtabBadge(filter, state)`.
- `selectContextUnread(type, id, state)`, `selectMyGamesUnread`, `selectPastGamesUnread(gameIds, state)`.
- `selectMarketBuyerUnread` / `selectMarketSellerUnread` — split market threads by buyer/seller.
- `selectContextUnreadForListItem(item, state, { warm })` — when **warm**, absent key ⇒ `0`; when **cold**, falls back to `item.unreadCount`.

## 2.2 The pure-logic brain — `Frontend/src/services/chat/unreadSnapshot.ts`

This module owns **all types and all math**. The store and coordinator are thin shells over it. It is pure (no React/Zustand) and unit-tested (`unreadSnapshot.test.ts`).

### Types
```ts
type SnapshotContextType = 'GAME' | 'USER' | 'GROUP';
type SocketContextType   = SnapshotContextType | 'BUG';   // BUG only on the wire
type ContextKey = `${SnapshotContextType}:${string}`;

type UnreadTotals = {
  all, games, userChats, bugs, groups, channels, marketplace,
  myGames, pastGames: number;
};

type GroupChannelMeta = {
  isChannel?: boolean; marketItemId?: string | null; bugId?: string | null;
  buyerId?: string | null; sellerId?: string | null;
};
```

### Core functions
- `contextKey` / `parseContextKey` — bidirectional key codec; `parseContextKey` rejects non-snapshot prefixes (so `BUG:` keys can never live in the map).
- `hydrateGroupChannelMetaFromPayload(dto)` (L75–120) — scans the snapshot's `groupChannels`, `bugs`, `marketItems` arrays to build `Record<channelId, GroupChannelMeta>`. This metadata is how a single `GROUP:` count gets **reclassified** into bugs/marketplace/channels/groups.
- `byContextFromSnapshotDto(dto)` (L123–162) — prefers `dto.byContext` (newer server format); else builds the sparse map from legacy arrays. Bug and market entries both fold into `GROUP:<channelId>`.
- `computeTotals(byContext, meta)` (L164–216) — **the central derivation** (see §4.1).
- `mergeServerTotals(computed, server?)` (L218–234) — per-field preference: server value if present, else locally computed. Lets the server authoritatively report `myGames`/`pastGames`.
- `normalizeSocketContextToKey(type, id, meta, bugIdToChannelId?)` — converts a (possibly BUG) socket context to a store key; uses `bugIdToChannelId` map then metadata; unresolved BUG → deferred via `unreadBugSocketDelta.ts` (API lookup).
- `selectChatsSubtabBadgeFromTotals(filter, t)` (L266–282) and `selectBottomTabChatsBadgeFromTotals(t)` (L257–264).

**Coordination model:** snapshot (full sync) → `setSnapshot` → hydrate + build + compute + merge. Delta (incremental) → `applySocketDelta` → normalize + patch one key + recompute. **No reconciliation against local IndexedDB here** — the server snapshot + socket deltas are the source of truth; Dexie is a downstream mirror.

## 2.3 Related stores

- **`unreadStoreSocketBridge.ts`** — sync `applyUnreadSocketDelta()` used by `socketEventsStore` (avoids circular import with `playersStore`).
- **`socketEventsStore.ts`** — socket ingress. `handleChatUnreadCount` calls `applyUnreadSocketDelta` synchronously **and** enqueues the raw event into FIFO queues (`listChatUnreadQueue`, …) for chat-list row patches.
- **`playersStore.ts`** — DM list + previews only; **no unread mirror**. User-chat unread counts come solely from `unreadStore`.
- **`UnreadMyGamesScopeSync.tsx`** — keeps `myGameIds` / `pastGameIds` in `unreadStore` aligned with React Query game lists.
- **`authStore.ts`** (L253–254) — on logout: `resetCoordinator()` then `unreadStore.reset()`.
- **`gameDetailsChromeStore.ts`** — "currently viewing" state for the viewing guard and coordinator.

## 2.4 Hooks — `Frontend/src/hooks/useUnreadBridge.ts` (118 lines)

The **only** UI-facing unread hook layer. Thin Zustand selector hooks. Context/list hooks use `isUnreadStoreWarm` with prop or row fallbacks when cold. **Tab/subtab aggregate badges return `undefined` when cold** (badge hidden until snapshot — avoids false-zero flash).

| Hook | Returns | Used by |
|---|---|---|
| `useUnreadStoreWarm()` | boolean | internal gate |
| `useBottomTabUnreadBadges()` | `{ my?, chats?, market? }` | `BottomTabBar` |
| `useChatsSubtabUnreadBadge(filter)` | number | `ChatsTabController`, `useChatInbox` |
| `useTotalUnreadForMarkAllBanner()` | number | `MyTab` banner |
| `useContextUnread(type, id?, fallback=0)` | number | `GameCard`, home rows, `UpcomingGamesList` |
| `useGameUnreadCountsForIds(ids)` | `Record<id, number>` | `MyTab` sorting |
| `useMyGamesSubtabUnreadBadges()` | `{ myGames, pastGames }` | `MyGamesTabController` |
| `useChatListItemUnread(item)` | number | `ChatListItem`, `ChatListGameCard` |
| `useMarketItemUnread(item)` | number | `MarketplaceList` |
| `useMarketBuyerSellerUnreadBadges()` | `{ buyer, seller }` | marketplace switch |
| `useUnreadByUserIdBridge(userId?, fallback=0)` | number | `PlayersCarousel` (resolves chatId via `playersStore.userIdToChatId`) |

**No React Query hooks for unread** — the store deliberately bypasses React Query (unread is treated as real-time singleton state, not cacheable query state). The store is fed by direct `chatApi` calls and Socket.IO deltas.

---

# Part 3 — Sync flows (how counts update)

## 3.1 Bootstrap / initial load

**API:** `GET /chat/unread-objects` → `chatApi.getUnreadSnapshot()` (`api/chat.ts:565`), single-flight guarded by `unreadObjectsInFlight` with a TTL.

**Store loader:** `useUnreadStore.refreshAll()` (`unreadStore.ts:123`), single-flight via `refreshInFlight`.

**Triggers:**
1. **App launch / route change** — `App.tsx:197–201`: on auth settle and each navigation (skips Telegram auto-login paths).
2. **Foreground/resume** — `appLifecycle.service.ts` `runForegroundSync()` → `chatSyncService.refreshUnreadAndList()`.
3. **Network reconnect** — network effect → `warmChatSyncHeads(undefined, { enrichFromUnread: true })`.
4. **Mark-read failure fallback** — `unreadCoordinator.ts:194`.
5. **After push-reply** — `syncAppBadgeAfterPushReply.ts:11`.
6. **Cache invalidation** — `chatApi.invalidateUnreadCache()` → `refreshAll()`.

**`setSnapshot(dto)` chain:** hydrate meta → build `byContext` → `computeTotals` → `mergeServerTotals` → `runUnreadSnapshotSideEffects` (persist game rows to Dexie, schedule warm sync).

## 3.2 Socket delta → store

```
socket 'chat:unread-count'
  → socketEventsStore.handleChatUnreadCount(data)
      ├─ applyUnreadSocketDelta(data)                         [unreadStoreSocketBridge.ts]
      │     └─ useUnreadStore.applySocketDelta
      │           ├─ normalizeSocketContextToKey(...)         (BUG→GROUP; unresolved BUG → unreadBugSocketDelta)
      │           ├─ if unreadCount>0 → invalidateMarkReadConfirmed(key)
      │           ├─ effectiveSocketUnreadCount(...)          [unreadViewingGuard.ts]
      │           └─ patch map + computeTotals + set state
      └─ enqueue raw event into listChatUnreadQueue / …
```

Viewing guard runs inside `applySocketDelta`. Counts are **server-authoritative absolute**; the store never increments on incoming messages.

## 3.3 Viewing guard — `Frontend/src/services/chat/unreadViewingGuard.ts` (19 lines)

`effectiveSocketUnreadCount(type, id, count)` returns **0** when the user is currently viewing that exact context (read from `gameDetailsChromeStore`'s `viewingGameChatId` / `viewingUserChatId` / `viewingGroupChannelId`). This prevents the badge from re-lighting while the chat is open.

## 3.4 Mark-as-read (thread open / scroll)

**Coordinator:** `Frontend/src/services/chat/unreadCoordinator.ts` (322 lines). Triggered by `ChatThreadController`:
- `markReadOnEnter` (line 69) → `enterContextAndMarkRead` — once, on thread open.
- `markRead` (line 75) → `markContextReadOnUserActivity` — on scroll-to-bottom / activity.

**`enterContextAndMarkRead` chain:**
```
enterContextAndMarkRead
  ├─ resolveSnapshotContext → key
  ├─ shouldSkipEnterOptimistic(key, state)        (skip optimistic clear if already viewing & 0)
  ├─ setViewingBeforeMark(...)                    ← arms the viewing-guard suppression
  ├─ if byContext[key]>0: optimisticClear(key)
  │     ├─ invalidateMarkReadConfirmed(key)
  │     ├─ delete byContext[key], recompute totals
  │     ├─ add key to markInFlight
  │     └─ pendingRestoreByKey.set(key, prev)     ← stash prev for rollback
  └─ scheduleMarkReadNetwork(...)                 (280ms debounce)
        → POST /chat/mark-context-read
             ok:   confirmMarkRead + applySocketDelta(0)
             fail: restoreContext(prev) + refreshContext
```

**Propagation:**
- **Local DB** — store subscriber `installUnreadThreadIndexSync` watches `byContext` and patches Dexie rows (CAS loop, 8 retries).
- **Chat list UI** — a `chat-viewing-clear-unread` CustomEvent is consumed by `useChatInboxSocketEffects.ts` to zero the rendered row.
- **Other devices** — the backend emits `chat:unread-count` with `0` to the user's other sockets.

**Offline mark-read:** if `shouldQueueChatMutation()` (offline), the mark-read is enqueued as an `OfflineIntent` of kind `mark_read_batch` instead of hitting the API. On flush failure, `installMarkReadFlushFailureResync` (`chatMarkReadResync.ts`) catches the event and restores + refreshes.

**Rollback safety:** `pendingRestoreByKey` (module-level Map) stashes the pre-clear count. The `markReadConfirmed` Set prevents redundant network calls; it's invalidated whenever a socket delta reports `unread > 0`.

## 3.5 Send flow — own unread reset

Sending a message **resets the user's own thread unread to 0** (you don't increment your own unread) via `markReadAfterSend.ts` → `markContextReadOnUserActivity` (same path as §3.4). The backend also marks-read on `createMessage`, so this is belt-and-suspenders. For GAME contexts, `gameChatTypes` is attached so the backend marks the right chat-type scope. The outbox enqueue itself (`chatOutboxEnqueue.ts`) does not touch unread.

## 3.6 Local DB (IndexedDB / Dexie) — `Frontend/src/services/chat/chatLocalDb.ts`

DB `BandejaChatLocal`, schema v17. **No dedicated unread table.** Each `threadIndex` row carries its own `unreadCount` inside `itemJson` (a serialized `ChatItem`). Read state at message level lives inside `ChatMessage.payload.readReceipts` in the `messages` table; the `chatSyncCursor` table stores a **sync** cursor (`lastAppliedSeq`), not a read cursor.

**Three writers keep the row's `unreadCount` consistent:**
1. **Store subscriber (authoritative mirror)** — `installUnreadThreadIndexSync`: every `byContext` delta → `patchThreadIndexSetUnreadCount`.
2. **Snapshot side-effect** — `persistGamesThreadIndex` upserts game rows with the server count.
3. **Per-message client increment** — `patchThreadIndexFromMessage` (`chatThreadIndex.ts:411`). The **only place the client itself increments unread** (never the store). Uses `shouldIncrementThreadUnread(message)` (false if sender is self or context is being viewed). Provides instant list-row feedback before the server's `chat:unread-count` arrives, then is reconciled by the store subscriber. The socket inbox path passes `{ applyUnread: false }` to avoid double-counting.

All thread-index writes use compare-and-set (`putThreadRowIfUnchanged`, 8 retries) to handle races.

## 3.7 Push notifications & native badge

`pushNotificationService.ts` does **not** touch unread counts or badge numbers directly (token registration, permission, tap-routing only).

Native app-icon badge is synced **only in the push-reply path**:
- `syncAppBadgeAfterPushReply.ts` — after a reply from a push: optionally sets a provided badge count, calls `refreshAll()`, and on iOS reads `selectTotalAll` and sets the icon badge via `setAppIconBadgeCountNative` (Capacitor Badge plugin).
- `markPushReplyContextAsRead.ts` — calls `markReadAfterSend` for the push's context.

There is **no continuous binding** of `selectTotalAll` to the native badge; `chat:unread-count` updates only in-app UI badges, not the icon.

---

# Part 4 — Display & grouping

## 4.1 Grouping logic — `computeTotals()` (`unreadSnapshot.ts:164–216`)

Iterates the sparse `byContext` map and buckets each entry:
```ts
GAME  → games
USER  → userChats
GROUP → if mutedGroupIds.has(id) → skip            // excluded from ALL totals
        else if gm.marketItemId   → marketplace
        else if gm.bugId          → bugs
        else if gm.isChannel      → channels       // broadcast / city channels
        else                       → groups         // city groups, social group chats

all = games + userChats + bugs + groups + channels + marketplace
```
`myGames` and `pastGames` are **not part of `all`** — they come server-side via `mergeServerTotals` (the client can't compute them from `byContext` alone).

**Chats inbox subtab badges** (`selectChatsSubtabBadgeFromTotals`):
- `users` = `userChats + groups + games` (the Chats list mixes DMs, game chats, and group channels)
- `market` = `marketplace`
- `channels` = `channels`
- `bugs` = `bugs`

Bottom-tab Chats badge = sum of all four subtabs.

**Buyer/Seller split** — `marketBuyerSellerUnreadFromContext` matches `meta[channelId].buyerId/sellerId` against the current user.

## 4.2 Where badges appear (and how they're styled)

Every unread count is rendered by **one shared component, `UnreadBadge`** (`Frontend/src/components/UnreadBadge.tsx`, exported from `components/index.ts`). It owns the `99+` cap, the red-pill styling, and a single uniform mount-pop (a `framer-motion` scale/opacity spring) that is skipped when the user prefers reduced motion (`usePrefersReducedMotion()`). It renders nothing when `count <= 0`, so call sites no longer wrap it in a `count > 0 && …` guard.

Props: `count: number`; `size?: 'sm' | 'md'` (`sm` = `h-[18px]` for dense chrome — bottom nav, header subtabs, search toggle, market cards, inline row pills; `md` = `h-5` for chat rows, `GameCard`, `PlayersCarousel`); `showIcon?: boolean` (renders a `MessageCircle` before the count, for inline row pills); `className?: string` (the parent supplies positioning/borders, e.g. `absolute -top-1 -right-1`).

| Call site | Size | Notes |
|---|---|---|
| Chat list rows (`UserChatCard`, `GroupChannelCard`) | `md` | `className="shrink-0"` |
| Chat list game row (`ChatListGameCard`) | `md` | |
| Bottom nav (`BottomTabBar`: my/chats/market) | `sm` | corner-positioned |
| Header subtabs (`SegmentedSwitch`, `notification` style) | `sm` | the `inline` style is a separate neutral gray counter, not an unread badge |
| Chats unread-filter toggle (`ChatListSearchBar`) | `sm` | on the mail-icon button |
| `GameCard` chat button | `md` | corner-positioned over the `MessageCircle` button icon |
| `UpcomingGamesList` row + stale section | `sm` | `showIcon` |
| League rows (`YourLeaguesHomeLeagueGameRow`, `YourLeaguesHomeSeasonOpenRow`) | `sm` | `showIcon` |
| `MarketItemCard` | `sm` | corner-positioned |
| `PlayersCarousel` avatar dot | `md` | `className` adds the white ring (`border-2 border-white dark:border-gray-900`) |

Normalization choices made when consolidating into one component:
- **One cap, one color.** The former `9+` cap on `PlayersCarousel`, the red→red gradient on `BottomTabBar`, and the brand-color (`bg-primary-600`) pills on league rows were all folded into the single red `99+` pill.
- **One animation.** The continuous 2s ping + glow on `GameCard` and the per-site mount springs were removed; every badge now shares the same reduced-motion-aware mount-pop (or none at all, when reduced motion is preferred).
- The local `UnreadBadge` that used to live inside `MarketItemCard.tsx` was deleted in favor of the shared one.

Notable specifics that remain:
- **`SegmentedSwitch` `inline` badge style** is intentionally a neutral gray counter inside the active segment — it is *not* an unread badge and does not use `UnreadBadge`.
- **No favicon / document.title badge** — `App.tsx` only triggers `refreshAll()`; it renders no badge.

## 4.3 Muted chats

- **Muted GROUP channels** are excluded from **all aggregate badges** via `mutedGroupIds` in `computeTotals`, but the **per-row badge still renders the raw count** (muting only suppresses the contribution to totals, not the row's own badge).
- **Muted USER chats** — no store-level suppression; muting is reflected only by the `BellOff` icon on the row.
- No strikethrough/dimming styling is applied to muted rows.

## 4.4 @mention-specific treatment

**There is none.** Unread counts do not distinguish mention-unread from normal unread anywhere in the UI.

## 4.5 Chat list sectioning & the unread-filter toggle

- **Unread-filter toggle** (`ChatListSearchBar.tsx`) — a mail-icon button shown only when `shouldShowChatListUnreadFilter(count)` is true (count > 0). Carries its own mini badge (16px, the smallest). When active, `deriveChatInboxReadModel.deriveDisplayedChats` filters the list to rows with `unreadCount > 0`. Resets when the filter or count changes.
- **Search sections** (`ChatListSearchSections.tsx`) — collapsible sections (active chats, users, messages, games, channels, bugs, market). Sections do **not** sum or display per-section unread; badges live only on individual rows.
- **Marketplace grouping** (`ChatListView.tsx`) — channels grouped under their listing card show a **chat count**, not an unread sum.

## 4.6 "Mark all as read" — `MyTab.tsx`
`useTotalUnreadForMarkAllBanner()` (which is `selectTotalAll`) drives an `AnimatedMount` "Mark all as read" banner. The count itself isn't displayed numerically — the banner's **visibility** is the indicator; it's disabled when count is 0.

---

# Part 5 — Key invariants

1. **No cached unread counter.** Counts are always derived from `(MessageReadReceipt ∪ ChatReadCursor)` vs `ChatMessage`. The cursor is a query optimization, not a denormalized count.
2. **Server is authoritative and absolute.** `chat:unread-count` carries full counts; the store never increments on incoming messages.
3. **`byContext` is sparse and positive-only.** Zero/negative ⇒ key deleted. Selectors default to 0.
4. **The store only holds `GAME:`/`USER:`/`GROUP:` keys.** `BUG:` is wire-only, normalized to `GROUP:` via metadata.
5. **`totals` is recomputed in the same `set()` that mutates `byContext`** — never independently mutated.
6. **`all` excludes `myGames`/`pastGames`** (server-overlay); client fallbacks exist for cold cache.
7. **GROUP reclassification is metadata-driven** — one `GROUP:` namespace produces four badge buckets. Missing metadata ⇒ count falls into `groups`.
8. **Warm gate (`fetchedAt > 0`) gates context/list UI reads** — cold ⇒ prop/row fallbacks; aggregate tab badges hidden (`undefined`) until warm.
9. **Optimistic mark-read with rollback** — `optimisticClear` + `pendingRestoreByKey`; `markReadConfirmed` dedup is invalidated by any nonzero socket delta.
10. **Viewing suppression** — `effectiveSocketUnreadCount` zeroes live deltas for the open context at two layers.
11. **Muted GROUP channels excluded from totals** but still show their per-row count.
12. **No React Query for unread** — unread is real-time singleton state. Dexie thread index is a downstream mirror; `playersStore` holds no unread map.

---

# Appendix — File reference

### Backend
- `Backend/prisma/schema.prisma` — `ChatMessage` (L1162), `MessageReadReceipt` (L1480), `ChatReadCursor` (L1448), `ChatMute` (L1278), `ConversationSyncState` (L1725), `ChatSyncEvent` (L1734)
- `Backend/src/services/chat/chatReadUnreadSql.ts` — the unread SQL predicate
- `Backend/src/services/chat/chatReadCursor.service.ts` — cursor merge logic
- `Backend/src/services/chat/unreadCountBatch.service.ts` — batched count queries
- `Backend/src/services/chat/readReceipt.service.ts` — read/unread facade (mark-read, counts)
- `Backend/src/services/chat/unreadSnapshot.service.ts` — totals/badge aggregation
- `Backend/src/services/chat/unreadObjects.service.ts` — per-object count queries
- `Backend/src/services/chat/chatSyncEvent.service.ts` — sync event log
- `Backend/src/services/chat/unreadAutoRead.service.ts` (+ scheduler) — daily auto-read cron
- `Backend/src/services/chat/chatNotifier.ts` / `socketChatNotifier.ts` — notifier indirection
- `Backend/src/services/socket.service.ts` — `emitUnreadCountUpdate` (L1264), `emitChatEvent` (L801)
- `Backend/src/services/chat/message.service.ts` — send → per-recipient unread emit (L1164)
- `Backend/src/routes/chat.routes.ts`, `Backend/src/controllers/chat.controller.ts` — endpoints
- `packages/chat-contract/src/chatSyncEventType.ts` — shared sync event types

### Frontend — state & coordination
- `Frontend/src/store/unreadStore.ts` — the Zustand store + selectors
- `Frontend/src/services/chat/unreadSnapshot.ts` — types + pure derivation (the brain)
- `Frontend/src/services/chat/unreadStoreSocketBridge.ts` — sync socket → store ingress
- `Frontend/src/services/chat/unreadBugSocketDelta.ts` — unresolved BUG delta + API channel lookup
- `Frontend/src/hooks/useUnreadBridge.ts` — UI-facing hooks
- `Frontend/src/components/UnreadMyGamesScopeSync.tsx` — my/past games scope sync
- `Frontend/src/services/chat/unreadCoordinator.ts` — mark-read orchestration
- `Frontend/src/services/chat/unreadViewingGuard.ts` — open-context suppression
- `Frontend/src/services/chat/unreadSnapshotSideEffects.ts` — snapshot downstream mirrors
- `Frontend/src/services/chat/unreadThreadIndexSync.ts` — Dexie thread-index mirror
- `Frontend/src/services/chat/chatUnreadPayload.ts` — raw API payload types
- `Frontend/src/services/chat/markReadAfterSend.ts` — send → own-read reset
- `Frontend/src/utils/unreadCountsFromStore.ts` — non-hook accessor helpers
- `Frontend/src/store/socketEventsStore.ts` — socket ingress
- `Frontend/src/store/playersStore.ts` — DM list (no unread mirror)
- `Frontend/src/store/authStore.ts` — reset on logout (L253)
- `Frontend/src/components/GameDetails/gameDetailsChromeStore.ts` — "currently viewing" state
- `Frontend/src/api/chat.ts` — `getUnreadSnapshot` (L566), `markContextRead` (L588), `markAllRead` (L593), `getUnreadCountForContext` (L945)

### Frontend — sync & local db
- `Frontend/src/services/chat/chatLocalDb.ts` — Dexie schema (`threadIndex` L74)
- `Frontend/src/services/chat/chatThreadIndex.ts` — `patchThreadIndexFromMessage` (L411), `shouldIncrementThreadUnread` (L24)
- `Frontend/src/services/chat/chatThreadController/ChatThreadController.ts` — thread open/scroll entry points
- `Frontend/src/services/chat/inbox/useChatInboxSocketEffects.ts` — unread queue drain (L537)
- `Frontend/src/services/chat/inbox/deriveChatInboxReadModel.ts` — unread-filter application
- `Frontend/src/services/push/syncAppBadgeAfterPushReply.ts` — native badge sync
- `Frontend/src/App.tsx` — launch refresh (L197); `Frontend/src/main.tsx` — install hooks (L21)
- `Frontend/src/services/appLifecycle.service.ts` — foreground sync

### Frontend — display
- `Frontend/src/components/UnreadBadge.tsx` — the single shared unread-count badge used everywhere
- `Frontend/src/components/navigation/BottomTabBar.tsx` — bottom-nav badges
- `Frontend/src/components/headerContent/ChatsTabController.tsx`, `MyGamesTabController.tsx` — header subtabs
- `Frontend/src/components/SegmentedSwitch.tsx` — generic tab badge
- `Frontend/src/components/chat/{UserChatCard,GroupChannelCard,ChatListGameCard,ChatListItem}.tsx` — chat list rows
- `Frontend/src/components/chat/{ChatListSearchBar,chatListUnreadFilter}.tsx/.ts` — unread-filter toggle
- `Frontend/src/components/GameCard.tsx` — chat-button badge
- `Frontend/src/components/home/{UpcomingGamesList,YourLeaguesHomeLeagueGameRow,YourLeaguesHomeSeasonOpenRow,MyGamesSection,PastGamesSection}.tsx`
- `Frontend/src/components/marketplace/MarketItemCard.tsx`
- `Frontend/src/components/GameDetails/PlayersCarousel.tsx` — avatar dot
- `Frontend/src/pages/{MarketplaceList,MyTab}.tsx`
