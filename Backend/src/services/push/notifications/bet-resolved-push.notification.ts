import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { buildBetResolvedContext } from '../../shared/notification-contexts/bet-resolved.context';

export async function createBetResolvedPushNotification(
  betId: string,
  userId: string,
  isWinner: boolean,
  totalCoinsWon?: number
): Promise<NotificationPayload | null> {
  const ctx = await buildBetResolvedContext(betId, userId, isWinner, totalCoinsWon);
  if (!ctx) {
    return null;
  }

  const title = ctx.title || (ctx.isWinner ? 'Challenge Won!' : 'Challenge Lost');

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title,
    body: ctx.bodyLines.join('\n'),
    data: {
      gameId: ctx.gameId,
      shortDayOfWeek: ctx.shortDayOfWeek,
    },
    sound: 'default',
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

  const title = t('telegram.betNeedsReview', lang) || 'Challenge Needs Review';
  let body = `${gameName}`;
  if (gameInfo.place) {
    body += ` - ${gameInfo.place}`;
  }
  body += `\n${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`;
  body += `\n${t('telegram.betNeedsReviewDescription', lang) || 'Your challenge requires manual review due to a resolution error.'}`;

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title,
    body,
    data: {
      gameId: bet.gameId,
      shortDayOfWeek: gameInfo.shortDayOfWeek
    },
    sound: 'default'
  };
}

export async function createBetCancelledPushNotification(
  betId: string,
  userId: string
): Promise<NotificationPayload | null> {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: {
      game: {
        include: {
          court: { include: { club: true } },
          club: true,
        },
      },
      creator: { select: { language: true, currentCityId: true } },
      acceptedByUser: { select: { language: true, currentCityId: true } },
    },
  });

  if (!bet || !bet.game) return null;

  const user = userId === bet.creatorId ? bet.creator : bet.acceptedByUser;
  if (!user) return null;

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(bet.game, user.currentCityId, lang);
  const gameName = bet.game.name ? bet.game.name : t(`games.gameTypes.${bet.game.gameType}`, lang);

  const title = t('telegram.betCancelled', lang) || 'Challenge Cancelled';
  let body = `${gameName}`;
  if (gameInfo.place) body += ` - ${gameInfo.place}`;
  body += `\n${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`;
  body += `\n${t('telegram.betCancelledDescription', lang) || 'Bet cancelled because a player in the condition left the game. Money refunded.'}`;

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title,
    body,
    data: { gameId: bet.gameId, shortDayOfWeek: gameInfo.shortDayOfWeek },
    sound: 'default'
  };
}
