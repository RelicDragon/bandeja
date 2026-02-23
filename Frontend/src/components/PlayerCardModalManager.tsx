import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { PlayerCardModalProvider } from '@/components/PlayerCardModalProvider';
import { useNavigationStore } from '@/store/navigationStore';

interface PlayerCardModalManagerProps {
  children: React.ReactNode;
}

export const PlayerCardModalManager = ({ children }: PlayerCardModalManagerProps) => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const location = useLocation();
  const pendingReopen = useNavigationStore((s) => s.pendingPlayerCardReopen);

  useEffect(() => {
    if (!pendingReopen) return;
    const currentIdx = window.history.state?.idx;
    if (typeof currentIdx !== 'number') return;

    if (currentIdx <= pendingReopen.sourceIdx) {
      useNavigationStore.getState().setPendingPlayerCardReopen(null);
      setPlayerId(pendingReopen.playerId);
    } else if (currentIdx > pendingReopen.sourceIdx + 1) {
      useNavigationStore.getState().setPendingPlayerCardReopen(null);
    }
  }, [location.pathname, location.search, pendingReopen]);

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
