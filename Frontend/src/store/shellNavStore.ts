import { create } from 'zustand';
import type { ReactNode } from 'react';
import type {
  QuickShortcutKind,
  ResolvedQuickShortcut,
} from '@/components/home/findQuickShortcuts';

/**
 * PRD 358 — the Find shortcut currently applied. Session-only: it lives here
 * and never in `useGameFilters` persistence, because a persisted "Tomorrow"
 * is wrong tomorrow.
 */
export type ActiveFindQuickShortcut = ResolvedQuickShortcut;

interface ShellNavState {
  bottomTabsVisible: boolean;
  initShellAnimationPlayed: boolean;
  isAnimating: boolean;
  activeTab: 'calendar' | 'past-games' | 'my-games' | 'search';
  profileActiveTab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews';
  chatsFilter: 'users' | 'bugs' | 'channels' | 'market';
  marketplaceTab: 'market' | 'my';
  findViewMode: 'calendar' | 'list';
  requestFindGoToCurrent: 'calendar' | 'list' | null;
  requestFocusInvitesNonce: number;
  bounceNotifications: boolean;
  pendingPlayerCardReopen: { playerId: string; sourceIdx: number } | null;
  myGamesCalendarDateAfterCreate: string | null;
  myGamesSelectedDay: string | null;
  findSelectedDay: string | null;
  findListWeekStartDay: string | null;
  activeFindQuickShortcut: ActiveFindQuickShortcut | null;
  /** `?quick=` deep link waiting for the Find section to apply it. */
  requestFindQuickShortcut: QuickShortcutKind | null;
  userProfileHeaderActions: ReactNode | null;
  findHeaderActions: ReactNode | null;
  setBottomTabsVisible: (visible: boolean) => void;
  setInitShellAnimationPlayed: (played: boolean) => void;
  setIsAnimating: (animating: boolean) => void;
  setActiveTab: (tab: 'calendar' | 'past-games' | 'my-games' | 'search') => void;
  setProfileActiveTab: (tab: 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews') => void;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  setMarketplaceTab: (tab: 'market' | 'my') => void;
  setFindViewMode: (mode: 'calendar' | 'list') => void;
  setRequestFindGoToCurrent: (mode: 'calendar' | 'list' | null) => void;
  bumpRequestFocusInvites: () => void;
  setBounceNotifications: (bounce: boolean) => void;
  setPendingPlayerCardReopen: (data: { playerId: string; sourceIdx: number } | null) => void;
  setMyGamesCalendarDateAfterCreate: (date: string | null) => void;
  setMyGamesSelectedDay: (day: string | null) => void;
  setFindSelectedDay: (day: string | null) => void;
  setFindListWeekStartDay: (day: string | null) => void;
  setActiveFindQuickShortcut: (shortcut: ActiveFindQuickShortcut | null) => void;
  setRequestFindQuickShortcut: (kind: QuickShortcutKind | null) => void;
  setUserProfileHeaderActions: (actions: ReactNode | null) => void;
  setFindHeaderActions: (actions: ReactNode | null) => void;
}

export const useShellNavStore = create<ShellNavState>((set) => ({
  bottomTabsVisible: true,
  initShellAnimationPlayed: false,
  isAnimating: false,
  activeTab: 'calendar',
  profileActiveTab: 'statistics',
  chatsFilter: 'users',
  marketplaceTab: 'market',
  findViewMode: 'calendar',
  requestFindGoToCurrent: null,
  requestFocusInvitesNonce: 0,
  bounceNotifications: false,
  pendingPlayerCardReopen: null,
  myGamesCalendarDateAfterCreate: null,
  myGamesSelectedDay: null,
  findSelectedDay: null,
  findListWeekStartDay: null,
  activeFindQuickShortcut: null,
  requestFindQuickShortcut: null,
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
  bumpRequestFocusInvites: () =>
    set((s) => ({ requestFocusInvitesNonce: s.requestFocusInvitesNonce + 1 })),
  setBounceNotifications: (bounce) => set({ bounceNotifications: bounce }),
  setPendingPlayerCardReopen: (data) => set({ pendingPlayerCardReopen: data }),
  setMyGamesCalendarDateAfterCreate: (date) => set({ myGamesCalendarDateAfterCreate: date }),
  setMyGamesSelectedDay: (day) => set({ myGamesSelectedDay: day }),
  setFindSelectedDay: (day) => set({ findSelectedDay: day }),
  setFindListWeekStartDay: (day) => set({ findListWeekStartDay: day }),
  setActiveFindQuickShortcut: (shortcut) => set({ activeFindQuickShortcut: shortcut }),
  setRequestFindQuickShortcut: (kind) => set({ requestFindQuickShortcut: kind }),
  setUserProfileHeaderActions: (actions) => set({ userProfileHeaderActions: actions }),
  setFindHeaderActions: (actions) => set({ findHeaderActions: actions }),
}));
