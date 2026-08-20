import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { format, parse, startOfDay } from 'date-fns';
import { filterGamesForCalendarDay } from '@/utils/calendarSelectedDayFilter';
import { dateKeyInTimezone } from '@/utils/weatherDayGroups';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import {
  InvitesSection,
  MyGamesSection,
  PastGamesSection,
  UserTeamsHomeSection,
} from '@/components/home';
import { StoriesRail } from '@/components/stories/StoriesRail';
import { HomeActionGrid } from '@/components/home/HomeActionGrid';
import { HomeTodayHeading } from '@/components/home/HomeTodayHeading';
import { AdSlot } from '@/components/sponsorSlots';
import { MyTabUnlinkedBookingsSection } from '@/components/booktime/MyTabUnlinkedBookingsSection';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { useRegisterAdSportContext } from '@/hooks/useAdPlacements';
import { getViewerPrimarySport } from '@/utils/profileSports';
import { MainTabFooter } from '@/components';
import { gamesApi } from '@/api';
import { useGameUnreadCountsForIds } from '@/hooks/useUnreadBridge';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useHeaderStore } from '@/store/headerStore';
import { useMyGames } from '@/hooks/useMyGames';
import { useMyTabClubBookings } from '@/hooks/useMyTabClubBookings';
import { useMyTabUnlinkedBookings } from '@/hooks/useMyTabUnlinkedBookings';
import { useUserTeamsBootstrap } from '@/hooks/useUserTeamsBootstrap';
import { useMyTabPanelCounts } from '@/hooks/useMyTabPanelCounts';
import { CalendarSection } from '@/components/home/CalendarSection';
import { usePastGames } from '@/hooks/usePastGames';
import { usePastGamesPrefetch } from '@/hooks/useMyTabPrefetch';
import { flattenPastGamesPages, type PastGamesPage } from '@/queries/games';
import { GAMES_LIST_STALE_TIME } from '@/queries/games/constants';
import { queryKeys } from '@/queries/queryKeys';
import {
  filterPastGamesForCalendarRange,
  pastGamesCacheCoversRange,
} from '@/utils/pastGamesCalendarRange';
import { useHomeFromUrl } from '@/hooks/useHomeFromUrl';
import { PullToRefreshShell } from '@/components/PullToRefreshShell';
import { useDesktop } from '@/hooks/useDesktop';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { recoverGenderUnsetJoin, runWithGenderForEvent } from '@/utils/genderJoinGate';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { TabContentStack } from '@/components/motion/TabContentStack';
import { useDeclineInvite } from '@/hooks/useDeclineInvite';
import { runWithOverlapConfirm } from '@/utils/gameSlotOverlapConfirm';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { navigationService } from '@/services/navigationService';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { scrollAppToTop } from '@/utils/appScroll';
import { readMyGamesViewMode, writeMyGamesViewMode, type MyGamesViewMode } from '@/utils/myGamesViewStorage';

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
  const { tab: homeTab } = useHomeFromUrl();
  const isCalendarTab = homeTab === 'calendar';
  const requestFocusInvitesNonce = useShellNavStore((s) => s.requestFocusInvitesNonce);
  const isPastGamesTab = homeTab === 'past-games';
  const myGamesSelectedDay = useShellNavStore((s) => s.myGamesSelectedDay);
  const setMyGamesSelectedDay = useShellNavStore((s) => s.setMyGamesSelectedDay);
  const myGamesCalendarDateAfterCreate = useShellNavStore((s) => s.myGamesCalendarDateAfterCreate);
  const setMyGamesCalendarDateAfterCreate = useShellNavStore((s) => s.setMyGamesCalendarDateAfterCreate);
  const setCreateGameInitialDate = useHeaderStore((s) => s.setCreateGameInitialDate);
  const primarySport = getViewerPrimarySport(user);
  useRegisterAdSportContext(AD_PLACEMENTS.HOME_HERO, primarySport);

  // Hooks relocated from the removed MyTabPanelSwitcher (teams bootstrap + panel
  // counts drive the action grid's earned surfaces and the bottom Teams section).
  useUserTeamsBootstrap();
  const booktime = useMyTabClubBookings();
  const { reloadMyClubs, reloadBookings } = booktime;

  const [myGamesViewMode, setMyGamesViewMode] = useState<MyGamesViewMode>(() =>
    readMyGamesViewMode(user?.id),
  );

  useEffect(() => {
    setMyGamesViewMode(readMyGamesViewMode(user?.id));
  }, [user?.id]);

  useEffect(() => {
    scrollAppToTop('auto');
  }, [homeTab]);

  const [loading, setLoading] = useState(true);

  const {
    games,
    invites,
    unreadCounts,
    refetch: refetchMyGames,
  } = useMyGames(user, setLoading);
  const unlinkedBookings = useMyTabUnlinkedBookings(booktime, games);
  const panelCounts = useMyTabPanelCounts(games, booktime);

  useEffect(() => {
    if (!requestFocusInvitesNonce || loading) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('home-invites-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      useShellNavStore.getState().setBounceNotifications(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [requestFocusInvitesNonce, loading]);

  const {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    loadPastGames,
    refetchGame,
  } = usePastGames(user, isPastGamesTab);
  const { prefetchPastGames } = usePastGamesPrefetch();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isPastGamesTab) {
      prefetchPastGames();
    }
  }, [isPastGamesTab, prefetchPastGames]);

  const [pastGamesInRange, setPastGamesInRange] = useState<any[]>([]);
  const pastRangeRequestIdRef = useRef(0);
  const calendarVisibleRef = useRef(false);

  const gameIdsForUnread = useMemo(() => {
    const ids = new Set<string>();
    for (const g of games) ids.add(g.id);
    for (const g of pastGamesInRange) ids.add(g.id);
    return [...ids];
  }, [games, pastGamesInRange]);

  const gameUnreadForSort = useGameUnreadCountsForIds(gameIdsForUnread, unreadCounts);

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
    if (myGamesSelectedDay != null || myGamesCalendarDateAfterCreate != null) {
      return;
    }
    setMyGamesSelectedDay(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  }, [myGamesSelectedDay, myGamesCalendarDateAfterCreate, setMyGamesSelectedDay]);
  useEffect(() => {
    if (isCalendarTab) {
      setCreateGameInitialDate(myGamesViewMode === 'list' ? null : myGamesSelectedDate);
    } else {
      setCreateGameInitialDate(null);
    }
  }, [isCalendarTab, myGamesSelectedDate, myGamesViewMode, setCreateGameInitialDate]);
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
    const cityTimezone = resolveViewerCityTimezone(user?.currentCity?.timezone);
    return sortMyGamesByStatusAndDateTime(
      filterGamesForCalendarDay(
        calendarMergedGames,
        myGamesSelectedDate,
        cityTimezone,
      ),
      calendarMergedUnreadCounts,
    );
  }, [myGamesSelectedDate, calendarMergedGames, calendarMergedUnreadCounts, user?.currentCity?.timezone]);

  const upcomingGamesUndated = useMemo(() => {
    const base = calendarMergedGames.filter((g) => {
      if (g.timeIsSet === false) return false;
      const status = g.status;
      return status === 'ANNOUNCED' || status === 'STARTED' || status === 'FINISHED';
    });
    return base.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [calendarMergedGames]);

  const upcomingGamesForCalendar = useMemo(() => {
    if (!myGamesSelectedDate) {
      return upcomingGamesUndated;
    }
    const cityTimezone = resolveViewerCityTimezone(user?.currentCity?.timezone);
    const selectedStr = format(startOfDay(myGamesSelectedDate), 'yyyy-MM-dd');
    return upcomingGamesUndated.filter((g) => {
      const gameStr = dateKeyInTimezone(new Date(g.startTime), cityTimezone);
      return gameStr !== selectedStr;
    });
  }, [myGamesSelectedDate, upcomingGamesUndated, user?.currentCity?.timezone]);
  const gamesSectionGames = myGamesViewMode === 'list' ? [] : myGamesForSelectedDate;
  const gamesSectionUpcoming =
    myGamesViewMode === 'list' || !myGamesSelectedDate
      ? upcomingGamesUndated
      : upcomingGamesForCalendar;
  const gamesSectionLoading =
    loading || (myGamesViewMode === 'calendar' && loadingPastInRange);
  const selectedDateEmptyHint =
    myGamesViewMode === 'calendar' &&
    myGamesSelectedDate &&
    !gamesSectionLoading &&
    myGamesForSelectedDate.filter((g) => g.entityType !== 'LEAGUE_SEASON').length === 0 &&
    gamesSectionUpcoming.length > 0
      ? t('home.noGamesOnSelectedDate')
      : undefined;
  const handleCalendarDateRangeChange = useCallback(
    async (start: Date, end: Date) => {
      if (!calendarVisibleRef.current) return;
      const requestId = ++pastRangeRequestIdRef.current;
      const today = startOfDay(new Date());
      const rangeStart = startOfDay(start);
      if (rangeStart >= today) {
        if (requestId === pastRangeRequestIdRef.current) {
          setPastGamesInRange([]);
          setLoadingPastInRange(false);
        }
        return;
      }
      setLoadingPastInRange(true);
      try {
        if (!calendarVisibleRef.current || requestId !== pastRangeRequestIdRef.current) {
          return;
        }
        const userId = user?.id;
        if (userId) {
          const queryState = queryClient.getQueryState(queryKeys.games.past(userId));
          const cachedPages = queryClient.getQueryData<InfiniteData<PastGamesPage>>(
            queryKeys.games.past(userId),
          );
          const cachedGames = flattenPastGamesPages(cachedPages?.pages);
          const cacheAgeMs = queryState?.dataUpdatedAt
            ? Date.now() - queryState.dataUpdatedAt
            : Number.POSITIVE_INFINITY;
          const cacheIsFresh = cacheAgeMs <= GAMES_LIST_STALE_TIME;
          const cityTimezone = user?.currentCity?.timezone;
          const fromCache = filterPastGamesForCalendarRange(
            cachedGames,
            rangeStart,
            end,
            cityTimezone,
          );

          if (
            cacheIsFresh &&
            fromCache.length > 0 &&
            pastGamesCacheCoversRange(cachedGames, rangeStart, end, cityTimezone)
          ) {
            if (
              calendarVisibleRef.current &&
              requestId === pastRangeRequestIdRef.current
            ) {
              setPastGamesInRange(fromCache);
            }
            return;
          }
        }

        const response = await gamesApi.getPastGames({
          startDate: format(rangeStart, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd'),
          limit: 100,
          offset: 0,
        });
        if (
          !calendarVisibleRef.current ||
          requestId !== pastRangeRequestIdRef.current
        ) {
          return;
        }
        const list = (response.data ?? []).filter(
          (g: { entityType?: string; resultsStatus?: string }) =>
            !(g.entityType === 'LEAGUE_SEASON' && g.resultsStatus !== 'FINAL')
        );
        setPastGamesInRange(list);
      } catch {
        if (
          calendarVisibleRef.current &&
          requestId === pastRangeRequestIdRef.current
        ) {
          setPastGamesInRange([]);
        }
      } finally {
        if (requestId === pastRangeRequestIdRef.current) {
          setLoadingPastInRange(false);
        }
      }
    },
    [queryClient, user?.id, user?.currentCity?.timezone]
  );
  const calendarVisible = myGamesViewMode === 'calendar';
  calendarVisibleRef.current = calendarVisible;
  useEffect(() => {
    if (calendarVisible) return;
    pastRangeRequestIdRef.current += 1;
    setPastGamesInRange([]);
    setLoadingPastInRange(false);
  }, [calendarVisible]);
  const handleCalendarVisibleChange = useCallback((visible: boolean) => {
    calendarVisibleRef.current = visible;
    if (!visible) {
      pastRangeRequestIdRef.current += 1;
      setPastGamesInRange([]);
      setLoadingPastInRange(false);
    }
    const mode = visible ? 'calendar' : 'list';
    setMyGamesViewMode(mode);
    const userId = useAuthStore.getState().user?.id;
    if (userId) writeMyGamesViewMode(mode, userId);
  }, []);
  const myTabCalendarProps = {
    selectedDate: myGamesSelectedDate,
    onDateSelect: setMyGamesSelectedDate,
    availableGames: calendarMergedGames,
    onDateRangeChange: handleCalendarDateRangeChange,
    weatherModeScope: 'my' as const,
    selectedDateEmptyHint,
  };
  const filteredPastGames = useMemo(() => {
    const list = pastGames.filter((g) => g.entityType !== 'LEAGUE_SEASON');
    return sortMyGamesByStatusAndDateTime(list, gameUnreadForSort);
  }, [pastGames, gameUnreadForSort]);

  const [decliningInviteIds, setDecliningInviteIds] = useState<Set<string>>(new Set());
  const acceptingInviteIdsRef = useRef<Set<string>>(new Set());
  const handleAcceptInvite = async (inviteId: string) => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleAcceptInvite(inviteId));
      return;
    }
    const inviteGame = invites.find((inv) => inv.id === inviteId)?.game;
    if (!runWithGenderForEvent(inviteGame, () => void handleAcceptInvite(inviteId))) return;
    // Guard against a rapid double-tap firing two POSTs (the second would 404
    // because the invite is no longer in the INVITED state, surfacing a spurious error toast).
    if (acceptingInviteIdsRef.current.has(inviteId)) return;
    acceptingInviteIdsRef.current.add(inviteId);
    try {
      const { invitesApi } = await import('@/api');
      const response = await runWithOverlapConfirm((confirmOverlap) =>
        invitesApi.accept(inviteId, confirmOverlap),
      );
      if (!response) return;
      const message = (response as { message?: string }).message || 'Invite accepted successfully';

      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }

      const { decrementPendingInvite } = useHeaderStore.getState();
      decrementPendingInvite(inviteId);
      void refetchMyGames(false, true);
    } catch (error: any) {
      if (recoverGenderUnsetJoin(error, () => void handleAcceptInvite(inviteId))) return;
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      acceptingInviteIdsRef.current.delete(inviteId);
    }
  };

  const { handleDeclineInvite, declineInviteModal } = useDeclineInvite({
    onDeclineStart: (inviteId) => {
      setDecliningInviteIds((prev) => new Set(prev).add(inviteId));
    },
    onDeclined: async (inviteId) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      useHeaderStore.getState().decrementPendingInvite(inviteId);
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
      loadPastGames?.(),
      useUserTeamsStore.getState().refreshAll({ force: true }),
      (async () => {
        await reloadMyClubs();
        await reloadBookings();
      })(),
    ]);
  }, [reloadMyClubs, reloadBookings, refetchMyGames, loadPastGames]);

  const scrollBottomPadding = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const renderPastGamesContent = (footerLoading: boolean) => (
    <>
      <PastGamesSection
        pastGames={filteredPastGames}
        loadingPastGames={loadingPastGames}
        hasMorePastGames={hasMorePastGames}
        user={user}
        pastGamesUnreadCounts={gameUnreadForSort}
        onLoadMore={loadPastGames}
        onNoteSaved={(gameId) => refetchGame(gameId)}
      />
      <UserTeamsHomeSection embedded />
      <MainTabFooter isLoading={footerLoading} />
    </>
  );
  const calendarContentPanel = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
        <TabContentStack id="my-tab-desktop-stack">
          {user && (
            <AnimatedMount layout>
              <StoriesRail />
            </AnimatedMount>
          )}
          {user && (
            <MyTabUnlinkedBookingsSection booktime={booktime} unlinked={unlinkedBookings} />
          )}
          {user && user.cityIsSet === true && (
            <AdSlot placement={AD_PLACEMENTS.HOME_HERO} />
          )}
          {user && (
            <HomeActionGrid
              user={user}
              games={games}
              gamesUnreadCounts={calendarMergedUnreadCounts}
              primarySport={primarySport}
              panelCounts={panelCounts}
              hideBookingsCta={unlinkedBookings.visible || unlinkedBookings.pending}
            />
          )}
          {!loading && (
            <div id="home-invites-section">
              <InvitesSection
                invites={invites}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
                decliningInviteIds={decliningInviteIds}
                onNoteSaved={() => refetchMyGames()}
              />
            </div>
          )}
          <HomeTodayHeading
            calendarVisible={calendarVisible}
            onToggleCalendar={() => handleCalendarVisibleChange(!calendarVisible)}
          />
          <AnimatedMount>
            <MyGamesSection
              games={gamesSectionGames}
              user={user}
              loading={gamesSectionLoading}
              gamesUnreadCounts={calendarMergedUnreadCounts}
              onNoteSaved={() => refetchMyGames()}
              upcomingGames={gamesSectionUpcoming}
              onSwitchToSearch={!hasUpcomingGames ? () => navigationService.navigateToFind() : undefined}
            />
          </AnimatedMount>
          <UserTeamsHomeSection embedded />
        </TabContentStack>
        <MainTabFooter isLoading={loading} />
      </div>
    </div>
  );
  const splitView = isDesktop && calendarVisible && !isPastGamesTab;
  if (isDesktop) {
    if (isPastGamesTab) {
      return (
        <>
          <div className="fixed inset-x-0 bottom-0 overflow-y-auto z-0 bg-gray-50 dark:bg-gray-900" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
            <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
              {renderPastGamesContent(loading || loadingPastGames)}
            </div>
          </div>
          {declineInviteModal}
        </>
      );
    }
    return (
      <>
        <div className="fixed inset-x-0 bottom-0 overflow-hidden z-0" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
          <ResizableSplitter
            showLeft={splitView}
            defaultLeftWidth={35}
            minLeftWidth={280}
            maxLeftWidth={450}
            leftPanel={
              <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                  <CalendarSection {...myTabCalendarProps} />
                </div>
              </div>
            }
            rightPanel={calendarContentPanel}
          />
        </div>
        {declineInviteModal}
      </>
    );
  }

  return (
    <>
    <PullToRefreshShell onRefresh={handleRefresh} disabled={loading || loadingPastGames}>
      {({ isRefreshing }) => (
        <>
        {isPastGamesTab ? (
          renderPastGamesContent(loading || loadingPastGames || isRefreshing)
        ) : (
          <>
        <TabContentStack id="my-tab-mobile-stack">
          {user && (
            <AnimatedMount layout>
              <StoriesRail />
            </AnimatedMount>
          )}
          {user && (
            <MyTabUnlinkedBookingsSection booktime={booktime} unlinked={unlinkedBookings} />
          )}
          {user && user.cityIsSet === true && (
            <AdSlot placement={AD_PLACEMENTS.HOME_HERO} />
          )}
          {user && (
            <HomeActionGrid
              user={user}
              games={games}
              gamesUnreadCounts={calendarMergedUnreadCounts}
              primarySport={primarySport}
              panelCounts={panelCounts}
              hideBookingsCta={unlinkedBookings.visible || unlinkedBookings.pending}
            />
          )}
          {!loading && (
            <div id="home-invites-section">
              <InvitesSection
                invites={invites}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
                decliningInviteIds={decliningInviteIds}
                onNoteSaved={() => refetchMyGames()}
              />
            </div>
          )}

          {calendarVisible ? (
            <AnimatedMount layout>
              <CalendarSection {...myTabCalendarProps} />
            </AnimatedMount>
          ) : null}
          <HomeTodayHeading
            calendarVisible={calendarVisible}
            onToggleCalendar={() => handleCalendarVisibleChange(!calendarVisible)}
          />
          <AnimatedMount>
            <MyGamesSection
              games={gamesSectionGames}
              user={user}
              loading={gamesSectionLoading}
              gamesUnreadCounts={calendarMergedUnreadCounts}
              onNoteSaved={() => refetchMyGames()}
              upcomingGames={gamesSectionUpcoming}
              onSwitchToSearch={!hasUpcomingGames ? () => navigationService.navigateToFind() : undefined}
            />
          </AnimatedMount>

          <UserTeamsHomeSection embedded />
        </TabContentStack>
        <MainTabFooter isLoading={loading || isRefreshing} />
          </>
        )}
        </>
      )}
    </PullToRefreshShell>
    {declineInviteModal}
    </>
  );
};
