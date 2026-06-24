# ADR-007: Thread Live Projection module (open thread reliability)

**Status:** Accepted  
**Date:** 2026-06-24  
**Issue:** #228 (Phase 1)  
**Epic:** #220 (Perfect messaging: open thread reliability)  
**Phases:** #228 → #229 → #230 → #231

## Context

Bandeja chat must behave like a perfect messaging app. Users must never discover they missed messages or that read status was wrong only after refreshing or leaving the thread.

Today we have a split-brain: **inbox/notifications update eagerly** while the **open thread path is gated, Dexie-dependent, and incomplete for read receipts**. That gap erodes trust — the worst failure mode for messaging.

### Symptoms (must not recur)

- Open GameChat: notifications show new inbound messages, send works, but other users' messages don't appear until refresh or navigation
- Read ticks / message Details show partial wrong state (e.g. 2nd own message read, 1st unread) until refresh

### Root cause

The inbox path is eager; the open-thread path applies paint guards, waits on Dexie persistence, and handles bulk read receipts (`allRead`) incorrectly. Notifications can move while the thread UI stays stale.

### Existing state (pre-ADR)

- `chatOpenSnapshot` — Bootstrap path for initial paint (L1 → Dexie tail → outbox)
- `applyThreadEvent` — Dexie persistence queue (async, side effects)
- `mergeChatMessagesAscending` — Pure message merge helper
- `mergeReadReceipts` — Pure read receipt deduplication
- Socket inbound → `persistSocketInboundMessage` (Dexie) → paint

### Problem

No pure reducer for **live events while thread is open**. UI updates are gated on Dexie persistence completion, creating lag and inconsistency.

## Decision

### Tiered truth model

| Phase | Authority | Mechanism |
|-------|-----------|-----------|
| While viewing | React `messages` | **Thread Live Projection** (sync reducer) |
| Durability | Dexie | `applyThreadEvent` (async, unchanged) |
| Reopen | L1 cache → Dexie tail → network prefetch | `chatOpenSnapshot` (unchanged) |

### Module shape

**Sibling** to `applyThreadEvent` — not embedded in Dexie queue.

```
Ingress (socket / sync / optimistic / hydrate)
  → adapter maps to ThreadLiveEvent[]
  → reduceThreadLiveSnapshot(prev, events, config) → { next, effects, changed }
  → setMessages(next) synchronously
  → run effects async (persist, ack, syncPull, clearUnread, l1Put)
```

### Event model

**Domain `ThreadLiveEvent` union** at UI seam — not raw sync patches:

```typescript
type ThreadLiveEvent =
  | InboundMessageEvent      // Socket inbound / optimistic send
  | ReadBatchEvent           // MESSAGES_READ_BATCH from sync
  | ReadReceiptEvent        // MESSAGE_READ_RECEIPT
  | AllReadEvent            // Bulk "all read" socket event
  | MessageUpdatedEvent     // MESSAGE_UPDATED (Phase 2)
  | MessageDeletedEvent     // MESSAGE_DELETED (Phase 2)
  | ReactionEvent           // REACTION_ADDED/REMOVED (Phase 2)
```

### Reducer contract

```typescript
export function reduceThreadLiveSnapshot(
  prev: readonly ChatMessageWithStatus[],
  events: readonly ThreadLiveEvent[],
  config: ThreadLiveConfig
): ThreadLiveProjectionResult {
  // Returns: { next, effects, changed }
}
```

- **Pure** — no side effects, no async
- **Synchronous** — computes next state immediately
- **Reuses merge helpers** — `mergeChatMessagesAscending`, `mergeReadReceipts`, `readReceiptsFingerprint`
- **Change detection** — `changed` flag for React optimizations

### Effects model

Effects are queued and run **after paint** to avoid blocking UI:

```typescript
type ThreadLiveEffect =
  | PersistEffect       // Persist to Dexie
  | AckEffect          // Ack socket syncSeq
  | SyncPullEffect     // Trigger sync refresh
  | ClearUnreadEffect  // Clear unread count
  | L1PutEffect        // Update L1 cache
  | ScrollEffect       // Scroll adjustment
```

### Context support

All thread types via `ThreadLiveConfig`:

```typescript
interface ThreadLiveConfig {
  contextType: ChatContextType;  // GAME/USER/GROUP/BUG
  contextId: string;             // gameId, userId, etc.
  viewerUserId: string;          // Current user
  gameChatTypeFilter?: 'PUBLIC' | 'TEAM';  // For GAME chats
}
```

