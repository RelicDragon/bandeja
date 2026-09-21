/**
 * PRD 346 — pure attendance rules.
 *
 * Nothing in this module touches Prisma, the network or the clock (every
 * function takes `now` explicitly), so all of it is unit testable without a
 * database.
 *
 * **The product invariant lives here.** Confirmation is a courtesy signal, never
 * a contract: no attendance operation may ever write `status`, `level`,
 * `reliability`, `ratingUncertainty`, queue position or seat state. The
 * allow-lists below are the machine-readable form of that rule and are asserted
 * by `attendanceRules.test.ts`.
 */
import type { ParticipantAttendance } from '@prisma/client';
import {
  canMutateGameRoster,
  type GameMutationLockResultsStatus,
  type GameMutationLockStatus,
} from '@bandeja/shared/gameMutationLock';

/** States a player can pick. `UNANSWERED` is the default, never a user choice. */
export const ATTENDANCE_ANSWER_STATES = ['CONFIRMED', 'UNSURE'] as const;
export type AttendanceAnswer = (typeof ATTENDANCE_ANSWER_STATES)[number];

/** How long after the game an organizer can note (or un-note) a no-show. */
export const NO_SHOW_NOTE_WINDOW_DAYS = 7;
export const NO_SHOW_NOTE_WINDOW_MS = NO_SHOW_NOTE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** One nudge per game per 6 h. */
export const ATTENDANCE_NUDGE_COOLDOWN_HOURS = 6;
export const ATTENDANCE_NUDGE_COOLDOWN_MS = ATTENDANCE_NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000;

/** Denominator floor before a "Shows up" percentage is shown anywhere. */
export const ATTENDANCE_RATE_MIN_SAMPLE = 5;

/** The rate window: 12 months back from "now". */
export const ATTENDANCE_RATE_WINDOW_MONTHS = 12;

/**
 * Fields an attendance write is allowed to put on a `GameParticipant`.
 * Anything outside this set would turn a courtesy signal into an enforcement
 * mechanism — see `docs/plans/prd-345-357/prd-346.md` "Product principle".
 */
export const ATTENDANCE_PARTICIPANT_WRITABLE_FIELDS = [
  'attendance',
  'attendanceUpdatedAt',
  'noShowNotedById',
  'noShowNotedAt',
] as const;

/**
 * Fields no attendance code path may ever write. Kept as an explicit list so a
 * future refactor that "simplifies" the guard away fails the test instead of
 * silently penalizing players.
 */
export const ATTENDANCE_FORBIDDEN_FIELDS = [
  'status',
  'role',
  'joinedAt',
  'lookingForPartner',
  'activeMatchId',
  'level',
  'reliability',
  'ratingUncertainty',
  'gamesPlayed',
  'gamesWon',
  'totalPoints',
  'approvedAtLevel',
  'lastRatingActivityAt',
] as const;

export type AttendanceParticipantUpdate = Partial<{
  attendance: ParticipantAttendance;
  attendanceUpdatedAt: Date | null;
  noShowNotedById: string | null;
  noShowNotedAt: Date | null;
}>;

