import type { BasicUser } from '@/types';

const DEFAULT_CAP = 12;

function baseCap(user: BasicUser | null | undefined): number {
  if (!user) return DEFAULT_CAP;
  if (user.isAdmin || user.canCreateTournament) return Number.POSITIVE_INFINITY;
  const raw = user.maxParticipantsInGame;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 2) return DEFAULT_CAP;
  return Math.min(999, Math.floor(raw));
}

export function maxSlotsForUserGameOrLeague(user: BasicUser | null | undefined): number {
  const cap = baseCap(user);
  if (!Number.isFinite(cap)) return 12;
  return cap;
}

export function maxSlotsForUserTournament(user: BasicUser | null | undefined): number {
  const cap = baseCap(user);
  if (!Number.isFinite(cap)) return 32;
  return Math.min(32, cap);
}

export function gameOrLeagueParticipantOptions(user: BasicUser | null | undefined): number[] {
  const max = maxSlotsForUserGameOrLeague(user);
  return Array.from({ length: Math.max(0, max - 1) }, (_, i) => i + 2);
}

export function tournamentParticipantOptions(user: BasicUser | null | undefined): number[] {
  const max = maxSlotsForUserTournament(user);
  if (max < 8) return [];
  return Array.from({ length: Math.floor((max - 8) / 2) + 1 }, (_, i) => 8 + i * 2);
}

export function maxLeagueSeasonParticipantsCap(user: BasicUser | null | undefined): number {
  const cap = baseCap(user);
  if (!Number.isFinite(cap)) return 999;
  return Math.max(4, Math.min(999, cap));
}
