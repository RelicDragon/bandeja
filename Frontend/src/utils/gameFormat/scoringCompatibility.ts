import { GameType, MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { getSportConfig } from '@/sport/sportRegistry';
import { isMatchGenerationAllowedForSport } from '@/sport/rotationFormats';
import type { CreateFlowIntent, PresetTier, SportPresetMeta } from '@/sport/createFlow';
import { inferPresetTier, presetTierMap } from '@/sport/createFlow';

// --- Preset groups ---

const CLASSIC_PRESETS: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_PRO_SET',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
];

const POINTS_PRESETS: ScoringPreset[] = [
  'POINTS_12',
  'POINTS_15',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
];

const ALL_PRESETS: ScoringPreset[] = [
  ...CLASSIC_PRESETS,
  ...POINTS_PRESETS,
  'TIMED',
  'CLASSIC_TIMED',
  'CUSTOM',
];

// --- ScoringMode → compatible presets ---

export const PRESETS_BY_MODE: Record<ScoringMode, ScoringPreset[]> = {
  CLASSIC: CLASSIC_PRESETS,
  POINTS: POINTS_PRESETS,
};

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

// --- Derive ScoringMode from a preset ---

export const scoringModeFromPreset = (preset: ScoringPreset): ScoringMode => {
  if (preset.startsWith('CLASSIC_')) return 'CLASSIC';
  return 'POINTS';
};

// --- Derive GameType from ScoringMode + MatchGenerationType ---

export const deriveGameType = (mode: ScoringMode, gen: MatchGenerationType): GameType => {
  if (gen === 'RANDOM') return 'AMERICANO';
  if (gen === 'RATING') return 'MEXICANO';
  if (gen === 'ROUND_ROBIN') return 'ROUND_ROBIN';
  if (gen === 'WINNERS_COURT') return 'WINNER_COURT';
  if (gen === 'ESCALERA') return 'LADDER';
  if (gen === 'KING_OF_COURT') return 'KOTC';
  if (gen === 'HANDMADE' || gen === 'AUTOMATIC' || gen === 'FIXED') return mode === 'CLASSIC' ? 'CLASSIC' : 'CUSTOM';
  return 'CUSTOM';
};

// --- Legacy helpers (kept for backward compat with display code) ---

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

// Legacy: GameType-based compatibility (kept for rulebook / validation paths)
export const getCompatibleScorings = (gameType: GameType): ScoringPreset[] => {
  if (gameType === 'CLASSIC') return [...CLASSIC_PRESETS, 'CUSTOM'];
  if (gameType === 'CUSTOM') return ALL_PRESETS;
  return [...CLASSIC_PRESETS, ...POINTS_PRESETS, 'CUSTOM'];
};

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

export const isScoringCompatible = (gameType: GameType, preset: ScoringPreset): boolean =>
  getCompatibleScorings(gameType).includes(preset);

// --- Casual create flow (D1): preset tier filtering ---

export function filterScoringPresetsForCreateIntent(
  allowedPresets: ScoringPreset[],
  presetMeta: SportPresetMeta[],
  intent: Exclude<CreateFlowIntent, 'advanced'>,
): ScoringPreset[] {
  const tiers = presetTierMap(presetMeta);
  return allowedPresets.filter((preset) => {
    const tier: PresetTier = tiers.get(preset) ?? inferPresetTier(preset);
    if (intent === 'social') {
      return tier === 'social' || tier === 'both';
    }
    if (tier === 'social') return false;
    if (preset.startsWith('POINTS_') && tier !== 'both') return false;
    return tier === 'match' || tier === 'both';
  });
}

export function resolveWizardAllowedPresets(
  sportAllowed: ScoringPreset[],
  presetMeta: SportPresetMeta[],
  createIntent: CreateFlowIntent | null,
): ScoringPreset[] {
  if (!createIntent || createIntent === 'advanced') return sportAllowed;
  return filterScoringPresetsForCreateIntent(sportAllowed, presetMeta, createIntent);
}
