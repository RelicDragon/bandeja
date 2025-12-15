import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';

export async function createGameResultsPushNotification(
  gameId: string,
  userId: string,
  isEdited: boolean = false
): Promise<NotificationPayload | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: {
        include: {
          club: true,
        },
      },
      club: true,
      participants: {
        where: { userId, isPlaying: true },
        include: {
          user: {
            select: {
              language: true,
              currentCityId: true,
            },
          },
        },
      },
      outcomes: {
        where: { userId },
      },
    },
  });

  if (!game || game.participants.length === 0 || game.outcomes.length === 0) {
    return null;
  }

  const participant = game.participants[0];
  const userOutcome = game.outcomes[0];
  const lang = participant.user.language || 'en';
  
  const gameName = game.name ? game.name : t(`games.gameTypes.${game.gameType}`, lang);
  const clubName = game.court?.club?.name || game.club?.name;
  
  const titleKey = isEdited ? 'telegram.gameResultsChanged' : 'telegram.gameFinished';
  const title = t(titleKey, lang);
  
  let body = `${gameName}`;
  if (clubName) {
    body += ` - ${clubName}`;
  }
  
  if (userOutcome.position) {
    body += `\n${t('telegram.finalPlace', lang)}: ${userOutcome.position}`;
  }
  
  const levelChangeStr = userOutcome.levelChange > 0
    ? `+${userOutcome.levelChange.toFixed(2)}`
    : userOutcome.levelChange.toFixed(2);
  body += ` | ${t('telegram.level', lang)}: ${levelChangeStr}`;

  return {
    type: NotificationType.GAME_RESULTS,
    title,
    body,
    data: {
      gameId: game.id
    },
    sound: 'default'
  };
}
