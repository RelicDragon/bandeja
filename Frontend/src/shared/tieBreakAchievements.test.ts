import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  TIE_BREAK_THRESHOLDS,
  filterThresholdDefinitionsDue,
  isTieBreakSet,
  userSideWonTieBreakSet,
} from '@shared/achievements';

describe('tie-break achievements', () => {
  it('catalog thresholds and rarities', () => {
    const defs = ACHIEVEMENT_CATALOG.filter((d) => d.ruleKind === 'HABIT_TIE_BREAK');
    expect(defs.map((d) => [d.threshold, d.rarity])).toEqual([
      [1, 'COMMON'],
      [5, 'COMMON'],
      [12, 'RARE'],
      [32, 'RARE'],
      [64, 'LEGENDARY'],
    ]);
    expect([...TIE_BREAK_THRESHOLDS]).toEqual([1, 5, 12, 32, 64]);
  });

  it('detects classic 7–6 and flagged super TB, not 6–4', () => {
    expect(isTieBreakSet({ teamAScore: 7, teamBScore: 6, isTieBreak: false })).toBe(true);
    expect(isTieBreakSet({ teamAScore: 6, teamBScore: 7, isTieBreak: false })).toBe(true);
    expect(isTieBreakSet({ teamAScore: 10, teamBScore: 8, isTieBreak: true })).toBe(true);
    expect(isTieBreakSet({ teamAScore: 10, teamBScore: 9, isTieBreak: true })).toBe(true);
    expect(isTieBreakSet({ teamAScore: 6, teamBScore: 4, isTieBreak: false })).toBe(false);
    expect(isTieBreakSet({ teamAScore: 10, teamBScore: 10, isTieBreak: true })).toBe(false);
  });

  it('credits the winning side only', () => {
    const set = { teamAScore: 7, teamBScore: 6, isTieBreak: false };
    expect(userSideWonTieBreakSet({ teamNumber: 1, set })).toBe(true);
    expect(userSideWonTieBreakSet({ teamNumber: 2, set })).toBe(false);
  });

  it('crosses thresholds forward-only', () => {
    const due = filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_TIE_BREAK',
      before: 11,
      after: 12,
      ownedDefinitionIds: new Set(['habit_tie_break_1', 'habit_tie_break_5']),
    }).map((d) => d.id);
    expect(due).toEqual(['habit_tie_break_12']);
  });
});
