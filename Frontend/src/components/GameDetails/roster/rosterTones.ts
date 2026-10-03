import type { SeatState } from './rosterModel';

/**
 * Tones for the roster. Colour is never the only signal: every state also has
 * a dot shape (check / ? / empty ring) and a text label next to it.
 * No-shows are neutral grey, never red.
 */

export const SEAT_CLASS: Record<Exclude<SeatState, null>, string> = {
  CONFIRMED: 'bg-green-500',
  UNSURE: 'bg-amber-400',
  UNANSWERED: 'bg-primary-500/35',
  NO_SHOW: 'bg-gray-400 dark:bg-gray-500',
  TAKEN: 'bg-gradient-to-r from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-400',
};

export const OPEN_SEAT_CLASS = 'border border-dashed border-gray-300 dark:border-gray-600';

export const STATUS_TONE: Record<Exclude<SeatState, null | 'TAKEN'>, string> = {
  CONFIRMED: 'text-green-700 dark:text-green-400',
  UNSURE: 'text-amber-700 dark:text-amber-300',
  UNANSWERED: 'text-gray-500 dark:text-gray-400',
  NO_SHOW: 'text-gray-500 dark:text-gray-400',
};

/**
 * One skeleton for every roster line, the viewer's card included: the same
 * padding, the same avatar gap and a 1 px border (transparent here, visible on
 * the viewer's card) so names and pills line up across rows.
 */
export const ROW_LAYOUT = 'flex min-h-11 items-center gap-3 py-1.5 ps-2 pe-1';

export const ROW_SURFACE = `${ROW_LAYOUT} rounded-xl border border-transparent bg-gray-50/90 dark:bg-gray-800/70`;

/** Trailing column: money pill, then the ⋮ slot (`w-8`, reserved when any row has one). */
export const ROW_TRAILING = 'flex shrink-0 items-center gap-1';
export const MENU_SLOT = 'w-8 shrink-0';

export const YOU_SURFACE =
  'rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-white to-white shadow-sm shadow-primary-600/5 dark:border-primary-800/70 dark:from-primary-950/50 dark:via-gray-900 dark:to-gray-900';
