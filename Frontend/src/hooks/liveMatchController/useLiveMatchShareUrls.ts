import { useMemo } from 'react';
import { liveBoardThemeSearchParam, parseLiveBoardTheme } from '@/utils/liveScoring';

type ShareUrlParams = {
  gameId: string;
  matchId: string;
  pathname: string;
  locationSearch: string;
  effectiveSpectatorToken: string | null;
  shareBoardThemeParam: 'light' | 'dark';
};

export function useLiveMatchShareUrls({
  gameId,
  matchId,
  pathname,
  locationSearch,
  effectiveSpectatorToken,
  shareBoardThemeParam,
}: ShareUrlParams) {
  const controlUrl = useMemo(() => {
    if (typeof window === 'undefined' || !gameId || !matchId) return '';
    try {
      const u = new URL(`${window.location.origin}${pathname}${locationSearch}`);
      u.searchParams.delete('tv');
      return u.toString();
    } catch {
      return '';
    }
  }, [gameId, matchId, pathname, locationSearch]);

  const spectatorTvUrl = useMemo(() => {
    if (typeof window === 'undefined' || !gameId || !matchId || !effectiveSpectatorToken) return '';
    try {
      const u = new URL(`${window.location.origin}/games/${encodeURIComponent(gameId)}/live`);
      u.searchParams.set('matchId', matchId);
      u.searchParams.set('tv', '1');
      u.searchParams.set('theme', shareBoardThemeParam);
      u.searchParams.set('spectatorToken', effectiveSpectatorToken);
      return u.toString();
    } catch {
      return '';
    }
  }, [gameId, matchId, effectiveSpectatorToken, shareBoardThemeParam]);

  const broadcastShareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !gameId || !matchId) return '';
    try {
      const u = new URL(`${window.location.origin}/games/${encodeURIComponent(gameId)}/broadcast`);
      u.searchParams.set('matchId', matchId);
      if (effectiveSpectatorToken) u.searchParams.set('spectatorToken', effectiveSpectatorToken);
      u.searchParams.set('transparent', '1');
      u.searchParams.set('theme', shareBoardThemeParam);
      return u.toString();
    } catch {
      return '';
    }
  }, [gameId, matchId, effectiveSpectatorToken, shareBoardThemeParam]);

  return { controlUrl, spectatorTvUrl, broadcastShareUrl };
}

export function resolveShareBoardThemeParam(resolvedAppAppearance: string): 'light' | 'dark' {
  return liveBoardThemeSearchParam(parseLiveBoardTheme(resolvedAppAppearance));
}
