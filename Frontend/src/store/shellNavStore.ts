import { create } from 'zustand';
import type { ReactNode } from 'react';

interface ShellNavState {
  bottomTabsVisible: boolean;
  initShellAnimationPlayed: boolean;
  isAnimating: boolean;
  activeTab: 'calendar' | 'past-games' | 'advanced' | 'my-games' | 'search';
  profileActiveTab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews';
  chatsFilter: 'users' | 'bugs' | 'channels' | 'market';
  marketplaceTab: 'market' | 'my';
  findViewMode: 'calendar' | 'list';
  requestFindGoToCurrent: 'calendar' | 'list' | null;
  bounceNotifications: boolean;
  pendingPlayerCardReopen: { playerId: string; sourceIdx: number } | null;
  myGamesCalendarDateAfterCreate: string | null;
  myGamesSelectedDay: string | null;
  findSelectedDay: string | null;
  findListWeekStartDay: string | null;
  userProfileHeaderActions: ReactNode | null;
  findHeaderActions: ReactNode | null;
  setBottomTabsVisible: (visible: boolean) => void;
  setInitShellAnimationPlayed: (played: boolean) => void;
  setIsAnimating: (animating: boolean) => void;
  setActiveTab: (tab: 'calendar' | 'past-games' | 'advanced' | 'my-games' | 'search') => void;
  setProfileActiveTab: (tab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews') => void;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  setMarketplaceTab: (tab: 'market' | 'my') => void;
  setFindViewMode: (mode: 'calendar' | 'list') => void;
  setRequestFindGoToCurrent: (mode: 'calendar' | 'list' | null) => void;
  setBounceNotifications: (bounce: boolean) => void;
  setPendingPlayerCardReopen: (data: { playerId: string; sourceIdx: number } | null) => void;
  setMyGamesCalendarDateAfterCreate: (date: string | null) => void;
  setMyGamesSelectedDay: (day: string | null) => void;
  setFindSelectedDay: (day: string | null) => void;
  setFindListWeekStartDay: (day: string | null) => void;
  setUserProfileHeaderActions: (actions: ReactNode | null) => void;
  setFindHeaderActions: (actions: ReactNode | null) => void;
}

export const useShellNavStore = create<ShellNavState>((set) => ({
  bottomTabsVisible: true,
  initShellAnimationPlayed: false,
  isAnimating: false,
  activeTab: 'calendar',
  profileActiveTab: 'general',
  chatsFilter: 'users',
  marketplaceTab: 'market',
  findViewMode: 'calendar',
  requestFindGoToCurrent: null,
  bounceNotifications: false,
  pendingPlayerCardReopen: null,
  myGamesCalendarDateAfterCreate: null,
  myGamesSelectedDay: null,
  findSelectedDay: null,
  findListWeekStartDay: null,
  userProfileHeaderActions: null,
  findHeaderActions: null,
  setBottomTabsVisible: (visible) => set({ bottomTabsVisible: visible }),
  setInitShellAnimationPlayed: (played) => set({ initShellAnimationPlayed: played }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setProfileActiveTab: (tab) => set({ profileActiveTab: tab }),
  setChatsFilter: (filter) => set({ chatsFilter: filter }),
  setMarketplaceTab: (tab) => set({ marketplaceTab: tab }),
  setFindViewMode: (mode) => set({ findViewMode: mode }),
  setRequestFindGoToCurrent: (mode) => set({ requestFindGoToCurrent: mode }),
  setBounceNotifications: (bounce) => set({ bounceNotifications: bounce }),
  setPendingPlayerCardReopen: (data) => set({ pendingPlayerCardReopen: data }),
  setMyGamesCalendarDateAfterCreate: (date) => set({ myGamesCalendarDateAfterCreate: date }),
  setMyGamesSelectedDay: (day) => set({ myGamesSelectedDay: day }),
  setFindSelectedDay: (day) => set({ findSelectedDay: day }),
  setFindListWeekStartDay: (day) => set({ findListWeekStartDay: day }),
  setUserProfileHeaderActions: (actions) => set({ userProfileHeaderActions: actions }),
  setFindHeaderActions: (actions) => set({ findHeaderActions: actions }),
}));
