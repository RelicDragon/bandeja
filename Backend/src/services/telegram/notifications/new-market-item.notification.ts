import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';

export async function sendNewMarketItemNotification(
  api: Api,
  marketItem: { id: string; title: string; priceCents: number | null; currency: string },
  cityName: string,
  recipient: { id: string; telegramId: string; language?: string | null }
) {
  if (!recipient.telegramId) return;

  try {
    const lang = await getUserLanguageFromTelegramId(recipient.telegramId, undefined);
    const title = (t('marketplace.newListingTitle', lang) || 'New listing in {city}').replace('{city}', cityName);

    let priceText = '';
    if (marketItem.priceCents != null) {
      priceText = `${(marketItem.priceCents / 100).toFixed(2)} ${marketItem.currency}`;
    }

    let message = `🛒 ${escapeMarkdown(title)}\n\n${escapeMarkdown(marketItem.title)}`;
    if (priceText) {
      message += `\n💰 ${escapeMarkdown(priceText)}`;
    }

    const buttons = [[
      {
        text: t('marketplace.viewListing', lang) || 'View listing',
        url: `${config.frontendUrl}/marketplace/${marketItem.id}`
      }
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    const trimmedMessage = trimTextForTelegram(finalMessage, false);

    await api.sendMessage(recipient.telegramId, trimmedMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram new market item notification to user ${recipient.id}:`, error);
  }
}
