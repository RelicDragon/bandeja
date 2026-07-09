import { Bot } from 'grammy';
import prisma from '../../config/database';

export async function deleteOtpMessages(
  otp: {
    chatId: string | null;
    textMessageId: string | null;
    codeMessageId: string | null;
    linkMessageId: string | null;
  },
  bot: Bot | null
) {
  if (!otp.chatId || !bot) return;

  const chatId = parseInt(otp.chatId);
  const messageIds = Array.from(
    new Set(
      [otp.textMessageId, otp.codeMessageId, otp.linkMessageId].filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    )
  );

  try {
    for (const messageId of messageIds) {
      await bot.api.deleteMessage(chatId, parseInt(messageId));
    }
  } catch (error) {
    console.log('Could not delete OTP messages:', error);
  }
}

export function startCleanupInterval(bot: Bot | null): ReturnType<typeof setInterval> | null {
  if (!bot) return null;

  const cleanupInterval = setInterval(async () => {
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
          linkMessageId: true,
        },
      });

      for (const otp of expiredOtps) {
        await deleteOtpMessages(otp, bot);
      }

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

  return cleanupInterval;
}
