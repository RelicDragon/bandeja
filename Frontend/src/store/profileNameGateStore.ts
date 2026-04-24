import { create } from 'zustand';

type PendingRun = (() => void | Promise<void>) | null;

interface ProfileNameGateState {
  isOpen: boolean;
  pendingRun: PendingRun;
  openWithPending: (run: () => void | Promise<void>) => void;
  dismiss: () => void;
  resolveSaved: () => (() => void | Promise<void>) | null;
}

export const useProfileNameGateStore = create<ProfileNameGateState>((set, get) => ({
  isOpen: false,
  pendingRun: null,
  openWithPending: (run) => set({ isOpen: true, pendingRun: run }),
  dismiss: () => set({ isOpen: false, pendingRun: null }),
  resolveSaved: () => {
    const run = get().pendingRun;
    set({ isOpen: false, pendingRun: null });
    return run;
  },
}));
