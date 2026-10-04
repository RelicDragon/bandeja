/**
 * Time change.
 * The owner is authoritative over the schedule: there is no proposal or
 * reconfirmation flow. An owner/admin edit simply *is* the new time.
 *
 * Hooked into the shared edit path (`GameUpdateService.updateGame`), so every
 * caller of it — the game page, league fixture edits, series "this and
 * following" edits, club admin, and the AI agent's update/reschedule tools —
 * gets the same behaviour without knowing about it.
 *
 * - {@link recordScheduleChangeInTx} runs inside the update transaction (which
 *   holds the `Game` row lock): resets attendance, stamps `attendanceResetAt`
 *   (so attendance buttons sent for the old time stop working) and
 *   queues/refreshes the one pending notice per game.
 * - {@link runTimeChangeNoticeSweep} delivers notices whose quiet window has
 *   closed. Delivery is claimed by `version` (restart- and multi-instance-safe)
 *   and revalidated against the game as it is *now*, so a burst of edits sends
 *   one notice with the final time, and a reverted edit sends nothing.
 *
 * Linked bookings are only ever *read* here: a booker whose booking no longer
 * covers the new time is told so in their notice. Nothing moves or cancels a
 * reservation.
 */
import { NotificationChannelType, type Prisma } from '@prisma/client';
import { findLinkedBookingsNeedingAttention } from '@bandeja/shared/gameBooking/evaluateLinkedBookingCoverage';
import prisma from '../../config/database';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
import notificationService from '../notification.service';
import { NotificationPreferenceService } from '../notificationPreference.service';
import telegramNotificationService from '../telegram/notification.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { resolveBooktimeTimezoneForGame } from '../../shared/booktime/resolveClubTimezone';
import { createGameTimeChangedPushNotification } from '../push/notifications/game-time-changed-push.notification';
import { resetAttendanceForTimeChangeInTx } from '../gameAttendance/attendanceTimeChange';
import {
  classifyScheduleChange,
  evaluateNoticeDelivery,
  type GameSchedule,
  nextNoticeDueAt,
  type NoticeSkipReason,
  noticeAsksAttendance,
  type ScheduleChange,
  isStaleAttendanceAction,
  timeChangeNoticeRecipients,
} from './timeChangeRules';
import { buildTimeChangeNoticeCopy } from './timeChangeNoticeCopy';

type Tx = Prisma.TransactionClient;

export type RecordScheduleChangeResult = ScheduleChange & {
  attendanceResetCount: number;
};

