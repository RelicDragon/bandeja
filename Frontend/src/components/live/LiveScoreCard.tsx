import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Award, Play } from 'lucide-react';
import type { LiveRailGame } from '@/api/live';
import { ClubAvatar } from '@/components/ClubAvatar';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { LiveGameSummarySide } from '@/types';
import { minutesSince, sidePlayerNames } from '@/features/live/liveSummaryUpdate';
import { LiveScoreDigits } from './LiveScoreDigits';

/**
 * PRD 349 — one live game.
 *
 * `carousel` is the 240 px snap card; `full` is the full-width variant used
 * when the city has exactly one live game, with an explicit **Watch** button.
 *
 * The score block carries `layoutId="live-score-<gameId>"` so it can scale into
 * the broadcast header as a shared element.
 */

export interface LiveScoreCardProps {
  game: LiveRailGame;
  variant?: 'carousel' | 'full';
  /** Socket is down: the scores are frozen and captioned, never blanked. */
  isReconnecting?: boolean;
  onOpen: (game: LiveRailGame) => void;
}

function SideStack({
  side,
  align,
}: {
  side: LiveGameSummarySide;
  align: 'start' | 'end';
}) {
  const names = sidePlayerNames(side);
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-1 ${
        align === 'start' ? 'items-start text-start' : 'items-end text-end'
      }`}
    >
      <div className={`flex ${align === 'end' ? 'flex-row-reverse' : ''} -space-x-2 rtl:space-x-reverse`}>
        {side.players.slice(0, 2).map((player) => (
          <PlayerAvatar
            key={player.id}
            player={player}
            subscribePresence={false}
            fullHideName
            extrasmall
          />
        ))}
      </div>
      <span className="w-full truncate text-[11px] font-medium leading-tight text-gray-600 dark:text-gray-300">
        {names.join(' / ')}
      </span>
    </div>
  );
}

function SetPills({ side }: { side: LiveGameSummarySide }) {
  const completed = side.setScores.slice(0, Math.max(0, side.setScores.length - 1));
  if (completed.length === 0) return null;
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {completed.map((score, index) => (
        <span
          key={`${index}-${score}`}
          className="rounded bg-gray-100 px-1 text-[10px] font-semibold leading-4 tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        >
          {score}
        </span>
      ))}
    </div>
  );
}

function LiveScoreCardView({
  game,
  variant = 'carousel',
  isReconnecting = false,
  onOpen,
}: LiveScoreCardProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const summary = game.liveSummary;
  const [sideA, sideB] = summary.sides;

  const startedMinutes = useMemo(
    () => minutesSince(summary.startedAt, Date.now()),
    [summary.startedAt],
  );

  const startedText =
    startedMinutes === null || startedMinutes < 1
      ? t('live.startedJustNow')
      : t('live.started', { count: startedMinutes });

  // The a11y label reads "Marko and Ana lead 6–4, 3–2"; the conjunction is
  // localized (Chinese and Japanese use their own list separators, not a word).
  const namesA = sidePlayerNames(sideA).join(t('live.andJoin'));
  const namesB = sidePlayerNames(sideB).join(t('live.andJoin'));
  const setScoreText = useMemo(() => {
    const count = Math.min(sideA.setScores.length, sideB.setScores.length);
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) parts.push(`${sideA.setScores[i]}–${sideB.setScores[i]}`);
    return parts.join(', ');
  }, [sideA.setScores, sideB.setScores]);

  /** "Marko and Ana lead 6–4, 3–2" — the whole score block reads as one string. */
  const scoreLabel = sideA.leading
    ? t('live.scoreLead', { leaders: namesA, score: setScoreText })
    : sideB.leading
      ? t('live.scoreLead', { leaders: namesB, score: setScoreText })
      : t('live.scoreLevel', { sideA: namesA, sideB: namesB, score: setScoreText });

  const venue = [game.clubName, game.courtName].filter(Boolean).join(' · ');

  const glow = (side: LiveGameSummarySide) =>
    side.leading && !reduceMotion
      ? { boxShadow: ['0 0 0 0 rgba(239,68,68,0)', '0 0 0 3px rgba(239,68,68,0.28)', '0 0 0 0 rgba(239,68,68,0)'] }
      : undefined;

  const currentScoreBlock = (
    <div
      className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 py-1.5 dark:bg-gray-800/60"
      role="img"
      aria-label={scoreLabel}
      data-testid="live-score-block"
    >
      <motion.span
        className="flex flex-col items-center gap-0.5 rounded-lg px-1"
        animate={glow(sideA)}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <SetPills side={sideA} />
        <LiveScoreDigits
          value={String(sideA.currentGameScore || sideA.setScores[sideA.setScores.length - 1] || 0)}
          className="text-xl font-bold leading-none text-gray-900 dark:text-gray-50"
        />
      </motion.span>
      <span className="text-sm font-semibold text-gray-400 dark:text-gray-500" aria-hidden>
        :
      </span>
      <motion.span
        className="flex flex-col items-center gap-0.5 rounded-lg px-1"
        animate={glow(sideB)}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <SetPills side={sideB} />
        <LiveScoreDigits
          value={String(sideB.currentGameScore || sideB.setScores[sideB.setScores.length - 1] || 0)}
          className="text-xl font-bold leading-none text-gray-900 dark:text-gray-50"
        />
      </motion.span>
    </div>
  );

  const header = (
    <div className="flex min-w-0 items-center gap-2">
      <ClubAvatar
        club={{ id: game.clubId ?? undefined, name: game.clubName ?? game.cityName, avatar: game.clubAvatar }}
        className="h-6 w-6 shrink-0"
        variant="tile"
      />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-600 dark:text-gray-300">
        {venue || game.name || game.cityName}
      </span>
      {game.affectsRating ? (
        <Award
          size={13}
          className="shrink-0 text-amber-500"
          aria-label={t('live.ratedGame')}
          role="img"
        />
      ) : null}
      {game.viewerIsPlaying ? (
        <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
          {t('live.youTag')}
        </span>
      ) : null}
    </div>
  );

  const footer = (
    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
      {isReconnecting ? (
        <span className="text-gray-400 dark:text-gray-500">{t('live.reconnecting')}</span>
      ) : (
        startedText
      )}
    </p>
  );

  const body = (
    <>
      {header}
      <div className="flex items-center gap-2">
        <SideStack side={sideA} align="start" />
        {currentScoreBlock}
        <SideStack side={sideB} align="end" />
      </div>
      {footer}
    </>
  );

  if (variant === 'full') {
    return (
      <div
        className="flex w-full items-center gap-3 rounded-2xl border border-gray-200/70 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
        data-testid="live-score-card"
        data-variant="full"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">{body}</div>
        <button
          type="button"
          onClick={() => onOpen(game)}
          data-testid="live-watch-button"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          <Play size={16} aria-hidden />
          {t('live.watch')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      data-testid="live-score-card"
      data-variant="carousel"
      aria-label={`${venue || game.name || game.cityName}. ${scoreLabel}. ${startedText}`}
      className="flex min-h-[44px] w-[240px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-gray-200/70 bg-white p-3 text-start transition hover:border-primary-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-primary-700"
    >
      {body}
    </button>
  );
}

export const LiveScoreCard = memo(LiveScoreCardView);
