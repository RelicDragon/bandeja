# Push notification inline reply (lock screen / notification shade)

**Status:** draft  
**Depends on:** [AUTH_REFRESH_TOKEN_PLAN.md](./AUTH_REFRESH_TOKEN_PLAN.md)

Plan for letting users reply to chat messages from a push notification without opening the app.

## Goal

When a user receives a push for a new chat message (`USER_CHAT`, `GAME_CHAT`, `GROUP_CHAT`, `BUG_CHAT`), they should be able to type a reply directly from the lock screen or notification shade — same UX as iMessage, WhatsApp, Telegram.

---

## Scope matrix — what is / isn't replyable

| `NotificationType` | Replyable? | Reason |
|--------------------|------------|--------|
| `USER_CHAT` (DM) | Yes | Real chat |
| `GAME_CHAT` | Yes | If user can write that `chatType` |
| `GROUP_CHAT` | Yes | If user can write (not read-only channel) |
| `BUG_CHAT` | Yes | If user joined bug chat |
| `USER_CHAT` (story engagement) | **No** | `storyEngagement.notifications.ts` sends `USER_CHAT` with `{ sourceType, sourceId }` — no `userChatId` / `chatContextType` |
| `GAME_SYSTEM_MESSAGE` | **No** | System messages, not a conversation |
| `INVITE`, `TEAM_INVITE`, marketplace, etc. | **No** | Different action model (accept/decline / tap only) |

**Rule:** attach `category: CHAT_REPLY` and `actions` only when `chatContextType` + `contextId` + `messageId` are all present.

---

## Product decisions (resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | `replyToId` vs free-standing message | **Always** set `replyToId` to the notifying message's `messageId` |
| 2 | Reply action on media-only pushes | **Yes** — show reply; user can send text |
| 3 | Max reply length | **Min of app / Telegram / server** → enforce **4096** chars client-side before send (app draft max 10000, server edit max 10000, Telegram text max 4096 — see limits below) |
| 4 | Failed reply UX | **Localized local notification** — "Couldn't send" (not silent) |
| 5 | Offline reply | **Fail immediately** — no outbox queue |
| 6 | Delivery receipt | **`confirmMessageReceipt(..., 'push')` on receive AND after successful inline reply** |
| 7 | Rate limit | **Standard `createMessageLimiter`** — 30 messages per 60s per user (`chat.routes.ts`) |

### Length limits reference

| Layer | Limit | Source |
|-------|-------|--------|
| App composer | 10000 | `Frontend/src/components/chat/messageInputDraftUtils.ts` → `DRAFT_MAX_CONTENT_LENGTH` |
| Server (edit) | 10000 | `PATCH /chat/messages/:id` validator |
| Telegram bot API | 4096 | `Backend/src/services/telegram/utils.ts` → `trimTextForTelegram` |

**Push reply enforce:** `Math.min(4096, …)` on client before `POST /chat/messages`. Truncate or reject with local error if over.

---

## Payload contract (canonical)

All values in FCM `data` must be **strings**. iOS nests under `payload.data`; Android may flatten — frontend must handle both (see below).

```ts
{
  type: 'USER_CHAT' | 'GAME_CHAT' | 'GROUP_CHAT' | 'BUG_CHAT',
  chatContextType: 'USER' | 'GAME' | 'GROUP' | 'BUG',
  contextId: string,
  messageId: string,
  chatType?: 'PUBLIC' | 'PRIVATE',  // GAME only
  // legacy navigation (keep for tap handler):
  userChatId?, gameId?, groupChannelId?, bugId?, userId?, marketItemId?,
}
```

### Per-builder mapping

| Builder | `chatContextType` | `contextId` | `chatType` | Legacy fields kept |
|---------|-------------------|-------------|------------|-------------------|
| `user-chat-push.notification.ts` | `USER` | `userChat.id` | — | `userChatId`, `userId` |
| `game-chat-push.notification.ts` | `GAME` | `game.id` | `message.chatType` | `gameId` |
| `group-chat-push.notification.ts` | `GROUP` | `groupChannel.id` | — | `groupChannelId`, `bugId?`, `marketItemId?` |
| `bug-chat-push.notification.ts` | `BUG` | `bug.id` | — | `bugId` |

### iOS vs Android data shape (frontend)

`pushNotificationService.ts` → `normalizeNotificationData`:

- **iOS:** `{ type, data: { gameId, chatContextType, … } }` (nested)
- **Android:** `{ type, gameId, chatContextType, … }` (flat)

