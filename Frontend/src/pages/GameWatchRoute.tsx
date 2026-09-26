import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

const GameWatchPage = lazy(() =>
  import('@/pages/GameWatchPage').then((m) => ({ default: m.GameWatchPage }))
);

export const GameWatchRoute = () => {
  const [searchParams] = useSearchParams();
  const hasSpectator = Boolean(searchParams.get('spectatorToken'));

  const inner = (
    <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
      <GameWatchPage />
    </Suspense>
  );

  if (hasSpectator) return inner;
  return <ProtectedRoute>{inner}</ProtectedRoute>;
};
