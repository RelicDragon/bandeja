import { useEffect } from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType, Game } from '@/types';
import type { CreateFlowIntent, CreateTemplateId } from '@/sport/createFlow';
import { useNavigationStore } from '@/store/navigationStore';
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
  const entityType = state?.entityType;
  const initialGameData = state?.initialGameData;
  const initialCreateIntent = state?.createIntent;
  const initialTemplateId = state?.selectedTemplateId;
  const { setBottomTabsVisible } = useNavigationStore();
  
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

