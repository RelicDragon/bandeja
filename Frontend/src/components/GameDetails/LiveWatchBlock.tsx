import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Play } from 'lucide-react';
import { liveApi } from '@/api/live';
import { queryKeys } from '@/queries/queryKeys';
import { shouldShowLiveWatchBlock } from './liveWatchVisibility';
import { LiveDot } from '@/components/live/LiveDot';
import { minutesSince, sidePlayerNames } from '@/features/live/liveSummaryUpdate';
import { mintLiveWatchPath } from '@/features/live/liveWatchPath';
import type { Game } from '@/types';

export interface LiveWatchBlockProps {
  game: Game;
  viewerIsParticipant: boolean;
  /**
   * The results-entry area this block replaces. Rendered whenever the block
   * itself cannot be shown (score still loading, or the server decided the
   * game is not watchable after all), so the viewer is never left with a hole
   * where the scoring card used to be.
   */
  fallback?: ReactNode;
}

export function LiveWatchBlock({ game, viewerIsParticipant, fallback = null }: LiveWatchBlockProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);

  const eligible = shouldShowLiveWatchBlock(game, viewerIsParticipant);

  /*
   * The score is not part of the game-detail payload, so the block fetches it.
   * A 404 means "not watchable" rather than an error — `retry: false` keeps a
   * finished game from re-asking.
   */
  const liveQuery = useQuery({
    queryKey: queryKeys.live.game(game.id),
    queryFn: async () => {
      const response = await liveApi.get(game.id);
      return response.data.data.game;
    },
    enabled: eligible,
    retry: false,
    staleTime: 15_000,
    refetchInterval: eligible ? 30_000 : false,
  });

  const summary = liveQuery.data?.liveSummary ?? null;

  const startedMinutes = useMemo(
    () => minutesSince(summary?.startedAt, Date.now()),
    [summary?.startedAt],
  );

  const handleWatch = useCallback(async () => {
    if (!summary || opening) return;
    setOpening(true);
    try {
      navigate(await mintLiveWatchPath(game.id, summary.matchId));
    } catch {
      toast.error(t('live.openFailed'));
    } finally {
      setOpening(false);
    }
  }, [game.id, navigate, opening, summary, t]);

  if (!eligible) return null;
  if (!summary) return <>{fallback}</>;

  const [sideA, sideB] = summary.sides;
  const namesA = sidePlayerNames(sideA).join(t('live.andJoin'));
  const namesB = sidePlayerNames(sideB).join(t('live.andJoin'));
  const setCount = Math.min(sideA.setScores.length, sideB.setScores.length);
  const setScoreText = Array.from(
    { length: setCount },
    (_, i) => `${sideA.setScores[i]}–${sideB.setScores[i]}`,
  ).join(', ');

  const scoreLabel = sideA.leading
    ? t('live.scoreLead', { leaders: namesA, score: setScoreText })
    : sideB.leading
      ? t('live.scoreLead', { leaders: namesB, score: setScoreText })
      : t('live.scoreLevel', { sideA: namesA, sideB: namesB, score: setScoreText });

  return (
    <div
      data-testid="live-watch-block"
      className="rounded-2xl border border-gray-200/70 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
        <LiveDot />
        {t('live.detailsTitle')}
      </h3>

      <div
        role="img"
        aria-label={scoreLabel}
        className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/60"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200">
          {namesA}
        </span>
        <span className="shrink-0 text-lg font-bold tabular-nums text-gray-900 dark:text-gray-50">
          {setScoreText || '—'}
        </span>
        <span className="min-w-0 flex-1 truncate text-end text-sm font-medium text-gray-700 dark:text-gray-200">
          {namesB}
        </span>
      </div>

      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {startedMinutes === null || startedMinutes < 1
          ? t('live.startedJustNow')
          : t('live.started', { count: startedMinutes })}
        {' · '}
        {t('live.detailsBody')}
      </p>

      <button
        type="button"
        onClick={() => void handleWatch()}
        disabled={opening}
        data-testid="live-watch-block-button"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-base font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
      >
        <Play size={18} aria-hidden />
        {t('live.watchLive')}
      </button>
    </div>
  );
}
