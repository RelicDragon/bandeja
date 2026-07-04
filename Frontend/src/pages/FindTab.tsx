import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
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
import { findSportFilterToApiParam, getViewerPrimarySport } from '@/utils/findSportFilter';
import type { Sport } from '@/types';
import { startOfDay, format } from 'date-fns';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  computeFindMonthDateRange,
  isFindGamesQueryReady,
  resolveFindMonthRangeAnchor,
} from '@/utils/findMonthDateRange';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { FindHeaderActions } from '@/components/headerContent/FindHeaderActions';

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
  const user = useAuthStore((state) => state.user);
  const isDesktop = useDesktop();
  const findViewMode = useShellNavStore((s) => s.findViewMode);
  const findSelectedDay = useShellNavStore((s) => s.findSelectedDay);
  const setFindSelectedDay = useShellNavStore((s) => s.setFindSelectedDay);
  const setFindHeaderActions = useShellNavStore((s) => s.setFindHeaderActions);

  useEffect(() => {
    if (findSelectedDay == null) {
      setFindSelectedDay(format(startOfDay(new Date()), 'yyyy-MM-dd'));
    }
  }, [findSelectedDay, setFindSelectedDay]);

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
  const findSportApiParam = useMemo(
    () => findSportFilterToApiParam(filters.filterSport, getViewerPrimarySport(user)),
    [filters.filterSport, user],
  );
  useRegisterAdSportContext(AD_PLACEMENTS.FIND_TOP, findSportApiParam as Sport | undefined);
  const queryEnabled = isFindGamesQueryReady({
    isHydrated,
    calendarRangeReady: findViewMode === 'calendar' ? calendarRangeReady : true,
    userId: user?.id,
  });
  const calendarQueryEnabled = queryEnabled && findViewMode === 'calendar';
  const listQueryEnabled = queryEnabled && findViewMode === 'list';
  const {
    availableGames: calendarGames,
    loading: loadingCalendarGames,
    refetch: refetchCalendarGames,
  } = useAvailableGames(
    user,
    queryDateRange.startDate,
    queryDateRange.endDate,
    true,
    findSportApiParam,
    filters.showPrivateGames,
    calendarQueryEnabled,
  );
  const {
    availableGames: upcomingGames,
    loading: loadingUpcomingGames,
    refetch: refetchUpcomingGames,
  } = useAvailableUpcomingGames(
    user,
    true,
    findSportApiParam,
    filters.showPrivateGames,
    listQueryEnabled,
  );

  const loadingAvailableGames = findViewMode === 'list' ? loadingUpcomingGames : loadingCalendarGames;
  const filteredAvailableGames = useMemo(() => {
    const source = findViewMode === 'list' ? upcomingGames : calendarGames;
    return findViewMode === 'list' ? source : sortGamesByStatusAndDateTime(source);
  }, [findViewMode, upcomingGames, calendarGames]);

  const refetchAvailableGames = useCallback(async () => {
    await Promise.all([refetchCalendarGames(), refetchUpcomingGames()]);
  }, [refetchCalendarGames, refetchUpcomingGames]);

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

  if (splitView) {
    return (
      <>
        <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0 px-4" />
        <AvailableGamesSection
        availableGames={filteredAvailableGames}
        user={user}
        loading={loadingAvailableGames}
        onJoin={handleJoinGame}
        onMonthChange={undefined}
        onDateRangeChange={handleDateRangeChange}
        filters={filters}
        onFilterChange={(key, value) => updateFilter(key, value)}
        onFiltersChange={(updates) => updateFilters(updates)}
        onNoteSaved={() => refetchAvailableGames()}
        splitView={true}
      />
      </>
    );
  }

  return (
    <PullToRefreshShell onRefresh={handleRefresh} disabled={loadingAvailableGames}>
      {({ isRefreshing }) => (
        <>
          <AdSlot placement={AD_PLACEMENTS.FIND_TOP} className="mb-4 w-full min-w-0" />
          <AvailableGamesSection
            availableGames={filteredAvailableGames}
            user={user}
            loading={loadingAvailableGames}
            onJoin={handleJoinGame}
            onMonthChange={undefined}
            onDateRangeChange={handleDateRangeChange}
            filters={filters}
            onFilterChange={(key, value) => updateFilter(key, value)}
            onFiltersChange={(updates) => updateFilters(updates)}
            onNoteSaved={() => refetchAvailableGames()}
          />
          <MainTabFooter isLoading={loadingAvailableGames || isRefreshing} />
        </>
      )}
    </PullToRefreshShell>
  );
};
