import { describe, expect, it } from 'vitest';
import { deriveBallsInGamesFromScoring as feDeriveBallsInGames } from './deriveBallsInGames';
import { GAME_FORMAT_UPDATE_KEYS as feFormatKeys } from './gameFormatUpdateKeys';
import { deriveBallsInGamesFromScoring as beDeriveBallsInGames } from '@backend/shared/deriveBallsInGames';
import { GAME_FORMAT_UPDATE_KEYS as beFormatKeys } from '@backend/shared/gameFormatUpdateKeys';

describe('shared module FE/BE parity', () => {
  it('deriveBallsInGamesFromScoring matches backend export', () => {
    const cases = [
      { sport: 'TABLE_TENNIS', scoringPreset: 'CLASSIC_3' },
      { scoringPreset: 'CLASSIC_3' },
      { scoringPreset: 'POINTS_16' },
      { winnerOfMatch: 'BY_SETS', maxTotalPointsPerSet: 0 },
      { winnerOfMatch: 'BY_SCORES', maxTotalPointsPerSet: 0 },
    ] as const;

    for (const input of cases) {
      expect(feDeriveBallsInGames(input)).toBe(beDeriveBallsInGames(input));
    }
  });

  it('GAME_FORMAT_UPDATE_KEYS matches backend export', () => {
    expect([...feFormatKeys].sort()).toEqual([...beFormatKeys].sort());
  });
});
