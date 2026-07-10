import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { getRules, getRulesFromPreset } from './rulebook';
import { isLegalSetScore } from './validateSet';
import { bwfGameScoreCap, validateBwfRallyGameScore, validatePickleballRally11Score } from '@shared/strictValidation';

const emptySets: { teamA: number; teamB: number; isTieBreak?: boolean }[] = [];

describe('strictValidation helpers', () => {
  it('BWF cap is 30 for 21-point games', () => {
    expect(bwfGameScoreCap(21)).toBe(30);
    expect(bwfGameScoreCap(15)).toBe(21);
  });

  it('accepts legal BWF 21-point game scores', () => {
    expect(validateBwfRallyGameScore(21, 19, 21).ok).toBe(true);
    expect(validateBwfRallyGameScore(30, 29, 21).ok).toBe(true);
    expect(validateBwfRallyGameScore(30, 27, 21).ok).toBe(true);
    expect(validateBwfRallyGameScore(22, 20, 21).ok).toBe(true);
  });

  it('rejects illegal BWF 21-point game scores', () => {
    expect(validateBwfRallyGameScore(21, 20, 21).ok).toBe(false);
    expect(validateBwfRallyGameScore(31, 29, 21).ok).toBe(false);
    expect(validateBwfRallyGameScore(29, 29, 21).ok).toBe(false);
  });

  it('pickleball rally to 11 win-by-2', () => {
    expect(validatePickleballRally11Score(11, 9).ok).toBe(true);
    expect(validatePickleballRally11Score(13, 11).ok).toBe(true);
    expect(validatePickleballRally11Score(11, 10).ok).toBe(false);
    expect(validatePickleballRally11Score(14, 11).ok).toBe(false);
  });
});

describe('isLegalSetScore with preset meta', () => {
  it('BWF_21 on badminton BEST_OF_3_21', () => {
    const rules = getRules({ sport: Sports.BADMINTON, scoringPreset: 'BEST_OF_3_21' } as never);
    expect(rules.strictValidation).toBe('BWF_21');
    expect(isLegalSetScore(30, 29, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(21, 20, rules, 0, emptySets).ok).toBe(false);
    expect(isLegalSetScore(31, 29, rules, 0, emptySets).ok).toBe(false);
  });

  it('NONE on badminton POINTS_21 ball budget', () => {
    const rules = getRules({ sport: Sports.BADMINTON, scoringPreset: 'POINTS_21' } as never);
    expect(rules.strictValidation).toBe('NONE');
    expect(isLegalSetScore(12, 9, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(12, 8, rules, 0, emptySets).ok).toBe(false);
  });

  it('timed americano allows partial scores up to the point budget', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'POINTS_24', matchTimerEnabled: true } as never);
    expect(isLegalSetScore(8, 5, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(12, 12, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(13, 12, rules, 0, emptySets).ok).toBe(false);
  });

  it('PICKLEBALL_RALLY_11 on pickleball BEST_OF_3_11', () => {
    const rules = getRules({ sport: Sports.PICKLEBALL, scoringPreset: 'BEST_OF_3_11' } as never);
    expect(rules.strictValidation).toBe('PICKLEBALL_RALLY_11');
    expect(isLegalSetScore(11, 9, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(11, 10, rules, 0, emptySets).ok).toBe(false);
  });

  it('generic BEST_OF_3_11 on table tennis without pickleball strict', () => {
    const rules = getRules({ sport: Sports.TABLE_TENNIS, scoringPreset: 'BEST_OF_3_11' } as never);
    expect(rules.strictValidation).toBe('NONE');
    expect(isLegalSetScore(11, 9, rules, 0, emptySets).ok).toBe(true);
  });

  it('CLASSIC_TIMED_RELAXED allows incomplete games at buzzer', () => {
    const rules = getRules({ sport: Sports.TENNIS, scoringPreset: 'CLASSIC_TIMED' } as never);
    expect(rules.strictValidation).toBe('CLASSIC_TIMED_RELAXED');
    expect(isLegalSetScore(4, 3, rules, 0, emptySets).ok).toBe(true);
  });

  it('BEST_OF_3_15 hook ready when preset exists', () => {
    const skeleton = getRulesFromPreset('BEST_OF_3_15');
    expect(skeleton.totalPointsPerSet).toBe(15);
    const rules = getRules({ sport: Sports.BADMINTON, scoringPreset: 'BEST_OF_3_15' } as never);
    expect(rules.strictValidation).toBe('BWF_15');
    expect(isLegalSetScore(21, 19, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(22, 20, rules, 0, emptySets).ok).toBe(false);
  });

  it('CLASSIC_AUTOMATIC_RELAXED on padel allows any games score', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);
    expect(rules.strictValidation).toBe('CLASSIC_AUTOMATIC_RELAXED');
    expect(isLegalSetScore(4, 3, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(24, 18, rules, 0, emptySets).ok).toBe(true);
    expect(isLegalSetScore(3, 3, rules, 0, emptySets).ok).toBe(true);
  });
});
