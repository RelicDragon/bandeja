import prisma from '../../config/database';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType } from '../../utils/systemMessages';
import notificationService from '../notification.service';

/** Minimal game shape needed for system-message push/Telegram headers. */
export type GameForBookingStatusNotify = {
  id: string;
  bookingStatus: string;
  entityType?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  timeIsSet?: boolean | null;
  name?: string | null;
  description?: string | null;
  club?: { name: string } | null;
  court?: { name?: string | null; club?: { name: string } | null } | null;
};

const GAME_FOR_BOOKING_NOTIFY_SELECT = {
  id: true,
  bookingStatus: true,
  entityType: true,
  startTime: true,
  endTime: true,
  timeIsSet: true,
  name: true,
  description: true,
  club: { select: { name: true } },
  court: { select: { name: true, club: { select: { name: true } } } },
} as const;

async function loadGameForBookingStatusNotify(
  gameId: string,
): Promise<GameForBookingStatusNotify | null> {
  return prisma.game.findUnique({
    where: { id: gameId },
    select: GAME_FOR_BOOKING_NOTIFY_SELECT,
  });
}

/**
 * Creates a chat system message + push/Telegram when bookingStatus changed.
 * Pass `knownGame` (e.g. already-loaded update result) to skip the DB round-trip.
 */
export async function notifyGameBookingStatusChangeIfNeeded(
  gameId: string,
  previousBookingStatus: string | null | undefined,
  knownGame?: GameForBookingStatusNotify | null,
): Promise<void> {
  if (knownGame && previousBookingStatus === knownGame.bookingStatus) {
    return;
  }

  const game = knownGame ?? (await loadGameForBookingStatusNotify(gameId));
  if (!game) return;
  if (previousBookingStatus === game.bookingStatus) return;

  try {
    const systemMessage = await createSystemMessage(gameId, {
      type: SystemMessageType.GAME_BOOKING_STATUS_CHANGED,
      variables: { bookingStatus: String(game.bookingStatus) },
    });

    if (!systemMessage) return;

    notificationService.sendGameSystemMessageNotification(systemMessage, game).catch((error) => {
      console.error('Failed to send notifications for booking status change:', error);
    });
  } catch (error) {
    console.error('Failed to create system message for booking status change:', error);
  }
}
