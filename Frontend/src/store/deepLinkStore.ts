import { create } from 'zustand';

interface DeepLinkState {
  pendingAuthPath: string | null;
  setPendingAuthPath: (path: string | null) => void;
}

export const useDeepLinkStore = create<DeepLinkState>((set) => ({
  pendingAuthPath: null,
  setPendingAuthPath: (path) => set({ pendingAuthPath: path }),
}));