Implement shared `parsePushChatContext(raw)` used by tap navigation and reply handler.

### Shared constants

| Constant | Value | Used by |
|----------|-------|---------|
| `PUSH_CATEGORY_CHAT_REPLY` | `CHAT_REPLY` | iOS `registerActionTypes`, APNs `category` |
| `PUSH_ACTION_REPLY` | `reply` | Backend `actions[].id`, handler `actionId` |

---

## API contract for reply

`POST /chat/messages` (same as in-app send):

```ts
{
  chatContextType,   // required
  contextId,         // required
  content,           // required for push reply
  mediaUrls: [],
  replyToId,         // required — always the notifying messageId
  chatType?,         // default PUBLIC
  clientMutationId?, // recommend: `push-reply:${messageId}:${Date.now()}` for dedup
}
```

### Server-side permission checks (`message.service.ts`)

| Context | 403 cases |
|---------|-----------|
| USER | Not participant; `userXallowed` false + recipient blocks non-contacts |
| GROUP | Not participant; channel + not owner/admin |
| GAME | Not in game / wrong `chatType` / queue rules |
| BUG | Not joined |

### Rate limit (`createMessageLimiter`)

```ts
// Backend/src/routes/chat.routes.ts
windowMs: 60 * 1000,
max: 30,  // per userId
message: 'Too many messages, please slow down.',
```

Push replies count toward the same limit. On 429 → show localized "Couldn't send" local notification.

---

## Auth & cold-start

### Current state

- Axios reads `localStorage.getItem('token')` only (`Frontend/src/api/axios.ts`)
- iOS syncs JWT to Keychain via `AuthBridge` / `authBridge.ts` (Watch) — **`getToken` not exposed to JS today**
- **Android has no `AuthBridge`** — token is localStorage-only

### Cold-start sequence (user replies while app killed)

1. OS wakes app → Capacitor fires `pushNotificationActionPerformed`
2. Call `restoreAuthIfNeeded()` (`authPersistence.ts`)
3. If no token in localStorage → on iOS try `AuthBridge.getToken()` (**add in Phase 1**)
4. `POST /chat/messages` via axios; on 401 → `handleAxios401MaybeRefresh`
5. On success → `confirmMessageReceipt(messageId, 'push')` for the **original** notifying message
6. On failure → localized local notification "Couldn't send"

### Profile name gate

Invite handlers use `runWithProfileName` when `nameIsSet !== true`. **Decide during Phase 1:** apply same gate to push reply or allow reply without display name (recommend: same gate — prompt name before send).

---

## Delivery & read receipts

| Event | Action |
|-------|--------|
| Push received (existing flow) | `confirmMessageReceipt(messageId, 'push')` when applicable |
| Inline reply **success** | `confirmMessageReceipt(originalMessageId, 'push')` if not already confirmed; optional mark thread read (mirror Telegram `markReplyContextAsRead`) |

---

## Current state (baseline)

### Chat pushes are plain alerts

`Backend/src/services/push/notifications/user-chat-push.notification.ts`:

```ts
return {
  type: NotificationType.USER_CHAT,
  title: senderName,
  body: messageContent,
  data: {
    userId: sender.id,
    userChatId: userChat.id,
    messageId: message.id
  },
  sound: 'default'
};
```

Same pattern for `game-chat-push`, `group-chat-push`, `bug-chat-push`.

### Frontend handles taps and button actions only

`Frontend/src/services/pushNotificationService.ts`:

- `actionId === 'tap'` → navigate to chat
- `actionId === 'accept' | 'decline'` → invite / team invite handlers
- No handler for text reply (`inputValue`)

### Invites partially support actions

`invite-push.notification.ts` and `team-push.notification.ts` define accept/decline `actions`. Backend sets APNs `category` when actions present. Gaps:

- No `LocalNotifications.registerActionTypes` in app
- FCM ignores `payload.actions` — Android invite buttons likely missing
- No `UNNotificationCategory` in `AppDelegate.swift`

### Telegram reference

- `user-chat.notification.ts` — `rum:{messageId}:{userChatId}`
- `group-chat.notification.ts` — `rg:{messageId}:{groupChannelId}`
- `callback.handler.ts` + `message.handler.ts` → `MessageService.createMessageWithEvent` with `replyToId`

### Stack

- Capacitor `@capacitor/push-notifications` ^8.0.0
- iOS: APNs via `apn`
- Android: FCM via Firebase Admin SDK
- Web push: not implemented

