import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';

export async function createBetResolvedPushNotification(
  betId: string,
  userId: string,
  isWinner: boolean,
  totalCoinsWon?: number
): Promise<NotificationPayload | null> {
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
          language: true,
          currentCityId: true,
        },
      },
      acceptedByUser: {
        select: {
          language: true,
          currentCityId: true,
        },
      },
    },
  });

  if (!bet || !bet.game) {
    return null;
  }

  const user = userId === bet.creatorId ? bet.creator : bet.acceptedByUser;
  if (!user) {
    return null;
  }

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(bet.game, user.currentCityId, lang);
  const gameName = bet.game.name ? bet.game.name : t(`games.gameTypes.${bet.game.gameType}`, lang);

  const title = isWinner 
    ? t('telegram.betWon', lang) || 'Bet Won!'
    : t('telegram.betLost', lang) || 'Bet Lost';

  let body = `${gameName}`;
  if (gameInfo.place) {
    body += ` - ${gameInfo.place}`;
  }
  body += `\n${gameInfo.shortDate} ${gameInfo.startTime}`;

  if (isWinner && totalCoinsWon && totalCoinsWon > 0) {
    body += `\n💰 ${t('telegram.coinsWon', lang) || 'Coins won'}: ${totalCoinsWon}`;
  }

  if (bet.resolutionReason) {
    body += `\n${bet.resolutionReason}`;
  }

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title,
    body,
    data: {
      gameId: bet.gameId
    },
    sound: 'default'
  };
}

export async function createBetNeedsReviewPushNotification(
  betId: string,
  userId: string
): Promise<NotificationPayload | null> {
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
          language: true,
          currentCityId: true,
        },
      },
      acceptedByUser: {
        select: {
          language: true,
          currentCityId: true,
        },
      },
    },
  });

  if (!bet || !bet.game) {
    return null;
  }

  const user = userId === bet.creatorId ? bet.creator : bet.acceptedByUser;
  if (!user) {
    return null;
  }

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(bet.game, user.currentCityId, lang);
  const gameName = bet.game.name ? bet.game.name : t(`games.gameTypes.${bet.game.gameType}`, lang);

  const title = t('telegram.betNeedsReview', lang) || 'Bet Needs Review';
  let body = `${gameName}`;
  if (gameInfo.place) {
    body += ` - ${gameInfo.place}`;
  }
  body += `\n${t('telegram.betNeedsReviewDescription', lang) || 'Your bet requires manual review due to a resolution error.'}`;

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title,
    body,
    data: {
      gameId: bet.gameId
    },
    sound: 'default'
  };
}
