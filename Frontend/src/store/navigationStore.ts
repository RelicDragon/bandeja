import { create } from 'zustand';

interface NavigationState {
  currentPage: 'home' | 'profile' | 'gameDetails' | 'bugs' | 'gameSubscriptions';
  isAnimating: boolean;
  gameDetailsCanAccessChat: boolean;
  bounceNotifications: boolean;
  bugsButtonSlidingUp: boolean;
  bugsButtonSlidingDown: boolean;
  setCurrentPage: (page: 'home' | 'profile' | 'gameDetails' | 'bugs' | 'gameSubscriptions') => void;
  setIsAnimating: (animating: boolean) => void;
  setGameDetailsCanAccessChat: (canAccessChat: boolean) => void;
  setBounceNotifications: (bounce: boolean) => void;
  setBugsButtonSlidingUp: (sliding: boolean) => void;
  setBugsButtonSlidingDown: (sliding: boolean) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'home',
  isAnimating: false,
  gameDetailsCanAccessChat: false,
  bounceNotifications: false,
  bugsButtonSlidingUp: false,
  bugsButtonSlidingDown: false,
  setCurrentPage: (page) => set({ currentPage: page }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  setGameDetailsCanAccessChat: (canAccessChat) => set({ gameDetailsCanAccessChat: canAccessChat }),
  setBounceNotifications: (bounce) => set({ bounceNotifications: bounce }),
  setBugsButtonSlidingUp: (sliding) => set({ bugsButtonSlidingUp: sliding }),
  setBugsButtonSlidingDown: (sliding) => set({ bugsButtonSlidingDown: sliding }),
}));
