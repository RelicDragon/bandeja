import { Middleware } from 'grammy';
import { BotContext } from '../types';
import { escapeMarkdown, getUserLanguage } from '../utils';
import prisma from '../../../config/database';
import {
  buildReferralLink,
  ensureReferralCode,
  getReferralRewardAmounts,
} from '../../referral/referral.service';
import { formatReferralCode } from '../../referral/referralCode';
import { referralT } from '../../referral/referralCopy';

/**
 * PRD 351 — `/invite` replies with the user's personal referral link.
 *
 * Follows the house command shape (`games.command.ts`): resolve the linked
 * account from `ctx.telegramId`, resolve the language from the account plus the
 * Telegram client locale, reply in Markdown, and never let an error escape.
 */
export const handleInviteCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.chat) return;
  const telegramLang = ctx.from?.language_code;
  let userLang = getUserLanguage(null, telegramLang);

  try {
    if (!ctx.telegramId) {
      await ctx.reply(referralT('referral.inviteNeedsAccount', userLang));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.telegramId },
      select: { id: true, language: true },
    });
    if (!user) {
      await ctx.reply(referralT('referral.inviteNeedsAccount', userLang));
      return;
    }
    userLang = getUserLanguage(user.language, telegramLang);

    const [code, amounts] = await Promise.all([
      ensureReferralCode(user.id),
      getReferralRewardAmounts(),
    ]);
    const link = buildReferralLink(code);

    const message = [
      `*${escapeMarkdown(referralT('referral.inviteHeader', userLang))}*`,
      '',
      escapeMarkdown(
        referralT('referral.inviteBody', userLang, {
          referrerCoins: amounts.referrer,
          referredCoins: amounts.referred,
        }),
      ),
      '',
      `${escapeMarkdown(referralT('referral.inviteCodeLabel', userLang))}: \`${formatReferralCode(code)}\``,
      '',
      link,
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error handling invite command:', error);
    try {
      await ctx.reply(referralT('referral.inviteNeedsAccount', userLang));
    } catch (replyError) {
      console.error('Error sending invite error message:', replyError);
    }
  }
};
