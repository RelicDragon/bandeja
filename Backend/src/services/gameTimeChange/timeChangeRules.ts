/**
 * Time change — pure rules. No Prisma, no clock: every function takes `now`.
 *
 * The owner is authoritative over the schedule; there is no proposal or
 * reconfirmation flow. Three behaviours ride on the existing edit flow
 * (`GameUpdateService`):
 * 1. reset PLAYING attendance answers (`gameAttendance/attendanceTimeChange.ts`);
 * 2. one coalesced "time changed" notice to PLAYING participants except the
 *    editor (Time-critical tier, collapsed per game);
 * 3. linked bookings that no longer cover the game are flagged for manual
 *    attention — never moved or cancelled.
 */
import { canMutateGameRoster } from '@bandeja/shared/gameMutationLock';
import type {
  GameMutationLockResultsStatus,
  GameMutationLockStatus,
} from '@bandeja/shared/gameMutationLock';
import { supportsAttendance } from '../gameAttendance/attendanceEntityTypes';
import { isImplicitlyConfirmedOwner } from '../gameAttendance/attendanceRules';

/** A burst of edits closes once the organizer has been quiet this long. */
export const TIME_CHANGE_NOTICE_QUIET_MS = 60 * 1000;
/** …but a notice never waits longer than this after the first edit of the burst. */
export const TIME_CHANGE_NOTICE_MAX_DELAY_MS = 5 * 60 * 1000;

export type GameSchedule = {
  startTime: Date;
  endTime: Date;
  timeIsSet: boolean;
};

export type ScheduleChange = {
  /** Start or end moved (regardless of `timeIsSet`). */
  timesMoved: boolean;
  /** Clear PLAYING answers: the schedule players answered for is gone. */
  resetAttendance: boolean;
  /** Queue / refresh the "time changed" notice. */
  notice: boolean;
};

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export function schedulesDiffer(a: Pick<GameSchedule, 'startTime' | 'endTime'>, b: Pick<GameSchedule, 'startTime' | 'endTime'>): boolean {
  return !sameInstant(a.startTime, b.startTime) || !sameInstant(a.endTime, b.endTime);
}

/**
 * Which of the three behaviours an edit triggers.
 *
 * - A game that had a real time and still has one, with start or end moved:
 *   reset + notice.
 * - The time is cleared (`timeIsSet` true → false) or set for the first time
 *   (false → true): reset only. Clearing has its own channel (club-admin DM,
 *   chat line) and first scheduling is not a *change* players were told about.
 * - Placeholder times moving on a game without a time: nothing — nobody could
 *   answer for a time that was never set.
 * - Entity types without attendance (EVENT, LEAGUE_SEASON): nothing.
 */
export function classifyScheduleChange(
  previous: GameSchedule,
  next: GameSchedule,
  entityType: string,
): ScheduleChange {
  const timesMoved = schedulesDiffer(previous, next);
  if (!supportsAttendance(entityType)) {
    return { timesMoved, resetAttendance: false, notice: false };
  }
  const timeIsSetToggled = previous.timeIsSet !== next.timeIsSet;
  const bothSet = previous.timeIsSet && next.timeIsSet;
  return {
    timesMoved,
    resetAttendance: timeIsSetToggled || (bothSet && timesMoved),
    notice: bothSet && timesMoved,
  };
}

/** Sliding quiet window, capped from the start of the burst. */
export function nextNoticeDueAt(pendingSince: Date, now: Date): Date {
  const quiet = now.getTime() + TIME_CHANGE_NOTICE_QUIET_MS;
  const cap = pendingSince.getTime() + TIME_CHANGE_NOTICE_MAX_DELAY_MS;
  return new Date(Math.min(quiet, cap));
}

export type NoticeGameState = GameSchedule & {
  entityType: string;
  status: GameMutationLockStatus | string;
  resultsStatus: GameMutationLockResultsStatus | string;
};

export type NoticeSkipReason =
  | 'unsupported-entity'
  | 'locked'
  | 'time-cleared'
  | 'already-started'
  | 'reverted';

/**
 * Revalidated at delivery time, after the quiet window: the notice must still
 * be true and still be useful. A burst that ends where it began (typo fixed)
 * sends nothing; neither does a game that started, locked, or lost its time.
 */
