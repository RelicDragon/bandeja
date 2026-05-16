import type { LeagueRound } from '@/api/leagues';
import type { Game } from '@/types';

export function regularSeasonGamesInScheduleScope(
  rounds: LeagueRound[],
  selectedGroupId: string,
  allGroupId: string
): Game[] {
  const regularRounds = rounds.filter((r) => (r.roundType ?? 'REGULAR') === 'REGULAR');
  const games = regularRounds.flatMap((r) => r.games);
  if (selectedGroupId === allGroupId) return games;
  return games.filter((g) => g.leagueGroupId === selectedGroupId);
}

export function canShowPlayoffRoundTypeFilter(
  rounds: LeagueRound[],
  selectedGroupId: string,
  allGroupId: string
): boolean {
  const scoped = regularSeasonGamesInScheduleScope(rounds, selectedGroupId, allGroupId);
  return scoped.length > 0 && scoped.every((g) => g.resultsStatus === 'FINAL');
}
