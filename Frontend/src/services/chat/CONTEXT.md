# Chat Service Context

## Thread Live Projection

Thread Live Projection is the React-state projection for an open chat thread. It is the single owner of live `setMessages` updates for socket messages, socket read receipts, optimistic sends, and reconcile hydration while the user is viewing a thread.

The projection is intentionally separate from durability. `threadLiveProjection.ts` contains the pure reducer and emits effects for persistence, acknowledgements, unread clearing, and L1 cache writes. The open socket path maps room events into projection events and applies them synchronously so the visible thread updates immediately, then runs effects without blocking paint.

## Related Terms

`chatOpenSnapshot` is the bootstrap and reconciliation snapshot path. It decides what the thread should paint from local storage/L1 and how later snapshots merge without losing live or optimistic rows.

`applyThreadEvent` is the durability/event-application path for Dexie and cross-surface local state. It persists and indexes chat changes, but it is not the live UI writer for an already-open thread.

For open-thread reliability, prefer routing new live message/read state through Thread Live Projection first, then persist through emitted effects or `applyThreadEvent`. Avoid adding window events or module-level queues as bridges between sync/socket code and open-thread UI state.

## Game chat lifecycle

**Game chat lifecycle** — whether a game chat context is `active` (live `Game` row exists), `archived` (game deleted, `CancelledGame` + participant snapshot), or `missing`.

**Thread archive** — terminal thread state after game delete: message history kept locally and on server, writes blocked, live socket/sync tail stopped. Emitted as `THREAD_ARCHIVED` sync event. Always on for game delete (no env flag). Client handler: `chatThreadLifecycle.applyThreadTerminal('archived', …)` — sets `chatThreads.archivedAt`, drops outbox, leaves socket room; does **not** purge Dexie.

**Thread invalidation** — terminal thread state where the local copy must be wiped (user merge, migrations). Emitted as `THREAD_LOCAL_INVALIDATE`. Client handler: `applyThreadTerminal('invalidate', …)` → `purgeLocalDexieThread`. Distinct from thread archive.

Epic: GitHub #248.
