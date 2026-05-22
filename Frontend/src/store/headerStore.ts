import { create } from 'zustand';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';

interface HeaderState {
  pendingInvites: number;
  isNewInviteAnimating: boolean;
  syncStatus: SyncStatus;
  leaderboardType: 'level' | 'social' | 'games';
  leaderboardScope: 'city' | 'global';
  leaderboardTimePeriod: '10' | '30' | 'all';
  areFiltersSticky: boolean;
  createGameInitialDate: string | null;
  setPendingInvites: (count: number) => void;
  triggerNewInviteAnimation: () => void;
  setSyncStatus: (status: SyncStatus) => void;
  setLeaderboardType: (type: 'level' | 'social' | 'games') => void;
  setLeaderboardScope: (scope: 'city' | 'global') => void;
  setLeaderboardTimePeriod: (period: '10' | '30' | 'all') => void;
  setAreFiltersSticky: (sticky: boolean) => void;
  setCreateGameInitialDate: (date: Date | null) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  pendingInvites: 0,
  isNewInviteAnimating: false,
  syncStatus: 'IDLE',
  leaderboardType: 'level',
  leaderboardScope: 'city',
  leaderboardTimePeriod: 'all',
  areFiltersSticky: false,
  createGameInitialDate: null,
  setPendingInvites: (count) => set({ pendingInvites: count }),
  triggerNewInviteAnimation: () => {
    set({ isNewInviteAnimating: true });
    setTimeout(() => set({ isNewInviteAnimating: false }), 1000);
  },
  setSyncStatus: (status) => set({ syncStatus: status }),
  setLeaderboardType: (type) => set({ leaderboardType: type }),
  setLeaderboardScope: (scope) => set({ leaderboardScope: scope }),
  setLeaderboardTimePeriod: (period) => set({ leaderboardTimePeriod: period }),
  setAreFiltersSticky: (sticky) => set({ areFiltersSticky: sticky }),
  setCreateGameInitialDate: (date) =>
    set({ createGameInitialDate: date ? (() => {
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    })() : null }),
}));
