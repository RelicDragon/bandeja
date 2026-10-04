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
 * - {@link trackScheduleChangeInTx} wraps any other write that can move the
 *   time — linking, unlinking or re-snapshotting an external booking
 *   (`gameExternalBooking.service.ts`) — so it gets the same reset + notice in
 *   the same transaction as the time write.
 * - Series "this and following" edits pass a batch key
 *   ({@link seriesTimeChangeBatchKey}): the pending notices of that batch are
 *   claimed together and each player gets ONE combined notice.
 *
 * Linked bookings are only ever *read* here: a booker whose booking no longer
 * covers the new time is told so in their notice. Nothing moves or cancels a
 * reservation.
 */
import { NotificationChannelType, Prisma } from '@prisma/client';
import { findLinkedBookingsNeedingAttention } from '@bandeja/shared/gameBooking/evaluateLinkedBookingCoverage';
import prisma from '../../config/database';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
import notificationService from '../notification.service';
import { NotificationPreferenceService } from '../notificationPreference.service';
import telegramNotificationService from '../telegram/notification.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { resolveBooktimeTimezoneForGame } from '../../shared/booktime/resolveClubTimezone';
import { createGameTimeChangedPushNotification } from '../push/notifications/game-time-changed-push.notification';
import {
  emitAttendanceResetForTimeChange,
  resetAttendanceForTimeChangeInTx,
} from '../gameAttendance/attendanceTimeChange';
import {
  classifyScheduleChange,
  evaluateNoticeDelivery,
  type GameSchedule,
  groupBatchNoticeRecipients,
  isBatchDue,
  nextNoticeDueAt,
  type NoticeSkipReason,
  noticeAsksAttendance,
  type ScheduleChange,
  isStaleAttendanceAction,
  seriesIdFromBatchKey,
  timeChangeNoticeRecipients,
} from './timeChangeRules';
import { buildTimeChangeBatchNoticeCopy, buildTimeChangeNoticeCopy } from './timeChangeNoticeCopy';
import { postGameTimeChangedChatLine } from './timeChangeChatLine';

type Tx = Prisma.TransactionClient;

export type RecordScheduleChangeResult = ScheduleChange & {
  attendanceResetCount: number;
};

export async function recordScheduleChangeInTx(
  tx: Tx,
  args: {
    gameId: string;
    entityType: string;
    /** Keeps their own answer and is not notified. Null for a system-driven change. */
    editorUserId: string | null;
    previous: GameSchedule;
    next: GameSchedule;
    /** Group this game's notice with others of one batch (series edit). */
    batchKey?: string | null;
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
      noticeBatchKey: args.batchKey ?? null,
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
        // A single-game edit inside a pending batch stays in the batch.
        ...(args.batchKey ? { noticeBatchKey: args.batchKey } : {}),
        ...resetStamp,
      },
    });
  }

  return { ...change, attendanceResetCount };
}

/**
 * Wraps a write that may move the game's time outside `GameUpdateService`
 * (booking link / unlink / snapshot refresh): locks the `Game` row, runs
 * `write`, then records whatever schedule change it left behind — in the same
 * transaction. A write that leaves the time where it was records nothing.
 */
