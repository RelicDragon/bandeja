import { create } from 'zustand';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';

interface HeaderState {
  pendingInvites: number;
  unreadMessages: number;
  isNewInviteAnimating: boolean;
  syncStatus: SyncStatus;
  leaderboardType: 'level' | 'social' | 'games';
  leaderboardScope: 'city' | 'global';
  leaderboardTimePeriod: '10' | '30' | 'all';
  areFiltersSticky: boolean;
  myGamesUnreadCount: number;
  pastGamesUnreadCount: number;
  setPendingInvites: (count: number) => void;
  setUnreadMessages: (count: number) => void;
  triggerNewInviteAnimation: () => void;
  setSyncStatus: (status: SyncStatus) => void;
  setLeaderboardType: (type: 'level' | 'social' | 'games') => void;
  setLeaderboardScope: (scope: 'city' | 'global') => void;
  setLeaderboardTimePeriod: (period: '10' | '30' | 'all') => void;
  setAreFiltersSticky: (sticky: boolean) => void;
  setMyGamesUnreadCount: (count: number) => void;
  setPastGamesUnreadCount: (count: number) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  pendingInvites: 0,
  unreadMessages: 0,
  isNewInviteAnimating: false,
  syncStatus: 'IDLE',
  leaderboardType: 'level',
  leaderboardScope: 'city',
  leaderboardTimePeriod: 'all',
  areFiltersSticky: false,
  myGamesUnreadCount: 0,
  pastGamesUnreadCount: 0,
  setPendingInvites: (count) => set({ pendingInvites: count }),
  setUnreadMessages: (count) => set({ unreadMessages: count }),
  triggerNewInviteAnimation: () => {
    set({ isNewInviteAnimating: true });
    // Reset animation after it completes
    setTimeout(() => set({ isNewInviteAnimating: false }), 1000);
  },
  setSyncStatus: (status) => set({ syncStatus: status }),
  setLeaderboardType: (type) => set({ leaderboardType: type }),
  setLeaderboardScope: (scope) => set({ leaderboardScope: scope }),
  setLeaderboardTimePeriod: (period) => set({ leaderboardTimePeriod: period }),
  setAreFiltersSticky: (sticky) => set({ areFiltersSticky: sticky }),
  setMyGamesUnreadCount: (count) => set({ myGamesUnreadCount: count }),
  setPastGamesUnreadCount: (count) => set({ pastGamesUnreadCount: count }),
}));
