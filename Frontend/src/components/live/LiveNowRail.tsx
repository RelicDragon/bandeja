import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import type { LiveRailGame } from '@/api/live';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { LiveDot } from './LiveDot';
import { LIVE_CARD_WIDTH_PX, LiveScoreCard } from './LiveScoreCard';
import { LiveScoreCardSkeleton } from './LiveScoreCardSkeleton';

/**
 * PRD 349 — the "Live now" rail.
 *
 * Structure follows `FindCityEventsRail`: memoised view, a `RAIL_LIMIT`,
 * `return null` when there is nothing to show, and the caller wraps it in
 * `<AnimatedMount layout show={…}>` so the reveal is a height/opacity fade.
 *
 * Live games come first, then games whose results went final today in the
 * city (server order). A single card renders full-width; two or more render
 * as a horizontal snap carousel of fixed-width cards. Every card is one tap
 * target: live opens the watch board, finished opens the results.
 *
 * The header is "Live …" with the breathing dot while anything is live, and
 * "Today …" with a static icon once only results remain.
 */

export const LIVE_RAIL_LIMIT = 10;

/** Card width plus the `gap-2` between cards: one arrow press moves one card. */
const CAROUSEL_STEP_PX = LIVE_CARD_WIDTH_PX + 8;

/** "Started 23 min ago" goes stale fast; one shared tick keeps every card honest. */
const STARTED_TICK_MS = 60_000;

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

const sectionClass =
  'mb-3 rounded-2xl border border-gray-200/70 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900';

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
  const [now, setNow] = useState(() => Date.now());

  const visible = games.slice(0, Math.min(maxCards, LIVE_RAIL_LIMIT));
  const hasCards = visible.length > 0;

  useEffect(() => {
    if (!hasCards) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), STARTED_TICK_MS);
    return () => window.clearInterval(id);
  }, [hasCards]);

  const isCardReconnecting = useCallback(
    (game: LiveRailGame) => isReconnecting || Boolean(reconnectingGameIds?.has(game.id)),
    [isReconnecting, reconnectingGameIds],
  );

  /** Arrow-key scrolling, one card per press. */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    event.preventDefault();
    // `scrollLeft` is already direction-aware in every engine we support, so a
    // physical-direction step is what the user's arrow key means on screen.
    const step = event.key === 'ArrowRight' ? CAROUSEL_STEP_PX : -CAROUSEL_STEP_PX;
    scroller.scrollBy({ left: step, behavior: 'smooth' });
  }, []);

  if (isLoading) {
    return (
      <section
        className={sectionClass}
        data-testid="live-now-rail-loading"
        aria-busy="true"
        aria-label={t('live.loading')}
      >
        <div className="mb-2.5 flex h-5 items-center gap-2 px-0.5">
          <LiveDot />
          <span className={`${shimmerBlock} h-3 w-20`} />
        </div>
        <div className="flex gap-2 overflow-hidden">
          <LiveScoreCardSkeleton />
          <LiveScoreCardSkeleton />
        </div>
      </section>
    );
  }

  if (!hasCards) return null;

  const liveCount = visible.filter((game) => game.phase !== 'finished').length;
  const anyLive = liveCount > 0;
  const withCity = variant === 'home' && cityName;
  const title = anyLive
    ? withCity
      ? t('live.cityTitle', { city: cityName })
      : t('live.nowTitle')
    : withCity
      ? t('live.cityTodayTitle', { city: cityName })
      : t('live.todayTitle');
  const single = visible.length === 1;

  return (
    <section
      className={sectionClass}
      data-testid="live-now-rail"
      data-variant={variant}
      data-layout={single ? 'single' : 'carousel'}
      data-live={anyLive ? 'true' : 'false'}
      aria-label={
        liveCount === visible.length
          ? t('live.gamesCount', { count: visible.length })
          : t('live.todayGamesCount', { count: visible.length })
      }
    >
      <div className="mb-2.5 flex h-5 items-center justify-between gap-3 px-0.5">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {anyLive ? (
            <LiveDot />
          ) : (
            <CalendarCheck size={15} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
          )}
          <span className="truncate">{title}</span>
          {/* The count is of live games; results are not "live". */}
          {liveCount > 1 ? (
            <span
              className="shrink-0 text-xs font-semibold tabular-nums text-red-500 dark:text-red-400"
              aria-hidden
            >
              {liveCount}
            </span>
          ) : null}
        </h2>
        {onSeeAll ? (
          <button
            type="button"
            data-testid="live-now-rail-see-all"
            onClick={onSeeAll}
            className="-my-3 -me-1 inline-flex min-h-[44px] shrink-0 items-center gap-0.5 px-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
          >
            {t('live.seeAllOnFind')}
            <ChevronRight size={14} className="shrink-0 rtl:rotate-180" aria-hidden />
          </button>
        ) : null}
      </div>

      {single ? (
        <LiveScoreCard
          game={visible[0]}
          variant="full"
          now={now}
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
          className="-mx-2.5 flex snap-x snap-mandatory scroll-px-2.5 gap-2 overflow-x-auto px-2.5 outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-primary-500 [&::-webkit-scrollbar]:hidden"
        >
          {visible.map((game) => (
            <LiveScoreCard
              key={game.id}
              game={game}
              now={now}
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
