import { useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType, Game } from '@/types';
import { useNavigationStore } from '@/store/navigationStore';

export const CreateGameWrapper = () => {
  const location = useLocation();
  const state = location.state as { entityType?: EntityType; initialDate?: Date | null; initialGameData?: Partial<Game> };
  const entityType = state?.entityType;
  const initialDate = state?.initialDate;
  const initialGameData = state?.initialGameData;
  const { setBottomTabsVisible } = useNavigationStore();
  
  console.log('CreateGameWrapper - received state:', { entityType, initialDate, stateType: typeof initialDate, initialGameData });

  useEffect(() => {
    setBottomTabsVisible(false);
    return () => {
      setBottomTabsVisible(true);
    };
  }, [setBottomTabsVisible]);

  if (!entityType || !['GAME', 'BAR', 'TRAINING', 'TOURNAMENT'].includes(entityType)) {
    return <Navigate to="/" replace />;
  }

  return <CreateGame entityType={entityType} initialDate={initialDate} initialGameData={initialGameData} />;
};

