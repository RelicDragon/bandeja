import { describe, expect, it } from 'vitest';
import { resolveBookingSelectionAfterDeselect } from './resolveBookingSelectionAfterDeselect';

const limits = { min: 2, max: 2, playersPerCourt: 4 };

describe('resolveBookingSelectionAfterDeselect', () => {
  it('allows deselect when remaining count still meets min', () => {
    expect(
      resolveBookingSelectionAfterDeselect(['a', 'b', 'c'], ['c'], { ...limits, min: 2, max: 3 }),
    ).toEqual(['a', 'b']);
  });

  it('clears all when deselect would leave a partial selection', () => {
    expect(resolveBookingSelectionAfterDeselect(['a', 'b'], ['a'], limits)).toEqual([]);
  });

  it('allows clearing the last selected reservation', () => {
    expect(
      resolveBookingSelectionAfterDeselect(['a'], ['a'], { min: 1, max: 1, playersPerCourt: 4 }),
    ).toEqual([]);
  });
});
