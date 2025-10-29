import { create } from 'zustand';

export type AppMode = 'PADEL' | 'SOCIAL';

interface AppModeState {
  mode: AppMode;
  toggleMode: () => void;
  setMode: (mode: AppMode) => void;
}

export const useAppModeStore = create<AppModeState>((set) => {
  const savedMode = localStorage.getItem('appMode') as AppMode | null;
  const initialMode = savedMode || 'PADEL';

  return {
    mode: initialMode,
    toggleMode: () =>
      set((state) => {
        const newMode: AppMode = state.mode === 'PADEL' ? 'SOCIAL' : 'PADEL';
        localStorage.setItem('appMode', newMode);
        return { mode: newMode };
      }),
    setMode: (mode) => {
      localStorage.setItem('appMode', mode);
      set({ mode });
    },
  };
});
