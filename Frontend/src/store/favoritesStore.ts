import { create } from 'zustand';
import { favoritesApi } from '@/api/favorites';

const FAVORITES_STALE_MS = 60_000;

interface FavoritesState {
  favoriteUserIds: string[];
  isLoading: boolean;
  lastFetchedAt: number | null;
  fetchFavorites: () => Promise<void>;
  addFavorite: (userId: string) => void;
  removeFavorite: (userId: string) => void;
  isFavorite: (userId: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteUserIds: [],
  isLoading: false,
  lastFetchedAt: null,
  fetchFavorites: async () => {
    const { lastFetchedAt } = get();
    if (lastFetchedAt && Date.now() - lastFetchedAt < FAVORITES_STALE_MS) return;
    set({ isLoading: true });
    try {
      const ids = await favoritesApi.getUserFavoriteUserIds();
      set({ favoriteUserIds: ids, isLoading: false, lastFetchedAt: Date.now() });
    } catch (error) {
      console.error('Failed to fetch favorite users:', error);
      set({ isLoading: false });
    }
  },
  addFavorite: (userId: string) => {
    const currentIds = get().favoriteUserIds;
    if (!currentIds.includes(userId)) {
      set({ favoriteUserIds: [...currentIds, userId] });
    }
  },
  removeFavorite: (userId: string) => {
    const currentIds = get().favoriteUserIds;
    set({ favoriteUserIds: currentIds.filter((id) => id !== userId) });
  },
  isFavorite: (userId: string) => {
    return get().favoriteUserIds.includes(userId);
  },
}));

