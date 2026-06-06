import { GAME_FORMAT_UPDATE_KEYS } from '@shared/gameFormatUpdateKeys';
import { normalizeGameFormatPatch } from '@shared/gameFormat';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { EntityType } from '@/types';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';

export type BuildGameFormatUpdateParams = {
  entityType: EntityType;
  gameFormat: UseGameFormatResult;
  playersPerMatch?: number;
  affectsRating?: boolean;
  existingGame?: Record<string, unknown>;
};

export function buildGameFormatUpdatePayload({
  entityType,
  gameFormat,
  playersPerMatch,
  affectsRating,
  existingGame = {},
}: BuildGameFormatUpdateParams): Record<string, unknown> {
  const setup = gameFormat.setupPayload;

  const raw: Record<string, unknown> = {
    ...resultsRoundGenV2Payload,
    gameType: gameFormat.gameType,
    scoringMode: gameFormat.scoringMode,
    ...(entityType === 'LEAGUE_SEASON'
      ? {}
      : {
          pointsPerWin: setup.pointsPerWin,
          pointsPerLoose: setup.pointsPerLoose,
          pointsPerTie: setup.pointsPerTie,
        }),
    fixedNumberOfSets: setup.fixedNumberOfSets,
    maxTotalPointsPerSet: setup.maxTotalPointsPerSet,
    matchTimedCapMinutes: setup.matchTimedCapMinutes,
    matchTimerEnabled: setup.matchTimerEnabled ?? false,
    maxPointsPerTeam: setup.maxPointsPerTeam,
    winnerOfGame: setup.winnerOfGame,
    winnerOfMatch: setup.winnerOfMatch,
    matchGenerationType: setup.matchGenerationType,
    ballsInGames: setup.ballsInGames,
    scoringPreset: setup.scoringPreset,
    hasGoldenPoint: setup.hasGoldenPoint,
    ...(entityType === 'GAME' || entityType === 'LEAGUE'
      ? playersPerMatch !== undefined
        ? { playersPerMatch }
        : {}
      : {}),
    ...(affectsRating !== undefined ? { affectsRating } : {}),
  };

  const normalized = normalizeGameFormatPatch({
    existingGame,
    patch: raw,
    entityType,
  });

  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(normalized)) {
    if (GAME_FORMAT_UPDATE_KEYS.has(key)) {
      payload[key] = normalized[key];
    }
  }
  return payload;
}
