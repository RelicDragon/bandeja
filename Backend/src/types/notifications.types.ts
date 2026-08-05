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
  playTooActionTitle?: string;
  previewImageUrl?: string;
  previewMediaType?: string;
  mediaCount?: number;
  /** Stable outbox event key used by push providers to collapse retries. */
  deliveryKey?: string;
  /** Authoritative unread total for native app icon badge (chat push). */
  unreadBadgeCount?: number;
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
