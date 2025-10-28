import { useState } from 'react';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { PlayerCardModalProvider } from '@/components/PlayerCardModalProvider';

interface PlayerCardModalManagerProps {
  children: React.ReactNode;
}

export const PlayerCardModalManager = ({ children }: PlayerCardModalManagerProps) => {
  const [playerId, setPlayerId] = useState<string | null>(null);

  const openPlayerCard = (id: string) => {
    setPlayerId(id);
  };

  const closePlayerCard = () => {
    setPlayerId(null);
  };

  return (
    <PlayerCardModalProvider openPlayerCard={openPlayerCard} closePlayerCard={closePlayerCard}>
      {children}
      <PlayerCardBottomSheet playerId={playerId} onClose={closePlayerCard} />
    </PlayerCardModalProvider>
  );
};