GAME chat filtering by `chatType` (PUBLIC/TEAM) happens in the reducer.

### Phase 1 scope (#228)

**Implement and test:**

- Core reducer `reduceThreadLiveSnapshot`
- Event types: `inboundMessage`, `readBatch`, `readReceipt`, `allRead`
- Stubs for `messageUpdated`, `messageDeleted`, `reaction`
- ADR-007 documentation (this file)
- Replay unit tests (event-log fixtures)

**Out of scope for Phase 1:**

- Wiring into `useThreadSocket` (Phase 2, #229)
- Optimistic send/ACK path (Phase 3, #230)
- Removing `chatOpenSocketPending` (Phase 4, #231)

## Consequences

### Positive

- **Predictable UI** — Thread state is always live, no lag from Dexie
- **Testable** — Pure reducer enables replay tests without React/Dexie/socket mocks
- **Reusable** — Merge helpers shared between bootstrap and live paths
- **Observable** — Effects list makes persistence/ack flow explicit

### Trade-offs

- **Dual write** — State updated in React + persisted to Dexie (effects)
- **Complexity** — New module and event types to maintain
- **Migration cost** — 4 phases to fully replace legacy path

### Migration path

| Phase | Issue | Scope |
|-------|-------|-------|
| 1 | #228 | Pure reducer + ADR + tests |
| 2 | #229 | Wire socket / `processChatRoomBatch` through reducer |
| 3 | #230 | Optimistic send/ACK + reconcile hydrate |
| 4 | #231 | Remove `chatOpenSocketPending`, legacy handlers |

### Testing strategy

**Replay tests** (event-log fixtures):

```typescript
describe('reduceThreadLiveSnapshot', () => {
  it('merges two inbound messages while thread open', () => {
    const prev = [msg1, msg2];
    const events = [
      { type: 'inboundMessage', message: msg3 },
      { type: 'inboundMessage', message: msg4 },
    ];
    const result = reduceThreadLiveSnapshot(prev, events, config);
    expect(result.next).toEqual([msg1, msg2, msg3, msg4]);
    expect(result.changed).toBe(true);
    expect(result.effects).toHaveLength(2);
  });

  it('applies readBatch to own messages', () => {
    const prev = [ownMsg1, ownMsg2];
    const events = [
      { type: 'readBatch', userId: 'reader', readAt: '...', messageIds: ['1'] },
    ];
    const result = reduceThreadLiveSnapshot(prev, events, config);
    expect(result.next[0].readReceipts).toHaveLength(1);
    expect(result.changed).toBe(true);
  });

  it('allRead emits syncPull effect', () => {
    const prev = [ownMsg1, ownMsg2];
    const events = [
      { type: 'allRead', readerUserId: 'reader', readAt: '...' },
    ];
    const result = reduceThreadLiveSnapshot(prev, events, config);
    expect(result.effects).toContainEqual({ type: 'syncPull', reason: 'allRead' });
  });
});
```

### Related

- #221 Optimistic inbound UI ✓
- #222 Reconcile read receipts in snapshot equality ✓
- #223 Bulk `allRead` read path ✓
- #224 Unify read receipt merge — `mergeReadReceiptSync` shared
- #225 Paint guard scoping — `canFlushLiveSocketEvents`
- #227 Watchdog — blocked on #231 (canonical snapshot from projection)

## Implementation notes

### File locations

- **Reducer:** `Frontend/src/services/chat/threadLiveProjection.ts`
- **Tests:** `Frontend/src/services/chat/__tests__/threadLiveProjection.test.ts`
- **ADR:** `docs/adr/ADR-007-thread-live-projection.md`

### Dependencies reused

- `mergeChatMessagesAscending` — Message merge (ID-based, sorted)
- `mergeReadReceipts` — Read receipt deduplication (user-based)
- `readReceiptsFingerprint` — Equality checking
- `applyAllReadToOwnVisibleMessages` — Bulk read apply
- `applySyncReadBatchToMessages` — Batch read apply

### Future considerations

- **Inbox-from-projection** — Post-epic: unify inbox queue with projection
- **Offline handling** — Effects queue retry on network return
- **Performance** — Virtualized message list stays unchanged
- **Scroll restoration** — Effects may emit scroll adjustments

## Success criteria (Epic #220)

- [ ] Two-user: message while thread open → visible <2s without refresh
- [ ] Two-user: mark-read → all own ticks update without refresh
- [ ] No open scroll flash regression
- [ ] CI replay tests lock behavior
