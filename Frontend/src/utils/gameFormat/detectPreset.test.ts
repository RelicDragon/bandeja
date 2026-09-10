import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  detectInitialCustomPointsTotal,
  detectScoringMode,
  detectScoringPreset,
} from './detectPreset';

const timedNoTarget: Partial<Game> = {
  scoringPreset: null,
  scoringMode: 'POINTS',
  winnerOfMatch: 'BY_SCORES',
  fixedNumberOfSets: 1,
  maxTotalPointsPerSet: 0,
  matchTimerEnabled: true,
};

describe('detectPreset timed no-target', () => {
  it('timed game with total 0 and no preset detects no preset', () => {
    expect(detectScoringPreset(timedNoTarget)).toBeNull();
    expect(detectScoringMode(timedNoTarget)).toBe('POINTS');
    expect(detectInitialCustomPointsTotal(timedNoTarget)).toBeNull();
  });

  it('untimed total-0 without a preset surfaces open-ended Custom', () => {
    expect(detectScoringPreset({ ...timedNoTarget, matchTimerEnabled: false })).toBe('CUSTOM');
    expect(
      detectScoringPreset({ ...timedNoTarget, matchTimerEnabled: false, fixedNumberOfSets: 3 }),
    ).toBe('CUSTOM');
    expect(detectScoringMode({ ...timedNoTarget, matchTimerEnabled: false })).toBe('POINTS');
  });

  it('modeless legacy rows fall back by winnerOfMatch', () => {
    const byScores: Partial<Game> = {
      scoringPreset: null,
      winnerOfMatch: 'BY_SCORES',
      fixedNumberOfSets: 1,
      maxTotalPointsPerSet: 0,
      matchTimerEnabled: true,
    };
    expect(detectScoringMode(byScores)).toBe('POINTS');
    expect(detectScoringMode({ ...byScores, winnerOfMatch: 'BY_SETS' })).toBe('CLASSIC');
    expect(detectScoringMode({ ...byScores, winnerOfMatch: undefined })).toBe('CLASSIC');
  });

  it('custom total games still detect the custom value', () => {
    const game: Partial<Game> = {
      scoringPreset: null,
      scoringMode: 'POINTS',
      winnerOfMatch: 'BY_SCORES',
      maxTotalPointsPerSet: 50,
      matchTimerEnabled: false,
    };
    expect(detectScoringPreset(game)).toBeNull();
    expect(detectScoringMode(game)).toBe('POINTS');
    expect(detectInitialCustomPointsTotal(game)).toBe(50);
  });

  it('stored presets pass through untouched', () => {
    expect(detectScoringPreset({ scoringPreset: 'POINTS_16' })).toBe('POINTS_16');
    expect(detectScoringPreset({ scoringPreset: 'CLASSIC_TIMED' })).toBe('CLASSIC_TIMED');
  });
});
