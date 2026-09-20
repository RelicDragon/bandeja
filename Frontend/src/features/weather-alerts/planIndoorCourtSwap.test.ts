import { describe, expect, it } from 'vitest';
import { planIndoorCourtSwap } from './planIndoorCourtSwap';

describe('planIndoorCourtSwap', () => {
  it('replaces the whole set when the game has no linked courts', () => {
    expect(planIndoorCourtSwap([], 'c1')).toEqual(['c1']);
  });

  it('replaces a single outdoor court', () => {
    expect(
      planIndoorCourtSwap([{ id: 'c5', name: 'Court 5', isIndoor: false }], 'c1'),
    ).toEqual(['c1']);
  });

  it('keeps the indoor courts of a multi-court game', () => {
    expect(
      planIndoorCourtSwap(
        [
          { id: 'c5', name: 'Court 5', isIndoor: false },
          { id: 'c6', name: 'Court 6', isIndoor: true },
        ],
        'c1',
      ),
    ).toEqual(['c1', 'c6']);
  });

  it('moves one outdoor court at a time and keeps the other', () => {
    expect(
      planIndoorCourtSwap(
        [
          { id: 'c5', name: 'Court 5', isIndoor: false },
          { id: 'c7', name: 'Court 7', isIndoor: false },
        ],
        'c1',
      ),
    ).toEqual(['c1', 'c7']);
  });

  it('does not duplicate a court the game is already on', () => {
    expect(
      planIndoorCourtSwap(
        [
          { id: 'c5', name: 'Court 5', isIndoor: false },
          { id: 'c6', name: 'Court 6', isIndoor: true },
        ],
        'c6',
      ),
    ).toEqual(['c6']);
  });
});
