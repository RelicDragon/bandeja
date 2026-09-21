# Notifications

Unified dispatch: `Backend/src/services/notification.service.ts`. Types: `Backend/src/types/notifications.types.ts` (`NotificationType`). Channels: Prisma `NotificationChannelType` `PUSH` \| `TELEGRAM`.

## Push (APNs + FCM)

- iOS: APNs in `push/push-notification.service.ts` (`apn` provider; env `config.apns.*`).
- Android: `push/fcm.service.ts`.
- Tokens: `push/push-token.service.ts`. HTTP: `Backend/src/routes/push.routes.ts` — register/renew/remove (`IOS`\|`ANDROID`), test send. Authenticated except invite-action.

**Types** (push modules under `push/notifications/`): game chat, user chat, group chat, bug chat, game system, invites, new game, game reminder, game results, game cancelled, league round start, league game assigned, bets (resolved / needs review / cancelled), transactions, new market item, new bug, auction (outbid / new bid / won / BIN), match timer cap, user team events, play-intent match, `GAME_MATCHES_INTENT`, friends-looking (`INTENT_PLAYERS_FOR_GAME` / `FOLLOWED_USER_PLAY_INTENT`), plus the PRD 345–357 additions below.

| Type | Preference key | Trigger / audience |
|------|----------------|--------------------|
| `GAME_SERIES_NEXT_PROMPT` | `sendInvites` | A series occurrence reached FINAL — regulars who played and are not already PLAYING next week ([games.md](./games.md)) |
| `GAME_NO_SHOW_NOTED` | `sendMessages` | Organizer noted a no-show; deep-links into the **game chat**, not the info tab |
| `GAME_SPOT_OPENED` | `sendInvites` | A PLAYING seat freed — queue members, then matching OPEN play intents |
| `FOLLOWED_GAME_SPOT_OPENED` | `sendPlayIntentSocialNotifications` | Same event, followers-of-a-seated-player bucket |
| `GAME_COST_REMINDER` | `sendWalletNotifications` | Unsettled cost share, 24 h–7 days after the ledger froze ([economy.md](./economy.md)) |
| `FOLLOWED_USER_LIVE` | `sendPlayIntentSocialNotifications` | A followed player's public, rail-visible game went `IN_PROGRESS`. Once per (recipient, game), ever |
| `REFERRAL_JOINED` | `sendWalletNotifications` | Somebody signed up with the referrer's code (no coins yet) |
| `MONTHLY_RECAP_READY` | `sendReminders` | The monthly recap generator produced a recap ([stories.md](./stories.md)) |
| `GOODS_GIFT_RECEIVED` | `sendWalletNotifications` | Another player gifted a shop item |
| `GAME_WEATHER_ALERT` | `sendWeatherAlerts` | Outdoor game at rain/wind risk, 12 h out (and once more if the severity class rises) ([weather.md](./weather.md)) |

The referral **payout** deliberately reuses `TRANSACTION` rather than adding a type: it inherits the wallet preference, the push plumbing and the Telegram template. The referral variant is flagged by `data.referralReward === '1'` plus its own copy.

Payload prep: `preparePushPayload.ts` (reply token, collapse key, unread badge). Chat category: `chat-push-reply.utils.ts` (`PUSH_CATEGORY_CHAT_REPLY`, APNs mutable-content).

### Inline reply

Lock screen / shade → `POST /chat/push-reply` `{ replyToken, content, clientMutationId? }` (`pushReply.controller.ts`). Token-only when app killed (`PushReplyTokenService`). Confirm: `POST /chat/push-confirm-receipt`. Rate limit 30/min. Tokens purged daily 05:15 (`pushReplyTokenCleanupScheduler.service.ts`). FE: `Frontend/src/services/pushNotificationService.ts`, `Frontend/src/services/push/sendChatReplyFromPush.ts`.

### Push action buttons

One mechanism for every shade / Telegram action button. `POST /push/invite-action` `{ actionToken }` (`pushInviteAction.controller.ts`, `pushInviteActionToken.service.ts`) verifies a **signed, action-scoped** token — not a stale access JWT — and dispatches on its `kind`.

