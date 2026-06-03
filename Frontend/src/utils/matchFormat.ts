import type { Match } from '@/types/gameResults';

export * from '@shared/matchFormat';

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

export function teamSideSlotsFull(
  match: Pick<Match, 'teamA' | 'teamB'>,
  team: 'teamA' | 'teamB',
  maxPerTeam: number,
): boolean {
  const side = match[team];
  for (let i = 0; i < maxPerTeam; i++) {
    const id = side[i];
    if (typeof id !== 'string' || !id.trim()) return false;
  }
  return true;
}

export function capPlayerIds(ids: string[], maxPerTeam: number): string[] {
  return ids.slice(0, maxPerTeam);
}
