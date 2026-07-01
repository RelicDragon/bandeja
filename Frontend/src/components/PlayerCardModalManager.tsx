import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { PlayerCardModalProvider } from '@/components/PlayerCardModalProvider';
import { useShellNavStore } from '@/store/shellNavStore';
import { useSportContextStore } from '@/store/sportContextStore';
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
  const pendingReopen = useShellNavStore((s) => s.pendingPlayerCardReopen);
  const sportFromUrl = useMemo(
    () => parseLevelSportQuery(new URLSearchParams(location.search).get('sport')),
    [location.search],
  );

  useEffect(() => {
    const overlay = getOverlay(location.search);
    if (overlay?.type === 'player' && overlay.id) {
      setPlayerId(overlay.id);
      setCardLevelSport(
        sportFromUrl ?? useSportContextStore.getState().activeLevelSport,
      );
    }
  }, [location.pathname, location.search, sportFromUrl]);

  useEffect(() => {
    if (!pendingReopen) return;
    const currentIdx = window.history.state?.idx;
    if (typeof currentIdx !== 'number') return;

    if (currentIdx <= pendingReopen.sourceIdx) {
      useShellNavStore.getState().setPendingPlayerCardReopen(null);
      setPlayerId(pendingReopen.playerId);
      setCardLevelSport(useSportContextStore.getState().activeLevelSport);
    } else if (currentIdx > pendingReopen.sourceIdx + 1) {
      useShellNavStore.getState().setPendingPlayerCardReopen(null);
    }
  }, [location.pathname, location.search, pendingReopen]);

  const openPlayerCard = useCallback((id: string, levelSport?: Sport) => {
    setPlayerId(id);
    setCardLevelSport(
      levelSport ?? useSportContextStore.getState().activeLevelSport,
    );
  }, []);

  const closePlayerCard = useCallback(() => {
    setPlayerId(null);
    setCardLevelSport(undefined);
  }, []);

  const sheetLevelSport = playerId ? (cardLevelSport ?? sportFromUrl) : undefined;

  const sheet = (
    <PlayerCardBottomSheet playerId={playerId} onClose={closePlayerCard} />
  );

  return (
    <PlayerCardModalProvider openPlayerCard={openPlayerCard} closePlayerCard={closePlayerCard}>
      {children}
      {sheetLevelSport ? (
        <SportLevelProvider sport={sheetLevelSport}>{sheet}</SportLevelProvider>
      ) : (
        sheet
      )}
    </PlayerCardModalProvider>
  );
};
