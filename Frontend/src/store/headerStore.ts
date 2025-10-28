import { create } from 'zustand';

interface HeaderState {
  pendingInvites: number;
  unreadMessages: number;
  showGameTypeModal: boolean;
  setPendingInvites: (count: number) => void;
  setUnreadMessages: (count: number) => void;
  setShowGameTypeModal: (show: boolean) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  pendingInvites: 0,
  unreadMessages: 0,
  showGameTypeModal: false,
  setPendingInvites: (count) => set({ pendingInvites: count }),
  setUnreadMessages: (count) => set({ unreadMessages: count }),
  setShowGameTypeModal: (show) => set({ showGameTypeModal: show }),
}));
