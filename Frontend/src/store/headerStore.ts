import { create } from 'zustand';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';

interface HeaderState {
  pendingInvites: number;
  unreadMessages: number;
  showGameTypeModal: boolean;
  isNewInviteAnimating: boolean;
  showChatFilter: boolean;
  syncStatus: SyncStatus;
  selectedDateForCreateGame: Date | null;
  leaderboardType: 'level' | 'social' | 'games';
  leaderboardScope: 'city' | 'global';
  leaderboardTimePeriod: '10' | '30' | 'all';
  areFiltersSticky: boolean;
  setPendingInvites: (count: number) => void;
  setUnreadMessages: (count: number) => void;
  setShowGameTypeModal: (show: boolean) => void;
  setShowChatFilter: (show: boolean) => void;
  triggerNewInviteAnimation: () => void;
  setSyncStatus: (status: SyncStatus) => void;
  setSelectedDateForCreateGame: (date: Date | null) => void;
  setLeaderboardType: (type: 'level' | 'social' | 'games') => void;
  setLeaderboardScope: (scope: 'city' | 'global') => void;
  setLeaderboardTimePeriod: (period: '10' | '30' | 'all') => void;
  setAreFiltersSticky: (sticky: boolean) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  pendingInvites: 0,
  unreadMessages: 0,
  showGameTypeModal: false,
  isNewInviteAnimating: false,
  showChatFilter: false,
  syncStatus: 'IDLE',
  selectedDateForCreateGame: null,
  leaderboardType: 'level',
  leaderboardScope: 'city',
  leaderboardTimePeriod: 'all',
  areFiltersSticky: false,
  setPendingInvites: (count) => set({ pendingInvites: count }),
  setUnreadMessages: (count) => set({ unreadMessages: count }),
  setShowGameTypeModal: (show) => set({ showGameTypeModal: show }),
  setShowChatFilter: (show) => set({ showChatFilter: show }),
  triggerNewInviteAnimation: () => {
    set({ isNewInviteAnimating: true });
    // Reset animation after it completes
    setTimeout(() => set({ isNewInviteAnimating: false }), 1000);
  },
  setSyncStatus: (status) => set({ syncStatus: status }),
  setSelectedDateForCreateGame: (date) => set({ selectedDateForCreateGame: date }),
  setLeaderboardType: (type) => set({ leaderboardType: type }),
  setLeaderboardScope: (scope) => set({ leaderboardScope: scope }),
  setLeaderboardTimePeriod: (period) => set({ leaderboardTimePeriod: period }),
  setAreFiltersSticky: (sticky) => set({ areFiltersSticky: sticky }),
}));