/** Throws when an update payload strays outside the allow-list. */
export function assertAttendanceUpdateIsSafe(update: Record<string, unknown>): void {
  const allowed = new Set<string>(ATTENDANCE_PARTICIPANT_WRITABLE_FIELDS);
  for (const key of Object.keys(update)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Attendance writes may not touch "${key}". Confirmation is informative only (PRD 346).`,
      );
    }
  }
}

export function isAttendanceAnswer(value: unknown): value is AttendanceAnswer {
  return typeof value === 'string' && (ATTENDANCE_ANSWER_STATES as readonly string[]).includes(value);
}

/** Builds the (only) participant patch an answer is allowed to produce. */
export function buildAnswerUpdate(
  answer: AttendanceAnswer,
  now: Date,
): AttendanceParticipantUpdate {
  const update: AttendanceParticipantUpdate = {
    attendance: answer as ParticipantAttendance,
    attendanceUpdatedAt: now,
  };
  assertAttendanceUpdateIsSafe(update);
  return update;
}

export function buildNoShowNoteUpdate(notedById: string, now: Date): AttendanceParticipantUpdate {
  const update: AttendanceParticipantUpdate = {
    noShowNotedById: notedById,
    noShowNotedAt: now,
  };
  assertAttendanceUpdateIsSafe(update);
  return update;
}

export function buildNoShowUndoUpdate(): AttendanceParticipantUpdate {
  const update: AttendanceParticipantUpdate = {
    noShowNotedById: null,
    noShowNotedAt: null,
  };
  assertAttendanceUpdateIsSafe(update);
  return update;
}

/**
 * The no-show window is measured from the game's end (its start when the end is
 * missing), never from "now minus something", so a note made on day 6 can still
 * be undone on day 7.
 */
export function isWithinNoShowWindow(
  gameEndsAt: Date | string | null | undefined,
  now: Date,
): boolean {
  if (!gameEndsAt) return false;
  const ended = gameEndsAt instanceof Date ? gameEndsAt : new Date(gameEndsAt);
  const endedMs = ended.getTime();
  if (!Number.isFinite(endedMs)) return false;
  if (endedMs > now.getTime()) return false;
  return now.getTime() - endedMs <= NO_SHOW_NOTE_WINDOW_MS;
}

export type NudgeCooldown = {
  allowed: boolean;
  /** Milliseconds left on the cooldown; `0` when a nudge is allowed. */
  remainingMs: number;
  /** Whole hours left, rounded up — what the caption shows. */
  remainingHours: number;
  nextAllowedAt: string | null;
};

export function evaluateNudgeCooldown(
  lastNudgeAt: Date | string | null | undefined,
  now: Date,
): NudgeCooldown {
  if (!lastNudgeAt) {
    return { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null };
  }
  const last = lastNudgeAt instanceof Date ? lastNudgeAt : new Date(lastNudgeAt);
  const lastMs = last.getTime();
  if (!Number.isFinite(lastMs)) {
    return { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null };
  }
  const nextAllowedMs = lastMs + ATTENDANCE_NUDGE_COOLDOWN_MS;
  const remainingMs = nextAllowedMs - now.getTime();
  if (remainingMs <= 0) {
    return { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null };
  }
  return {
    allowed: false,
    remainingMs,
    remainingHours: Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000))),
    nextAllowedAt: new Date(nextAllowedMs).toISOString(),
  };
}

/**
 * The organizer's implicit yes.
 *
 * The owner is the one player whose attendance was never a question: they made
 * the game. So they are never *asked* — no card, no push question, no nudge —
 * and their PLAYING row reads `CONFIRMED` everywhere attendance is read, which
 * is what lets a four-player game reach 4/4.
 *
 * This is a **derivation, not a write**. Nothing stores `CONFIRMED` on the
 * owner's row: the column keeps the answer they actually gave (usually
 * `UNANSWERED`), and every reader coerces. That way the rule follows ownership
 * instead of freezing at creation time, it applies to games that already exist,
 * and it stays inside the PRD 346 allow-list — an implicit yes still writes
 * nothing.
 */
export const OWNER_IMPLICIT_ANSWER = 'CONFIRMED' satisfies AttendanceAnswer;

/** The two columns the implicit yes is derived from. */
export type AttendanceOwnershipRow = { role?: string | null; status: string };

/** `true` for the owner's own seat — the only row with an implicit answer. */
export function isImplicitlyConfirmedOwner(row: AttendanceOwnershipRow): boolean {
  return row.role === 'OWNER' && row.status === 'PLAYING';
}

/**
 * Applies {@link isImplicitlyConfirmedOwner} to a roster. Call this at every DB
 * boundary that loads attendance, so no projection downstream has to remember.
 * Idempotent, and it never allocates for a roster that needs no coercion.
 */
export function withOwnerImplicitAnswer<
  T extends AttendanceOwnershipRow & { attendance: ParticipantAttendance },
>(rows: readonly T[]): T[] {
  return rows.map((row) =>
    isImplicitlyConfirmedOwner(row) && row.attendance !== OWNER_IMPLICIT_ANSWER
      ? { ...row, attendance: OWNER_IMPLICIT_ANSWER as ParticipantAttendance }
      : row,
  );
}

export type AttendanceRosterEntry = {
  userId: string;
  status: string;
  role?: string | null;
  attendance: ParticipantAttendance;
  noShowNotedAt?: Date | string | null;
};

export type AttendanceCounts = {
  confirmedCount: number;
  unsureCount: number;
  unansweredCount: number;
  playingCount: number;
  noShowCount: number;
};

/** Only `PLAYING` participants count — trainers and queue rows never do. */
export function countAttendance(entries: readonly AttendanceRosterEntry[]): AttendanceCounts {
  let confirmedCount = 0;
  let unsureCount = 0;
  let unansweredCount = 0;
  let playingCount = 0;
  let noShowCount = 0;

  for (const entry of entries) {
    if (entry.status !== 'PLAYING') continue;
    playingCount += 1;
    if (entry.noShowNotedAt) noShowCount += 1;
    if (entry.attendance === 'CONFIRMED') confirmedCount += 1;
    else if (entry.attendance === 'UNSURE') unsureCount += 1;
    else unansweredCount += 1;
  }

  return { confirmedCount, unsureCount, unansweredCount, playingCount, noShowCount };
}

/**
 * Attendance rate over the trailing 12 months. Returns `null` below the sample
 * floor so a single missed game can never read as "0% shows up".
 */
export function computeAttendanceRate(
  attended: number,
  noShow: number,
  minSample: number = ATTENDANCE_RATE_MIN_SAMPLE,
): number | null {
  const denominator = attended + noShow;
  if (denominator < minSample || denominator <= 0) return null;
  return Math.round((attended / denominator) * 100);
}

/** Start of the trailing rate window. */
export function attendanceRateWindowStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setMonth(start.getMonth() - ATTENDANCE_RATE_WINDOW_MONTHS);
  return start;
}

export type TelegramAttendanceCallback = {
  gameId: string;
  answer: AttendanceAnswer;
};

/**
 * Parses the Telegram callback payload `at:<gameId>:<confirm|unsure>`.
 * Returns `null` for anything malformed — the handler answers the callback
 * query rather than throwing, so a stale button never leaves a spinner.
 */
export function parseAttendanceCallbackData(data: string): TelegramAttendanceCallback | null {
  if (typeof data !== 'string' || !data.startsWith('at:')) return null;
  const parts = data.split(':');
  if (parts.length !== 3) return null;
  const [, gameId, action] = parts;
  if (!gameId || !/^[A-Za-z0-9_-]{1,64}$/.test(gameId)) return null;
  if (action === 'confirm') return { gameId, answer: 'CONFIRMED' };
  if (action === 'unsure') return { gameId, answer: 'UNSURE' };
  return null;
}

/** Builds the callback payload for a Telegram inline button. */
export function buildAttendanceCallbackData(gameId: string, answer: AttendanceAnswer): string {
  return `at:${gameId}:${answer === 'CONFIRMED' ? 'confirm' : 'unsure'}`;
}

/**
 * Attendance UI only makes sense once the game has a real time and has not
 * started. Games without `timeIsSet` show nothing at all (PRD edge case).
 *
 * **Never gate on `Game.status`.** `docs/product/constraints.md` is explicit:
 * `status` is derived from the clock *and only persisted when it is safe to
 * persist*, so it fails **open** for a backdated game — `calculatePersistableGameStatus`
 * refuses to store a clock-`FINISHED` status for an unscored `GAME`, and
 * `gameStatusScheduler` skips the write, so a game created after its own
 * `startTime` keeps `status: 'ANNOUNCED'` until it archives a week later. A
 * rostered player could therefore "confirm" attendance for a game that already
 * happened, inflating the public "Shows up %".
 *
 * The lock is `resultsStatus` (through the shared `canMutateGameRoster`
 * predicate, which also keeps `ARCHIVED` as a hard stop) plus an explicit
 * comparison against `startTime` — exactly the shape {@link isWithinNoShowWindow}
 * already uses three functions up.
 */
export function gameAcceptsAttendanceAnswers(
  game: {
    status: GameMutationLockStatus | string;
    resultsStatus: GameMutationLockResultsStatus | string;
    timeIsSet: boolean;
    startTime: Date | string;
  },
  now: Date = new Date(),
): boolean {
  if (game.timeIsSet !== true) return false;
  if (
    !canMutateGameRoster({
      status: game.status as GameMutationLockStatus,
      resultsStatus: game.resultsStatus as GameMutationLockResultsStatus,
    })
  ) {
    return false;
  }
  const startsAt = game.startTime instanceof Date ? game.startTime : new Date(game.startTime);
  const startsAtMs = startsAt.getTime();
  if (!Number.isFinite(startsAtMs)) return false;
  return startsAtMs > now.getTime();
}

/**
 * The second reminder's cut-off, in hours before start. Anything at or under it
 * is "the 2 h reminder" as far as the attendance filter is concerned.
 */
export const ATTENDANCE_SECOND_REMINDER_HOURS = 2;

/** The shape the reminder filter needs — a participant row, nothing more. */
export interface ReminderCandidate {
  status: string;
  role?: string | null;
  attendance?: string | null;
}

/**
 * Who gets a given game reminder.
 *
 * The 24 h reminder reaches everyone. The 2 h reminder only reaches PLAYING
 * players who have not answered yet, so nobody is asked twice — and there is
 * never a third message. Non-PLAYING recipients (the `lookingForPartner` rows)
 * are never filtered: the question was never put to them. The owner counts as
 * answered from the start ({@link isImplicitlyConfirmedOwner}), so the 2 h
 * message skips them.
 *
 * This is a filter over who is *reminded*, and that is all it is. It removes
 * nobody from the game, and a player who never answers is treated exactly like
 * one who did.
 */
export function attendanceReminderRecipients<T extends ReminderCandidate>(
  participants: T[],
  hoursBeforeStart: number,
): T[] {
  if (hoursBeforeStart > ATTENDANCE_SECOND_REMINDER_HOURS) {
    return participants;
  }
  return participants.filter(
    (participant) =>
      participant.status !== 'PLAYING' ||
      (participant.attendance === 'UNANSWERED' && !isImplicitlyConfirmedOwner(participant)),
  );
}

/**
 * Splits reminder recipients into the ones the reminder may put the question
 * to and the ones who get the plain reminder.
 *
 * Only the owner lands in `remindOnly`: they are already confirmed, so shipping
 * them "Are you coming?" with two buttons would ask a question the app has
 * decided on their behalf.
 */
export function partitionAttendanceAsk<T extends ReminderCandidate>(
  recipients: readonly T[],
): { ask: T[]; remindOnly: T[] } {
  const ask: T[] = [];
  const remindOnly: T[] = [];
  for (const recipient of recipients) {
    if (isImplicitlyConfirmedOwner(recipient)) remindOnly.push(recipient);
    else ask.push(recipient);
  }
  return { ask, remindOnly };
}
