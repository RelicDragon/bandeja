import { ReactNode } from 'react';
import { PlayerCardModalContext } from '@/contexts/PlayerCardModalContext';

interface PlayerCardModalProviderProps {
  children: ReactNode;
  openPlayerCard: (playerId: string, levelSport?: import('@shared/sport').Sport) => void;
  closePlayerCard: () => void;
}

export const PlayerCardModalProvider = ({ 
  children, 
  openPlayerCard, 
  closePlayerCard 
}: PlayerCardModalProviderProps) => {
  return (
    <PlayerCardModalContext.Provider value={{ openPlayerCard, closePlayerCard }}>
      {children}
    </PlayerCardModalContext.Provider>
  );
};

