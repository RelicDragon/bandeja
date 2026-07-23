import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { FiltersPanel } from './FiltersPanel';
import { AnimatedGameList } from './AnimatedGameList';
import { AnimatedLoadingSwap } from '@/components/motion/AnimatedLoadingSwap';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { TabContentStack } from '@/components/motion/TabContentStack';
import { EmptyStateCard } from './EmptyStateCard';
import { GamesLoadingSkeleton } from './GameCardSkeleton';
import { EntityFilterChips } from './EntityFilterChips';
import { SubscriptionsNudgeButton } from './SubscriptionsNudgeButton';
import { GamesByDateList } from './GamesByDateList';
import { navigationService } from '@/services/navigationService';
import { getViewerPrimarySport, resolveFindLevelFilterSport } from '@/utils/findSportFilter';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { listEnabledSports } from '@/utils/profileSports';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { isFindDiscoveryEnabled } from '@/utils/findDiscovery';
import { filterFindGames, resolveFindFilterViewer, type FindFilterState } from '@/utils/findFilter';
import type { FindDayIndexRow } from '@/utils/findDayIndexCounts';
import { usePlayersStore } from '@/store/playersStore';
import { formatTrainerDisplayName, resolveFindEmptyMessage } from './findTrainerEmptyMessage';

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
  filters?: GameFilters;
  onFilterChange?: (key: keyof GameFilters, value: any) => void;
  onFiltersChange?: (updates: Partial<GameFilters>) => void;
  onNoteSaved?: (gameId: string) => void;
  splitView?: boolean;
  hasMoreAvailable?: boolean;
  onLoadMoreAvailable?: () => void | Promise<void>;
  availableBound?: number;
}

