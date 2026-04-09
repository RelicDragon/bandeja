export enum PreferenceKey {
  SEND_MESSAGES = 'sendMessages',
  SEND_INVITES = 'sendInvites',
  SEND_DIRECT_MESSAGES = 'sendDirectMessages',
  SEND_REMINDERS = 'sendReminders',
  SEND_WALLET_NOTIFICATIONS = 'sendWalletNotifications',
  SEND_MARKETPLACE_NOTIFICATIONS = 'sendMarketplaceNotifications',
  SEND_TEAM_NOTIFICATIONS = 'sendTeamNotifications',
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
  TEAM_INVITE = 'TEAM_INVITE',
  TEAM_INVITE_ACCEPTED = 'TEAM_INVITE_ACCEPTED',
  TEAM_INVITE_DECLINED = 'TEAM_INVITE_DECLINED',
  TEAM_MEMBER_REMOVED = 'TEAM_MEMBER_REMOVED',
  TEAM_MEMBER_LEFT = 'TEAM_MEMBER_LEFT',
  TEAM_DELETED = 'TEAM_DELETED',
}

export interface NotificationAction {
  id: string;
  title: string;
  action: string;
}

export interface NotificationData {
  gameId?: string;
  bugId?: string;
  userId?: string;
  inviteId?: string;
  chatType?: string;
  messageId?: string;
  userChatId?: string;
  groupChannelId?: string;
  transactionId?: string;
  marketItemId?: string;
  shortDayOfWeek?: string;
  teamId?: string;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
  actions?: NotificationAction[];
  badge?: number;
  sound?: string;
}

export interface UnifiedNotificationRequest {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  preferTelegram?: boolean;
  preferPush?: boolean;
}

export interface NotificationPreferences {
  sendTelegramMessages?: boolean;
  sendTelegramInvites?: boolean;
  sendTelegramDirectMessages?: boolean;
  sendTelegramReminders?: boolean;
  sendTelegramWalletNotifications?: boolean;
  sendPushMessages?: boolean;
  sendPushInvites?: boolean;
  sendPushDirectMessages?: boolean;
  sendPushReminders?: boolean;
  sendPushWalletNotifications?: boolean;
}
