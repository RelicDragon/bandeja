import { describe, expect, it } from 'vitest';
import { buildSetupFromFormat, type GameFormatState } from './mergeGameFormat';

const pointsBase: GameFormatState = {
  scoringMode: 'POINTS',
  scoringPreset: 'POINTS_16',
  generationType: 'RANDOM',
  deucesBeforeGoldenPoint: null,
  pointsPerWin: 0,
  pointsPerLoose: 0,
  pointsPerTie: 0,
  winnerOfGame: 'BY_SCORES_DELTA',
  customPointsTotal: null,
  matchTimedCapMinutes: 14,
  matchTimerEnabled: false,
};

describe('buildSetupFromFormat timed POINTS', () => {
  it('timer on with a cap preset persists the timed shape (total 0, no preset)', () => {
    const setup = buildSetupFromFormat({ ...pointsBase, matchTimerEnabled: true });
    expect(setup.maxTotalPointsPerSet).toBe(0);
    expect(setup.scoringPreset).toBeNull();
    expect(setup.matchTimerEnabled).toBe(true);
    expect(setup.matchTimedCapMinutes).toBe(14);
    expect(setup.winnerOfMatch).toBe('BY_SCORES');
    expect(setup.fixedNumberOfSets).toBe(1);
    expect(setup.ballsInGames).toBe(false);
  });

  it('timer on ignores a stale custom target', () => {
    const setup = buildSetupFromFormat({
      ...pointsBase,
      matchTimerEnabled: true,
      customPointsTotal: 50,
    });
    expect(setup.maxTotalPointsPerSet).toBe(0);
    expect(setup.scoringPreset).toBeNull();
  });

  it('timer on with a suspended rally preset keeps POINTS structure', () => {
    const setup = buildSetupFromFormat({
      ...pointsBase,
      scoringPreset: 'BEST_OF_3_21',
      matchTimerEnabled: true,
    });
    expect(setup.maxTotalPointsPerSet).toBe(0);
    expect(setup.scoringPreset).toBeNull();
    expect(setup.winnerOfMatch).toBe('BY_SCORES');
    expect(setup.fixedNumberOfSets).toBe(1);
    expect(setup.ballsInGames).toBe(false);
  });

  it('timer off with a custom target is unchanged', () => {
    const setup = buildSetupFromFormat({ ...pointsBase, customPointsTotal: 50 });
    expect(setup.maxTotalPointsPerSet).toBe(50);
    expect(setup.scoringPreset).toBeNull();
    expect(setup.matchTimerEnabled).toBe(false);
  });

  it('timer off with a cap preset is unchanged', () => {
    const setup = buildSetupFromFormat(pointsBase);
    expect(setup.maxTotalPointsPerSet).toBe(16);
    expect(setup.scoringPreset).toBe('POINTS_16');
  });

  it('untimed open-ended Custom passes through', () => {
    const setup = buildSetupFromFormat({ ...pointsBase, scoringPreset: 'CUSTOM' });
    expect(setup.maxTotalPointsPerSet).toBe(0);
    expect(setup.scoringPreset).toBe('CUSTOM');
    expect(setup.winnerOfMatch).toBe('BY_SCORES');
    expect(setup.ballsInGames).toBe(false);
  });

  it('classic timed path is untouched', () => {
    const setup = buildSetupFromFormat({
      ...pointsBase,
      scoringMode: 'CLASSIC',
      scoringPreset: 'CLASSIC_TIMED',
      matchTimerEnabled: true,
    });
    expect(setup.scoringPreset).toBe('CLASSIC_TIMED');
    expect(setup.winnerOfMatch).toBe('BY_SETS');
    expect(setup.ballsInGames).toBe(true);
  });
});
