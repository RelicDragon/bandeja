import {
  Sports,
  ALL_SPORTS,
  assertSharedSportMatchesPrisma,
  parseSport,
  DEFAULT_SPORT,
  type Sport,
} from './sportIds';
import { ApiError } from '../utils/ApiError';
import { isSportCreatable } from '../utils/multisportFlags';
import { GAME_TYPES, SCORING_PRESETS, type GameTypeStr, type ScoringPreset as ScoringPresetStr } from '../utils/validators/gameFormat';
import { BADMINTON_QUESTIONNAIRE_V1 } from './questionnaires/badminton';
import { PADEL_QUESTIONNAIRE_V1 } from './questionnaires/padel';
import { PICKLEBALL_QUESTIONNAIRE_V1 } from './questionnaires/pickleball';
import { SQUASH_QUESTIONNAIRE_V1 } from './questionnaires/squash';
import { TABLE_TENNIS_QUESTIONNAIRE_V1 } from './questionnaires/tableTennis';
import { TENNIS_QUESTIONNAIRE_V1 } from './questionnaires/tennis';
import type { SportQuestionnaireConfig } from './questionnaires/types';
import {
  ROTATION_BY_SPORT,
  gameTypesFromRotation,
  type RotationPolicy,
} from './rotationFormats';
import type { CreateTemplateId, SportPresetMeta, SportRatingModel } from '../shared/createTemplates';
import {
  BADMINTON_PRESET_META,
  BADMINTON_RATING_MODEL,
  PADEL_PRESET_META,
  PADEL_RATING_MODEL,
  PICKLEBALL_PRESET_META,
  PICKLEBALL_RATING_MODEL,
  SQUASH_PRESET_META,
  SQUASH_RATING_MODEL,
  TABLE_TENNIS_PRESET_META,
  TABLE_TENNIS_RATING_MODEL,
  TENNIS_PRESET_META,
  TENNIS_RATING_MODEL,
} from '../shared/createTemplates';

export type PlayersPerMatch = 2 | 4;

export type SportConfig = {
  id: Sport;
  labelKey: string;
  defaultPlayersPerMatch: 2 | 4;
  allowedPlayerCountsPerMatch: number[];
  defaultEventRoster: number;
  allowedGameTypes: GameTypeStr[];
  allowedScoringPresets: ScoringPresetStr[];
  defaultScoringPreset: ScoringPresetStr;
  liveScoring: 'padel_doubles' | 'tennis' | 'rally_points' | 'none';
  courtLabelKey: string;
  rotationFormats: RotationPolicy;
  presetMeta: SportPresetMeta[];
  createTemplates: CreateTemplateId[];
  ratingModel: SportRatingModel;
  /** Playtomic `sport` / `sport_ids` string; omit when not on Playtomic. */
  playtomicSportId?: string;
  implemented: boolean;
  questionnaire?: SportQuestionnaireConfig;
};

export type { RotationPolicy } from './rotationFormats';

const PADEL_GAME_TYPES: GameTypeStr[] = [...GAME_TYPES];
const PADEL_SCORING: ScoringPresetStr[] = [...SCORING_PRESETS];

