import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { addMonths, startOfDay, format, parse } from 'date-fns';
import { AvailableGamesSection } from '@/components/home';
import { AdSlot } from '@/components/sponsorSlots';
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
import { findSportFilterToApiParam, getViewerPrimarySport, resolveFindAdSportContext } from '@/utils/findSportFilter';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  computeFindMonthDateRange,
  isFindGamesQueryReady,
  resolveFindMonthRangeAnchor,
} from '@/utils/findMonthDateRange';
import { buildFindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { FindHeaderActions } from '@/components/headerContent/FindHeaderActions';
import { availableGamesQueryOptions } from '@/queries/games/useAvailableGamesQuery';
import { availableUpcomingGamesQueryOptions } from '@/queries/games/useAvailableUpcomingGamesQuery';

const sortGamesByStatusAndDateTime = <T extends { status?: string; startTime: string }>(list: T[] = []): T[] => {
  const getStatusPriority = (status?: string): number => {
    if (status === 'ANNOUNCED' || status === 'STARTED') return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  return [...list].sort((a, b) => {
    const statusPriorityA = getStatusPriority(a.status);
    const statusPriorityB = getStatusPriority(b.status);

    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }

    const dateTimeA = new Date(a.startTime).getTime();
    const dateTimeB = new Date(b.startTime).getTime();

    if (statusPriorityA === 0) {
      return dateTimeA - dateTimeB;
    }

    return dateTimeB - dateTimeA;
  });
};

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
    loading: loadingCalendarGames,
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
  );

  const selectedDayDate = useMemo(() => {
    if (!findSelectedDay) return undefined;
    const d = startOfDay(parse(findSelectedDay, 'yyyy-MM-dd', new Date()));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [findSelectedDay]);

  const dayScopedEnabled =
    calendarQueryEnabled && !!selectedDayDate && findViewMode === 'calendar';
  const {
    availableGames: selectedDayGames,
    meta: selectedDayMeta,
    loading: loadingSelectedDayGames,
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
    true, // rejectPlaceholderData — fall back to month day list while day key resolves
  );

  const {
    availableGames: upcomingGames,
    meta: upcomingMeta,
    loading: loadingUpcomingGames,
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

  // #287 Prefetch inactive view + adjacent months once Find is ready (no thrash).
  const prefetchKeyRef = useRef<string>('');
  useEffect(() => {
    if (!queryEnabled || !user?.id) return;
    const key = `${findViewMode}:${calendarQueryParams.startDate?.toISOString() ?? ''}:${upcomingQueryParams.structural ? JSON.stringify(upcomingQueryParams.structural) : ''}:${findSportApiParam ?? ''}`;
    if (prefetchKeyRef.current === key) return;
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
            },
            true,
          ),
        );
      }
    }
  }, [
    queryEnabled,
    user?.id,
    findViewMode,
    queryClient,
    calendarQueryParams,
    upcomingQueryParams,
    findSportApiParam,
    queryDateRange.startDate,
    findSelectedDay,
    displaySettings.weekStart,
  ]);

  const loadingAvailableGames =
    findViewMode === 'list'
      ? loadingUpcomingGames
      : loadingCalendarGames || (dayScopedEnabled && loadingSelectedDayGames && selectedDayGames.length === 0);

  const filteredAvailableGames = useMemo(() => {
    if (findViewMode === 'list') return upcomingGames;
    return sortGamesByStatusAndDateTime(calendarGames);
  }, [findViewMode, upcomingGames, calendarGames]);

  const pageMeta =
    findViewMode === 'list'
      ? upcomingMeta
      : dayScopedEnabled
        ? selectedDayMeta
        : calendarMeta;
  const onLoadMoreAvailable =
    findViewMode === 'list'
      ? loadMoreUpcomingGames
      : dayScopedEnabled
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
    try {
      const { gamesApi } = await import('@/api');
      const response = await gamesApi.join(gameId);
      const message = (response as any).message || 'Successfully joined the game';

      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      refetchAvailableGames();
      navigate(`/games/${gameId}`);
    } catch (error: any) {
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
    // While day-scoped fetch is in flight (empty), omit so UI falls back to month day slice.
    selectedDayGames:
      dayScopedEnabled && !(loadingSelectedDayGames && selectedDayGames.length === 0)
        ? selectedDayGames
        : undefined,
    dayIndex: calendarMeta.dayIndex,
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
  };

  if (splitView) {
    return (
      <>
        <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0 px-4" />
        <AvailableGamesSection {...sectionProps} splitView={true} />
      </>
    );
  }

  return (
    <PullToRefreshShell onRefresh={handleRefresh} disabled={loadingAvailableGames}>
      {({ isRefreshing }) => (
        <>
          <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0" />
          <AvailableGamesSection {...sectionProps} />
          <MainTabFooter isLoading={loadingAvailableGames || isRefreshing} />
        </>
      )}
    </PullToRefreshShell>
  );
};
