import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { pairsApi, type PairEntry, type PairPeriod, type PairSort } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { isAndroid } from '@/utils/capacitor';
import { addOverlay } from '@/utils/urlSchema';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { Button } from '@/components/Button';
import { LeaderboardSportPicker } from '@/components/leaderboard/LeaderboardSportPicker';
import {
  getViewerPrimarySport,
  hasMultipleSportsEnabled,
  listEnabledSports,
} from '@/utils/profileSports';
import type { Sport } from '@/types';
import { PairPodium } from './PairPodium';
import { PairRow } from './PairRow';
import { PairSortChips, PairPeriodChips } from './PairSortChips';
import { PairLeaderboardSkeleton } from './PairLeaderboardSkeleton';
import { usePairFormatters } from './pairFormat';

/** Pairs ranked below this need at least this many games together (PRD 352). */
const PAIR_MIN_GAMES = 5;
/** How many extra pages "scroll to my pair" is allowed to pull in. */
const MAX_SCROLL_FETCHES = 10;
const FLASH_MS = 1200;

/**
 * The Pairs mode of the Top tab.
 *
 * Cursor-paginated (the pair table is quadratic in players), podium on top,
 * memoised rows below. Tapping a pair with an existing `UserTeam` goes straight
 * to that team's page; otherwise it opens the `?pair=a,b` overlay sheet.
 */
export const PairLeaderboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const formatters = usePairFormatters();
  const prefersReducedMotion = usePrefersReducedMotion();

  const [sort, setSort] = useState<PairSort>('winRate');
  const [period, setPeriod] = useState<PairPeriod>('all');
  const [sport, setSport] = useState<Sport>(() => getViewerPrimarySport(user));
  const [flashingPairId, setFlashingPairId] = useState<string | null>(null);
  const [myPairVisible, setMyPairVisible] = useState(true);

  /** Wraps podium *and* list — a top-3 pair is not inside the `<ul>`. */
  const boardRef = useRef<HTMLDivElement>(null);
  const flashTimerRef = useRef<number | null>(null);

  const enabledSports = useMemo(() => listEnabledSports(user), [user]);
  const showSportPicker = hasMultipleSportsEnabled(user);
  const activeSport = showSportPicker ? sport : getViewerPrimarySport(user);
  const cityId = user?.currentCity?.id;

  useEffect(() => {
    setSport(getViewerPrimarySport(user));
  }, [user]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.pairs.leaderboard(cityId, activeSport, period, sort),
    queryFn: ({ pageParam }) =>
      pairsApi.getLeaderboard({
        cityId,
        sport: activeSport,
        period,
        sort,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60 * 1000,
  });

  const pairs = useMemo(
    () => query.data?.pages.flatMap((page) => page.pairs) ?? [],
    [query.data],
  );
  const me = query.data?.pages[0]?.me ?? null;
  const podium = useMemo(() => pairs.slice(0, 3), [pairs]);
  const rows = useMemo(() => pairs.slice(3), [pairs]);

  const openPair = useCallback(
    (entry: PairEntry) => {
      if (entry.teamId) {
        navigate(`/user-team/${entry.teamId}`);
        return;
      }
      navigate(addOverlay(location.pathname, location.search, 'pair', entry.pairId));
    },
    [location.pathname, location.search, navigate],
  );

  // The pill only matters when the viewer's own pair is off screen.
  useEffect(() => {
    if (!me) {
      setMyPairVisible(true);
      return;
    }
    const node = boardRef.current?.querySelector<HTMLElement>(`[data-pair-id="${me.pairId}"]`);
    if (!node) {
      setMyPairVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setMyPairVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [me, pairs]);

  const flashPair = useCallback((pairId: string) => {
    setFlashingPairId(pairId);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashingPairId(null), FLASH_MS);
  }, []);

  const scrollToMyPair = useCallback(async () => {
    if (!me) return;
    // The viewer's pair may be several pages down; pull pages until it is in
    // the DOM, then scroll. Android gets `auto` — smooth scrolling there
    // fights the WebView, exactly as the player leaderboard already handles it.
    for (let attempt = 0; attempt <= MAX_SCROLL_FETCHES; attempt += 1) {
      const node = document.querySelector<HTMLElement>(`[data-pair-id="${me.pairId}"]`);
      if (node) {
        flashPair(me.pairId);
        requestAnimationFrame(() => {
          node.scrollIntoView({
            behavior: isAndroid() || prefersReducedMotion ? 'auto' : 'smooth',
            block: 'center',
          });
        });
        return;
      }
      if (!query.hasNextPage) return;
      const result = await query.fetchNextPage();
      // `query.hasNextPage` is captured from this render, so trust the fresh
      // result instead: without this the loop would burn its whole budget once
      // the list has run out of pages.
      if (!result.hasNextPage) {
        const last = document.querySelector<HTMLElement>(`[data-pair-id="${me.pairId}"]`);
        if (!last) return;
      }
    }
  }, [flashPair, me, prefersReducedMotion, query]);

  if (query.isLoading) return <PairLeaderboardSkeleton />;

  if (query.isError) {
    return (
      <div className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
        {t('pairs.error')}
      </div>
    );
  }

  const filters = (
    <div className="space-y-2">
      {showSportPicker ? (
        <LeaderboardSportPicker sports={enabledSports} value={sport} onChange={setSport} />
      ) : null}
      <PairPeriodChips value={period} onChange={setPeriod} />
      <PairSortChips value={sort} onChange={setSort} />
    </div>
  );

  if (pairs.length === 0) {
    return (
      <div className="space-y-3">
        {filters}
        <EmptyStateCard
          icon={Users}
          title={t('pairs.empty.title')}
          description={t('pairs.floorHint', { count: PAIR_MIN_GAMES })}
          action={
            <Button variant="primary" size="md" onClick={() => navigate('/find')}>
              {t('pairs.empty.action')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div ref={boardRef} className="relative space-y-3" data-testid="pair-leaderboard">
      {filters}
      <PairPodium pairs={podium} onOpen={openPair} />

      <ul className="space-y-1" data-testid="pair-rows">
        {rows.map((entry) => (
          <PairRow
            key={entry.pairId}
            entry={entry}
            onOpen={openPair}
            flashing={flashingPairId === entry.pairId}
          />
        ))}
      </ul>

      {query.hasNextPage ? (
        <div className="flex justify-center pb-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {t('pairs.loadMore')}
          </Button>
        </div>
      ) : null}

      {me && !myPairVisible ? (
        <motion.button
          type="button"
          data-testid="scroll-to-my-pair"
          onClick={() => void scrollToMyPair()}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
          className="sticky bottom-3 z-20 mx-auto flex min-h-[2.75rem] items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-4 text-xs font-semibold text-primary-700 shadow-lg dark:border-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
        >
          <span>{t('pairs.scrollToMyPair', { rank: formatters.count(me.rank) })}</span>
          <ChevronDown size={14} aria-hidden />
        </motion.button>
      ) : null}
    </div>
  );
};
