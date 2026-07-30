import { describe, expect, it } from 'vitest';
import {
  clearIneligiblePhase4Flags,
  copyExclusivePhase4FlagToGroups,
  copyPhase4FlagToGroups,
  getPhase4FlagForGroup,
  getPhase4MismatchGroupNames,
  setPhase4FlagForGroup,
} from './playoffWizardPhase4ByGroup.util';

describe('playoffWizardPhase4ByGroup.util (UX-B4)', () => {
  it('stores independent phase-4 flags per group', () => {
    let map = setPhase4FlagForGroup({}, 'g1', true);
    map = setPhase4FlagForGroup(map, 'g2', false);
    expect(getPhase4FlagForGroup(map, 'g1')).toBe(true);
    expect(getPhase4FlagForGroup(map, 'g2')).toBe(false);
    expect(getPhase4FlagForGroup(map, 'g3')).toBe(false);
  });

  it('copies one group flag to every other group', () => {
    expect(copyPhase4FlagToGroups({ g1: true, g2: false }, ['g1', 'g2', 'g3'], true)).toEqual({
      g1: true,
      g2: true,
      g3: true,
    });
  });

  it('clears the opposing exclusive flag when copying an enabled value', () => {
    expect(
      copyExclusivePhase4FlagToGroups({
        targetMap: { g1: true, g2: false },
        opposingMap: { g1: false, g2: true, g3: true },
        groupIds: ['g1', 'g2', 'g3'],
        value: true,
      })
    ).toEqual({
      targetMap: { g1: true, g2: true, g3: true },
      opposingMap: { g1: false, g2: false, g3: false },
    });
  });

  it('leaves the opposing exclusive flag alone when copying a disabled value', () => {
    expect(
      copyExclusivePhase4FlagToGroups({
        targetMap: { g1: false, g2: true },
        opposingMap: { g1: true, g2: false },
        groupIds: ['g1', 'g2'],
        value: false,
      })
    ).toEqual({
      targetMap: { g1: false, g2: false },
      opposingMap: { g1: true, g2: false },
    });
  });

  it('returns only other groups whose flag differs from the current group', () => {
    expect(
      getPhase4MismatchGroupNames(
        { g1: true, g2: false, g3: true, g4: false },
        'g1',
        [
          { id: 'g1', name: 'Group A' },
          { id: 'g2', name: 'Group B' },
          { id: 'g3', name: 'Group C' },
        ]
      )
    ).toEqual(['Group B']);
  });

  it('clears flags for groups that are no longer eligible', () => {
    const map = { g1: true, g2: true, g3: false };
    expect(clearIneligiblePhase4Flags(map, ['g1'])).toEqual({
      g1: true,
      g2: false,
      g3: false,
    });
    expect(clearIneligiblePhase4Flags(map, ['g1', 'g2'])).toBe(map);
  });
});
