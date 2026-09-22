import { createContext } from 'react';
import type { Sport } from '@shared/sport';

interface PlayerCardModalContextType {
  openPlayerCard: (playerId: string, levelSport?: Sport) => void;
  closePlayerCard: () => void;
  openPlayerAuthPrompt: (trigger: HTMLElement) => void;
}

export const PlayerCardModalContext = createContext<PlayerCardModalContextType | undefined>(undefined);