const TENNIS_GAME_TYPES: GameTypeStr[] = ['CLASSIC', 'ROUND_ROBIN', 'CUSTOM'];
const TENNIS_SCORING: ScoringPresetStr[] = [
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

const SQUASH_ROTATION = ROTATION_BY_SPORT[Sports.SQUASH];

const TABLE_TENNIS_SCORING: ScoringPresetStr[] = [
  'POINTS_11',
  'SINGLE_GAME_21',
  'BEST_OF_3_11',
  'BEST_OF_5_11',
  'CUSTOM',
];
const BADMINTON_SCORING: ScoringPresetStr[] = [
  'BEST_OF_3_21',
  'BEST_OF_3_15',
  'POINTS_21',
  'POINTS_15',
  'CUSTOM',
];
const PICKLEBALL_SCORING: ScoringPresetStr[] = [
  'BEST_OF_3_11',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'CUSTOM',
];
const SQUASH_SCORING: ScoringPresetStr[] = ['BEST_OF_5_11', 'BEST_OF_3_11', 'CUSTOM'];

type RallySportExtras = Pick<
  SportConfig,
  'presetMeta' | 'createTemplates' | 'ratingModel' | 'questionnaire' | 'playtomicSportId'
>;

function rallySportConfig(
  id: Sport,
  labelKey: string,
  scoring: ScoringPresetStr[],
  defaultScoringPreset: ScoringPresetStr,
  extras: RallySportExtras,
  overrides: Partial<
    Pick<SportConfig, 'defaultPlayersPerMatch' | 'allowedPlayerCountsPerMatch' | 'allowedGameTypes'>
  > = {},
): SportConfig {
  const rotationFormats = ROTATION_BY_SPORT[id];
  return {
    id,
    labelKey,
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
    ...extras,
    ...overrides,
  };
}

export const SPORT_REGISTRY: Record<Sport, SportConfig> = {
  [Sports.PADEL]: {
    id: Sports.PADEL,
    labelKey: 'sport.padel',
    defaultPlayersPerMatch: 4,
    allowedPlayerCountsPerMatch: [2, 4],
    defaultEventRoster: 4,
    allowedGameTypes: PADEL_GAME_TYPES,
    allowedScoringPresets: PADEL_SCORING,
    defaultScoringPreset: 'CLASSIC_BEST_OF_3',
    liveScoring: 'padel_doubles',
    courtLabelKey: 'sport.court',
    rotationFormats: ROTATION_BY_SPORT[Sports.PADEL],
    playtomicSportId: 'PADEL',
    implemented: true,
    questionnaire: PADEL_QUESTIONNAIRE_V1,
    presetMeta: PADEL_PRESET_META,
    createTemplates: [
      'PADEL_AMERICANO_10',
      'PADEL_AMERICANO_24',
      'PADEL_AMERICANO_20',
      'PADEL_MEXICANO_24',
      'PADEL_CHALLENGER_POOL',
    ],
    ratingModel: PADEL_RATING_MODEL,
  },
  [Sports.TENNIS]: {
    id: Sports.TENNIS,
    labelKey: 'sport.tennis',
    defaultPlayersPerMatch: 2,
    allowedPlayerCountsPerMatch: [2, 4],
    defaultEventRoster: 4,
    allowedGameTypes: TENNIS_GAME_TYPES,
    allowedScoringPresets: TENNIS_SCORING,
    defaultScoringPreset: 'CLASSIC_BEST_OF_3',
    liveScoring: 'tennis',
    courtLabelKey: 'sport.court',
    rotationFormats: ROTATION_BY_SPORT[Sports.TENNIS],
    playtomicSportId: 'TENNIS',
    implemented: true,
    questionnaire: TENNIS_QUESTIONNAIRE_V1,
    presetMeta: TENNIS_PRESET_META,
    createTemplates: ['TENNIS_FAST4_SOCIAL', 'TENNIS_CLASSIC_BO3'],
    ratingModel: TENNIS_RATING_MODEL,
  },
  [Sports.PICKLEBALL]: rallySportConfig(
    Sports.PICKLEBALL,
    'sport.pickleball',
    PICKLEBALL_SCORING,
    'POINTS_21',
    {
      playtomicSportId: 'PICKLEBALL',
      questionnaire: PICKLEBALL_QUESTIONNAIRE_V1,
      presetMeta: PICKLEBALL_PRESET_META,
      createTemplates: ['PICKLEBALL_SOCIAL_21', 'PICKLEBALL_MATCH_BO3_11', 'PICKLEBALL_KOTC_11'],
      ratingModel: PICKLEBALL_RATING_MODEL,
    },
  ),
  [Sports.BADMINTON]: rallySportConfig(
    Sports.BADMINTON,
    'sport.badminton',
    BADMINTON_SCORING,
    'BEST_OF_3_21',
    {
      playtomicSportId: 'BADMINTON',
      questionnaire: BADMINTON_QUESTIONNAIRE_V1,
      presetMeta: BADMINTON_PRESET_META,
      createTemplates: [
        'BADMINTON_AMERICANO_21',
        'BADMINTON_CLUB_3X21',
        'BADMINTON_CLUB_3X15',
        'BADMINTON_MATCH_3X21',
      ],
      ratingModel: BADMINTON_RATING_MODEL,
    },
  ),
  [Sports.TABLE_TENNIS]: rallySportConfig(
    Sports.TABLE_TENNIS,
    'sport.tableTennis',
    TABLE_TENNIS_SCORING,
    'BEST_OF_3_11',
    {
      playtomicSportId: 'TABLE_TENNIS',
      questionnaire: TABLE_TENNIS_QUESTIONNAIRE_V1,
      presetMeta: TABLE_TENNIS_PRESET_META,
      createTemplates: [
        'TT_OPEN_PLAY_11',
        'TT_CLUB_RR_11',
        'TT_BOX_BO3_11',
        'TT_LEGACY_SINGLE_21',
        'TT_MATCH_BO3_11',
        'TT_MATCH_BO5_11',
      ],
      ratingModel: TABLE_TENNIS_RATING_MODEL,
    },
  ),
  [Sports.SQUASH]: rallySportConfig(
    Sports.SQUASH,
    'sport.squash',
    SQUASH_SCORING,
    'BEST_OF_5_11',
    {
      playtomicSportId: 'SQUASH',
      questionnaire: SQUASH_QUESTIONNAIRE_V1,
      presetMeta: SQUASH_PRESET_META,
      createTemplates: ['SQUASH_QUICK_BO3_11'],
      ratingModel: SQUASH_RATING_MODEL,
    },
    {
      allowedPlayerCountsPerMatch: [2],
      allowedGameTypes: gameTypesFromRotation(SQUASH_ROTATION),
    },
  ),
};

export const ALL_SPORT_IDS: Sport[] = [...ALL_SPORTS];

export function getSportConfig(sport: Sport): SportConfig {
  return SPORT_REGISTRY[sport];
}

/** Match size (1v1 / 2v2) from explicit value or sport default. */
export function resolvePlayersPerMatch(sport: Sport, explicit?: unknown): PlayersPerMatch {
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const n = typeof explicit === 'string' ? Number.parseInt(explicit, 10) : explicit;
    if (n === 2 || n === 4) return n;
    throw new ApiError(400, 'playersPerMatch must be 2 or 4');
  }
  return getSportConfig(sport).defaultPlayersPerMatch;
}

