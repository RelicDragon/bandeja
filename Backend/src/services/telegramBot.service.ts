import TelegramBot from 'node-telegram-bot-api';
import prisma from '../config/database';
import { config } from '../config/env';
import type { Message, CallbackQuery } from 'node-telegram-bot-api';
import telegramNotificationService from './telegramNotification.service';
import { MessageService } from './chat/message.service';
import { ChatType } from '@prisma/client';
import { t } from '../utils/translations';

interface PendingReply {
  messageId: string;
  gameId: string;
  userId: string;
  chatType: ChatType;
  lang: string;
}

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private pendingReplies: Map<string, PendingReply> = new Map();

  getBot(): TelegramBot | null {
    return this.bot;
  }

  initialize() {
    if (!config.telegramBotToken) {
      console.warn('⚠️  Telegram bot token not configured');
      return;
    }

    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });

    const handleAuthCommand = async (msg: Message) => {
      const chatId = msg.chat.id;
      const from = msg.from;

      if (!from) {
        this.bot?.sendMessage(chatId, '❌ Unable to identify your Telegram account.');
        return;
      }

      const telegramId = from.id.toString();
      const username = from.username;
      const firstName = from.first_name;
      const lastName = from.last_name;
      const languageCode = from.language_code;

      try {
        // Delete the user's command message (ignore errors if deletion fails)
        try {
          await this.bot?.deleteMessage(chatId, msg.message_id);
        } catch (deleteError) {
          // Ignore deletion errors - bot might not have permission or message might be too old
          console.log('Could not delete command message:', deleteError);
        }

        const code = this.generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Send text message first
        const textMessage = await this.bot?.sendMessage(
          chatId,
          '🔐 Your authentication code:\n\n⏰ This code will expire in 5 minutes.\n\n📱 Enter this code in the app to complete authentication.'
        );

        // Send code message second (clean code for easy copying)
        const codeMessage = await this.bot?.sendMessage(
          chatId,
          code
        );

        await prisma.telegramOtp.create({
          data: {
            code,
            telegramId,
            username: username || null,
            firstName: firstName || null,
            lastName: lastName || null,
            languageCode: languageCode || null,
            chatId: chatId.toString(),
            textMessageId: textMessage?.message_id.toString(),
            codeMessageId: codeMessage?.message_id.toString(),
            expiresAt,
          },
        });
      } catch (error) {
        console.error('Error generating OTP:', error);
        this.bot?.sendMessage(chatId, '❌ An error occurred. Please try again.');
      }
    };

    this.bot.onText(/\/auth/, handleAuthCommand);
    this.bot.onText(/\/start/, handleAuthCommand);

    this.bot.on('message', async (msg: Message) => {
      if (!msg.from) return;
      
      const telegramId = msg.from.id.toString();
      
      if (this.pendingReplies.has(telegramId)) {
        const pendingReply = this.pendingReplies.get(telegramId)!;
        
        if (msg.text && msg.text.startsWith('/')) {
          this.pendingReplies.delete(telegramId);
          await this.bot?.sendMessage(
            msg.chat.id,
            t('telegram.replyCancelled', pendingReply.lang)
          );
          return;
        }
        
        if (!msg.text) {
          await this.bot?.sendMessage(
            msg.chat.id,
            t('telegram.replyPrompt', pendingReply.lang)
          );
          return;
        }
        
        const replyText = msg.text.trim();
        if (replyText.length === 0) {
          await this.bot?.sendMessage(
            msg.chat.id,
            t('telegram.replyPrompt', pendingReply.lang)
          );
          return;
        }
        
        try {
          await MessageService.createMessageWithEvent({
            gameId: pendingReply.gameId,
            senderId: pendingReply.userId,
            content: replyText,
            mediaUrls: [],
            replyToId: pendingReply.messageId,
            chatType: pendingReply.chatType
          });
          
          this.pendingReplies.delete(telegramId);
          const successMessage = await this.bot?.sendMessage(
            msg.chat.id,
            t('telegram.replySent', pendingReply.lang)
          );
          if (successMessage?.message_id) {
            this.scheduleMessageDeletion(msg.chat.id, successMessage.message_id);
          }
        } catch (error) {
          console.error('Error sending reply:', error);
          this.pendingReplies.delete(telegramId);
          const errorMessage = await this.bot?.sendMessage(
            msg.chat.id,
            '❌ Failed to send reply. Please try again.'
          );
          if (errorMessage?.message_id) {
            this.scheduleMessageDeletion(msg.chat.id, errorMessage.message_id);
          }
        }
        return;
      }
      
      if (!msg.text?.startsWith('/')) {
        this.bot?.sendMessage(
          msg.chat.id,
          '👋 Welcome! Send /auth to get your authentication code.'
        );
      }
    });

    this.bot.on('callback_query', async (query: CallbackQuery) => {
      if (!query.data || !query.from) return;

      try {
        if (query.data.startsWith('sg:')) {
          const parts = query.data.split(':');
          if (parts.length === 3) {
            const gameId = parts[1];
            const userId = parts[2];
            const telegramId = query.from.id.toString();

            await this.bot?.answerCallbackQuery(query.id, {
              text: 'Loading game...',
              show_alert: false
            });

            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: {
                telegramId: true,
                language: true,
              }
            });

            if (user && user.telegramId && user.telegramId === telegramId) {
              const lang = user.language || 'en';
              await telegramNotificationService.sendGameCard(gameId, telegramId, lang);
            } else {
              await this.bot?.answerCallbackQuery(query.id, {
                text: 'Unauthorized',
                show_alert: true
              });
            }
          }
        } else if (query.data.startsWith('rm:')) {
          const parts = query.data.split(':');
          if (parts.length === 4) {
            const messageId = parts[1];
            const gameId = parts[2];
            const chatTypeChar = parts[3];
            const telegramId = query.from.id.toString();

            const chatTypeMap: Record<string, ChatType> = {
              'P': 'PUBLIC',
              'V': 'PRIVATE',
              'A': 'ADMINS'
            };
            const chatType = chatTypeMap[chatTypeChar] || 'PUBLIC';

            await this.bot?.answerCallbackQuery(query.id);

            const user = await prisma.user.findUnique({
              where: { telegramId },
              select: {
                id: true,
                language: true,
              }
            });

            if (user) {
              const lang = user.language || 'en';
              this.pendingReplies.set(telegramId, {
                messageId,
                gameId,
                userId: user.id,
                chatType,
                lang
              });
              
              if (query.message?.chat.id) {
                await this.bot?.sendMessage(
                  query.message.chat.id,
                  t('telegram.replyPrompt', lang)
                );
              }
            } else {
              await this.bot?.answerCallbackQuery(query.id, {
                text: 'Unauthorized',
                show_alert: true
              });
            }
          }
        }
      } catch (error) {
        console.error('Error handling callback query:', error);
        await this.bot?.answerCallbackQuery(query.id, {
          text: 'An error occurred',
          show_alert: true
        });
      }
    });

    this.startCleanupInterval();

    console.log('🤖 Telegram bot initialized');
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async deleteOtpMessages(otp: { chatId: string | null; textMessageId: string | null; codeMessageId: string | null }) {
    if (!otp.chatId || !this.bot) return;

    const chatId = parseInt(otp.chatId);

    try {
      if (otp.textMessageId) {
        await this.bot.deleteMessage(chatId, parseInt(otp.textMessageId));
      }
      if (otp.codeMessageId) {
        await this.bot.deleteMessage(chatId, parseInt(otp.codeMessageId));
      }
    } catch (error) {
      // Ignore errors if messages are already deleted or bot can't delete them
      console.log('Could not delete OTP messages:', error);
    }
  }

  private scheduleMessageDeletion(chatId: number, messageId: number) {
    setTimeout(async () => {
      try {
        if (this.bot) {
          await this.bot.deleteMessage(chatId, messageId);
        }
      } catch (error) {
        // Ignore errors if message is already deleted or bot can't delete it
        console.log('Could not delete notification message:', error);
      }
    }, 20000);
  }

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(async () => {
      try {
        const now = new Date();
        const expiredOtps = await prisma.telegramOtp.findMany({
          where: {
            expiresAt: {
              lt: now,
            },
          },
          select: {
            id: true,
            chatId: true,
            textMessageId: true,
            codeMessageId: true,
          },
        });

        // Delete messages for expired OTPs
        for (const otp of expiredOtps) {
          await this.deleteOtpMessages(otp);
        }

        // Delete expired OTPs from database
        await prisma.telegramOtp.deleteMany({
          where: {
            expiresAt: {
              lt: now,
            },
          },
        });
      } catch (error) {
        console.error('Error cleaning up expired OTPs:', error);
      }
    }, 60000);
  }

  async verifyCode(code: string) {
    const otp = await prisma.telegramOtp.findFirst({
      where: {
        code,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!otp) {
      return null;
    }

    // Delete the OTP messages from Telegram before removing from database
    await this.deleteOtpMessages(otp);

    await prisma.telegramOtp.delete({
      where: { id: otp.id },
    });

    return otp;
  }

  stop() {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.bot?.stopPolling();
  }
}

export default new TelegramBotService();

