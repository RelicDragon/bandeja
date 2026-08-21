import { describe, expect, it } from 'vitest';
import { deriveAvailableGamesLoading } from './useAvailableGames';

describe('deriveAvailableGamesLoading', () => {
  it('is false when query disabled', () => {
    expect(deriveAvailableGamesLoading(false, true, false, false)).toBe(false);
  });

  it('is true while pending', () => {
    expect(deriveAvailableGamesLoading(true, true, true, false)).toBe(true);
  });

  it('is false when settled with data', () => {
    expect(deriveAvailableGamesLoading(true, false, false, true)).toBe(false);
  });

  it('is true while fetching before first data', () => {
    expect(deriveAvailableGamesLoading(true, false, true, false)).toBe(true);
  });

  it('is false while background refetching after data (incl. empty indexOnly)', () => {
    expect(deriveAvailableGamesLoading(true, false, true, true)).toBe(false);
  });

  it('is false when prefetched day data is already in cache', () => {
    expect(deriveAvailableGamesLoading(true, false, false, true)).toBe(false);
  });
});
