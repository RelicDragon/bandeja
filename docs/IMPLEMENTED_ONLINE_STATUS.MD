# Online Status Implementation

## Overview

User online status is shown across the app (avatars, player card). Presence is **activity-based**: a user is online if they had activity in the last 2 minutes. Activity is recorded on any authenticated API request (JWT middleware) and on socket connect. The frontend uses a single merged subscription per socket (from a key-based wanted store) and excludes the current user; offline changes are batched and flushed in ~2s, online-only in 60s. REST fallback is used on reconnect and for one-off checks (e.g. player card).

---

## Backend

### Source of truth

- **`PresenceService`** (`Backend/src/services/presence.service.ts`): `lastActivityByUser: Map<userId, timestamp>`. User is online iff `Date.now() - lastActivityByUser.get(userId) < 2 minutes`.
- **Activity recording**:
  - **API**: `recordPresenceActivity` middleware runs on every `/api` request; if a valid JWT is present, decodes `userId` and calls `socketService.recordActivity(userId)` (no DB fetch).
  - **Socket connect**: when a user connects, `presenceService.recordActivity(socket.userId)` is called so opening the app counts as activity.
- **Expiry**: an interval (every 30s) removes users whose last activity is older than 2 minutes and calls `notifyPresenceChange(userId, false)` for subscribers.
- **`connectedUsers`** in `socket.service.ts` is still used for **routing** (emitting events to a user’s sockets, game/chat rooms) and for `getOnlineUsersForGame` / `isUserInChatRoom`; it is **not** used for presence (isUserOnline / getAllOnlineUserIds).

### Socket events

| Event (client → server) | Payload | Behavior |
|-------------------------|--------|----------|
| `subscribe-presence` | `{ userIds: string[] }` | Replace this socket’s subscription with the given IDs (validated, deduped, capped). Reply with `presence-initial` (current online map for those IDs). |

| Event (server → client) | Payload | When |
|-------------------------|--------|------|
| `presence-initial` | `Record<userId, boolean>` | Right after `subscribe-presence`. |
| `presence-update` | `{ online: string[], offline: string[] }` | Batched; offline changes flush sooner (see batching). |

### Subscription and batching

- **Maps**: `presenceSubscriptionBySocket` (socketId → Set of userIds), `presenceSubscribersByUser` (userId → Set of socketIds).
- On presence change (user came online/offline), each subscribing socket gets that userId added to its **buffer** (online/offline sets).
- A **per-socket timer** flushes the buffer. If the buffer contains any **offline** IDs, the timer is set to `PRESENCE_OFFLINE_FLUSH_MS` (2s); otherwise `PRESENCE_FLUSH_MS` (60s). Existing timer is cleared and rescheduled when new changes are buffered, so offline status is delivered within ~2s and online-only batches stay at 60s to limit load.

### Constants

| Location | Constant | Value | Meaning |
|----------|----------|--------|--------|
| `presence.service.ts` | `ACTIVITY_TTL_MS` | 120000 | User is online if activity within 2 minutes. |
| `presence.service.ts` | `EXPIRY_CHECK_MS` | 30000 | Interval to expire inactive users and notify offline. |
| `socket.service.ts` | `PRESENCE_ONLINE_FLUSH_MS` | 5000 | Flush interval when buffer has online-only updates. |
| `socket.service.ts` | `PRESENCE_OFFLINE_FLUSH_MS` | 2000 | Flush interval when buffer has any offline update. |
| `socket.service.ts` | `MAX_PRESENCE_SUBSCRIPTION` | 3000 | Max userIds per socket subscription. |
| `socket.service.ts` | `PRESENCE_SUBSCRIBE_COOLDOWN_MS` | 2000 | Min time between subscribe-presence from the same socket. |
| `socket.service.ts` | `MAX_PRESENCE_USER_ID_LENGTH` | 64 | Max length of each userId in subscription. |

### REST fallback

