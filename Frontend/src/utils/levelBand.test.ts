import { describe, expect, it } from 'vitest';
import { roundLevelBand, roundLevelBandValue } from './levelBand';

describe('roundLevelBandValue', () => {
  it('snaps a raw rating-derived edge to the 0.1 grid', () => {
    expect(roundLevelBandValue(2.045097134590984)).toBe(2);
    expect(roundLevelBandValue(3.445097134590984)).toBe(3.4);
  });

  it('leaves values already on the grid untouched', () => {
    expect(roundLevelBandValue(3.5)).toBe(3.5);
    expect(roundLevelBandValue(1)).toBe(1);
    expect(roundLevelBandValue(7)).toBe(7);
  });

  it('does not leave binary float dust', () => {
    // 0.1 arithmetic is not exact; the result must still serialize cleanly.
    expect(String(roundLevelBandValue(2.0499999))).toBe('2');
    expect(String(roundLevelBandValue(3.4499999))).toBe('3.4');
  });

  it('rounds half away from zero, like the slider', () => {
    expect(roundLevelBandValue(2.05)).toBe(2.1);
  });

  it('passes through non-finite values', () => {
    expect(roundLevelBandValue(NaN)).toBeNaN();
  });
});

describe('roundLevelBand', () => {
  it('snaps both edges', () => {
    expect(roundLevelBand([2.045097134590984, 3.445097134590984])).toEqual([2, 3.4]);
  });
});