A token carries `{ userId, kind, targetId, action }` and expires after 48 h. `kind` × `action` is an allow-list enforced on **sign and verify**, so a token can never reach a handler with an action it does not understand:

| `kind` | `targetId` | Actions | Effect |
|--------|-----------|---------|--------|
| `game` | game invite participant id | accept / decline | the game invite |
| `team` | user-team invite id | accept / decline | the team invite |
| `series` | the **next occurrence's** gameId | accept / decline | accept seats PLAYING; decline records nothing |
| `attendance` | gameId | confirm / unsure | sets `GameParticipant.attendance` |
| `weather` | gameId | keep | sets `weatherAlertState.keepAsPlannedAt` |

`game` and `team` stay as explicit branches in the controller (their responses predate the registry and carry a `data` payload). Every newer kind registers itself with `registerPushActionHandler(kind, handler)` at **import time of its own service module**, which its route file imports — so no feature has to edit the controller. An unregistered kind answers `400 push.inviteActionUnsupported`, never a 500; a stale or replayed token is a quiet no-op and never moves a seat.

**Where each kind is actually tappable today.** The token, the endpoint and the handler exist for all five kinds; the *native shade buttons* exist for three.

| Surface | Wired for |
|---------|-----------|
| Telegram inline buttons | all five kinds (`sg`/`ia`, `at:`, `sr:`, `wx:` — see the prefix table below) |
| In-app card / sheet | all five kinds |
| Android shade | `invite_actions`, `play_intent_actions` and `attendance_actions`. `series` / `weather` set no `nativeHandler` at all |
| iOS shade | `INVITE`, `TEAM_INVITE`, `CHAT_REPLY`, `FOLLOWED_USER_PLAY_INTENT` and `GAME_REMINDER` categories are registered by `registerPushNotificationActionTypes.ts`. `resolveApnsNotificationCategory` derives the category from the notification type, so a reminder carrying attendance actions arrives as `GAME_REMINDER`. No category exists for `series` / `weather` |

#### Attendance in the shade (PRD 346)

Both answers are **background** actions — they post and never open the app.

- **Android.** `fcm.service.ts` sets `nativeHandler = 'attendance_actions'` whenever the reminder carries `attendanceActionToken`. `ChatReplyMessagingService` routes it to `AttendanceNotificationHelper`, which builds the two buttons from the payload's localized titles (`R.string.attendance_confirm` / `attendance_unsure` are only the fallback) and points them at `AttendanceActionReceiver`. The receiver posts the token to `/push/invite-action` off the main thread and then replaces the reminder with the localized acknowledgement. It reuses the reminder's own notification id, so the 2 h message replaces the 24 h one.
- **iOS.** The `GAME_REMINDER` category registers `confirm` / `unsure` with no `foreground` option. With the webview alive, `pushNotificationService.handleNotificationAction` posts the token and invalidates the game's attendance query. On a cold start the webview is not ready, so `BandejaPushNotificationDelegate` hands the response to `AttendanceActionHandler` — the same layering `ChatReplyHandler` uses for the inline chat reply.
- **Both platforms** need the acknowledgement text to travel with the push (`attendanceConfirmedAck` / `attendanceUnsureAck`, localized per recipient in `game-reminder-push.notification.ts`): the shade handler has no i18n of its own, and the `/push/invite-action` response returns a translation *key*, not a string.
- Failure is silent by design. Offline or a 5xx leaves the reminder answerable — there is no deadline — and a 4xx (stale token, player already left) quietly dismisses it.

`series` and `weather` shade buttons remain unwired; see `docs/product/not-shipped.md`. Nothing on the backend has to change for them either.

### Persisted delivery and dedupe

The play-intent contract in [constraints.md](../product/constraints.md) — *claim a durable row before dispatch, revalidate on every attempt, retry with backoff* — is the house pattern for anything that must not double-fire. **An in-process `Set` is not acceptable**: the legacy 24 h/2 h game reminders still use one and re-fire after a deploy; that is a known wart, not a pattern to copy.