---

## Platform capabilities

| Platform | Native mechanism | Capacitor support |
|----------|------------------|-------------------|
| **iOS** | `UNNotificationCategory` + `UNTextInputNotificationAction` | `pushNotificationActionPerformed` + `inputValue` (iOS only) |
| **Android** | `MessagingStyle` + `RemoteInput` | Not built-in — native work required |
| **Web/PWA** | Web Push + Service Worker | Not in scope |

Register categories via `@capacitor/local-notifications` (`registerActionTypes`); set matching `aps.category` on remote push.

---

## Phase 0 — Prerequisites

Prove category pipeline before chat reply.

| Task | Why |
|------|-----|
| `registerActionTypes` for `INVITE` / `TEAM_INVITE` (accept/decline) | Validates iOS action pattern |
| Document FCM gap for invite buttons on Android | Same infra as Phase 2 |
| Add `parsePushChatContext(raw)` helper | Shared by tap + reply |
| Add shared `PUSH_CATEGORY_CHAT_REPLY` / `PUSH_ACTION_REPLY` constants | Avoid string drift |

**Exit criteria:**

- [ ] iOS invite Accept/Decline works from lock screen
- [ ] `parsePushChatContext` unit-tested for nested + flat shapes

---

## Phase 1 — iOS inline reply

### Implementation order

1. Backend: extend chat push payloads + `CHAT_REPLY` category (test with push debug)
2. `registerActionTypes` in `capacitorSetup.ts` **before** `pushNotificationService.initialize()`
3. `parsePushChatContext` + `sendChatReplyFromPush.ts`
4. Reply handler in `pushNotificationService.ts`
5. Auth cold-start: `restoreAuthIfNeeded` + `AuthBridge.getToken()` (new)
6. Failed reply → `LocalNotifications.schedule` localized error
7. Manual QA matrix

### Backend changes

1. Add `actions` to all four `*-chat-push.notification.ts` builders (only when full chat context exists — **not** story engagement).
2. Extend `data` with `chatContextType`, `contextId`; keep legacy fields.
3. `push-notification.service.ts`: for chat types, set `(notification as any).category = 'CHAT_REPLY'` (not `payload.type`).
4. Update `NotificationData` in `notifications.types.ts`.

### Frontend changes

1. Add `@capacitor/local-notifications`.
2. Register category:

```ts
await LocalNotifications.registerActionTypes({
  types: [{
    id: 'CHAT_REPLY',
    actions: [{
      id: 'reply',
      title: '…',  // i18n at registration or fixed EN + backend-localized action title on push
      input: true,
      inputPlaceholder: '…',  // i18n: push.replyPlaceholder
    }],
  }],
});
```

3. Handler:

```ts
if (actionId === 'reply' && action.inputValue?.trim()) {
  const ctx = parsePushChatContext(notification.data);
  if (!ctx?.chatContextType || !ctx?.contextId || !ctx?.messageId) return;
  const content = action.inputValue.trim().slice(0, 4096);
  await sendChatReplyFromPush(ctx, content);
  return;
}
```

4. `sendChatReplyFromPush`:
   - `restoreAuthIfNeeded()` + optional native token read
   - `chatApi.createMessage({ …, replyToId: ctx.messageId })`
   - On success: `confirmMessageReceipt(ctx.messageId, 'push')`
   - On failure: schedule local notification with `push.replyFailed` (all locales)

### iOS technical notes

- Action ID `reply` must match backend `actions[].id`
- Category `CHAT_REPLY` must match `registerActionTypes` and APNs payload
- Media-only body (`[Media]`) still gets reply action
- Offline / no network → fail immediately + local "Couldn't send"

### Phase 1 file checklist

| Area | File | Change |
|------|------|--------|
| Deps | `Frontend/package.json` | `@capacitor/local-notifications` |
| Init | `capacitorSetup.ts` | `registerActionTypes` before push init |
| App | `pushNotificationService.ts` | Reply handler |
| App | `sendChatReplyFromPush.ts` (new) | API call + receipts + error local notif |
| App | `parsePushChatContext.ts` (new) | Nested + flat parsing |
| App | `authBridge.ts` + `AuthBridgePlugin.swift` | `getToken()` for cold start |
| Backend | `notifications.types.ts` | Extended `NotificationData` |
| Backend | `*-chat-push.notification.ts` (×4) | `actions` + `data` |
| Backend | `push-notification.service.ts` | `category: CHAT_REPLY` for chat |
| i18n | `Frontend/src/i18n/locales/*/…` | `push.replyPlaceholder`, `push.replyFailed` |

