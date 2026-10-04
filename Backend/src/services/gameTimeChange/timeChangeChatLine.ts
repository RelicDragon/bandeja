/**
 * Time change — the "Game date/time changed to …" chat line.
 *
 * Shared by the game edit (`GameUpdateService.updateGame`) and every other
 * write that moves the time (booking link / unlink, see
 * `publishTrackedScheduleChange`), so players read the same record whichever
 * path moved the game.
 *
 * The chat line stays the record for everyone. Its push/Telegram skips the
 * editor, and — when the coalesced "time changed" notice is queued — the
 * PLAYING players, who get that one notice instead of one ping per edit.
 */
import prisma from '../../config/database';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType } from '../../utils/systemMessages';
import notificationService from '../notification.service';
import {
  formatDateInTimezone,
  getDateLabelInTimezone,
  getUserTimezoneFromCityId,
} from '../user-timezone.service';

export type TimeChangeChatLineGame = {
  id: string;
  entityType: string;
  cityId: string | null;
  startTime: Date;
  participants: readonly { userId: string; status: string; role?: string | null }[];
};

/**
 * Loaded for a booking-driven change, with what the chat push/Telegram format
 * needs (times, place, name). A game without a real time gets no line.
 */
async function loadGameForChatLine(gameId: string): Promise<TimeChangeChatLineGame | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: { select: { userId: true, status: true, role: true } },
      club: true,
      court: { include: { club: true } },
    },
  });
  if (!game || !game.timeIsSet) return null;
  return game;
}

export async function postGameTimeChangedChatLine(args: {
  gameId: string;
  /** Null for a system-driven change: the line is written in the owner's language. */
  editorUserId: string | null;
  noticeQueued: boolean;
  /** Already-loaded game (the edit path has one); loaded when omitted. */
  game?: TimeChangeChatLineGame;
}): Promise<void> {
  const game = args.game ?? (await loadGameForChatLine(args.gameId));
  if (!game) return;

  const voiceUserId =
    args.editorUserId ?? game.participants.find((p) => p.role === 'OWNER')?.userId ?? null;
  const voice = voiceUserId
    ? await prisma.user.findUnique({ where: { id: voiceUserId }, select: { language: true } })
    : null;
  const lang = voice?.language || 'en';
  // The game's own city: "changed to 18:00" means 18:00 where the game is
  // played, not in the editor's home city.
  const timezone = await getUserTimezoneFromCityId(game.cityId ?? null);
  const dateLabel = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const timeStr = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);

  const systemMessage = await createSystemMessage(game.id, {
    type: SystemMessageType.GAME_DATE_TIME_CHANGED,
    variables: { dateTime: `${dateLabel} ${timeStr}` },
  });

  const excludeUserIds: string[] = args.editorUserId ? [args.editorUserId] : [];
  if (args.noticeQueued) {
    for (const participant of game.participants) {
      if (participant.status === 'PLAYING') excludeUserIds.push(participant.userId);
    }
  }

  notificationService
    .sendGameSystemMessageNotification(systemMessage, game, excludeUserIds)
    .catch((error) => {
      console.error('[TimeChange] Failed to send notification for date/time change:', error);
    });
}
