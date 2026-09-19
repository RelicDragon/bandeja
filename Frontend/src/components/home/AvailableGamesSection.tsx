import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GameCard } from '@/components';
import { Game } from '@/types';
import { Filter, ChevronRight, RotateCcw, Grid3X3, Star, SearchX } from 'lucide-react';
import { useShellNavStore } from '@/store/shellNavStore';
import { useHeaderStore } from '@/store/headerStore';
import { format, parse, startOfDay } from 'date-fns';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import { CalendarSection } from './CalendarSection';
import { TrainersList } from './TrainersList';
import { GenderPromptBanner } from './GenderPromptBanner';
import { CityPromptBanner } from './CityPromptBanner';
import { resolveGameFilters, type GameFilters } from '@/utils/gameFiltersStorage';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { FiltersPanel } from './FiltersPanel';
import { AnimatedGameList } from './AnimatedGameList';
import { AnimatedLoadingSwap } from '@/components/motion/AnimatedLoadingSwap';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { TabContentStack } from '@/components/motion/TabContentStack';
import { EmptyStateCard } from './EmptyStateCard';
import { FindDayLoadErrorEmpty } from './FindDayLoadErrorEmpty';
import { GamesLoadingSkeleton } from './GameCardSkeleton';
import { EntityFilterChips, type EntityFilterType } from './EntityFilterChips';
import { FindCityEventsRail } from './FindCityEventsRail';
import { SubscriptionsNudgeButton } from './SubscriptionsNudgeButton';
import { GamesByDateList } from './GamesByDateList';
import { navigationService } from '@/services/navigationService';
import { getViewerPrimarySport, resolveFindLevelFilterSport, findSportFilterToApiParam } from '@/utils/findSportFilter';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { listEnabledSports } from '@/utils/profileSports';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { isFindDiscoveryEnabled } from '@/utils/findDiscovery';
import { filterFindGames, resolveFindFilterViewer, type FindFilterState } from '@/utils/findFilter';
import { toggleFindEntityChip } from '@/utils/findEntityTypeChips';
import type { FindDayIndexRow } from '@/utils/findDayIndexCounts';
import { usePlayersStore } from '@/store/playersStore';
import { formatTrainerDisplayName, resolveFindEmptyMessage } from './findTrainerEmptyMessage';
import { useUpcomingCityEvents } from '@/hooks/useUpcomingCityEvents';

const getGameId = (game: Game) => game.id;

interface AvailableGamesSectionProps {
  availableGames: Game[];
  /** Calendar selected-day card list (day-scoped fetch). Falls back to availableGames. */
  selectedDayGames?: Game[];
  dayIndex?: FindDayIndexRow[];
  user: any;
  loading?: boolean;
  onJoin: (gameId: string, e: React.MouseEvent) => void;
  onMonthChange?: (month: number, year: number) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  /** Owned by the host tab's `useGameFilters` — this section never forks it. */
  filters: GameFilters;
  onFiltersChange: (updates: Partial<GameFilters>) => void;
  onNoteSaved?: (gameId: string) => void;
  splitView?: boolean;
  hasMoreAvailable?: boolean;
  onLoadMoreAvailable?: () => void | Promise<void>;
  availableBound?: number;
  /** Day-scoped fetch failed after retries — show retry empty, not “no games”. */
  dayLoadError?: boolean;
  onRetryDay?: () => void | Promise<void>;
}

