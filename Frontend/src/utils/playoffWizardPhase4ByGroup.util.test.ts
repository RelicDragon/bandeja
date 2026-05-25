import { describe, expect, it } from 'vitest';
import {
  getPhase4FlagForGroup,
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
});
