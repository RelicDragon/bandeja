import type { QueryClient } from '@tanstack/react-query';
import type { Invite, UserTeam, UserTeamMembership } from '@/types';
import type { MyGamesData } from '@/queries/games/useMyGamesQuery';
import { queryKeys } from '@/queries/queryKeys';

export type MyTabCacheSnapshot = MyGamesData & {
  teams?: UserTeam[];
  memberships?: UserTeamMembership[];
  storiesCount?: number | null;
  booktimeConnected?: boolean | null;
};

export function readMyTabCache(
  queryClient: QueryClient,
  userId: string | undefined,
): MyTabCacheSnapshot | undefined {
  if (!userId) return undefined;
  return queryClient.getQueryData<MyTabCacheSnapshot>(queryKeys.games.my(userId));
}

export function countPendingInvites(invites: Invite[] | undefined): number {
  if (!invites?.length) return 0;
  return invites.filter((invite) => invite.status === 'PENDING').length;
}

export function hasMyTabMembershipsSnapshot(
  cached: { memberships?: UserTeamMembership[] | null } | undefined,
): cached is { memberships: UserTeamMembership[] } {
  return cached != null && cached.memberships != null;
}

export function ownedTeamsFromMyTab(
  teams: UserTeam[] | undefined,
  userId: string,
): UserTeam[] {
  if (!teams?.length) return [];
  return teams.filter((team) => team.ownerId === userId);
}
