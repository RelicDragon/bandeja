import { describe, expect, it } from 'vitest';
import { noviceFinishDestination } from './postOnboardingPath';

const newcomer = { noviceRank: 0, noviceUnlockedAllAt: null };

describe('noviceFinishDestination', () => {
  it('sends a newcomer who chose "browse" to the Welcome page', () => {
    expect(noviceFinishDestination('/find', newcomer)).toBe('/');
  });

  it('keeps "play soon" (home + compose) for a newcomer', () => {
    expect(noviceFinishDestination('/?playIntentOpen=1', newcomer)).toBe('/?playIntentOpen=1');
  });

  it('leaves everyone else where they chose', () => {
    expect(noviceFinishDestination('/find', { noviceRank: 1, noviceUnlockedAllAt: null })).toBe('/find');
    expect(noviceFinishDestination('/find', { noviceRank: 0, noviceUnlockedAllAt: '2026-10-05' })).toBe('/find');
    expect(noviceFinishDestination('/find', {})).toBe('/find');
  });
});