- **`GET /users/presence?ids=id1,id2,...`** (auth required). Returns `{ success: true, data: Record<userId, boolean> }`.
- IDs: query param, comma-separated; validated (string, length ≤ 64), capped at 100.
- Used for one-off checks (e.g. player card) when the user is not in the socket subscription set.

### Safeguards

- Subscribe cooldown to avoid subscribe spam.
- `clearPresenceSubscription(socketId)` on disconnect: removes subscription, buffer, flush timer, and reverse index entries.
- `flushPresenceForSocket` checks `socket.connected` before emitting; no emit if socket already disconnected.

---

## Frontend

### Presence store (`store/presenceStore.ts`)

- **State**: `online: Record<userId, boolean>` (true = online, false = offline; missing key = unknown).
- **Actions**: `setPresenceInitial(initial)`, `setPresenceBatch(onlineIds, offlineIds)`, `isOnline(userId)`, `isOffline(userId)`, `isUnknown(userId)`.
- **Cap**: Store is pruned to 500 keys (oldest dropped) to avoid unbounded growth.

### Presence wanted store (`store/presenceWantedStore.ts`)

- **State**: `wantedByKey: Record<string, string[]>` — each consumer registers with a key and a list of user IDs.
- **Actions**: `setWanted(key, ids)`, `clearWanted(key)`, `getMergedWantedIds(excludeUserId?)`. Merged list is built by taking all IDs from **list keys** (keys that do not start with `avatar:`), then up to **60** distinct IDs from **avatar keys** (keys starting with `avatar:`), then slicing to `MAX_MERGED_IDS` (300). So chat-list and player-card are never squeezed out; avatar-sourced IDs are capped to avoid overload when many avatars are on screen. Optional `excludeUserId` (e.g. current user) is omitted from the result.

### Subscription manager (`hooks/usePresenceSubscriptionManager.ts`)

- Used once in `App.tsx`. Reads merged wanted IDs (excluding current user), debounces subscription updates (400ms), and sends `subscribe-presence` with the merged list. First run subscribes immediately; later runs debounce to avoid cooldown/spam when multiple consumers update. When the manager first runs and the socket is already connected (e.g. after refresh), it also sets current user as online so the UI is correct without waiting for a connect event. Does not send `subscribe-presence` with `[]` on effect cleanup; server clears subscription on socket disconnect. On **connect**: sets current user as online in the store, subscribes with merged IDs. On **reconnect** only: also calls `getPresence(ids)` and merges into store for fast refill.

### Subscription hook (`hooks/usePresenceSubscription.ts`)

- **usePresenceSubscription(key, userIds)**: Registers wanted IDs under `key` in `presenceWantedStore` (deduped/trimmed). On unmount clears that key. Effect depends only on `key` and the serialized id list so unstable array references from the parent (e.g. `[playerId]`) do not cause extra store updates. Does not talk to the socket directly; the manager drives the single subscription from all registered keys.

### Defensive handling

- **socketEventsStore** presence handlers: `handlePresenceInitial` only calls the store when `data` is a non-null object; `handlePresenceUpdate` checks `data` is an object and uses `Array.isArray` for `online`/`offline`, defaulting to `[]` so malformed payloads do not throw.
- **presenceStore**: `setPresenceInitial` no-ops if `initial` is null or not an object; only entries with string id and boolean value are merged. `setPresenceBatch` treats non-array `onlineIds`/`offlineIds` as `[]` and only writes entries for string ids.

### Socket wiring

- **SocketService**: `subscribePresence(userIds)` emits `subscribe-presence` (ids capped at 300). Listens for `presence-initial` and `presence-update`.
- **socketEventsStore** (in `initialize`): subscribes to `presence-initial` and `presence-update` and forwards to `presenceStore.setPresenceInitial` / `setPresenceBatch`.

### Where subscription is used

