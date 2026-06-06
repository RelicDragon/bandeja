import { GameType, MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { getSportConfig } from '@/sport/sportRegistry';
import {
  gameTypeMatchGenerationMismatch,
  isMatchGenerationAllowedForSport,
  resolvePairedMatchGeneration,
} from '@/sport/rotationFormats';
import type { CreateFlowIntent, SportPresetMeta } from '@/sport/createFlow';
import {
  deriveGameType as sharedDeriveGameType,
  filterPresetsForCreateIntent,
  isPresetLegal,
  isPresetLegalForGameType,
  listPresetsForGameType,
  scoringModeFromPreset as sharedScoringModeFromPreset,
} from '@shared/isPresetLegal';

export { PRESETS_BY_MODE, inferPresetTier, presetTierMap } from '@shared/isPresetLegal';

export const DEFAULT_PRESET_BY_MODE: Record<ScoringMode, ScoringPreset> = {
  CLASSIC: 'CLASSIC_BEST_OF_3',
  POINTS: 'POINTS_16',
};

// --- ScoringMode → compatible generation types ---

const ROTATION_GENERATIONS: MatchGenerationType[] = [
  'RANDOM',
  'RATING',
  'ROUND_ROBIN',
  'WINNERS_COURT',
  'ESCALERA',
  'KING_OF_COURT',
];

const ALL_GENERATIONS: MatchGenerationType[] = [
  'HANDMADE',
  'AUTOMATIC',
  'FIXED',
  ...ROTATION_GENERATIONS,
];

export const GENERATIONS_BY_MODE: Record<ScoringMode, MatchGenerationType[]> = {
  CLASSIC: ALL_GENERATIONS,
  POINTS: ALL_GENERATIONS,
};

export const DEFAULT_GENERATION_BY_MODE: Record<ScoringMode, MatchGenerationType> = {
  CLASSIC: 'AUTOMATIC',
  POINTS: 'RANDOM',
};

export const allowedGenerationsForMaxParticipants = (
  maxParticipants: number | undefined,
): MatchGenerationType[] => {
  if (maxParticipants == null) return [...ALL_GENERATIONS];
  if (maxParticipants === 2) return ['AUTOMATIC'];
  if (maxParticipants === 3) return ['AUTOMATIC'];
  if (maxParticipants === 4) return ['AUTOMATIC'];
  if (maxParticipants === 5) return ['AUTOMATIC', ...ROTATION_GENERATIONS];
  return [...ROTATION_GENERATIONS];
};

export const allowedGenerationsForSport = (
  sport: Sport,
  maxParticipants: number | undefined,
  playersPerMatch?: number,
): MatchGenerationType[] => {
  const rot = getSportConfig(sport).rotationFormats;
  return allowedGenerationsForMaxParticipants(maxParticipants).filter(gen =>
    isMatchGenerationAllowedForSport(rot, gen, playersPerMatch),
  );
};

export const clampMatchGenerationType = (
  gen: MatchGenerationType,
  maxParticipants: number | undefined,
): MatchGenerationType => {
  const allowed = allowedGenerationsForMaxParticipants(maxParticipants);
  if (allowed.includes(gen)) return gen;
  return allowed[0]!;
};

export const clampGenerationGameTypePair = (
  gameType: GameType,
  generationType: MatchGenerationType,
): MatchGenerationType => {
  return resolvePairedMatchGeneration(gameType, generationType) as MatchGenerationType;
};

export { gameTypeMatchGenerationMismatch };

/** <= 5 players: automatic matches; otherwise Americano (random rotation). */
export const defaultMatchGenerationForParticipants = (
  mode: ScoringMode,
  maxParticipants: number | undefined,
  _preferredGen: MatchGenerationType,
): MatchGenerationType => {
  if (maxParticipants != null && maxParticipants <= 5) {
    return clampMatchGenerationType(
      effectiveMatchGeneration(mode, 'AUTOMATIC', maxParticipants),
      maxParticipants,
    );
  }
  return clampMatchGenerationType(
    effectiveMatchGeneration(mode, 'RANDOM', maxParticipants),
    maxParticipants,
  );
};

/** POINTS + manual/fixed → Americano when player count is above small-game presets. */
export const effectiveMatchGeneration = (
  mode: ScoringMode,
  gen: MatchGenerationType,
  maxParticipants?: number,
): MatchGenerationType => {
  if (
    mode === 'POINTS' &&
    (gen === 'HANDMADE' || gen === 'FIXED') &&
    !(maxParticipants != null && maxParticipants <= 4)
  ) {
    return DEFAULT_GENERATION_BY_MODE.POINTS;
  }
  return gen;
};

export const scoringModeFromPreset = sharedScoringModeFromPreset;
export const deriveGameType = sharedDeriveGameType;

export const isClassicScoring = (preset: ScoringPreset): boolean => preset.startsWith('CLASSIC_');
export const isClassicPreset = isClassicScoring;
export const isPointsPreset = (preset: ScoringPreset): boolean => preset.startsWith('POINTS_');

const RALLY_MATCH_PRESET_ORDER: ScoringPreset[] = [
  'BEST_OF_3_21',
  'BEST_OF_3_15',
  'BEST_OF_3_11',
  'BEST_OF_5_11',
  'SINGLE_GAME_21',
  'PAR_11',
];

export function isRallyMatchPreset(preset: ScoringPreset): boolean {
  return (
    preset.startsWith('BEST_OF_') || preset === 'SINGLE_GAME_21' || preset === 'PAR_11'
  );
}

export function listRallyMatchPresets(allowed?: ScoringPreset[]): ScoringPreset[] {
  const pool = allowed && allowed.length > 0 ? allowed : RALLY_MATCH_PRESET_ORDER;
  return RALLY_MATCH_PRESET_ORDER.filter((preset) => pool.includes(preset));
}

/** @deprecated Use `listPresetsForGameType` from `@shared/isPresetLegal`. */
export const getCompatibleScorings = (gameType: GameType): ScoringPreset[] =>
  listPresetsForGameType(gameType);

export const DEFAULT_SCORING_BY_FORMAT: Record<GameType, ScoringPreset> = {
  CLASSIC: 'CLASSIC_BEST_OF_3',
  AMERICANO: 'POINTS_16',
  MEXICANO: 'POINTS_16',
  ROUND_ROBIN: 'POINTS_16',
  WINNER_COURT: 'POINTS_16',
  LADDER: 'POINTS_16',
  KOTC: 'POINTS_11',
  CUSTOM: 'CUSTOM',
};

/** @deprecated Use `isPresetLegal`. */
export const isScoringCompatible = (gameType: GameType, preset: ScoringPreset): boolean =>
  isPresetLegalForGameType(preset, gameType);

export function filterScoringPresetsForCreateIntent(
  allowedPresets: ScoringPreset[],
  presetMeta: SportPresetMeta[],
  intent: Exclude<CreateFlowIntent, 'advanced'>,
): ScoringPreset[] {
  return filterPresetsForCreateIntent(allowedPresets, intent, presetMeta);
}

export function resolveWizardAllowedPresets(
  sport: Sport,
  sportAllowed: ScoringPreset[],
  presetMeta: SportPresetMeta[],
  createIntent: CreateFlowIntent | null,
  scoringMode?: ScoringMode | null,
  matchGenerationType?: MatchGenerationType | null,
): ScoringPreset[] {
  if (!createIntent || createIntent === 'advanced') {
    return sportAllowed.filter((preset) =>
      isPresetLegal({
        sport,
        preset,
        allowedScoringPresets: sportAllowed,
        scoringMode,
        matchGenerationType,
      }),
    );
  }
  return sportAllowed.filter((preset) =>
    isPresetLegal({
      sport,
      preset,
      allowedScoringPresets: sportAllowed,
      scoringMode,
      matchGenerationType,
      createIntent,
      presetMeta,
    }),
  );
}
