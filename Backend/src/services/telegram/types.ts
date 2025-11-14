import { Context } from 'grammy';
import { ChatType } from '@prisma/client';

export interface PendingReply {
  messageId: string;
  gameId?: string;
  userChatId?: string;
  userId: string;
  chatType: ChatType;
  chatContextType: 'GAME' | 'USER';
  lang: string;
}

export type BotContext = Context & {
  lang?: string;
  telegramId?: string;
};

