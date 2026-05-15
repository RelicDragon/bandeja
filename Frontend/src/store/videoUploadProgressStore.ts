import { create } from 'zustand';

type VideoUploadProgressState = {
  byTempId: Record<string, number>;
  setProgress: (tempId: string, progress: number) => void;
  clear: (tempId: string) => void;
};

export const useVideoUploadProgressStore = create<VideoUploadProgressState>((set) => ({
  byTempId: {},
  setProgress: (tempId, progress) =>
    set((s) => ({ byTempId: { ...s.byTempId, [tempId]: progress } })),
  clear: (tempId) =>
    set((s) => {
      const { [tempId]: _, ...rest } = s.byTempId;
      return { byTempId: rest };
    }),
}));
