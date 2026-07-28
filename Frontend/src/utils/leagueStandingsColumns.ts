import { leaguePreservesApiStandingsOrder } from '@/utils/leagueGroupStandingsOrder';

/** Standings table column visibility for league seasons. */

export type LeagueStandingsColumnFlags = {
  showPoints: boolean;
  showSets: boolean;
  showGames: boolean;
  showBalls: boolean;
};

/**
 * Order: Points → W-T-L → Games → Balls
 * - Points: rotating / non–H2H seasons only (not fixed-team, not 1v1)
 * - Sets: never on the main standings table (mini-tables still show set Δ)
 * - Games: classic balls-in-games scoring
 * - Balls: simple points scoring (mutually exclusive with Games)
 */
export function resolveLeagueStandingsColumns(game: {
  hasFixedTeams?: boolean | null;
  playersPerMatch?: number | null;
  ballsInGames?: boolean | null;
}): LeagueStandingsColumnFlags {
  const useSetTiebreakColumns = leaguePreservesApiStandingsOrder(game);
  const ballsInGames = !!game.ballsInGames;
  return {
    showPoints: !useSetTiebreakColumns,
    showSets: false,
    showGames: ballsInGames,
    showBalls: !ballsInGames,
  };
}

export function formatSignedDelta(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

/** Prefer fixture-derived game Δ when present (H2H modes); else stored scoreDelta. */
export function standingsScoreUnitDelta(standing: {
  gameDelta?: number | null;
  scoreDelta: number;
}): number {
  return typeof standing.gameDelta === 'number' ? standing.gameDelta : standing.scoreDelta;
}