export function evaluateNoticeDelivery(
  game: NoticeGameState,
  announced: Pick<GameSchedule, 'startTime' | 'endTime'>,
  now: Date,
): { send: true } | { send: false; reason: NoticeSkipReason } {
  if (!supportsAttendance(game.entityType)) return { send: false, reason: 'unsupported-entity' };
  if (
    !canMutateGameRoster({
      status: game.status as GameMutationLockStatus,
      resultsStatus: game.resultsStatus as GameMutationLockResultsStatus,
    })
  ) {
    return { send: false, reason: 'locked' };
  }
  if (!game.timeIsSet) return { send: false, reason: 'time-cleared' };
  if (game.startTime.getTime() <= now.getTime()) return { send: false, reason: 'already-started' };
  if (!schedulesDiffer(game, announced)) return { send: false, reason: 'reverted' };
  return { send: true };
}

export type NoticeRosterRow = {
  userId: string;
  status: string;
  role?: string | null;
};

/** PLAYING only (trainers, queue and invites never), minus the editor. */
export function timeChangeNoticeRecipients<T extends NoticeRosterRow>(
  roster: readonly T[],
  editorUserId: string | null | undefined,
): T[] {
  return roster.filter((row) => row.status === 'PLAYING' && row.userId !== editorUserId);
}

/**
 * Whether the notice asks the recipient to answer again. The owner's yes is
 * implicit and survives the reset, so they are told, not asked.
 */
export function noticeAsksAttendance(row: NoticeRosterRow): boolean {
  return !isImplicitlyConfirmedOwner(row);
}

/**
 * An attendance action issued at `issuedAt` (push token `iat`, Telegram message
 * date) answers for the schedule in force at that moment. If the time changed
 * since, the action is stale and must not record an answer for the new time.
 * Second granularity: Telegram dates and JWT `iat` are whole seconds.
 */
export function isStaleAttendanceAction(issuedAt: Date, attendanceResetAt: Date | null): boolean {
  if (!attendanceResetAt) return false;
  return Math.floor(issuedAt.getTime() / 1000) < Math.floor(attendanceResetAt.getTime() / 1000);
}

/* ------------------------------------------------------------------ */
/* Batches (series "this and following" edits)                         */
/* ------------------------------------------------------------------ */

/**
 * A series "this and following" edit moves many occurrences at once. Their
 * pending notices share this key, are claimed together and become ONE
 * combined notice per player instead of one per game.
 */
export function seriesTimeChangeBatchKey(seriesId: string): string {
  return `series:${seriesId}`;
}

export function seriesIdFromBatchKey(batchKey: string | null | undefined): string | null {
  if (!batchKey || !batchKey.startsWith('series:')) return null;
  return batchKey.slice('series:'.length) || null;
}

/**
 * A batch is claimed only once every still-pending member is due: the edits
 * of one batch land within seconds, and each member is capped by
 * {@link TIME_CHANGE_NOTICE_MAX_DELAY_MS}, so the wait is bounded.
 */
export function isBatchDue(members: readonly { noticeDueAt: Date | null }[], now: Date): boolean {
  const pending = members.filter((m) => m.noticeDueAt !== null);
  return pending.length > 0 && pending.every((m) => m.noticeDueAt!.getTime() <= now.getTime());
}

export type BatchNoticeGame<R extends NoticeRosterRow> = {
  gameId: string;
  startTime: Date;
  editorUserId: string | null;
  roster: readonly R[];
};

export type BatchNoticeRecipientGames<R extends NoticeRosterRow> = {
  userId: string;
  /** The recipient's own games of the batch, earliest first. */
  gameIds: string[];
  /** Roster row per game id (for the per-game asks). */
  rows: Record<string, R>;
};

/**
 * One entry per player across the batch: each player is listed once, with
 * only the games they play in (PLAYING, minus each game's editor).
 */
export function groupBatchNoticeRecipients<R extends NoticeRosterRow>(
  games: readonly BatchNoticeGame<R>[],
): BatchNoticeRecipientGames<R>[] {
  const ordered = [...games].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const byUser = new Map<string, BatchNoticeRecipientGames<R>>();
  for (const game of ordered) {
    for (const row of timeChangeNoticeRecipients(game.roster, game.editorUserId)) {
      let entry = byUser.get(row.userId);
      if (!entry) {
        entry = { userId: row.userId, gameIds: [], rows: {} };
        byUser.set(row.userId, entry);
      }
      if (!entry.rows[game.gameId]) {
        entry.gameIds.push(game.gameId);
        entry.rows[game.gameId] = row;
      }
    }
  }
  return [...byUser.values()];
}
