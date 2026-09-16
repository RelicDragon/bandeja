# Realtime (Socket.IO)

Server: `Backend/src/services/socket.service.ts`. Path `/socket.io/`. Transports websocket + polling. JWT on handshake (`auth.token` or `Authorization`). Redis adapter when `REDIS_URL` or `SOCKET_IO_REDIS_URL` is set (`@socket.io/redis-adapter`) — required for multi-node; `connectedUsers` map is **local node only**. Cross-node fan-out: `io.to(room)`.

Facade: `socketEmitFacade.ts` (bets). Play-intent publish: `playIntent/playIntentRealtime.ts`. Presence TTL: `presence.service.ts` (2 min activity, 30s expiry loop).

Client: `Frontend/src/services/socketService.ts` (connection, rooms, ping/pong, rejoin). App-level handlers: `Frontend/src/store/socketEventsStore.ts`. Some events bind elsewhere (`App.tsx` wallet, `AuctionBidSection` auction, `useThreadPinned` pins, `usePlayIntent` invalidate).

## Rooms (actual strings)

| Room | Join | Use |
|------|------|-----|
| `notify-user-{userId}` | Auto on connect | DMs, invites, unread, stories, teams, wallet, targeted game-updated, play-intent user fan-out |
| `notify-developers` | Auto if `user.isDeveloper` | `new-bug` |
| `game-{gameId}` | `join-game-room` | Game chat + game-updated / results / timer / live scoring / photos / cancel |
| `bug-{bugId}` | `join-bug-room` | `ChatContextType.BUG` thread |
| `user-chat-{chatId}` | `join-user-chat-room` | DM room (USER live chat also emits to both `notify-user-*`) |
| `group-{groupChannelId}` | `join-chat-room` `{ contextType: GROUP, contextId }` | Groups, channels, bug GroupChannels, market threads |
| `market-item-{marketItemId}` | `join-market-item-room` | Auction bids |
| `play-intent-pool:{cityId}` | `subscribe-play-intent-pool` | City pool invalidate (max 4 rooms / socket) |

Not `game:{id}` / `user:{id}`. Game chat live emit may skip the raw game room and target recipients (`gameChatSocketRecipients.ts`) for PRIVATE/ADMINS / roster visibility.

Leave counterparts: `leave-*-room`. Acks: `joined-*` / `left-*` / `subscribed-play-intent-pool`.

## Sync handshake

On every connection the server emits **`sync-required`** `{ timestamp }`. Client bumps `syncRequiredEpoch` (`socketEventsStore`) → open thread / inbox pull tails.

Client may emit **`sync-messages`** `{ contextType, contextId, lastMessageId? }` → server **`sync-ready`**. Delivery: client **`chat:message-ack`** `{ messageId, contextType, contextId }`. Heartbeat: `ping` / `pong`.

This is **not** the chat sync log. Event log is HTTP `GET /chat/sync/events` (`@bandeja/chat-contract`). Socket is live edge; Dexie tail is durability.

## Presence

Client `subscribe-presence` `{ userIds }` (cap 3000, 2s cooldown). Privacy: viewer or target with `showOnlineStatus=false` gets empty. Server: `presence-initial` map, then coalesced `presence-update` `{ online, offline }` (5s online / 2s offline flush).

## Typing

Client `typing-indicator` `{ contextType, contextId, isTyping }` (or legacy `gameId`). Must already be in that chat room. Fan-out to the chat room. Auto-off 6s. Leave-room forces off if no other tab of the same user remains.

## play-intent:invalidate

Const: `PLAY_INTENT_INVALIDATE_EVENT` = `'play-intent:invalidate'` (`Frontend/shared/playIntentRealtime.ts`).

Payload: `{ version: 1, reason, cityId, sport, entityType, occurredAt, intentId?, proposalId? }`.

Reasons: `intent-created` `intent-cancelled` `intent-expired` `intent-status-changed` `proposal-created` `proposal-updated` `proposal-expired` `proposal-converted` `matching-games-changed`.

Emit: pool room `play-intent-pool:{cityId}` **and** listed `notify-user-*`. HTTP remains authoritative; this only marks stale. FE: `usePlayIntent.ts`, `useInviteLookingPool.ts`. Constraint: APP_FUNCTIONALITY §2.2 play-intent notifications are queued — do not replace with fire-and-forget.

