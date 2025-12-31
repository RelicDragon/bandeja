import { BotContext } from '../types';
import { generateOTP } from '../otp.service';
import prisma from '../../../config/database';
import { t } from '../../../utils/translations';

export async function generateAuthCode(ctx: BotContext) {
  if (!ctx.from || !ctx.chat || !ctx.lang || !ctx.telegramId) return;

  const chatId = ctx.chat.id;
  const from = ctx.from;
  const telegramId = ctx.telegramId;
  const lang = ctx.lang;

  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentOtp = await prisma.telegramOtp.findFirst({
      where: {
        telegramId,
        createdAt: {
          gte: oneMinuteAgo,
        },
      },
    });

    if (recentOtp) {
      await ctx.reply(t('telegram.rateLimitError', lang));
      return;
    }
    try {
      const msgId = ctx.message?.message_id;
      if (msgId) {
        await ctx.api.deleteMessage(chatId, msgId);
      }
    } catch (deleteError) {
      console.log('Could not delete command message:', deleteError);
    }

    const existingOtps = await prisma.telegramOtp.findMany({
      where: { telegramId },
    });

    for (const otp of existingOtps) {
      if (otp.chatId) {
        const otpChatId = parseInt(otp.chatId);
        try {
          if (otp.textMessageId) {
            await ctx.api.deleteMessage(otpChatId, parseInt(otp.textMessageId));
          }
          if (otp.codeMessageId) {
            await ctx.api.deleteMessage(otpChatId, parseInt(otp.codeMessageId));
          }
        } catch (error) {
          console.log('Could not delete OTP messages:', error);
        }
      }
    }

    await prisma.telegramOtp.deleteMany({
      where: { telegramId },
    });

    const textMessage = await ctx.reply(t('telegram.authCodeText', lang));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const codeMessage = await ctx.reply(code);

    await prisma.telegramOtp.create({
      data: {
        code,
        telegramId,
        username: from.username || null,
        firstName: from.first_name || null,
        lastName: from.last_name || null,
        languageCode: from.language_code || null,
        chatId: chatId.toString(),
        textMessageId: textMessage.message_id.toString(),
        codeMessageId: codeMessage.message_id.toString(),
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Error generating OTP:', error);
    await ctx.reply(t('telegram.authError', lang));
  }
}

