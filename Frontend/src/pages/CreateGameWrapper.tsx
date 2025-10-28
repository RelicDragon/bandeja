import { useLocation, Navigate } from 'react-router-dom';
import { CreateGame } from './CreateGame';
import { EntityType } from '@/types';

export const CreateGameWrapper = () => {
  const location = useLocation();
  const entityType = (location.state as { entityType?: EntityType })?.entityType;

  if (!entityType || !['GAME', 'BAR', 'TRAINING', 'TOURNAMENT'].includes(entityType)) {
    return <Navigate to="/" replace />;
  }

  return <CreateGame entityType={entityType} />;
};

