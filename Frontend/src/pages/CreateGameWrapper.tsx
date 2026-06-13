import { useEffect, useMemo } from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType, Game } from '@/types';
import type { CreateFlowIntent, CreateTemplateId } from '@/sport/createFlow';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';

function initialGameDataFromSearch(search: string): {
  gameData: Partial<Game>;
  locationTimeMode?: LocationTimeMode;
  bookingIds: string[];
} {
  const params = new URLSearchParams(search);
  const clubId = params.get('clubId');
  const gameData: Partial<Game> = {};
  if (clubId) gameData.clubId = clubId;
  const courtId = params.get('courtId');
  if (courtId) gameData.courtId = courtId;
  const startTime = params.get('startTime');
  const endTime = params.get('endTime');
  if (startTime) gameData.startTime = startTime;
  if (endTime) gameData.endTime = endTime;
  if (params.get('hasBookedCourt') === '1') gameData.hasBookedCourt = true;

  const locationTimeMode = params.get('locationTimeMode');
  const bookingIdsRaw = params.get('bookingIds');
  const bookingIds = bookingIdsRaw
    ? bookingIdsRaw.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  return {
    gameData,
    locationTimeMode:
      locationTimeMode === 'bookings' || locationTimeMode === 'timeSlots'
        ? locationTimeMode
        : bookingIds.length > 0
          ? 'bookings'
          : undefined,
    bookingIds,
  };
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
  const queryInitial = useMemo(
    () => initialGameDataFromSearch(location.search),
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
      initialLocationTimeMode={queryInitial.locationTimeMode}
      initialBookingIds={queryInitial.bookingIds}
    />
  );
};
