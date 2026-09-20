import type { NotificationChannelType } from '@prisma/client';

export enum PreferenceKey {
  SEND_MESSAGES = 'sendMessages',
  SEND_INVITES = 'sendInvites',
  SEND_DIRECT_MESSAGES = 'sendDirectMessages',
  SEND_REMINDERS = 'sendReminders',
  SEND_WALLET_NOTIFICATIONS = 'sendWalletNotifications',
  SEND_MARKETPLACE_NOTIFICATIONS = 'sendMarketplaceNotifications',
  SEND_TEAM_NOTIFICATIONS = 'sendTeamNotifications',
  SEND_PLAY_INTENT_NOTIFICATIONS = 'sendPlayIntentNotifications',
  SEND_PLAY_INTENT_SOCIAL_NOTIFICATIONS = 'sendPlayIntentSocialNotifications',
  SEND_WEATHER_ALERTS = 'sendWeatherAlerts',
}

export enum NotificationType {
  INVITE = 'INVITE',
  GAME_CHAT = 'GAME_CHAT',
  USER_CHAT = 'USER_CHAT',
  BUG_CHAT = 'BUG_CHAT',
  GROUP_CHAT = 'GROUP_CHAT',
  GAME_SYSTEM_MESSAGE = 'GAME_SYSTEM_MESSAGE',
  GAME_REMINDER = 'GAME_REMINDER',
  GAME_RESULTS = 'GAME_RESULTS',
  NEW_GAME = 'NEW_GAME',
  TRANSACTION = 'TRANSACTION',
  NEW_MARKET_ITEM = 'NEW_MARKET_ITEM',
  NEW_BUG = 'NEW_BUG',
  AUCTION_OUTBID = 'AUCTION_OUTBID',
  AUCTION_NEW_BID = 'AUCTION_NEW_BID',
  AUCTION_WON = 'AUCTION_WON',
  AUCTION_BIN_ACCEPTED = 'AUCTION_BIN_ACCEPTED',
  GAME_CANCELLED = 'GAME_CANCELLED',
  MATCH_TIMER_CAP = 'MATCH_TIMER_CAP',
  TEAM_INVITE = 'TEAM_INVITE',
  TEAM_INVITE_ACCEPTED = 'TEAM_INVITE_ACCEPTED',
  TEAM_INVITE_DECLINED = 'TEAM_INVITE_DECLINED',
  TEAM_MEMBER_REMOVED = 'TEAM_MEMBER_REMOVED',
  TEAM_MEMBER_LEFT = 'TEAM_MEMBER_LEFT',
  TEAM_DELETED = 'TEAM_DELETED',
  PLAY_INTENT_MATCH = 'PLAY_INTENT_MATCH',
  GAME_MATCHES_INTENT = 'GAME_MATCHES_INTENT',
  INTENT_PLAYERS_FOR_GAME = 'INTENT_PLAYERS_FOR_GAME',
  FOLLOWED_USER_PLAY_INTENT = 'FOLLOWED_USER_PLAY_INTENT',
  /** PRD 345 — "same time next week?" prompt for a recurring series occurrence. */
  GAME_SERIES_NEXT_PROMPT = 'GAME_SERIES_NEXT_PROMPT',
  /** PRD 346 — the organizer noted the recipient as a no-show. */
  GAME_NO_SHOW_NOTED = 'GAME_NO_SHOW_NOTED',
  /** PRD 347 — a PLAYING seat opened on a game the recipient queued for. */
  GAME_SPOT_OPENED = 'GAME_SPOT_OPENED',
  /** PRD 347 — a PLAYING seat opened on a game a followed player is in. */
  FOLLOWED_GAME_SPOT_OPENED = 'FOLLOWED_GAME_SPOT_OPENED',
  /** PRD 348 — unpaid cost share reminder. */
  GAME_COST_REMINDER = 'GAME_COST_REMINDER',
  /** PRD 349 — a followed player's game just went live. */
  FOLLOWED_USER_LIVE = 'FOLLOWED_USER_LIVE',
  /** PRD 351 — somebody signed up with the recipient's referral code. */
  REFERRAL_JOINED = 'REFERRAL_JOINED',
  /** PRD 353 — the monthly recap is ready to view. */
  MONTHLY_RECAP_READY = 'MONTHLY_RECAP_READY',
  /** PRD 355 — another player gifted the recipient a catalogue item. */
  GOODS_GIFT_RECEIVED = 'GOODS_GIFT_RECEIVED',
  /** PRD 357 — rain / wind risk on an upcoming outdoor game. */
  GAME_WEATHER_ALERT = 'GAME_WEATHER_ALERT',
}

