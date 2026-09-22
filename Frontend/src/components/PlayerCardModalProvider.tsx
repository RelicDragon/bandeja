import { useMemo, type ReactNode } from 'react';
import { PlayerCardModalContext } from '@/contexts/PlayerCardModalContext';

interface PlayerCardModalProviderProps {
  children: ReactNode;
  openPlayerCard: (playerId: string, levelSport?: import('@shared/sport').Sport) => void;
  closePlayerCard: () => void;
  openPlayerAuthPrompt: (trigger: HTMLElement) => void;
}

export const PlayerCardModalProvider = ({
  children,
  openPlayerCard,
  closePlayerCard,
  openPlayerAuthPrompt,
}: PlayerCardModalProviderProps) => {
  const value = useMemo(
    () => ({ openPlayerCard, closePlayerCard, openPlayerAuthPrompt }),
    [openPlayerCard, closePlayerCard, openPlayerAuthPrompt],
  );

  return (
    <PlayerCardModalContext.Provider value={value}>
      {children}
    </PlayerCardModalContext.Provider>
  );
};