### Phase 1 acceptance criteria

- [ ] DM push shows Reply input on expand / long-press (iOS)
- [ ] Reply delivered with correct `replyToId`; visible in chat without opening UI
- [ ] Works: background, force-quit
- [ ] Media-only push still shows reply
- [ ] Story `USER_CHAT` push has **no** reply UI
- [ ] Muted / read-only → API 403 → localized local "Couldn't send"
- [ ] Offline → immediate fail + local notification
- [ ] `confirmMessageReceipt` on receive + after successful reply
- [ ] Content truncated/rejected at 4096 chars

### Phase 1 test matrix

| ID | Scenario |
|----|----------|
| PN-R1 | Background DM reply |
| PN-R2 | Killed app DM reply |
| PN-R3 | Game PUBLIC reply |
| PN-R4 | Game PRIVATE, no access → 403 + local error |
| PN-R5 | Group reply |
| PN-R6 | Channel as non-admin → 403 + local error |
| PN-R7 | Bug chat reply |
| PN-R8 | Media-only push → reply works |
| PN-R9 | Story notification → no reply UI |
| PN-R10 | Expired session → refresh or local error |
| PN-R11 | Unicode / emoji reply |
| PN-R12 | Offline → local "Couldn't send" |
| PN-R13 | >4096 chars → blocked client-side |

### Phase 1 automated tests

- **Backend:** unit tests per chat push builder — includes `actions`, `chatContextType`, `contextId`; story push excluded
- **Frontend:** unit tests for `parsePushChatContext` (iOS nested + Android flat)
- **Frontend:** unit test `sendChatReplyFromPush` truncates at 4096

---

## Phase 2 — Android inline reply

### ADR: chosen approach

**Custom `FirebaseMessagingService` + native HTTP** (Option A).

| Option | Background/killed | Verdict |
|--------|-------------------|---------|
| A. Custom MessagingService + native API | Best | **Selected** |
| B. Data-only FCM + JS local notification | Poor when killed | Reject |
| C. Fork `@capacitor/push-notifications` | Best | Too heavy |

### Android file map

