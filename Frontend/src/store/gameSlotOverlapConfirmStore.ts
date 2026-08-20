import { create } from 'zustand';

type Settle = (confirmed: boolean) => void;

let pending: Settle | null = null;
let inflight: Promise<boolean> | null = null;

interface GameSlotOverlapConfirmState {
  open: boolean;
  ask: () => Promise<boolean>;
  settle: (confirmed: boolean) => void;
}

export const useGameSlotOverlapConfirmStore = create<GameSlotOverlapConfirmState>((set) => ({
  open: false,
  ask: () => {
    if (inflight) return inflight;
    inflight = new Promise<boolean>((resolve) => {
      pending = resolve;
      set({ open: true });
    });
    return inflight;
  },
  settle: (confirmed) => {
    const resolve = pending;
    pending = null;
    inflight = null;
    set({ open: false });
    resolve?.(confirmed);
  },
}));
