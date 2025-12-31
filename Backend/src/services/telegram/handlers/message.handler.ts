import { Middleware } from 'grammy';
import { BotContext, PendingReply } from '../types';
import { getUserLanguageFromTelegramId } from '../utils';
import { t } from '../../../utils/translations';
import { MessageService } from '../../chat/message.service';
import { scheduleMessageDeletion } from '../messageDeletion.service';
import { Bot } from 'grammy';

export function createMessageHandler(
  pendingReplies: Map<string, PendingReply>,
  bot: Bot | null
): Middleware<BotContext> {
  return async (ctx) => {
    if (!ctx.from || !ctx.chat || !ctx.telegramId) return;
    
    const telegramId = ctx.telegramId;
    const msg = ctx.message;
    if (!msg) return;
    
    if (pendingReplies.has(telegramId)) {
      const pendingReply = pendingReplies.get(telegramId)!;
      
      if (msg.text && msg.text.startsWith('/')) {
        pendingReplies.delete(telegramId);
        await ctx.reply(t('telegram.replyCancelled', pendingReply.lang));
        return;
      }
      
      if (!msg.text || msg.text.trim().length === 0) {
        await ctx.reply(t('telegram.replyPrompt', pendingReply.lang));
        return;
      }
      
      try {
        const contextId = pendingReply.chatContextType === 'USER' 
          ? pendingReply.userChatId! 
          : pendingReply.gameId!;
        
        await MessageService.createMessageWithEvent({
          chatContextType: pendingReply.chatContextType,
          contextId,
          senderId: pendingReply.userId,
          content: msg.text.trim(),
          mediaUrls: [],
          replyToId: pendingReply.messageId,
          chatType: pendingReply.chatType
        });
        
        pendingReplies.delete(telegramId);
        const successMessage = await ctx.reply(t('telegram.replySent', pendingReply.lang));
        if (successMessage.message_id) {
          scheduleMessageDeletion(ctx.chat.id, successMessage.message_id, bot);
        }
      } catch (error) {
        console.error('Error sending reply:', error);
        pendingReplies.delete(telegramId);
        const lang = ctx.lang || await getUserLanguageFromTelegramId(telegramId, ctx.from?.language_code);
        const errorMessage = await ctx.reply(t('telegram.authError', lang));
        if (errorMessage.message_id) {
          scheduleMessageDeletion(ctx.chat.id, errorMessage.message_id, bot);
        }
      }
      return;
    }
    
    if (msg.text && !msg.text.startsWith('/') && msg.text.trim().length > 0) {
      const lang = ctx.lang || await getUserLanguageFromTelegramId(telegramId, ctx.from?.language_code);
      const reminderMessage = await ctx.reply(t('telegram.commandsReminder', lang));
      if (reminderMessage.message_id) {
        scheduleMessageDeletion(ctx.chat.id, reminderMessage.message_id, bot);
      }
    }
  };
}

