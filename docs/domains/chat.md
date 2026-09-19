# Chat

Offline-first messaging. Open-thread rules: `Frontend/src/services/chat/CONTEXT.md`. Sync event names: `packages/chat-contract` — **`MESSAGE_CREATED`**, not `MESSAGE_CREATE`. Read ticks: `ChatReadCursor` (see Peer read cursors below).

Do not invent a second live `setMessages` owner. See § Open thread.

## Thread types and routes

| Kind | FE route | `ChatContextType` | `contextId` | Socket room |
|------|----------|-------------------|-------------|-------------|
| DM | `/user-chat/:id` | `USER` | `UserChat.id` | `user-chat-{id}` |
| Group | `/group-chat/:id` | `GROUP` | `GroupChannel.id` (`isChannel=false`) | `group-{id}` |
| Channel | `/channel-chat/:id` | `GROUP` | `GroupChannel.id` (`isChannel=true`) | `group-{id}` |
| Game chat | `/games/:id/chat` | `GAME` | `Game.id` | `game-{id}` |
| Bug report | `/bugs/:id` | `GROUP` (UI) | **GroupChannel.id** (channel with `bugId`) | `group-{channelId}` |
| Marketplace | `/channel-chat/:id?filter=market` (inbox `/chats/marketplace`) | `GROUP` | channel with `marketItemId` | `group-{id}` |

Game chat slices (`ChatType`): `PUBLIC` / `PRIVATE` / `ADMINS` — separate `ChatReadCursor` rows and message partitions.

Bug entity vs thread: `GET/PUT /api/bugs/:id` is **Bug.id**. Inbox and `/bugs/:id` use the wrapping **GroupChannel.id**. Unread keys bugs as `GROUP:{channelId}` with `groupChannelMeta.bugId`. `ChatContextType.BUG` still exists on some message/sync/socket paths (`bug-{bugId}` rooms, `/chat/bugs/:bugId/messages`). New creates go through the GroupChannel (`bug.controller` uses `GROUP` when the channel exists).

City groups: `cityGroup.service.ts` — city-scoped `GroupChannel` (`isCityGroup`).

## Premium appearance

The viewer's `user.isPremium` enables the scoped `premium-chat` palette on the inbox and thread root, including standalone mobile routes. It uses warm light/dark surfaces, gold accents and unread badges, and a dark metal thread header. Message geometry, list measurements, composer positioning and media transparency stay shared with standard users. Sender membership does not control bubble appearance. Standalone visible Premium headers share status-bar ownership with shell headers; system chrome restores when the last Premium header leaves.

## Inbox filters

`ChatsListFilter`: `users` \| `bugs` \| `channels` \| `market`. URL:

| Filter | Route |
|--------|-------|
| Users (default) | `/chats` — DMs + groups. Browse-city chip in search (contacts + user search). Bugs/market/channels have no chip |
| Market | `/chats/marketplace` |
| Channels | `/chats?filter=channels` |
| Bugs | `/bugs`, `/bugs/:id` |

Unread-only list: URL unread flag via `chatListUnreadUrl`. Pin/mute from inbox. Market buyer/seller via `?role=` + `?item=`.

## Message features

