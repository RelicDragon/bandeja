import { create } from 'zustand';

type VideoPlaybackState = {
  activeMessageId: string | null;
  setActive: (messageId: string | null) => void;
  clearIfActive: (messageId: string) => void;
};

export const useVideoPlaybackStore = create<VideoPlaybackState>((set) => ({
  activeMessageId: null,
  setActive: (messageId) => set({ activeMessageId: messageId }),
  clearIfActive: (messageId) =>
    set((s) => (s.activeMessageId === messageId ? { activeMessageId: null } : s)),
}));
