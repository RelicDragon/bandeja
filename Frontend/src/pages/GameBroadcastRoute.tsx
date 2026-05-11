import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

const GameBroadcastMatchPage = lazy(() =>
  import('@/pages/GameBroadcastMatchPage').then((m) => ({ default: m.GameBroadcastMatchPage }))
);

export const GameBroadcastRoute = () => {
  const [searchParams] = useSearchParams();
  const hasSpectator = Boolean(searchParams.get('spectatorToken'));

  const inner = (
    <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
      <GameBroadcastMatchPage />
    </Suspense>
  );

  if (hasSpectator) return inner;
  return <ProtectedRoute>{inner}</ProtectedRoute>;
};
