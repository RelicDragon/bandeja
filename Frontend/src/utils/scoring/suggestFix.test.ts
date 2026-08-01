import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { getRules } from './rulebook';
import { suggestLegalScores } from './suggestFix';
import { validationMessage } from './messages';

describe('suggestLegalScores STB', () => {
  const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
  const sets = [
    { teamA: 6, teamB: 4, isTieBreak: false },
    { teamA: 4, teamB: 6, isTieBreak: false },
    { teamA: 6, teamB: 0, isTieBreak: true },
  ];

  it('STB entry mode suggests first-to-10 win-by-2 scores, not set games', () => {
    const suggestions = suggestLegalScores(6, 0, rules, 2, sets, {
      isTieBreak: true,
      entryMode: 'SUPER_TIEBREAK',
    });
    expect(suggestions.map((s) => `${s.teamA}:${s.teamB}`)).toEqual(['10:8', '11:9', '12:10']);
    expect(suggestions.every((s) => s.isTieBreak)).toBe(true);
  });

  it('tennis CLASSIC_SUPER_TIEBREAK uses the same first-to-10 win-by-2 shape', () => {
    const tennisRules = getRules({ sport: Sports.TENNIS, scoringPreset: 'CLASSIC_SUPER_TIEBREAK' } as never);
    expect(tennisRules.superTieBreakFirstTo).toBe(10);
    expect(tennisRules.superTieBreakWinBy).toBe(2);
    const suggestions = suggestLegalScores(3, 1, tennisRules, 2, sets, { isTieBreak: true });
    expect(suggestions.map((s) => `${s.teamA}:${s.teamB}`)).toEqual(['10:8', '11:9', '12:10']);
  });
});

describe('STB recommendation copy', () => {
  it('too-low message includes win-by margin', () => {
    const t = ((key: string, opts?: Record<string, unknown>) => {
      if (key === 'gameResults.scoringErrors.superTiebreakTooLow') {
        return `Super tiebreak goes to at least ${opts?.target} points, win by ${opts?.winBy}`;
      }
      return key;
    }) as never;
    expect(validationMessage(t, 'SUPER_TIEBREAK_TOO_LOW', { target: 10, winBy: 2 })).toContain('win by 2');
  });
});
