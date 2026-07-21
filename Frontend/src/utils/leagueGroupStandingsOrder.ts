/** Fixed-team or 1v1 (!hasFixedTeams && playersPerMatch === 2). Not 2v2 non-fixed. */
export function leaguePreservesApiStandingsOrder(game: {
  hasFixedTeams?: boolean | null;
  playersPerMatch?: number | null;
}): boolean {
  if (game.hasFixedTeams) return true;
  return (game.playersPerMatch ?? 4) === 2;
}

export function leagueShowsGroupStandingsFaq(game: {
  entityType?: string | null;
  hasFixedTeams?: boolean | null;
  playersPerMatch?: number | null;
}): boolean {
  return game.entityType === 'LEAGUE_SEASON' && leaguePreservesApiStandingsOrder(game);
}
