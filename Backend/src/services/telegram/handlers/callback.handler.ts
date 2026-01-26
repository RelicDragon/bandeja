import { Middleware } from 'grammy';
import { BotContext, PendingReply } from '../types';
import { ChatType } from '@prisma/client';
import prisma from '../../../config/database';
import { t } from '../../../utils/translations';
import telegramNotificationService from '../notification.service';
import { acceptInviteFromTelegram, declineInviteFromTelegram } from '../invite.service';
import { escapeMarkdown, escapeHTML, getUserLanguage } from '../utils';

export function createCallbackHandler(
  pendingReplies: Map<string, PendingReply>
): Middleware<BotContext> {
  return async (ctx) => {
    const query = ctx.callbackQuery;
    if (!query?.data || !ctx.from || !ctx.telegramId) {
      await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
      return;
    }

    try {
      if (query.data.startsWith('ia:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, inviteId, action] = parts;
        const telegramId = ctx.telegramId;

        if (action !== 'accept' && action !== 'decline') {
          await ctx.answerCallbackQuery({ text: 'Invalid action', show_alert: true });
          return;
        }

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        
        const result = action === 'accept'
          ? await acceptInviteFromTelegram(inviteId, user.id)
          : await declineInviteFromTelegram(inviteId, user.id);

        let feedbackMessage: string;
        if (result.success) {
          feedbackMessage = t(result.message, lang);
        } else {
          feedbackMessage = t(result.message, lang) || t('telegram.inviteActionError', lang);
        }

        await ctx.answerCallbackQuery({
          text: feedbackMessage,
          show_alert: true
        });

        if (query.message && 'text' in query.message && query.message.text && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            const originalMessage = query.message.text;
            const isHTML = originalMessage.includes('<') && originalMessage.includes('>');
            const parseMode = isHTML ? 'HTML' : 'Markdown';
            const escapeFunction = isHTML ? escapeHTML : escapeMarkdown;
            
            let updatedMessage: string;
            let statusText: string;
            
            if (result.success) {
              statusText = action === 'accept' 
                ? t('telegram.inviteAccepted', lang)
                : t('telegram.inviteDeclined', lang);
              
              let cleanedMessage = originalMessage.replace(/^(✅|❌)[^\n]*(?:\n\n?)?/s, '');
              cleanedMessage = cleanedMessage.replace(/^🎯[^\n]*(?:\n\n?)?/s, '');
              updatedMessage = escapeFunction('✅ ' + statusText) + '\n\n' + cleanedMessage.trim();
            } else {
              const errorText = t(result.message, lang) || t('telegram.inviteActionError', lang);
              let cleanedMessage = originalMessage.replace(/^(✅|❌)[^\n]*(?:\n\n?)?/s, '');
              updatedMessage = escapeFunction('❌ ' + errorText) + '\n\n' + cleanedMessage.trim();
            }

            try {
              const newReplyMarkup = result.success ? { inline_keyboard: [] } : query.message.reply_markup;
              const hasContentChanged = originalMessage !== updatedMessage;
              const hasMarkupChanged = result.success && query.message.reply_markup && 
                JSON.stringify(query.message.reply_markup) !== JSON.stringify(newReplyMarkup);
              
              if (hasContentChanged || hasMarkupChanged) {
                await ctx.api.editMessageText(chat.id, query.message.message_id, updatedMessage, {
                  parse_mode: parseMode,
                  reply_markup: newReplyMarkup
                });
              }
            } catch (editError) {
              console.error('Failed to edit invite message:', editError);
            }
          }
        }
      } else if (query.data.startsWith('sg:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, gameId, userId] = parts;
        const telegramId = ctx.telegramId;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            telegramId: true,
            language: true,
          }
        });

        if (user?.telegramId === telegramId) {
          const lang = getUserLanguage(user.language, ctx.from?.language_code);
          try {
            await ctx.answerCallbackQuery({
              text: 'Loading game...',
              show_alert: false
            });
            await telegramNotificationService.sendGameCard(gameId, telegramId, ctx.api);
          } catch (error) {
            console.error('Error sending game card:', error);
            try {
              await ctx.answerCallbackQuery({
                text: 'Failed to load game. Please try again.',
                show_alert: true
              });
            } catch {
              if (query.message && 'chat' in query.message && query.message.chat) {
                const chat = query.message.chat;
                if ('id' in chat && typeof chat.id === 'number') {
                  await ctx.api.sendMessage(
                    chat.id,
                    t('telegram.errorLoadingGame', lang) || 'Failed to load game. Please try again.'
                  );
                }
              }
            }
          }
        } else {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
        }
      } else if (query.data.startsWith('rm:')) {
        const parts = query.data.split(':');
        if (parts.length !== 4) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, gameId, chatTypeChar] = parts;
        const telegramId = ctx.telegramId;

        const chatTypeMap: Record<string, ChatType> = {
          'P': 'PUBLIC',
          'V': 'PRIVATE',
          'A': 'ADMINS'
        };
        const chatType = chatTypeMap[chatTypeChar] || 'PUBLIC';

        await ctx.answerCallbackQuery();

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (user) {
          const lang = getUserLanguage(user.language, ctx.from?.language_code);
          pendingReplies.set(telegramId, {
            messageId,
            gameId,
            userId: user.id,
            chatType,
            chatContextType: 'GAME',
            lang
          });
          
          if (query.message && 'chat' in query.message && query.message.chat) {
            const chat = query.message.chat;
            if ('id' in chat && typeof chat.id === 'number') {
              await ctx.api.sendMessage(
                chat.id,
                t('telegram.replyPrompt', lang)
              );
            }
          }
        } else {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
        }
      } else if (query.data.startsWith('rum:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, userChatId] = parts;
        const telegramId = ctx.telegramId;

        await ctx.answerCallbackQuery();

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (user) {
          const lang = getUserLanguage(user.language, ctx.from?.language_code);
          pendingReplies.set(telegramId, {
            messageId,
            userChatId,
            userId: user.id,
            chatType: 'PUBLIC',
            chatContextType: 'USER',
            lang
          });
          
          if (query.message && 'chat' in query.message && query.message.chat) {
            const chat = query.message.chat;
            if ('id' in chat && typeof chat.id === 'number') {
              await ctx.api.sendMessage(
                chat.id,
                t('telegram.replyPrompt', lang)
              );
            }
          }
        } else {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
        }
      } else if (query.data.startsWith('rbm:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, bugId] = parts;
        const telegramId = ctx.telegramId;

        await ctx.answerCallbackQuery();

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (user) {
          const lang = getUserLanguage(user.language, ctx.from?.language_code);
          pendingReplies.set(telegramId, {
            messageId,
            bugId,
            userId: user.id,
            chatType: 'PUBLIC',
            chatContextType: 'BUG',
            lang
          });
          
          if (query.message && 'chat' in query.message && query.message.chat) {
            const chat = query.message.chat;
            if ('id' in chat && typeof chat.id === 'number') {
              await ctx.api.sendMessage(
                chat.id,
                t('telegram.replyPrompt', lang)
              );
            }
          }
        } else {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
        }
      }
    } catch (error) {
      console.error('Error handling callback query:', error);
      await ctx.answerCallbackQuery({
        text: 'An error occurred',
        show_alert: true
      });
    }
  };
}

