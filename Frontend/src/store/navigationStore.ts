import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { BugStatus, BugType, ChatType } from '@/types';
import type { PageType } from '@/utils/urlSchema';

interface BugsFilterState {
  status: BugStatus | null;
  type: BugType | null;
  createdByMe: boolean;
}

interface NavigationState {
  currentPage: PageType;
  bottomTabsVisible: boolean;
  initShellAnimationPlayed: boolean;
  isAnimating: boolean;
  gameDetailsCanAccessChat: boolean;
  gameDetailsTableViewOverride: boolean | null;
  gameDetailsCanShowTableView: boolean;
  gameDetailsTableAddRoundCallback: (() => void) | null;
  gameDetailsTableIsEditing: boolean;
  setGameDetailsTableAddRound: (callback: (() => void) | null, isEditing: boolean) => void;
  bounceNotifications: boolean;
  bugsButtonSlidingUp: boolean;
  bugsButtonSlidingDown: boolean;
  activeTab: 'calendar' | 'list' | 'past-games' | 'my-games' | 'search';
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
  viewingUserChatId: string | null;
  setViewingUserChatId: (id: string | null) => void;
  viewingGameChatId: string | null;
  viewingGameChatChatType: ChatType | null;
  setViewingGameChatId: (id: string | null) => void;
  setViewingGameChat: (id: string | null, chatType: ChatType | null) => void;
  pendingPlayerCardReopen: { playerId: string; sourceIdx: number } | null;
  setPendingPlayerCardReopen: (data: { playerId: string; sourceIdx: number } | null) => void;
  setMarketplaceTab: (tab: 'market' | 'my') => void;
  setCurrentPage: (page: PageType) => void;
  setBottomTabsVisible: (visible: boolean) => void;
  setInitShellAnimationPlayed: (played: boolean) => void;
  setIsAnimating: (animating: boolean) => void;
  setGameDetailsCanAccessChat: (canAccessChat: boolean) => void;
  setGameDetailsTableViewOverride: (override: boolean | null) => void;
  setGameDetailsCanShowTableView: (can: boolean) => void;
  setBounceNotifications: (bounce: boolean) => void;
  setBugsButtonSlidingUp: (sliding: boolean) => void;
  setBugsButtonSlidingDown: (sliding: boolean) => void;
  setActiveTab: (tab: 'calendar' | 'list' | 'past-games' | 'my-games' | 'search') => void;
  setProfileActiveTab: (tab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews') => void;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  setOpenBugModal: (open: boolean) => void;
  setBugsFilter: (filter: BugsFilterState | ((prev: BugsFilterState) => BugsFilterState)) => void;
  setFindViewMode: (mode: 'calendar' | 'list') => void;
  myGamesSubtabBeforeCreate: 'list' | null;
  myGamesCalendarDateAfterCreate: string | null;
  myGamesSelectedDay: string | null;
  findSelectedDay: string | null;
  findListWeekStartDay: string | null;
  userProfileHeaderActions: ReactNode | null;
  setUserProfileHeaderActions: (actions: ReactNode | null) => void;
  setMyGamesSubtabBeforeCreate: (tab: 'list' | null) => void;
  setMyGamesCalendarDateAfterCreate: (date: string | null) => void;
  setMyGamesSelectedDay: (day: string | null) => void;
  setFindSelectedDay: (day: string | null) => void;
  setFindListWeekStartDay: (day: string | null) => void;
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
  activeTab: 'calendar',
  profileActiveTab: 'general',
  chatsFilter: 'users',
  openBugModal: false,
  bugsFilter: { status: null, type: null, createdByMe: false },
  marketplaceTab: 'market',
  findViewMode: 'calendar',
  requestFindGoToCurrent: null,
  viewingGroupChannelId: null,
  viewingUserChatId: null,
  viewingGameChatId: null,
  viewingGameChatChatType: null,
  pendingPlayerCardReopen: null,
  myGamesSubtabBeforeCreate: null,
  myGamesCalendarDateAfterCreate: null,
  myGamesSelectedDay: null,
  findSelectedDay: null,
  findListWeekStartDay: null,
  userProfileHeaderActions: null,
  setUserProfileHeaderActions: (actions) => set({ userProfileHeaderActions: actions }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setViewingGroupChannelId: (id) => set({ viewingGroupChannelId: id }),
  setViewingUserChatId: (id) => set({ viewingUserChatId: id }),
  setViewingGameChatId: (id) =>
    set((s) => ({
      viewingGameChatId: id,
      viewingGameChatChatType: id ? s.viewingGameChatChatType : null,
    })),
  setViewingGameChat: (id, chatType) => set({ viewingGameChatId: id, viewingGameChatChatType: chatType }),
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
  setMyGamesSubtabBeforeCreate: (tab) => set({ myGamesSubtabBeforeCreate: tab }),
  setMyGamesCalendarDateAfterCreate: (date) => set({ myGamesCalendarDateAfterCreate: date }),
  setMyGamesSelectedDay: (day) => set({ myGamesSelectedDay: day }),
  setFindSelectedDay: (day) => set({ findSelectedDay: day }),
  setFindListWeekStartDay: (day) => set({ findListWeekStartDay: day }),
}));
