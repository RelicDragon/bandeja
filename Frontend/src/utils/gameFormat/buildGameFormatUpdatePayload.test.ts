import { describe, expect, it } from 'vitest';
import { GAME_FORMAT_UPDATE_KEYS } from '@shared/gameFormatUpdateKeys';
import { buildGameFormatUpdatePayload } from './buildGameFormatUpdatePayload';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';

const stubFormat = {
  gameType: 'AMERICANO',
  scoringMode: 'POINTS',
  scoringPreset: 'POINTS_16',
  setupPayload: {
    fixedNumberOfSets: 1,
    maxTotalPointsPerSet: 0,
    matchTimedCapMinutes: 0,
    matchTimerEnabled: false,
    maxPointsPerTeam: 0,
    winnerOfGame: 'BY_SCORES_DELTA',
    winnerOfMatch: 'BY_SCORES',
    matchGenerationType: 'RANDOM',
    pointsPerWin: 3,
    pointsPerLoose: 1,
    pointsPerTie: 2,
    ballsInGames: false,
    scoringPreset: 'POINTS_16',
    deucesBeforeGoldenPoint: null,
  },
} as unknown as UseGameFormatResult;

describe('buildGameFormatUpdatePayload', () => {
  it.each(['GAME', 'LEAGUE', 'LEAGUE_SEASON'] as const)(
    'emits only GAME_FORMAT_UPDATE_KEYS for %s',
    (entityType) => {
      const payload = buildGameFormatUpdatePayload({
        entityType,
        gameFormat: stubFormat,
        playersPerMatch: 4,
        affectsRating: true,
      });
      for (const key of Object.keys(payload)) {
        expect(GAME_FORMAT_UPDATE_KEYS.has(key)).toBe(true);
      }
      expect(payload.affectsRating).toBe(true);
    },
  );
});
