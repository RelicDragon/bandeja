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
import { useNavigationStore } from '@/store/navigationStore';
import { useDesktop } from '@/hooks/useDesktop';
import { useAvailableGames } from '@/hooks/useAvailableGames';
import { useGameFilters } from '@/hooks/useGameFilters';
import { findSportFilterToApiParam, getViewerPrimarySport } from '@/utils/findSportFilter';
import type { Sport } from '@/types';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { enGB, ru, es, sr, cs } from 'date-fns/locale';
import { useTranslation as useI18nTranslation } from 'react-i18next';
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
  const findViewMode = useNavigationStore((s) => s.findViewMode);
  const setFindHeaderActions = useNavigationStore((s) => s.setFindHeaderActions);

  const { i18n } = useI18nTranslation();
  const localeMap = { en: enGB, ru: ru, es: es, sr: sr, cs: cs };
  const locale = localeMap[i18n.language as keyof typeof localeMap] || enGB;

  const [dateRange, setDateRange] = useState<{ startDate?: Date; endDate?: Date }>(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const start = startOfWeek(monthStart, { locale });
    const end = endOfWeek(monthEnd, { locale });
    return { startDate: start, endDate: end };
  });

  const { filters, updateFilter, updateFilters } = useGameFilters();
  const findSportApiParam = useMemo(
    () => findSportFilterToApiParam(filters.filterSport, getViewerPrimarySport(user)),
    [filters.filterSport, user],
  );
  useRegisterAdSportContext(AD_PLACEMENTS.FIND_TOP, findSportApiParam as Sport | undefined);
  const {
    availableGames,
    loading: loadingAvailableGames,
    fetchData: fetchAvailableGames,
  } = useAvailableGames(
    user,
    dateRange.startDate,
    dateRange.endDate,
    true,
    findSportApiParam,
    filters.showPrivateGames,
  );

  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    setDateRange({ startDate, endDate });
  };

  const filteredAvailableGames = useMemo(() => sortGamesByStatusAndDateTime(availableGames), [availableGames]);

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
      fetchAvailableGames(true);
      navigate(`/games/${gameId}`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await fetchAvailableGames(true);
  }, [fetchAvailableGames]);

  const splitView = isDesktop && findViewMode === 'calendar';

  useEffect(() => {
    setFindHeaderActions(
      <FindHeaderActions
        user={user}
        filters={filters}
        onFiltersChange={updateFilters}
      />,
    );
    return () => setFindHeaderActions(null);
  }, [filters, setFindHeaderActions, updateFilters, user]);

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
        onNoteSaved={() => fetchAvailableGames(true)}
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
            onNoteSaved={() => fetchAvailableGames(true)}
          />
          <MainTabFooter isLoading={loadingAvailableGames || isRefreshing} />
        </>
      )}
    </PullToRefreshShell>
  );
};
