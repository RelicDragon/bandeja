import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useResolvedAppAppearance } from '@/store/themeStore';
import { liveBoardThemeSearchParam, parseLiveBoardTheme } from '@/utils/liveScoring';

export const GameLiveBroadcastRedirect = () => {
  const resolvedAppAppearance = useResolvedAppAppearance();
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  if (!id) return <Navigate to="/" replace />;
  if (!matchId) return <Navigate to={`/games/${id}`} replace />;
  const next = new URLSearchParams(searchParams);
  const rawTheme = next.get('theme');
  next.set(
    'theme',
    liveBoardThemeSearchParam(
      rawTheme != null && rawTheme !== ''
        ? parseLiveBoardTheme(rawTheme)
        : parseLiveBoardTheme(resolvedAppAppearance)
    )
  );
  return <Navigate to={`/games/${id}/broadcast?${next.toString()}`} replace />;
};
