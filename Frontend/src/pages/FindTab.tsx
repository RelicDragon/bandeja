import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { addMonths, startOfDay, format, parse } from 'date-fns';
import { AvailableGamesSection } from '@/components/home';
import { AdSlot } from '@/components/sponsorSlots';
import { PlayIntentHomeStrip } from '@/components/playIntent/PlayIntentFindBar';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { useRegisterAdSportContext } from '@/hooks/useAdPlacements';
import { MainTabFooter } from '@/components';
import { PullToRefreshShell } from '@/components/PullToRefreshShell';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useDesktop } from '@/hooks/useDesktop';
import { useAvailableGames } from '@/hooks/useAvailableGames';
import { useAvailableUpcomingGames } from '@/hooks/useAvailableUpcomingGames';
import { useGameFilters } from '@/hooks/useGameFilters';
import {
  findSportFilterToApiParam,
  getViewerPrimarySport,
  resolveFindAdSportContext,
  resolveFindLevelFilterSport,
} from '@/utils/findSportFilter';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  computeFindMonthDateRange,
  isFindGamesQueryReady,
  resolveFindMonthRangeAnchor,
} from '@/utils/findMonthDateRange';
import { buildFindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { runWithOverlapConfirm } from '@/utils/gameSlotOverlapConfirm';
import { recoverGenderUnsetJoin, runWithGenderForEvent } from '@/utils/genderJoinGate';
import { FindHeaderActions } from '@/components/headerContent/FindHeaderActions';
import { availableGamesQueryOptions } from '@/queries/games/useAvailableGamesQuery';
import type { AvailableGamesPage } from '@/queries/games/availableGamesPage';
import { availableUpcomingGamesQueryOptions } from '@/queries/games/useAvailableUpcomingGamesQuery';
import {
  dayScopedQueryParams,
  monthSeedRangeFromParams,
  seedDayScopedAvailableCache,
} from '@/queries/games/seedDayScopedAvailableCache';
import { prefetchFindNeighborDays } from '@/queries/games/prefetchFindNeighborDays';
import {
  findPrefetchIsReady,
  scheduleFindPrefetch,
} from '@/queries/games/scheduleFindPrefetch';
import { sortGamesByStatusAndStartTime } from '@/queries/games/sortGames';
import type { Game } from '@/types';
import {
  buildAvailableGamesFilterHash,
  buildAvailableUpcomingFilterHash,
} from '@/queries/queryKeys';
import { deriveFindCalendarGamesLoading } from '@/utils/deriveFindCalendarGamesLoading';
import { isAvailableGamesDayIndexContinuationRunning } from '@/queries/games/availableGamesDayIndexContinuation';

export const FindTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isDesktop = useDesktop();
  const findViewMode = useShellNavStore((s) => s.findViewMode);
  const findSelectedDay = useShellNavStore((s) => s.findSelectedDay);
  const setFindSelectedDay = useShellNavStore((s) => s.setFindSelectedDay);
  const setFindHeaderActions = useShellNavStore((s) => s.setFindHeaderActions);

  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const [dateRange, setDateRange] = useState<{ startDate?: Date; endDate?: Date }>(() =>
    computeFindMonthDateRange(
      resolveFindMonthRangeAnchor(findSelectedDay, new Date()),
      resolveDisplaySettings(user).weekStart,
    ),
  );
  const [calendarRangeReady, setCalendarRangeReady] = useState(false);

  useEffect(() => {
    if (calendarRangeReady) return;
    setDateRange(
      computeFindMonthDateRange(
        resolveFindMonthRangeAnchor(findSelectedDay, new Date()),
        displaySettings.weekStart,
      ),
    );
  }, [displaySettings.weekStart, calendarRangeReady, findSelectedDay]);

  const queryDateRange = dateRange;

  const { filters, updateFilter, updateFilters, isHydrated } = useGameFilters();

  useEffect(() => {
    if (!isHydrated || findSelectedDay != null) {
      return;
    }
    setFindSelectedDay(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  }, [findSelectedDay, setFindSelectedDay, isHydrated]);

  const viewerPrimarySport = useMemo(() => getViewerPrimarySport(user), [user]);
  const findLevelSport = useMemo(
    () => resolveFindLevelFilterSport(filters.filterSport, viewerPrimarySport),
    [filters.filterSport, viewerPrimarySport],
  );
  const findSportApiParam = useMemo(
    () => findSportFilterToApiParam(filters.filterSport, viewerPrimarySport),
    [filters.filterSport, viewerPrimarySport],
  );
  const findAdSport = useMemo(
    () => resolveFindAdSportContext(filters.filterSport, viewerPrimarySport),
    [filters.filterSport, viewerPrimarySport],
  );
  useRegisterAdSportContext(AD_PLACEMENTS.FIND_TOP, findAdSport);

  const calendarStructural = useMemo(
    () => buildFindStructuralApiParams(filters, 'calendar'),
    [filters],
  );
  const upcomingStructural = useMemo(
    () => buildFindStructuralApiParams(filters, 'upcoming'),
    [filters],
  );

  const queryEnabled = isFindGamesQueryReady({
    isHydrated,
    calendarRangeReady: findViewMode === 'calendar' ? calendarRangeReady : true,
    userId: user?.id,
  });
  const calendarQueryEnabled = queryEnabled && findViewMode === 'calendar';
  const listQueryEnabled = queryEnabled && findViewMode === 'list';

  const cityId = user?.currentCity?.id || user?.currentCityId;
  const cityTimezone = user?.currentCity?.timezone;
  const calendarQueryParams = useMemo(
    () => ({
      userId: user?.id,
      startDate: queryDateRange.startDate,
      endDate: queryDateRange.endDate,
      includeLeagues: true as const,
      sport: findSportApiParam,
      showPrivateGames: filters.showPrivateGames,
      isAdmin: user?.isAdmin,
      cityId,
      structural: calendarStructural,
      indexOnly: true as const,
    }),
    [
      user?.id,
      user?.isAdmin,
      cityId,
      queryDateRange.startDate,
      queryDateRange.endDate,
      findSportApiParam,
      filters.showPrivateGames,
      calendarStructural,
    ],
  );
  const upcomingQueryParams = useMemo(
    () => ({
      userId: user?.id,
      includeLeagues: true as const,
      sport: findSportApiParam,
      showPrivateGames: filters.showPrivateGames,
      isAdmin: user?.isAdmin,
      cityId,
      structural: upcomingStructural,
    }),
    [
      user?.id,
      user?.isAdmin,
      cityId,
      findSportApiParam,
      filters.showPrivateGames,
      upcomingStructural,
    ],
  );

  const {
    availableGames: calendarGames,
    meta: calendarMeta,
    page: calendarPage,
    loading: loadingCalendarGames,
    isFetching: fetchingCalendarGames,
    isPlaceholderData: calendarIsPlaceholder,
    refetch: refetchCalendarGames,
    loadMore: loadMoreCalendarGames,
  } = useAvailableGames(
    user,
    queryDateRange.startDate,
    queryDateRange.endDate,
    true,
    findSportApiParam,
    filters.showPrivateGames,
    calendarQueryEnabled,
    calendarStructural,
    false,
    true, // indexOnly — month badges via dayIndex
  );

  const selectedDayDate = useMemo(() => {
    if (!findSelectedDay) return undefined;
    const d = startOfDay(parse(findSelectedDay, 'yyyy-MM-dd', new Date()));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [findSelectedDay]);

  // Day cards load in parallel with month index (fast TTFP). Seed is best-effort.
  const dayScopedEnabled =
    calendarQueryEnabled && !!selectedDayDate && findViewMode === 'calendar';

  const monthSeedRange = useMemo(
    () => monthSeedRangeFromParams(calendarQueryParams),
    [calendarQueryParams],
  );

  // Seed only from settled month index (never keepPreviousData placeholder).
  useLayoutEffect(() => {
    if (!dayScopedEnabled || !selectedDayDate || !calendarPage || !monthSeedRange) return;
    seedDayScopedAvailableCache(
      queryClient,
      calendarPage,
      dayScopedQueryParams(calendarQueryParams, selectedDayDate),
      cityTimezone,
      monthSeedRange,
    );
  }, [
    dayScopedEnabled,
    selectedDayDate,
    calendarPage,
    queryClient,
    calendarQueryParams,
    cityTimezone,
    monthSeedRange,
  ]);

  const {
    availableGames: selectedDayGames,
    meta: selectedDayMeta,
    page: selectedDayPage,
    loading: loadingSelectedDayGames,
    isError: selectedDayIsError,
    refetch: refetchSelectedDayGames,
    loadMore: loadMoreSelectedDayGames,
  } = useAvailableGames(
    user,
    selectedDayDate,
    selectedDayDate,
    true,
    findSportApiParam,
    filters.showPrivateGames,
    dayScopedEnabled,
    calendarStructural,
    true, // rejectPlaceholderData
    false,
  );

  const {
    availableGames: upcomingGames,
    meta: upcomingMeta,
    loading: loadingUpcomingGames,
    isFetching: fetchingUpcomingGames,
    refetch: refetchUpcomingGames,
    loadMore: loadMoreUpcomingGames,
  } = useAvailableUpcomingGames(
    user,
    true,
    findSportApiParam,
    filters.showPrivateGames,
    listQueryEnabled,
    upcomingStructural,
  );

  // Neighbor cards warm immediately after the visible month/day have settled.
  const neighborPrefetchKeyRef = useRef<string>('');
  useEffect(() => {
    const selectedDayReady = selectedDayPage != null || selectedDayIsError;
    if (
      !queryEnabled ||
      !user?.id ||
      findViewMode !== 'calendar' ||
      !calendarPage ||
      calendarIsPlaceholder ||
      !selectedDayReady ||
      !selectedDayDate ||
      !monthSeedRange
    ) {
      return;
    }

    const calendarHash = buildAvailableGamesFilterHash({
      ...calendarQueryParams,
      indexOnly: true,
    });
    const key = `${calendarHash}:${findSelectedDay ?? ''}`;
    if (neighborPrefetchKeyRef.current === key) return;
    neighborPrefetchKeyRef.current = key;

    prefetchFindNeighborDays(
      queryClient,
      calendarQueryParams,
      selectedDayDate,
      calendarPage,
      cityTimezone,
      monthSeedRange,
    );
  }, [
    queryEnabled,
    user?.id,
    findViewMode,
    calendarPage,
    calendarIsPlaceholder,
    selectedDayPage,
    selectedDayIsError,
    selectedDayDate,
    monthSeedRange,
    calendarQueryParams,
    findSelectedDay,
    queryClient,
    cityTimezone,
  ]);

  // Less urgent inactive-view and adjacent-month requests wait for browser idle.
  const calendarIndexContinuing = isAvailableGamesDayIndexContinuationRunning(calendarPage);
  const prefetchKeyRef = useRef<string>('');
  useEffect(() => {
    if (!queryEnabled || !user?.id) return;
    const selectedDayReady = selectedDayPage != null || selectedDayIsError;
    const visibleDataReady = findPrefetchIsReady({
      viewMode: findViewMode,
      calendarPageReady: calendarPage != null,
      calendarIsPlaceholder,
      calendarFetching: fetchingCalendarGames,
      calendarContinuing: calendarIndexContinuing,
      selectedDayReady,
      upcomingLoading: loadingUpcomingGames,
      upcomingFetching: fetchingUpcomingGames,
    });
    if (!visibleDataReady) return;

    const calendarHash = buildAvailableGamesFilterHash({
      ...calendarQueryParams,
      indexOnly: true,
    });
    const upcomingHash = buildAvailableUpcomingFilterHash(upcomingQueryParams);
    const key = `${findViewMode}:${calendarHash}:${findSelectedDay ?? ''}:${calendarPage ? 'm1' : 'm0'}:${selectedDayReady ? 'd1' : 'd0'}:${upcomingHash}`;
    if (prefetchKeyRef.current === key) return;

    return scheduleFindPrefetch(() => {
      if (prefetchKeyRef.current === key) return;
      if (findViewMode === 'calendar') {
        const visibleMonthOptions = availableGamesQueryOptions(calendarQueryParams, true);
        if (
          queryClient.isFetching({ queryKey: visibleMonthOptions.queryKey, exact: true }) > 0 ||
          isAvailableGamesDayIndexContinuationRunning(
            queryClient.getQueryData<AvailableGamesPage>(visibleMonthOptions.queryKey),
          )
        ) {
          return;
        }
      }
      prefetchKeyRef.current = key;
      if (findViewMode === 'calendar') {
        void queryClient.prefetchQuery(availableUpcomingGamesQueryOptions(upcomingQueryParams, true));
      } else {
        void queryClient.prefetchQuery(availableGamesQueryOptions(calendarQueryParams, true));
      }

      if (queryDateRange.startDate) {
        const anchor = resolveFindMonthRangeAnchor(findSelectedDay, queryDateRange.startDate);
        for (const delta of [-1, 1]) {
          const adj = computeFindMonthDateRange(addMonths(anchor, delta), displaySettings.weekStart);
          void queryClient.prefetchQuery(
            availableGamesQueryOptions(
              {
                ...calendarQueryParams,
                startDate: adj.startDate,
                endDate: adj.endDate,
                indexOnly: true,
              },
              true,
            ),
          );
        }
      }
    });
  }, [
    queryEnabled,
    user?.id,
    findViewMode,
    queryClient,
    calendarQueryParams,
    upcomingQueryParams,
    queryDateRange.startDate,
    findSelectedDay,
    displaySettings.weekStart,
    calendarPage,
    calendarIsPlaceholder,
    fetchingCalendarGames,
    calendarIndexContinuing,
    selectedDayPage,
    selectedDayIsError,
    loadingUpcomingGames,
    fetchingUpcomingGames,
  ]);

  const filteredAvailableGames = useMemo(() => {
    if (findViewMode === 'list') return sortGamesByStatusAndStartTime<Game>(upcomingGames);
    return sortGamesByStatusAndStartTime<Game>(calendarGames);
  }, [findViewMode, upcomingGames, calendarGames]);

  // undefined = day not ready (skeleton); [] = settled empty; non-empty = cards.
  // Must stay aligned with AvailableGamesSection initialGamesLoading (null check).
  const sortedSelectedDayGames = useMemo((): Game[] | undefined => {
    if (!dayScopedEnabled) return undefined;
    if (selectedDayGames.length > 0) {
      return sortGamesByStatusAndStartTime(selectedDayGames);
    }
    if (loadingSelectedDayGames) return undefined;
    // Hard fail (no successful page) → [] so list leaves skeleton; section shows Retry.
    if (selectedDayIsError) return [];
    if (selectedDayMeta.hasMore) return [];
    return [];
  }, [
    dayScopedEnabled,
    selectedDayGames,
    loadingSelectedDayGames,
    selectedDayIsError,
    selectedDayMeta.hasMore,
  ]);

  const loadingAvailableGames =
    findViewMode === 'list'
      ? loadingUpcomingGames
      : deriveFindCalendarGamesLoading({
          dayScopedEnabled,
          loadingCalendar: loadingCalendarGames,
          dayListReady: sortedSelectedDayGames != null,
        });

  const useDayScopedList = dayScopedEnabled;

  const pageMeta =
    findViewMode === 'list'
      ? upcomingMeta
      : useDayScopedList
        ? selectedDayMeta
        : calendarMeta;
  const onLoadMoreAvailable =
    findViewMode === 'list'
      ? loadMoreUpcomingGames
      : useDayScopedList
        ? loadMoreSelectedDayGames
        : loadMoreCalendarGames;

  const refetchAvailableGames = useCallback(async () => {
    await Promise.all([
      refetchCalendarGames(),
      refetchUpcomingGames(),
      refetchSelectedDayGames(),
    ]);
  }, [refetchCalendarGames, refetchUpcomingGames, refetchSelectedDayGames]);

  const handleDateRangeChange = useCallback((startDate: Date, endDate: Date) => {
    setDateRange({ startDate, endDate });
    setCalendarRangeReady(true);
  }, []);

  const handleJoinGame = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleJoinGame(gameId, e));
      return;
    }
    const joinGame =
      sortedSelectedDayGames?.find((g) => g.id === gameId)
      ?? upcomingGames.find((g) => g.id === gameId)
      ?? filteredAvailableGames.find((g) => g.id === gameId)
      ?? calendarMeta.dayIndex?.find((g) => g.id === gameId);
    if (!runWithGenderForEvent(joinGame, () => void handleJoinGame(gameId, e))) return;
    try {
      const { gamesApi } = await import('@/api');
      const response = await runWithOverlapConfirm((confirmOverlap) => gamesApi.join(gameId, confirmOverlap));
      if (!response) return;
      const message = (response as { message?: string }).message || 'Successfully joined the game';

      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      refetchAvailableGames();
      navigate(`/games/${gameId}`);
    } catch (error: any) {
      if (recoverGenderUnsetJoin(error, () => void handleJoinGame(gameId, e))) return;
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await refetchAvailableGames();
  }, [refetchAvailableGames]);

  const splitView = isDesktop && findViewMode === 'calendar';

  const findHeaderActions = useMemo(
    () => (
      <FindHeaderActions
        user={user}
        filters={filters}
        onFiltersChange={updateFilters}
      />
    ),
    [filters, updateFilters, user],
  );

  useEffect(() => {
    setFindHeaderActions(findHeaderActions);
    return () => setFindHeaderActions(null);
  }, [findHeaderActions, setFindHeaderActions]);

  const sectionProps = {
    availableGames: filteredAvailableGames,
    selectedDayGames: sortedSelectedDayGames,
    // Hide previous-month badge counts while the new month index is in flight.
    dayIndex: calendarIsPlaceholder ? undefined : calendarMeta.dayIndex,
    user,
    loading: loadingAvailableGames,
    onJoin: handleJoinGame,
    onMonthChange: undefined as undefined,
    onDateRangeChange: handleDateRangeChange,
    filters,
    onFilterChange: (key: Parameters<typeof updateFilter>[0], value: Parameters<typeof updateFilter>[1]) =>
      updateFilter(key, value),
    onFiltersChange: (updates: Parameters<typeof updateFilters>[0]) => updateFilters(updates),
    onNoteSaved: () => refetchAvailableGames(),
    hasMoreAvailable: pageMeta.hasMore,
    onLoadMoreAvailable,
    availableBound: pageMeta.bound,
    dayLoadError: Boolean(dayScopedEnabled && selectedDayIsError && selectedDayPage == null),
    onRetryDay: refetchSelectedDayGames,
  };

  if (splitView) {
    return (
      <>
        <PlayIntentHomeStrip cityId={user?.currentCity?.id} sport={findLevelSport} />
        <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0 px-4" />
        <AvailableGamesSection {...sectionProps} splitView={true} />
      </>
    );
  }

  return (
    <PullToRefreshShell onRefresh={handleRefresh}>
      {({ isRefreshing }) => (
        <>
          <PlayIntentHomeStrip cityId={user?.currentCity?.id} sport={findLevelSport} />
          <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0" />
          <AvailableGamesSection {...sectionProps} />
          <MainTabFooter isLoading={loadingAvailableGames || isRefreshing} />
        </>
      )}
    </PullToRefreshShell>
  );
};
