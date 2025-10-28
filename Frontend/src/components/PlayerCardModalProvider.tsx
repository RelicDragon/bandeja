import { ReactNode } from 'react';
import { PlayerCardModalContext } from '@/contexts/PlayerCardModalContext';

interface PlayerCardModalProviderProps {
  children: ReactNode;
  openPlayerCard: (playerId: string) => void;
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

