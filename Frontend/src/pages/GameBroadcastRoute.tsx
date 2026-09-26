import { Suspense, lazy } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { liveWatchPath } from '@/features/live/liveWatchPath';

const GameBroadcastMatchPage = lazy(() =>
  import('@/pages/GameBroadcastMatchPage').then((m) => ({ default: m.GameBroadcastMatchPage }))
);

export const GameBroadcastRoute = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const spectatorToken = searchParams.get('spectatorToken');
  const matchId = searchParams.get('matchId');

  /*
   * This page is the OBS overlay, and overlay share URLs always carry
   * `transparent=1`. A token without it is a viewer link from before
   * `/watch` existed (Telegram `/live`, the Live block, the rail), so the
   * viewer gets the watch board instead of a lower-third on an empty screen.
   */
  if (id && matchId && spectatorToken && searchParams.get('transparent') !== '1') {
    return <Navigate to={liveWatchPath(id, matchId, spectatorToken)} replace />;
  }

  const inner = (
    <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
      <GameBroadcastMatchPage />
    </Suspense>
  );

  if (spectatorToken) return inner;
  return <ProtectedRoute>{inner}</ProtectedRoute>;
};
