import { ApiError } from '../ApiError';

export const SCORING_PRESETS = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
  'POINTS_11',
  'POINTS_12',
  'POINTS_15',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'BEST_OF_3_11',
  'BEST_OF_3_15',
  'BEST_OF_3_21',
  'BEST_OF_5_11',
  'PAR_11',
  'SINGLE_GAME_21',
  'TIMED',
  'CUSTOM',
] as const;

export type ScoringPreset = (typeof SCORING_PRESETS)[number];

export const GAME_TYPES = [
  'CLASSIC',
  'AMERICANO',
  'MEXICANO',
  'ROUND_ROBIN',
  'WINNER_COURT',
  'LADDER',
  'KOTC',
  'CUSTOM',
] as const;
export type GameTypeStr = (typeof GAME_TYPES)[number];

const RALLY_SCORINGS: ScoringPreset[] = [
  'POINTS_11',
  'SINGLE_GAME_21',
  'BEST_OF_3_11',
  'BEST_OF_3_15',
  'BEST_OF_3_21',
  'BEST_OF_5_11',
  'PAR_11',
];

const CLASSIC_SCORINGS: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
  'TIMED',
  'CUSTOM',
  ...RALLY_SCORINGS,
];

const POINTS_SCORINGS: ScoringPreset[] = [
  'POINTS_11',
  'POINTS_12',
  'POINTS_15',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'PAR_11',
  'TIMED',
  'CUSTOM',
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
];

export const SCORING_COMPATIBILITY: Record<GameTypeStr, ScoringPreset[]> = {
  CLASSIC: CLASSIC_SCORINGS,
  AMERICANO: POINTS_SCORINGS,
  MEXICANO: POINTS_SCORINGS,
  ROUND_ROBIN: POINTS_SCORINGS,
  WINNER_COURT: POINTS_SCORINGS,
  LADDER: POINTS_SCORINGS,
  KOTC: POINTS_SCORINGS,
  CUSTOM: [...SCORING_PRESETS],
};

/** Golden point / deuce only applies to tennis-style (CLASSIC) formats, not simple points. */
export const goldenPointAllowedForFormat = (
  scoringMode: string | null | undefined,
  scoringPreset: string | null | undefined,
): boolean => {
  if (scoringMode === 'POINTS') return false;
  if (scoringMode === 'CLASSIC') return true;
  return typeof scoringPreset === 'string' && scoringPreset.startsWith('CLASSIC_');
};

export const validateScoringPreset = (
  gameType: string | undefined,
  scoringPreset: unknown
): ScoringPreset | null => {
  if (scoringPreset === null || scoringPreset === undefined) return null;
  if (typeof scoringPreset !== 'string' || !SCORING_PRESETS.includes(scoringPreset as ScoringPreset)) {
    throw new ApiError(400, `Invalid scoringPreset. Supported: ${SCORING_PRESETS.join(', ')}`);
  }
  const preset = scoringPreset as ScoringPreset;
  if (!gameType) return preset;
  if (!GAME_TYPES.includes(gameType as GameTypeStr)) return preset;
  const allowed = SCORING_COMPATIBILITY[gameType as GameTypeStr];
  if (!allowed.includes(preset)) {
    throw new ApiError(400, `scoringPreset ${preset} is not compatible with gameType ${gameType}`);
  }
  return preset;
};
