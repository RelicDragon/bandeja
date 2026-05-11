import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useResolvedAppAppearance } from '@/store/themeStore';
import { liveBoardThemeSearchParam, parseLiveBoardTheme } from '@/utils/liveScoring';

export const GameLiveTvRedirect = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const resolvedAppAppearance = useResolvedAppAppearance();
  const rawTheme = searchParams.get('theme');
  const theme = liveBoardThemeSearchParam(
    rawTheme != null && rawTheme !== ''
      ? parseLiveBoardTheme(rawTheme)
      : parseLiveBoardTheme(resolvedAppAppearance)
  );
  if (!id) return <Navigate to="/" replace />;
  if (!matchId) return <Navigate to={`/games/${id}`} replace />;
  return (
    <Navigate
      to={`/games/${id}/live?matchId=${encodeURIComponent(matchId)}&tv=1&theme=${encodeURIComponent(theme)}`}
      replace
    />
  );
};
