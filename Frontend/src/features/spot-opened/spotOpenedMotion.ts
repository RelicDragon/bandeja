import type { Transition } from 'framer-motion';

/** PRD 347 — the freed seat fades in over 400 ms. */
export const OPEN_SPOT_FADE_MS = 400;

/**
 * PRD 347 — travel distance for the seat-filled entrance: the auto-filled
 * player's row slides up out of the queue into the roster, and the green
 * "you were seated" header uses the same movement so the two read as one event.
 */
export const SEAT_FILLED_SLIDE_PX = 8;

/**
 * Motion for the freed-seat affordance and the auto-filled roster entry.
 *
 * Every path is reduced-motion aware: `reduceMotion` collapses the duration to
 * zero so the final state paints on the first frame instead of animating.
 */
export function openSpotFadeTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0 }
    : { duration: OPEN_SPOT_FADE_MS / 1000, ease: 'easeOut' };
}

/** Entrance for a player auto-fill just seated, sliding up from the queue row. */
export function seatFilledEnter(reduceMotion: boolean): {
  initial: false | { opacity: number; y: number };
  animate: { opacity: number; y: number };
  transition: Transition;
} {
  return {
    initial: reduceMotion ? false : { opacity: 0, y: SEAT_FILLED_SLIDE_PX },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion
      ? { duration: 0 }
      : { type: 'spring', stiffness: 260, damping: 24 },
  };
}
