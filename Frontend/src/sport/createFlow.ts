import type { EntityType, GameType, MatchGenerationType, ScoringPreset } from '@/types';
import { isCasualCreateFlowGloballyEnabled, isSportCreatable } from '@/config/multisportFlags';
import { ALL_SPORTS, Sports, isSport, type Sport } from '@shared/sport';
import {
  listTemplatesForParticipantSetup,
  type CreateTemplateParticipantContext,
} from '@/sport/createTemplateParticipantFit';
import {
  parseGameOfficiatingLevel,
  resolveOfficiatingLevel,
  type OfficiatingLevel,
} from '@shared/officiatingLevel';

export type PresetTier = 'social' | 'match' | 'both';

export type CreateFlowIntent = 'social' | 'match' | 'advanced';

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
  /** Honor-system coach UI; match-tier defaults to hints when omitted. */
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

export type CreateTemplate = {
  id: CreateTemplateId;
  sport: Sport;
  tier: 'social' | 'match';
  labelKey: string;
  descriptionKey?: string;
  scoringPreset: ScoringPreset;
  gameType: GameType;
  matchGenerationType: MatchGenerationType;
  playersPerMatch: 2 | 4;
  suggestedMaxParticipants: number;
  suggestedCourts: number;
  affectsRating: boolean;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  expectedDurationLabelKey?: string;
  hasGoldenPoint?: boolean;
};

export type SportCreateFlowConfig = {
  presetMeta: SportPresetMeta[];
  createTemplates: CreateTemplateId[];
};

export const SOCIAL_LEVEL_BAND: [number, number] = [2.0, 5.0];

