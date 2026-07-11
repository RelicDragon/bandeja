import { create } from 'zustand';
import type { QueryClient } from '@tanstack/react-query';
import { userTeamsApi } from '@/api/userTeams';
import type { UserTeam, UserTeamMembership } from '@/types';
import { queryClient } from '@/queries/queryClient';
import { useAuthStore } from '@/store/authStore';
import { ownedTeamsFromMyTab, readMyTabCache, hasMyTabMembershipsSnapshot } from '@/services/myTabCacheReader';

interface UserTeamsState {
  teams: UserTeam[];
  memberships: UserTeamMembership[];
  isLoading: boolean;
  lastFetchedAt: number | null;
  refreshAll: (options?: { force?: boolean }) => Promise<boolean>;
  hydrateFromMyTabCache: (queryClient: QueryClient, userId: string) => boolean;
  setTeam: (team: UserTeam) => void;
  removeTeamLocal: (teamId: string) => void;
}

function applyMyTabTeamsSnapshot(
  teams: UserTeam[] | undefined,
  memberships: UserTeamMembership[] | null | undefined,
  userId: string,
): { teams: UserTeam[]; memberships: UserTeamMembership[] } | null {
  if (!teams || memberships === null) return null;
  const ownedTeams = ownedTeamsFromMyTab(teams, userId);
  if (memberships != null) {
    return { teams: ownedTeams, memberships };
  }
  const derivedMemberships = teams.flatMap((team) =>
    (team.members ?? [])
      .filter((member) => member.userId === userId)
      .map((member) => ({
        ...member,
        team,
      })),
  );
  return { teams: ownedTeams, memberships: derivedMemberships };
}

export const useUserTeamsStore = create<UserTeamsState>((set, get) => ({
  teams: [],
  memberships: [],
  isLoading: false,
  lastFetchedAt: null,

  hydrateFromMyTabCache: (queryClient, userId) => {
    const cached = readMyTabCache(queryClient, userId);
    const snapshot = applyMyTabTeamsSnapshot(cached?.teams, cached?.memberships, userId);
    if (!snapshot) return false;
    set({
      teams: snapshot.teams,
      memberships: snapshot.memberships,
      isLoading: false,
      lastFetchedAt: Date.now(),
    });
    return hasMyTabMembershipsSnapshot(cached);
  },

  refreshAll: async (options) => {
    const force = options?.force ?? false;
    const userId = useAuthStore.getState().user?.id;

    if (!force && userId) {
      const cached = readMyTabCache(queryClient, userId);
      if (cached?.teams && cached.memberships !== null) {
        get().hydrateFromMyTabCache(queryClient, userId);
      }
      if (hasMyTabMembershipsSnapshot(cached)) {
        return true;
      }
    }

    set({ isLoading: true });
    try {
      const [teams, memberships] = await Promise.all([
        userTeamsApi.getMine(),
        userTeamsApi.getMemberships(),
      ]);
      set({ teams, memberships, isLoading: false, lastFetchedAt: Date.now() });
      return true;
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  setTeam: (team) => {
    const teams = get().teams;
    const idx = teams.findIndex((t) => t.id === team.id);
    const nextTeams = idx >= 0 ? teams.map((t) => (t.id === team.id ? team : t)) : [...teams, team];
    set({
      teams: nextTeams,
      memberships: get().memberships.map((m) => (m.teamId === team.id ? { ...m, team } : m)),
    });
  },

  removeTeamLocal: (teamId) => {
    set({
      teams: get().teams.filter((t) => t.id !== teamId),
      memberships: get().memberships.filter((m) => m.teamId !== teamId),
    });
  },
}));