## game-text:invalidate

Const: `GAME_TEXT_INVALIDATE_EVENT` = `'game-text:invalidate'` (`Frontend/shared/gameTextRealtime.ts`).

Payload: `{ version: 1, gameId, locale, nameSourceRevision, descriptionSourceRevision, reason, occurredAt }` — **no** translated name/description.

Reasons: `published` (worker) `corrected` (organizer PATCH).

Emit after successful publish/correction: room `game-{gameId}` **and** `notify-user-*` for owner/trainer/participants only (same authorized routing as game updates; never broadcast private/pending Event text). Redis adapter optional for multi-node fan-out. HTTP refetch is authoritative. FE: `socketEventsStore` → `queryInvalidationBridge` / `invalidateGameTextCachesForEvent`; details refetch + capped pending poll. Do not piggyback chat translation events.

## Server → client events

Verified against emit sites vs APP_FUNCTIONALITY §32 (chat, unread, game, timer, scoring, photos, invites, teams, bets, auction, stories, wallet, presence, typing, sync, play-intent).

**Chat (room or `notify-user-*` for USER)** — `socket.service.ts` `emitChatEvent` / dedicated emitters:

| Event | Notes |
|-------|--------|
| `chat:message` | |
| `chat:message-updated` | |
| `chat:reaction` | may include `readCursor` |
| `chat:read-receipt` | dual-write leftover; ticks use cursors |
| `chat:deleted` | |
| `chat:poll-vote` | |
| `chat:message-transcription` | |
| `chat:message-translation` | |
| `chat:auto-translate-config` | |
| `chat:pinned-messages-updated` | FE: `useThreadPinned.ts` (not socketEventsStore) |
| `chat:unread-count` | `notify-user-*` |
| `chat:unread-invalidate` | `{ userUnreadRevision, reason }` |
| `typing-indicator` | |

**Game / live**

| Event | Room |
|-------|------|
| `game-updated` | `game-*` and/or `notify-user-*` |
| `game-cancelled` | `game-*` (also on unauthorized join if cancelled) |
| `game-results-updated` | `game-*` |
| `match-timer-updated` | `game-*` |
| `match-live-scoring-updated` | `game-*` |
| `game_photo:added` `game_photo:deleted` `game_photo:main_changed` | `game-*` (`gamePhoto.events.ts`) |

**Social / economy**

| Event | Source |
|-------|--------|
| `new-invite` `invite-deleted` | `notify-user-*` |
| `user-team:invite` `user-team:invite-accepted` `user-team:invite-declined` `user-team:member-removed` `user-team:updated` `user-team:deleted` | `notify-user-*` |
| `bet:created` `bet:updated` `bet:deleted` `bet:resolved` | `socketEmitFacade.ts` |
| `auction:bid` `auction:bin-accepted` | `market-item-*` |
| `wallet-update` | `notify-user-*` (`App.tsx`) |
| `new-bug` | `notify-developers` |
| `story:new` `story:deleted` `story:viewed` | `story.events.ts` |
| `story:like` `story:comment` `story:comment:deleted` | `storyEngagement.events.ts` |
| `story:comment:like` | broadcast `io.emit` |

**Session**

| Event | |
|-------|--|
| `sync-required` | every connect |
| `sync-ready` | after `sync-messages` |
| `presence-initial` `presence-update` | |
| `play-intent:invalidate` | |
| `game-text:invalidate` | `game-*` + authorized `notify-user-*`; metadata only |
| `error` | `{ message, code? }` |
| `pong` | |

Join/leave acks listed under Rooms.

## Client → server

`join-game-room` / `leave-game-room`, `join-bug-room` / `leave-bug-room`, `join-user-chat-room` / `leave-user-chat-room`, `join-chat-room` / `leave-chat-room`, `join-market-item-room` / `leave-market-item-room`, `subscribe-play-intent-pool` / `unsubscribe-play-intent-pool`, `subscribe-presence`, `typing-indicator`, `chat:message-ack`, `sync-messages`, `ping`.
