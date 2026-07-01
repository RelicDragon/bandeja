import { useMemo, type ReactNode } from 'react';
import { PlayerCardModalContext } from '@/contexts/PlayerCardModalContext';

interface PlayerCardModalProviderProps {
  children: ReactNode;
  openPlayerCard: (playerId: string, levelSport?: import('@shared/sport').Sport) => void;
  closePlayerCard: () => void;
}

export const PlayerCardModalProvider = ({
  children,
  openPlayerCard,
  closePlayerCard,
}: PlayerCardModalProviderProps) => {
  const value = useMemo(
    () => ({ openPlayerCard, closePlayerCard }),
    [openPlayerCard, closePlayerCard],
  );

  return (
    <PlayerCardModalContext.Provider value={value}>
      {children}
    </PlayerCardModalContext.Provider>
  );
};

