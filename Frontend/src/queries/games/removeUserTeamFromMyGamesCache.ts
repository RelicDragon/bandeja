import type { QueryClient } from '@tanstack/react-query';
import { clearMyTabCache } from '@/api/me';
import type { UserTeam, UserTeamMembership } from '@/types';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';

export function removeUserTeamFromMyGamesCache(
  queryClient: QueryClient,
  userId: string | undefined,
  teamId: string,
): void {
  if (!userId) return;

  clearMyTabCache(userId);

  queryClient.setQueriesData<MyGamesData>(
    { queryKey: queryKeys.games.my(userId) },
    (old: MyGamesData | undefined) => {
      if (!old) return old;
      const nextTeams = (old.teams ?? []).filter((team: UserTeam) => team.id !== teamId);
      const nextMemberships =
        old.memberships == null
          ? old.memberships
          : old.memberships.filter((m: UserTeamMembership) => m.teamId !== teamId);
      const teamsUnchanged = nextTeams.length === (old.teams ?? []).length;
      const membershipsUnchanged =
        old.memberships == null
          ? true
          : nextMemberships != null && nextMemberships.length === old.memberships.length;
      if (teamsUnchanged && membershipsUnchanged) return old;
      return { ...old, teams: nextTeams, memberships: nextMemberships };
    },
  );
}
