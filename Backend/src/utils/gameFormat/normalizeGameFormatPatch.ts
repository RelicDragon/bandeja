import { EntityType } from '@prisma/client';
import {
  normalizeGameFormatPatch as normalizeGameFormatPatchCore,
  type GameFormatExistingGame,
  type GameFormatPatch,
} from '../../shared/gameFormat';
import { validateScoringPreset } from '../validators/gameFormat';

export type { GameFormatExistingGame, GameFormatPatch };

/**
 * Backend adapter: validates scoring presets then delegates to shared normalization.
 */
export function normalizeGameFormatPatch(params: {
  existingGame: GameFormatExistingGame;
  patch: GameFormatPatch;
  entityType: EntityType;
}): GameFormatPatch {
  const { existingGame, patch, entityType } = params;

  if (patch.scoringPreset !== undefined) {
    const gameType = (patch.gameType as string | undefined) ?? existingGame.gameType ?? 'CLASSIC';
    validateScoringPreset(gameType, patch.scoringPreset);
  } else if (patch.gameType !== undefined) {
    validateScoringPreset(patch.gameType as string, existingGame.scoringPreset);
  }

  return normalizeGameFormatPatchCore({
    existingGame,
    patch,
    entityType,
  });
}