| File | Change |
|------|--------|
| New `ChatReplyMessagingService.java` (or extend Capacitor's) | `MessagingStyle` + `RemoteInput` |
| `AndroidManifest.xml` | Service declaration |
| `fcm.service.ts` | Chat → data-only path (no top-level `notification`) |
| New Android `AuthBridge` or EncryptedSharedPreferences | Secure token for native HTTP |
| Optional: Capacitor bridge | Forward reply to JS when app foreground |

### FCM data-only spec (chat only)

```ts
{
  token,
  data: { type, chatContextType, contextId, messageId, title, body, chatType?, … }, // all strings
  android: { priority: 'high' },
  // NO notification: { title, body } — avoids duplicate with custom service
}
```

**Risk:** default Capacitor handler and custom service both firing → duplicate notifications. Disable default display for chat message types only.

### Native reply flow

1. User submits inline reply → `BroadcastReceiver` / `Service`
2. Read `contextId`, `messageId`, text; enforce 4096 char max
3. `POST /api/chat/messages` with Bearer from secure storage
4. On success: update `MessagingStyle` with outgoing bubble; `confirmMessageReceipt`
5. On failure: show localized notification "Couldn't send"
6. Offline → fail immediately (no queue)

### Android auth gap

No Keychain/`AuthBridge` on Android today. Phase 2 **must** add secure token storage + clear on logout.

### Notification channel

Today: `channelId: 'default'`. Consider `channel_messages` with `IMPORTANCE_HIGH` + conversation shortcuts (Android 11+).

### Phase 2 acceptance criteria

- [ ] Inline reply from shade with app killed
- [ ] No duplicate notifications per message
- [ ] `replyToId` always set
- [ ] Localized error on failure; offline fails immediately
- [ ] Token cleared on logout

---

## Phase 3 — Threading & polish

### Thread ID formulas

| Context | `thread-id` / conversation key |
|---------|-------------------------------|
| USER | `user-chat:{userChatId}` |
| GAME | `game-chat:{gameId}:{chatType}` |
| GROUP | `group:{groupChannelId}` |
| BUG | `bug:{bugId}` |

iOS: set via APNs `thread-id` in `push-notification.service.ts`.

### Message history (Android MessagingStyle)

Rich stacked UI needs prior messages. Options:

- **Client-side:** cache last N messages per thread (UserDefaults / SharedPreferences)
- **Server-side:** include summary in FCM data (heavier)

Without history, Phase 3 = grouping only, not full chat stack.

### Badge & read state

After successful inline reply: mark context read (mirror Telegram `markReplyContextAsRead`); sync badge if applicable.

### Optional: sender persona (Android)

Optional push data: `senderId`, `senderName`, `senderAvatarUrl` for `Person` icon in `MessagingStyle`.

### Optional: iOS Communication Notifications

`INSendMessageIntent` + Apple entitlement — defer unless iMessage-level UI required.

---

## Phase 4 — Optional / future

| Item | When |
|------|------|
| `POST /chat/push-reply` + short-lived token | Cold-start auth still flaky after Phase 1 |
| Web Push inline reply | PWA becomes a priority |
| Offline outbox for push replies | Product reverses offline decision |
| Fix invite buttons on Android | Phase 0 parallel or post-Phase 2 |

---

## Cross-cutting

### i18n keys to add

| Key | Use |
|-----|-----|
| `push.replyPlaceholder` | `registerActionTypes` input placeholder |
| `push.replyFailed` | Local notification on send failure |

Backend action title: existing `telegram.reply` (per recipient language).

### Observability

- Log prefix: `[push-reply]` client + server
- Log: `chatContextType`, `actionId`, platform — not message content
- Track: success / 403 / 429 / network fail counts

### Regression risks

- Tap navigation breaks if `data` shape changes without updating `normalizeNotificationData`
- Story pushes accidentally get `CHAT_REPLY` category
- Logout while notification pending → reply must fail cleanly
- Duplicate send if user double-submits → `clientMutationId` or debounce

### Limitations

- Text only from notification (no media, voice, polls, reactions, story replies)
- iOS `inputValue` iOS-only in Capacitor; Android needs Phase 2 native path
- Web/PWA out of scope
- Reply briefly wakes app process even when UI not shown

---

## Rollout

| Phase | Scope |
|-------|-------|
| **0** | Invite categories + `parsePushChatContext` |
| **1** | iOS inline reply |
| **2** | Android inline reply |
| **3** | Threading / MessagingStyle history |
| **4** | Optional endpoints / Communication Notifications |

---

## UI test plan (add to `docs/UI_TEST_PLAN.md` when shipping)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| PN-R1 | iOS inline reply (background) | DM push → expand → reply | Message sent with reply thread; no app open |
| PN-R2 | iOS inline reply (killed) | Force-quit → reply from lock screen | Same; auth succeeds |
| PN-R3 | Media-only push | Photo message push → reply | Text reply works |
| PN-R4 | Muted chat | Reply from push | Localized "Couldn't send" |
| PN-R5 | Read-only channel | Non-admin replies | Localized "Couldn't send" |
| PN-R6 | Offline | Airplane mode → reply | Immediate local "Couldn't send" |
| PN-R7 | Android inline reply | Phase 2 — shade reply | Same as PN-R1 |
| PN-R8 | Story push | Story like notification | No reply action |

---

## References

| Topic | Location |
|-------|----------|
| Push send (iOS/Android) | `Backend/src/services/push/push-notification.service.ts` |
| FCM | `Backend/src/services/push/fcm.service.ts` |
| Chat push builders | `Backend/src/services/push/notifications/*-chat-push.notification.ts` |
| Story pushes (exclude) | `Backend/src/services/storyEngagement/storyEngagement.notifications.ts` |
| Notification types | `Backend/src/types/notifications.types.ts` |
| Frontend push handling | `Frontend/src/services/pushNotificationService.ts` |
| Message create API | `Frontend/src/api/chat.ts` → `createMessage` |
| Rate limit | `Backend/src/routes/chat.routes.ts` → `createMessageLimiter` |
| Telegram reply flow | `Backend/src/services/telegram/handlers/callback.handler.ts`, `message.handler.ts` |
| Auth / Keychain (iOS) | `Frontend/ios/App/App/AuthBridgePlugin.swift`, `Frontend/src/services/authBridge.ts` |
| Auth refresh | `docs/AUTH_REFRESH_TOKEN_PLAN.md` |
| Delivery confirm | `Frontend/src/api/chat.ts` → `confirmMessageReceipt` |
| App message max length | `Frontend/src/components/chat/messageInputDraftUtils.ts` |
