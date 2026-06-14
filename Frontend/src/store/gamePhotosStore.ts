import { create } from 'zustand';
import { gamePhotosApi, type GamePhoto } from '@/api/gamePhotos';

type GamePhotosSlice = {
  photos: GamePhoto[];
  isLoading: boolean;
  loaded: boolean;
  nextCursor: string | null;
};

const emptySlice = (): GamePhotosSlice => ({
  photos: [],
  isLoading: false,
  loaded: false,
  nextCursor: null,
});

interface GamePhotosState {
  byGameId: Record<string, GamePhotosSlice>;
  getSlice: (gameId: string) => GamePhotosSlice;
  loadGamePhotos: (gameId: string) => Promise<GamePhoto[]>;
  addPhotoLocal: (gameId: string, photo: GamePhoto) => void;
  replacePhotoLocal: (gameId: string, tempId: string, photo: GamePhoto) => void;
  removePhotoLocal: (gameId: string, photoId: string) => void;
  applySocketAdded: (gameId: string, photo: GamePhoto) => void;
  applySocketDeleted: (gameId: string, photoId: string) => void;
  clearGame: (gameId: string) => void;
}

export const useGamePhotosStore = create<GamePhotosState>((set, get) => ({
  byGameId: {},

  getSlice: (gameId) => get().byGameId[gameId] ?? emptySlice(),

  loadGamePhotos: async (gameId) => {
    const existing = get().byGameId[gameId];
    if (existing?.isLoading) return existing.photos;

    set((s) => ({
      byGameId: {
        ...s.byGameId,
        [gameId]: { ...(s.byGameId[gameId] ?? emptySlice()), isLoading: true },
      },
    }));

    try {
      const allPhotos: GamePhoto[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const page = await gamePhotosApi.list(gameId, { limit: 50, cursor });
        allPhotos.push(...page.items);
        cursor = page.nextCursor;
        hasMore = !!page.nextCursor && page.items.length > 0;
      }

      set((s) => ({
        byGameId: {
          ...s.byGameId,
          [gameId]: {
            photos: allPhotos,
            isLoading: false,
            loaded: true,
            nextCursor: null,
          },
        },
      }));
      return allPhotos;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        set((s) => ({
          byGameId: {
            ...s.byGameId,
            [gameId]: {
              ...(s.byGameId[gameId] ?? emptySlice()),
              isLoading: false,
              loaded: true,
              photos: [],
            },
          },
        }));
        return [];
      }
      set((s) => ({
        byGameId: {
          ...s.byGameId,
          [gameId]: {
            ...(s.byGameId[gameId] ?? emptySlice()),
            isLoading: false,
            loaded: s.byGameId[gameId]?.loaded ?? false,
          },
        },
      }));
      throw error;
    }
  },

  addPhotoLocal: (gameId, photo) => {
    set((s) => {
      const slice = s.byGameId[gameId] ?? emptySlice();
      if (slice.photos.some((p) => p.id === photo.id)) return s;
      return {
        byGameId: {
          ...s.byGameId,
          [gameId]: { ...slice, photos: [photo, ...slice.photos] },
        },
      };
    });
  },

  replacePhotoLocal: (gameId, tempId, photo) => {
    set((s) => {
      const slice = s.byGameId[gameId] ?? emptySlice();
      const idx = slice.photos.findIndex((p) => p.id === tempId);
      const photos =
        idx >= 0
          ? slice.photos.map((p, i) => (i === idx ? photo : p))
          : slice.photos.some((p) => p.id === photo.id)
            ? slice.photos
            : [photo, ...slice.photos];
      return {
        byGameId: {
          ...s.byGameId,
          [gameId]: { ...slice, photos },
        },
      };
    });
  },

  removePhotoLocal: (gameId, photoId) => {
    set((s) => {
      const slice = s.byGameId[gameId];
      if (!slice) return s;
      return {
        byGameId: {
          ...s.byGameId,
          [gameId]: { ...slice, photos: slice.photos.filter((p) => p.id !== photoId) },
        },
      };
    });
  },

  applySocketAdded: (gameId, photo) => {
    get().addPhotoLocal(gameId, photo);
  },

  applySocketDeleted: (gameId, photoId) => {
    get().removePhotoLocal(gameId, photoId);
  },

  clearGame: (gameId) => {
    set((s) => {
      const next = { ...s.byGameId };
      delete next[gameId];
      return { byGameId: next };
    });
  },
}));
