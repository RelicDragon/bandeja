import { create } from 'zustand';
import type { Sport } from '@shared/sport';

interface SportContextState {
  activeLevelSport: Sport | undefined;
  levelSportStack: Sport[];
  pushActiveLevelSport: (sport: Sport) => void;
  popActiveLevelSport: (sport: Sport) => void;
}

export const useSportContextStore = create<SportContextState>((set) => ({
  activeLevelSport: undefined,
  levelSportStack: [] as Sport[],
  pushActiveLevelSport: (sport) =>
    set((s) => {
      const levelSportStack = [...s.levelSportStack, sport];
      return { levelSportStack, activeLevelSport: sport };
    }),
  popActiveLevelSport: (sport) =>
    set((s) => {
      const stack = [...s.levelSportStack];
      const i = stack.lastIndexOf(sport);
      if (i >= 0) stack.splice(i, 1);
      return {
        levelSportStack: stack,
        activeLevelSport: stack.length > 0 ? stack[stack.length - 1] : undefined,
      };
    }),
}));