| Feature | Claim | Grain |
|---------|-------|-------|
| Play intent | `playIntentNotificationDeliveryQueue.service.ts` | event × user × channel |
| Spot opened | `SpotOpenedDelivery @@unique([userId, gameId, dayKey, kind])` | one per user, per game, per **game-city local day**, per audience kind. Shared with the play-intent path so one seat cannot produce two pushes |
| Live start | `LiveGameNotifyDelivery @@unique([userId, gameId])` | once per recipient per game, ever |
| Weather alert | `Game.weatherAlertState.sentAt[]` (Json on the game) | per game, per severity class |
| Cost reminder | Redis `SET NX PX`, else a pruned map in the `COST_REMINDER_STATE` platform setting | per game per 24 h |
| Referral payout | `ReferralReward.referredUserId @unique` | once per referred user, ever |
| Monthly recap | the `MonthlyRecap` unique key — a plain `create`, `P2002` means "already done" | once per user per month |
| Attendance nudge | the newest `ATTENDANCE_NUDGED` **chat system message** | once per game per 6 h |

Spot-opened is worth reading as the reference implementation (`services/gameSeat/spotOpenedNotify.service.ts`): claim the row, then `sendWithBackoff` (delays `[1 s, 4 s]`), revalidating `seatIsStillOpen` on every attempt because the roster may have refilled or locked. A **transient** failure releases the claim so the next event retries; a **permanent** one (no channel linked, preferences off, user gone) keeps it.

### Deep links

Tap targets: games, chats, bugs, marketplace, teams, league schedule. Same routes as `useDeepLink.ts`. Widget/Siri typically `/next-game`. Chat pushes carry `chatContextType`, `contextId`, `messageId`, `conversationKey`, `replyToken`.

Android `NEW_GAME` (and other game-open types) are FCM data-only and shown by `DataPushNotificationHelper` so the content tap goes through `NotificationOpenActivity` → `PushTapStore`. FCM tray taps that still carry extras are captured in `PushIntentSanitizer.capturePushTapIfPresent` before launcher extras are stripped. JS normalizes iOS nested `{ type, data: { gameId } }` and Android flattened maps in `normalizePushNotificationData.ts`.

Rich: image/video/story-reply thumbs; iOS Communication Notifications when entitled; Android MessagingStyle.

Newer tap targets (`Frontend/src/services/pushNotificationService.ts`):

| Type | Destination |
|------|-------------|
| `TRANSACTION` | `navigationService.navigateToWallet(transactionId)`. **This type had no tap handler at all before the referral work** — every coin push simply opened the app wherever it was |
| `REFERRAL_JOINED` | `navigationService.navigateToProfile()` — no coins have moved yet, so the invite card is the right destination, not the Wallet |
| `FOLLOWED_USER_LIVE` | the game (`data.gameId`). There is no action button: "Watch" is the notification's own tap target, because push actions are identifiers dispatched by `pushInviteAction.controller.ts`, not URLs |
| `MONTHLY_RECAP_READY` | Home with `?recap=<monthKey>`, cleaned out of the URL once read |
| `GAME_WEATHER_ALERT` | `/games/:id?section=weather`, plus `&action=moveIndoor` for organizers; both stripped once read |
| `GAME_SPOT_OPENED` | `/games/:id?join=1` — runs the details page's normal join handler after load, then strips the param. Gates and the overlap confirm still apply; the deep link is a shortcut to the button, never a bypass |

The Wallet is a modal owned by the Profile page, so `navigateToWallet` parks the id in `Frontend/src/store/walletHighlightStore.ts` and navigates; Profile consumes the request and opens the modal. The id never enters the URL — it is a private identifier.

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
| `/play` | Start (or show) a play intent — private **and** group |
| `/live` | Games being scored right now in the chat's city |
| `/invite` | The sender's personal referral link (private only) |

`/play`, `/live` and `/games` share the middleware chain `requireUser, syncTelegramProfile, requireChat, rateLimitChat()`. `rateLimitChat(max = 10)` is a fixed one-minute window keyed by chat id, held in process: it stops one chat hammering a command, it is not a global quota. Overflow is dropped silently rather than answered, so a spammer gets no feedback loop.

