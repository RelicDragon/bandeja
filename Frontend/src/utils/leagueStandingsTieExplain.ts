import type { LeagueStandingsTieCluster } from '@/api/leagues';

export type StandingsTieDecideBy = 'h2h' | 'miniWins' | 'setDiff' | 'gameDiff' | 'stable';

export function standingsTieClusterKind(
  rowCount: number
): 'h2h' | 'mini' {
  return rowCount === 2 ? 'h2h' : 'mini';
}

/** Why `above` ranks ahead of the next row in a tie cluster. */
export function explainStandingsTieStep(
  above: LeagueStandingsTieCluster['rows'][number],
  below: LeagueStandingsTieCluster['rows'][number],
  kind: 'h2h' | 'mini'
): StandingsTieDecideBy {
  if (above.miniWins !== below.miniWins) {
    return kind === 'h2h' ? 'h2h' : 'miniWins';
  }
  if (kind === 'h2h') return 'stable';
  if (above.setDiff !== below.setDiff) return 'setDiff';
  if (above.gameDiff !== below.gameDiff) return 'gameDiff';
  return 'h2h';
}

export function standingsTieClusterAnchorId(
  groupKey: string,
  seasonWins: number
): string {
  return `standings-tie-${groupKey}-${seasonWins}`;
}
