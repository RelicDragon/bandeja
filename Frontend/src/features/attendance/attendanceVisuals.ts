/**
 * PRD 346 — pure presentation helpers for attendance.
 *
 * Colour is never the only signal: every state here carries a translation key
 * for a visually-hidden text equivalent alongside its tone. Keep the two in
 * lockstep — `attendanceVisuals.test.ts` asserts it.
 */
import type { ParticipantAttendance } from '@/types/gameCardEnrichment';

export type AttendanceDotState = ParticipantAttendance | 'NO_SHOW';

export interface AttendanceDotStyle {
  /** Tailwind classes for the dot itself. Logical properties only. */
  className: string;
  /** i18n key of the text equivalent. Rendered visually hidden next to the dot. */
  labelKey: string;
  /** `true` when the dot is a filled check rather than a plain ring. */
  filled: boolean;
}

const DOT_STYLES: Record<AttendanceDotState, AttendanceDotStyle> = {
  CONFIRMED: {
    className: 'bg-green-500 text-white dark:bg-green-500',
    labelKey: 'attendance.dots.confirmed',
    filled: true,
  },
  UNSURE: {
    className: 'bg-amber-400 text-amber-950 dark:bg-amber-400',
    labelKey: 'attendance.dots.unsure',
    filled: true,
  },
  UNANSWERED: {
    className:
      'border-2 border-gray-300 bg-white text-transparent dark:border-gray-500 dark:bg-gray-800',
    labelKey: 'attendance.dots.unanswered',
    filled: false,
  },
  NO_SHOW: {
    className: 'bg-gray-400 text-white dark:bg-gray-500',
    labelKey: 'attendance.dots.noShow',
    filled: true,
  },
};

export function attendanceDotStyle(state: AttendanceDotState): AttendanceDotStyle {
  return DOT_STYLES[state] ?? DOT_STYLES.UNANSWERED;
}

/** A no-show note outranks whatever the player answered before the game. */
export function resolveDotState(
  attendance: ParticipantAttendance | null | undefined,
  noShowNotedAt: string | null | undefined,
): AttendanceDotState {
  if (noShowNotedAt) return 'NO_SHOW';
  if (attendance === 'CONFIRMED' || attendance === 'UNSURE') return attendance;
  return 'UNANSWERED';
}

/**
 * Percentage bar width for the organizer strip, clamped to [0, 100]. A game
 * with no PLAYING players reads as empty rather than as NaN.
 */
export function confirmedPercent(confirmed: number, total: number): number {
  if (!Number.isFinite(confirmed) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((confirmed / total) * 100)));
}

/**
 * The "Shows up" ring is a single sky tone at every value — there is no red or
 * amber grading, because a lower number is not a worse person.
 */
export const SHOWS_UP_RING_CIRCUMFERENCE = 2 * Math.PI * 20;

export function ringDashOffset(rate: number): number {
  const clamped = Math.max(0, Math.min(100, rate));
  return SHOWS_UP_RING_CIRCUMFERENCE * (1 - clamped / 100);
}

/**
 * The tile is hidden entirely below the sample floor. The backend already nulls
 * the payload, but the check is repeated here so a stale cache cannot leak a
 * "0%" that would read as a judgement.
 */
export function shouldShowAttendanceRate(
  summary: { rate: number | null; sampleSize: number; minSample: number } | null | undefined,
): summary is { rate: number; sampleSize: number; minSample: number } {
  if (!summary) return false;
  if (summary.rate === null || !Number.isFinite(summary.rate)) return false;
  return summary.sampleSize >= summary.minSample;
}

/** Locale-aware "37%" without an i18n key (identical English copies fail parity). */
export function formatPercent(rate: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(rate / 100);
  } catch {
    return `${Math.round(rate)}%`;
  }
}

/** Locale-aware "3/4" for the card right rail. */
export function formatFraction(confirmed: number, total: number, locale: string): string {
  try {
    const nf = new Intl.NumberFormat(locale);
    return `${nf.format(confirmed)}/${nf.format(total)}`;
  } catch {
    return `${confirmed}/${total}`;
  }
}

/** Maps a backend `errors.attendance.*` code onto a key in our own namespace. */
export function attendanceErrorKey(code: unknown): string {
  if (typeof code !== 'string') return 'attendance.errors.generic';
  const suffix = code.startsWith('errors.attendance.') ? code.slice('errors.attendance.'.length) : '';
  switch (suffix) {
    case 'notParticipant':
      return 'attendance.errors.notParticipant';
    case 'answersClosed':
      return 'attendance.errors.answersClosed';
    case 'noShowWindowClosed':
      return 'attendance.errors.noShowWindowClosed';
    case 'nudgeCooldown':
      return 'attendance.errors.nudgeCooldown';
    case 'nothingToNudge':
      return 'attendance.errors.nothingToNudge';
    default:
      return 'attendance.errors.generic';
  }
}