export function getImplementedSports(): Sport[] {
  return ALL_SPORT_IDS.filter((id) => SPORT_REGISTRY[id].implemented && isSportCreatable(id));
}

export function resolveSport(input: unknown): Sport {
  return parseSport(input, DEFAULT_SPORT);
}

export const PRISMA_SPORT_ENUM_VALUES: readonly Sport[] = ALL_SPORT_IDS;

export {
  Sports,
  ALL_SPORTS,
  DEFAULT_SPORT,
  isSport,
  parseSport,
  asPrismaSport,
  type Sport,
} from './sportIds';

export type {
  CreateTemplate,
  CreateTemplateId,
  PresetTier,
  SportPresetMeta,
  SportRatingModel,
  StrictValidationId,
  TemplateScoringPreset,
} from '../shared/createTemplates';

export {
  CREATE_TEMPLATES,
  getCreateTemplate,
  getCreateTemplatesForSport,
} from '../shared/createTemplates';

export function assertRegistryMatchesPrismaEnum(): void {
  assertSharedSportMatchesPrisma();
  const registryKeys = new Set(Object.keys(SPORT_REGISTRY));
  for (const v of PRISMA_SPORT_ENUM_VALUES) {
    if (!registryKeys.has(v)) {
      throw new Error(`Sport registry missing Prisma enum value: ${v}`);
    }
  }
  for (const k of registryKeys) {
    if (!(PRISMA_SPORT_ENUM_VALUES as string[]).includes(k)) {
      throw new Error(`Sport registry has unknown sport: ${k}`);
    }
  }
}
