import { timedCustomCreateAllowed } from './timedCustomPresets';
import type { Sport } from './sport';

/** Canonical scoring preset IDs — keep in sync with Backend/src/shared/isPresetLegal.ts and Prisma `ScoringPreset`. */
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

export type GameType = (typeof GAME_TYPES)[number];
export type ScoringMode = 'CLASSIC' | 'POINTS';
export type MatchGenerationType =
  | 'HANDMADE'
  | 'AUTOMATIC'
  | 'FIXED'
  | 'RANDOM'
  | 'RATING'
  | 'ROUND_ROBIN'
  | 'WINNERS_COURT'
  | 'ESCALERA'
  | 'KING_OF_COURT';

export type PresetTier = 'social' | 'match' | 'both';
export type CreateFlowIntent = 'social' | 'match' | 'advanced';

export type SportPresetMeta = {
  preset: string;
  tier: PresetTier;
};

/**
 * Precedence (first failure → illegal):
 * 1. Known preset enum
 * 2. Sport registry allowlist
 * 3. TIMED/CUSTOM create policy per sport
 * 4. GameType ↔ preset matrix (explicit or derived from scoringMode + matchGenerationType)
 * 5. ScoringMode ↔ preset family when scoringMode provided
 * 6. Create intent / preset tier when createIntent is social | match
 */
export type IsPresetLegalParams = {
  sport: Sport;
  preset: string;
  allowedScoringPresets: readonly string[];
  gameType?: string | null;
  matchGenerationType?: string | null;
  scoringMode?: ScoringMode | null;
  createIntent?: CreateFlowIntent | null;
  presetMeta?: readonly SportPresetMeta[];
};

const RALLY_PRESETS: ScoringPreset[] = [
  'POINTS_11',
  'SINGLE_GAME_21',
  'BEST_OF_3_11',
  'BEST_OF_3_15',
  'BEST_OF_3_21',
  'BEST_OF_5_11',
  'PAR_11',
];

const CLASSIC_FAMILY: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
];

const POINTS_FAMILY: ScoringPreset[] = [
  'POINTS_11',
  'POINTS_12',
  'POINTS_15',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'PAR_11',
];

const OPEN_ENDED: ScoringPreset[] = ['TIMED', 'CUSTOM'];

const CLASSIC_GAME_PRESETS: ScoringPreset[] = [...CLASSIC_FAMILY, ...OPEN_ENDED, ...RALLY_PRESETS];

const ROTATION_GAME_PRESETS: ScoringPreset[] = [
  ...POINTS_FAMILY,
  ...OPEN_ENDED,
  ...CLASSIC_FAMILY,
];

const PRESETS_BY_GAME_TYPE: Record<GameType, readonly ScoringPreset[]> = {
  CLASSIC: CLASSIC_GAME_PRESETS,
  AMERICANO: ROTATION_GAME_PRESETS,
  MEXICANO: ROTATION_GAME_PRESETS,
  ROUND_ROBIN: ROTATION_GAME_PRESETS,
  WINNER_COURT: ROTATION_GAME_PRESETS,
  LADDER: ROTATION_GAME_PRESETS,
  KOTC: ROTATION_GAME_PRESETS,
  CUSTOM: SCORING_PRESETS,
};

const CLASSIC_MODE_PRESETS: readonly ScoringPreset[] = [...CLASSIC_FAMILY, ...OPEN_ENDED];
const POINTS_MODE_PRESETS: readonly ScoringPreset[] = [...POINTS_FAMILY, ...RALLY_PRESETS, ...OPEN_ENDED];

const PRESETS_BY_SCORING_MODE: Record<ScoringMode, readonly ScoringPreset[]> = {
  CLASSIC: CLASSIC_MODE_PRESETS,
  POINTS: POINTS_MODE_PRESETS,
};

/** @deprecated Use `PRESETS_BY_GAME_TYPE` / `isPresetLegalForGameType`. */
export const SCORING_COMPATIBILITY: Record<GameType, readonly ScoringPreset[]> = PRESETS_BY_GAME_TYPE;

/** @deprecated Use `PRESETS_BY_SCORING_MODE` / `isPresetLegalForScoringMode`. */
export const PRESETS_BY_MODE: Record<ScoringMode, readonly ScoringPreset[]> = PRESETS_BY_SCORING_MODE;

export function isKnownScoringPreset(preset: string): preset is ScoringPreset {
  return (SCORING_PRESETS as readonly string[]).includes(preset);
}

export function scoringModeFromPreset(preset: ScoringPreset): ScoringMode {
  if (preset.startsWith('CLASSIC_')) return 'CLASSIC';
  return 'POINTS';
}

