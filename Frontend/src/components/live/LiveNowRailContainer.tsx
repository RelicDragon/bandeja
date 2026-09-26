import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { LiveRailGame } from '@/api/live';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import {
  useLiveGames,
  LIVE_RAIL_FIND_LIMIT,
  LIVE_RAIL_HOME_LIMIT,
} from '@/features/live/useLiveGames';
import { finishedRailGamePath } from '@/features/live/finishedRailGamePath';
import { mintLiveWatchPath } from '@/features/live/liveWatchPath';
import { LiveNowRail } from './LiveNowRail';

/**
 * PRD 349 — the rail plus its data and navigation.
 *
 * Find renders it above the calendar; Home renders it after `HomeActionGrid`
 * and only when the viewer has no game of their own today, which is the caller's
 * decision (`enabled`), not this component's.
 *
 * Tapping a live card opens the read-only watch board (`mintLiveWatchPath`),
 * which works for a non-participant — that mint is what makes "spectating is
 * one tap" true. A finished card opens results ({@link finishedRailGamePath}).
 */
export interface LiveNowRailContainerProps {
  variant: 'find' | 'home';
  cityId?: string;
  cityName?: string;
  /** False → no request is made and nothing renders. */
  enabled?: boolean;
  onSeeAll?: () => void;
}

function LiveNowRailContainerView({
  variant,
  cityId,
  cityName,
  enabled = true,
  onSeeAll,
}: LiveNowRailContainerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const limit = variant === 'home' ? LIVE_RAIL_HOME_LIMIT : LIVE_RAIL_FIND_LIMIT;
  const { games, isLoading, isReconnecting, reconnectingGameIds } = useLiveGames({
    cityId,
    limit,
    enabled,
  });

  const handleOpen = useCallback(
    async (game: LiveRailGame) => {
      if (game.phase === 'finished') {
        navigate(finishedRailGamePath(game));
        return;
      }
      try {
        navigate(await mintLiveWatchPath(game.id, game.liveSummary.matchId));
      } catch {
        toast.error(t('live.openFailed'));
      }
    },
    [navigate, t],
  );

  const onOpen = useCallback(
    (game: LiveRailGame) => {
      void handleOpen(game);
    },
    [handleOpen],
  );

  if (!enabled) return null;

  const show = isLoading || games.length > 0;

  return (
    <AnimatedMount layout show={show}>
      <LiveNowRail
        games={games}
        onOpen={onOpen}
        isLoading={isLoading && games.length === 0}
        isReconnecting={isReconnecting}
        reconnectingGameIds={reconnectingGameIds}
        variant={variant}
        cityName={cityName}
        maxCards={limit}
        onSeeAll={variant === 'home' ? onSeeAll : undefined}
      />
    </AnimatedMount>
  );
}

export const LiveNowRailContainer = memo(LiveNowRailContainerView);
