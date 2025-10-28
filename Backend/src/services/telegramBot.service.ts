import TelegramBot from 'node-telegram-bot-api';
import prisma from '../config/database';
import { config } from '../config/env';
import type { Message } from 'node-telegram-bot-api';

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

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

    this.bot.on('message', (msg: Message) => {
      if (!msg.text?.startsWith('/')) {
        this.bot?.sendMessage(
          msg.chat.id,
          '👋 Welcome! Send /auth to get your authentication code.'
        );
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

