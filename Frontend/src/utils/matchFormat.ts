import type { Match } from '@/types/gameResults';

export * from '@shared/matchFormat';

export type RosterMatchFormatSync = {
  playersPerMatch: number;
  resetFixedTeams: boolean;
};

export type SportRosterFormatSync = {
  maxParticipants: number;
  playersPerMatch: number;
  resetFixedTeams: boolean;
};

/** When sport changes: apply sport default roster + match format when on the opposite default. */
export function syncRosterOnSportChange(
  maxParticipants: number,
  playersPerMatch: number,
  defaultPlayersPerMatch: number,
  _defaultEventRoster: number,
): SportRosterFormatSync | null {
  if (maxParticipants === 2 && playersPerMatch === 2 && defaultPlayersPerMatch === 4) {
    return {
      maxParticipants: 4,
      playersPerMatch: 4,
      resetFixedTeams: true,
    };
  }
  if (maxParticipants === 4 && playersPerMatch === 4 && defaultPlayersPerMatch === 2) {
    return {
      maxParticipants: 2,
      playersPerMatch: 2,
      resetFixedTeams: true,
    };
  }
  if (
    defaultPlayersPerMatch === 4 &&
    playersPerMatch === 2 &&
    maxParticipants === 4
  ) {
    return {
      maxParticipants: 4,
      playersPerMatch: 4,
      resetFixedTeams: true,
    };
  }
  return null;
}

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
