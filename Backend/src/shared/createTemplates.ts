/** Canonical create templates — keep in sync with Frontend/shared/createTemplates.ts */
import { Sports, type Sport } from './sport';
import {
  parseGameOfficiatingLevel,
  resolveOfficiatingLevel,
  type OfficiatingLevel,
} from './officiatingLevel';

type ScoringPreset = string;
type GameTypeStr = string;
type MatchGenerationType = string;

export type PresetTier = 'social' | 'match' | 'both';

export type StrictValidationId =
  | 'NONE'
  | 'BWF_21'
  | 'BWF_15'
  | 'PICKLEBALL_RALLY_11'
  | 'CLASSIC_TIMED_RELAXED';

export type SportPresetMeta = {
  preset: ScoringPreset;
  tier: PresetTier;
  labelKey: string;
  defaultFor?: 'social' | 'match';
  strictValidation?: StrictValidationId;
  officiatingLevel?: OfficiatingLevel;
};

export type CreateTemplateId =
  | 'PADEL_AMERICANO_10'
  | 'PADEL_AMERICANO_24'
  | 'PADEL_AMERICANO_20'
  | 'PADEL_MEXICANO_24'
  | 'PADEL_CHALLENGER_POOL'
  | 'PADEL_KOTC_11'
  | 'PICKLEBALL_SOCIAL_21'
  | 'PICKLEBALL_MATCH_BO3_11'
  | 'PICKLEBALL_KOTC_11'
  | 'BADMINTON_CLUB_3X15'
  | 'BADMINTON_CLUB_3X21'
  | 'BADMINTON_AMERICANO_21'
  | 'BADMINTON_MATCH_3X21'
  | 'TT_OPEN_PLAY_11'
  | 'TT_CLUB_RR_11'
  | 'TT_BOX_BO3_11'
  | 'TT_LEGACY_SINGLE_21'
  | 'TT_MATCH_BO3_11'
  | 'TT_MATCH_BO5_11'
  | 'TT_AMERICANO_11'
  | 'TT_MEXICANO_11'
  | 'TT_SWISS_BOX'
  | 'TENNIS_FAST4_SOCIAL'
  | 'TENNIS_CLASSIC_BO3'
  | 'SQUASH_QUICK_BO3_11';

/** Presets referenced by templates before C1 enum rollout. */
export type TemplateScoringPreset = ScoringPreset | 'BEST_OF_3_15' | 'CLASSIC_FAST4';

export type CreateTemplate = {
  id: CreateTemplateId;
  sport: Sport;
  tier: 'social' | 'match';
  scoringPreset: TemplateScoringPreset;
  gameType: GameTypeStr;
  matchGenerationType: MatchGenerationType;
  playersPerMatch: 2 | 4;
  suggestedMaxParticipants: number;
  suggestedCourts: number;
  affectsRating: boolean;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  expectedDurationLabelKey?: string;
  /** Classic no-ad (FAST4). Defaults from preset when omitted. */
  hasGoldenPoint?: boolean;
};

export type SportRatingDisplaySystem =
  | 'PLAYTOMIC'
  | 'NTRP'
  | 'DUPR'
  | 'UTR'
  | 'USATT'
  | 'SQUASHLEVELS'
  | 'NONE';

export type SportRatingModel = {
  id: 'bandeja_elo_v1';
  canonical: { min: number; max: number };
  questionnaireId?: string;
  levelBands: Array<{ min: number; max: number; labelKey: string; hintKey?: string }>;
  engine: {
    maxDeltaPerEvent?: number;
    useScoreMargin: boolean;
    ballsInGamesMargin?: boolean;
  };
  ratesWhen: { affectsRatingTrue: boolean };
  display?: {
    system: SportRatingDisplaySystem;
    mapLevelToHint?: (level: number) => string;
  };
  external?: { provider?: string; profileField?: string };
};

