# Chat read authority: cursor-only (sunset per-message receipts)

**Status:** accepted (ship: dual-write ON for old clients; new client cursor-primary; Phase D deferred)  
**Date:** 2026-07-28  
**Supersedes (behavior target):** dual authority of `ChatReadCursor` (unread) + `MessageReadReceipt` (own-message ticks)

## Context

Unread and “caught up” already use **`ChatReadCursor`** (`readMaxServerSyncSeq`, `readMaxCreatedAt`, `readMaxMessageId` per user × context × `chatType`).

Own-message ticks (✓ / ✓✓) and “Read by N” use **`MessageReadReceipt`** rows + `MESSAGES_READ_BATCH` / `MESSAGE_READ_RECEIPT` sync.

Those two models diverge under late media upload, single-message mark (react), and mark-all that treats cursor-covered messages as read without receipt rows. A 2026-07 harden patch forces receipts to catch up; that is a bridge, not the end state.

Product tick meaning today and going forward: **at least one other participant has read up through this message** (not “read by everyone”).

## Decision

**Single authority: read cursor.**

1. **Unread** for a viewer = messages from others strictly after that viewer’s cursor (existing SQL order: seq → createdAt → id).
2. **Own-message tickRead** = at least one **peer cursor** (same thread key, other user) is at or past that message’s position under the same order.
3. **Mark-read** (enter, activity, while-viewing, send, react) only **merges the actor’s cursor forward** — no requirement to upsert per-message receipts for correctness.
4. **`MessageReadReceipt` is deprecated** and removed on a phased sunset (below). Until then, writes may remain for backward compatibility.

## New mechanics

### Thread key

Unchanged: `(chatContextType, contextId, chatType)` — GAME PUBLIC/PRIVATE/ADMINS stay separate cursors.

### Cursor position

Unchanged merge rules (`ChatReadCursorService.mergeFromMessage`): cursor only moves forward.

### Peer cursors (new product surface)

For an open thread, clients need peer read positions to compute ticks without receipts:

| Channel | Payload (sketch) |
|--------|-------------------|
| Sync event **`READ_CURSOR_UPDATE`** (add to `@bandeja/chat-contract`) | `{ userId, chatContextType, contextId, chatType, readMaxServerSyncSeq, readMaxCreatedAt, readMaxMessageId, updatedAt }` |
| Thread bootstrap / hydrate | Include `peerCursors: PeerCursor[]` (exclude viewer) or a compact **`maxPeerCursor`** aggregate for tick-only UI |
| Socket (optional live) | Same shape as sync event, room = thread participants |

**Minimum viable for ticks:** maintain `maxPeerCursor` = component-wise max over peers (by seq/createdAt/id compare). TickRead for own message M iff `compare(maxPeerCursor, position(M)) >= 0`.

**Optional later:** keep full peer list for “Read by N” / avatars; not required for ✓✓.

### Tick UI

| State | Rule |
|-------|------|
| sending / failed / queued | unchanged (local outbox) |
| sent | on server, no peer cursor past message |
| delivered | optional: keep `MessageState.DELIVERED` or drop and fold into sent |
| read | peer cursor (or maxPeerCursor) ≥ message position |

Monotonic by construction: if a newer own message is read, every older own message in that chatType is read.

### Mark-read write path

1. Resolve target position (latest visible / reacted message / thread head).
2. `mergeFromMessage` for actor.
3. Append **`READ_CURSOR_UPDATE`** (and emit socket).
4. Recompute unread authority envelope (existing).
5. **Compat (Phase A–B):** still create receipt rows and/or emit `MESSAGES_READ_BATCH` so old clients keep ticks.

### Late media / late insert

No special receipt backfill. A late-persisted message with older `createdAt` but newer `serverSyncSeq` sits **after** cursors that only advanced on earlier seq → remains unread until the peer marks again (viewing / enter / reply).  
If product wants “insert into already-read history,” advance is explicit (optional server heuristic: if `createdAt ≤ peer.readMaxCreatedAt` **and** peer is still viewing, merge peer cursor to include the new seq) — separate decision; default is **seq-honest unread**.

### React / reply

React and send continue to imply mark-read for the actor (cursor merge to that message / thread head). No per-message receipt fan-out required for correctness after sunset.

