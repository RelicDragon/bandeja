import { create } from 'zustand';
import { userTeamsApi } from '@/api/userTeams';
import type { UserTeam, UserTeamMembership } from '@/types';

interface UserTeamsState {
  teams: UserTeam[];
  memberships: UserTeamMembership[];
  isLoading: boolean;
  lastFetchedAt: number | null;
  refreshAll: () => Promise<void>;
  setTeam: (team: UserTeam) => void;
  removeTeamLocal: (teamId: string) => void;
}

export const useUserTeamsStore = create<UserTeamsState>((set, get) => ({
  teams: [],
  memberships: [],
  isLoading: false,
  lastFetchedAt: null,

  refreshAll: async () => {
    set({ isLoading: true });
    try {
      const [teams, memberships] = await Promise.all([
        userTeamsApi.getMine(),
        userTeamsApi.getMemberships(),
      ]);
      set({ teams, memberships, isLoading: false, lastFetchedAt: Date.now() });
    } catch {
      set({ isLoading: false });
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
