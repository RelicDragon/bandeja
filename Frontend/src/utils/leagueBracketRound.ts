import type { LeagueRound } from '@/api/leagues';

export function isBracketPlayoffRound(round: LeagueRound): boolean {
  const fmt = round.playoffFormat;
  return (round.roundType ?? 'REGULAR') === 'PLAYOFF' && fmt === 'BRACKET';
}

/** Bracket playoff rounds for a season, sorted by `orderIndex`. */
export function listBracketRounds(rounds: LeagueRound[]): LeagueRound[] {
  return rounds.filter(isBracketPlayoffRound).sort((a, b) => a.orderIndex - b.orderIndex);
}

/** @alias listBracketRounds */
export const findBracketRounds = listBracketRounds;

export function defaultBracketRoundId(bracketRounds: LeagueRound[]): string | null {
  if (bracketRounds.length === 0) return null;
  return bracketRounds[bracketRounds.length - 1]?.id ?? null;
}

export function resolveBracketRoundIdFromSearch(search: string): string | null {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return sp.get('roundId')?.trim() || sp.get('round')?.trim() || null;
}

export function resolveSelectedBracketRound(
  bracketRounds: LeagueRound[],
  selectedId: string | null | undefined
): LeagueRound | null {
  if (bracketRounds.length === 0) return null;
  if (selectedId) {
    const found = bracketRounds.find((r) => r.id === selectedId);
    if (found) return found;
  }
  return bracketRounds[bracketRounds.length - 1] ?? null;
}

export function resolveBracketRoundFromSearch(
  bracketRounds: LeagueRound[],
  search: string
): LeagueRound | null {
  const roundId = resolveBracketRoundIdFromSearch(search);
  return resolveSelectedBracketRound(bracketRounds, roundId);
}

/** @deprecated Prefer resolveSelectedBracketRound with explicit selection */
export function findLatestBracketRound(rounds: LeagueRound[]): LeagueRound | null {
  return resolveSelectedBracketRound(listBracketRounds(rounds), null);
}
