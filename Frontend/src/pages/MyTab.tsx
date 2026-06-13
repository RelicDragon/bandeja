import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { format, parse, startOfDay } from 'date-fns';
import { filterGamesForCalendarDay } from '@/utils/calendarSelectedDayFilter';
import {
  InvitesSection,
  MyGamesSection,
  AdvancedTabMovedHint,
  CityPromptBanner,
  UserTeamsHomeSection,
  YourLeaguesHomeSection,
} from '@/components/home';
import { MyTabBookingsSection } from '@/components/booktime/MyTabBookingsSection';
import { SportQuestionnairePrompt } from '@/components/sportQuestionnaire';
import { StoriesRail } from '@/components/stories/StoriesRail';
import { AdSlot } from '@/components/sponsorSlots';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { useRegisterAdSportContext } from '@/hooks/useAdPlacements';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { isHomeHeroAdBlocked } from '@/utils/adHomeHeroVisibility';
import { getUserPrimarySport } from '@/utils/profileSports';
import { Button, MainTabFooter, MonthCalendar, SelectedDateHeading } from '@/components';
import { gamesApi } from '@/api';
import { useTotalUnreadForMarkAllBanner, useGameUnreadCountsForIds } from '@/hooks/useUnreadBridge';
import { useUnreadStore } from '@/store/unreadStore';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useMyGames } from '@/hooks/useMyGames';
import { useHomeFromUrl } from '@/hooks/useHomeFromUrl';
import { PullToRefreshShell } from '@/components/PullToRefreshShell';
import { useDesktop } from '@/hooks/useDesktop';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { useDeclineInvite } from '@/hooks/useDeclineInvite';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { navigationService } from '@/services/navigationService';
import { useUserTeamsStore } from '@/store/userTeamsStore';

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
  const { tab: homeTab } = useHomeFromUrl();
  const isCalendarTab = homeTab === 'calendar';
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
  }, [homeTab]);

  const [loading, setLoading] = useState(true);

  const skeletonAnimation = useSkeletonAnimation();

  const {
    games,
    invites,
    setInvites,
    refetch: refetchMyGames,
  } = useMyGames(user, setLoading, {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const [pastGamesInRange, setPastGamesInRange] = useState<any[]>([]);

  const gameIdsForUnread = useMemo(() => {
    const ids = new Set<string>();
    for (const g of games) ids.add(g.id);
    for (const g of pastGamesInRange) ids.add(g.id);
    return [...ids];
  }, [games, pastGamesInRange]);

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
    if (isCalendarTab) {
      setCreateGameInitialDate(myGamesSelectedDate);
    } else {
      setCreateGameInitialDate(null);
    }
  }, [isCalendarTab, myGamesSelectedDate, setCreateGameInitialDate]);
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
    return sortMyGamesByStatusAndDateTime(
      filterGamesForCalendarDay(calendarMergedGames, myGamesSelectedDate),
      calendarMergedUnreadCounts,
    );
  }, [myGamesSelectedDate, calendarMergedGames, calendarMergedUnreadCounts]);

  const upcomingGamesForCalendar = useMemo(() => {
    const base = calendarMergedGames.filter((g) => {
      if (g.timeIsSet === false) return false;
      const status = g.status;
      return status === 'ANNOUNCED' || status === 'STARTED' || status === 'FINISHED';
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
  }, [myGamesSelectedDate, calendarMergedGames]);
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

  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
  const [decliningInviteIds, setDecliningInviteIds] = useState<Set<string>>(new Set());

  const handleMarkAllAsRead = async () => {
    if (!user?.id || isMarkingAllAsRead || markAllBannerUnread === 0) return;

    setIsMarkingAllAsRead(true);
    try {
      await useUnreadStore.getState().markAllRead();
      await refetchMyGames();
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
        refetchMyGames();
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const { handleDeclineInvite, declineInviteModal } = useDeclineInvite({
    onDeclineStart: (inviteId) => {
      setDecliningInviteIds((prev) => new Set(prev).add(inviteId));
    },
    onDeclined: async (inviteId) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
    },
    onDeclineEnd: (inviteId) => {
      setDecliningInviteIds((prev) => {
        const next = new Set(prev);
        next.delete(inviteId);
        return next;
      });
    },
  });

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await Promise.all([
      refetchMyGames(),
      useUserTeamsStore.getState().refreshAll(),
    ]);
  }, [refetchMyGames]);

  const scrollBottomPadding = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const renderAdvancedContent = (footerLoading: boolean) => (
    <>
      <UserTeamsHomeSection className="mb-3" />
      <YourLeaguesHomeSection games={games} gamesUnreadCounts={calendarMergedUnreadCounts} className="mb-3" />
      <MainTabFooter isLoading={footerLoading} />
    </>
  );
  const calendarContentPanel = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
        {user && <AdvancedTabMovedHint />}
        {user && <StoriesRail />}
        {!hideHomeHeroAd && user && <AdSlot placement={AD_PLACEMENTS.HOME_HERO} />}
        {user && <SportQuestionnairePrompt sport={getUserPrimarySport(user)} />}
        <CityPromptBanner />
        {user && <MyTabBookingsSection />}
        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${!loading ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <InvitesSection
            invites={invites}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
            decliningInviteIds={decliningInviteIds}
            onNoteSaved={() => refetchMyGames()}
          />
        </div>
        <MyGamesSection
          games={myGamesForSelectedDate}
          user={user}
          loading={loading || loadingPastInRange}
          showSkeleton={skeletonAnimation.showSkeleton}
          skeletonStates={skeletonAnimation.skeletonStates}
          gamesUnreadCounts={calendarMergedUnreadCounts}
          onNoteSaved={() => refetchMyGames()}
          upcomingGames={myGamesSelectedDate ? undefined : upcomingGamesForCalendar}
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
        <MainTabFooter isLoading={loading} />
      </div>
    </div>
  );
  if (isDesktop) {
    if (!isCalendarTab) {
      return (
        <>
          <div className="fixed inset-x-0 bottom-0 overflow-y-auto z-0 bg-gray-50 dark:bg-gray-900" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
            <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
              {renderAdvancedContent(loading)}
            </div>
          </div>
          {declineInviteModal}
        </>
      );
    }
    return (
      <>
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
                  <SelectedDateHeading date={myGamesSelectedDate} />
                </div>
              </div>
            }
            rightPanel={calendarContentPanel}
          />
        ) : (
          calendarContentPanel
        )}
      </div>
      {declineInviteModal}
      </>
    );
  }

  return (
    <>
    <PullToRefreshShell onRefresh={handleRefresh} disabled={loading}>
      {({ isRefreshing }) => (
        <>
        {isCalendarTab ? (
          <>
        {user && <AdvancedTabMovedHint />}
        {user && <StoriesRail />}
        {!hideHomeHeroAd && user && <AdSlot placement={AD_PLACEMENTS.HOME_HERO} />}
        {user && <SportQuestionnairePrompt sport={getUserPrimarySport(user)} />}
        <CityPromptBanner />
        {user && <MyTabBookingsSection />}
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
            decliningInviteIds={decliningInviteIds}
            onNoteSaved={() => refetchMyGames()}
          />
        </div>

        <div className="min-h-[100px]">
          {hasUpcomingGames && (
            <MonthCalendar
              selectedDate={myGamesSelectedDate}
              onDateSelect={setMyGamesSelectedDate}
              availableGames={calendarMergedGames}
              onDateRangeChange={handleCalendarDateRangeChange}
            />
          )}
          {hasUpcomingGames && <SelectedDateHeading date={myGamesSelectedDate} />}
          <MyGamesSection
            games={myGamesForSelectedDate}
            user={user}
            loading={loading || loadingPastInRange}
            showSkeleton={skeletonAnimation.showSkeleton}
            skeletonStates={skeletonAnimation.skeletonStates}
            gamesUnreadCounts={calendarMergedUnreadCounts}
            onNoteSaved={() => refetchMyGames()}
            upcomingGames={myGamesSelectedDate ? undefined : upcomingGamesForCalendar}
            onSwitchToSearch={!hasUpcomingGames ? () => navigationService.navigateToFind() : undefined}
          />
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
        <MainTabFooter isLoading={loading || isRefreshing} />
          </>
        ) : (
          renderAdvancedContent(loading || isRefreshing)
        )}
        </>
      )}
    </PullToRefreshShell>
    {declineInviteModal}
    </>
  );
};
