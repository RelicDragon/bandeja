import {
  Sports,
  ALL_SPORTS,
  assertSharedSportMatchesPrisma,
  parseSport,
  DEFAULT_SPORT,
  type Sport,
} from './sportIds';
import { ApiError } from '../utils/ApiError';
import { GAME_TYPES, SCORING_PRESETS, type GameTypeStr, type ScoringPreset as ScoringPresetStr } from '../utils/validators/gameFormat';
import { BADMINTON_QUESTIONNAIRE_V1 } from './questionnaires/badminton';
import { PADEL_QUESTIONNAIRE_V1 } from './questionnaires/padel';
import { PICKLEBALL_QUESTIONNAIRE_V1 } from './questionnaires/pickleball';
import { SQUASH_QUESTIONNAIRE_V1 } from './questionnaires/squash';
import { TABLE_TENNIS_QUESTIONNAIRE_V1 } from './questionnaires/tableTennis';
import { TENNIS_QUESTIONNAIRE_V1 } from './questionnaires/tennis';
import type { SportQuestionnaireConfig } from './questionnaires/types';

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
  /** Playtomic `sport` / `sport_ids` string; omit when not on Playtomic. */
  playtomicSportId?: string;
  implemented: boolean;
  questionnaire?: SportQuestionnaireConfig;
};

const PADEL_GAME_TYPES: GameTypeStr[] = [...GAME_TYPES];
const PADEL_SCORING: ScoringPresetStr[] = [...SCORING_PRESETS];

const TENNIS_GAME_TYPES: GameTypeStr[] = ['CLASSIC', 'ROUND_ROBIN', 'CUSTOM'];
const TENNIS_SCORING: ScoringPresetStr[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
  'TIMED',
  'CUSTOM',
];

const RALLY_GAME_TYPES: GameTypeStr[] = ['CLASSIC', 'CUSTOM'];

const TABLE_TENNIS_SCORING: ScoringPresetStr[] = ['POINTS_11', 'BEST_OF_3_11', 'BEST_OF_5_11', 'CUSTOM'];
const BADMINTON_SCORING: ScoringPresetStr[] = ['BEST_OF_3_21', 'POINTS_21', 'CUSTOM'];
const PICKLEBALL_SCORING: ScoringPresetStr[] = [
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'CUSTOM',
];
const SQUASH_SCORING: ScoringPresetStr[] = ['BEST_OF_5_11', 'CUSTOM'];

function rallySportConfig(
  id: Sport,
  labelKey: string,
  scoring: ScoringPresetStr[],
  defaultScoringPreset: ScoringPresetStr,
  overrides: Partial<Pick<SportConfig, 'defaultPlayersPerMatch' | 'allowedPlayerCountsPerMatch'>> = {},
): SportConfig {
  return {
    id,
    labelKey,
    defaultPlayersPerMatch: 2,
    allowedPlayerCountsPerMatch: [2, 4],
    defaultEventRoster: 4,
    allowedGameTypes: RALLY_GAME_TYPES,
    allowedScoringPresets: scoring,
    defaultScoringPreset,
    liveScoring: 'rally_points',
    courtLabelKey: 'sport.court',
    implemented: true,
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
    playtomicSportId: 'PADEL',
    implemented: true,
    questionnaire: PADEL_QUESTIONNAIRE_V1,
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
    playtomicSportId: 'TENNIS',
    implemented: true,
    questionnaire: TENNIS_QUESTIONNAIRE_V1,
  },
  [Sports.PICKLEBALL]: {
    ...rallySportConfig(Sports.PICKLEBALL, 'sport.pickleball', PICKLEBALL_SCORING, 'POINTS_21'),
    playtomicSportId: 'PICKLEBALL',
    questionnaire: PICKLEBALL_QUESTIONNAIRE_V1,
  },
  [Sports.BADMINTON]: {
    ...rallySportConfig(Sports.BADMINTON, 'sport.badminton', BADMINTON_SCORING, 'BEST_OF_3_21'),
    playtomicSportId: 'BADMINTON',
    questionnaire: BADMINTON_QUESTIONNAIRE_V1,
  },
  [Sports.TABLE_TENNIS]: {
    ...rallySportConfig(
      Sports.TABLE_TENNIS,
      'sport.tableTennis',
      TABLE_TENNIS_SCORING,
      'BEST_OF_3_11',
    ),
    playtomicSportId: 'TABLE_TENNIS',
    questionnaire: TABLE_TENNIS_QUESTIONNAIRE_V1,
  },
  [Sports.SQUASH]: {
    ...rallySportConfig(Sports.SQUASH, 'sport.squash', SQUASH_SCORING, 'BEST_OF_5_11', {
      allowedPlayerCountsPerMatch: [2],
    }),
    playtomicSportId: 'SQUASH',
    questionnaire: SQUASH_QUESTIONNAIRE_V1,
  },
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
  return ALL_SPORT_IDS.filter((id) => SPORT_REGISTRY[id].implemented);
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