export async function recordScheduleChangeInTx(
  tx: Tx,
  args: {
    gameId: string;
    entityType: string;
    editorUserId: string;
    previous: GameSchedule;
    next: GameSchedule;
    now?: Date;
  },
): Promise<RecordScheduleChangeResult> {
  const now = args.now ?? new Date();
  const change = classifyScheduleChange(args.previous, args.next, args.entityType);

  const attendanceResetCount = change.resetAttendance
    ? await resetAttendanceForTimeChangeInTx(tx, {
        gameId: args.gameId,
        entityType: args.entityType,
        keepUserId: args.editorUserId,
      })
    : 0;

  if (!change.resetAttendance && !change.notice) {
    return { ...change, attendanceResetCount };
  }

  const existing = await tx.gameTimeChange.findUnique({
    where: { gameId: args.gameId },
    select: { noticeDueAt: true, pendingSince: true },
  });
  const resetStamp = change.resetAttendance ? { attendanceResetAt: now } : {};

  if (!change.notice) {
    await tx.gameTimeChange.upsert({
      where: { gameId: args.gameId },
      create: { gameId: args.gameId, ...resetStamp },
      update: resetStamp,
    });
  } else if (!existing || existing.noticeDueAt === null) {
    // A fresh burst: remember what players were last told.
    const fresh = {
      editorUserId: args.editorUserId,
      previousStartTime: args.previous.startTime,
      previousEndTime: args.previous.endTime,
      pendingSince: now,
      noticeDueAt: nextNoticeDueAt(now, now),
      ...resetStamp,
    };
    await tx.gameTimeChange.upsert({
      where: { gameId: args.gameId },
      create: { gameId: args.gameId, ...fresh, version: 1 },
      update: { ...fresh, version: { increment: 1 } },
    });
  } else {
    // Still inside the burst: keep the announced schedule, slide the window.
    await tx.gameTimeChange.update({
      where: { gameId: args.gameId },
      data: {
        editorUserId: args.editorUserId,
        noticeDueAt: nextNoticeDueAt(existing.pendingSince ?? now, now),
        version: { increment: 1 },
        ...resetStamp,
      },
    });
  }

  return { ...change, attendanceResetCount };
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

const NOTICE_GAME_SELECT = {
  id: true,
  entityType: true,
  status: true,
  resultsStatus: true,
  timeIsSet: true,
  startTime: true,
  endTime: true,
  cityId: true,
  club: { select: { name: true } },
  court: { select: { club: { select: { name: true } } } },
  participants: {
    select: {
      userId: true,
      status: true,
      role: true,
      user: { select: { id: true, language: true, telegramId: true } },
    },
  },
  externalBookings: {
    orderBy: { createdAt: 'asc' as const },
    select: { bookingStart: true, bookingEnd: true, bookedByUserId: true },
  },
} satisfies Prisma.GameSelect;

export type TimeChangeNoticeGame = Prisma.GameGetPayload<{ select: typeof NOTICE_GAME_SELECT }>;

export type TimeChangeNoticeRecipient = {
  userId: string;
  language: string;
  telegramId: string | null;
  asksAttendance: boolean;
  bookingNeedsAttention: boolean;
};

export type TimeChangeNoticeDelivery = {
  game: TimeChangeNoticeGame;
  previousStartTime: Date;
  previousEndTime: Date;
  editorUserId: string | null;
  recipients: TimeChangeNoticeRecipient[];
};

export type TimeChangeNoticeDeliverer = (delivery: TimeChangeNoticeDelivery) => Promise<void>;

/** Bookers (by user id) of linked bookings that no longer cover the game. */
export async function bookersNeedingAttention(game: TimeChangeNoticeGame): Promise<Set<string>> {
  const bookings = game.externalBookings;
  if (bookings.length === 0) return new Set();
  const timeZone = await resolveBooktimeTimezoneForGame(game.id);
  const flagged = findLinkedBookingsNeedingAttention(
    bookings.map((row) => ({
      bookingStart: row.bookingStart?.toISOString() ?? null,
      bookingEnd: row.bookingEnd?.toISOString() ?? null,
    })),
    { startTime: game.startTime.toISOString(), endTime: game.endTime.toISOString() },
    { timeZone },
  );
  const out = new Set<string>();
  for (const index of flagged) {
    const booker = bookings[index]?.bookedByUserId;
    if (booker) out.add(booker);
  }
  return out;
}

async function deliverOne(game: TimeChangeNoticeGame, previousStartTime: Date, recipient: TimeChangeNoticeRecipient, timezone: string) {
  const copy = await buildTimeChangeNoticeCopy({
    entityType: game.entityType,
    startTime: game.startTime,
    endTime: game.endTime,
    previousStartTime,
    club: game.club,
    court: game.court,
    timezone,
    lang: recipient.language,
    asksAttendance: recipient.asksAttendance,
    bookingNeedsAttention: recipient.bookingNeedsAttention,
  });

  try {
    await notificationService.sendNotification({
      userId: recipient.userId,
      type: NotificationType.GAME_TIME_CHANGED,
      payload: createGameTimeChangedPushNotification(game.id, game.entityType, copy),
      channels: [NotificationChannelType.PUSH],
    });
  } catch (error) {
    console.error(`[TimeChange] Push failed for user ${recipient.userId}:`, error);
  }

  if (!recipient.telegramId) return;
  try {
    const allowed = await NotificationPreferenceService.doesUserAllow(
      recipient.userId,
      NotificationChannelType.TELEGRAM,
      PreferenceKey.SEND_REMINDERS,
    );
    if (!allowed) return;
    await telegramNotificationService.sendGameTimeChangedNotification({
      userId: recipient.userId,
      telegramId: recipient.telegramId,
      language: recipient.language,
      gameId: game.id,
      copy,
      asksAttendance: recipient.asksAttendance,
    });
  } catch (error) {
    console.error(`[TimeChange] Telegram failed for user ${recipient.userId}:`, error);
  }
}

/** Default deliverer: push (per-type preference) + Telegram (`sendReminders`). */
export const deliverTimeChangeNotice: TimeChangeNoticeDeliverer = async (delivery) => {
  const timezone = await getUserTimezoneFromCityId(delivery.game.cityId ?? null);
  for (const recipient of delivery.recipients) {
    await deliverOne(delivery.game, delivery.previousStartTime, recipient, timezone);
  }
};

export type TimeChangeNoticeSweepResult = {
  claimed: number;
  sent: number;
  skipped: Partial<Record<NoticeSkipReason | 'no-recipients', number>>;
};

/**
 * `true` when an attendance action (push token / Telegram button) was issued
 * before the game's last schedule change: it answers for the old time.
 */
export async function attendanceActionPredatesTimeChange(
  gameId: string,
  issuedAt: Date | null | undefined,
): Promise<boolean> {
  if (!issuedAt) return false;
  const row = await prisma.gameTimeChange.findUnique({
    where: { gameId },
    select: { attendanceResetAt: true },
  });
  return isStaleAttendanceAction(issuedAt, row?.attendanceResetAt ?? null);
}

export async function runTimeChangeNoticeSweep(
  options: { now?: Date; deliver?: TimeChangeNoticeDeliverer; limit?: number } = {},
): Promise<TimeChangeNoticeSweepResult> {
  const now = options.now ?? new Date();
  const deliver = options.deliver ?? deliverTimeChangeNotice;
  const result: TimeChangeNoticeSweepResult = { claimed: 0, sent: 0, skipped: {} };

  const due = await prisma.gameTimeChange.findMany({
    where: { noticeDueAt: { lte: now } },
    orderBy: { noticeDueAt: 'asc' },
    take: options.limit ?? 50,
  });

  for (const row of due) {
    // Claim: a concurrent edit bumps `version`, so its later due time wins; a
    // second sweeper sees count 0 and moves on.
    const claim = await prisma.gameTimeChange.updateMany({
      where: { gameId: row.gameId, version: row.version, noticeDueAt: { not: null } },
      data: { noticeDueAt: null, pendingSince: null, version: { increment: 1 } },
    });
    if (claim.count === 0) continue;
    result.claimed += 1;

    const game = await prisma.game.findUnique({
      where: { id: row.gameId },
      select: NOTICE_GAME_SELECT,
    });
    if (!game || !row.previousStartTime || !row.previousEndTime) continue;
    const previousStartTime = row.previousStartTime;
    const previousEndTime = row.previousEndTime;

    const verdict = evaluateNoticeDelivery(
      game,
      { startTime: previousStartTime, endTime: previousEndTime },
      now,
    );
    if (!verdict.send) {
      result.skipped[verdict.reason] = (result.skipped[verdict.reason] ?? 0) + 1;
      continue;
    }

    const bookers = await bookersNeedingAttention(game);
    const recipients = timeChangeNoticeRecipients(game.participants, row.editorUserId).map((p) => ({
      userId: p.userId,
      language: p.user.language || 'en',
      telegramId: p.user.telegramId ?? null,
      asksAttendance: noticeAsksAttendance(p),
      bookingNeedsAttention: bookers.has(p.userId),
    }));

    // The announced schedule is now the current one, whoever was told.
    await prisma.gameTimeChange.update({
      where: { gameId: row.gameId },
      data: {
        previousStartTime: game.startTime,
        previousEndTime: game.endTime,
        lastNoticeSentAt: now,
      },
    });

    if (recipients.length === 0) {
      result.skipped['no-recipients'] = (result.skipped['no-recipients'] ?? 0) + 1;
      continue;
    }

    try {
      await deliver({
        game,
        previousStartTime,
        previousEndTime,
        editorUserId: row.editorUserId,
        recipients,
      });
      result.sent += 1;
    } catch (error) {
      // No retry: the notice is a courtesy, and a half-delivered fan-out must
      // never be replayed to the players who already got it.
      console.error(`[TimeChange] Delivery failed for game ${row.gameId}:`, error);
    }
  }

  return result;
}
