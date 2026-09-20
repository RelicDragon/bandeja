/**
 * PRD 346 — informational attendance counters on `UserSportProfile`.
 *
 * `attendedCount` / `noShowCount` are a **cache of a derivable query**, not a
 * running tally: every hook point recomputes them from `GameParticipant`. That
 * makes the FINAL/FINISHED hook naturally idempotent (a game re-finalized, or a
 * scheduler tick that runs twice, cannot double-count) and self-healing.
 *
 * These numbers never feed `level`, `reliability` or `ratingUncertainty`, and no
 * `LevelChangeEvent` is ever written from here.
 */
import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import {
  ATTENDANCE_RATE_MIN_SAMPLE,
  attendanceRateWindowStart,
  computeAttendanceRate,
} from './attendanceRules';

/** A game counts once it is genuinely over — either scored, or clock-finished. */
const FINISHED_GAME_FILTER: Prisma.GameWhereInput = {
  OR: [{ resultsStatus: 'FINAL' }, { status: { in: ['FINISHED', 'ARCHIVED'] } }],
};

export type AttendanceCounterTarget = { userId: string; sport: Sport };

export type AttendanceCounterTotals = { attendedCount: number; noShowCount: number };

type CounterDb = Pick<typeof prisma, 'gameParticipant' | 'userSportProfile'>;

function attendedWhere(
  userId: string,
  sport: Sport,
  since?: Date,
): Prisma.GameParticipantWhereInput {
  return {
    userId,
    status: 'PLAYING',
    attendance: 'CONFIRMED',
    noShowNotedAt: null,
    game: {
      sport,
      ...FINISHED_GAME_FILTER,
      ...(since ? { startTime: { gte: since } } : {}),
    },
  };
}

function noShowWhere(
  userId: string,
  sport: Sport,
  since?: Date,
): Prisma.GameParticipantWhereInput {
  return {
    userId,
    status: 'PLAYING',
    noShowNotedAt: { not: null },
    game: {
      sport,
      ...FINISHED_GAME_FILTER,
      ...(since ? { startTime: { gte: since } } : {}),
    },
  };
}

/** Lifetime totals straight from the participant rows. */
export async function computeAttendanceTotals(
  userId: string,
  sport: Sport,
  db: CounterDb = prisma,
  since?: Date,
): Promise<AttendanceCounterTotals> {
  const [attendedCount, noShowCount] = await Promise.all([
    db.gameParticipant.count({ where: attendedWhere(userId, sport, since) }),
    db.gameParticipant.count({ where: noShowWhere(userId, sport, since) }),
  ]);
  return { attendedCount, noShowCount };
}

/**
 * Recomputes and stores the counters for the given (user, sport) pairs.
 *
 * Only ever writes `attendedCount` / `noShowCount`; the profile row is created
 * with Prisma defaults if it does not exist yet, exactly like the rest of the
 * codebase does for a sport a user has just played.
 */
export async function refreshAttendanceCounters(
  targets: readonly AttendanceCounterTarget[],
  db: CounterDb = prisma,
): Promise<void> {
  const seen = new Set<string>();
  for (const target of targets) {
    if (!target?.userId || !target.sport) continue;
    const key = `${target.userId}:${target.sport}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const totals = await computeAttendanceTotals(target.userId, target.sport, db);
      await db.userSportProfile.upsert({
        where: { userId_sport: { userId: target.userId, sport: target.sport } },
        create: {
          userId: target.userId,
          sport: target.sport,
          attendedCount: totals.attendedCount,
          noShowCount: totals.noShowCount,
        },
        update: {
          attendedCount: totals.attendedCount,
          noShowCount: totals.noShowCount,
        },
      });
    } catch (error) {
      // Counters are informational. A failure must never break finalization,
      // a no-show note or its undo.
      console.error(
        `[attendance] Failed to refresh counters for ${target.userId}/${target.sport}:`,
        error,
      );
    }
  }
}

/**
 * Recomputes counters for every PLAYING participant of a game that just reached
 * FINAL / FINISHED. Call this **after** the transaction has committed.
 */
export async function refreshAttendanceCountersForGame(
  gameId: string,
  db: CounterDb & Pick<typeof prisma, 'game'> = prisma,
): Promise<void> {
  try {
    const game = await db.game.findUnique({
      where: { id: gameId },
      select: {
        sport: true,
        participants: { where: { status: 'PLAYING' }, select: { userId: true } },
      },
    });
    if (!game || game.participants.length === 0) return;
    await refreshAttendanceCounters(
      game.participants.map((p) => ({ userId: p.userId, sport: game.sport })),
      db,
    );
  } catch (error) {
    console.error(`[attendance] Failed to refresh counters for game ${gameId}:`, error);
  }
}

export type AttendanceRateSummary = {
  /** Whole-percent rate, or `null` below the sample floor. */
  rate: number | null;
  attendedCount: number;
  noShowCount: number;
  sampleSize: number;
  minSample: number;
};

/**
 * The public "Shows up" number: attended / (attended + noShow) over the trailing
 * 12 months, hidden until the denominator reaches {@link ATTENDANCE_RATE_MIN_SAMPLE}.
 */
export async function getAttendanceRate(
  userId: string,
  sport: Sport,
  db: CounterDb = prisma,
  now: Date = new Date(),
): Promise<AttendanceRateSummary> {
  const since = attendanceRateWindowStart(now);
  const { attendedCount, noShowCount } = await computeAttendanceTotals(userId, sport, db, since);
  return {
    rate: computeAttendanceRate(attendedCount, noShowCount),
    attendedCount,
    noShowCount,
    sampleSize: attendedCount + noShowCount,
    minSample: ATTENDANCE_RATE_MIN_SAMPLE,
  };
}

export type AttendanceMonthPoint = {
  /** `YYYY-MM` in UTC. */
  monthKey: string;
  attended: number;
  noShow: number;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 12 buckets, oldest first — the Profile → Statistics sparkline. */
export async function getAttendanceMonthlySeries(
  userId: string,
  sport: Sport,
  db: CounterDb = prisma,
  now: Date = new Date(),
): Promise<AttendanceMonthPoint[]> {
  const since = attendanceRateWindowStart(now);
  const rows = await db.gameParticipant.findMany({
    where: {
      userId,
      status: 'PLAYING',
      OR: [{ attendance: 'CONFIRMED' }, { noShowNotedAt: { not: null } }],
      game: { sport, ...FINISHED_GAME_FILTER, startTime: { gte: since } },
    },
    select: {
      attendance: true,
      noShowNotedAt: true,
      game: { select: { startTime: true } },
    },
  });

  const buckets = new Map<string, AttendanceMonthPoint>();
  const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  while (cursor <= end) {
    const key = monthKey(cursor);
    buckets.set(key, { monthKey: key, attended: 0, noShow: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  for (const row of rows) {
    const key = monthKey(new Date(row.game.startTime));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.noShowNotedAt) bucket.noShow += 1;
    else if (row.attendance === 'CONFIRMED') bucket.attended += 1;
  }

  return [...buckets.values()];
}
