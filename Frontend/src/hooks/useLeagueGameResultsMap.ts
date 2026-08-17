import type { Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { useLeagueFixtureResultsLive } from '@/hooks/useLeagueFixtureResultsLive';

/** Live socket-backed results map for visible league fixtures. */
export function useLeagueGameResultsMap(
  games: Array<Pick<Game, 'id' | 'resultsStatus'>>,
): Map<string, Round[] | null> {
  return useLeagueFixtureResultsLive(games);
}
