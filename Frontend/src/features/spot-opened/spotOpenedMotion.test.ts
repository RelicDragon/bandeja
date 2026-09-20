/**
 * PRD 347 — motion contracts for the freed seat and the auto-filled avatar.
 *
 * Both must have a reduced-motion path that paints the final state on the
 * first frame; the durations are part of the PRD, so they are asserted rather
 * than left to drift.
 */
import { describe, expect, it } from 'vitest';
import {
  OPEN_SPOT_FADE_MS,
  SEAT_FILLED_SLIDE_PX,
  openSpotFadeTransition,
  seatFilledEnter,
} from './spotOpenedMotion';

describe('openSpotFadeTransition', () => {
  it('fades the freed seat in over 400 ms', () => {
    expect(OPEN_SPOT_FADE_MS).toBe(400);
    expect(openSpotFadeTransition(false)).toEqual({ duration: 0.4, ease: 'easeOut' });
  });

  it('collapses to an instant state change under reduced motion', () => {
    expect(openSpotFadeTransition(true)).toEqual({ duration: 0 });
  });
});

describe('seatFilledEnter', () => {
  it('slides the new avatar in from the queue row with the house spring', () => {
    const enter = seatFilledEnter(false);
    expect(enter.initial).toEqual({ opacity: 0, y: SEAT_FILLED_SLIDE_PX });
    expect(enter.animate).toEqual({ opacity: 1, y: 0 });
    expect(enter.transition).toEqual({ type: 'spring', stiffness: 260, damping: 24 });
  });

  it('skips the entrance entirely under reduced motion', () => {
    const enter = seatFilledEnter(true);
    expect(enter.initial).toBe(false);
    expect(enter.animate).toEqual({ opacity: 1, y: 0 });
    expect(enter.transition).toEqual({ duration: 0 });
  });
});
