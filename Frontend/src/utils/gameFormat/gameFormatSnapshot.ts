import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { Game, MatchGenerationType } from '@/types';
import {
  clampMatchGenerationType,
  detectScoringMode,
  detectScoringPreset,
  effectiveMatchGeneration,
} from '@/utils/gameFormat';

export type GameFormatTemplateSnapshot = Pick<
  UseGameFormatResult,
  | 'scoringMode'
  | 'scoringPreset'
  | 'generationType'
  | 'matchTimerEnabled'
  | 'matchTimedCapMinutes'
  | 'customPointsTotal'
  | 'winnerOfGame'
  | 'deucesBeforeGoldenPoint'
>;

export function gameFormatSnapshotFromFormat(format: UseGameFormatResult): GameFormatTemplateSnapshot {
  return {
    scoringMode: format.scoringMode,
    scoringPreset: format.scoringPreset,
    generationType: format.generationType,
    matchTimerEnabled: format.matchTimerEnabled,
    matchTimedCapMinutes: format.matchTimedCapMinutes,
    customPointsTotal: format.customPointsTotal,
    winnerOfGame: format.winnerOfGame,
    deucesBeforeGoldenPoint: format.deucesBeforeGoldenPoint,
  };
}

export function gameFormatSnapshotFromGame(game: Partial<Game>): GameFormatTemplateSnapshot {
  const scoringPreset = detectScoringPreset(game) ?? 'CLASSIC_BEST_OF_3';
  const scoringMode = detectScoringMode(game);
  const rawGeneration = (game.matchGenerationType ?? 'ROUND_ROBIN') as MatchGenerationType;
  const generationType = clampMatchGenerationType(
    effectiveMatchGeneration(scoringMode, rawGeneration, game.maxParticipants),
    game.maxParticipants,
  );
  return {
    scoringMode,
    scoringPreset,
    generationType,
    matchTimerEnabled: Boolean(game.matchTimerEnabled),
    matchTimedCapMinutes: game.matchTimedCapMinutes ?? 15,
    customPointsTotal: null,
    winnerOfGame: game.winnerOfGame ?? 'BY_MATCHES_WON',
    deucesBeforeGoldenPoint: game.deucesBeforeGoldenPoint ?? null,
  };
}
