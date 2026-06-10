import { useEffect } from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType, Game } from '@/types';
import type { CreateFlowIntent, CreateTemplateId } from '@/sport/createFlow';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';

function initialGameDataFromSearch(search: string): Partial<Game> | undefined {
  const params = new URLSearchParams(search);
  const clubId = params.get('clubId');
  if (!clubId) return undefined;
  const data: Partial<Game> = { clubId };
  const courtId = params.get('courtId');
  if (courtId) data.courtId = courtId;
  const startTime = params.get('startTime');
  const endTime = params.get('endTime');
  if (startTime) data.startTime = startTime;
  if (endTime) data.endTime = endTime;
  const hasBookedCourt = params.get('hasBookedCourt');
  if (hasBookedCourt === '1' || hasBookedCourt === 'true') {
    data.hasBookedCourt = true;
  }
  const externalBookingId = params.get('externalBookingId');
  if (externalBookingId) {
    data.externalBookingId = externalBookingId;
    data.externalBookingProvider = 'BOOKTIME';
    data.hasBookedCourt = true;
  }
  const externalBookingProvider = params.get('externalBookingProvider');
  if (externalBookingProvider === 'BOOKTIME') {
    data.externalBookingProvider = 'BOOKTIME';
  }
  return data;
}

export const CreateGameWrapper = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    entityType?: EntityType;
    initialGameData?: Partial<Game>;
    createIntent?: CreateFlowIntent;
    selectedTemplateId?: CreateTemplateId;
  };
  const queryInitialGameData = initialGameDataFromSearch(location.search);
  const entityType =
    state?.entityType ??
    (new URLSearchParams(location.search).get('entityType') as EntityType | null) ??
    (queryInitialGameData ? 'GAME' : undefined);
  const initialGameData = { ...queryInitialGameData, ...state?.initialGameData };
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
    />
  );
};

