import { Middleware } from 'grammy';
import { BotContext, PendingTelegramInput } from '../types';
import { getUserLanguageFromTelegramId } from '../utils';
import { t } from '../../../utils/translations';
import { MessageService } from '../../chat/message.service';
import { markReplyContextAsRead } from '../markReplyContextAsRead';
import { scheduleMessageDeletion } from '../messageDeletion.service';
import { Bot } from 'grammy';
import {
  finalizeTelegramInviteDecline,
  isDeclineInvitePendingExpired,
  parseLeadingBotCommand,
} from '../inviteDeclinePending';

function claimPending(
  pendingReplies: Map<string, PendingTelegramInput>,
  telegramId: string
): PendingTelegramInput | undefined {
  const pending = pendingReplies.get(telegramId);
  if (!pending) return undefined;
  pendingReplies.delete(telegramId);
  return pending;
}

export function createMessageHandler(
  pendingReplies: Map<string, PendingTelegramInput>,
  bot: Bot | null
): Middleware<BotContext> {
  return async (ctx) => {
    if (!ctx.from || !ctx.chat || !ctx.telegramId) return;
    
    const telegramId = ctx.telegramId;
    const msg = ctx.message;
    if (!msg) return;
    
    if (pendingReplies.has(telegramId)) {
      const peek = pendingReplies.get(telegramId)!;

      if (peek.kind === 'decline_invite') {
        if (isDeclineInvitePendingExpired(peek)) {
          pendingReplies.delete(telegramId);
          const expiredMsg = await ctx.reply(
            t('telegram.declineInviteReasonExpired', peek.lang)
          );
          if (expiredMsg.message_id) {
            scheduleMessageDeletion(ctx.chat.id, expiredMsg.message_id, bot);
          }
          return;
        }

        const command = msg.text ? parseLeadingBotCommand(msg.text) : null;
        if (command) {
          if (command === '/skip') {
            const pending = claimPending(pendingReplies, telegramId);
            if (!pending || pending.kind !== 'decline_invite') return;
            try {
              const { feedback } = await finalizeTelegramInviteDecline({
                api: ctx.api,
                pending,
              });
              const replyMsg = await ctx.reply(feedback);
              if (replyMsg.message_id) {
                scheduleMessageDeletion(ctx.chat.id, replyMsg.message_id, bot);
              }
            } catch (error) {
              console.error('Error declining invite from Telegram skip:', error);
              const errorMessage = await ctx.reply(
                t('telegram.inviteActionError', pending.lang)
              );
              if (errorMessage.message_id) {
                scheduleMessageDeletion(ctx.chat.id, errorMessage.message_id, bot);
              }
            }
            return;
          }

          pendingReplies.delete(telegramId);
          await ctx.reply(t('telegram.declineInviteReasonCancelled', peek.lang));
          return;
        }

        const reasonText = (msg.text ?? msg.caption)?.trim();
        if (!reasonText) {
          await ctx.reply(t('telegram.declineInviteReasonPrompt', peek.lang));
          return;
        }

        const pending = claimPending(pendingReplies, telegramId);
        if (!pending || pending.kind !== 'decline_invite') return;

        try {
          const { feedback } = await finalizeTelegramInviteDecline({
            api: ctx.api,
            pending,
            declineMessage: reasonText,
          });
          const successMessage = await ctx.reply(feedback);
          if (successMessage.message_id) {
            scheduleMessageDeletion(ctx.chat.id, successMessage.message_id, bot);
          }
        } catch (error) {
          console.error('Error declining invite with reason from Telegram:', error);
          const errorMessage = await ctx.reply(
            t('telegram.inviteActionError', pending.lang)
          );
          if (errorMessage.message_id) {
            scheduleMessageDeletion(ctx.chat.id, errorMessage.message_id, bot);
          }
        }
        return;
      }

      const pendingReply = peek;
      
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
          ? pendingReply.userChatId
          : pendingReply.chatContextType === 'BUG'
          ? pendingReply.bugId
          : pendingReply.chatContextType === 'GROUP'
          ? pendingReply.groupChannelId
          : pendingReply.gameId;
        
        if (!contextId) {
          throw new Error('Missing context ID for reply');
        }
        
        await MessageService.createMessageWithEvent({
          chatContextType: pendingReply.chatContextType,
          contextId,
          senderId: pendingReply.userId,
          content: msg.text.trim(),
          mediaUrls: [],
          replyToId: pendingReply.messageId,
          chatType: pendingReply.chatType
        });

        await markReplyContextAsRead({
          userId: pendingReply.userId,
          chatContextType: pendingReply.chatContextType,
          contextId,
          chatType: pendingReply.chatType,
        });
        
        pendingReplies.delete(telegramId);
        const successMessage = await ctx.reply(t('telegram.replySent', pendingReply.lang));
        if (successMessage.message_id) {
          scheduleMessageDeletion(ctx.chat.id, successMessage.message_id, bot);
        }
      } catch (error: unknown) {
        console.error('Error sending reply:', error);
        pendingReplies.delete(telegramId);
        const lang = ctx.lang || await getUserLanguageFromTelegramId(telegramId, ctx.from?.language_code);
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;
        
        let errorText: string;
        if (statusCode === 403) {
          errorText = 'You do not have permission to reply to this chat.';
        } else if (statusCode === 404) {
          errorText = 'Chat or message not found.';
        } else {
          errorText = t('telegram.authError', lang) || 'An error occurred. Please try again.';
        }
        
        const errorMessage = await ctx.reply(errorText);
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
