import { create } from 'zustand';

interface HeaderState {
  pendingInvites: number;
  unreadMessages: number;
  showGameTypeModal: boolean;
  isNewInviteAnimating: boolean;
  showChatFilter: boolean;
  setPendingInvites: (count: number) => void;
  setUnreadMessages: (count: number) => void;
  setShowGameTypeModal: (show: boolean) => void;
  setShowChatFilter: (show: boolean) => void;
  triggerNewInviteAnimation: () => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  pendingInvites: 0,
  unreadMessages: 0,
  showGameTypeModal: false,
  isNewInviteAnimating: false,
  showChatFilter: false,
  setPendingInvites: (count) => set({ pendingInvites: count }),
  setUnreadMessages: (count) => set({ unreadMessages: count }),
  setShowGameTypeModal: (show) => set({ showGameTypeModal: show }),
  setShowChatFilter: (show) => set({ showChatFilter: show }),
  triggerNewInviteAnimation: () => {
    set({ isNewInviteAnimating: true });
    // Reset animation after it completes
    setTimeout(() => set({ isNewInviteAnimating: false }), 1000);
  },
}));
