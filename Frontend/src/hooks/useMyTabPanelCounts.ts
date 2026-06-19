import { useEffect, useMemo } from 'react';
import type { Game, UserTeam, UserTeamMembership } from '@/types';
import type { MyTabBooktimeSnapshot } from '@/hooks/useMyTabPanelCounts';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { leagueSeasonHubsFromGames } from '@/utils/leagueSeasonHubsFromGames';

export type MyTabPanelCounts = {
  bookings: number;
  teams: number;
  leagues: number;
};

function countUserTeamTiles(teams: UserTeam[], memberships: UserTeamMembership[]): number {
  const asParticipant = memberships
    .filter((m) => !m.isOwner && m.status === 'ACCEPTED')
    .map((m) => m.team)
    .filter(Boolean);
  const pending = memberships.filter((m) => !m.isOwner && m.status === 'PENDING');
  return teams.length + asParticipant.length + pending.length;
}

export function useMyTabPanelCounts(
  games: Game[],
  booktime: Pick<MyTabBooktimeSnapshot, 'myClubs' | 'bookings'>,
): MyTabPanelCounts {
  const { myClubs, bookings } = booktime;

  const teams = useUserTeamsStore((s) => s.teams);
  const memberships = useUserTeamsStore((s) => s.memberships);
  const refreshAll = useUserTeamsStore((s) => s.refreshAll);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const bookingsCount = useMemo(() => {
    if (!myClubs || myClubs.connectedCount === 0) return 0;
    return bookings.length;
  }, [myClubs, bookings.length]);

  const teamsCount = useMemo(() => countUserTeamTiles(teams, memberships), [teams, memberships]);

  const leaguesCount = useMemo(() => leagueSeasonHubsFromGames(games).length, [games]);

  return {
    bookings: bookingsCount,
    teams: teamsCount,
    leagues: leaguesCount,
  };
}
