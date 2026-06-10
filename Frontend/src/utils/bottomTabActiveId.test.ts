import { describe, expect, it } from 'vitest';
import { parseLocation } from '@/utils/urlSchema';
import { resolveBottomTabActiveId } from '@/utils/bottomTabActiveId';

describe('resolveBottomTabActiveId', () => {
  it('returns null on profile so no bottom tab is highlighted', () => {
    const { place } = parseLocation('/profile', '');
    expect(resolveBottomTabActiveId(place)).toBeNull();
  });

  it('returns my on home', () => {
    const { place } = parseLocation('/', '');
    expect(resolveBottomTabActiveId(place)).toBe('my');
  });

  it('returns find on find', () => {
    const { place } = parseLocation('/find', '');
    expect(resolveBottomTabActiveId(place)).toBe('find');
  });
});