export const AvailableGamesSection = ({
  availableGames,
  selectedDayGames,
  dayIndex,
  user,
  loading,
  onJoin,
  onMonthChange,
  onDateRangeChange,
  filters: externalFilters,
  onFilterChange,
  onFiltersChange,
  onNoteSaved,
  splitView = false,
  hasMoreAvailable = false,
  onLoadMoreAvailable,
  availableBound = 300,
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loadingMore, setLoadingMore] = useState(false);
  const players = usePlayersStore((state) => state.users);
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
  const [filterAvailableSlots, setFilterAvailableSlots] = useState(false);
  const [filterSuitableRating, setFilterSuitableRating] = useState(false);
  const [hideBarGames, setHideBarGames] = useState(false);
  const [gameFilter, setGameFilter] = useState(false);
  const [trainingFilter, setTrainingFilter] = useState(false);
  const [tournamentFilter, setTournamentFilter] = useState(false);
  const [leaguesFilter, setLeaguesFilter] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [filterClubIds, setFilterClubIds] = useState<string[]>([]);
  const [filterTimeStart, setFilterTimeStart] = useState('00:00');
  const [filterTimeEnd, setFilterTimeEnd] = useState('24:00');
  const [filterLevelMin, setFilterLevelMin] = useState(1.0);
  const [filterLevelMax, setFilterLevelMax] = useState(7.0);
  const [filterSport, setFilterSport] = useState<FindSportFilterValue>('primary');
  const [filterNoRating, setFilterNoRating] = useState(false);
  const [showPrivateGames, setShowPrivateGames] = useState(false);

  const filterAvailableSlotsVal = externalFilters?.filterAvailableSlots ?? filterAvailableSlots;
  const filterSuitableRatingVal = externalFilters?.filterSuitableRating ?? filterSuitableRating;
  const hideBarGamesVal = externalFilters?.hideBarGames ?? hideBarGames;
  const gameFilterVal = externalFilters?.gameFilter ?? gameFilter;
  const trainingFilterVal = externalFilters?.trainingFilter ?? trainingFilter;
  const tournamentFilterVal = externalFilters?.tournamentFilter ?? tournamentFilter;
  const leaguesFilterVal = externalFilters?.leaguesFilter ?? leaguesFilter;
  const filtersPanelOpenVal = externalFilters?.filtersPanelOpen ?? filtersPanelOpen;
  const filterClubIdsVal = externalFilters?.filterClubIds ?? filterClubIds;
  const filterTimeStartVal = externalFilters?.filterTimeStart ?? filterTimeStart;
  const filterTimeEndVal = externalFilters?.filterTimeEnd ?? filterTimeEnd;
  const filterLevelMinVal = externalFilters?.filterLevelMin ?? filterLevelMin;
  const filterLevelMaxVal = externalFilters?.filterLevelMax ?? filterLevelMax;
  const filterSportVal = externalFilters?.filterSport ?? filterSport;
  const filterNoRatingVal = externalFilters?.filterNoRating ?? filterNoRating;
  const showPrivateGamesVal = externalFilters?.showPrivateGames ?? showPrivateGames;
  const findDiscoveryEnabled = isFindDiscoveryEnabled();
  const isAdmin = Boolean(user?.isAdmin);
  const viewerPrimarySport = useMemo(() => getViewerPrimarySport(user), [user]);
  const findLevelSport = useMemo(
    () => resolveFindLevelFilterSport(filterSportVal, viewerPrimarySport),
    [filterSportVal, viewerPrimarySport],
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

  const setFilterAvailableSlotsVal = (v: boolean) =>
    onFilterChange ? onFilterChange('filterAvailableSlots', v) : setFilterAvailableSlots(v);
  const setFilterSuitableRatingVal = (v: boolean) =>
    onFilterChange ? onFilterChange('filterSuitableRating', v) : setFilterSuitableRating(v);
  const setHideBarGamesVal = (v: boolean) =>
    onFilterChange ? onFilterChange('hideBarGames', v) : setHideBarGames(v);
  const setShowPrivateGamesVal = (v: boolean) =>
    onFilterChange ? onFilterChange('showPrivateGames', v) : setShowPrivateGames(v);

  const resetPanelFilters = () => {
    if (onFiltersChange) {
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
    } else {
      setFilterAvailableSlots(false);
      setFilterSuitableRating(false);
      setHideBarGames(false);
      setFilterClubIds([]);
      setFilterTimeStart('00:00');
      setFilterTimeEnd('24:00');
      setFilterLevelMin(1.0);
      setFilterLevelMax(7.0);
      setFilterNoRating(false);
      setShowPrivateGames(false);
    }
    if (onFilterChange && !onFiltersChange) {
      onFilterChange('filterAvailableSlots', false);
      onFilterChange('filterSuitableRating', false);
      onFilterChange('hideBarGames', false);
    }
  };

  const patchPanelFields = (updates: Partial<GameFilters>) => {
    if (onFiltersChange) onFiltersChange(updates);
    else {
      if (updates.filterClubIds !== undefined) setFilterClubIds(updates.filterClubIds);
      if (updates.filterTimeStart !== undefined) setFilterTimeStart(updates.filterTimeStart);
      if (updates.filterTimeEnd !== undefined) setFilterTimeEnd(updates.filterTimeEnd);
      if (updates.filterLevelMin !== undefined) setFilterLevelMin(updates.filterLevelMin);
      if (updates.filterLevelMax !== undefined) setFilterLevelMax(updates.filterLevelMax);
      if (updates.filterSport !== undefined) setFilterSport(updates.filterSport);
      if (updates.filterNoRating !== undefined) setFilterNoRating(updates.filterNoRating);
      if (updates.filterAvailableSlots !== undefined) setFilterAvailableSlots(updates.filterAvailableSlots);
      if (updates.filterSuitableRating !== undefined) setFilterSuitableRating(updates.filterSuitableRating);
      if (updates.hideBarGames !== undefined) setHideBarGames(updates.hideBarGames);
    }
  };

  const toggleFiltersPanel = () => {
    if (filtersPanelOpenVal) {
      if (onFiltersChange) {
        onFiltersChange({ filtersPanelOpen: false });
      } else {
        setFiltersPanelOpen(false);
      }
    } else if (onFiltersChange) {
      onFiltersChange({ filtersPanelOpen: true });
    } else {
      setFiltersPanelOpen(true);
    }
  };

  const setEntityFilters = (game: boolean, training: boolean, tournament: boolean, leagues: boolean) => {
    if (onFiltersChange) {
      onFiltersChange({ gameFilter: game, trainingFilter: training, tournamentFilter: tournament, leaguesFilter: leagues });
    } else {
      setGameFilter(game);
      setTrainingFilter(training);
      setTournamentFilter(tournament);
      setLeaguesFilter(leagues);
    }
  };

  const handleEntityFilterClick = (type: 'game' | 'training' | 'tournament' | 'leagues') => {
    if (type === 'game') {
      setEntityFilters(!gameFilterVal, false, false, false);
    } else if (type === 'training') {
      setEntityFilters(false, !trainingFilterVal, false, false);
    } else if (type === 'tournament') {
      setEntityFilters(false, false, !tournamentFilterVal, false);
    } else {
      setEntityFilters(false, false, false, !leaguesFilterVal);
    }
  };
  const hydratedViewPeriodFromStorageRef = useRef(false);

  useEffect(() => {
    if (externalFilters) {
      setIsInitialized(true);
      return;
    }

    const loadFilters = async () => {
      const filters = await getGameFilters();
      if (!externalFilters) {
        setFilterAvailableSlots(filters.filterAvailableSlots ?? filters.userFilter ?? false);
        setFilterSuitableRating(filters.filterSuitableRating ?? filters.userFilter ?? false);
        setHideBarGames(filters.hideBarGames ?? false);
        setGameFilter(filters.gameFilter ?? false);
        setTrainingFilter(filters.trainingFilter);
        setTournamentFilter(filters.tournamentFilter ?? false);
        setLeaguesFilter(filters.leaguesFilter ?? false);
        setFiltersPanelOpen(filters.filtersPanelOpen ?? false);
        setFilterClubIds(filters.filterClubIds ?? []);
        setFilterTimeStart(filters.filterTimeStart ?? '00:00');
        setFilterTimeEnd(filters.filterTimeEnd ?? '24:00');
        setFilterLevelMin(filters.filterLevelMin ?? 1.0);
        setFilterLevelMax(filters.filterLevelMax ?? 7.0);
        setFilterSport(filters.filterSport ?? 'primary');
        setFilterNoRating(filters.filterNoRating ?? false);
        setShowPrivateGames(filters.showPrivateGames ?? false);
      }
      if (!hydratedViewPeriodFromStorageRef.current) {
        hydratedViewPeriodFromStorageRef.current = true;
        if (filters.activeTab) {
          setFindViewMode(filters.activeTab);
        }
        const nav = useShellNavStore.getState();
        if (filters.calendarSelectedDate && nav.findSelectedDay == null) {
          const restoredDate = new Date(filters.calendarSelectedDate);
          if (!isNaN(restoredDate.getTime())) {
            nav.setFindSelectedDay(format(startOfDay(restoredDate), 'yyyy-MM-dd'));
          }
        }
      }

      setIsInitialized(true);
    };
    loadFilters();
  }, [setFindViewMode, externalFilters]);

  useEffect(() => {
    if (!isInitialized || onFilterChange) return;

    const saveFilters = async () => {
      await setGameFilters({
        filterAvailableSlots: filterAvailableSlotsVal,
        filterSuitableRating: filterSuitableRatingVal,
        hideBarGames: hideBarGamesVal,
        gameFilter: gameFilterVal,
        trainingFilter: trainingFilterVal,
        tournamentFilter: tournamentFilterVal,
        leaguesFilter: leaguesFilterVal,
        activeTab: findViewMode,
        listViewStartDate: undefined,
        calendarSelectedDate: findViewMode === 'calendar' ? selectedDate.toISOString() : undefined,
        filtersPanelOpen: filtersPanelOpenVal,
        filterClubIds: filterClubIdsVal,
        filterTimeStart: filterTimeStartVal,
        filterTimeEnd: filterTimeEndVal,
        filterLevelMin: filterLevelMinVal,
        filterLevelMax: filterLevelMaxVal,
        filterSport: filterSportVal,
        filterNoRating: filterNoRatingVal,
        showPrivateGames: showPrivateGamesVal,
      });
    };
    saveFilters();
  }, [
    isInitialized,
    onFilterChange,
    filterAvailableSlotsVal,
    filterSuitableRatingVal,
    hideBarGamesVal,
    gameFilterVal,
    trainingFilterVal,
    tournamentFilterVal,
    leaguesFilterVal,
    findViewMode,
    selectedDate,
    filtersPanelOpenVal,
    filterClubIdsVal,
    filterTimeStartVal,
    filterTimeEndVal,
    filterLevelMinVal,
    filterLevelMaxVal,
    filterSportVal,
    filterNoRatingVal,
    showPrivateGamesVal,
  ]);

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

  const findFilterState = useMemo<FindFilterState>(
    () => ({
      filterAvailableSlots: filterAvailableSlotsVal,
      filterSuitableRating: filterSuitableRatingVal,
      hideBarGames: hideBarGamesVal,
      gameFilter: gameFilterVal,
      trainingFilter: trainingFilterVal,
      tournamentFilter: tournamentFilterVal,
      leaguesFilter: leaguesFilterVal,
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

  const handleSubscriptionsClick = () => {
    setIsAnimating(true);
    navigate('/game-subscriptions', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

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
            onChange={(id) => patchPanelFields({ filterSport: id as FindSportFilterValue })}
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
                onClubIdsChange={(ids) => patchPanelFields({ filterClubIds: ids })}
                timeRange={[filterTimeStartVal, filterTimeEndVal]}
                onTimeRangeChange={(v) => patchPanelFields({ filterTimeStart: v[0], filterTimeEnd: v[1] })}
                playerLevelRange={[filterLevelMinVal, filterLevelMaxVal]}
                onPlayerLevelRangeChange={(v) => patchPanelFields({ filterLevelMin: v[0], filterLevelMax: v[1] })}
                hour12={displaySettings.hour12}
                onResetFilters={resetPanelFilters}
                showResetFooter={panelFiltersApplied}
                showDiscoveryFilters={findDiscoveryEnabled}
                filterNoRating={filterNoRatingVal}
                onFilterNoRatingChange={(v) => patchPanelFields({ filterNoRating: v })}
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
        onToggle={handleEntityFilterClick}
      />
      </div>
    </>
  );

  const favoriteTrainerName = useMemo(() => {
    if (!trainingFilterVal || !user?.favoriteTrainerId) return null;
    const trainer = players[user.favoriteTrainerId];
    if (!trainer) return null;
    return formatTrainerDisplayName(trainer.firstName, trainer.lastName);
  }, [trainingFilterVal, user?.favoriteTrainerId, players]);

  const emptyMessage = useMemo(
    () =>
      resolveFindEmptyMessage({
        gameFilterVal,
        trainingFilterVal,
        tournamentFilterVal,
        leaguesFilterVal,
        favoriteTrainerName,
        t,
      }),
    [gameFilterVal, trainingFilterVal, tournamentFilterVal, leaguesFilterVal, favoriteTrainerName, t],
  );

  const gamesList = (
    <AnimatedGameList
      items={filteredGames}
      getKey={(game) => game.id}
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

  const initialGamesLoading = Boolean(
    loading &&
      (findViewMode === 'calendar'
        ? (selectedDayGames ?? availableGames).length === 0
        : availableGames.length === 0),
  );

  const findListCollapsed = findViewMode === 'list';
  const handleFindListToggle = useCallback(() => {
    const next = findViewMode === 'list' ? 'calendar' : 'list';
    setFindViewMode(next);
    navigationService.navigateToFind({ view: next });
  }, [findViewMode, setFindViewMode]);

  const calendarSectionProps = {
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
    favoriteTrainerId: user?.favoriteTrainerId,
    onMonthChange,
    onDateRangeChange,
    panelFilters: panelFilterState,
    showPrivateGames: showPrivateGamesVal,
    isAdmin,
    findDiscoveryEnabled,
    filterNoRating: filterNoRatingVal,
    collapsed: findListCollapsed,
    weatherModeScope: 'find' as const,
    upcomingsToggle: {
      active: findListCollapsed,
      onClick: handleFindListToggle,
      label: t('games.list'),
    },
  };

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

  const gamesContent = (
    <AnimatedLoadingSwap
      isLoading={initialGamesLoading}
      loading={<GamesLoadingSkeleton />}
    >
      {filteredGames.length === 0 ? (
        <>
          <EmptyStateCard icon={SearchX} title={emptyMessage} />
          {loadMoreFooter}
        </>
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
      <div className="fixed inset-x-0 bottom-0 overflow-hidden z-0" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <ResizableSplitter
          defaultLeftWidth={35}
          minLeftWidth={300}
          maxLeftWidth={500}
          leftPanel={
            <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
              <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                <TabContentStack id="find-split-left">
                  {filterBlock}
                  <AnimatedMount layout show={trainingFilterVal}>
                    <TrainersList show={trainingFilterVal} availableGames={availableGames} levelSport={findLevelSport} />
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
        <TrainersList show={trainingFilterVal} availableGames={availableGames} levelSport={findLevelSport} />
      </AnimatedMount>

      <AnimatedMount layout>
        <CalendarSection {...calendarSectionProps} />
      </AnimatedMount>

      <AnimatedMount>{gamesContent}</AnimatedMount>

      <AnimatedMount>
        <SubscriptionsNudgeButton onClick={handleSubscriptionsClick} />
      </AnimatedMount>
    </TabContentStack>
    </SportLevelProvider>
  );
};
