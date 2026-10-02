import { describe, expect, it } from 'vitest';
import type { GameOutcome } from '@/types';
import { formatLevelChange, levelBalance, levelChangeByUserId } from './leagueFixedTeamsMatchup.util';

describe('levelBalance', () => {
  it('returns null when a side has no level', () => {
    expect(levelBalance(null, 3)).toBeNull();
  });

  it('calls a small gap an even match at ~50/50', () => {
    const b = levelBalance(3.1, 3.0)!;
    expect(b.favored).toBeNull();
    expect(b.shareA).toBeGreaterThan(0.5);
    expect(b.shareA).toBeLessThan(0.55);
  });

  it('favours the higher side and clamps the share', () => {
    expect(levelBalance(2, 3)!.favored).toBe('teamB');
    expect(levelBalance(7, 1)!.shareA).toBe(0.88);
    expect(levelBalance(1, 7)!.shareA).toBe(0.12);
  });
});

describe('formatLevelChange', () => {
  it('signs and rounds, hiding zero', () => {
    expect(formatLevelChange(0.0412)).toBe('+0.04');
    expect(formatLevelChange(-0.03)).toBe('−0.03');
    expect(formatLevelChange(0.001)).toBeNull();
  });
});

describe('levelChangeByUserId', () => {
  it('maps outcomes by user id', () => {
    const outcomes = [
      { userId: 'u1', user: { id: 'u1' }, levelChange: 0.05 },
      { userId: 'u2', user: { id: 'u2' }, levelChange: -0.02 },
    ] as unknown as GameOutcome[];
    const m = levelChangeByUserId(outcomes);
    expect(m.get('u1')).toBe(0.05);
    expect(m.get('u2')).toBe(-0.02);
  });
});