## Backward compatibility

| Phase | Server | New client (this app) | Old clients / residual |
|-------|--------|-------------------|-------------------------|
| **Compat (shipped)** | Mark-read updates **cursor + receipts** (`CHAT_READ_RECEIPT_DUAL_WRITE` default **ON**); emit **both** `READ_CURSOR_UPDATE` and `MESSAGES_READ_BATCH` / live receipt fan-out | Ticks **only** from peer cursors / `maxPeerCursor`; ignore receipts for ticks | Receipt rows + batches keep old ticks / “read” UI working |
| **D – Sunset** | Set `CHAT_READ_RECEIPT_DUAL_WRITE=0`; stop writing `MessageReadReceipt`; stop emitting `MESSAGE_READ_RECEIPT` / `MESSAGES_READ_BATCH` | Already cursor-only; strip dead receipt tick paths / late-insert receipt job | Table drop after retention window |

API responses that embed `message.readReceipts` stay populated while dual-write is ON (may be empty after sunset). Do not break payload shape until a coordinated API major/version flag if external clients exist (today: first-party only).

## Sunset of `MessageReadReceipt`

1. **New client already ignores receipts for ticks** (cursor-only).
2. **Stop dual-write** via `CHAT_READ_RECEIPT_DUAL_WRITE=0` after old clients are gone / one release bake.
3. **Delete** FE: `pendingThreadReadReceipts`, `applySyncReadBatchToMessages` for ticks, late-insert receipt scheduler, “Read by N” from receipts (replace with peer count or remove).
4. **Delete** BE: receipt createMany in mark-all / mark-one; `createReceiptsForLateInsertReaders`; receipt includes on message fetch (optional empty array).
5. **Drop table** `MessageReadReceipt` in a dedicated Prisma migrate after metrics show zero dual-write and no receipt-based clients.
6. **Contract:** deprecate then remove `MESSAGE_READ_RECEIPT` / `MESSAGES_READ_BATCH` from `@bandeja/chat-contract` once no events remain in sync logs (or ignore unknown types forever — prefer remove after log TTL).

## Implementation plan (ordered)

1. Add `READ_CURSOR_UPDATE` to chat-contract; BE append on every cursor merge that advances; FE adapter → thread live + Dexie peer-cursor store.
2. Thread open/hydrate: return peer cursors (or maxPeerCursor) for current chatType.
3. FE `resolveOwnMessageTicks`: **cursor only** (new client); BE dual-write **ON** for old clients.
4. Cursor-order tick tests (incl. late seq); receipts must not flip ticks on new client.
5. After old clients sunset: `CHAT_READ_RECEIPT_DUAL_WRITE=0`; monitor; then Phase D code + schema removal.
6. Update `APP_FUNCTIONALITY.md` §12.3–12.5 (receipts → peer read cursors) on Phase D.
7. Remove bridge code from the 2026-07 receipt-backfill harden patch once dual-write is off.

## Rejected alternatives

- **Keep dual model permanently** — ongoing divergence under upload/react races; patch debt.
- **Receipts-only (drop cursor)** — worse for unread aggregation and mark-all cost; does not match existing unread authority.
- **Tick = read by all participants** — wrong for large GAME/GROUP threads; not current product meaning.
- **Derive ticks only from viewer cursor** — meaningless for own messages.
- **Per-device delivery receipts as tick authority** — heavier than needed; delivery ≠ read.

## Consequences

- **Simpler mental model:** one forward-only pointer per reader per thread slice.
- **Reliable ticks:** no orphan receipt / cursor mismatch class of bugs.
- **Cheaper mark-read:** O(1) cursor upsert vs O(n) receipt rows (large threads).
- **New requirement:** fan-out / persist peer cursor updates to senders (sync + hydrate).
- **Group “Read by N”** becomes cursor-count or is dropped until peer list UI exists.
- **Compat window** required so ticks do not regress on mixed client versions.

## References

- `ChatReadCursor` / `ChatReadCursorService`
- `sqlMessageNotReadByUser` (unread = not covered by cursor and, today, not receipted)
- FE `messageTickState.resolveOwnMessageTicks`
- Harden bridge (2026-07): missing-receipt mark-write, react backfill, pending receipts, late-insert receipt job — **temporary** under this ADR
