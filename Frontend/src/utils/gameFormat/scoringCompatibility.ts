import { GameType, MatchGenerationType, ScoringMode, ScoringPreset } from '@/types';

// --- Preset groups ---

const CLASSIC_PRESETS: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_TIMED',
];

const POINTS_PRESETS: ScoringPreset[] = ['POINTS_16', 'POINTS_21', 'POINTS_24', 'POINTS_32', 'TIMED'];

const ALL_PRESETS: ScoringPreset[] = [...CLASSIC_PRESETS, ...POINTS_PRESETS, 'CUSTOM'];

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
  if (maxParticipants === 3) return ['HANDMADE', 'FIXED'];
  if (maxParticipants === 4) return ['AUTOMATIC', 'FIXED', 'HANDMADE'];
  return ['HANDMADE', 'FIXED', ...ROTATION_GENERATIONS];
};

export const clampMatchGenerationType = (
  gen: MatchGenerationType,
  maxParticipants: number | undefined,
): MatchGenerationType => {
  const allowed = allowedGenerationsForMaxParticipants(maxParticipants);
  if (allowed.includes(gen)) return gen;
  return allowed[0]!;
};

/** 2 or 4 players: automatic; 3: manual. Otherwise preserve clamped effective choice. */
export const defaultMatchGenerationForParticipants = (
  mode: ScoringMode,
  maxParticipants: number | undefined,
  preferredGen: MatchGenerationType,
): MatchGenerationType => {
  if (maxParticipants === 2 || maxParticipants === 4) {
    return effectiveMatchGeneration(mode, 'AUTOMATIC', maxParticipants);
  }
  if (maxParticipants === 3) {
    return effectiveMatchGeneration(mode, 'HANDMADE', maxParticipants);
  }
  return clampMatchGenerationType(effectiveMatchGeneration(mode, preferredGen, maxParticipants), maxParticipants);
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
  if (gen === 'HANDMADE' || gen === 'AUTOMATIC' || gen === 'FIXED') return mode === 'CLASSIC' ? 'CLASSIC' : 'CUSTOM';
  return 'CUSTOM';
};

// --- Legacy helpers (kept for backward compat with display code) ---

export const isClassicScoring = (preset: ScoringPreset): boolean => preset.startsWith('CLASSIC_');

export const isClassicPreset = isClassicScoring;

export const isPointsPreset = (preset: ScoringPreset): boolean => preset.startsWith('POINTS_');

// Legacy: GameType-based compatibility (kept for rulebook / validation paths)
export const getCompatibleScorings = (gameType: GameType): ScoringPreset[] => {
  if (gameType === 'CLASSIC') return [...CLASSIC_PRESETS, 'TIMED', 'CUSTOM'];
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
  CUSTOM: 'CUSTOM',
};

export const isScoringCompatible = (gameType: GameType, preset: ScoringPreset): boolean =>
  getCompatibleScorings(gameType).includes(preset);