const AvailableGamesSectionView = ({
  availableGames,
  selectedDayGames,
  dayIndex,
  user,
  loading,
  onJoin,
  onMonthChange,
  onDateRangeChange,
  filters,
  onFiltersChange,
  onNoteSaved,
  splitView = false,
  hasMoreAvailable = false,
  onLoadMoreAvailable,
  availableBound = 300,
  dayLoadError = false,
  onRetryDay,
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loadingMore, setLoadingMore] = useState(false);
  const findViewMode = useShellNavStore((s) => s.findViewMode);
  const requestFindGoToCurrent = useShellNavStore((s) => s.requestFindGoToCurrent);
  const setIsAnimating = useShellNavStore((s) => s.setIsAnimating);
  const setFindViewMode = useShellNavStore((s) => s.setFindViewMode);
  const setRequestFindGoToCurrent = useShellNavStore((s) => s.setRequestFindGoToCurrent);
  const findSelectedDay = useShellNavStore((s) => s.findSelectedDay);
  const setFindSelectedDay = useShellNavStore((s) => s.setFindSelectedDay);
  const setCreateGameInitialDate = useHeaderStore((s) => s.setCreateGameInitialDate);
  const selectedDate = useMemo(() => {
    if (findSelectedDay) {
      const d = parse(findSelectedDay, 'yyyy-MM-dd', new Date());
      return isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
    }
    return startOfDay(new Date());
  }, [findSelectedDay]);
  const {
    filterAvailableSlots: filterAvailableSlotsVal,
    filterSuitableRating: filterSuitableRatingVal,
    hideBarGames: hideBarGamesVal,
    gameFilter: gameFilterVal,
    trainingFilter: trainingFilterVal,
    tournamentFilter: tournamentFilterVal,
    leaguesFilter: leaguesFilterVal,
    eventsFilter: eventsFilterVal,
    filtersPanelOpen: filtersPanelOpenVal,
    filterClubIds: filterClubIdsVal,
    filterTimeStart: filterTimeStartVal,
    filterTimeEnd: filterTimeEndVal,
    filterLevelMin: filterLevelMinVal,
    filterLevelMax: filterLevelMaxVal,
    filterSport: filterSportVal,
    filterNoRating: filterNoRatingVal,
    showPrivateGames: showPrivateGamesVal,
  } = useMemo(() => resolveGameFilters(filters), [filters]);
  const findDiscoveryEnabled = isFindDiscoveryEnabled();
  const isAdmin = Boolean(user?.isAdmin);
  const viewerPrimarySport = useMemo(() => getViewerPrimarySport(user), [user]);
  const findLevelSport = useMemo(
    () => resolveFindLevelFilterSport(filterSportVal, viewerPrimarySport),
    [filterSportVal, viewerPrimarySport],
  );
  const findSportApiParam = findSportFilterToApiParam(filterSportVal, viewerPrimarySport);
  const { data: cityEventsData } = useUpcomingCityEvents({
    enabled: Boolean(user?.id),
    sport: findSportApiParam,
  });
  const upcomingCityEvents = useMemo(
    () => (cityEventsData?.games ?? []).filter((game) => game.entityType === 'EVENT'),
    [cityEventsData?.games],
  );

  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const panelCriteriaActive = useMemo(() => {
    return (
      filterClubIdsVal.length > 0 ||
      filterTimeStartVal !== '00:00' ||
      filterTimeEndVal !== '24:00' ||
      filterLevelMinVal > 1.0 + 1e-6 ||
      filterLevelMaxVal < 7.0 - 1e-6 ||
      hideBarGamesVal ||
      (findDiscoveryEnabled && filterNoRatingVal) ||
      (isAdmin && showPrivateGamesVal)
    );
  }, [
    filterClubIdsVal,
    filterTimeStartVal,
    filterTimeEndVal,
    filterLevelMinVal,
    filterLevelMaxVal,
    hideBarGamesVal,
    findDiscoveryEnabled,
    filterNoRatingVal,
    isAdmin,
    showPrivateGamesVal,
  ]);

  const panelFiltersApplied =
    filterAvailableSlotsVal || filterSuitableRatingVal || hideBarGamesVal || panelCriteriaActive;

  // Every mutation is a patch on the host's filter state; hydration and
  // persistence live in `useGameFilters`, so there is nothing to fork here.
  const setFilterAvailableSlotsVal = useCallback(
    (v: boolean) => onFiltersChange({ filterAvailableSlots: v }),
    [onFiltersChange],
  );
  const setFilterSuitableRatingVal = useCallback(
    (v: boolean) => onFiltersChange({ filterSuitableRating: v }),
    [onFiltersChange],
  );
  const setHideBarGamesVal = useCallback(
    (v: boolean) => onFiltersChange({ hideBarGames: v }),
    [onFiltersChange],
  );
  const setShowPrivateGamesVal = useCallback(
    (v: boolean) => onFiltersChange({ showPrivateGames: v }),
    [onFiltersChange],
  );
  const setFilterNoRatingVal = useCallback(
    (v: boolean) => onFiltersChange({ filterNoRating: v }),
    [onFiltersChange],
  );
  const setFilterClubIdsVal = useCallback(
    (ids: string[]) => onFiltersChange({ filterClubIds: ids }),
    [onFiltersChange],
  );
  const setTimeRangeVal = useCallback(
    (v: [string, string]) => onFiltersChange({ filterTimeStart: v[0], filterTimeEnd: v[1] }),
    [onFiltersChange],
  );
  const setLevelRangeVal = useCallback(
    (v: [number, number]) => onFiltersChange({ filterLevelMin: v[0], filterLevelMax: v[1] }),
    [onFiltersChange],
  );
  const setFilterSportVal = useCallback(
    (id: FindSportFilterValue) => onFiltersChange({ filterSport: id }),
    [onFiltersChange],
  );

  const resetPanelFilters = useCallback(() => {
    onFiltersChange({
      filterAvailableSlots: false,
      filterSuitableRating: false,
      hideBarGames: false,
      filterClubIds: [],
      filterTimeStart: '00:00',
      filterTimeEnd: '24:00',
      filterLevelMin: 1.0,
      filterLevelMax: 7.0,
      filterNoRating: false,
      showPrivateGames: false,
    });
  }, [onFiltersChange]);

  const toggleFiltersPanel = useCallback(() => {
    onFiltersChange({ filtersPanelOpen: !filtersPanelOpenVal });
  }, [onFiltersChange, filtersPanelOpenVal]);

  const entityChipState = useMemo(
    () => ({
      gameFilter: gameFilterVal,
      trainingFilter: trainingFilterVal,
      tournamentFilter: tournamentFilterVal,
      leaguesFilter: leaguesFilterVal,
      eventsFilter: eventsFilterVal,
    }),
    [gameFilterVal, trainingFilterVal, tournamentFilterVal, leaguesFilterVal, eventsFilterVal],
  );

  const handleEntityFilterClick = useCallback(
    (type: EntityFilterType) => {
      onFiltersChange(toggleFindEntityChip(entityChipState, type));
    },
    [onFiltersChange, entityChipState],
  );

  const handleSeeAllEvents = useCallback(
    () => handleEntityFilterClick('events'),
    [handleEntityFilterClick],
  );

  useEffect(() => {
    if (findViewMode === 'calendar') {
      setCreateGameInitialDate(selectedDate);
    } else {
      setCreateGameInitialDate(null);
    }
  }, [findViewMode, selectedDate, setCreateGameInitialDate]);

  const handleDateSelect = useCallback(
    (date: Date) => {
      setFindSelectedDay(format(startOfDay(date), 'yyyy-MM-dd'));
    },
    [setFindSelectedDay]
  );

  useEffect(() => {
    if (!requestFindGoToCurrent) return;
    const mode = requestFindGoToCurrent;
    setRequestFindGoToCurrent(null);
    if (mode === 'calendar') {
      setFindSelectedDay(format(startOfDay(new Date()), 'yyyy-MM-dd'));
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-calendar="true"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      setFindViewMode('calendar');
      setFindSelectedDay(format(startOfDay(new Date()), 'yyyy-MM-dd'));
      navigationService.navigateToFind({ view: 'calendar' });
    }
  }, [requestFindGoToCurrent, setRequestFindGoToCurrent, setFindSelectedDay, setFindViewMode]);

  const panelFilterState = useMemo(
    () => ({
      filterClubIds: filterClubIdsVal,
      filterTimeStart: filterTimeStartVal,
      filterTimeEnd: filterTimeEndVal,
      filterLevelMin: filterLevelMinVal,
      filterLevelMax: filterLevelMaxVal,
    }),
    [filterClubIdsVal, filterTimeStartVal, filterTimeEndVal, filterLevelMinVal, filterLevelMaxVal]
  );

  // Tuple props for the range inputs; stable so the panel's sliders stay put.
  const timeRangeValue = useMemo<[string, string]>(
    () => [filterTimeStartVal, filterTimeEndVal],
    [filterTimeStartVal, filterTimeEndVal],
  );
  const levelRangeValue = useMemo<[number, number]>(
    () => [filterLevelMinVal, filterLevelMaxVal],
    [filterLevelMinVal, filterLevelMaxVal],
  );

  const findFilterState = useMemo<FindFilterState>(
    () => ({
      filterAvailableSlots: filterAvailableSlotsVal,
      filterSuitableRating: filterSuitableRatingVal,
      hideBarGames: hideBarGamesVal,
      gameFilter: gameFilterVal,
      trainingFilter: trainingFilterVal,
      tournamentFilter: tournamentFilterVal,
      leaguesFilter: leaguesFilterVal,
      eventsFilter: eventsFilterVal,
      showPrivateGames: showPrivateGamesVal,
      findDiscoveryEnabled,
      filterNoRating: filterNoRatingVal,
      panel: panelFilterState,
    }),
    [
      filterAvailableSlotsVal,
      filterSuitableRatingVal,
      hideBarGamesVal,
      gameFilterVal,
      trainingFilterVal,
      tournamentFilterVal,
      leaguesFilterVal,
      eventsFilterVal,
      showPrivateGamesVal,
      findDiscoveryEnabled,
      filterNoRatingVal,
      panelFilterState,
    ],
  );

  const filteredGames = useMemo(() => {
    const cityTimezone = resolveViewerCityTimezone(user?.currentCity?.timezone);
    if (findViewMode === 'calendar') {
      const dayScoped = selectedDayGames != null;
      return filterFindGames(
        dayScoped ? selectedDayGames : availableGames,
        resolveFindFilterViewer(user, isAdmin),
        findFilterState,
        {
          mode: 'calendar',
          // Always day-cut: BE calendar used to OR-bypass LEAGUE_SEASON past the range,
          // and day-scoped responses must not skip that client safety net.
          selectedDay: selectedDate,
          cityTimezone,
        },
      );
    }
    return filterFindGames(
      availableGames,
      resolveFindFilterViewer(user, isAdmin),
      findFilterState,
      {
        mode: 'list',
        listFromToday: true,
        cityTimezone,
      },
    );
  }, [availableGames, selectedDayGames, user, isAdmin, findFilterState, findViewMode, selectedDate]);
  const findFilterSport = filterSportVal;
  const findSportTabs = useMemo<SegmentedSwitchTab[]>(() => {
    const enabledSports = listEnabledSports(user);
    if (enabledSports.length <= 1) return [];
    const sortedSports = [...enabledSports].sort((a, b) => {
      if (a === viewerPrimarySport) return -1;
      if (b === viewerPrimarySport) return 1;
      return 0;
    });
    const tabs: SegmentedSwitchTab[] = sortedSports.map((sport) => {
      const isPrimary = sport === viewerPrimarySport;
      return {
        id: isPrimary ? 'primary' : sport,
        label: t(getSportConfig(sport).labelKey),
        icon: () =>
          isPrimary ? (
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              <SportPublicIcon sport={sport} className="h-5 w-5 object-contain" />
              <Star
                size={10}
                className="absolute -left-1 -top-1 text-amber-500 fill-amber-500"
              />
            </span>
          ) : (
            <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />
          ),
      };
    });
    tabs.push({
      id: 'all',
      label: t('common.all', { defaultValue: 'All' }),
      icon: Grid3X3,
    });
    return tabs;
  }, [t, user, viewerPrimarySport]);

  const handleSubscriptionsClick = useCallback(() => {
    setIsAnimating(true);
    navigate('/game-subscriptions', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  }, [navigate, setIsAnimating]);

  const filterBlock = (
    <>
      <AnimatedMount layout>
        <GenderPromptBanner />
      </AnimatedMount>
      <AnimatedMount layout>
        <CityPromptBanner />
      </AnimatedMount>
      {findSportTabs.length > 0 && (
        <AnimatedMount layout className="mb-3 flex justify-center">
          <SegmentedSwitch
            tabs={findSportTabs}
            activeId={filterSportVal}
            onChange={setFilterSportVal as (id: string) => void}
            showOnlyActiveTabText={true}
            layoutId="find-sport-selector"
            ariaLabel={t('sport.sport', { defaultValue: 'Sport' })}
          />
        </AnimatedMount>
      )}
      <div className="mb-4">
      <AnimatePresence initial={false}>
        {!filtersPanelOpenVal && panelFiltersApplied && (
          <motion.div
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="max-w-md mx-auto mb-3 overflow-hidden rounded-xl"
          >
            <div className="rounded-xl border border-gray-200/90 bg-white px-3 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800"
                  aria-hidden
                >
                  <Filter size={16} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                    {t('games.filtersActiveCollapsedHint')}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      onClick={resetPanelFilters}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      <RotateCcw size={14} className="shrink-0" aria-hidden />
                      {t('games.resetFilters')}
                    </button>
                    <button
                      type="button"
                      onClick={toggleFiltersPanel}
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {t('games.changeFilters')}
                      <ChevronRight size={16} className="shrink-0" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {filtersPanelOpenVal && (
          <motion.div
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="max-w-md mx-auto overflow-hidden mb-3"
          >
            <div className="pb-1">
              <FiltersPanel
                cityId={user?.currentCity?.id}
                filterAvailableSlots={filterAvailableSlotsVal}
                onFilterAvailableSlotsChange={setFilterAvailableSlotsVal}
                filterSuitableRating={filterSuitableRatingVal}
                onFilterSuitableRatingChange={setFilterSuitableRatingVal}
                hideBarGames={hideBarGamesVal}
                onHideBarGamesChange={setHideBarGamesVal}
                filterSport={filterSportVal}
                viewerPrimarySport={viewerPrimarySport}
                clubIds={filterClubIdsVal}
                onClubIdsChange={setFilterClubIdsVal}
                timeRange={timeRangeValue}
                onTimeRangeChange={setTimeRangeVal}
                playerLevelRange={levelRangeValue}
                onPlayerLevelRangeChange={setLevelRangeVal}
                hour12={displaySettings.hour12}
                onResetFilters={resetPanelFilters}
                showResetFooter={panelFiltersApplied}
                showDiscoveryFilters={findDiscoveryEnabled}
                filterNoRating={filterNoRatingVal}
                onFilterNoRatingChange={setFilterNoRatingVal}
                isAdmin={isAdmin}
                showPrivateGames={showPrivateGamesVal}
                onShowPrivateGamesChange={setShowPrivateGamesVal}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <EntityFilterChips
        gameActive={gameFilterVal}
        tournamentActive={tournamentFilterVal}
        trainingActive={trainingFilterVal}
        leaguesActive={leaguesFilterVal}
        eventsActive={eventsFilterVal}
        onToggle={handleEntityFilterClick}
      />
      </div>
    </>
  );

  const favoriteTrainerName = usePlayersStore((state) => {
    if (!trainingFilterVal || !user?.favoriteTrainerId) return null;
    const trainer = state.users[user.favoriteTrainerId];
    if (!trainer) return null;
    return formatTrainerDisplayName(trainer.firstName, trainer.lastName);
  });

  const emptyMessage = useMemo(
    () =>
      resolveFindEmptyMessage({
        gameFilterVal,
        trainingFilterVal,
        tournamentFilterVal,
        leaguesFilterVal,
        eventsFilterVal,
        favoriteTrainerName,
        t,
      }),
    [gameFilterVal, trainingFilterVal, tournamentFilterVal, leaguesFilterVal, eventsFilterVal, favoriteTrainerName, t],
  );

  const gamesList = (
    <AnimatedGameList
      items={filteredGames}
      getKey={getGameId}
      // Tapping another day replaces the whole set, so the presence context is
      // rebuilt rather than cross-fading two full lists of cards.
      presenceKey={findSelectedDay ?? undefined}
      renderItem={(game) => (
        <GameCard
          game={game}
          user={user}
          showJoinButton={true}
          onJoin={onJoin}
          onNoteSaved={onNoteSaved}
          findFilterSport={findFilterSport}
        />
      )}
    />
  );

  // Calendar: `selectedDayGames == null` means day authority not ready yet.
  // A settled empty array must not stay on the skeleton (e.g. month index still in flight).
  const initialGamesLoading = Boolean(
    findViewMode === 'calendar'
      ? loading && selectedDayGames == null
      : loading && availableGames.length === 0,
  );

  const findListCollapsed = findViewMode === 'list';
  const handleFindListToggle = useCallback(() => {
    const next = findViewMode === 'list' ? 'calendar' : 'list';
    setFindViewMode(next);
    navigationService.navigateToFind({ view: next });
  }, [findViewMode, setFindViewMode]);

  // Memoised so the calendar — 42 cells plus weather and day aggregation — is
  // skipped by `memo` when this section re-renders for an unrelated reason.
  const upcomingsToggle = useMemo(
    () => ({
      active: findListCollapsed,
      onClick: handleFindListToggle,
      label: t('games.list'),
    }),
    [findListCollapsed, handleFindListToggle, t],
  );

  const calendarSectionProps = useMemo(
    () => ({
      selectedDate,
      onDateSelect: handleDateSelect,
      availableGames,
      dayIndex,
      filterAvailableSlots: filterAvailableSlotsVal,
      filterSuitableRating: filterSuitableRatingVal,
      hideBarGames: hideBarGamesVal,
      gameFilter: gameFilterVal,
      trainingFilter: trainingFilterVal,
      tournamentFilter: tournamentFilterVal,
      leaguesFilter: leaguesFilterVal,
      eventsFilter: eventsFilterVal,
      favoriteTrainerId: user?.favoriteTrainerId as string | null | undefined,
      onMonthChange,
      onDateRangeChange,
      panelFilters: panelFilterState,
      showPrivateGames: showPrivateGamesVal,
      isAdmin,
      findDiscoveryEnabled,
      filterNoRating: filterNoRatingVal,
      collapsed: findListCollapsed,
      weatherModeScope: 'find' as const,
      upcomingsToggle,
    }),
    [
      selectedDate, handleDateSelect, availableGames, dayIndex, filterAvailableSlotsVal,
      filterSuitableRatingVal, hideBarGamesVal, gameFilterVal, trainingFilterVal,
      tournamentFilterVal, leaguesFilterVal, eventsFilterVal, user?.favoriteTrainerId,
      onMonthChange, onDateRangeChange, panelFilterState, showPrivateGamesVal, isAdmin,
      findDiscoveryEnabled, filterNoRatingVal, findListCollapsed, upcomingsToggle,
    ],
  );

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMoreAvailable || loadingMore) return;
    setLoadingMore(true);
    try {
      await onLoadMoreAvailable();
    } finally {
      setLoadingMore(false);
    }
  }, [onLoadMoreAvailable, loadingMore]);

  const loadMoreFooter =
    hasMoreAvailable && onLoadMoreAvailable ? (
      <div className="mt-3 flex flex-col items-center gap-2 px-1">
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {t('games.availableBoundHint', {
            defaultValue: 'Showing up to {{bound}} games per request in busy cities.',
            bound: availableBound,
          })}
        </p>
        <button
          type="button"
          onClick={() => void handleLoadMore()}
          disabled={loadingMore}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
        >
          {loadingMore
            ? t('common.loading', { defaultValue: 'Loading…' })
            : t('games.loadMore', { defaultValue: 'Load more games' })}
        </button>
      </div>
    ) : null;

  const cityEventsRail = (
    <AnimatedMount layout show={!eventsFilterVal && upcomingCityEvents.length > 0}>
      <FindCityEventsRail events={upcomingCityEvents} onSeeAll={handleSeeAllEvents} />
    </AnimatedMount>
  );

  const gamesContent = (
    <AnimatedLoadingSwap
      isLoading={initialGamesLoading}
      loading={<GamesLoadingSkeleton />}
    >
      {filteredGames.length === 0 ? (
        dayLoadError && onRetryDay && findViewMode === 'calendar' ? (
          <FindDayLoadErrorEmpty onRetry={onRetryDay} />
        ) : (
          <>
            <EmptyStateCard icon={SearchX} title={emptyMessage} />
            {loadMoreFooter}
          </>
        )
      ) : findViewMode === 'list' ? (
        <>
          <GamesByDateList
            games={filteredGames}
            user={user}
            onJoin={onJoin}
            onNoteSaved={onNoteSaved}
            findFilterSport={findFilterSport}
          />
          {loadMoreFooter}
        </>
      ) : (
        <>
          {gamesList}
          {loadMoreFooter}
        </>
      )}
    </AnimatedLoadingSwap>
  );

  const scrollBottomPadding = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  if (splitView && findViewMode === 'calendar') {
    return (
      <SportLevelProvider sport={findLevelSport}>
      <div className="fixed inset-x-0 bottom-0 overflow-hidden z-0" style={{ top: 'calc(var(--app-header-height, 4rem) + env(safe-area-inset-top, 0px))' }}>
        <ResizableSplitter
          defaultLeftWidth={35}
          minLeftWidth={300}
          maxLeftWidth={500}
          leftPanel={
            <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-700">
              <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                <TabContentStack id="find-split-left">
                  {filterBlock}
                  <AnimatedMount layout show={trainingFilterVal}>
                    <TrainersList show={trainingFilterVal} availableGames={selectedDayGames ?? availableGames} levelSport={findLevelSport} />
                  </AnimatedMount>
                  <AnimatedMount layout>
                    <CalendarSection {...calendarSectionProps} />
                  </AnimatedMount>
                </TabContentStack>
              </div>
            </div>
          }
          rightPanel={
            <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
              <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                <TabContentStack id="find-split-right">
                  {cityEventsRail}
                  <AnimatedMount>{gamesContent}</AnimatedMount>
                  <AnimatedMount>
                    <SubscriptionsNudgeButton onClick={handleSubscriptionsClick} />
                  </AnimatedMount>
                </TabContentStack>
              </div>
            </div>
          }
        />
      </div>
      </SportLevelProvider>
    );
  }

  return (
    <SportLevelProvider sport={findLevelSport}>
    <TabContentStack className="mt-2" id="find-tab-stack">
      {filterBlock}
      <AnimatedMount layout show={trainingFilterVal}>
        <TrainersList show={trainingFilterVal} availableGames={selectedDayGames ?? availableGames} levelSport={findLevelSport} />
      </AnimatedMount>

      <AnimatedMount layout>
        <CalendarSection {...calendarSectionProps} />
      </AnimatedMount>

      {cityEventsRail}

      <AnimatedMount>{gamesContent}</AnimatedMount>

      <AnimatedMount>
        <SubscriptionsNudgeButton onClick={handleSubscriptionsClick} />
      </AnimatedMount>
    </TabContentStack>
    </SportLevelProvider>
  );
};

/**
 * FindTab re-renders whenever any of its queries, stores or prefetch bookkeeping
 * ticks. This section owns the calendar, filter panel and card list, so it is
 * memoised and FindTab hands it a memoised props object.
 */
export const AvailableGamesSection = memo(AvailableGamesSectionView);
