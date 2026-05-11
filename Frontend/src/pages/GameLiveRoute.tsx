import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLoadingScreen } from '@/components';

const GameLiveMatchPage = lazy(() => import('@/pages/GameLiveMatchPage').then((m) => ({ default: m.GameLiveMatchPage })));

export const GameLiveRoute = () => {
  const [searchParams] = useSearchParams();
  const hasSpectator = Boolean(searchParams.get('spectatorToken'));

  const inner = (
    <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
      <GameLiveMatchPage />
    </Suspense>
  );

  if (hasSpectator) return inner;
  return <ProtectedRoute>{inner}</ProtectedRoute>;
};
