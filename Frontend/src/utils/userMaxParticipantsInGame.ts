import type { BasicUser } from '@/types';

const TOURNAMENT_STANDARD_CAP = 12;
const LEAGUE_DEFAULT_CAP = 12;

function leagueCap(user: BasicUser | null | undefined): number {
  if (!user) return LEAGUE_DEFAULT_CAP;
  if (user.isAdmin || user.canCreateTournament) return Number.POSITIVE_INFINITY;
  const raw = user.maxParticipantsInGame;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 2) return LEAGUE_DEFAULT_CAP;
  return Math.min(999, Math.floor(raw));
}

export function gameRosterFromMatchFormat(playersPerMatch: number): 2 | 4 {
  return playersPerMatch === 2 ? 2 : 4;
}

export function maxSlotsForUserGameOrLeague(user: BasicUser | null | undefined): number {
  const cap = leagueCap(user);
  if (!Number.isFinite(cap)) return 12;
  return cap;
}

export function maxSlotsForUserTournament(user: BasicUser | null | undefined): number {
  if (!user) return TOURNAMENT_STANDARD_CAP;
  if (user.isAdmin || user.canCreateTournament) return 32;
  return TOURNAMENT_STANDARD_CAP;
}

export function gameOrLeagueParticipantOptions(user: BasicUser | null | undefined): number[] {
  const max = maxSlotsForUserGameOrLeague(user);
  return Array.from({ length: Math.max(0, max - 1) }, (_, i) => i + 2);
}

/** League roster sizes: 2…user cap, never 3. */
export function gameLeagueRosterOptions(user: BasicUser | null | undefined): number[] {
  return gameOrLeagueParticipantOptions(user).filter((n) => n !== 3);
}

/** Training roster: 1…24 (even and odd). */
export function trainingParticipantOptions(): number[] {
  return Array.from({ length: 24 }, (_, i) => i + 1);
}

export function tournamentParticipantOptions(user: BasicUser | null | undefined): number[] {
  const max = maxSlotsForUserTournament(user);
  if (max < 8) return [];
  return Array.from({ length: Math.floor((max - 8) / 2) + 1 }, (_, i) => 8 + i * 2);
}

export function maxLeagueSeasonParticipantsCap(user: BasicUser | null | undefined): number {
  const cap = leagueCap(user);
  if (!Number.isFinite(cap)) return 999;
  return Math.max(4, Math.min(999, cap));
}
