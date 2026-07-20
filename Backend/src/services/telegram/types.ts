import { Context } from 'grammy';
import { ChatType } from '@prisma/client';

export interface PendingReply {
  kind: 'reply';
  messageId: string;
  gameId?: string;
  userChatId?: string;
  bugId?: string;
  groupChannelId?: string;
  userId: string;
  chatType: ChatType;
  chatContextType: 'GAME' | 'USER' | 'BUG' | 'GROUP';
  lang: string;
}

export interface PendingDeclineInvite {
  kind: 'decline_invite';
  inviteId: string;
  userId: string;
  lang: string;
  inviteMessageChatId: number;
  inviteMessageId: number;
  inviteMessageText: string;
  inviteReplyMarkup?: { inline_keyboard: unknown[] };
  createdAt: number;
}

export type PendingTelegramInput = PendingReply | PendingDeclineInvite;

export type BotContext = Context & {
  lang?: string;
  telegramId?: string;
};
