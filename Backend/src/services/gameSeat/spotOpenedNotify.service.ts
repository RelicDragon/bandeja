import { ParticipantStatus, SpotOpenedKind } from '@prisma/client';
import prisma from '../../config/database';
import { NotificationType } from '../../types/notifications.types';
import notificationService from '../notification.service';
import { canMutateGameRoster } from '@bandeja/shared/gameMutationLock';
import {
  createSeatedFromQueuePushNotification,
  createSpotOpenedPushNotification,
} from '../push/notifications/spot-opened-push.notification';
import {
  claimSpotOpenedDelivery,
  releaseSpotOpenedDelivery,
  sendWithBackoff,
} from './spotOpenedDelivery.service';
import { formatLevelRange } from './spotOpenedNotifyCopy';
import type { GameInfo } from '../shared/notification-base';
import type { SeatGame } from './gameSeat.service';

export interface SpotOpenedNotifyRecipient {
  userId: string;
  kind: SpotOpenedKind;
  /** 1-based, queue recipients only. */
  queuePosition: number | null;
  /** Follower recipients only. */
  followedUserName: string | null;
}

export interface NotifySpotOpenedInput {
  game: SeatGame;
  dayKey: string;
  spotOpenedAt: string;
  recipients: SpotOpenedNotifyRecipient[];
}

/**
 * Prisma hands back `null` for absent relations; `GameInfo` models them as
 * optional. One explicit mapper beats `any` at every call site.
 */
function toGameInfo(game: SeatGame): GameInfo {
  return {
    id: game.id,
    startTime: game.startTime,
    endTime: game.endTime,
    timeIsSet: game.timeIsSet,
    club: game.club ?? undefined,
    court: game.court ? { club: game.court.club ?? undefined } : undefined,
    name: game.name,
    description: game.description,
    entityType: game.entityType,
  };
}

/**
 * PRD 347 — fan out the spot-opened notification.
 *
 * Per recipient: claim the persisted dedupe row first, revalidate that the seat
 * is still open and the recipient is still eligible, then send with backoff.
 * A transient failure releases the claim so the next seat-opened event retries;
 * a permanent one keeps it so we stop shouting into the void.
 */
export async function notifySpotOpened(input: NotifySpotOpenedInput): Promise<void> {
  const { game, dayKey, spotOpenedAt } = input;
  const gameInfo = toGameInfo(game);
  const levelRange = formatLevelRange(game.minLevel, game.maxLevel);

  for (const recipient of input.recipients) {
    const key = {
      userId: recipient.userId,
      gameId: game.id,
      dayKey,
      kind: recipient.kind,
    };

    let claimed = false;
    try {
      claimed = await claimSpotOpenedDelivery(key);
    } catch (error) {
      console.error('[spotOpened] failed to claim delivery', { key, error });
      continue;
    }
    if (!claimed) continue;

    const outcome = await sendWithBackoff(async () => {
      if (!(await seatIsStillOpen(game.id))) return { delivered: false, permanent: true };

      const user = await prisma.user.findUnique({
        where: { id: recipient.userId },
        select: { id: true, language: true, currentCityId: true },
      });
      if (!user) return { delivered: false, permanent: true };

      const payload = await createSpotOpenedPushNotification(gameInfo, user, {
        queuePosition: recipient.queuePosition,
        levelRange,
        followedUserName:
          recipient.kind === SpotOpenedKind.FOLLOWER ? recipient.followedUserName : null,
        spotOpenedAt,
      });
      if (!payload) return { delivered: false, permanent: true };

      const result = await notificationService.sendNotification({
        userId: recipient.userId,
        type:
          recipient.kind === SpotOpenedKind.FOLLOWER
            ? NotificationType.FOLLOWED_GAME_SPOT_OPENED
            : NotificationType.GAME_SPOT_OPENED,
        payload,
      });
      // Both channels declining means preferences are off or no channel is
      // linked — permanent for this event, and the claim row correctly keeps
      // us from re-trying it all day.
      const delivered = result.push || result.telegram;
      return { delivered, permanent: !delivered };
    });

    if (!outcome.delivered && !outcome.permanent) {
      await releaseSpotOpenedDelivery(key);
    }
  }
}

/** PRD 347 — "You're in!" for the player auto-fill just seated. */
export async function notifySeatedFromQueue(
  game: SeatGame,
  userId: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, language: true, currentCityId: true },
    });
    if (!user) return;

    const payload = await createSeatedFromQueuePushNotification(toGameInfo(game), user);
    if (!payload) return;

    await notificationService.sendNotification({
      userId,
      type: NotificationType.GAME_SPOT_OPENED,
      payload,
    });
  } catch (error) {
    console.error('[spotOpened] failed to notify auto-filled player', { userId, error });
  }
}

/** Revalidation before every send attempt — the seat may already be gone. */
async function seatIsStillOpen(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, resultsStatus: true, maxParticipants: true },
  });
  if (!game) return false;
  if (!canMutateGameRoster(game)) return false;
  const playing = await prisma.gameParticipant.count({
    where: { gameId, status: ParticipantStatus.PLAYING },
  });
  return (game.maxParticipants || 0) - playing > 0;
}
