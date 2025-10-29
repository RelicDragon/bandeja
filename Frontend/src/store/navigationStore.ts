import { create } from 'zustand';

interface NavigationState {
  currentPage: 'home' | 'profile' | 'gameDetails' | 'gameResultsEntry' | 'bugs';
  isAnimating: boolean;
  gameDetailsCanAccessChat: boolean;
  setCurrentPage: (page: 'home' | 'profile' | 'gameDetails' | 'gameResultsEntry' | 'bugs') => void;
  setIsAnimating: (animating: boolean) => void;
  setGameDetailsCanAccessChat: (canAccessChat: boolean) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'home',
  isAnimating: false,
  gameDetailsCanAccessChat: false,
  setCurrentPage: (page) => set({ currentPage: page }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  setGameDetailsCanAccessChat: (canAccessChat) => set({ gameDetailsCanAccessChat: canAccessChat }),
}));
