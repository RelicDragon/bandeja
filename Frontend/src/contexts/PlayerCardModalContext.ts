import { createContext } from 'react';

interface PlayerCardModalContextType {
  openPlayerCard: (playerId: string) => void;
  closePlayerCard: () => void;
}

export const PlayerCardModalContext = createContext<PlayerCardModalContextType | undefined>(undefined);

