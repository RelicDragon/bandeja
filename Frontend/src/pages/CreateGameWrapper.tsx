import { useEffect, useMemo } from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType, Game } from '@/types';
import type { CreateFlowIntent, CreateTemplateId } from '@/sport/createFlow';
import { createGameDataFromDeepLinkSearch } from '@shared/gameBooking/parseCreateGameDeepLinkSearch';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';

export const CreateGameWrapper = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    entityType?: EntityType;
    initialGameData?: Partial<Game>;
    createIntent?: CreateFlowIntent;
    selectedTemplateId?: CreateTemplateId;
  };
  const queryInitial = useMemo(
    () => createGameDataFromDeepLinkSearch(location.search),
    [location.search],
  );
  const entityType =
    state?.entityType ??
    (new URLSearchParams(location.search).get('entityType') as EntityType | null) ??
    (queryInitial.gameData.clubId ? 'GAME' : undefined);
  const initialGameData = useMemo(
    () => ({ ...queryInitial.gameData, ...state?.initialGameData }),
    [queryInitial.gameData, state?.initialGameData],
  );
  const initialCreateIntent = state?.createIntent;
  const initialTemplateId = state?.selectedTemplateId;
  const { setBottomTabsVisible } = useShellNavStore();
  
  useEffect(() => {
    setBottomTabsVisible(false);
    return () => {
      setBottomTabsVisible(true);
    };
  }, [setBottomTabsVisible]);

  useBackButtonHandler(() => {
    navigate('/', { replace: true });
    return true;
  });

  if (!entityType || !['GAME', 'BAR', 'TRAINING', 'TOURNAMENT'].includes(entityType)) {
    return <Navigate to="/" replace />;
  }

  return (
    <CreateGame
      entityType={entityType}
      initialGameData={initialGameData}
      initialCreateIntent={initialCreateIntent}
      initialTemplateId={initialTemplateId}
      initialBookingIds={queryInitial.bookingIds}
    />
  );
};
