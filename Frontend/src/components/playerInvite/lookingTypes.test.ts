import { describe, expect, it } from 'vitest';
import { lookingMembersForSlot, lookingSelectionAfterPoolChange } from './lookingTypes';

describe('lookingSelectionAfterPoolChange', () => {
  it('drops selected looking members who left the pool', () => {
    const { nextSelected, removedIds } = lookingSelectionAfterPoolChange(
      ['keep-search', 'was-looking'],
      new Set(['was-looking', 'other']),
      new Set(['other']),
    );
    expect(nextSelected).toEqual(['keep-search']);
    expect(removedIds).toEqual(['was-looking']);
  });

  it('keeps search-only selections', () => {
    const { nextSelected, removedIds } = lookingSelectionAfterPoolChange(
      ['a'],
      new Set(['b']),
      new Set(),
    );
    expect(nextSelected).toEqual(['a']);
    expect(removedIds).toEqual([]);
  });

  it('hides other genders when the invite slot is locked', () => {
    const members = [
      { userId: 'w', gender: 'FEMALE' },
      { userId: 'm', gender: 'MALE' },
      { userId: 'x', gender: 'PREFER_NOT_TO_SAY' },
    ];
    expect(lookingMembersForSlot(members, 'FEMALE').map((m) => m.userId)).toEqual(['w']);
    expect(lookingMembersForSlot(members).map((m) => m.userId)).toEqual(['w', 'm', 'x']);
  });
});
