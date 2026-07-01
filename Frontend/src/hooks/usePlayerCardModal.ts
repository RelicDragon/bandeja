import { useContext, useCallback } from 'react';
import { PlayerCardModalContext } from '@/contexts/PlayerCardModalContext';
import { useSportLevelContext } from '@/contexts/useSportLevelContext';
import type { Sport } from '@shared/sport';

export const usePlayerCardModal = () => {
  const context = useContext(PlayerCardModalContext);
  const contextLevelSport = useSportLevelContext();
  if (!context) {
    throw new Error('usePlayerCardModal must be used within PlayerCardModalProvider');
  }

  const { openPlayerCard: contextOpenPlayerCard, closePlayerCard: contextClosePlayerCard } = context;

  const openPlayerCard = useCallback(
    (playerId: string, levelSport?: Sport) => {
      contextOpenPlayerCard(playerId, levelSport ?? contextLevelSport);
    },
    [contextOpenPlayerCard, contextLevelSport],
  );

  const closePlayerCard = useCallback(
    () => {
      contextClosePlayerCard();
    },
    [contextClosePlayerCard],
  );

  return { openPlayerCard, closePlayerCard };
};