export async function trackScheduleChangeInTx<T>(
  tx: Tx,
  args: { gameId: string; editorUserId: string | null; batchKey?: string | null; now?: Date },
  write: () => Promise<T>,
): Promise<{ value: T; change: RecordScheduleChangeResult | null }> {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${args.gameId} FOR UPDATE`);
  const before = await tx.game.findUnique({
    where: { id: args.gameId },
    select: { startTime: true, endTime: true, timeIsSet: true, entityType: true },
  });
  const value = await write();
  if (!before) return { value, change: null };
  const after = await tx.game.findUnique({
    where: { id: args.gameId },
    select: { startTime: true, endTime: true, timeIsSet: true },
  });
  if (!after) return { value, change: null };
  const change = await recordScheduleChangeInTx(tx, {
    gameId: args.gameId,
    entityType: before.entityType,
    editorUserId: args.editorUserId,
    previous: { startTime: before.startTime, endTime: before.endTime, timeIsSet: before.timeIsSet },
    next: after,
    batchKey: args.batchKey,
    now: args.now,
  });
  return { value, change };
}

/**
 * Post-commit side of {@link trackScheduleChangeInTx}: refresh open attendance
 * views and post the "Game date/time changed" chat line, as an edit would.
 * Never throws.
 */
export async function publishTrackedScheduleChange(
  gameId: string,
  editorUserId: string | null,
  change: RecordScheduleChangeResult | null,
): Promise<void> {
  if (!change) return;
  if (change.resetAttendance) {
    await emitAttendanceResetForTimeChange(gameId, editorUserId).catch((error) => {
      console.error('[TimeChange] Failed to emit attendance reset', error);
    });
  }
  if (change.timesMoved) {
    await postGameTimeChangedChatLine({ gameId, editorUserId, noticeQueued: change.notice }).catch((error) => {
      console.error('[TimeChange] Failed to post time change chat line', error);
    });
  }
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

/**
 * A combined notice for several games of one batch (series "this and
 * following" edit). `games` are the batch games that passed delivery checks,
 * earliest first; each recipient lists only their own games.
 */
export type TimeChangeBatchNoticeDelivery = {
  batchKey: string;
  seriesId: string | null;
  seriesName: string | null;
  games: {
    game: TimeChangeNoticeGame;
    previousStartTime: Date;
    previousEndTime: Date;
    editorUserId: string | null;
  }[];
  recipients: (TimeChangeNoticeRecipient & { gameIds: string[] })[];
};

export type TimeChangeBatchNoticeDeliverer = (delivery: TimeChangeBatchNoticeDelivery) => Promise<void>;

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

async function deliverBatchOne(
  delivery: TimeChangeBatchNoticeDelivery,
  recipient: TimeChangeBatchNoticeDelivery['recipients'][number],
  timezone: string,
) {
  const mine = delivery.games.filter((entry) => recipient.gameIds.includes(entry.game.id));
  if (mine.length === 0) return;
  if (mine.length === 1) {
    // Plays in one game of the batch only: the regular single-game notice,
    // answer buttons included.
    await deliverOne(mine[0].game, mine[0].previousStartTime, recipient, timezone);
    return;
  }
  const lead = mine[0].game;
  const copy = await buildTimeChangeBatchNoticeCopy({
    entityType: lead.entityType,
    seriesName: delivery.seriesName,
    games: mine.map((entry) => ({
      startTime: entry.game.startTime,
      endTime: entry.game.endTime,
      previousStartTime: entry.previousStartTime,
    })),
    club: lead.club,
    court: lead.court,
    timezone,
    lang: recipient.language,
    asksAttendance: recipient.asksAttendance,
    bookingNeedsAttention: recipient.bookingNeedsAttention,
  });
  const gameIds = mine.map((entry) => entry.game.id);

  try {
    await notificationService.sendNotification({
      userId: recipient.userId,
      type: NotificationType.GAME_TIME_CHANGED,
      payload: createGameTimeChangedPushNotification(lead.id, lead.entityType, copy, {
        batchKey: delivery.batchKey,
        seriesId: delivery.seriesId,
        gameIds,
      }),
      channels: [NotificationChannelType.PUSH],
    });
  } catch (error) {
    console.error(`[TimeChange] Batch push failed for user ${recipient.userId}:`, error);
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
      gameId: lead.id,
      copy,
      asksAttendance: recipient.asksAttendance,
      batch: { seriesId: delivery.seriesId, gameCount: gameIds.length },
    });
  } catch (error) {
    console.error(`[TimeChange] Batch Telegram failed for user ${recipient.userId}:`, error);
  }
}

/** Default batch deliverer: one push + one Telegram message per player. */
export const deliverTimeChangeBatchNotice: TimeChangeBatchNoticeDeliverer = async (delivery) => {
  const timezone = await getUserTimezoneFromCityId(delivery.games[0]?.game.cityId ?? null);
  for (const recipient of delivery.recipients) {
    await deliverBatchOne(delivery, recipient, timezone);
  }
};

export type TimeChangeNoticeSweepResult = {
  /** Games whose pending notice was claimed (a batch counts each game). */
  claimed: number;
  /** Notices handed to a deliverer (a combined batch notice counts once). */
  sent: number;
  /** Combined batch notices among `sent`. */
  batchesSent: number;
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

type GameTimeChangeRow = Awaited<ReturnType<typeof prisma.gameTimeChange.findMany>>[number];

class BatchClaimLost extends Error {}

const CLAIM_DATA = {
  noticeDueAt: null,
  pendingSince: null,
  noticeBatchKey: null,
  version: { increment: 1 },
} satisfies Prisma.GameTimeChangeUpdateManyMutationInput;

function countSkip(result: TimeChangeNoticeSweepResult, reason: NoticeSkipReason | 'no-recipients') {
  result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
}

/**
 * Revalidate one claimed row against the game as it is now. When it is still
 * worth sending, the announced schedule becomes the current one.
 */
async function settleClaimedRow(
  row: GameTimeChangeRow,
  now: Date,
  result: TimeChangeNoticeSweepResult,
): Promise<{ game: TimeChangeNoticeGame; previousStartTime: Date; previousEndTime: Date } | null> {
  const game = await prisma.game.findUnique({
    where: { id: row.gameId },
    select: NOTICE_GAME_SELECT,
  });
  if (!game || !row.previousStartTime || !row.previousEndTime) return null;
  const previousStartTime = row.previousStartTime;
  const previousEndTime = row.previousEndTime;

  const verdict = evaluateNoticeDelivery(
    game,
    { startTime: previousStartTime, endTime: previousEndTime },
    now,
  );
  if (!verdict.send) {
    countSkip(result, verdict.reason);
    return null;
  }

  // The announced schedule is now the current one, whoever was told.
  await prisma.gameTimeChange.update({
    where: { gameId: row.gameId },
    data: {
      previousStartTime: game.startTime,
      previousEndTime: game.endTime,
      lastNoticeSentAt: now,
    },
  });
  return { game, previousStartTime, previousEndTime };
}

async function recipientsForGame(
  game: TimeChangeNoticeGame,
  editorUserId: string | null,
): Promise<TimeChangeNoticeRecipient[]> {
  const bookers = await bookersNeedingAttention(game);
  return timeChangeNoticeRecipients(game.participants, editorUserId).map((p) => ({
    userId: p.userId,
    language: p.user.language || 'en',
    telegramId: p.user.telegramId ?? null,
    asksAttendance: noticeAsksAttendance(p),
    bookingNeedsAttention: bookers.has(p.userId),
  }));
}

async function sendSingle(
  settled: { game: TimeChangeNoticeGame; previousStartTime: Date; previousEndTime: Date },
  editorUserId: string | null,
  deliver: TimeChangeNoticeDeliverer,
  result: TimeChangeNoticeSweepResult,
) {
  const recipients = await recipientsForGame(settled.game, editorUserId);
  if (recipients.length === 0) {
    countSkip(result, 'no-recipients');
    return;
  }
  try {
    await deliver({ ...settled, editorUserId, recipients });
    result.sent += 1;
  } catch (error) {
    // No retry: the notice is a courtesy, and a half-delivered fan-out must
    // never be replayed to the players who already got it.
    console.error(`[TimeChange] Delivery failed for game ${settled.game.id}:`, error);
  }
}

/**
 * Claims every pending member of a batch at once (all or nothing, each by its
 * own `version`), then sends one combined notice per player. Returns without
 * claiming while any member is still inside its quiet window.
 */
async function sweepBatch(
  batchKey: string,
  now: Date,
  deliver: TimeChangeNoticeDeliverer,
  deliverBatch: TimeChangeBatchNoticeDeliverer,
  result: TimeChangeNoticeSweepResult,
) {
  const members = await prisma.gameTimeChange.findMany({
    where: { noticeBatchKey: batchKey, noticeDueAt: { not: null } },
    orderBy: { gameId: 'asc' },
  });
  if (!isBatchDue(members, now)) return;

  const claimed = await prisma
    .$transaction(async (tx) => {
      for (const member of members) {
        const claim = await tx.gameTimeChange.updateMany({
          where: { gameId: member.gameId, version: member.version, noticeDueAt: { not: null } },
          data: CLAIM_DATA,
        });
        if (claim.count === 0) throw new BatchClaimLost();
      }
      return true;
    })
    .catch((error) => {
      // A concurrent edit (its later due time wins) or a second sweeper.
      if (error instanceof BatchClaimLost) return false;
      throw error;
    });
  if (!claimed) return;
  result.claimed += members.length;

  const settled: TimeChangeBatchNoticeDelivery['games'] = [];
  for (const member of members) {
    const entry = await settleClaimedRow(member, now, result);
    if (entry) settled.push({ ...entry, editorUserId: member.editorUserId });
  }
  settled.sort((a, b) => a.game.startTime.getTime() - b.game.startTime.getTime());
  if (settled.length === 0) return;
  if (settled.length === 1) {
    await sendSingle(settled[0], settled[0].editorUserId, deliver, result);
    return;
  }

  const bookersByGame = new Map<string, Set<string>>();
  for (const entry of settled) bookersByGame.set(entry.game.id, await bookersNeedingAttention(entry.game));
  const grouped = groupBatchNoticeRecipients(
    settled.map((entry) => ({
      gameId: entry.game.id,
      startTime: entry.game.startTime,
      editorUserId: entry.editorUserId,
      roster: entry.game.participants,
    })),
  );
  if (grouped.length === 0) {
    countSkip(result, 'no-recipients');
    return;
  }
  const recipients = grouped.map((entry) => {
    const rows = entry.gameIds.map((id) => entry.rows[id]);
    return {
      userId: entry.userId,
      language: rows[0].user.language || 'en',
      telegramId: rows[0].user.telegramId ?? null,
      gameIds: entry.gameIds,
      asksAttendance: rows.some((row) => noticeAsksAttendance(row)),
      bookingNeedsAttention: entry.gameIds.some((id) => bookersByGame.get(id)?.has(entry.userId)),
    };
  });

  const seriesId = seriesIdFromBatchKey(batchKey);
  const series = seriesId
    ? await prisma.gameSeries.findUnique({ where: { id: seriesId }, select: { name: true } })
    : null;

  try {
    await deliverBatch({
      batchKey,
      seriesId,
      seriesName: series?.name ?? null,
      games: settled,
      recipients,
    });
    result.sent += 1;
    result.batchesSent += 1;
  } catch (error) {
    console.error(`[TimeChange] Batch delivery failed for ${batchKey}:`, error);
  }
}

export async function runTimeChangeNoticeSweep(
  options: {
    now?: Date;
    deliver?: TimeChangeNoticeDeliverer;
    deliverBatch?: TimeChangeBatchNoticeDeliverer;
    limit?: number;
  } = {},
): Promise<TimeChangeNoticeSweepResult> {
  const now = options.now ?? new Date();
  const deliver = options.deliver ?? deliverTimeChangeNotice;
  const deliverBatch = options.deliverBatch ?? deliverTimeChangeBatchNotice;
  const result: TimeChangeNoticeSweepResult = { claimed: 0, sent: 0, batchesSent: 0, skipped: {} };

  const due = await prisma.gameTimeChange.findMany({
    where: { noticeDueAt: { lte: now } },
    orderBy: { noticeDueAt: 'asc' },
    take: options.limit ?? 50,
  });

  const seenBatches = new Set<string>();
  for (const row of due) {
    if (row.noticeBatchKey) {
      if (seenBatches.has(row.noticeBatchKey)) continue;
      seenBatches.add(row.noticeBatchKey);
      await sweepBatch(row.noticeBatchKey, now, deliver, deliverBatch, result);
      continue;
    }

    // Claim: a concurrent edit bumps `version`, so its later due time wins; a
    // second sweeper sees count 0 and moves on.
    const claim = await prisma.gameTimeChange.updateMany({
      where: { gameId: row.gameId, version: row.version, noticeDueAt: { not: null } },
      data: CLAIM_DATA,
    });
    if (claim.count === 0) continue;
    result.claimed += 1;

    const settled = await settleClaimedRow(row, now, result);
    if (!settled) continue;
    await sendSingle(settled, row.editorUserId, deliver, result);
  }

  return result;
}
