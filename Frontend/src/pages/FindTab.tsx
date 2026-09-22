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
import { useFindFromUrl } from '@/hooks/useFindFromUrl';
import { applyFindClubIdsFromUrl } from '@/utils/applyFindClubIdsFromUrl';
import {
  findSportFilterToApiParam,
  getViewerPrimarySport,
  resolveFindAdSportContext,
  resolveFindLevelFilterSport,
} from '@/utils/findSportFilter';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import { resolveActiveQuickShortcut } from '@/components/home/findQuickShortcuts';
import {
  computeFindMonthDateRange,
  findMonthRangeEquals,
  isFindGamesQueryReady,
  resolveFindMonthRangeAnchor,
  type FindMonthDateRange,
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
import { getAppUiLocaleForGameText } from '@/utils/gameText/appUiLocale';
import { joinOutcomeTone } from '@/features/spot-opened/joinOutcomeTone';

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
  // PRD 358 — Weekend keeps the calendar and lists Sat + Sun from the upcoming
  // river, so that query also runs in calendar view while it is active. Active
  // is read off the calendar (a weekend day selected), the pin only decides a
  // weekend day that is also today — same rule as the section's row.
  const weekendPinned = useShellNavStore((s) => s.activeFindQuickShortcut != null);
  const weekendShortcutActive =
    resolveActiveQuickShortcut(
      { view: findViewMode, selectedDay: findSelectedDay },
      weekendPinned,
      { now: new Date(), timezone: resolveViewerCityTimezone(user?.currentCity?.timezone) },
    ) === 'weekend';

  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  // Seeded from the same anchor + week start MonthCalendar derives its grid
  // from, so the month index and selected-day cards start fetching on the first
  // render instead of waiting for the calendar to mount and report its range.
  const [dateRange, setDateRange] = useState<FindMonthDateRange>(() =>
    computeFindMonthDateRange(
      resolveFindMonthRangeAnchor(findSelectedDay, new Date()),
      resolveDisplaySettings(user).weekStart,
    ),
  );
  const calendarRangeConfirmedRef = useRef(false);

  // Until the calendar confirms a range, keep the seed in step with a late
  // arriving viewer (week start) or a restored selected day.
  useEffect(() => {
    if (calendarRangeConfirmedRef.current) return;
    const seeded = computeFindMonthDateRange(
      resolveFindMonthRangeAnchor(findSelectedDay, new Date()),
      displaySettings.weekStart,
    );
    setDateRange((prev) => (findMonthRangeEquals(prev, seeded) ? prev : seeded));
  }, [displaySettings.weekStart, findSelectedDay]);

  const queryDateRange = dateRange;

  const { filters, updateFilters, isHydrated } = useGameFilters();
  const { clubIds: urlClubIds } = useFindFromUrl();

  // PRD 354 — `/find?clubIds=` from the club page's "See all on Find".
  // Applied after hydration so it wins over the restored filters, never before.
  useEffect(() => {
    if (!isHydrated) return;
    const update = applyFindClubIdsFromUrl(urlClubIds, filters);
    if (update) updateFilters(update);
  }, [filters, isHydrated, updateFilters, urlClubIds]);

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

  const queryEnabled = isFindGamesQueryReady({ isHydrated, userId: user?.id });
  const calendarQueryEnabled = queryEnabled && findViewMode === 'calendar';
  const listQueryEnabled = queryEnabled && (findViewMode === 'list' || weekendShortcutActive);

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
      locale: getAppUiLocaleForGameText(),
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
      locale: getAppUiLocaleForGameText(),
    });
    const upcomingHash = buildAvailableUpcomingFilterHash({
      ...upcomingQueryParams,
      locale: getAppUiLocaleForGameText(),
    });
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

  const weekendGames = useMemo((): Game[] | undefined => {
    if (!weekendShortcutActive || loadingUpcomingGames) return undefined;
    return sortGamesByStatusAndStartTime<Game>(upcomingGames);
  }, [weekendShortcutActive, loadingUpcomingGames, upcomingGames]);

  const loadingAvailableGames =
    findViewMode === 'list' || weekendShortcutActive
      ? loadingUpcomingGames
      : deriveFindCalendarGamesLoading({
          dayScopedEnabled,
          loadingCalendar: loadingCalendarGames,
          dayListReady: sortedSelectedDayGames != null,
        });

  const useDayScopedList = dayScopedEnabled;

  const pageMeta =
    findViewMode === 'list' || weekendShortcutActive
      ? upcomingMeta
      : useDayScopedList
        ? selectedDayMeta
        : calendarMeta;
  const onLoadMoreAvailable =
    findViewMode === 'list' || weekendShortcutActive
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
    calendarRangeConfirmedRef.current = true;
    // The seeded range normally already matches; keeping the previous object
    // avoids re-deriving the query params for an identical request.
    setDateRange((prev) =>
      findMonthRangeEquals(prev, { startDate, endDate }) ? prev : { startDate, endDate },
    );
  }, []);

  // `gameCardPropsEqual` compares `onJoin` by identity, so a handler that closes
  // over the game lists re-renders every card on the tab whenever data arrives.
  // The lists are read through a ref instead, keeping this callback stable.
  const joinLookupRef = useRef<{
    selectedDay?: Game[];
    upcoming: Game[];
    filtered: Game[];
    dayIndex?: typeof calendarMeta.dayIndex;
  }>({ upcoming: [], filtered: [] });
  joinLookupRef.current = {
    selectedDay: sortedSelectedDayGames,
    upcoming: upcomingGames,
    filtered: filteredAvailableGames,
    dayIndex: calendarMeta.dayIndex,
  };

  const handleJoinGame = useCallback(async function joinWithGates(gameId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void joinWithGates(gameId, e));
      return;
    }
    const lookup = joinLookupRef.current;
    const joinGame =
      lookup.selectedDay?.find((g) => g.id === gameId)
      ?? lookup.upcoming.find((g) => g.id === gameId)
      ?? lookup.filtered.find((g) => g.id === gameId)
      ?? lookup.dayIndex?.find((g) => g.id === gameId);
    if (!runWithGenderForEvent(joinGame, () => void joinWithGates(gameId, e))) return;
    try {
      const { gamesApi } = await import('@/api');
      const response = await runWithOverlapConfirm((confirmOverlap) => gamesApi.join(gameId, confirmOverlap));
      if (!response) return;
      const message = (response as { message?: string }).message || 'Successfully joined the game';

      // 200 does not mean "seated": losing the spot-opened race answers with a
      // refusal key on the success path (`joinOutcomeTone`).
      const text =
        message === 'games.addedToJoinQueue'
          ? t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' })
          : t(message, { defaultValue: message });
      if (joinOutcomeTone(message) === 'error') toast.error(text);
      else toast.success(text);
      refetchAvailableGames();
      navigate(`/games/${gameId}`);
    } catch (error: any) {
      if (recoverGenderUnsetJoin(error, () => void joinWithGates(gameId, e))) return;
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  }, [refetchAvailableGames, navigate, t]);

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

  // Blanking `dayIndex` during a keepPreviousData refetch made every badge and
  // type pill on the month grid disappear and pop back on each filter toggle or
  // month step. Hold the last settled index until the new one lands.
  const settledDayIndexRef = useRef<typeof calendarMeta.dayIndex>(undefined);
  if (!calendarIsPlaceholder) {
    settledDayIndexRef.current = calendarMeta.dayIndex;
  }
  const displayedDayIndex = calendarIsPlaceholder
    ? settledDayIndexRef.current
    : calendarMeta.dayIndex;

  const dayLoadError = Boolean(dayScopedEnabled && selectedDayIsError && selectedDayPage == null);

  const sectionProps = useMemo(
    () => ({
      availableGames: filteredAvailableGames,
      selectedDayGames: sortedSelectedDayGames,
      dayIndex: displayedDayIndex,
      user,
      loading: loadingAvailableGames,
      onJoin: handleJoinGame,
      onMonthChange: undefined as undefined,
      onDateRangeChange: handleDateRangeChange,
      filters,
      onFiltersChange: updateFilters,
      onNoteSaved: refetchAvailableGames,
      hasMoreAvailable: pageMeta.hasMore,
      onLoadMoreAvailable,
      availableBound: pageMeta.bound,
      dayLoadError,
      onRetryDay: refetchSelectedDayGames,
      weekendGames,
    }),
    [
      filteredAvailableGames, sortedSelectedDayGames, displayedDayIndex, user,
      loadingAvailableGames, handleJoinGame, handleDateRangeChange, filters, updateFilters,
      refetchAvailableGames, pageMeta.hasMore, onLoadMoreAvailable, pageMeta.bound,
      dayLoadError, refetchSelectedDayGames, weekendGames,
    ],
  );

  if (splitView) {
    return (
      <>
        <PlayIntentHomeStrip cityId={user?.currentCity?.id} sport={findLevelSport} showLookingCount>
          <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0 px-4" />
          <AvailableGamesSection {...sectionProps} splitView={true} />
        </PlayIntentHomeStrip>
      </>
    );
  }

  return (
    <PullToRefreshShell onRefresh={handleRefresh}>
      {({ isRefreshing }) => (
        <>
          <PlayIntentHomeStrip cityId={user?.currentCity?.id} sport={findLevelSport} showLookingCount>
            <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0" />
            <AvailableGamesSection {...sectionProps} />
          </PlayIntentHomeStrip>
          <MainTabFooter isLoading={loadingAvailableGames || isRefreshing} />
        </>
      )}
    </PullToRefreshShell>
  );
};
