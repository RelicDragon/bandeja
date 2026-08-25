import { useEffect, useMemo, useRef } from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType, Game } from '@/types';
import type { CreateFlowIntent, CreateTemplateId } from '@/sport/createFlow';
import { createGameDataFromDeepLinkSearch } from '@shared/gameBooking/parseCreateGameDeepLinkSearch';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { playIntentsApi } from '@/api/playIntents';
import type { PlayIntentCreateSource } from '@shared/playIntentCreateSource';

export const CreateGameWrapper = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    entityType?: EntityType;
    initialGameData?: Partial<Game>;
    createIntent?: CreateFlowIntent;
    selectedTemplateId?: CreateTemplateId;
    invitedPlayerIds?: string[];
    matchProposalId?: string;
    playIntentSource?: PlayIntentCreateSource;
    playIntentRosterLevels?: number[];
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
  const matchProposalId = state?.matchProposalId;
  const convertedRef = useRef(false);
  const { setBottomTabsVisible } = useShellNavStore();

  useEffect(() => {
    setBottomTabsVisible(false);
    return () => {
      setBottomTabsVisible(true);
      if (matchProposalId && !convertedRef.current) {
        void playIntentsApi.releaseProposal(matchProposalId).catch(() => {});
      }
    };
  }, [setBottomTabsVisible, matchProposalId]);

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
      initialInvitedPlayerIds={state?.invitedPlayerIds}
      matchProposalId={matchProposalId}
      playIntentSource={state?.playIntentSource}
      playIntentRosterLevels={state?.playIntentRosterLevels}
      onMatchProposalConverted={() => {
        convertedRef.current = true;
      }}
    />
  );
};
