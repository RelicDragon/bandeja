import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format, parse, startOfDay } from 'date-fns';
import { filterGamesForCalendarDay } from '@/utils/calendarSelectedDayFilter';
import { dateKeyInTimezone } from '@/utils/weatherDayGroups';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import {
  InvitesSection,
  MyGamesSection,
  PastGamesSection,
  UserTeamsHomeSection,
  CityPromptBanner,
} from '@/components/home';
import { SportQuestionnairePrompt } from '@/components/sportQuestionnaire';
import { StoriesRail } from '@/components/stories/StoriesRail';
import { HomeActionGrid } from '@/components/home/HomeActionGrid';
import { LiveNowRailContainer } from '@/components/live/LiveNowRailContainer';
import { HomeTodayHeading } from '@/components/home/HomeTodayHeading';
import { AdSlot } from '@/components/sponsorSlots';
import { MyTabUnlinkedBookingsSection } from '@/components/booktime/MyTabUnlinkedBookingsSection';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { useRegisterAdSportContext } from '@/hooks/useAdPlacements';
import { getViewerPrimarySport } from '@/utils/profileSports';
import { MainTabFooter } from '@/components';
import { gamesApi } from '@/api';
import { useGameUnreadPresenceForIds } from '@/hooks/useUnreadBridge';
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
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { TabContentStack } from '@/components/motion/TabContentStack';
import { useHomeInviteActions } from '@/components/home/useHomeInviteActions';
import { NoviceProgressCard } from '@/components/home/NoviceProgressCard';
import { myTabNoviceSections } from '@/utils/noviceShell';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { navigationService } from '@/services/navigationService';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { scrollAppToTop } from '@/utils/appScroll';
import { readMyGamesViewMode, writeMyGamesViewMode, type MyGamesViewMode } from '@/utils/myGamesViewStorage';

