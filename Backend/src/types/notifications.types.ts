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
  TRANSACTION = 'TRANSACTION'
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