export function deriveGameType(mode: ScoringMode, gen: MatchGenerationType): GameType {
  if (gen === 'RANDOM') return 'AMERICANO';
  if (gen === 'RATING') return 'MEXICANO';
  if (gen === 'ROUND_ROBIN') return 'ROUND_ROBIN';
  if (gen === 'WINNERS_COURT') return 'WINNER_COURT';
  if (gen === 'ESCALERA') return 'LADDER';
  if (gen === 'KING_OF_COURT') return 'KOTC';
  if (gen === 'HANDMADE' || gen === 'AUTOMATIC' || gen === 'FIXED') {
    return mode === 'CLASSIC' ? 'CLASSIC' : 'CUSTOM';
  }
  return 'CUSTOM';
}

export function resolveGameTypeForPresetCheck(params: IsPresetLegalParams): GameType | undefined {
  if (params.gameType && (GAME_TYPES as readonly string[]).includes(params.gameType)) {
    return params.gameType as GameType;
  }
  if (params.scoringMode && params.matchGenerationType) {
    return deriveGameType(params.scoringMode, params.matchGenerationType as MatchGenerationType);
  }
  return undefined;
}

export function isPresetLegalForGameType(preset: string, gameType: GameType): boolean {
  if (!isKnownScoringPreset(preset)) return false;
  return PRESETS_BY_GAME_TYPE[gameType].includes(preset);
}

export function isPresetLegalForScoringMode(preset: string, mode: ScoringMode): boolean {
  if (!isKnownScoringPreset(preset)) return false;
  return PRESETS_BY_SCORING_MODE[mode].includes(preset);
}

export function inferPresetTier(preset: ScoringPreset): PresetTier {
  if (
    preset.startsWith('POINTS_') ||
    preset === 'TIMED' ||
    preset === 'PAR_11' ||
    preset === 'SINGLE_GAME_21'
  ) {
    return 'social';
  }
  if (preset.startsWith('CLASSIC_') || preset.startsWith('BEST_OF_')) return 'match';
  return 'both';
}

export function presetTierMap(meta: readonly SportPresetMeta[]): Map<string, PresetTier> {
  const map = new Map<string, PresetTier>();
  for (const row of meta) {
    map.set(row.preset, row.tier);
  }
  return map;
}

export function isPresetLegalForCreateIntent(
  preset: string,
  intent: Exclude<CreateFlowIntent, 'advanced'>,
  presetMeta?: readonly SportPresetMeta[],
): boolean {
  if (!isKnownScoringPreset(preset)) return false;
  const tiers = presetMeta ? presetTierMap(presetMeta) : new Map<string, PresetTier>();
  const tier: PresetTier = tiers.get(preset) ?? inferPresetTier(preset);
  if (intent === 'social') {
    return tier === 'social' || tier === 'both';
  }
  if (tier === 'social') return false;
  if (preset.startsWith('POINTS_') && tier !== 'both') return false;
  return tier === 'match' || tier === 'both';
}

export function isPresetLegal(params: IsPresetLegalParams): boolean {
  const { sport, preset, allowedScoringPresets } = params;
  if (!isKnownScoringPreset(preset)) return false;
  if (!allowedScoringPresets.includes(preset)) return false;
  if (!timedCustomCreateAllowed(sport, preset)) return false;

  const gameType = resolveGameTypeForPresetCheck(params);
  if (gameType && !isPresetLegalForGameType(preset, gameType)) return false;

  if (params.scoringMode && !isPresetLegalForScoringMode(preset, params.scoringMode)) return false;

  if (params.createIntent && params.createIntent !== 'advanced') {
    if (!isPresetLegalForCreateIntent(preset, params.createIntent, params.presetMeta)) return false;
  }

  return true;
}

export function listPresetsForGameType(gameType: GameType): ScoringPreset[] {
  return [...PRESETS_BY_GAME_TYPE[gameType]];
}

export function listPresetsForScoringMode(mode: ScoringMode): ScoringPreset[] {
  return [...PRESETS_BY_SCORING_MODE[mode]];
}

export function filterPresetsForCreateIntent(
  allowedPresets: readonly ScoringPreset[],
  intent: Exclude<CreateFlowIntent, 'advanced'>,
  presetMeta?: readonly SportPresetMeta[],
): ScoringPreset[] {
  return allowedPresets.filter((preset) => isPresetLegalForCreateIntent(preset, intent, presetMeta));
}

export function filterSportPresets(params: Omit<IsPresetLegalParams, 'preset'>): ScoringPreset[] {
  return params.allowedScoringPresets.filter((preset): preset is ScoringPreset =>
    isPresetLegal({ ...params, preset }),
  );
}
