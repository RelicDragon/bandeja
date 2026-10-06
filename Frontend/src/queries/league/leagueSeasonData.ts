import { leaguesApi } from '@/api/leagues';
import { queryClient } from '@/queries/queryClient';

/**
 * Shared cache for the season-wide league reads (rounds, standings, groups, group chats).
 * Schedule, Standings, Planner, the fullscreen pages and the league modals all read the
 * same few payloads; rounds alone is the biggest response in the app for a large season.
 *
 * - `load` coalesces identical requests within `DEDUPE_MS` (back-to-back tab mounts,
 *   a tab and its modal) and otherwise fetches fresh, so callers keep "fresh on open".
 * - `load(id, { force: true })` always refetches — use after a mutation.
 * - `peek` returns the last payload synchronously so a remounted tab can paint at once
 *   while its `load` revalidates.
 */
const DEDUPE_MS = 2000;

type LeagueSeasonPart = 'getRounds' | 'getStandings' | 'getGroups' | 'getMyGroupChats';
type PartResponse<P extends LeagueSeasonPart> = Awaited<ReturnType<(typeof leaguesApi)[P]>>;

export const leagueSeasonDataKeys = {
  all: (leagueSeasonId: string) => ['leagueSeasonData', leagueSeasonId] as const,
  part: (leagueSeasonId: string, part: LeagueSeasonPart) => ['leagueSeasonData', leagueSeasonId, part] as const,
};

function createLeagueSeasonPart<P extends LeagueSeasonPart>(part: P) {
  const fetchPart = leaguesApi[part] as (leagueSeasonId: string) => Promise<PartResponse<P>>;
  return {
    async load(leagueSeasonId: string, options?: { force?: boolean }): Promise<PartResponse<P>> {
      const queryKey = leagueSeasonDataKeys.part(leagueSeasonId, part);
      // A request started before the mutation may carry pre-mutation data.
      if (options?.force) await queryClient.cancelQueries({ queryKey });
      return queryClient.fetchQuery<PartResponse<P>>({
        queryKey,
        queryFn: () => fetchPart(leagueSeasonId),
        staleTime: options?.force ? 0 : DEDUPE_MS,
        retry: false,
      });
    },
    peek(leagueSeasonId: string): PartResponse<P> | undefined {
      return queryClient.getQueryData<PartResponse<P>>(leagueSeasonDataKeys.part(leagueSeasonId, part));
    },
  };
}

export const leagueRoundsData = createLeagueSeasonPart('getRounds');
export const leagueStandingsData = createLeagueSeasonPart('getStandings');
export const leagueGroupsData = createLeagueSeasonPart('getGroups');
export const leagueGroupChatsData = createLeagueSeasonPart('getMyGroupChats');
