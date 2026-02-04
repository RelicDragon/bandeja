import { useParams, Navigate } from 'react-router-dom';
import { useDesktop } from '@/hooks/useDesktop';
import { GameChat } from './GameChat';

export const GameChatRoute = () => {
  const { id } = useParams<{ id: string }>();
  const isDesktop = useDesktop();

  if (isDesktop && id) {
    return <Navigate to={`/games/${id}`} replace />;
  }

  return <GameChat />;
};