- Text, **@mentions**, replies, edit/delete own, **peer read ticks** (own-message ✓✓ when a peer `ChatReadCursor` covers the message)
- Reactions; polls (create/vote); pins (`MESSAGE_PINNED` / `MESSAGE_UNPINNED`)
- Media: image, video (transcode), voice/audio + transcription, documents
- **Stickers** — `MessageType.STICKER` (`stickerId`); `/api/stickers` packs, prefs, recents, personal
- **GIF** — `/api/giphy` search/trending/import when `GIPHY_API_KEY` and/or `KLIPY_API_KEY`; paste re-host as `IMAGE` for Giphy/Klipy/**Tenor** URLs
- **Link previews** — `/api/link-preview`; Bandeja deep links → typed app cards; composer chip + remove
- Translate + per-thread auto-translate config (`CHAT_AUTO_TRANSLATE_CONFIG_UPDATED`)
- Drafts — `draft.service.ts`; expire **30 days** (`DraftScheduler` daily 03:00)
- Outbox — Dexie `outbox` + `mutationQueue`; retry on reconnect; `chatOutboxEnqueue` / `chatSendCoordinator`
- Report — `SPAM` \| `HARASSMENT` \| `INAPPROPRIATE_CONTENT` \| `FAKE_INFORMATION` \| `OTHER` + optional description → Admin message-reports
- Typing; delivery ack `chat:message-ack`; push lock-screen reply (`POST /chat/push-reply`)
- Context panels: game, bug, marketplace item
- Archived/cancelled game chat: read-only; outbox dropped

`MessageType`: `TEXT` `IMAGE` `VOICE` `VIDEO` `POLL` `STICKER` `DOCUMENT`.

## Group / channel admin

`groupChannel.service.ts`. Roles: `OWNER` `ADMIN` `PARTICIPANT`. Create from + menu. Invite / accept / join / leave. Pin / hide thread. Avatar. Channels (`isChannel`) vs groups vs city groups — different invite/leave rules in the service. Bug channels are public GroupChannels with `bugId`; developers auto-joined.

## Sync protocol

Contract: `packages/chat-contract/src/chatSyncEventType.ts` (`@bandeja/chat-contract`).

```
MESSAGE_CREATED
MESSAGE_UPDATED
MESSAGE_DELETED
REACTION_ADDED
REACTION_REMOVED
POLL_VOTED
MESSAGE_TRANSCRIPTION_UPDATED
MESSAGE_READ_RECEIPT
MESSAGE_TRANSLATION_UPDATED
MESSAGES_READ_BATCH
READ_CURSOR_UPDATE
MESSAGE_PINNED
MESSAGE_UNPINNED
MESSAGE_STATE_UPDATED
THREAD_LOCAL_INVALIDATE
THREAD_ARCHIVED
CHAT_AUTO_TRANSLATE_CONFIG_UPDATED
```

Log: `ChatSyncEvent` + `ConversationSyncState.maxSeq`. Append: `chatSyncEvent.service.ts`. Pull: `GET /chat/sync/events?contextType&contextId&afterSeq`. Access: `chatSyncAccess.service.ts`. Apply: `chatLocalApplyPull.ts` → patches / terminals.

Event pages include `nextAfterSeq`, the last sequence scanned, including events hidden by game-chat permissions. It never passes a visible event omitted by the page limit. Clients advance to it only after all returned events are durably applied, and follow `hasMore` only while the cursor advances. Empty filtered pages can therefore continue at the scan cursor. An exhausted or stalled pull must not requeue itself against the global head: filtered/pruned history can leave that head ahead indefinitely. New socket, foreground, and batch-head signals can still start a later pull. Older responses without `nextAfterSeq` use the applied-event cursor and stop on empty/no-progress pages.

`chatSyncScheduler.ts` backstops this. Failed-request backoff (`chatThreads.nextRetryAt`) binds every priority, including `SYNC_PRIORITY_GAP` and above. A separate in-memory guard cools a thread down for 30s after 3 recent pulls leave the same known server-head gap unresolved. Caught-up checks do not count; cursor/head changes reset that guard, and old attempts expire. Deferred threads do not occupy ready-work slots. Queued and deferred jobs merge the highest priority/head and preserve `forcePull`; each context has at most one active scheduler job. A single wake timer resumes deferred work and is cleared with the queue.

`MESSAGE_READ_RECEIPT` / `MESSAGES_READ_BATCH` remain in the contract for historic rows. New-client ticks ignore receipts.

## IndexedDB (Dexie)

`chatLocalDb.ts` (v18). Tables: `messages`, `chatSyncCursor`, `outbox`, `chatThreads`, `threadIndex`, `messageContextHead`, `threadScroll`, `messageRowHeights`, `chatDrafts`, `mutationQueue`, `outboxMediaBlobs`, `messageSearchTokens`, `peerReadCursors`.

Cursor key: `{contextType}:{contextId}`. Peer cursors also in memory (`peerReadCursorStore.ts`).

## Outbox and background sync

- Enqueue/send: `chatOutboxEnqueue.ts`, `chatSendCoordinator.ts`, `chatMutationFlush.ts`
- Media: `chatOutboxMediaBlobs.ts`, image compress, video transcode (`chatVideoTranscode.ts`)
- Worker fetch: `chatSyncFetch.worker.ts` + `chatSyncFetchWorkerClient.ts` (sync events GET off main thread)
- Background flush: `chatBackgroundSync.ts` (SW message + Capacitor `appStateChange`); `chatUnifiedOfflineFlush.ts`
- Warm: `chatSyncBatchWarm.ts`; reconnect: `socketService` + `chatSyncService.ts`

## Open thread

From `Frontend/src/services/chat/CONTEXT.md`:

> Thread Live Projection is the React-state projection for an open chat thread. It is the **single owner of live `setMessages`** updates for socket messages, socket read receipts, optimistic sends, and reconcile hydration while the user is viewing a thread.
>
> The projection is intentionally separate from durability. `threadLiveProjection.ts` contains the pure reducer and emits effects. `applyThreadEvent` (`chatLocalApplyThreadEvent.ts`) is the durability/event-application path for Dexie — **not** the live UI writer for an already-open thread.
>
> `chatOpenSnapshot` is the bootstrap and reconciliation snapshot path.

Socket → adapter → projection events, then persist via effects / `applyThreadEvent`. Do not add window events or module queues as bridges. Bootstrap invariants: `threadOpen/types.ts` (paintGeneration 0|1, L1 → Dexie tail → outbox). Constraint: APP_FUNCTIONALITY §2.2 **Open chat thread**.

## Inbox rendering

The inbox repaints on every socket message, unread delta and Dexie replay, so these
are load-bearing. Undoing any of them brings back list-wide flicker.

- **Row identity is the memo key.** `chatItemWithDraft` / `applyDraftsToChatItems` /
  `deduplicateChats` return the *same* row object and the *same* array when nothing
  moved (drafts compare by value, not identity — they are refetched objects). Market
  rows in `deriveMarketFilteredByRoleAndSearch` clone only when the count changed.
  `chatListFeedStore.patchRowsForFilter` / `reapplyDrafts` bail out instead of
  notifying subscribers on a no-op merge.
- **`ChatInboxFeedSnapshot` holds only what the inbox reads.** It is compared on every
  feed-store write; an unread field (it used to carry `filterCache`) re-renders the
  whole tab whenever a *background* filter's cache is committed.
- **Unread subscriptions are scoped.** Rows read their own count via
  `useChatListItemUnread`. `useChatInbox` only subscribes to the full
  `displayedByContext` when the unread-only filter is on, and market counts come from
  `useChatListMarketUnread` (shallow, visible channels only).
- **Network settle is skipped when the rows are unchanged** for every filter
  (`shouldSkipRedundantNetworkVisibleApply`); only `users` adds the city-group
  precondition.
- **Motion cost.** Below `CHAT_LIST_VIRTUAL_THRESHOLD` rows render statically with
  framer `layout`, which re-measures every row on every commit. Keep the threshold low.
- **Search and pull never enter list state.** `ChatListSearchBar` owns the raw input and
  lifts only the debounced query (`CHAT_LIST_SEARCH_DEBOUNCE_MS`, which also gates the
  `?q=` write). Pull-to-refresh publishes to `--chat-pull-distance` /
  `--chat-pull-progress` through `usePullToRefresh({ onPullDistanceChange })`.
- **Chat routes keep one shell.** `MainPage` renders every chat place through a single
  `<MainLayout chrome="full" | "bare">`; `bare` collapses the wrappers to
  `display: contents` and drops the header. Returning a different root element for the
  thread route remounts the header and the whole Chats subtree on each navigation.
  `ChatsTab` derives its selection from the path and keeps only a path-scoped
  optimistic pick.

## Message viewport stability

`ThreadScrollViewport` owns thread scrolling. TanStack compensates measured row height changes; do not apply an additional measurement-delta correction. Only DOM measurements are persisted as measured row heights. Disk heights can replace heuristic estimates, but cannot overwrite newer in-memory/L1 measurements, including when a disk read completes after measurement.

Open-at-bottom alignment runs before paint. Follow-up frame pins are cancelled on thread change/unmount or user scroll interaction. History positions store the first **visible** message (excluding virtual overscan) and its pixel offset. Older saved positions without an offset still restore to the message start; explicit message links take precedence over saved offsets. Ordinary scroll renders reuse the virtualizer's measurement table and shared event subscription object.

## Unread

Package: `@bandeja/unread-contract` — snapshot merge, clocks, optimistic inbound bumps, `computeTotals`. Context keys: `GAME:{id}` \| `USER:{id}` \| `GROUP:{id}` only. Bugs/market/channels classified via `groupChannelMeta` (`bugId`, `marketItemId`, `isChannel`). Muted **group** ids excluded from GROUP totals.

FE: `unreadStore.ts` (thin Zustand over `unreadProjection.ts`) + `unreadSnapshot.ts` selectors. Socket: `unreadStoreSocketBridge.ts` (`chat:unread-count`, `chat:unread-invalidate`). Open-thread clear: `unreadCoordinator.ts` / viewing guard — no wait for socket round-trip. App icon: `syncAppIconBadgeFromStore.ts` / `unreadNativeBadgeSync.ts`.

**Badges wired today**

| Surface | Wired? |
|---------|--------|
| Chats bottom tab | **Yes** — `BottomTabBar` uses `tabBadges.chats` only (`selectBottomTabChatsBadge` = users+groups+games + market + channels + bugs) |
| My / Market bottom tabs | **No** — `useBottomTabUnreadBadges` computes `my`/`market`; `BottomTabBar` does not attach them |
| Chats → Market filter | Yes (`t.marketplace`) |
| Game cards on Home/Find | Yes (per-game chips) |
| App icon | Yes (total `all`) |

BE authority: `unreadAuthority/`, `unreadSnapshot.service.ts`. Unread SQL is cursor-only (`chatReadUnreadSql.ts`).

## Game chat lifecycle

From CONTEXT.md. `GameChatViewerAccessService.resolve`:

| State | Meaning |
|-------|---------|
| `active` | Live `Game` row |
| `archived` | Game deleted → `CancelledGame` + participant snapshot; writes `403 chat.threadArchived` |
| `missing` | Neither Game nor CancelledGame (`resolve` → `null` → 404) |

**`THREAD_ARCHIVED`** — game delete (`game/delete.service.ts`). History kept. Client: `applyThreadTerminal('archived')` — `chatThreads.archivedAt`, drop outbox, leave `GAME` socket room; **does not purge Dexie**.

**`THREAD_LOCAL_INVALIDATE`** — wipe local copy (user merge, …). Client: `applyThreadTerminal('invalidate')` → `purgeLocalDexieThread`. Distinct from archive.

Epic: GitHub #248.

## Peer read cursors vs receipts

| | `ChatReadCursor` | `MessageReadReceipt` |
|--|------------------|----------------------|
| Role | **Authority** for unread and own-message ✓✓ | Deprecated for ticks; table still exists |
| Position | `readMaxServerSyncSeq`, `readMaxCreatedAt`, `readMaxMessageId` per user × context × `chatType` | Per-message rows |
| Live | `READ_CURSOR_UPDATE` sync + hydrate `maxPeerCursor` | `MESSAGE_READ_RECEIPT` / `MESSAGES_READ_BATCH` still in contract |
| FE ticks | `messageTickState.resolveOwnMessageTicks` — **cursor only** | Receipts ignored for ✓✓; `readReceiptsFromOthers` leftover for lists |

Mark-read merges the actor cursor forward (`ChatReadCursorService.mergeFromMessage`). Product tick = at least one **peer** cursor covers the message, not “read by everyone”. Do not put `MessageReadReceipt` back on the mark-read path.

## Key paths

**Frontend `Frontend/src/services/chat/`**

| File | Role |
|------|------|
| `CONTEXT.md` | Open-thread + game lifecycle terms |
| `threadLiveProjection.ts` | Live reducer (`setMessages`) |
| `chatOpenSnapshot.ts` | Bootstrap / reconcile merge |
| `threadOpen/types.ts` | Open-paint invariants |
| `chatLocalApplyThreadEvent.ts` | Dexie durability (`applyThreadEvent`) |
| `chatLocalApplyPull.ts` | Sync tail apply + terminals |
| `chatLocalDb.ts` | Dexie |
| `chatThreadLifecycle.ts` | Archive / invalidate |
| `chatSyncFetch.worker.ts` / `chatSyncFetchWorkerClient.ts` | Background event fetch |
| `chatBackgroundSync.ts` | SW / native flush |
| `unreadSnapshot.ts` / `unreadProjection.ts` | Unread math |
| `peerReadCursor.ts` / `peerReadCursorStore.ts` | Tick cursors |
| `messageTickState.ts` | ✓✓ |
| `inbox/` | Inbox feed |
| `chatThreadController/` | Open thread orchestration (`useThreadSocket.ts`) |

Also: `Frontend/src/store/unreadStore.ts`, `Frontend/src/store/socketEventsStore.ts`, `Frontend/src/services/socketService.ts`, `Frontend/src/services/chatSyncService.ts`.

**Backend `Backend/src/services/chat/`**

| File | Role |
|------|------|
| `message.service.ts` | CRUD, send, access |
| `chatSyncEvent.service.ts` | Seq log |
| `chatReadCursor.service.ts` | Cursor merge / `maxPeerCursor` |
| `readReceipt.service.ts` | Mark-read (cursor); leftover receipt APIs |
| `unreadAuthority/` `unreadSnapshot.service.ts` | Unread envelopes |
| `groupChannel.service.ts` | Groups/channels |
| `userChat.service.ts` | DMs |
| `gameChatViewerAccess.service.ts` | Active/archived/missing |
| `pinnedMessage.service.ts` `poll.service.ts` `reaction.service.ts` | Features |
| `chatMute.service.ts` | Per-thread mute |
| `draft.service.ts` | Drafts |
| `messageReport.service.ts` | Reports |
| `translation.service.ts` `chatAutoTranslate.service.ts` `transcription.service.ts` | AI |
| `socketChatNotifier.ts` | Live emit helper |

Routes: `Backend/src/routes/chat.routes.ts`, `groupChannel.routes.ts`, `bug.routes.ts`. Stickers/giphy/link-preview: sibling route files.
