import { create } from 'zustand';

interface NavigationState {
  currentPage: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions';
  bottomTabsVisible: boolean;
  isAnimating: boolean;
  gameDetailsCanAccessChat: boolean;
  bounceNotifications: boolean;
  bugsButtonSlidingUp: boolean;
  bugsButtonSlidingDown: boolean;
  activeTab: 'my-games' | 'past-games' | 'search';
  profileActiveTab: 'general' | 'statistics' | 'comparison';
  chatsFilter: 'users' | 'bugs';
  findViewMode: 'calendar' | 'list';
  setCurrentPage: (page: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions') => void;
  setBottomTabsVisible: (visible: boolean) => void;
  setIsAnimating: (animating: boolean) => void;
  setGameDetailsCanAccessChat: (canAccessChat: boolean) => void;
  setBounceNotifications: (bounce: boolean) => void;
  setBugsButtonSlidingUp: (sliding: boolean) => void;
  setBugsButtonSlidingDown: (sliding: boolean) => void;
  setActiveTab: (tab: 'my-games' | 'past-games' | 'search') => void;
  setProfileActiveTab: (tab: 'general' | 'statistics' | 'comparison') => void;
  setChatsFilter: (filter: 'users' | 'bugs') => void;
  setFindViewMode: (mode: 'calendar' | 'list') => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'my',
  bottomTabsVisible: true,
  isAnimating: false,
  gameDetailsCanAccessChat: false,
  bounceNotifications: false,
  bugsButtonSlidingUp: false,
  bugsButtonSlidingDown: false,
  activeTab: 'my-games',
  profileActiveTab: 'general',
  chatsFilter: 'users',
  findViewMode: 'calendar',
  setCurrentPage: (page) => set({ currentPage: page }),
  setBottomTabsVisible: (visible) => set({ bottomTabsVisible: visible }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  setGameDetailsCanAccessChat: (canAccessChat) => set({ gameDetailsCanAccessChat: canAccessChat }),
  setBounceNotifications: (bounce) => set({ bounceNotifications: bounce }),
  setBugsButtonSlidingUp: (sliding) => set({ bugsButtonSlidingUp: sliding }),
  setBugsButtonSlidingDown: (sliding) => set({ bugsButtonSlidingDown: sliding }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setProfileActiveTab: (tab) => set({ profileActiveTab: tab }),
  setChatsFilter: (filter) => set({ chatsFilter: filter }),
  setFindViewMode: (mode) => set({ findViewMode: mode }),
}));
