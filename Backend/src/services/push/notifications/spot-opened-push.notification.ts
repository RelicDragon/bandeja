import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import {
  formatGameContextHeader,
  formatGameInfoForUserWithTimezone,
  type GameInfo,
} from '../../shared/notification-base';

export interface SpotOpenedPushRecipient {
  id: string;
  language?: string | null;
  currentCityId?: string | null;
}

export interface SpotOpenedPushOptions {
  /** 1-based queue position, when the recipient is queued. */
  queuePosition?: number | null;
  /** Level range line, e.g. "3.5–4.5". Omitted when the game has no range. */
  levelRange?: string | null;
  /** Display name of a PLAYING participant the recipient follows. */
  followedUserName?: string | null;
  /** ISO timestamp of the seat-opened event. */
  spotOpenedAt: string;
}

/**
 * PRD 347 — "A spot just opened" push.
 *
 * Two shapes share one builder because the body is identical apart from the
 * lead line: the queue/intent copy leads with the game, the follower copy leads
 * with the person the recipient follows.
 */
export async function createSpotOpenedPushNotification(
  game: GameInfo,
  recipient: SpotOpenedPushRecipient,
  options: SpotOpenedPushOptions,
): Promise<NotificationPayload | null> {
  if (!game || !recipient) return null;

  const lang = recipient.language || 'en';
  const { gameInfo } = await formatGameInfoForUserWithTimezone(
    game,
    recipient.currentCityId ?? null,
    lang,
  );

  const isFollower = Boolean(options.followedUserName);
  const header = formatGameContextHeader(gameInfo, { includeDuration: false });
  const bodyParts = [header];
  if (options.levelRange) {
    bodyParts.push(t('spotOpened.levelLine', lang).replace('{{range}}', options.levelRange));
  }
  if (options.queuePosition && options.queuePosition > 0) {
    bodyParts.push(
      t('spotOpened.queuePositionLine', lang).replace(
        '{{position}}',
        String(options.queuePosition),
      ),
    );
  }

  const title = isFollower
    ? t('spotOpened.followerPushTitle', lang).replace(
        '{{name}}',
        options.followedUserName ?? '',
      )
    : t('spotOpened.pushTitle', lang);

  return {
    type: isFollower
      ? NotificationType.FOLLOWED_GAME_SPOT_OPENED
      : NotificationType.GAME_SPOT_OPENED,
    title,
    body: bodyParts.filter(Boolean).join(' · '),
    data: {
      gameId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
      spotOpenedAt: options.spotOpenedAt,
    },
    sound: 'default',
  };
}

/** PRD 347 — "You're in!" push for the player auto-fill just seated. */
export async function createSeatedFromQueuePushNotification(
  game: GameInfo,
  recipient: SpotOpenedPushRecipient,
): Promise<NotificationPayload | null> {
  if (!game || !recipient) return null;

  const lang = recipient.language || 'en';
  const { gameInfo } = await formatGameInfoForUserWithTimezone(
    game,
    recipient.currentCityId ?? null,
    lang,
  );

  return {
    type: NotificationType.GAME_SPOT_OPENED,
    title: t('spotOpened.seatedPushTitle', lang),
    body: formatGameContextHeader(gameInfo, { includeDuration: false }),
    data: {
      gameId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
      seatedFromQueue: '1',
    },
    sound: 'default',
  };
}
