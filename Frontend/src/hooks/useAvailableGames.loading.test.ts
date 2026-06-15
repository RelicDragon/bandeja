import { describe, expect, it } from 'vitest';
import { deriveAvailableGamesLoading } from './useAvailableGames';

describe('deriveAvailableGamesLoading', () => {
  it('is false while query gate is closed even if react-query reports pending', () => {
    expect(deriveAvailableGamesLoading(false, true, false, 0)).toBe(false);
  });

  it('is true while first fetch runs after gate opens', () => {
    expect(deriveAvailableGamesLoading(true, true, true, 0)).toBe(true);
  });

  it('is false after data arrives', () => {
    expect(deriveAvailableGamesLoading(true, false, false, 3)).toBe(false);
  });
});
