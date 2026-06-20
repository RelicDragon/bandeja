export {
  normalizeGameFormatPatch,
  deriveBallsInGamesFromScoring,
  goldenPointAllowedForFormat,
  normalizeLegacyTimedScoringPreset,
  resolveMatchGenerationType,
} from './normalizeGameFormatPatch';
export {
  clampDeucesBeforeGoldenPoint,
  isGoldenPointActive,
  isGoldenPointEnabled,
  DEUCES_BEFORE_GOLDEN_POINT_MAX,
  legacyHasGoldenPointFromDeuces,
  deucesFromLegacyHasGoldenPoint,
  withLegacyGoldenPointField,
} from './goldenPoint';
export type { DeucesBeforeGoldenPoint } from './goldenPoint';
export type {
  GameFormatExistingGame,
  GameFormatPatch,
  EntityTypeStr,
} from './normalizeGameFormatPatch';
