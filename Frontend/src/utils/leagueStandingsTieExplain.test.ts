import { describe, expect, it } from 'vitest';
import {
  explainStandingsTieStep,
  standingsTieClusterAnchorId,
  standingsTieClusterKind,
} from './leagueStandingsTieExplain';

describe('standingsTieClusterKind', () => {
  it('marks pairs as h2h and 3+ as mini', () => {
    expect(standingsTieClusterKind(2)).toBe('h2h');
    expect(standingsTieClusterKind(3)).toBe('mini');
  });
});

describe('explainStandingsTieStep', () => {
  const row = (miniWins: number, setDiff: number, gameDiff: number) => ({
    participantId: 'x',
    miniWins,
    setDiff,
    gameDiff,
  });

  it('pair: mutual wins → h2h', () => {
    expect(explainStandingsTieStep(row(2, -4, -10), row(0, 4, 10), 'h2h')).toBe('h2h');
  });

  it('mini: wins then sets then games then nested h2h', () => {
    expect(explainStandingsTieStep(row(2, 0, 0), row(1, 5, 5), 'mini')).toBe('miniWins');
    expect(explainStandingsTieStep(row(1, 3, 0), row(1, 1, 9), 'mini')).toBe('setDiff');
    expect(explainStandingsTieStep(row(1, 2, 5), row(1, 2, 1), 'mini')).toBe('gameDiff');
    expect(explainStandingsTieStep(row(1, 2, 5), row(1, 2, 5), 'mini')).toBe('h2h');
  });
});

describe('standingsTieClusterAnchorId', () => {
  it('is stable for scroll targets', () => {
    expect(standingsTieClusterAnchorId('g1', 4)).toBe('standings-tie-g1-4');
  });
});
