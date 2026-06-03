import type { Sport } from './sportIds';
import { Sports } from './sportIds';
import type { GameTypeStr, ScoringPreset } from '../utils/validators/gameFormat';

export type RotationPolicy = {
  americano: boolean;
  mexicano: boolean;
  winnersCourt: boolean;
  ladder: boolean;
  /** Multi-court king-of-the-court with challenger pool (C6). */
  kotc: boolean;
  /** Everyone-plays-everyone schedule (singles or fixed teams). */
  roundRobin?: boolean;
  /** RANDOM / AMERICANO only when playersPerMatch === 4 */
  americanoDoublesOnly?: boolean;
  minRotationRoster?: number;
  defaultAmericanoPreset?: ScoringPreset;
};

export const ROTATION_BY_SPORT: Record<Sport, RotationPolicy> = {
  [Sports.PADEL]: {
    americano: true,
    mexicano: true,
    winnersCourt: true,
    ladder: true,
    kotc: true,
    minRotationRoster: 4,
    defaultAmericanoPreset: 'POINTS_24',
  },
  [Sports.TENNIS]: {
    americano: false,
    mexicano: false,
    winnersCourt: false,
    ladder: false,
    kotc: false,
  },
  [Sports.PICKLEBALL]: {
    americano: true,
    mexicano: true,
    winnersCourt: true,
    ladder: false,
    kotc: true,
    americanoDoublesOnly: true,
    minRotationRoster: 4,
    defaultAmericanoPreset: 'POINTS_21',
  },
  [Sports.BADMINTON]: {
    americano: true,
    mexicano: true,
    winnersCourt: true,
    ladder: false,
    kotc: true,
    americanoDoublesOnly: true,
    minRotationRoster: 4,
    defaultAmericanoPreset: 'POINTS_21',
  },
  [Sports.TABLE_TENNIS]: {
    americano: false,
    mexicano: false,
    winnersCourt: false,
    ladder: true,
    kotc: false,
    roundRobin: true,
    minRotationRoster: 4,
  },
  [Sports.SQUASH]: {
    americano: false,
    mexicano: false,
    winnersCourt: true,
    ladder: true,
    kotc: false,
  },
};

const ROTATION_GAME_TYPES: GameTypeStr[] = ['AMERICANO', 'MEXICANO', 'WINNER_COURT', 'LADDER', 'KOTC'];

export function gameTypesFromRotation(rot: RotationPolicy): GameTypeStr[] {
  const types: GameTypeStr[] = ['CLASSIC', 'CUSTOM'];
  if (rot.roundRobin) types.push('ROUND_ROBIN');
  if (rot.americano) types.push('AMERICANO');
  if (rot.mexicano) types.push('MEXICANO');
  if (rot.winnersCourt) types.push('WINNER_COURT');
  if (rot.ladder) types.push('LADDER');
  if (rot.kotc) types.push('KOTC');
  return types;
}

export type RotationFormatKey = 'americano' | 'mexicano' | 'winnersCourt' | 'ladder' | 'kotc';

export const MATCH_GENERATION_TO_ROTATION: Partial<Record<string, RotationFormatKey>> = {
  RANDOM: 'americano',
  RATING: 'mexicano',
  WINNERS_COURT: 'winnersCourt',
  ESCALERA: 'ladder',
  KING_OF_COURT: 'kotc',
};

export const GAME_TYPE_TO_ROTATION: Partial<Record<GameTypeStr, RotationFormatKey>> = {
  AMERICANO: 'americano',
  MEXICANO: 'mexicano',
  WINNER_COURT: 'winnersCourt',
  LADDER: 'ladder',
  KOTC: 'kotc',
};

export function isRotationFormatAllowed(
  rot: RotationPolicy,
  key: RotationFormatKey,
  playersPerMatch?: number,
): boolean {
  if (!rot[key]) return false;
  if (key === 'americano' && rot.americanoDoublesOnly && playersPerMatch === 2) return false;
  return true;
}

export function isRotationGameType(gameType: string): boolean {
  return ROTATION_GAME_TYPES.includes(gameType as GameTypeStr);
}

/** When both are set, rotation generators require this pairing (C3b). */
export const MATCH_GENERATION_EXPECTED_GAME_TYPE: Partial<Record<string, GameTypeStr>> = {
  RANDOM: 'AMERICANO',
  RATING: 'MEXICANO',
  WINNERS_COURT: 'WINNER_COURT',
  ESCALERA: 'LADDER',
  KING_OF_COURT: 'KOTC',
};

export const GAME_TYPE_EXPECTED_MATCH_GENERATION: Partial<Record<GameTypeStr, string>> = {
  AMERICANO: 'RANDOM',
  MEXICANO: 'RATING',
  WINNER_COURT: 'WINNERS_COURT',
  LADDER: 'ESCALERA',
  KOTC: 'KING_OF_COURT',
};

export function gameTypeMatchGenerationMismatch(
  gameType?: string,
  matchGenerationType?: string,
): string | null {
  if (!gameType || !matchGenerationType) return null;
  const expectedFromGen = MATCH_GENERATION_EXPECTED_GAME_TYPE[matchGenerationType];
  if (expectedFromGen && gameType !== expectedFromGen) {
    return `matchGenerationType ${matchGenerationType} requires gameType ${expectedFromGen}`;
  }
  const expectedFromType = GAME_TYPE_EXPECTED_MATCH_GENERATION[gameType as GameTypeStr];
  if (expectedFromType && matchGenerationType !== expectedFromType) {
    return `gameType ${gameType} requires matchGenerationType ${expectedFromType}`;
  }
  return null;
}
