import { describe, expect, it } from 'vitest';
import { needsCityPicker } from './needsCityPicker';
import type { User } from '@/types';

const base = {
  id: 'u1',
  nameIsSet: true,
  primarySportIsSet: true,
  currentCity: { id: 'c1', name: 'Belgrade', country: 'RS' },
} as User;

describe('needsCityPicker', () => {
  it('waits until sport is confirmed', () => {
    expect(
      needsCityPicker({
        ...base,
        primarySportIsSet: false,
        currentCity: null,
      }),
    ).toBe(false);
  });

  it('needs picker when sport set and no currentCity', () => {
    expect(needsCityPicker({ ...base, currentCity: null })).toBe(true);
  });

  it('skips when city already assigned', () => {
    expect(needsCityPicker(base)).toBe(false);
  });
});
