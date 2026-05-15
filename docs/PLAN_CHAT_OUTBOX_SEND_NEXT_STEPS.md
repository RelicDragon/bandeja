# Plan: Chat outbox / send pipeline — next steps

Context: optimistic UI + Dexie outbox + `clientMutationId` + socket/sync.

**Last updated:** Phases 2–6 implemented (core); Phase 1 QA and Phase 5 analytics hookup remain. See [Implementation status](#implementation-status) below.

---

## Implementation status

### Done (in repo)

| Area | What |
|------|------|
| **Coordinator** | `Frontend/src/services/chat/chatSendCoordinator.ts` — generation, `AbortController`, phase deadlines, `teardown` / `seal` |
| **Send service** | `Frontend/src/services/chatSendService.ts` — uses coordinator; per-phase timeouts (4s outbox wait, 30s upload, 15s API) |
| **Abort** | `signal` on `chatApi.createMessage`, `mediaApi` uploads, `uploadChatImageFileWithRetry` |
| **Outbox persist** | `chatOutboxPersist.ts` — `await` Dexie `add` via `persistOptimisticOutbox` |
| **Metrics** | `chatSendMetrics.ts` — dev `console.info` + `bandeja-chat-send-metric` event |
| **UX** | `useOptimisticSendSlowHint` — “Taking longer…” after 8s; i18n `chat.sending` / `chat.sendingSlow` |
| **Tests** | `npm run test:chat-outbox` — coordinator (incl. concurrent wake lock), enqueue, retry, send state, socket ack |
| **Earlier** | Outbox enqueue wait, stuck retry, requeue on navigate, generation guards |
| **Phase 6 — compression** | `chatOutboxImageCompress.ts` — resize/JPEG before Dexie in `persistOptimisticOutbox` (optimistic path only) |
| **Phase 6 — socket ack** | `chatSendSocketAck.ts` — race HTTP `createMessage` vs `chat:message` by `clientMutationId`; metric `chat_send_socket_ack` |
| **Phase 6 — send state** | `messageSendState.ts` — `getMessageSendState()` used in `MessageItem` (minimal; not app-wide refactor) |
| **Phase 6 — native background** | `chatSendKeepAwake.ts` — KeepAwake while any send active; Capacitor background → `flushAllChatOfflineQueues` (`chatBackgroundSync` + `appLifecycle`) |

### Remaining (manual / later)

| Phase | Status |
|-------|--------|
| **Phase 1** — Production QA matrix | Manual — not automatable here |
| **Phase 3** — `inputBlocked` audit | Poll/edit/join already use `finally`; monitor in QA |
| **Phase 3** — List vs thread outbox | Relies on existing `reconcileThreadIndexOutboxForContext`; verify in QA |
| **Phase 5** — Sentry / prod dashboards | Wire `CHAT_SEND_METRIC_EVENT` to analytics when ready |
| **Phase 6 — optional** | Non-queue image upload compression; app-wide `MessageSendState`; native background-upload plugin; abort HTTP after socket ack |

---

## Phase 1 — Validate in production (1–2 days)

**Goal:** Confirm stall reports are gone.

### Manual QA matrix

- Text send on flaky network (DevTools throttling).
- Photo + voice send; leave chat mid-send; return.
- Airplane mode → send → go online (outbox flush).
- Resend while a previous attempt may still be in flight.
- User chat, game chat, tab switch (`PUBLIC` vs `PRIVATE`).

### Dexie checks

- After failure: `outbox` row is `failed`, not stuck `sending`.
- After success: row removed; optimistic replaced by server message id.

### Light metrics

- Listen for `[bandeja-chat-send]` in dev tools or subscribe to `bandeja-chat-send-metric`.

**Exit criteria:** No infinite SENDING without FAILED + resend/dismiss.

---

## Phase 2 — Harden send pipeline

**Status: implemented** (see coordinator + abort + phase timeouts).

| Item | Status |
|------|--------|
| `AbortController` on create + uploads | Done |
| Single send coordinator | Done — `chatSendCoordinator.ts` |
| Per-phase timeouts | Done — 4s / 30s / 15s |
| `await` outbox `add` | Done — `persistOptimisticOutbox` |

---

## Phase 3 — Composer / UX polish

**Status: partial.**

1. **`inputBlocked` audit** — verify poll/edit/join under QA; optimistic sends do not set `isLoading`.
2. **Long SENDING affordance** — Done (8s hint).
3. **List + thread consistency** — verify `listOutbox` matches thread state in QA.

---

## Phase 4 — Automated tests

**Status: implemented (core units).**

```bash
cd Frontend && npm run test:chat-outbox
```

Covers: generation invalidation, abort, enqueue wait, retry `includeFailed` filtering, `getMessageSendState`, socket ack wait/deliver, concurrent wake-lock acquire/release.

Optional later: integration test with mocked `chatApi.createMessage`.

---

## Phase 5 — Observability & ops

**Status: partial.**

- `recordChatSendMetric` + `CHAT_SEND_METRIC_EVENT` — Done (client-side).
- Support playbook — below.
- Sentry — not wired.

### Support playbook

1. Failed bubble → **Resend** or dismiss (remove from queue).
2. Stuck list “Sending…” → pull to refresh / reopen chat; check online.
3. Last resort: clear site data (loses local Dexie cache).

---

## Phase 6 — Bigger wins

**Status: implemented (incremental).** Not a full native background-upload stack or app-wide send-state refactor.

| Item | Status | Notes |
|------|--------|--------|
| Compress images before outbox | Done | `chatOutboxImageCompress.ts` → `persistOptimisticOutbox`; max edge 2048px, skips small/GIF |
| Server send ack over socket | Done | `createMessageWithSocketAck` races HTTP vs socket; `deliverChatSendSocketAck` in `socketEventsStore` |
| Capacitor background / uploads | Partial | KeepAwake while sends active; flush on native background (`appLifecycle` + `chatBackgroundSync`); no BG upload plugin |
| Unified `MessageSendState` in UI | Partial | `messageSendState.ts` + `MessageItem`; other sites still use `_status` |

---

## Code map

| Module | Role |
|--------|------|
| `chatSendCoordinator.ts` | Generation, abort, deadlines, wake-lock slot sync |
| `chatSendService.ts` | Orchestrates send pipeline; socket/HTTP race on create |
| `chatOutboxEnqueue.ts` | Wait for Dexie row |
| `chatOutboxPersist.ts` | Blocking outbox write + image compression |
| `chatOutboxImageCompress.ts` | Canvas resize/JPEG before Dexie blobs |
| `chatOutboxRetry.ts` | Stuck / failed resume |
| `chatSendMetrics.ts` | Client metrics events |
| `chatSendSocketAck.ts` | Pending `clientMutationId` → socket message |
| `chatSendKeepAwake.ts` | Native KeepAwake during active sends |
| `messageSendState.ts` | Derived sending/failed/sent UI state |
| `chatBackgroundSync.ts` | SW flush (web) + Capacitor background flush |
| `useGameChatOptimistic.ts` | Optimistic UI + persist |

Related: [PLAN_CHAT_L1_MEMORY_CACHE.md](./PLAN_CHAT_L1_MEMORY_CACHE.md) (orthogonal).

---

## Recommended order (updated)

```
Phase 1 (manual QA) → wire Phase 5 analytics → optional Phase 6 polish
```

Phases 2–6 core work is in the codebase; focus production validation and Sentry/analytics next.