**Command menu.** `services/telegram/botCommandMenu.ts` calls `setMyCommands` once at startup: a default English list, then one localized list per bot language. **`setMyCommands` replaces the whole list for a scope**, so the module registers *every* command the bot handles — adding a command to the bot means adding it to `BOT_MENU_COMMANDS` or it vanishes from the menu. Failures are logged and swallowed; the bot must still serve messages.

#### `/play`

| Chat | Behaviour |
|------|-----------|
| private, unlinked | the standard login-link message (`generateLoginLink`) |
| private, no home city or no chosen primary sport | "Set your city in the app first" + an **Open profile** deep link |
| private, existing OPEN intent | that intent's confirmation block + **Stop looking** |
| private, otherwise | day question → time question → confirmation, editing **one** message in place |
| group | a "looking to play" card with **I'm in too**, one per user per 6 h per group |

**No server-side wizard state.** Every step carries what it needs in the callback data, so a bot restart between two taps cannot strand a user mid-flow — which is why the day offset travels with the time choice.

Intents are created through `PlayIntentService.createOrReplace`, never by writing `PlayIntent` directly, so the bot inherits the app's rules for free: one OPEN intent per city/sport, date keys resolved in the **city** timezone, the expiry window and every downstream queue ([play-intent.md](./play-intent.md)). `primarySportIsSet` — not `primarySport` — is what says the player chose a sport; the column itself is non-nullable and defaults to `PADEL`.

Group `/play` with no existing intent creates one for *today, any time*: `/play` in a group is itself the request to play, and a group has no room for a two-step wizard. The poster narrows it in the app or with `/play` in DM, which shows that same intent rather than duplicating it. The 6 h post limit is a Redis `SET NX PX` claim (`services/telegram/playGroupPostLimit.ts`) with a bounded in-process fallback; a storage error fails **open**, because a rare duplicate post beats `/play` dying in every group. **I'm in too** mirrors the poster's date keys and time windows into an intent for the tapper, in the *tapper's* own city and sport, dropping date keys they can no longer reach; a tapper who has never opened a chat with the bot still gets the intent and the callback answer.

#### `/live`

Calls `listLiveGames()` (`services/game/liveGames.service.ts`) **in process**. The bot must never HTTP round-trip to its own API, and calling the service is also what guarantees `/live` obeys exactly the same privacy gate as the in-app rail ([live-scoring.md](./live-scoring.md)).

City resolution matches `/games`: `City.telegramGroupId` in a group, the user's `currentCityId` in a private chat. Format: header, up to five blocks (`club · court` / `names  \`6-4 3-2\`  names` / "Started N min ago"), footer; names truncate at 12 characters. Each block gets its own **Watch** URL button carrying a freshly minted spectator token, so the link works in a signed-out browser.

Output is legacy `parse_mode: 'Markdown'`, matching `/games`. Every user-supplied string goes through `escapeLiveMarkdown` — `escapeMarkdown` **plus** the backtick, which the monospace score spans use and which cannot be backslash-escaped in Telegram's legacy Markdown, so it is swapped for a look-alike. On a localhost `frontendUrl` the Watch links are appended to the message body instead of being buttons, because Telegram rejects loopback URL buttons.

#### Callbacks

Registered in the `bot.service.ts` callback regex, handled in `handlers/callback.handler.ts`:

| Prefix | Meaning |
|--------|---------|
| `sg` `rm` `ia` `rum` `rg` `rbm` | game actions / invites (pre-existing) |
| `pi:d:<0..2>` | `/play` day chosen; edits to the time keyboard |
| `pi:back` | back to the day keyboard |
| `pi:t:<any\|am\|pm\|eve>:<0..2>` | time chosen; creates the intent and edits to the confirmation. The day offset travels here because there is no server-side wizard state |
| `pi:cancel` / `pi:again` | cancel the intent / return to the day keyboard |
| `pi:join:<intentId>` | group "I'm in too" |
| `at:<gameId>:<confirm\|unsure>` | attendance answer; edits the message and drops the two answer buttons while keeping "View game" |
| `sr:<gameId>:<accept\|decline>` | series carry-over seat |
| `wx:<gameId>:keep` | weather "Keep as planned"; answers "Playing rain or shine" and removes only the `wx:` button |

