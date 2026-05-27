import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { PlayerCardModalProvider } from '@/components/PlayerCardModalProvider';
import { useNavigationStore } from '@/store/navigationStore';
import { getOverlay } from '@/utils/urlSchema';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { parseLevelSportQuery } from '@/utils/levelSportQuery';
import type { Sport } from '@shared/sport';

interface PlayerCardModalManagerProps {
  children: React.ReactNode;
}

export const PlayerCardModalManager = ({ children }: PlayerCardModalManagerProps) => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [cardLevelSport, setCardLevelSport] = useState<Sport | undefined>();
  const location = useLocation();
  const pendingReopen = useNavigationStore((s) => s.pendingPlayerCardReopen);
  const sportFromUrl = useMemo(
    () => parseLevelSportQuery(new URLSearchParams(location.search).get('sport')),
    [location.search],
  );

  useEffect(() => {
    const overlay = getOverlay(location.search);
    if (overlay?.type === 'player' && overlay.id) {
      setPlayerId(overlay.id);
      setCardLevelSport(sportFromUrl);
    }
  }, [location.pathname, location.search, sportFromUrl]);

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

  const openPlayerCard = (id: string, levelSport?: Sport) => {
    setPlayerId(id);
    setCardLevelSport(levelSport);
  };

  const closePlayerCard = () => {
    setPlayerId(null);
    setCardLevelSport(undefined);
  };

  const effectiveLevelSport = cardLevelSport ?? sportFromUrl;

  return (
    <PlayerCardModalProvider openPlayerCard={openPlayerCard} closePlayerCard={closePlayerCard}>
      {children}
      <SportLevelProvider sport={effectiveLevelSport}>
        <PlayerCardBottomSheet playerId={playerId} onClose={closePlayerCard} />
      </SportLevelProvider>
    </PlayerCardModalProvider>
  );
};
