# Notifications

Unified dispatch: `Backend/src/services/notification.service.ts`. Types: `Backend/src/types/notifications.types.ts` (`NotificationType`). Channels: Prisma `NotificationChannelType` `PUSH` \| `TELEGRAM`.

## Push (APNs + FCM)

- iOS: APNs in `push/push-notification.service.ts` (`apn` provider; env `config.apns.*`).
- Android: `push/fcm.service.ts`.
- Tokens: `push/push-token.service.ts`. HTTP: `Backend/src/routes/push.routes.ts` — register/renew/remove (`IOS`\|`ANDROID`), test send. Authenticated except invite-action.

**Types** (push modules under `push/notifications/`): game chat, user chat, group chat, bug chat, game system, invites, new game, game reminder, game results, game cancelled, league round start, league game assigned, bets (resolved / needs review / cancelled), transactions, new market item, new bug, auction (outbid / new bid / won / BIN), match timer cap, user team events, play-intent match, `GAME_MATCHES_INTENT`, friends-looking (`INTENT_PLAYERS_FOR_GAME` / `FOLLOWED_USER_PLAY_INTENT`).

Payload prep: `preparePushPayload.ts` (reply token, collapse key, unread badge). Chat category: `chat-push-reply.utils.ts` (`PUSH_CATEGORY_CHAT_REPLY`, APNs mutable-content).

### Inline reply

Lock screen / shade → `POST /chat/push-reply` `{ replyToken, content, clientMutationId? }` (`pushReply.controller.ts`). Token-only when app killed (`PushReplyTokenService`). Confirm: `POST /chat/push-confirm-receipt`. Rate limit 30/min. Tokens purged daily 05:15 (`pushReplyTokenCleanupScheduler.service.ts`). FE: `Frontend/src/services/pushNotificationService.ts`, `Frontend/src/services/push/sendChatReplyFromPush.ts`.

### Android invite actions

`POST /push/invite-action` `{ actionToken }` (`pushInviteAction.controller.ts`, `pushInviteActionToken.service.ts`). Accept/decline game + team invites. Action-scoped credentials (not a stale access JWT). iOS: partial. Telegram: inline callback buttons.

### Deep links

Tap targets: games, chats, bugs, marketplace, teams, league schedule. Same routes as `useDeepLink.ts`. Widget/Siri typically `/next-game`. Chat pushes carry `chatContextType`, `contextId`, `messageId`, `conversationKey`, `replyToken`.

Android `NEW_GAME` (and other game-open types) are FCM data-only and shown by `DataPushNotificationHelper` so the content tap goes through `NotificationOpenActivity` → `PushTapStore`. FCM tray taps that still carry extras are captured in `PushIntentSanitizer.capturePushTapIfPresent` before launcher extras are stripped. JS normalizes iOS nested `{ type, data: { gameId } }` and Android flattened maps in `normalizePushNotificationData.ts`.

Rich: image/video/story-reply thumbs; iOS Communication Notifications when entitled; Android MessagingStyle.

## Telegram

Bot: `telegram/bot.service.ts` (grammy, long poll). Mirror: `telegram/notification.service.ts` + `telegram/notifications/*`.

**Commands** (private unless noted):

| Command | |
|---------|--|
| `/start` | Welcome / link |
| `/auth` | OTP for app login |
| `/login` | Login link (`/login/:telegramKey`) |
| `/my` | My games |
| `/games` | City games (group-capable via `requireChat`) |

Callbacks: `^(sg\|rm\|ia\|rum\|rg\|rbm):` (`handlers/callback.handler.ts`) — game actions / invites. City pinned games: `gamesScheduler.service.ts` (~5 min). Results send: `resultsSender.service.ts` / `results-telegram.service.ts`.

## Preference toggles vs mute

**Preferences** — per user × channel (`PUSH` vs `TELEGRAM`), keys in `notificationPreference.service.ts`:

`sendMessages` `sendInvites` `sendDirectMessages` `sendReminders` `sendWalletNotifications` `sendMarketplaceNotifications` `sendTeamNotifications` `sendPlayIntentNotifications` `sendPlayIntentSocialNotifications`

`NOTIFICATION_TYPE_TO_PREF` maps each `NotificationType` → one key. Defaults all true. `preferPush` / `preferTelegram` on a request bypasses the pref check for that channel. `channels` restricts which providers run; prefs still apply.

**Mute** — per thread `ChatMute` (`chatMute.service.ts`): `(userId, chatContextType, contextId)`. Chat notifications skip muted threads even if prefs allow (`notification.service.ts` checks before game/user/bug/group chat send). Mute does not flip preference rows. Unread totals exclude muted **groups** (`mutedGroupIds`).

Play-intent delivery is queued + deduped (APP_FUNCTIONALITY §2.2) — do not fire-and-forget.

## Key paths

| Path | |
|------|--|
| `Backend/src/services/notification.service.ts` | Unified send |
| `Backend/src/services/notificationPreference.service.ts` | Toggles |
| `Backend/src/services/push/` | APNs/FCM, tokens, reply, invite actions |
| `Backend/src/services/telegram/` | Bot, commands, notification mirror |
| `Backend/src/services/chat/chatMute.service.ts` | Thread mute |
| `Backend/src/routes/push.routes.ts` | Token + invite-action |
| `Frontend/src/services/pushNotificationService.ts` | Capacitor push client |