`parsePlayCallback` returns `null` for anything malformed so the handler answers the query instead of throwing at the user.

City pinned games: `gamesScheduler.service.ts` (~5 min). Results send: `resultsSender.service.ts` / `results-telegram.service.ts`.

### Backend copy modules

Backend user-facing copy normally lives in `Backend/src/utils/translations.ts`, one flat object per locale. Newer features instead add **namespaced copy modules** with the same `t(key, lang)` contract:

| Module | Namespace | Resolver |
|--------|-----------|----------|
| `services/gameSeries/gameSeriesCopy.ts` | `series.*` | `seriesT(key, lang, params)` |
| `services/live/liveCopy.ts` | `live.*`, `play.*`, `menu.*` | `liveT(key, lang, params)` |
| `services/weather/weatherAlertCopy.ts` | weather alerts | same shape |
| `services/referral/referralCopy.ts` | referral pushes | `referralT(key, lang, params)` |
| `services/recap/recapCopy.ts` | baked recap share images | same shape |

All cover the 11 bot languages, fall back to English for an unknown language and return the key for an unknown key, so call sites read identically to `t()`. Placeholders are `{name}`-style, not `{{name}}`. The reason is practical: `translations.ts` is one ~3,900-line file that many agents edit at once, and eleven insertions per feature is a guaranteed merge conflict for no behavioural gain. Do not duplicate keys that already exist there — `playIntent.today` / `.tomorrow` / `.morning` / `.afternoon` / `.evening` and `date.shortDay.*` are reused as-is.

**No weather or recap template contains a `%`, a `km/h` or an hour format.** Percentages, wind speeds and clock times are produced by `Intl` for the recipient's language and interpolated.

## Preference toggles vs mute

**Preferences** — per user × channel (`PUSH` vs `TELEGRAM`), keys in `notificationPreference.service.ts`:

`sendMessages` `sendInvites` `sendDirectMessages` `sendReminders` `sendWalletNotifications` `sendMarketplaceNotifications` `sendTeamNotifications` `sendPlayIntentNotifications` `sendPlayIntentSocialNotifications` `sendWeatherAlerts`

`NOTIFICATION_TYPE_TO_PREF` maps each `NotificationType` → one key. Defaults all true. `preferPush` / `preferTelegram` on a request bypasses the pref check for that channel. `channels` restricts which providers run; prefs still apply.

**Mute** — per thread `ChatMute` (`chatMute.service.ts`): `(userId, chatContextType, contextId)`. Chat notifications skip muted threads even if prefs allow (`notification.service.ts` checks before game/user/bug/group chat send). Mute does not flip preference rows. Unread totals exclude muted **groups** (`mutedGroupIds`).

Play-intent delivery is queued + deduped (APP_FUNCTIONALITY §2.2) — do not fire-and-forget. The same rule now covers seat-opened, live-start, weather and series carry-over; see **Persisted delivery and dedupe** above.

## Key paths

| Path | |
|------|--|
| `Backend/src/services/notification.service.ts` | Unified send |
| `Backend/src/services/notificationPreference.service.ts` | Toggles |
| `Backend/src/services/push/` | APNs/FCM, tokens, reply, invite actions |
| `Backend/src/services/push/pushActionHandlers.ts` | `registerPushActionHandler` registry for `series` / `attendance` / `weather` |
| `Backend/src/services/gameSeat/spotOpenedNotify.service.ts` | Reference implementation of claim → revalidate → backoff |
| `Backend/src/services/telegram/` | Bot, commands, notification mirror |
| `Backend/src/services/chat/chatMute.service.ts` | Thread mute |
| `Backend/src/routes/push.routes.ts` | Token + invite-action |
| `Frontend/src/services/pushNotificationService.ts` | Capacitor push client |