export interface NotificationAction {
  id: string;
  title: string;
  action: string;
  input?: boolean;
}

export interface NotificationData {
  gameId?: string;
  matchId?: string;
  bugId?: string;
  userId?: string;
  genderTeams?: string;
  entityType?: string;
  inviteId?: string;
  chatContextType?: string;
  contextId?: string;
  chatType?: string;
  messageId?: string;
  userChatId?: string;
  groupChannelId?: string;
  transactionId?: string;
  marketItemId?: string;
  proposalId?: string;
  playIntentId?: string;
  shortDayOfWeek?: string;
  teamId?: string;
  replyToken?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  conversationKey?: string;
  acceptActionTitle?: string;
  declineActionTitle?: string;
  acceptActionToken?: string;
  declineActionToken?: string;
  playTooActionTitle?: string;
  previewImageUrl?: string;
  previewMediaType?: string;
  mediaCount?: number;
  /** Stable outbox event key used by push providers to collapse retries. */
  deliveryKey?: string;
  /** Authoritative unread total for native app icon badge (chat push). */
  unreadBadgeCount?: number;
  /** PRD 345 — the `GameSeries` a notification is about. */
  seriesId?: string;
  /** PRD 346 — signed `attendance`/`confirm` push action token (see pushInviteActionToken.service). */
  attendanceActionToken?: string;
  /** PRD 346 — signed `attendance`/`unsure` push action token. */
  attendanceUnsureActionToken?: string;
  /** PRD 346 — localized title of the "I'm in" push action button. */
  confirmActionTitle?: string;
  /** PRD 346 — localized title of the "Not sure" push action button. */
  unsureActionTitle?: string;
  /** PRD 357 — localized title of the "Keep as planned" push action button. */
  keepActionTitle?: string;
  /** PRD 357 — signed `weather`/`keep` push action token (see pushInviteActionToken.service). */
  weatherKeepActionToken?: string;
  /** PRD 357 — localized title of the "Move indoor" push action button (organizers only). */
  moveIndoorActionTitle?: string;
  /** PRD 357 — in-app path the weather alert opens, including `?section=weather`. */
  weatherDeepLink?: string;
  /** PRD 357 — severity class of the alert, so the shade can style it. */
  weatherSeverity?: string;
  /** PRD 347 — ISO timestamp the PLAYING seat was freed. */
  spotOpenedAt?: string;
  /** PRD 347 — `'1'` when auto-fill seated the recipient from the queue. */
  seatedFromQueue?: string;
  /** PRD 353 — `YYYY-MM` key of the recap the notification points at. */
  recapMonthKey?: string;
  /**
   * PRD 351 — `'1'` when a `TRANSACTION` push is a referral payout. The app
   * uses it to open the Wallet and highlight `transactionId` instead of taking
   * the generic transaction path.
   */
  referralReward?: string;
  /** PRD 355 — the catalogue item a gift notification is about. */
  goodsId?: string;
  /** PRD 355 — who sent the gift, so the shop can thank them. */
  senderUserId?: string;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
  actions?: NotificationAction[];
  badge?: number;
  sound?: string;
  category?: string;
  threadId?: string;
}

export interface UnifiedNotificationRequest {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  preferTelegram?: boolean;
  preferPush?: boolean;
  /** Restrict delivery to these channels. Preferences are still rechecked. */
  channels?: NotificationChannelType[];
}

/**
 * Result of a {@link NotificationService.sendNotification} dispatch.
 *
 * `telegram`/`push` are truthy when the provider accepted the message.
 * `permanentFailure` is set only when a requested channel came back `false`
 * for a reason that will never succeed on retry (e.g. the user has no
 * `telegramId`, blocked the bot, or the bot is not configured). Queues use it
 * to skip such jobs instead of burning retries.
 */
export interface NotificationDeliveryResult {
  telegram: boolean;
  push: boolean;
  permanentFailure?: string;
}