const AgentTab = lazy(() =>
  import('@/components/agent/AgentTab').then((m) => ({ default: m.AgentTab })),
);

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

  // PRD 358 — novice ranks hide sections; the Play hero, invites and games stay.
  const noviceSections = myTabNoviceSections(user);
  const [storedMyGamesViewMode, setMyGamesViewMode] = useState<MyGamesViewMode>(() =>
    readMyGamesViewMode(user?.id),
  );
  // Calendar locked for novices → the plain list, without touching the saved choice.
  const myGamesViewMode: MyGamesViewMode = noviceSections.calendar ? storedMyGamesViewMode : 'list';

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
  const { reloadLinkedGames } = unlinkedBookings;
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
  // Seeded from the initial view mode because the calendar reports its range
  // from a child effect, which runs before this component's own effects.
  const calendarVisibleRef = useRef(myGamesViewMode === 'calendar');

  const gameIdsForUnread = useMemo(() => {
    const ids = new Set<string>();
    for (const g of games) ids.add(g.id);
    for (const g of pastGamesInRange) ids.add(g.id);
    for (const g of pastGames) ids.add(g.id);
    return [...ids];
  }, [games, pastGamesInRange, pastGames]);

  const gameUnreadForSort = useGameUnreadPresenceForIds(gameIdsForUnread, unreadCounts);

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
    const merged = filteredMyGames.filter((g) => g.entityType !== 'LEAGUE_SEASON');
    const ids = new Set(merged.map((g) => g.id));
    for (const g of pastGamesInRange) {
      if (g.entityType === 'LEAGUE_SEASON' || ids.has(g.id)) continue;
      merged.push(g);
    }
    return merged;
  }, [filteredMyGames, pastGamesInRange]);
  const calendarMergedUnreadCounts = unreadCounts;
  const myGamesForSelectedDate = useMemo(() => {
    if (!myGamesSelectedDate) return [];
    const cityTimezone = resolveViewerCityTimezone(user?.currentCity?.timezone);
    return sortMyGamesByStatusAndDateTime(
      filterGamesForCalendarDay(
        calendarMergedGames,
        myGamesSelectedDate,
        cityTimezone,
      ),
      gameUnreadForSort,
    );
  }, [myGamesSelectedDate, calendarMergedGames, gameUnreadForSort, user?.currentCity?.timezone]);

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
  useEffect(() => {
    // Written in an effect, not during render: the in-flight range fetch reads
    // this ref to decide whether its result is still wanted, and a discarded
    // render pass must not tell it the calendar is visible.
    calendarVisibleRef.current = calendarVisible;
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
  const showListView = useCallback(
    () => handleCalendarVisibleChange(false),
    [handleCalendarVisibleChange],
  );
  const showCalendarView = useCallback(
    () => handleCalendarVisibleChange(true),
    [handleCalendarVisibleChange],
  );
  const switchToFind = useCallback(() => navigationService.navigateToFind(), []);

  // Memoised so the calendar is skipped by `memo` when MyTab re-renders for one
  // of its many unrelated sources (bookings poll, teams store, unread, URL).
  const upcomingsToggle = useMemo(
    () => ({ active: false, onClick: showListView, label: t('games.list') }),
    [showListView, t],
  );
  const myTabCalendarProps = useMemo(
    () => ({
      selectedDate: myGamesSelectedDate,
      onDateSelect: setMyGamesSelectedDate,
      availableGames: calendarMergedGames,
      onDateRangeChange: handleCalendarDateRangeChange,
      weatherModeScope: 'my' as const,
      selectedDateEmptyHint,
      upcomingsToggle,
    }),
    [
      myGamesSelectedDate, setMyGamesSelectedDate, calendarMergedGames,
      handleCalendarDateRangeChange, selectedDateEmptyHint, upcomingsToggle,
    ],
  );
  const filteredPastGames = useMemo(() => {
    const list = pastGames.filter((g) => g.entityType !== 'LEAGUE_SEASON');
    return sortMyGamesByStatusAndDateTime(list, gameUnreadForSort);
  }, [pastGames, gameUnreadForSort]);

  const { handleAcceptInvite, handleDeclineInvite, declineInviteModal, decliningInviteIds } =
    useHomeInviteActions(invites, refetchMyGames);

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await Promise.all([
      refetchMyGames(),
      loadPastGames?.(),
      useUserTeamsStore.getState().refreshAll({ force: true }),
      (async () => {
        await reloadMyClubs();
        await reloadBookings();
        await reloadLinkedGames();
      })(),
    ]);
  }, [reloadMyClubs, reloadBookings, reloadLinkedGames, refetchMyGames, loadPastGames]);

  const handleNoteSaved = useCallback(() => {
    void refetchMyGames();
  }, [refetchMyGames]);
  const handlePastNoteSaved = useCallback((gameId: string) => {
    void refetchGame(gameId);
  }, [refetchGame]);

  const scrollBottomPadding = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const renderPastGamesContent = (footerLoading: boolean) => (
    <>
      <PastGamesSection
        pastGames={filteredPastGames}
        loadingPastGames={loadingPastGames}
        hasMorePastGames={hasMorePastGames}
        user={user}
        pastGamesUnreadCounts={unreadCounts}
        onLoadMore={loadPastGames}
        onNoteSaved={handlePastNoteSaved}
      />
      {noviceSections.userTeams ? <UserTeamsHomeSection embedded /> : null}
      <MainTabFooter isLoading={footerLoading} />
    </>
  );
  const calendarContentPanel = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
        <TabContentStack id="my-tab-desktop-stack">
          {user && noviceSections.progressCard && (
            <AnimatedMount layout>
              <NoviceProgressCard />
            </AnimatedMount>
          )}
          {user && noviceSections.stories && (
            <AnimatedMount layout>
              <StoriesRail />
            </AnimatedMount>
          )}
          {user && (
            <AnimatedMount layout>
              <CityPromptBanner />
            </AnimatedMount>
          )}
          {user && (
            <AnimatedMount layout>
              <SportQuestionnairePrompt sport={primarySport} />
            </AnimatedMount>
          )}
          {user && (
            <MyTabUnlinkedBookingsSection booktime={booktime} unlinked={unlinkedBookings} />
          )}
          {user && user.cityIsSet === true && noviceSections.ads && (
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
              showLeagues={noviceSections.leagues}
            />
          )}
          {user && noviceSections.liveRail && (
            <LiveNowRailContainer
              variant="home"
              cityId={user.currentCityId ?? undefined}
              cityName={user.currentCity?.name}
            />
          )}
          {!loading && (
            <div id="home-invites-section">
              <InvitesSection
                invites={invites}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
                decliningInviteIds={decliningInviteIds}
                onNoteSaved={handleNoteSaved}
              />
            </div>
          )}
          {!calendarVisible ? (
            <HomeTodayHeading
              selectedDate={myGamesSelectedDate}
              onShowCalendar={noviceSections.calendar ? showCalendarView : undefined}
            />
          ) : null}
          <AnimatedMount>
            <MyGamesSection
              games={gamesSectionGames}
              user={user}
              loading={gamesSectionLoading}
              gamesUnreadCounts={calendarMergedUnreadCounts}
              onNoteSaved={handleNoteSaved}
              upcomingGames={gamesSectionUpcoming}
              onSwitchToSearch={hasUpcomingGames ? undefined : switchToFind}
            />
          </AnimatedMount>
          {noviceSections.userTeams ? <UserTeamsHomeSection embedded /> : null}
        </TabContentStack>
        <MainTabFooter isLoading={loading} />
      </div>
    </div>
  );
  // My → AI (`?tab=ai`): its own list/thread UI, no pull-to-refresh or calendar chrome.
  if (homeTab === 'ai') {
    return (
      <Suspense fallback={null}>
        <AgentTab />
      </Suspense>
    );
  }
  const splitView = isDesktop && calendarVisible && !isPastGamesTab;
  if (isDesktop) {
    if (isPastGamesTab) {
      return (
        <>
          <div className="fixed inset-x-0 bottom-0 overflow-y-auto z-0 bg-gray-50 dark:bg-gray-900" style={{ top: 'calc(var(--app-header-height, 4rem) + env(safe-area-inset-top, 0px))' }}>
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
        <div className="fixed inset-x-0 bottom-0 overflow-hidden z-0" style={{ top: 'calc(var(--app-header-height, 4rem) + env(safe-area-inset-top, 0px))' }}>
          <ResizableSplitter
            showLeft={splitView}
            defaultLeftWidth={35}
            minLeftWidth={280}
            maxLeftWidth={450}
            leftPanel={
              <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-700">
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
          {user && noviceSections.progressCard && (
            <AnimatedMount layout>
              <NoviceProgressCard />
            </AnimatedMount>
          )}
          {user && noviceSections.stories && (
            <AnimatedMount layout>
              <StoriesRail />
            </AnimatedMount>
          )}
          {user && (
            <AnimatedMount layout>
              <CityPromptBanner />
            </AnimatedMount>
          )}
          {user && (
            <AnimatedMount layout>
              <SportQuestionnairePrompt sport={primarySport} />
            </AnimatedMount>
          )}
          {user && (
            <MyTabUnlinkedBookingsSection booktime={booktime} unlinked={unlinkedBookings} />
          )}
          {user && user.cityIsSet === true && noviceSections.ads && (
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
              showLeagues={noviceSections.leagues}
            />
          )}
          {user && noviceSections.liveRail && (
            <LiveNowRailContainer
              variant="home"
              cityId={user.currentCityId ?? undefined}
              cityName={user.currentCity?.name}
            />
          )}
          {!loading && (
            <div id="home-invites-section">
              <InvitesSection
                invites={invites}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
                decliningInviteIds={decliningInviteIds}
                onNoteSaved={handleNoteSaved}
              />
            </div>
          )}

          {calendarVisible ? (
            <AnimatedMount layout>
              <CalendarSection {...myTabCalendarProps} />
            </AnimatedMount>
          ) : null}
          {!calendarVisible ? (
            <HomeTodayHeading
              selectedDate={myGamesSelectedDate}
              onShowCalendar={noviceSections.calendar ? showCalendarView : undefined}
            />
          ) : null}
          <AnimatedMount>
            <MyGamesSection
              games={gamesSectionGames}
              user={user}
              loading={gamesSectionLoading}
              gamesUnreadCounts={calendarMergedUnreadCounts}
              onNoteSaved={handleNoteSaved}
              upcomingGames={gamesSectionUpcoming}
              onSwitchToSearch={hasUpcomingGames ? undefined : switchToFind}
            />
          </AnimatedMount>

          {noviceSections.userTeams ? <UserTeamsHomeSection embedded /> : null}
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
