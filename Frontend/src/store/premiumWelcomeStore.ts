import { create } from 'zustand';

export const usePremiumWelcomeStore = create<{
  userId: string | null;
  open: (userId: string) => void;
  close: () => void;
}>((set) => ({
  userId: null,
  open: (userId) => set({ userId }),
  close: () => set({ userId: null }),
}));
