import { describe, expect, it } from 'vitest';
import { needsPrimarySportSelection } from './needsPrimarySportSelection';
import type { User } from '@/types';

const base = {
  id: 'u1',
  nameIsSet: true,
  primarySportIsSet: true,
  sportsEnabled: [] as User['sportsEnabled'],
} as User;

describe('needsPrimarySportSelection', () => {
  it('legacy user with no sports still does not need modal', () => {
    expect(needsPrimarySportSelection({ ...base, sportsEnabled: [] })).toBe(false);
  });

  it('new user before confirm needs modal', () => {
    expect(
      needsPrimarySportSelection({
        ...base,
        primarySportIsSet: false,
        sportsEnabled: ['PADEL'],
      }),
    ).toBe(true);
  });

  it('waits until name is set', () => {
    expect(
      needsPrimarySportSelection({
        ...base,
        nameIsSet: false,
        primarySportIsSet: false,
      }),
    ).toBe(false);
  });
});
