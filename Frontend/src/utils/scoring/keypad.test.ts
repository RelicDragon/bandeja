import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import type { ScoringPreset } from '@/types';
import { validateSetScores } from '@/utils/gameResults';
import { getRules } from './rulebook';
import { getKeypadOptions } from './keypad';
import { isLegalSetScore } from './validateSet';

const emptySets: { teamA: number; teamB: number; isTieBreak?: boolean }[] = [];

type RallyCase = {
  label: string;
  sport: (typeof Sports)[keyof typeof Sports];
  preset: ScoringPreset;
  legal: [number, number];
  illegal?: [number, number];
  keypadMaxAtLeast?: number;
};

const RALLY_MATRIX: RallyCase[] = [
  {
    label: 'table tennis Bo3×11',
    sport: Sports.TABLE_TENNIS,
    preset: 'BEST_OF_3_11',
    legal: [11, 4],
    illegal: [11, 10],
    keypadMaxAtLeast: 11,
  },
  {
    label: 'table tennis Bo5×11',
    sport: Sports.TABLE_TENNIS,
    preset: 'BEST_OF_5_11',
    legal: [11, 6],
    keypadMaxAtLeast: 11,
  },
  {
    label: 'table tennis single game to 11',
    sport: Sports.TABLE_TENNIS,
    preset: 'POINTS_11',
    legal: [11, 8],
    illegal: [11, 10],
  },
  {
    label: 'table tennis single game to 21',
    sport: Sports.TABLE_TENNIS,
    preset: 'SINGLE_GAME_21',
    legal: [21, 15],
    illegal: [21, 20],
    keypadMaxAtLeast: 21,
  },
  {
    label: 'badminton Bo3×21 BWF',
    sport: Sports.BADMINTON,
    preset: 'BEST_OF_3_21',
    legal: [21, 19],
    illegal: [21, 20],
    keypadMaxAtLeast: 30,
  },
  {
    label: 'badminton Bo3×15 BWF',
    sport: Sports.BADMINTON,
    preset: 'BEST_OF_3_15',
    legal: [21, 19],
    illegal: [22, 20],
    keypadMaxAtLeast: 21,
  },
  {
    label: 'pickleball Bo3×11 strict',
    sport: Sports.PICKLEBALL,
    preset: 'BEST_OF_3_11',
    legal: [11, 9],
    illegal: [11, 10],
    keypadMaxAtLeast: 13,
  },
  {
    label: 'squash Bo5×11',
    sport: Sports.SQUASH,
    preset: 'BEST_OF_5_11',
    legal: [11, 5],
    keypadMaxAtLeast: 11,
  },
  {
    label: 'squash Bo3×11',
    sport: Sports.SQUASH,
    preset: 'BEST_OF_3_11',
    legal: [13, 11],
    keypadMaxAtLeast: 13,
  },
];

describe('getKeypadOptions rally matrix', () => {
  it.each(RALLY_MATRIX)('$label → FREE mode, not americano PAIRED', ({
    sport,
    preset,
    legal,
    illegal,
    keypadMaxAtLeast,
  }) => {
    const rules = getRules({ sport, scoringPreset: preset } as never);
    const keypad = getKeypadOptions(rules, 0, emptySets);

    expect(keypad.mode).toBe('FREE');
    expect(keypad.pairedTotal).toBeUndefined();
    expect(isLegalSetScore(legal[0], legal[1], rules, 0, emptySets).ok).toBe(true);
    if (illegal) {
      expect(isLegalSetScore(illegal[0], illegal[1], rules, 0, emptySets).ok).toBe(false);
    }
    if (keypadMaxAtLeast !== undefined) {
      expect(keypad.max).toBeGreaterThanOrEqual(keypadMaxAtLeast);
    }
  });
});

describe('getKeypadOptions americano matrix', () => {
  it.each([
    { label: 'padel americano 24', sport: Sports.PADEL, preset: 'POINTS_24' as const, total: 24 },
    { label: 'badminton americano 21', sport: Sports.BADMINTON, preset: 'POINTS_21' as const, total: 21 },
    { label: 'pickleball americano 21', sport: Sports.PICKLEBALL, preset: 'POINTS_21' as const, total: 21 },
  ])('$label → PAIRED mode (ball budget)', ({ sport, preset, total }) => {
    const rules = getRules({ sport, scoringPreset: preset } as never);
    const keypad = getKeypadOptions(rules, 0, emptySets);
    expect(keypad.mode).toBe('PAIRED');
    expect(keypad.pairedTotal).toBe(total);
  });

  it('timed americano uses FREE mode so partial buzzer scores can be entered', () => {
    const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'POINTS_24', matchTimerEnabled: true } as never);
    const keypad = getKeypadOptions(rules, 0, emptySets);
    expect(keypad.mode).toBe('FREE');
    expect(keypad.pairedTotal).toBeUndefined();
    expect(keypad.max).toBe(24);
  });
});

describe('validateSetScores multisport matrix', () => {
  it.each(RALLY_MATRIX)('$label accepts rally scores on save path', ({ sport, preset, legal }) => {
    const game = { sport, scoringPreset: preset, maxTotalPointsPerSet: legal[0] } as never;
    expect(validateSetScores(legal[0], legal[1], game)).toBeNull();
  });

  it.each(RALLY_MATRIX.filter((row) => row.illegal))(
    '$label rejects illegal rally scores on save path',
    ({ sport, preset, illegal }) => {
      const game = { sport, scoringPreset: preset, maxTotalPointsPerSet: illegal![0] } as never;
      expect(validateSetScores(illegal![0], illegal![1], game)).not.toBeNull();
    },
  );

  it.each([
    { sport: Sports.PADEL, preset: 'POINTS_24' as const, total: 24 },
    { sport: Sports.BADMINTON, preset: 'POINTS_21' as const, total: 21 },
    { sport: Sports.PICKLEBALL, preset: 'POINTS_21' as const, total: 21 },
  ])('americano $preset rejects combined total over budget', ({ sport, preset, total }) => {
    const game = { sport, scoringPreset: preset, maxTotalPointsPerSet: total } as never;
    const half = Math.floor(total / 2);
    expect(validateSetScores(half + 1, total - half - 1, game)).toBeNull();
    expect(validateSetScores(half + 2, total - half, game)).toMatch(/cannot exceed/);
  });
});
