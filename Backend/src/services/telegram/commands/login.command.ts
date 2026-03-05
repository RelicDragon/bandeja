import { InlineKeyboard } from 'grammy';
import { BotContext } from '../types';
import { generateLinkKey } from '../otp.service';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';

export async function generateLoginLink(ctx: BotContext) {
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
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentOtp) {
      await ctx.reply(t('telegram.rateLimitError', lang));
      return;
    }

    try {
      const msgId = ctx.message?.message_id;
      if (msgId) await ctx.api.deleteMessage(chatId, msgId);
    } catch {
      // ignore
    }

    const existingOtps = await prisma.telegramOtp.findMany({
      where: { telegramId },
    });

    for (const otp of existingOtps) {
      if (otp.chatId) {
        const otpChatId = parseInt(otp.chatId);
        try {
          if (otp.textMessageId) await ctx.api.deleteMessage(otpChatId, parseInt(otp.textMessageId));
          if (otp.codeMessageId) await ctx.api.deleteMessage(otpChatId, parseInt(otp.codeMessageId));
          if (otp.linkMessageId) await ctx.api.deleteMessage(otpChatId, parseInt(otp.linkMessageId));
        } catch {
          // ignore
        }
      }
    }

    await prisma.telegramOtp.deleteMany({
      where: { telegramId },
    });

    const linkKey = generateLinkKey();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const loginUrl = new URL(`/login/${linkKey}`, config.frontendUrl).href;
    const linkMessage = await ctx.reply(t('telegram.loginHint', lang), {
      reply_markup: new InlineKeyboard().url(t('telegram.openBandeja', lang), loginUrl),
    });

    await prisma.telegramOtp.create({
      data: {
        code: '000000',
        telegramId,
        username: from.username || null,
        firstName: from.first_name || null,
        lastName: from.last_name || null,
        languageCode: from.language_code || null,
        chatId: chatId.toString(),
        textMessageId: linkMessage.message_id.toString(),
        codeMessageId: null,
        linkKey,
        linkMessageId: linkMessage.message_id.toString(),
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Error generating login link:', error);
    await ctx.reply(t('telegram.authError', lang));
  }
}
