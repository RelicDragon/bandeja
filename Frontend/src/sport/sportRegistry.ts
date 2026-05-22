import type { GameType, ScoringPreset } from '@/types';
import { Sports, ALL_SPORTS, parseSport, type Sport } from '@shared/sport';

export { Sports, ALL_SPORTS, DEFAULT_SPORT, isSport, parseSport, type Sport } from '@shared/sport';

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
  implemented: boolean;
};

const PADEL_GAME_TYPES: GameType[] = [
  'CLASSIC',
  'AMERICANO',
  'MEXICANO',
  'ROUND_ROBIN',
  'WINNER_COURT',
  'LADDER',
  'CUSTOM',
];

const PADEL_SCORING: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
  'POINTS_11',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'BEST_OF_3_11',
  'BEST_OF_5_11',
  'PAR_11',
  'TIMED',
  'CUSTOM',
];

const TENNIS_GAME_TYPES: GameType[] = ['CLASSIC', 'ROUND_ROBIN', 'CUSTOM'];
const TENNIS_SCORING: ScoringPreset[] = [
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

const RALLY_GAME_TYPES: GameType[] = ['CLASSIC', 'CUSTOM'];
const TABLE_TENNIS_SCORING: ScoringPreset[] = ['POINTS_11', 'BEST_OF_3_11', 'BEST_OF_5_11', 'CUSTOM'];
const BADMINTON_SCORING: ScoringPreset[] = ['BEST_OF_3_21', 'POINTS_21', 'CUSTOM'];
const PICKLEBALL_SCORING: ScoringPreset[] = [
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'CUSTOM',
];
const SQUASH_SCORING: ScoringPreset[] = ['BEST_OF_5_11', 'CUSTOM'];

function inLevelLabelKey(labelKey: string): string {
  return `${labelKey}InLevel`;
}

function rallySportConfig(
  id: Sport,
  labelKey: string,
  icon: string,
  scoring: ScoringPreset[],
  defaultScoringPreset: ScoringPreset,
  overrides: Partial<Pick<SportConfig, 'defaultPlayersPerMatch' | 'allowedPlayerCountsPerMatch'>> = {},
): SportConfig {
  return {
    id,
    labelKey,
    inLevelLabelKey: inLevelLabelKey(labelKey),
    icon,
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
    implemented: true,
  },
  [Sports.TENNIS]: {
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
    implemented: true,
  },
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
  return ALL_SPORTS.filter((id) => SPORT_REGISTRY[id].implemented);
}