- **ChatList**: Builds `presenceUserIds` from current chat list (user chats + contacts), calls `usePresenceSubscription('chat-list', presenceUserIds)`.
- **PlayerCardBottomSheet**: Calls `usePresenceSubscription('player-card', playerId ? [playerId] : [])` while the card is open so that user gets live updates; also fetches `getPresence([playerId])` on open and merges into store.
- **PlayerAvatar**: Each instance calls `usePresenceSubscription(\`avatar:${useId()}\`, player && !isCurrentUser ? [player.id] : [])` so any visible avatar (game participants, invites, trainers, etc.) is included in the merged subscription and the online indicator can show without opening the card. Avatar-sourced IDs are capped at 60 in the store.

### API

- **usersApi.getPresence(userIds)**: `GET /users/presence?ids=...`, dedupes and caps at 100 IDs. Used by PlayerCardBottomSheet on open and by the manager on reconnect for REST fallback.

### UI

- **PlayerAvatar** (`components/PlayerAvatar.tsx`): Registers its player for presence (avatar key) so the indicator can appear on any screen. When `player && isOnline`, the avatar wrapper gets an online border class. **Offline / unknown**: no border. **Online** border is animated (2s ease-in-out infinite pulse) and color depends on type:
  - **Normal**: bluish (`avatar-online-border`).
  - **Trainer**: green (`avatar-online-border-trainer`).
  - **Favorite**: golden (`avatar-online-border-favorite`).
  Priority: favorite > trainer > normal. CSS in `Frontend/src/index.css`: keyframes for each variant (light/dark) using box-shadow pulse.

- **PlayerCardBottomSheet**: Fetches presence on open (`getPresence([playerId])`), merges into store. Shows an **Online** pill (green dot + `playerCard.online`) or **Offline** pill (gray dot + `playerCard.offline`) in the top-left of the avatar panel when status is known; shows nothing when `isUnknown(user.id)`.

---

## Flow (summary)

1. App mounts → `usePresenceSubscriptionManager()` runs; when socket events are initialized it subscribes with merged wanted IDs (excluding current user), debounced. Current user is set online in the store on connect.
2. Visible **PlayerAvatar**s register with keys `avatar:${useId()}`; **ChatList** and **PlayerCardBottomSheet** register with `chat-list` and `player-card`. Merged list = all list-key IDs + up to 60 avatar-key IDs (capped), then max 300 total.
3. Manager sends `subscribe-presence` with merged ids (debounced) → server replies with `presence-initial` (online = activity in last 2 min) → store updated → avatars show border by type on any screen.
4. When a user’s activity is recorded (API request or socket connect), server notifies subscribers → `presence-update` (online). When 2 min pass with no activity, expiry loop notifies → `presence-update` (offline). Buffers flush offline in ~2s, online-only in 5s.
5. User opens a player card → sheet registers `player-card`, fetches `getPresence([playerId])` → store updated → Online/Offline pill shown when known.
6. On socket reconnect, manager re-subscribes with merged ids and calls `getPresence(ids)` to refill the store; on first connect only subscribe (no REST).

---

## Files touched

| Area | Files |
|------|--------|
| Backend | `src/services/presence.service.ts`, `src/services/socket.service.ts`, `src/middleware/recordPresenceActivity.ts`, `src/app.ts`, `src/controllers/user/presence.controller.ts`, `src/routes/user.routes.ts`, `src/controllers/user.controller.ts` |
| Frontend store | `store/presenceStore.ts`, `store/presenceWantedStore.ts`, `store/socketEventsStore.ts` |
| Frontend socket | `services/socketService.ts` |
| Frontend hook / API | `hooks/usePresenceSubscription.ts`, `hooks/usePresenceSubscriptionManager.ts`, `api/users.ts` |
| Frontend UI | `components/PlayerAvatar.tsx`, `components/PlayerCardBottomSheet.tsx`, `components/chat/ChatList.tsx`, `components/chat/UserChatCard.tsx` |
| App | `App.tsx` (calls `usePresenceSubscriptionManager`) |
| Styles | `index.css` (avatar-online-border* keyframes and classes) |
| i18n | `i18n/locales/*.json` (`playerCard.online`, `playerCard.offline`) |
