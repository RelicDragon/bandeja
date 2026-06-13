import { describe, expect, it } from 'vitest';
import { computeBookingSelectionLimits } from './computeBookingSelectionLimits';

describe('computeBookingSelectionLimits', () => {
  it('requires one court per four players in 2v2', () => {
    expect(computeBookingSelectionLimits(4, 4)).toEqual({ min: 1, max: 1, playersPerCourt: 4 });
    expect(computeBookingSelectionLimits(5, 4)).toEqual({ min: 2, max: 2, playersPerCourt: 4 });
    expect(computeBookingSelectionLimits(8, 4)).toEqual({ min: 2, max: 2, playersPerCourt: 4 });
  });

  it('requires one court per two players in 1v1', () => {
    expect(computeBookingSelectionLimits(2, 2)).toEqual({ min: 1, max: 1, playersPerCourt: 2 });
    expect(computeBookingSelectionLimits(3, 2)).toEqual({ min: 2, max: 2, playersPerCourt: 2 });
    expect(computeBookingSelectionLimits(4, 2)).toEqual({ min: 2, max: 2, playersPerCourt: 2 });
  });

  it('defaults to 2v2 court sizing for non-2 playersPerMatch', () => {
    expect(computeBookingSelectionLimits(4, 4)).toEqual({ min: 1, max: 1, playersPerCourt: 4 });
  });
});
