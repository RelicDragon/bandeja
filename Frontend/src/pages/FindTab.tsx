import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AvailableGamesSection } from '@/components/home';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { useAuthStore } from '@/store/authStore';
import { useAvailableGames } from '@/hooks/useAvailableGames';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';

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
  const user = useAuthStore((state) => state.user);
  
  const { i18n } = useI18nTranslation();
  const localeMap = { en: enUS, ru: ru, es: es, sr: sr };
  const locale = localeMap[i18n.language as keyof typeof localeMap] || enUS;

  const [dateRange, setDateRange] = useState<{ startDate?: Date; endDate?: Date }>(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const start = startOfWeek(monthStart, { locale });
    const end = endOfWeek(monthEnd, { locale });
    return { startDate: start, endDate: end };
  });

  const {
    availableGames,
    loading: loadingAvailableGames,
    fetchData: fetchAvailableGames,
  } = useAvailableGames(user, dateRange.startDate, dateRange.endDate);

  const handleMonthChange = () => {
  };

  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    setDateRange({ startDate, endDate });
  };

  const filteredAvailableGames = useMemo(() => sortGamesByStatusAndDateTime(availableGames), [availableGames]);

  const handleJoinGame = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await fetchAvailableGames(true);
  }, [fetchAvailableGames]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loadingAvailableGames,
  });

  return (
    <>
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        <AvailableGamesSection
          availableGames={filteredAvailableGames}
          user={user}
          loading={loadingAvailableGames}
          onJoin={handleJoinGame}
          onMonthChange={handleMonthChange}
          onDateRangeChange={handleDateRangeChange}
        />
      </div>
    </>
  );
};
