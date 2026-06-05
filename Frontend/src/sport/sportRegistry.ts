import type { GameType, ScoringPreset } from '@/types';
import { Sports, ALL_SPORTS, parseSport, type Sport } from '@shared/sport';
import {
  CREATE_FLOW_BY_SPORT,
  type CreateTemplateId,
  type SportCreateFlowConfig,
  type SportPresetMeta,
} from '@/sport/createFlow';
import {
  ROTATION_BY_SPORT,
  gameTypesFromRotation,
  type RotationPolicy,
} from '@/sport/rotationFormats';
import { SPORT_RATING_MODELS, type SportRatingModel } from '@/sport/sportRatingModels';
import { isSportCreatable } from '@/config/multisportFlags';

export { Sports, ALL_SPORTS, DEFAULT_SPORT, isSport, parseSport, type Sport } from '@shared/sport';
export {
  getStrictValidationForPreset,
  getCreateFlowConfig,
  getTemplate,
  listTemplatesForIntent,
  CREATE_TEMPLATES,
  type CreateTemplate,
  type CreateTemplateId,
  type StrictValidationId,
  type PresetTier,
  type SportPresetMeta,
} from '@/sport/createFlow';
export {
  ROTATION_BY_SPORT,
  gameTypesFromRotation,
  isRotationFormatAllowed,
  GAME_TYPE_TO_ROTATION,
  MATCH_GENERATION_TO_ROTATION,
  type RotationPolicy,
} from '@/sport/rotationFormats';
export { SPORT_RATING_MODELS, getSportRatingModel, type SportRatingModel } from '@/sport/sportRatingModels';

/** @deprecated Use ALL_SPORTS */
export const SPORT_IDS = ALL_SPORTS;

export type SportConfig = {
  id: Sport;
  labelKey: string;
  /** Sport name in prepositional form for “level in …” phrases (e.g. “tennis”, “теннисе”). */
  inLevelLabelKey: string;
  icon: string;
  defaultPlayersPerMatch: 2 | 4;
  allowedPlayerCountsPerMatch: number[];
  defaultEventRoster: number;
  allowedGameTypes: GameType[];
  allowedScoringPresets: ScoringPreset[];
  defaultScoringPreset: ScoringPreset;
  liveScoring: 'padel_doubles' | 'tennis' | 'rally_points' | 'none';
  courtLabelKey: string;
  rotationFormats: RotationPolicy;
  implemented: boolean;
  presetMeta: SportPresetMeta[];
  createTemplates: CreateTemplateId[];
  ratingModel: SportRatingModel;
};

const PADEL_GAME_TYPES: GameType[] = [
  'CLASSIC',
  'AMERICANO',
  'MEXICANO',
  'ROUND_ROBIN',
  'WINNER_COURT',
  'LADDER',
  'KOTC',
  'CUSTOM',
];

const PADEL_SCORING: ScoringPreset[] = [
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
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'TIMED',
  'CUSTOM',
];

const TENNIS_GAME_TYPES: GameType[] = ['CLASSIC', 'ROUND_ROBIN', 'CUSTOM'];
const TENNIS_SCORING: ScoringPreset[] = [
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
];

const TABLE_TENNIS_SCORING: ScoringPreset[] = [
  'POINTS_11',
  'SINGLE_GAME_21',
  'BEST_OF_3_11',
  'BEST_OF_5_11',
  'CUSTOM',
];
const BADMINTON_SCORING: ScoringPreset[] = [
  'BEST_OF_3_21',
  'BEST_OF_3_15',
  'POINTS_21',
  'POINTS_15',
  'CUSTOM',
];
const PICKLEBALL_SCORING: ScoringPreset[] = [
  'BEST_OF_3_11',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'CUSTOM',
];
const SQUASH_SCORING: ScoringPreset[] = ['BEST_OF_5_11', 'BEST_OF_3_11', 'CUSTOM'];

function inLevelLabelKey(labelKey: string): string {
  return `${labelKey}InLevel`;
}

