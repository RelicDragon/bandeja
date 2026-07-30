import { create } from 'zustand';
import type { LeaderboardGenderFilter } from '@/components/leaderboard/leaderboardGender';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';
export type { LeaderboardGenderFilter };

interface HeaderState {
  pendingInvites: number;
  /** Invite ids already counted as closed, to absorb the `invite-deleted` socket echo of a local action. */
  decrementedInviteIds: Set<string>;
  isNewInviteAnimating: boolean;
  syncStatus: SyncStatus;
  leaderboardType: 'level' | 'social' | 'achievements';
  leaderboardScope: 'city' | 'global';
  leaderboardGender: LeaderboardGenderFilter;
  createGameInitialDate: string | null;
  setPendingInvites: (count: number) => void;
  /** Authoritative count from the server; resets the echo-absorption set. */
  setPendingInvitesFromServer: (count: number) => void;
  /** Decrement once per inviteId, so a local action and its socket echo don't double-count. */
  decrementPendingInvite: (inviteId: string) => void;
  triggerNewInviteAnimation: () => void;
  setSyncStatus: (status: SyncStatus) => void;
  setLeaderboardType: (type: 'level' | 'social' | 'achievements') => void;
  setLeaderboardScope: (scope: 'city' | 'global') => void;
  setLeaderboardGender: (gender: LeaderboardGenderFilter) => void;
  setCreateGameInitialDate: (date: Date | null) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  pendingInvites: 0,
  decrementedInviteIds: new Set<string>(),
  isNewInviteAnimating: false,
  syncStatus: 'IDLE',
  leaderboardType: 'achievements',
  leaderboardScope: 'city',
  leaderboardGender: 'all',
  createGameInitialDate: null,
  setPendingInvites: (count) => set({ pendingInvites: count }),
  setPendingInvitesFromServer: (count) =>
    set({ pendingInvites: count, decrementedInviteIds: new Set<string>() }),
  decrementPendingInvite: (inviteId) =>
    set((state) => {
      if (state.decrementedInviteIds.has(inviteId)) return state;
      const next = new Set(state.decrementedInviteIds);
      next.add(inviteId);
      return {
        pendingInvites: Math.max(0, state.pendingInvites - 1),
        decrementedInviteIds: next,
      };
    }),
  triggerNewInviteAnimation: () => {
    set({ isNewInviteAnimating: true });
    setTimeout(() => set({ isNewInviteAnimating: false }), 1000);
  },
  setSyncStatus: (status) => set({ syncStatus: status }),
  setLeaderboardType: (type) => set({ leaderboardType: type }),
  setLeaderboardScope: (scope) => set({ leaderboardScope: scope }),
  setLeaderboardGender: (gender) => set({ leaderboardGender: gender }),
  setCreateGameInitialDate: (date) =>
    set({ createGameInitialDate: date ? (() => {
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    })() : null }),
}));
