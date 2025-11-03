import { Context } from 'grammy';
import { ChatType } from '@prisma/client';

export interface PendingReply {
  messageId: string;
  gameId: string;
  userId: string;
  chatType: ChatType;
  lang: string;
}

export type BotContext = Context & {
  lang?: string;
  telegramId?: string;
};

