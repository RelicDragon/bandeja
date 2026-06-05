import { GAME_FORMAT_UPDATE_KEYS } from '@shared/gameFormatUpdateKeys';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { EntityType } from '@/types';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';

export type BuildGameFormatUpdateParams = {
  entityType: EntityType;
  gameFormat: UseGameFormatResult;
  playersPerMatch?: number;
  affectsRating?: boolean;
};

export function buildGameFormatUpdatePayload({
  entityType,
  gameFormat,
  playersPerMatch,
  affectsRating,
}: BuildGameFormatUpdateParams): Record<string, unknown> {
  const setup = gameFormat.setupPayload;
  const winnerOfGame =
    entityType === 'LEAGUE_SEASON' && setup.winnerOfGame === 'BY_POINTS'
      ? gameFormat.scoringMode === 'POINTS'
        ? 'BY_SCORES_DELTA'
        : 'BY_MATCHES_WON'
      : setup.winnerOfGame;

  const rankingPointsPayload =
    entityType === 'LEAGUE_SEASON'
      ? {}
      : {
          pointsPerWin: setup.pointsPerWin,
          pointsPerLoose: setup.pointsPerLoose,
          pointsPerTie: setup.pointsPerTie,
        };

  const matchFormatPatch =
    entityType === 'GAME' || entityType === 'LEAGUE'
      ? {
          ...(playersPerMatch !== undefined ? { playersPerMatch } : {}),
          ...(playersPerMatch === 2
            ? { hasFixedTeams: false, allowUserInMultipleTeams: false }
            : {}),
        }
      : {};

  const raw: Record<string, unknown> = {
    ...resultsRoundGenV2Payload,
    gameType: gameFormat.gameType,
    scoringMode: gameFormat.scoringMode,
    ...rankingPointsPayload,
    fixedNumberOfSets: setup.fixedNumberOfSets,
    maxTotalPointsPerSet: setup.maxTotalPointsPerSet,
    matchTimedCapMinutes: setup.matchTimedCapMinutes,
    matchTimerEnabled: setup.matchTimerEnabled ?? false,
    maxPointsPerTeam: setup.maxPointsPerTeam,
    winnerOfGame,
    winnerOfMatch: setup.winnerOfMatch,
    matchGenerationType: setup.matchGenerationType,
    ballsInGames: setup.ballsInGames,
    scoringPreset: setup.scoringPreset,
    hasGoldenPoint: setup.hasGoldenPoint,
    ...matchFormatPatch,
    ...(affectsRating !== undefined ? { affectsRating } : {}),
  };

  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (GAME_FORMAT_UPDATE_KEYS.has(key)) {
      payload[key] = raw[key];
    }
  }
  return payload;
}
