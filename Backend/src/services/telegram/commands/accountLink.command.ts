import { BotContext } from '../types';
import { generateActiveUniqueOTP, generateLinkKey } from '../otp.service';
import prisma from '../../../config/database';
import { t } from '../../../utils/translations';
import { buildTelegramLoginUrl } from '../loginLink.service';
import { sendTelegramLoginUrlMessage } from '../loginMessage.service';

export async function generateAccountLinkFlow(ctx: BotContext, intentToken: string) {
  if (!ctx.from || !ctx.chat || !ctx.lang || !ctx.telegramId) return;

  const chatId = ctx.chat.id;
  const from = ctx.from;
  const telegramId = ctx.telegramId;
  const lang = ctx.lang;

  const intent = await prisma.telegramAccountLinkIntent.findUnique({
    where: { token: intentToken },
  });

  if (!intent || intent.expiresAt <= new Date()) {
    await ctx.reply(t('telegram.linkIntentInvalid', lang));
    return;
  }

  const linkUserId = intent.userId;

  const otherOwner = await prisma.user.findFirst({
    where: {
      telegramId,
      id: { not: linkUserId },
    },
    select: { id: true },
  });

  if (otherOwner) {
    await ctx.reply(t('telegram.telegramInUseOtherAccount', lang));
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: linkUserId },
    select: { id: true, telegramId: true, isActive: true },
  });

  if (!targetUser || !targetUser.isActive) {
    await ctx.reply(t('telegram.linkIntentInvalid', lang));
    await prisma.telegramAccountLinkIntent.delete({ where: { id: intent.id } }).catch(() => {});
    return;
  }

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

    await prisma.telegramAccountLinkIntent.delete({
      where: { id: intent.id },
    });

    const code = await generateActiveUniqueOTP();
    const linkKey = generateLinkKey();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const loginUrl = buildTelegramLoginUrl(linkKey);
    const linkMessage = await sendTelegramLoginUrlMessage({
      reply: (text, options) => ctx.reply(text, options),
      message: t('telegram.accountLinkHint', lang),
      buttonText: t('telegram.openBandeja', lang),
      loginUrl,
    });

    await prisma.telegramOtp.create({
      data: {
        code,
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
        linkUserId,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Error generating account link OTP:', error);
    await ctx.reply(t('telegram.authError', lang));
  }
}