export const CREATE_TEMPLATES: Record<CreateTemplateId, CreateTemplate> = {
  PADEL_AMERICANO_10: {
    id: 'PADEL_AMERICANO_10',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_AMERICANO_10.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO_10.description',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 10,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PADEL_AMERICANO_24: {
    id: 'PADEL_AMERICANO_24',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_AMERICANO_24.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO_24.description',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PADEL_AMERICANO_20: {
    id: 'PADEL_AMERICANO_20',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_AMERICANO_20.title',
    descriptionKey: 'createGame.templates.PADEL_AMERICANO_20.description',
    scoringPreset: 'POINTS_24',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 16,
    suggestedCourts: 4,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 20,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PADEL_MEXICANO_24: {
    id: 'PADEL_MEXICANO_24',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_MEXICANO_24.title',
    descriptionKey: 'createGame.templates.PADEL_MEXICANO_24.description',
    scoringPreset: 'POINTS_24',
    gameType: 'MEXICANO',
    matchGenerationType: 'RATING',
    playersPerMatch: 4,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PADEL_CHALLENGER_POOL: {
    id: 'PADEL_CHALLENGER_POOL',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_CHALLENGER_POOL.title',
    descriptionKey: 'createGame.templates.PADEL_CHALLENGER_POOL.description',
    scoringPreset: 'POINTS_11',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PADEL_KOTC_11: {
    id: 'PADEL_KOTC_11',
    sport: Sports.PADEL,
    tier: 'social',
    labelKey: 'createGame.templates.PADEL_KOTC_11.title',
    descriptionKey: 'createGame.templates.PADEL_KOTC_11.description',
    scoringPreset: 'POINTS_11',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PICKLEBALL_SOCIAL_21: {
    id: 'PICKLEBALL_SOCIAL_21',
    sport: Sports.PICKLEBALL,
    tier: 'social',
    labelKey: 'createGame.templates.PICKLEBALL_SOCIAL_21.title',
    descriptionKey: 'createGame.templates.PICKLEBALL_SOCIAL_21.description',
    scoringPreset: 'POINTS_21',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  PICKLEBALL_MATCH_BO3_11: {
    id: 'PICKLEBALL_MATCH_BO3_11',
    sport: Sports.PICKLEBALL,
    tier: 'match',
    labelKey: 'createGame.templates.PICKLEBALL_MATCH_BO3_11.title',
    descriptionKey: 'createGame.templates.PICKLEBALL_MATCH_BO3_11.description',
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
    labelKey: 'createGame.templates.PICKLEBALL_KOTC_11.title',
    descriptionKey: 'createGame.templates.PICKLEBALL_KOTC_11.description',
    scoringPreset: 'POINTS_11',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  BADMINTON_CLUB_3X15: {
    id: 'BADMINTON_CLUB_3X15',
    sport: Sports.BADMINTON,
    tier: 'social',
    labelKey: 'createGame.templates.BADMINTON_CLUB_3X15.title',
    descriptionKey: 'createGame.templates.BADMINTON_CLUB_3X15.description',
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
    labelKey: 'createGame.templates.BADMINTON_AMERICANO_21.title',
    descriptionKey: 'createGame.templates.BADMINTON_AMERICANO_21.description',
    scoringPreset: 'POINTS_21',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  BADMINTON_MATCH_3X21: {
    id: 'BADMINTON_MATCH_3X21',
    sport: Sports.BADMINTON,
    tier: 'match',
    labelKey: 'createGame.templates.BADMINTON_MATCH_3X21.title',
    descriptionKey: 'createGame.templates.BADMINTON_MATCH_3X21.description',
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
    labelKey: 'createGame.templates.TT_OPEN_PLAY_11.title',
    descriptionKey: 'createGame.templates.TT_OPEN_PLAY_11.description',
    scoringPreset: 'POINTS_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox90m',
  },
  TT_CLUB_RR_11: {
    id: 'TT_CLUB_RR_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    labelKey: 'createGame.templates.TT_CLUB_RR_11.title',
    descriptionKey: 'createGame.templates.TT_CLUB_RR_11.description',
    scoringPreset: 'POINTS_11',
    gameType: 'ROUND_ROBIN',
    matchGenerationType: 'ROUND_ROBIN',
    playersPerMatch: 2,
    suggestedMaxParticipants: 8,
    suggestedCourts: 2,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 12,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  TT_LEGACY_SINGLE_21: {
    id: 'TT_LEGACY_SINGLE_21',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    labelKey: 'createGame.templates.TT_LEGACY_SINGLE_21.title',
    descriptionKey: 'createGame.templates.TT_LEGACY_SINGLE_21.description',
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
    labelKey: 'createGame.templates.TT_BOX_BO3_11.title',
    descriptionKey: 'createGame.templates.TT_BOX_BO3_11.description',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'LADDER',
    matchGenerationType: 'ESCALERA',
    playersPerMatch: 2,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  TT_MATCH_BO3_11: {
    id: 'TT_MATCH_BO3_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'match',
    labelKey: 'createGame.templates.TT_MATCH_BO3_11.title',
    descriptionKey: 'createGame.templates.TT_MATCH_BO3_11.description',
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
    labelKey: 'createGame.templates.TT_MATCH_BO5_11.title',
    descriptionKey: 'createGame.templates.TT_MATCH_BO5_11.description',
    scoringPreset: 'BEST_OF_5_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
  /** Legacy templates — hidden from create UI; kept for stored templateId on older games. */
  TT_AMERICANO_11: {
    id: 'TT_AMERICANO_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    labelKey: 'createGame.templates.TT_AMERICANO_11.title',
    descriptionKey: 'createGame.templates.TT_AMERICANO_11.description',
    scoringPreset: 'POINTS_11',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  TT_MEXICANO_11: {
    id: 'TT_MEXICANO_11',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    labelKey: 'createGame.templates.TT_MEXICANO_11.title',
    descriptionKey: 'createGame.templates.TT_MEXICANO_11.description',
    scoringPreset: 'POINTS_11',
    gameType: 'MEXICANO',
    matchGenerationType: 'RATING',
    playersPerMatch: 4,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  TT_SWISS_BOX: {
    id: 'TT_SWISS_BOX',
    sport: Sports.TABLE_TENNIS,
    tier: 'social',
    labelKey: 'createGame.templates.TT_SWISS_BOX.title',
    descriptionKey: 'createGame.templates.TT_SWISS_BOX.description',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'LADDER',
    matchGenerationType: 'ESCALERA',
    playersPerMatch: 2,
    suggestedMaxParticipants: 12,
    suggestedCourts: 3,
    affectsRating: false,
    matchTimerEnabled: true,
    matchTimedCapMinutes: 15,
    expectedDurationLabelKey: 'createGame.templates.durationApprox2h',
  },
  TENNIS_FAST4_SOCIAL: {
    id: 'TENNIS_FAST4_SOCIAL',
    sport: Sports.TENNIS,
    tier: 'social',
    labelKey: 'createGame.templates.TENNIS_FAST4_SOCIAL.title',
    descriptionKey: 'createGame.templates.TENNIS_FAST4_SOCIAL.description',
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
    expectedDurationLabelKey: 'createGame.templates.durationApprox90m',
  },
  TENNIS_CLASSIC_BO3: {
    id: 'TENNIS_CLASSIC_BO3',
    sport: Sports.TENNIS,
    tier: 'match',
    labelKey: 'createGame.templates.TENNIS_CLASSIC_BO3.title',
    descriptionKey: 'createGame.templates.TENNIS_CLASSIC_BO3.description',
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
    labelKey: 'createGame.templates.SQUASH_QUICK_BO3_11.title',
    descriptionKey: 'createGame.templates.SQUASH_QUICK_BO3_11.description',
    scoringPreset: 'BEST_OF_3_11',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    suggestedMaxParticipants: 4,
    suggestedCourts: 1,
    affectsRating: true,
  },
};

function meta(
  preset: ScoringPreset,
  tier: PresetTier,
  labelKey: string,
  defaultFor?: 'social' | 'match',
  strictValidation?: StrictValidationId,
  officiatingLevel?: OfficiatingLevel,
): SportPresetMeta {
  return { preset, tier, labelKey, defaultFor, strictValidation, officiatingLevel };
}

export const CREATE_FLOW_BY_SPORT: Record<Sport, SportCreateFlowConfig> = {
  [Sports.PADEL]: {
    presetMeta: [
      meta('POINTS_11', 'social', 'createGame.presetMeta.POINTS_11'),
      meta('POINTS_16', 'social', 'createGame.presetMeta.POINTS_16'),
      meta('POINTS_21', 'social', 'createGame.presetMeta.POINTS_21'),
      meta('POINTS_24', 'social', 'createGame.presetMeta.POINTS_24', 'social'),
      meta('POINTS_32', 'social', 'createGame.presetMeta.POINTS_32'),
      meta('CLASSIC_BEST_OF_3', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_3', 'match', undefined, 'strict'),
      meta('CLASSIC_BEST_OF_5', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_5'),
      meta('CLASSIC_PRO_SET', 'match', 'createGame.presetMeta.CLASSIC_PRO_SET'),
      meta('CLASSIC_SHORT_SET', 'match', 'createGame.presetMeta.CLASSIC_SHORT_SET'),
      meta('CLASSIC_SINGLE_SET', 'match', 'createGame.presetMeta.CLASSIC_SINGLE_SET'),
      meta('CLASSIC_SUPER_TIEBREAK', 'match', 'createGame.presetMeta.CLASSIC_SUPER_TIEBREAK'),
      meta('CLASSIC_TIMED', 'both', 'createGame.presetMeta.CLASSIC_TIMED', undefined, 'CLASSIC_TIMED_RELAXED'),
      meta('BEST_OF_3_11', 'both', 'createGame.presetMeta.BEST_OF_3_11'),
      meta('TIMED', 'social', 'createGame.presetMeta.TIMED'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: [
      'PADEL_AMERICANO_10',
      'PADEL_AMERICANO_24',
      'PADEL_AMERICANO_20',
      'PADEL_MEXICANO_24',
      'PADEL_CHALLENGER_POOL',
    ],
  },
  [Sports.TENNIS]: {
    presetMeta: [
      meta('CLASSIC_BEST_OF_3', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_3', 'match', undefined, 'strict'),
      meta('CLASSIC_TIMED', 'social', 'createGame.presetMeta.CLASSIC_TIMED', 'social', 'CLASSIC_TIMED_RELAXED'),
      meta('TIMED', 'social', 'createGame.presetMeta.TIMED'),
      meta('CLASSIC_BEST_OF_5', 'match', 'createGame.presetMeta.CLASSIC_BEST_OF_5'),
      meta('CLASSIC_PRO_SET', 'match', 'createGame.presetMeta.CLASSIC_PRO_SET'),
      meta('CLASSIC_SHORT_SET', 'match', 'createGame.presetMeta.CLASSIC_SHORT_SET'),
      meta('CLASSIC_SINGLE_SET', 'match', 'createGame.presetMeta.CLASSIC_SINGLE_SET'),
      meta('CLASSIC_SUPER_TIEBREAK', 'match', 'createGame.presetMeta.CLASSIC_SUPER_TIEBREAK'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['TENNIS_FAST4_SOCIAL', 'TENNIS_CLASSIC_BO3'],
  },
  [Sports.PICKLEBALL]: {
    presetMeta: [
      meta('POINTS_16', 'social', 'createGame.presetMeta.POINTS_16'),
      meta('POINTS_21', 'social', 'createGame.presetMeta.POINTS_21', 'social'),
      meta('POINTS_24', 'social', 'createGame.presetMeta.POINTS_24'),
      meta('POINTS_32', 'social', 'createGame.presetMeta.POINTS_32'),
      meta('BEST_OF_3_11', 'match', 'createGame.presetMeta.BEST_OF_3_11', 'match', 'PICKLEBALL_RALLY_11', 'strict'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['PICKLEBALL_SOCIAL_21', 'PICKLEBALL_MATCH_BO3_11', 'PICKLEBALL_KOTC_11'],
  },
  [Sports.BADMINTON]: {
    presetMeta: [
      meta('POINTS_21', 'social', 'createGame.presetMeta.POINTS_21', 'social'),
      meta('BEST_OF_3_21', 'match', 'createGame.presetMeta.BEST_OF_3_21', 'match', 'BWF_21', 'strict'),
      meta('BEST_OF_3_15', 'both', 'createGame.presetMeta.BEST_OF_3_15', undefined, 'BWF_15'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['BADMINTON_AMERICANO_21', 'BADMINTON_CLUB_3X15', 'BADMINTON_MATCH_3X21'],
  },
  [Sports.TABLE_TENNIS]: {
    presetMeta: [
      meta('POINTS_11', 'social', 'createGame.presetMeta.POINTS_11'),
      meta('SINGLE_GAME_21', 'social', 'createGame.presetMeta.SINGLE_GAME_21'),
      meta('BEST_OF_3_11', 'both', 'createGame.presetMeta.BEST_OF_3_11', 'match'),
      meta('BEST_OF_5_11', 'match', 'createGame.presetMeta.BEST_OF_5_11', 'match'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: [
      'TT_OPEN_PLAY_11',
      'TT_CLUB_RR_11',
      'TT_BOX_BO3_11',
      'TT_LEGACY_SINGLE_21',
      'TT_MATCH_BO3_11',
      'TT_MATCH_BO5_11',
    ],
  },
  [Sports.SQUASH]: {
    presetMeta: [
      meta('BEST_OF_5_11', 'match', 'createGame.presetMeta.BEST_OF_5_11', 'match'),
      meta('BEST_OF_3_11', 'match', 'createGame.presetMeta.BEST_OF_3_11'),
      meta('CUSTOM', 'both', 'createGame.presetMeta.CUSTOM'),
    ],
    createTemplates: ['SQUASH_QUICK_BO3_11'],
  },
};

export function getStrictValidationForPreset(
  sport: Sport | string | null | undefined,
  preset: ScoringPreset | string | null | undefined,
): StrictValidationId {
  if (!sport || !preset || !isSport(sport)) return 'NONE';
  const row = CREATE_FLOW_BY_SPORT[sport].presetMeta.find((m) => m.preset === preset);
  return row?.strictValidation ?? 'NONE';
}

export function getOfficiatingLevelForGame(
  sport: Sport | string | null | undefined,
  preset: ScoringPreset | string | null | undefined,
  metadata?: unknown,
): OfficiatingLevel {
  if (!sport || !preset || !isSport(sport)) return 'none';
  const row = CREATE_FLOW_BY_SPORT[sport].presetMeta.find((m) => m.preset === preset);
  return resolveOfficiatingLevel({
    sport,
    preset,
    presetMetaOfficiating: row?.officiatingLevel,
    presetMetaTier: row?.tier,
    gameOfficiatingLevel: parseGameOfficiatingLevel(metadata),
  });
}

export { type OfficiatingLevel } from '@shared/officiatingLevel';

export function isCasualCreateFlowEnabled(
  entityType: EntityType,
  enabledSports: Sport[],
): boolean {
  if (entityType !== 'GAME' && entityType !== 'LEAGUE') return false;
  if (isCasualCreateFlowGloballyEnabled()) {
    return ALL_SPORTS.filter((s) => isSportCreatable(s)).length > 1;
  }
  if (enabledSports.length === 1 && enabledSports[0] === Sports.PADEL) return false;
  return enabledSports.length > 1;
}

export function getCreateFlowConfig(sport: Sport): SportCreateFlowConfig {
  return CREATE_FLOW_BY_SPORT[sport];
}

export function getTemplate(id: CreateTemplateId): CreateTemplate {
  return CREATE_TEMPLATES[id];
}

export function listTemplatesForIntent(
  sport: Sport,
  intent: 'social' | 'match',
  allowedScoringPresets: ScoringPreset[],
  ctx?: CreateTemplateParticipantContext,
): CreateTemplate[] {
  const base = ctx
    ? listTemplatesForParticipantSetup(sport, allowedScoringPresets, ctx)
    : listTemplatesForSport(sport, allowedScoringPresets);
  return base.filter((tpl) => tpl.tier === intent);
}

export {
  listTemplatesForParticipantSetup,
  pickDefaultTemplateId,
  isCreateTemplateCompatible,
  type CreateTemplateParticipantContext,
} from '@/sport/createTemplateParticipantFit';

export function listTemplatesForSport(
  sport: Sport,
  allowedScoringPresets: ScoringPreset[],
): CreateTemplate[] {
  const ids = getCreateFlowConfig(sport).createTemplates;
  return ids
    .map((id) => CREATE_TEMPLATES[id])
    .filter((tpl) => tpl.sport === sport)
    .filter((tpl) => allowedScoringPresets.includes(tpl.scoringPreset));
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

export function presetTierMap(meta: SportPresetMeta[]): Map<ScoringPreset, PresetTier> {
  const map = new Map<ScoringPreset, PresetTier>();
  for (const row of meta) {
    map.set(row.preset, row.tier);
  }
  return map;
}
