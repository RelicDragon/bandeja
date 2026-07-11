import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { getRules } from './rulebook';
import { computeMatchWinnerLiveScoring, getStandingsMatchOutcome } from './matchWinnerLive';

describe('CLASSIC_AUTOMATIC match winner', () => {
  const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);

  it('single set decides the match', () => {
    expect(computeMatchWinnerLiveScoring([{ teamA: 0, teamB: 6 }], rules)).toBe('B');
    expect(computeMatchWinnerLiveScoring([{ teamA: 5, teamB: 4 }], rules)).toBe('A');
    expect(getStandingsMatchOutcome([{ teamA: 4, teamB: 6 }], rules)).toBe('B');
  });

  it('ignores empty trailing sets', () => {
    const sets = [
      { teamA: 0, teamB: 6 },
      { teamA: 0, teamB: 0 },
    ];
    expect(computeMatchWinnerLiveScoring(sets, rules)).toBe('B');
  });

  it('multiple scored sets use sets won', () => {
    const sets = [
      { teamA: 6, teamB: 4 },
      { teamA: 4, teamB: 6 },
      { teamA: 10, teamB: 8, isTieBreak: true },
    ];
    expect(computeMatchWinnerLiveScoring(sets, rules)).toBe('A');
  });

  it('split sets is a tie', () => {
    const sets = [
      { teamA: 6, teamB: 4 },
      { teamA: 4, teamB: 6 },
    ];
    expect(computeMatchWinnerLiveScoring(sets, rules)).toBe(null);
    expect(getStandingsMatchOutcome(sets, rules)).toBe('tie');
  });

  it('still requires best-of-3 for strict classic', () => {
    const strict = getRules({ scoringPreset: 'CLASSIC_BEST_OF_3' } as never);
    expect(computeMatchWinnerLiveScoring([{ teamA: 0, teamB: 6 }], strict)).toBe(null);
  });
});
