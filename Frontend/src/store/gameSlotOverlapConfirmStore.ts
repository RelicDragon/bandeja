import { create } from 'zustand';

type Settle = (confirmed: boolean) => void;

let pending: Settle | null = null;

interface GameSlotOverlapConfirmState {
  open: boolean;
  ask: () => Promise<boolean>;
  settle: (confirmed: boolean) => void;
}

export const useGameSlotOverlapConfirmStore = create<GameSlotOverlapConfirmState>((set) => ({
  open: false,
  ask: () =>
    new Promise<boolean>((resolve) => {
      pending = resolve;
      set({ open: true });
    }),
  settle: (confirmed) => {
    const resolve = pending;
    pending = null;
    set({ open: false });
    resolve?.(confirmed);
  },
}));
