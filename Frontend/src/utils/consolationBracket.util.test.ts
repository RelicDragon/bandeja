import { describe, expect, it } from 'vitest';
import { mainR0MatchCount, supportsConsolationBracket } from './consolationBracket.util';

describe('consolationBracket.util', () => {
  it('requires at least 2 MAIN R0 games', () => {
    expect(mainR0MatchCount(8)).toBe(4);
    expect(supportsConsolationBracket(8)).toBe(true);
    expect(supportsConsolationBracket(4)).toBe(true);
    expect(supportsConsolationBracket(2)).toBe(false);
  });

  it('accounts for play-in shrinking MAIN R0', () => {
    expect(mainR0MatchCount(5)).toBe(2);
    expect(supportsConsolationBracket(5)).toBe(true);
  });
});
