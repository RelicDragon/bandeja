# Messages Overhaul Plan — Reliable Chat Across All Contexts

## Goals

1. **Reliable delivery** — Messages and unread state are correct when the user returns to the app (foreground) or after socket reconnects, regardless of push/telegram settings.
2. **DRY** — One flow for all chat types: `GAME`, `BUG`, `USER`, `GROUP`. No per-context branching in sync, send, or receive logic where avoidable.
3. **Respect notification preferences** — Push and Telegram are optional; if user disables them, we never send. Sync on open/reconnect is the mandatory path and does not depend on push.

---

## Principle: Two Independent Channels

| Channel | Purpose | User control |
|--------|---------|----------------|
| **Push / Telegram** | Alert user when app is in background. Optional. | User can disable in settings. We never send if disabled. |
| **Sync on reconnect / foreground** | Bring app state up to date. Mandatory. | Always run when app becomes active or socket reconnects. No dependency on push. |

**If user has push disabled:** They are not notified while the app is closed, but as soon as they open the app we run sync and they see all new messages and correct unread counts. No special “force send” is needed — sync is the fallback.

---

## 1. Unified Chat Model (DRY)

All chat contexts use the same identifiers and APIs:

- **Context key:** `(chatContextType, contextId)` — e.g. `GAME`, `gameId`; `GROUP`, `channelId`; `USER`, `userChatId`; `BUG`, `bugId`.
- **Backend:** One `emitChatEvent(chatContextType, contextId, ...)`, one `getUnreadCountForContext(chatContextType, contextId, userId)`, one `getMissedMessages(contextType, contextId, lastMessageId)`.
- **Frontend:** One `joinChatRoom(contextType, contextId)`, one sync function that takes `(contextType, contextId)` and calls the same REST endpoints for every context.

Avoid duplicating logic per context type. Prefer a single service that accepts `contextType` + `contextId` and delegates to existing backend APIs that already support all types.

---

## 2. Sending Messages

- **Keep using HTTP** for sending. Frontend already uses `chatApi.createMessage(...)` (see `chatSendService.ts`). Do not send messages over the socket.
- Server persists the message, broadcasts via socket to other clients, and sends push/telegram only when the user has allowed it. No change needed for DRY; backend already has a single create flow with context-specific recipient resolution.

---

## 3. Receiving and Sync (Make It Reliable)

### 3.1 Real-time (socket)

- When the socket is connected, continue to use it for live messages and unread count updates.
- All contexts use the same event shape: e.g. `chat:message` and `chat:unread-count` with `contextType` and `contextId` so the client can update state in one place.

### 3.2 Sync on reconnect and foreground (mandatory)

When either of these happens, run a **unified sync** for all active chat contexts:

1. **Reconnect:** After `rejoinActiveChatRooms()`, run sync for every room in `activeChatRooms` (same list: `contextType` + `contextId`).
2. **Foreground:** On `App.addListener('appStateChange', { isActive })` when `isActive === true`, run the same sync.

Sync steps (same for every context):

- For each `(contextType, contextId)` in the active set:
  - Call `GET /api/chat/missed-messages?contextType=&contextId=&lastMessageId=` (use last known message id for that context, if any).
  - Merge returned messages into local state (append, deduplicate by id).
  - Optionally call unread-count API for that context or use a batch unread endpoint if available.
- Invalidate or refresh the chat list (e.g. refetch list or unread counts) so the sidebar/badge is correct.

No push or telegram is involved in sync; it is purely HTTP + local state.

### 3.3 Push / Telegram (optional, respect settings)

- When a new message is created, server:
  - Emits via socket (for connected clients).
  - May send push and/or Telegram **only if** the recipient has allowed it in notification preferences.
- If the user has disabled push (and/or Telegram), do **not** send. Do not add a “force” channel. The user will see the message when they open the app thanks to sync.

---

## 4. App Lifecycle (Capacitor)

- **Background:** On `appStateChange` with `isActive === false`: pause heartbeat, optionally disconnect socket to save battery.
- **Foreground:** On `appStateChange` with `isActive === true`:
  1. Reconnect socket (if disconnected).
  2. After connection is ready, run the unified sync (missed messages + unread counts for all active rooms).
  3. Invalidate chat list cache so the next render shows fresh data.

Use one place (e.g. `App.tsx` or a small `appLifecycle.service.ts`) to subscribe to `App.addListener('appStateChange')` and call into socket service + sync service. Keep chat-type logic inside the sync service, not in the lifecycle handler.

---

## 5. Implementation Checklist

- [ ] **Unified sync service (frontend)**  
  - Input: list of `{ contextType, contextId }` (from active rooms or from chat list).  
  - For each context: call `getMissedMessages(contextType, contextId, lastMessageId)`, merge into state.  
  - Refresh unread counts (existing API) and invalidate chat list cache.

- [ ] **Socket reconnect**  
  - After `rejoinActiveChatRooms()`, call the unified sync for all `activeChatRooms`.

- [ ] **App state listener**  
  - On foreground: ensure connection, then run the same unified sync.  
  - On background: pause heartbeat, optionally disconnect.

- [ ] **Chat list / unread**  
  - After any sync, trigger refetch or invalidation so the list and badges reflect server state.

- [ ] **No new push path**  
  - Do not add “send something else forcefully” when push is disabled. Rely on sync when the app is opened.

---

## 6. Files to Touch (Summary)

- **Frontend:**  
  - New or existing sync module that uses `chatApi.getMissedMessages` and unread APIs for any `(contextType, contextId)`.  
  - `socketService.ts`: after rejoin, call sync; expose `getActiveChatRooms()` or pass rooms into sync.  
  - `App.tsx` (or lifecycle service): `App.addListener('appStateChange')` → foreground: connect + sync; background: pause/disconnect.

- **Backend:**  
  - No change required for “no push” behavior: keep respecting notification preferences.  
  - Ensure `getMissedMessages` and unread APIs work for all context types (already do).  
  - Optional: single “batch unread for many contexts” endpoint to make sync one call instead of N.

---

## 7. DRY Summary

- One **context key** format everywhere: `(chatContextType, contextId)`.
- One **sync flow** for all types: same API, same merge logic, same invalidation.
- One **app lifecycle** handler: foreground → sync; background → pause.
- One **send path**: HTTP only; push/telegram remain optional and preference-driven.
