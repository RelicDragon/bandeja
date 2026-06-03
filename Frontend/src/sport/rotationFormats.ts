import type { GameType, MatchGenerationType, ScoringPreset } from '@/types';
import { Sports, type Sport } from '@shared/sport';

export type RotationPolicy = {
  americano: boolean;
  mexicano: boolean;
  winnersCourt: boolean;
  ladder: boolean;
  kotc: boolean;
  roundRobin?: boolean;
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

const ROTATION_GAME_TYPES: GameType[] = ['AMERICANO', 'MEXICANO', 'WINNER_COURT', 'LADDER', 'KOTC'];

export function gameTypesFromRotation(rot: RotationPolicy): GameType[] {
  const types: GameType[] = ['CLASSIC', 'CUSTOM'];
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

export const GAME_TYPE_TO_ROTATION: Partial<Record<GameType, RotationFormatKey>> = {
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


export function isMatchGenerationAllowedForSport(
  rot: RotationPolicy,
  gen: MatchGenerationType,
  playersPerMatch?: number,
): boolean {
  const key = MATCH_GENERATION_TO_ROTATION[gen];
  if (!key) return true;
  return isRotationFormatAllowed(rot, key, playersPerMatch);
}

export function isRotationGameType(gameType: string): boolean {
  return ROTATION_GAME_TYPES.includes(gameType as GameType);
}
