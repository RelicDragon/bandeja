import { memo, useCallback, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { LiveRailGame } from '@/api/live';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { LiveDot } from './LiveDot';
import { LiveScoreCard } from './LiveScoreCard';
import { LiveScoreCardSkeleton } from './LiveScoreCardSkeleton';

/**
 * PRD 349 — the "Live now" rail.
 *
 * Structure follows `FindCityEventsRail`: memoised view, a `RAIL_LIMIT`,
 * `return null` when there is nothing to show, and the caller wraps it in
 * `<AnimatedMount layout show={…}>` so the reveal is a height/opacity fade.
 *
 * A single live game renders full-width with an explicit **Watch** button;
 * two or more render as a 240 px horizontal snap carousel.
 */

export const LIVE_RAIL_LIMIT = 10;

export interface LiveNowRailProps {
  games: LiveRailGame[];
  onOpen: (game: LiveRailGame) => void;
  isLoading?: boolean;
  /** Socket down: every card is frozen. */
  isReconnecting?: boolean;
  /**
   * PRD 349 — cards whose own room is not joined even though the socket is up.
   * Without this a single failed join shows a frozen score that looks live.
   */
  reconnectingGameIds?: ReadonlySet<string>;
  /** Home uses the softer "Live in {city}" header and a See all link. */
  variant?: 'find' | 'home';
  cityName?: string;
  maxCards?: number;
  onSeeAll?: () => void;
}

function LiveNowRailView({
  games,
  onOpen,
  isLoading = false,
  isReconnecting = false,
  reconnectingGameIds,
  variant = 'find',
  cityName,
  maxCards = LIVE_RAIL_LIMIT,
  onSeeAll,
}: LiveNowRailProps) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const visible = games.slice(0, Math.min(maxCards, LIVE_RAIL_LIMIT));

  const isCardReconnecting = useCallback(
    (game: LiveRailGame) => isReconnecting || Boolean(reconnectingGameIds?.has(game.id)),
    [isReconnecting, reconnectingGameIds],
  );

  /** Arrow-key scrolling; `start`/`end` are logical, so `ar` mirrors correctly. */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    event.preventDefault();
    // `scrollLeft` is already direction-aware in every engine we support, so a
    // physical-direction step is what the user's arrow key means on screen.
    const step = event.key === 'ArrowRight' ? 248 : -248;
    scroller.scrollBy({ left: step, behavior: 'smooth' });
  }, []);

  if (isLoading) {
    return (
      <section
        className="mb-3 rounded-2xl border border-gray-200/70 bg-white px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-900"
        data-testid="live-now-rail-loading"
        aria-busy="true"
        aria-label={t('live.loading')}
      >
        <div className="mb-2 flex items-center gap-2 px-0.5">
          <LiveDot />
          <span className={`${shimmerBlock} h-3 w-20`} />
        </div>
        <div className="flex gap-3 overflow-hidden pb-1">
          <LiveScoreCardSkeleton />
          <LiveScoreCardSkeleton />
        </div>
      </section>
    );
  }

  if (visible.length === 0) return null;

  const title =
    variant === 'home' && cityName ? t('live.cityTitle', { city: cityName }) : t('live.nowTitle');

  return (
    <section
      className="mb-3 rounded-2xl border border-gray-200/70 bg-white px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-900"
      data-testid="live-now-rail"
      data-variant={variant}
      data-layout={visible.length === 1 ? 'single' : 'carousel'}
      aria-label={t('live.gamesCount', { count: visible.length })}
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <h2
          className={`flex min-w-0 items-center gap-1.5 text-sm ${
            variant === 'home'
              ? 'font-medium text-gray-600 dark:text-gray-300'
              : 'font-semibold text-gray-800 dark:text-gray-100'
          }`}
        >
          <LiveDot />
          <span className="truncate">{title}</span>
          <span
            className="shrink-0 rounded-full bg-red-50 px-1.5 text-xs font-semibold tabular-nums text-red-600 dark:bg-red-950/40 dark:text-red-300"
            aria-hidden
          >
            {visible.length}
          </span>
        </h2>
        {onSeeAll ? (
          <button
            type="button"
            data-testid="live-now-rail-see-all"
            onClick={onSeeAll}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-0.5 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
          >
            {t('live.seeAllOnFind')}
            <ChevronRight size={14} className="shrink-0 rtl:rotate-180" aria-hidden />
          </button>
        ) : null}
      </div>

      {visible.length === 1 ? (
        <LiveScoreCard
          game={visible[0]}
          variant="full"
          isReconnecting={isCardReconnecting(visible[0])}
          onOpen={onOpen}
        />
      ) : (
        <div
          ref={scrollerRef}
          role="group"
          tabIndex={0}
          aria-label={t('live.carouselLabel')}
          onKeyDown={handleKeyDown}
          data-testid="live-now-rail-carousel"
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-primary-500 [&::-webkit-scrollbar]:hidden"
        >
          {visible.map((game) => (
            <LiveScoreCard
              key={game.id}
              game={game}
              isReconnecting={isCardReconnecting(game)}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export const LiveNowRail = memo(LiveNowRailView);
