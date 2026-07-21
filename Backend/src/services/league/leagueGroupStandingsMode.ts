/** When group standings use wins → H2H → mini-table (not points-first). */
export type LeagueGroupStandingsMode = 'fixedTeam' | 'userSingles';

/**
 * Fixed-team leagues and 1v1 (!hasFixedTeams, playersPerMatch === 2).
 * Excludes 2v2 non-fixed (rotating pairs / individual doubles).
 */
export function resolveLeagueGroupStandingsMode(game: {
  hasFixedTeams?: boolean | null;
  playersPerMatch?: number | null;
}): LeagueGroupStandingsMode | null {
  if (game.hasFixedTeams) return 'fixedTeam';
  if ((game.playersPerMatch ?? 4) === 2) return 'userSingles';
  return null;
}
