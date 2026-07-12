import { describe, expect, it } from 'vitest';
import { getRules } from './rulebook';
import { getScoreEntryExampleList } from './scoreEntryExamples';

describe('getScoreEntryExampleList automatic relaxed', () => {
  const rules = getRules({ sport: 'PADEL', scoringPreset: 'CLASSIC_AUTOMATIC' } as never);

  it('Set/games mode shows games-only examples within 0–10', () => {
    expect(getScoreEntryExampleList(rules, 'REGULAR', 'GAMES')).toBe('6:4, 7:5, 10:8');
  });

  it('Americano mode shows point-total examples, not set games', () => {
    const examples = getScoreEntryExampleList(rules, 'REGULAR', 'AMERICANO_POINTS');
    expect(examples).not.toContain('6:4');
    expect(examples).toMatch(/\d+:\d+/);
  });

  it('Super tiebreak examples use entry mode even when set geometry is tied decider', () => {
    expect(getScoreEntryExampleList(rules, 'REGULAR', 'SUPER_TIEBREAK')).toBe('10:8, 11:9, 12:10');
  });
});
