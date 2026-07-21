import type { Game } from '@/types';

export type LeagueScheduleMyGameStatusFilter =
  | 'ALL'
  | 'NOT_SCHEDULED'
  | 'SCHEDULED'
  | 'PLAYED';

export type LeagueScheduleMyGameStatus = Exclude<LeagueScheduleMyGameStatusFilter, 'ALL'>;

export function leagueScheduleMyGameStatus(game: Game): LeagueScheduleMyGameStatus {
  if (game.resultsStatus === 'FINAL') return 'PLAYED';
  if (game.resultsStatus === 'IN_PROGRESS' || game.timeIsSet === true) return 'SCHEDULED';
  return 'NOT_SCHEDULED';
}

export function gameMatchesLeagueScheduleMyStatus(
  game: Game,
  filter: LeagueScheduleMyGameStatusFilter,
): boolean {
  if (filter === 'ALL') return true;
  return leagueScheduleMyGameStatus(game) === filter;
}
