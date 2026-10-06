import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { pairsApi, type PairEntry, type PairPeriod, type PairSort } from '@/api/pairs';
import { userTeamsApi } from '@/api/userTeams';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { ChallengeUserTeamSheet } from '@/components/userTeam/ChallengeUserTeamSheet';
import {
  challengerTeamsFor,
  pairRowChallengeState,
  viewerPendingPair,
} from '@/utils/userTeamChallenge';
import { PairChallengeHint } from './PairChallengeHint';
import { toastApiError } from '@/utils/toastApiError';
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
import type { Sport, UserTeam } from '@/types';
import { PairPodium } from './PairPodium';
import { PairRow } from './PairRow';
import { PairSortChips, PairPeriodChips } from './PairSortChips';
import { PairLeaderboardSkeleton } from './PairLeaderboardSkeleton';
import { usePairFormatters } from './pairFormat';
import type { PairLeaderboardFocusState } from '@/components/userTeam/UserTeamRankChip';

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
  const [challengeTarget, setChallengeTarget] = useState<UserTeam | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const teams = useUserTeamsStore((state) => state.teams);
  const memberships = useUserTeamsStore((state) => state.memberships);
  const refreshUserTeams = useUserTeamsStore((state) => state.refreshAll);
  const userTeamsLoaded = useUserTeamsStore((state) => state.lastFetchedAt != null);

  useEffect(() => {
    void refreshUserTeams();
  }, [refreshUserTeams]);

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

  // Pair challenge from a row or podium card: only for a formal team that is
  // not the viewer's and only when the viewer has a complete pair sharing no
  // player with it. Other rows show no control; the board explains the rule
  // once — "only teams" for a viewer with a team, or how to get one.
  const viewerReadyPairs = useMemo(
    () => challengerTeamsFor(user?.id, memberships, teams, []),
    [memberships, teams, user?.id],
  );
  const challengeStateOf = useCallback(
    (entry: PairEntry) => pairRowChallengeState(user?.id, viewerReadyPairs, entry),
    [user?.id, viewerReadyPairs],
  );
  const canChallengeEntry = useCallback(
    (entry: PairEntry) => challengeStateOf(entry) === 'available',
    [challengeStateOf],
  );
  const viewerHasTeam = viewerReadyPairs.length > 0;
  const showNoTeamHint = Boolean(user?.id) && userTeamsLoaded && !viewerHasTeam;
  const showTeamsOnlyHint =
    viewerHasTeam && pairs.some((entry) => challengeStateOf(entry) === 'notTeam');
  const pendingPair = useMemo(
    () => (showNoTeamHint ? viewerPendingPair(user?.id, memberships, teams) : null),
    [memberships, showNoTeamHint, teams, user?.id],
  );
  const openChallenge = useCallback(
    async (entry: PairEntry) => {
      if (!entry.teamId) return;
      try {
        setChallengeTarget(await userTeamsApi.getById(entry.teamId));
        setChallengeOpen(true);
      } catch (error: unknown) {
        toastApiError(t, error);
      }
    },
    [t],
  );
  const handleChallenge = useCallback((entry: PairEntry) => void openChallenge(entry), [openChallenge]);
  const challengeTeams = useMemo(
    () =>
      challengeTarget
        ? challengerTeamsFor(
            user?.id,
            memberships,
            teams,
            challengeTarget.members.filter((m) => m.status === 'ACCEPTED').map((m) => m.userId),
          )
        : [],
    [challengeTarget, memberships, teams, user?.id],
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

  const scrollToPair = useCallback(async (pairId: string) => {
    // The pair may be several pages down; pull pages until it is in
    // the DOM, then scroll. Android gets `auto` — smooth scrolling there
    // fights the WebView, exactly as the player leaderboard already handles it.
    for (let attempt = 0; attempt <= MAX_SCROLL_FETCHES; attempt += 1) {
      const node = document.querySelector<HTMLElement>(`[data-pair-id="${pairId}"]`);
      if (node) {
        flashPair(pairId);
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
        const last = document.querySelector<HTMLElement>(`[data-pair-id="${pairId}"]`);
        if (!last) return;
      }
    }
  }, [flashPair, prefersReducedMotion, query]);

  const scrollToMyPair = useCallback(() => {
    if (me) void scrollToPair(me.pairId);
  }, [me, scrollToPair]);

  // Arrived from a team page's rank chip: bring that pair into view once.
  const focusPairId = (location.state as PairLeaderboardFocusState | null)?.focusPairId;
  const focusHandledRef = useRef<string | null>(null);
  const boardReady = !query.isLoading && pairs.length > 0;
  useEffect(() => {
    if (!focusPairId || !boardReady || focusHandledRef.current === focusPairId) return;
    focusHandledRef.current = focusPairId;
    void scrollToPair(focusPairId);
  }, [boardReady, focusPairId, scrollToPair]);

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
      {showNoTeamHint ? <PairChallengeHint pendingPair={pendingPair} /> : null}
      {showTeamsOnlyHint ? <PairChallengeHint teamsOnly /> : null}
      <PairPodium
        pairs={podium}
        onOpen={openPair}
        canChallenge={canChallengeEntry}
        onChallenge={handleChallenge}
      />

      <ul className="space-y-1" data-testid="pair-rows">
        {rows.map((entry) => (
          <PairRow
            key={entry.pairId}
            entry={entry}
            onOpen={openPair}
            flashing={flashingPairId === entry.pairId}
            onChallenge={canChallengeEntry(entry) ? handleChallenge : undefined}
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

      {challengeTarget && challengeTeams.length > 0 ? (
        <ChallengeUserTeamSheet
          open={challengeOpen}
          onOpenChange={setChallengeOpen}
          target={challengeTarget}
          challengerTeams={challengeTeams}
          sport={activeSport}
        />
      ) : null}

      {me && !myPairVisible ? (
        <motion.button
          type="button"
          data-testid="scroll-to-my-pair"
          onClick={scrollToMyPair}
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