function withCreateFlow(
  config: Omit<SportConfig, 'presetMeta' | 'createTemplates' | 'ratingModel'> & {
    rotationFormats: RotationPolicy;
  },
): SportConfig {
  const flow: SportCreateFlowConfig = CREATE_FLOW_BY_SPORT[config.id];
  return {
    ...config,
    presetMeta: flow.presetMeta,
    createTemplates: flow.createTemplates,
    ratingModel: SPORT_RATING_MODELS[config.id],
  };
}

function rallySportConfig(
  id: Sport,
  labelKey: string,
  icon: string,
  scoring: ScoringPreset[],
  defaultScoringPreset: ScoringPreset,
  overrides: Partial<Pick<SportConfig, 'defaultPlayersPerMatch' | 'allowedPlayerCountsPerMatch' | 'allowedGameTypes'>> = {},
): SportConfig {
  const rotationFormats = ROTATION_BY_SPORT[id];
  return withCreateFlow({
    id,
    labelKey,
    inLevelLabelKey: inLevelLabelKey(labelKey),
    icon,
    defaultPlayersPerMatch: 2,
    allowedPlayerCountsPerMatch: [2, 4],
    defaultEventRoster: 4,
    allowedGameTypes: gameTypesFromRotation(rotationFormats),
    allowedScoringPresets: scoring,
    defaultScoringPreset,
    liveScoring: 'rally_points',
    courtLabelKey: 'sport.court',
    rotationFormats,
    implemented: true,
    ...overrides,
  });
}

export const SPORT_REGISTRY: Record<Sport, SportConfig> = {
  [Sports.PADEL]: withCreateFlow({
    id: Sports.PADEL,
    labelKey: 'sport.padel',
    inLevelLabelKey: 'sport.padelInLevel',
    icon: '🎾',
    defaultPlayersPerMatch: 4,
    allowedPlayerCountsPerMatch: [2, 4],
    defaultEventRoster: 4,
    allowedGameTypes: PADEL_GAME_TYPES,
    allowedScoringPresets: PADEL_SCORING,
    defaultScoringPreset: 'CLASSIC_BEST_OF_3',
    liveScoring: 'padel_doubles',
    courtLabelKey: 'sport.court',
    rotationFormats: ROTATION_BY_SPORT[Sports.PADEL],
    implemented: true,
  }),
  [Sports.TENNIS]: withCreateFlow({
    id: Sports.TENNIS,
    labelKey: 'sport.tennis',
    inLevelLabelKey: 'sport.tennisInLevel',
    icon: '🎾',
    defaultPlayersPerMatch: 2,
    allowedPlayerCountsPerMatch: [2, 4],
    defaultEventRoster: 4,
    allowedGameTypes: TENNIS_GAME_TYPES,
    allowedScoringPresets: TENNIS_SCORING,
    defaultScoringPreset: 'CLASSIC_BEST_OF_3',
    liveScoring: 'tennis',
    courtLabelKey: 'sport.court',
    rotationFormats: ROTATION_BY_SPORT[Sports.TENNIS],
    implemented: true,
  }),
  [Sports.PICKLEBALL]: rallySportConfig(
    Sports.PICKLEBALL,
    'sport.pickleball',
    '🏓',
    PICKLEBALL_SCORING,
    'POINTS_21',
  ),
  [Sports.BADMINTON]: rallySportConfig(
    Sports.BADMINTON,
    'sport.badminton',
    '🏸',
    BADMINTON_SCORING,
    'BEST_OF_3_21',
  ),
  [Sports.TABLE_TENNIS]: rallySportConfig(
    Sports.TABLE_TENNIS,
    'sport.tableTennis',
    '🏓',
    TABLE_TENNIS_SCORING,
    'BEST_OF_3_11',
  ),
  [Sports.SQUASH]: rallySportConfig(Sports.SQUASH, 'sport.squash', '🎯', SQUASH_SCORING, 'BEST_OF_5_11', {
    allowedPlayerCountsPerMatch: [2],
  }),
};

export function getSportConfig(sport: unknown): SportConfig {
  return SPORT_REGISTRY[parseSport(sport)];
}

export function getImplementedSports(): Sport[] {
  return ALL_SPORTS.filter((id) => SPORT_REGISTRY[id].implemented && isSportCreatable(id));
}
