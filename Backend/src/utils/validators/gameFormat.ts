import { ApiError } from '../ApiError';
import {
  GAME_TYPES,
  SCORING_PRESETS,
  isKnownScoringPreset,
  isPresetLegalForGameType,
  type GameType,
  type ScoringPreset,
} from '../../shared/isPresetLegal';
import { goldenPointAllowedForFormat } from '../../shared/gameFormat/goldenPointAllowed';

export {
  GAME_TYPES,
  SCORING_COMPATIBILITY,
  SCORING_PRESETS,
  type GameType as GameTypeStr,
  type ScoringPreset,
} from '../../shared/isPresetLegal';

export { goldenPointAllowedForFormat };

export const validateScoringPreset = (
  gameType: string | undefined,
  scoringPreset: unknown,
): ScoringPreset | null => {
  if (scoringPreset === null || scoringPreset === undefined) return null;
  if (typeof scoringPreset !== 'string' || !isKnownScoringPreset(scoringPreset)) {
    throw new ApiError(400, `Invalid scoringPreset. Supported: ${SCORING_PRESETS.join(', ')}`);
  }
  const preset = scoringPreset;
  if (!gameType) return preset;
  if (!GAME_TYPES.includes(gameType as GameType)) return preset;
  if (!isPresetLegalForGameType(preset, gameType as GameType)) {
    throw new ApiError(400, `scoringPreset ${preset} is not compatible with gameType ${gameType}`);
  }
  return preset;
};
