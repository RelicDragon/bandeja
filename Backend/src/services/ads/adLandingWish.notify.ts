import { AdLandingDonationIntent } from '@prisma/client';
import prisma from '../../config/database';
import telegramBotService from '../telegram/bot.service';
import { escapeHTML } from '../telegram/utils';
import { isBenignTelegramRecipientError } from '../telegram/telegramRecipientErrors';

type WishNotifyPayload = {
  displayName: string;
  message: string;
  donationIntent: AdLandingDonationIntent;
};

const MAX_MESSAGE = 800;

function formatDonation(intent: AdLandingDonationIntent): string {
  if (intent === AdLandingDonationIntent.RSD) return 'RSD';
  if (intent === AdLandingDonationIntent.RUB) return 'RUB';
  return 'none';
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 3)}...`;
}

export async function notifyDevelopersAdLandingWish(wish: WishNotifyPayload): Promise<void> {
  const bot = telegramBotService.getBot();
  if (!bot) return;

  const developers = await prisma.user.findMany({
    where: { isDeveloper: true, telegramId: { not: null } },
    select: { id: true, telegramId: true },
  });
  if (developers.length === 0) return;

  const donation = formatDonation(wish.donationIntent);
  const text =
    `🎂 <b>Liza birthday wish</b>\n` +
    `👤 ${escapeHTML(wish.displayName)}\n` +
    `💰 Donation: ${escapeHTML(donation)}\n` +
    `💬 ${escapeHTML(truncate(wish.message, MAX_MESSAGE))}`;

  await Promise.all(
    developers.map(async (dev) => {
      if (!dev.telegramId) return;
      try {
        await bot.api.sendMessage(dev.telegramId, text, { parse_mode: 'HTML' });
      } catch (error) {
        if (isBenignTelegramRecipientError(error)) return;
        console.error(`[adLandingWish] Telegram notify failed for developer ${dev.id}:`, error);
      }
    })
  );
}
