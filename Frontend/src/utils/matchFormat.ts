import { getSportConfig } from '@/sport/sportRegistry';
import type { Sport } from '@/types';

export type PlayersPerMatch = 2 | 4;

export function isDoublesMatch(playersPerMatch: number): boolean {
  return playersPerMatch === 4;
}

export function resolvePlayersPerMatchForGame(game: {
  playersPerMatch?: number | null;
  sport?: Sport | string | null;
}): PlayersPerMatch {
  if (game.playersPerMatch === 2 || game.playersPerMatch === 4) {
    return game.playersPerMatch;
  }
  return getSportConfig(game.sport).defaultPlayersPerMatch;
}

export type RosterMatchFormatSync = {
  playersPerMatch: number;
  resetFixedTeams: boolean;
};

/** When roster size changes: 2 slots → 1v1; 2 → 4+ slots → sport default match format. */
export function syncPlayersPerMatchOnRosterChange(
  prevMaxParticipants: number,
  nextMaxParticipants: number,
  defaultPlayersPerMatch: number,
  allowedPlayerCountsPerMatch: number[],
): RosterMatchFormatSync | null {
  if (nextMaxParticipants === 2) {
    return { playersPerMatch: 2, resetFixedTeams: true };
  }
  if (nextMaxParticipants >= 4 && prevMaxParticipants === 2) {
    const playersPerMatch = allowedPlayerCountsPerMatch.includes(defaultPlayersPerMatch)
      ? defaultPlayersPerMatch
      : (allowedPlayerCountsPerMatch[0] ?? defaultPlayersPerMatch);
    return { playersPerMatch, resetFixedTeams: false };
  }
  return null;
}
