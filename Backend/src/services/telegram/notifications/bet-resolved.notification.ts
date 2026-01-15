import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';
import prisma from '../../../config/database';

export async function sendBetResolvedNotification(
  api: Api,
  betId: string,
  userId: string,
  isWinner: boolean,
  totalCoinsWon?: number
) {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: {
      game: {
        include: {
          court: {
            include: {
              club: true,
            },
          },
          club: true,
        },
      },
      creator: {
        select: {
          telegramId: true,
          language: true,
          currentCityId: true,
          sendTelegramMessages: true,
        },
      },
      acceptedByUser: {
        select: {
          telegramId: true,
          language: true,
          currentCityId: true,
          sendTelegramMessages: true,
        },
      },
    },
  });

  if (!bet || !bet.game) {
    return;
  }

  const user = userId === bet.creatorId ? bet.creator : bet.acceptedByUser;
  if (!user || !user.telegramId || !user.sendTelegramMessages) {
    return;
  }

  try {
    const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
    const gameInfo = await formatGameInfoForUser(bet.game, user.currentCityId, lang);
    const gameName = bet.game.name ? bet.game.name : t(`games.gameTypes.${bet.game.gameType}`, lang);
    const clubName = bet.game.court?.club?.name || bet.game.club?.name;

    const title = isWinner 
      ? t('telegram.betWon', lang) || '🎉 Bet Won!'
      : t('telegram.betLost', lang) || '❌ Bet Lost';

    let message = `${title}\n\n`;
    message += `🎮 ${escapeMarkdown(gameName)}\n`;
    
    if (clubName) {
      message += `📍 ${escapeMarkdown(t('telegram.place', lang))}: ${escapeMarkdown(clubName)}\n`;
    }
    
    message += `🕐 ${escapeMarkdown(t('telegram.time', lang))}: ${gameInfo.shortDate} ${gameInfo.startTime}\n`;

    if (isWinner && totalCoinsWon && totalCoinsWon > 0) {
      message += `\n💰 ${escapeMarkdown(t('telegram.coinsWon', lang) || 'Coins won')}: ${totalCoinsWon}\n`;
    }

    if (bet.resolutionReason) {
      message += `\n📝 ${escapeMarkdown(bet.resolutionReason)}`;
    }

    const buttons = [[
      {
        text: t('telegram.viewGame', lang),
        url: `${config.frontendUrl}/games/${bet.gameId}`
      }
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    await api.sendMessage(user.telegramId, finalMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram bet resolved notification to user ${userId}:`, error);
  }
}

export async function sendBetNeedsReviewNotification(
  api: Api,
  betId: string,
  userId: string
) {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: {
      game: {
        include: {
          court: {
            include: {
              club: true,
            },
          },
          club: true,
        },
      },
      creator: {
        select: {
          telegramId: true,
          language: true,
          currentCityId: true,
          sendTelegramMessages: true,
        },
      },
      acceptedByUser: {
        select: {
          telegramId: true,
          language: true,
          currentCityId: true,
          sendTelegramMessages: true,
        },
      },
    },
  });

  if (!bet || !bet.game) {
    return;
  }

  const user = userId === bet.creatorId ? bet.creator : bet.acceptedByUser;
  if (!user || !user.telegramId || !user.sendTelegramMessages) {
    return;
  }

  try {
    const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
    const gameInfo = await formatGameInfoForUser(bet.game, user.currentCityId, lang);
    const gameName = bet.game.name ? bet.game.name : t(`games.gameTypes.${bet.game.gameType}`, lang);
    const clubName = bet.game.court?.club?.name || bet.game.club?.name;

    const title = t('telegram.betNeedsReview', lang) || '⚠️ Bet Needs Review';
    let message = `${title}\n\n`;
    message += `🎮 ${escapeMarkdown(gameName)}\n`;
    
    if (clubName) {
      message += `📍 ${escapeMarkdown(t('telegram.place', lang))}: ${escapeMarkdown(clubName)}\n`;
    }
    
    message += `🕐 ${escapeMarkdown(t('telegram.time', lang))}: ${gameInfo.shortDate} ${gameInfo.startTime}\n`;
    message += `\n${escapeMarkdown(t('telegram.betNeedsReviewDescription', lang) || 'Your bet requires manual review due to a resolution error.')}`;

    const buttons = [[
      {
        text: t('telegram.viewGame', lang),
        url: `${config.frontendUrl}/games/${bet.gameId}`
      }
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    await api.sendMessage(user.telegramId, finalMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram bet needs review notification to user ${userId}:`, error);
  }
}