const LEVEL_BANDS_6: SportRatingModel['levelBands'] = [
  { min: 1.0, max: 2.0, labelKey: 'sportRating.band.beginner' },
  { min: 2.0, max: 3.0, labelKey: 'sportRating.band.improver' },
  { min: 3.0, max: 4.0, labelKey: 'sportRating.band.intermediate' },
  { min: 4.0, max: 5.0, labelKey: 'sportRating.band.advanced' },
  { min: 5.0, max: 6.0, labelKey: 'sportRating.band.expert' },
  { min: 6.0, max: 7.0, labelKey: 'sportRating.band.elite' },
];

export const CREATE_TEMPLATES: Record<CreateTemplateId, CreateTemplate> = {
  PADEL_AMERICANO_10: {
    id: 'PADEL_AMERICANO_10',
    sport: Sports.PADEL,
    tier: 'social',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 10,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PADEL_AMERICANO_24: {
    id: 'PADEL_AMERICANO_24',
    sport: Sports.PADEL,
    tier: 'social',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PADEL_AMERICANO_20: {
    id: 'PADEL_AMERICANO_20',
    sport: Sports.PADEL,
    tier: 'social',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 20,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PADEL_MEXICANO_24: {
    id: 'PADEL_MEXICANO_24',
    sport: Sports.PADEL,
    tier: 'social',
    scoringPreset: 'POINTS_24',
    gameType: 'MEXICANO',
    matchGenerationType: 'RATING',
    playersPerMatch: 4,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PADEL_CHALLENGER_POOL: {
    id: 'PADEL_CHALLENGER_POOL',
    sport: Sports.PADEL,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PADEL_KOTC_11: {
    id: 'PADEL_KOTC_11',
    sport: Sports.PADEL,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PICKLEBALL_SOCIAL_21: {
    id: 'PICKLEBALL_SOCIAL_21',
    sport: Sports.PICKLEBALL,
    tier: 'social',
    scoringPreset: 'POINTS_21',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  PICKLEBALL_MATCH_BO3_11: {
    id: 'PICKLEBALL_MATCH_BO3_11',
    sport: Sports.PICKLEBALL,
    tier: 'match',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
  PICKLEBALL_KOTC_11: {
    id: 'PICKLEBALL_KOTC_11',
    sport: Sports.PICKLEBALL,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  BADMINTON_CLUB_3X21: {
    id: 'BADMINTON_CLUB_3X21',
    sport: Sports.BADMINTON,
    tier: 'social',
    scoringPreset: 'BEST_OF_3_21',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
  },
  BADMINTON_CLUB_3X15: {
    id: 'BADMINTON_CLUB_3X15',
    sport: Sports.BADMINTON,
    tier: 'social',
    scoringPreset: 'BEST_OF_3_15',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
  },
  BADMINTON_AMERICANO_21: {
    id: 'BADMINTON_AMERICANO_21',
    sport: Sports.BADMINTON,
    tier: 'social',
    scoringPreset: 'POINTS_21',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  BADMINTON_MATCH_3X21: {
    id: 'BADMINTON_MATCH_3X21',
    sport: Sports.BADMINTON,
    tier: 'match',
    scoringPreset: 'BEST_OF_3_21',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
  TT_OPEN_PLAY_11: {
    id: 'TT_OPEN_PLAY_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx90m',
  },
  TT_CLUB_RR_11: {
    id: 'TT_CLUB_RR_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'ROUND_ROBIN',
    matchGenerationType: 'ROUND_ROBIN',
    playersPerMatch: 2,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  TT_LEGACY_SINGLE_21: {
    id: 'TT_LEGACY_SINGLE_21',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'SINGLE_GAME_21',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: false,
  },
  TT_BOX_BO3_11: {
    id: 'TT_BOX_BO3_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'LADDER',
    matchGenerationType: 'ESCALERA',
    playersPerMatch: 2,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  TT_MATCH_BO3_11: {
    id: 'TT_MATCH_BO3_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'match',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
  TT_MATCH_BO5_11: {
    id: 'TT_MATCH_BO5_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'match',
    scoringPreset: 'BEST_OF_5_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
  TT_AMERICANO_11: {
    id: 'TT_AMERICANO_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  TT_MEXICANO_11: {
    id: 'TT_MEXICANO_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'POINTS_11',
    gameType: 'MEXICANO',
    matchGenerationType: 'RATING',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  TT_SWISS_BOX: {
    id: 'TT_SWISS_BOX',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'LADDER',
    matchGenerationType: 'ESCALERA',
    playersPerMatch: 2,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx2h',
  },
  TENNIS_FAST4_SOCIAL: {
    id: 'TENNIS_FAST4_SOCIAL',
    sport: Sports.TENNIS,
    tier: 'social',
    scoringPreset: 'CLASSIC_FAST4',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: false,
    hasGoldenPoint: true,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'sportRegistry.duration.approx90m',
  },
  TENNIS_CLASSIC_BO3: {
    id: 'TENNIS_CLASSIC_BO3',
    sport: Sports.TENNIS,
    tier: 'match',
    scoringPreset: 'CLASSIC_BEST_OF_3',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
  SQUASH_QUICK_BO3_11: {
    id: 'SQUASH_QUICK_BO3_11',
    sport: Sports.SQUASH,
    tier: 'match',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
};

export function getCreateTemplate(id: CreateTemplateId): CreateTemplate {
  return CREATE_TEMPLATES[id];
}

export function getCreateTemplatesForSport(sport: Sport): CreateTemplate[] {
  return Object.values(CREATE_TEMPLATES).filter((t) => t.sport === sport);
}

export const PADEL_PRESET_META: SportPresetMeta[] = [
  {
    preset: 'POINTS_24',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_24.sport.PADEL',
    defaultFor: 'social',
  },
  {
    preset: 'POINTS_21',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_21.sport.PADEL',
  },
  {
    preset: 'POINTS_16',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_16.sport.PADEL',
  },
  {
    preset: 'POINTS_32',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_32.sport.PADEL',
  },
  {
    preset: 'CLASSIC_BEST_OF_3',
    tier: 'match',
    labelKey: 'gameFormat.scoring.CLASSIC_BEST_OF_3.sport.PADEL',
    defaultFor: 'match',
  },
  {
    preset: 'CLASSIC_BEST_OF_5',
    tier: 'match',
    labelKey: 'gameFormat.scoring.CLASSIC_BEST_OF_5.sport.PADEL',
  },
  {
    preset: 'TIMED',
    tier: 'both',
    labelKey: 'gameFormat.scoring.TIMED.sport.PADEL',
  },
  {
    preset: 'CUSTOM',
    tier: 'both',
    labelKey: 'gameFormat.scoring.CUSTOM.sport.PADEL',
  },
];

export const TENNIS_PRESET_META: SportPresetMeta[] = [
  {
    preset: 'CLASSIC_FAST4',
    tier: 'social',
    labelKey: 'gameFormat.scoring.CLASSIC_FAST4.sport.TENNIS',
    defaultFor: 'social',
  },
  {
    preset: 'CLASSIC_BEST_OF_3',
    tier: 'match',
    labelKey: 'gameFormat.scoring.CLASSIC_BEST_OF_3.sport.TENNIS',
    defaultFor: 'match',
    officiatingLevel: 'strict',
  },
  {
    preset: 'CLASSIC_BEST_OF_5',
    tier: 'match',
    labelKey: 'gameFormat.scoring.CLASSIC_BEST_OF_5.sport.TENNIS',
    officiatingLevel: 'strict',
  },
  {
    preset: 'CLASSIC_SINGLE_SET',
    tier: 'social',
    labelKey: 'gameFormat.scoring.CLASSIC_SINGLE_SET.sport.TENNIS',
    defaultFor: 'social',
  },
  {
    preset: 'CLASSIC_TIMED',
    tier: 'social',
    labelKey: 'gameFormat.scoring.CLASSIC_TIMED.sport.TENNIS',
  },
  {
    preset: 'TIMED',
    tier: 'social',
    labelKey: 'gameFormat.scoring.TIMED.sport.TENNIS',
  },
  {
    preset: 'CUSTOM',
    tier: 'both',
    labelKey: 'gameFormat.scoring.CUSTOM.sport.TENNIS',
  },
];

export const PICKLEBALL_PRESET_META: SportPresetMeta[] = [
  {
    preset: 'POINTS_21',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_21.sport.PICKLEBALL',
    defaultFor: 'social',
  },
  {
    preset: 'POINTS_16',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_16.sport.PICKLEBALL',
  },
  {
    preset: 'POINTS_24',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_24.sport.PICKLEBALL',
  },
  {
    preset: 'BEST_OF_3_11',
    tier: 'match',
    labelKey: 'gameFormat.scoring.BEST_OF_3_11.sport.PICKLEBALL',
    defaultFor: 'match',
    strictValidation: 'PICKLEBALL_RALLY_11',
    officiatingLevel: 'strict',
  },
  {
    preset: 'CUSTOM',
    tier: 'both',
    labelKey: 'gameFormat.scoring.CUSTOM.sport.PICKLEBALL',
  },
];

export const BADMINTON_PRESET_META: SportPresetMeta[] = [
  {
    preset: 'BEST_OF_3_21',
    tier: 'match',
    labelKey: 'gameFormat.scoring.BEST_OF_3_21.sport.BADMINTON',
    defaultFor: 'match',
    strictValidation: 'BWF_21',
    officiatingLevel: 'strict',
  },
  {
    preset: 'BEST_OF_3_15',
    tier: 'both',
    labelKey: 'gameFormat.scoring.BEST_OF_3_15.sport.BADMINTON',
    strictValidation: 'BWF_15',
  },
  {
    preset: 'POINTS_21',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_21.sport.BADMINTON',
    defaultFor: 'social',
  },
  {
    preset: 'POINTS_15',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_15.sport.BADMINTON',
  },
  {
    preset: 'CUSTOM',
    tier: 'both',
    labelKey: 'gameFormat.scoring.CUSTOM.sport.BADMINTON',
  },
];

export const TABLE_TENNIS_PRESET_META: SportPresetMeta[] = [
  {
    preset: 'BEST_OF_3_11',
    tier: 'match',
    labelKey: 'gameFormat.scoring.BEST_OF_3_11.sport.TABLE_TENNIS',
    defaultFor: 'match',
  },
  {
    preset: 'BEST_OF_5_11',
    tier: 'match',
    labelKey: 'gameFormat.scoring.BEST_OF_5_11.sport.TABLE_TENNIS',
  },
  {
    preset: 'POINTS_11',
    tier: 'social',
    labelKey: 'gameFormat.scoring.POINTS_11.sport.TABLE_TENNIS',
    defaultFor: 'social',
  },
  {
    preset: 'SINGLE_GAME_21',
    tier: 'social',
    labelKey: 'gameFormat.scoring.SINGLE_GAME_21.sport.TABLE_TENNIS',
  },
  {
    preset: 'CUSTOM',
    tier: 'both',
    labelKey: 'gameFormat.scoring.CUSTOM.sport.TABLE_TENNIS',
  },
];

export const SQUASH_PRESET_META: SportPresetMeta[] = [
  {
    preset: 'BEST_OF_5_11',
    tier: 'match',
    labelKey: 'gameFormat.scoring.BEST_OF_5_11.sport.SQUASH',
    defaultFor: 'match',
  },
  {
    preset: 'BEST_OF_3_11',
    tier: 'match',
    labelKey: 'gameFormat.scoring.BEST_OF_3_11.sport.SQUASH',
  },
  {
    preset: 'CUSTOM',
    tier: 'both',
    labelKey: 'gameFormat.scoring.CUSTOM.sport.SQUASH',
  },
];

export const PADEL_RATING_MODEL: SportRatingModel = {
  id: 'bandeja_elo_v1',
  canonical: { min: 1.0, max: 7.0 },
  questionnaireId: 'padel-v1',
  levelBands: LEVEL_BANDS_6.map((b, i) => ({
    ...b,
    hintKey: `sportRating.padel.band${i + 1}`,
  })),
  engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true, ballsInGamesMargin: true },
  ratesWhen: { affectsRatingTrue: true },
  display: { system: 'PLAYTOMIC' },
  external: { provider: 'playtomic', profileField: 'externalRatingHint' },
};

export const TENNIS_RATING_MODEL: SportRatingModel = {
  id: 'bandeja_elo_v1',
  canonical: { min: 1.0, max: 7.0 },
  questionnaireId: 'tennis-v1',
  levelBands: LEVEL_BANDS_6,
  engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
  ratesWhen: { affectsRatingTrue: true },
  display: { system: 'NTRP' },
};

export const PICKLEBALL_RATING_MODEL: SportRatingModel = {
  id: 'bandeja_elo_v1',
  canonical: { min: 1.0, max: 7.0 },
  questionnaireId: 'pickleball-v1',
  levelBands: LEVEL_BANDS_6,
  engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
  ratesWhen: { affectsRatingTrue: true },
  display: { system: 'DUPR' },
  external: { provider: 'dupr', profileField: 'externalRatingHint' },
};

export const BADMINTON_RATING_MODEL: SportRatingModel = {
  id: 'bandeja_elo_v1',
  canonical: { min: 1.0, max: 7.0 },
  questionnaireId: 'badminton-v1',
  levelBands: LEVEL_BANDS_6,
  engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
  ratesWhen: { affectsRatingTrue: true },
  display: { system: 'NONE' },
};

export const TABLE_TENNIS_RATING_MODEL: SportRatingModel = {
  id: 'bandeja_elo_v1',
  canonical: { min: 1.0, max: 7.0 },
  questionnaireId: 'table-tennis-v1',
  levelBands: LEVEL_BANDS_6,
  engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
  ratesWhen: { affectsRatingTrue: true },
  display: { system: 'USATT' },
  external: { profileField: 'externalRatingHint' },
};

export function getOfficiatingLevelForGame(
  sport: Sport,
  preset: ScoringPreset | string | null | undefined,
  metadata?: unknown,
): OfficiatingLevel {
  if (!preset) return 'none';
  const lists: SportPresetMeta[][] = [
    PADEL_PRESET_META,
    TENNIS_PRESET_META,
    PICKLEBALL_PRESET_META,
    BADMINTON_PRESET_META,
    TABLE_TENNIS_PRESET_META,
    SQUASH_PRESET_META,
  ];
  const row = lists.flat().find((m) => m.preset === preset);
  return resolveOfficiatingLevel({
    sport,
    preset,
    presetMetaOfficiating: row?.officiatingLevel,
    presetMetaTier: row?.tier,
    gameOfficiatingLevel: parseGameOfficiatingLevel(metadata),
  });
}

export type { OfficiatingLevel } from './officiatingLevel';

export const SQUASH_RATING_MODEL: SportRatingModel = {
  id: 'bandeja_elo_v1',
  canonical: { min: 1.0, max: 7.0 },
  questionnaireId: 'squash-v1',
  levelBands: LEVEL_BANDS_6,
  engine: { maxDeltaPerEvent: 0.2, useScoreMargin: true },
  ratesWhen: { affectsRatingTrue: true },
  display: { system: 'SQUASHLEVELS' },
  external: { provider: 'squashlevels', profileField: 'externalRatingHint' },
};
