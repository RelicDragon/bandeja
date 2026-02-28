import { create } from 'zustand';
import type { BugStatus, BugType } from '@/types';

interface BugsFilterState {
  status: BugStatus | null;
  type: BugType | null;
  createdByMe: boolean;
}

interface NavigationState {
  currentPage: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions' | 'marketplace';
  bottomTabsVisible: boolean;
  initShellAnimationPlayed: boolean;
  isAnimating: boolean;
  gameDetailsCanAccessChat: boolean;
  gameDetailsTableViewOverride: boolean | null;
  gameDetailsTableViewActive: boolean;
  gameDetailsCanShowTableView: boolean;
  gameDetailsTableAddRoundCallback: (() => void) | null;
  gameDetailsTableIsEditing: boolean;
  setGameDetailsTableViewActive: (active: boolean) => void;
  setGameDetailsTableAddRound: (callback: (() => void) | null, isEditing: boolean) => void;
  bounceNotifications: boolean;
  bugsButtonSlidingUp: boolean;
  bugsButtonSlidingDown: boolean;
  activeTab: 'my-games' | 'past-games' | 'search';
  profileActiveTab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews';
  chatsFilter: 'users' | 'bugs' | 'channels' | 'market';
  openBugModal: boolean;
  bugsFilter: BugsFilterState;
  marketplaceTab: 'market' | 'my';
  findViewMode: 'calendar' | 'list';
  requestFindGoToCurrent: 'calendar' | 'list' | null;
  setRequestFindGoToCurrent: (mode: 'calendar' | 'list' | null) => void;
  viewingGroupChannelId: string | null;
  setViewingGroupChannelId: (id: string | null) => void;
  pendingPlayerCardReopen: { playerId: string; sourceIdx: number } | null;
  setPendingPlayerCardReopen: (data: { playerId: string; sourceIdx: number } | null) => void;
  setMarketplaceTab: (tab: 'market' | 'my') => void;
  setCurrentPage: (page: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions' | 'marketplace') => void;
  setBottomTabsVisible: (visible: boolean) => void;
  setInitShellAnimationPlayed: (played: boolean) => void;
  setIsAnimating: (animating: boolean) => void;
  setGameDetailsCanAccessChat: (canAccessChat: boolean) => void;
  setGameDetailsTableViewOverride: (override: boolean | null) => void;
  setGameDetailsTableViewActive: (active: boolean) => void;
  setGameDetailsCanShowTableView: (can: boolean) => void;
  setBounceNotifications: (bounce: boolean) => void;
  setBugsButtonSlidingUp: (sliding: boolean) => void;
  setBugsButtonSlidingDown: (sliding: boolean) => void;
  setActiveTab: (tab: 'my-games' | 'past-games' | 'search') => void;
  setProfileActiveTab: (tab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews') => void;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  setOpenBugModal: (open: boolean) => void;
  setBugsFilter: (filter: BugsFilterState | ((prev: BugsFilterState) => BugsFilterState)) => void;
  setFindViewMode: (mode: 'calendar' | 'list') => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'my',
  bottomTabsVisible: true,
  initShellAnimationPlayed: false,
  isAnimating: false,
  gameDetailsCanAccessChat: false,
  gameDetailsTableViewOverride: null,
  gameDetailsCanShowTableView: false,
  gameDetailsTableAddRoundCallback: null,
  gameDetailsTableIsEditing: false,
  setGameDetailsTableAddRound: (callback, isEditing) => set({ gameDetailsTableAddRoundCallback: callback, gameDetailsTableIsEditing: isEditing }),
  bounceNotifications: false,
  bugsButtonSlidingUp: false,
  bugsButtonSlidingDown: false,
  activeTab: 'my-games',
  profileActiveTab: 'general',
  chatsFilter: 'users',
  openBugModal: false,
  bugsFilter: { status: null, type: null, createdByMe: false },
  marketplaceTab: 'market',
  findViewMode: 'calendar',
  requestFindGoToCurrent: null,
  viewingGroupChannelId: null,
  pendingPlayerCardReopen: null,
  setCurrentPage: (page) => set({ currentPage: page }),
  setViewingGroupChannelId: (id) => set({ viewingGroupChannelId: id }),
  setPendingPlayerCardReopen: (data) => set({ pendingPlayerCardReopen: data }),
  setBottomTabsVisible: (visible) => set({ bottomTabsVisible: visible }),
  setInitShellAnimationPlayed: (played) => set({ initShellAnimationPlayed: played }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  setGameDetailsCanAccessChat: (canAccessChat) => set({ gameDetailsCanAccessChat: canAccessChat }),
  setGameDetailsTableViewOverride: (override) => set({ gameDetailsTableViewOverride: override }),
  setGameDetailsCanShowTableView: (can) => set({ gameDetailsCanShowTableView: can }),
  setBounceNotifications: (bounce) => set({ bounceNotifications: bounce }),
  setBugsButtonSlidingUp: (sliding) => set({ bugsButtonSlidingUp: sliding }),
  setBugsButtonSlidingDown: (sliding) => set({ bugsButtonSlidingDown: sliding }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setProfileActiveTab: (tab) => set({ profileActiveTab: tab }),
  setChatsFilter: (filter) => set({ chatsFilter: filter }),
  setOpenBugModal: (open) => set({ openBugModal: open }),
  setBugsFilter: (filter) => set((state) => ({ bugsFilter: typeof filter === 'function' ? filter(state.bugsFilter) : filter })),
  setMarketplaceTab: (tab) => set({ marketplaceTab: tab }),
  setFindViewMode: (mode) => set({ findViewMode: mode }),
  setRequestFindGoToCurrent: (mode) => set({ requestFindGoToCurrent: mode }),
}));
