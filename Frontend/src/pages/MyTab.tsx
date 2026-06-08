import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { format, parse, startOfDay } from 'date-fns';
import {
  InvitesSection,
  MyGamesSection,
  PastGamesSection,
  CityPromptBanner,
  UserTeamsHomeSection,
  YourLeaguesHomeSection,
} from '@/components/home';
import { SportQuestionnairePrompt } from '@/components/sportQuestionnaire';
import { StoriesRail } from '@/components/stories/StoriesRail';
import { AdSlot } from '@/components/sponsorSlots';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { useRegisterAdSportContext } from '@/hooks/useAdPlacements';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { isHomeHeroAdBlocked } from '@/utils/adHomeHeroVisibility';
import { getUserPrimarySport } from '@/utils/profileSports';
import { Button, MainTabFooter, MonthCalendar } from '@/components';
import { gamesApi } from '@/api';
import { useTotalUnreadForMarkAllBanner, useGameUnreadCountsForIds } from '@/hooks/useUnreadBridge';
import { useUnreadStore } from '@/store/unreadStore';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useMyGames } from '@/hooks/useMyGames';
import { usePastGames } from '@/hooks/usePastGames';
import { PullToRefreshShell } from '@/components/PullToRefreshShell';
import { useDesktop } from '@/hooks/useDesktop';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { navigationService } from '@/services/navigationService';
import { useUserTeamsStore } from '@/store/userTeamsStore';
const sortGamesByStatusAndDateTime = <T extends { status?: string; startTime: string; parentId?: string; id: string }>(
  list: T[] = [],
  unreadCounts?: Record<string, number>
): T[] => {
  const getStatusPriority = (status?: string): number => {
    if (status === 'ANNOUNCED' || status === 'STARTED') return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  const isPrimaryGame = (game: T): boolean => !game.parentId;
  const hasUnreadChats = (game: T): boolean => (unreadCounts?.[game.id] || 0) > 0;

  return [...list].sort((a, b) => {
    const aIsPrimaryWithUnread = isPrimaryGame(a) && hasUnreadChats(a);
    const bIsPrimaryWithUnread = isPrimaryGame(b) && hasUnreadChats(b);

    if (aIsPrimaryWithUnread && !bIsPrimaryWithUnread) return -1;
    if (!aIsPrimaryWithUnread && bIsPrimaryWithUnread) return 1;

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

const sortMyGamesByStatusAndDateTime = <T extends { status?: string; startTime: string; parentId?: string; id: string; entityType?: string }>(
  list: T[] = [],
  unreadCounts?: Record<string, number>
): T[] => {
  const getStatusPriority = (status?: string): number => {
    if (status === 'ANNOUNCED' || status === 'STARTED') return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  const isPrimaryGame = (game: T): boolean => !game.parentId;
  const hasUnreadChats = (game: T): boolean => (unreadCounts?.[game.id] || 0) > 0;

  return [...list].sort((a, b) => {
    const aIsPrimaryWithUnread = isPrimaryGame(a) && hasUnreadChats(a);
    const bIsPrimaryWithUnread = isPrimaryGame(b) && hasUnreadChats(b);

    if (aIsPrimaryWithUnread && !bIsPrimaryWithUnread) return -1;
    if (!aIsPrimaryWithUnread && bIsPrimaryWithUnread) return 1;

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

export const MyTab = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isDesktop = useDesktop();
  const markAllBannerUnread = useTotalUnreadForMarkAllBanner();
  const activeTab = useShellNavStore((s) => s.activeTab);
  const myGamesSelectedDay = useShellNavStore((s) => s.myGamesSelectedDay);
  const setMyGamesSelectedDay = useShellNavStore((s) => s.setMyGamesSelectedDay);
  const myGamesCalendarDateAfterCreate = useShellNavStore((s) => s.myGamesCalendarDateAfterCreate);
  const setMyGamesCalendarDateAfterCreate = useShellNavStore((s) => s.setMyGamesCalendarDateAfterCreate);
  const setCreateGameInitialDate = useHeaderStore((s) => s.setCreateGameInitialDate);
  const primarySport = getUserPrimarySport(user);
  const { status: questionnaireStatus } = useQuestionnaireStatus(primarySport);
  useRegisterAdSportContext(AD_PLACEMENTS.HOME_HERO, primarySport);
  const hideHomeHeroAd = isHomeHeroAdBlocked(user, primarySport, questionnaireStatus);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const [loading, setLoading] = useState(true);

  const skeletonAnimation = useSkeletonAnimation();
  
  const {
    games,
    invites,
    setInvites,
    fetchData,
  } = useMyGames(user, (loadingState) => setLoading(loadingState), {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    loadPastGames,
    refetchGame,
  } = usePastGames(user, activeTab === 'past-games');

  const [pastGamesInRange, setPastGamesInRange] = useState<any[]>([]);

  const gameIdsForUnread = useMemo(() => {
    const ids = new Set<string>();
    for (const g of games) ids.add(g.id);
    for (const g of pastGames) ids.add(g.id);
    for (const g of pastGamesInRange) ids.add(g.id);
    return [...ids];
  }, [games, pastGames, pastGamesInRange]);

  const gameUnreadForSort = useGameUnreadCountsForIds(gameIdsForUnread);

  const mergedUnreadCounts = gameUnreadForSort;

  const filteredMyGames = useMemo(() => sortMyGamesByStatusAndDateTime(games, mergedUnreadCounts), [games, mergedUnreadCounts]);
  const hasUpcomingGames = useMemo(
    () => filteredMyGames.some((g) => g.status === 'ANNOUNCED' || g.status === 'STARTED'),
    [filteredMyGames]
  );
  const myGamesSelectedDate = useMemo((): Date | null => {
    if (!myGamesSelectedDay) return null;
    const d = parse(myGamesSelectedDay, 'yyyy-MM-dd', new Date());
    return isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
  }, [myGamesSelectedDay]);
  const setMyGamesSelectedDate = useCallback(
    (d: Date) => setMyGamesSelectedDay(format(startOfDay(d), 'yyyy-MM-dd')),
    [setMyGamesSelectedDay]
  );
  useEffect(() => {
    if (myGamesCalendarDateAfterCreate) {
      const localDate = parse(myGamesCalendarDateAfterCreate, 'yyyy-MM-dd', new Date());
      setMyGamesSelectedDay(format(startOfDay(localDate), 'yyyy-MM-dd'));
      setMyGamesCalendarDateAfterCreate(null);
    }
  }, [myGamesCalendarDateAfterCreate, setMyGamesCalendarDateAfterCreate, setMyGamesSelectedDay]);
  useEffect(() => {
    if (activeTab === 'calendar') {
      setCreateGameInitialDate(myGamesSelectedDate);
    } else {
      setCreateGameInitialDate(null);
    }
  }, [activeTab, myGamesSelectedDate, setCreateGameInitialDate]);
  const [loadingPastInRange, setLoadingPastInRange] = useState(false);
  const calendarMergedGames = useMemo(() => {
    const noSeason = (g: (typeof filteredMyGames)[0]) => g.entityType !== 'LEAGUE_SEASON';
    const ids = new Set(filteredMyGames.filter(noSeason).map((g) => g.id));
    const fromPast = pastGamesInRange.filter((g) => !ids.has(g.id) && g.entityType !== 'LEAGUE_SEASON');
    return [...filteredMyGames.filter(noSeason), ...fromPast];
  }, [filteredMyGames, pastGamesInRange]);
  const calendarMergedUnreadCounts = gameUnreadForSort;
  const myGamesForSelectedDate = useMemo(() => {
    if (!myGamesSelectedDate) return [];
    const selectedStr = format(startOfDay(myGamesSelectedDate), 'yyyy-MM-dd');
    const source = activeTab === 'calendar' ? calendarMergedGames : filteredMyGames;
    const counts = activeTab === 'calendar' ? calendarMergedUnreadCounts : mergedUnreadCounts;
    return sortMyGamesByStatusAndDateTime(
      source.filter((g) => {
        if (g.timeIsSet === false) return false;
        const gameStr = format(startOfDay(new Date(g.startTime)), 'yyyy-MM-dd');
        return gameStr === selectedStr;
      }),
      counts
    );
  }, [
    activeTab,
    myGamesSelectedDate,
    calendarMergedGames,
    filteredMyGames,
    calendarMergedUnreadCounts,
    mergedUnreadCounts,
  ]);

  const upcomingGamesForCalendar = useMemo(() => {
    if (activeTab !== 'calendar') return [];
    const base = filteredMyGames
      .filter((g) => g.entityType !== 'LEAGUE_SEASON')
      .filter((g) => {
        if (g.timeIsSet === false) return false;
        if (g.status !== 'ANNOUNCED' && g.status !== 'STARTED') return false;
        return true;
      });
    if (!myGamesSelectedDate) {
      return base.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    const selectedStr = format(startOfDay(myGamesSelectedDate), 'yyyy-MM-dd');
    return base
      .filter((g) => {
        const gameStr = format(startOfDay(new Date(g.startTime)), 'yyyy-MM-dd');
        return gameStr !== selectedStr;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [activeTab, myGamesSelectedDate, filteredMyGames]);
  const handleCalendarDateRangeChange = useCallback(
    async (start: Date, end: Date) => {
      const today = startOfDay(new Date());
      const rangeStart = startOfDay(start);
      if (rangeStart >= today) {
        setPastGamesInRange([]);
        return;
      }
      setLoadingPastInRange(true);
      try {
        const response = await gamesApi.getPastGames({
          startDate: format(rangeStart, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd'),
          limit: 100,
          offset: 0,
        });
        const list = (response.data ?? []).filter(
          (g: { entityType?: string; resultsStatus?: string }) =>
            !(g.entityType === 'LEAGUE_SEASON' && g.resultsStatus !== 'FINAL')
        );
        setPastGamesInRange(list);
      } catch {
        setPastGamesInRange([]);
      } finally {
        setLoadingPastInRange(false);
      }
    },
    []
  );
  const filteredPastGames = useMemo(() => {
    const list = pastGames.filter((g) => g.entityType !== 'LEAGUE_SEASON');
    return sortGamesByStatusAndDateTime(list, gameUnreadForSort);
  }, [pastGames, gameUnreadForSort]);

  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);

  const handleMarkAllAsRead = async () => {
    if (!user?.id || isMarkingAllAsRead || markAllBannerUnread === 0) return;

    setIsMarkingAllAsRead(true);
    try {
      await useUnreadStore.getState().markAllRead();
      await fetchData(false, true);
      toast.success(t('chat.allMarkedAsRead', { defaultValue: 'All messages marked as read' }));
    } catch (error) {
      console.error('Failed to mark all messages as read:', error);
      toast.error(t('errors.generic', { defaultValue: 'Failed to mark all messages as read' }));
    } finally {
      setIsMarkingAllAsRead(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleAcceptInvite(inviteId));
      return;
    }
    try {
      const { invitesApi } = await import('@/api');
      const response = await invitesApi.accept(inviteId);
      const message = (response as any).message || 'Invite accepted successfully';
      
      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
      Promise.resolve().then(() => {
        fetchData(false, true);
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleDeclineInvite(inviteId));
      return;
    }
    try {
      const { invitesApi } = await import('@/api');
      await invitesApi.decline(inviteId);
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await Promise.all([
      fetchData(false, true),
      loadPastGames?.(),
      useUserTeamsStore.getState().refreshAll(),
    ]);
  }, [fetchData, loadPastGames]);

  const scrollBottomPadding = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const calendarContentPanel = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
        {user && <StoriesRail />}
        {!hideHomeHeroAd && user && <AdSlot placement={AD_PLACEMENTS.HOME_HERO} />}
        {user && <SportQuestionnairePrompt sport={getUserPrimarySport(user)} />}
        <CityPromptBanner />
        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${!loading ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <InvitesSection
            invites={invites}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
            onNoteSaved={() => fetchData(false, true)}
          />
        </div>
        <UserTeamsHomeSection className="mb-3" />
        <YourLeaguesHomeSection games={games} gamesUnreadCounts={calendarMergedUnreadCounts} className="mb-3" />
        <MyGamesSection
          games={myGamesForSelectedDate}
          user={user}
          loading={loading || loadingPastInRange}
          showSkeleton={skeletonAnimation.showSkeleton}
          skeletonStates={skeletonAnimation.skeletonStates}
          gamesUnreadCounts={calendarMergedUnreadCounts}
          onNoteSaved={() => fetchData(false, true)}
          upcomingGames={upcomingGamesForCalendar}
          onSwitchToSearch={!hasUpcomingGames ? () => navigationService.navigateToFind() : undefined}
        />
        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${markAllBannerUnread > 0 ? 'max-h-[100px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
          <div className="flex items-center justify-center pt-4">
            <Button
              onClick={handleMarkAllAsRead}
              variant="primary"
              size="sm"
              disabled={isMarkingAllAsRead || markAllBannerUnread === 0}
              className="animate-in slide-in-from-top-4 fade-in"
            >
              {isMarkingAllAsRead ? t('common.loading', { defaultValue: 'Loading...' }) : t('chat.markAllAsRead', { defaultValue: 'Mark all as read' })}
            </Button>
          </div>
        </div>
        <MainTabFooter isLoading={loading || loadingPastGames} />
      </div>
    </div>
  );
  if (isDesktop && activeTab === 'calendar') {
    return (
      <div className="fixed inset-x-0 bottom-0 overflow-hidden z-0" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        {hasUpcomingGames ? (
          <ResizableSplitter
            defaultLeftWidth={35}
            minLeftWidth={280}
            maxLeftWidth={450}
            leftPanel={
              <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                  <MonthCalendar
                    selectedDate={myGamesSelectedDate}
                    onDateSelect={setMyGamesSelectedDate}
                    availableGames={calendarMergedGames}
                    onDateRangeChange={handleCalendarDateRangeChange}
                  />
                </div>
              </div>
            }
            rightPanel={calendarContentPanel}
          />
        ) : (
          calendarContentPanel
        )}
      </div>
    );
  }

  return (
    <PullToRefreshShell onRefresh={handleRefresh} disabled={loading || loadingPastGames}>
      {({ isRefreshing }) => (
        <>
        {user && <StoriesRail />}
        {!hideHomeHeroAd && user && <AdSlot placement={AD_PLACEMENTS.HOME_HERO} />}
        {user && <SportQuestionnairePrompt sport={getUserPrimarySport(user)} />}
        <CityPromptBanner />
        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${
            !loading
              ? 'max-h-[2000px] opacity-100 translate-y-0'
              : 'max-h-0 opacity-0 -translate-y-4'
          }`}
        >
          <InvitesSection
            invites={invites}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
            onNoteSaved={() => fetchData(false, true)}
          />
        </div>

        {(activeTab === 'calendar' || activeTab === 'list') && <UserTeamsHomeSection className="mb-3" />}
        {(activeTab === 'calendar' || activeTab === 'list') && (
          <YourLeaguesHomeSection
            games={games}
            gamesUnreadCounts={activeTab === 'calendar' ? calendarMergedUnreadCounts : mergedUnreadCounts}
            className="mb-3"
          />
        )}

        <div className="min-h-[100px]">
          {activeTab === 'calendar' && (
            <>
              {hasUpcomingGames && (
                <MonthCalendar
                  selectedDate={myGamesSelectedDate}
                  onDateSelect={setMyGamesSelectedDate}
                  availableGames={calendarMergedGames}
                  onDateRangeChange={handleCalendarDateRangeChange}
                />
              )}
              <MyGamesSection
                games={myGamesForSelectedDate}
                user={user}
                loading={loading || loadingPastInRange}
                showSkeleton={skeletonAnimation.showSkeleton}
                skeletonStates={skeletonAnimation.skeletonStates}
                gamesUnreadCounts={calendarMergedUnreadCounts}
                onNoteSaved={() => fetchData(false, true)}
                upcomingGames={upcomingGamesForCalendar}
                onSwitchToSearch={!hasUpcomingGames ? () => navigationService.navigateToFind() : undefined}
              />
            </>
          )}

          {activeTab === 'list' && (
            <MyGamesSection
              games={filteredMyGames}
              user={user}
              loading={loading}
              showSkeleton={skeletonAnimation.showSkeleton}
              skeletonStates={skeletonAnimation.skeletonStates}
              gamesUnreadCounts={mergedUnreadCounts}
              onNoteSaved={() => fetchData(false, true)}
              onSwitchToSearch={!hasUpcomingGames ? () => navigationService.navigateToFind() : undefined}
            />
          )}

          {activeTab === 'past-games' && (
            <PastGamesSection
              pastGames={filteredPastGames}
              loadingPastGames={loadingPastGames}
              hasMorePastGames={hasMorePastGames}
              user={user}
              pastGamesUnreadCounts={gameUnreadForSort}
              onLoadMore={loadPastGames}
              onNoteSaved={(gameId) => refetchGame(gameId)}
            />
          )}
        </div>

        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${
            markAllBannerUnread > 0
              ? 'max-h-[100px] opacity-100 translate-y-0 mb-4'
              : 'max-h-0 opacity-0 -translate-y-4'
          }`}
        >
          <div className="flex items-center justify-center pt-4">
            <Button
              onClick={handleMarkAllAsRead}
              variant="primary"
              size="sm"
              disabled={isMarkingAllAsRead || markAllBannerUnread === 0}
              className="animate-in slide-in-from-top-4 fade-in"
            >
              {isMarkingAllAsRead ? t('common.loading', { defaultValue: 'Loading...' }) : t('chat.markAllAsRead', { defaultValue: 'Mark all as read' })}
            </Button>
          </div>
        </div>
        <MainTabFooter isLoading={loading || loadingPastGames || isRefreshing} />
        </>
      )}
    </PullToRefreshShell>
  );
};
