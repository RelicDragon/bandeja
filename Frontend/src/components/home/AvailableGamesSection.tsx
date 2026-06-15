import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GameCard } from '@/components';
import { Game } from '@/types';
import { Filter, ChevronRight, RotateCcw, Grid3X3, Star, SearchX } from 'lucide-react';
import { useShellNavStore } from '@/store/shellNavStore';
import { useHeaderStore } from '@/store/headerStore';
import { format, parse, startOfDay, addDays, subDays, startOfWeek } from 'date-fns';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { MonthCalendar } from '@/components/MonthCalendar';
import { SelectedDateHeading } from '@/components/SelectedDateHeading';
import { TrainersList } from './TrainersList';
import { GenderPromptBanner } from './GenderPromptBanner';
import { CityPromptBanner } from './CityPromptBanner';
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { FiltersPanel } from './FiltersPanel';
import { AnimatedGameList } from './AnimatedGameList';
import { EmptyStateCard } from './EmptyStateCard';
import { GamesLoadingSkeleton } from './GameCardSkeleton';
import { EntityFilterChips } from './EntityFilterChips';
import { WeekRangeNavigator } from './WeekRangeNavigator';
import { SubscriptionsNudgeButton } from './SubscriptionsNudgeButton';
import { passesAvailableGamePanelFilters } from '@/utils/availableGamePanelFilters';
import { parseGameSport } from '@/utils/gameSport';
import { getViewerPrimarySport, resolveFindLevelFilterSport } from '@/utils/findSportFilter';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { getDisplayLevelForSport, listEnabledSports } from '@/utils/profileSports';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import {
  isFindDiscoveryEnabled,
  passesFindNoRatingFilter,
  passesFindTierFilter,
} from '@/utils/findDiscovery';
import { filterGamesForCalendarDay } from '@/utils/calendarSelectedDayFilter';

interface AvailableGamesSectionProps {
  availableGames: Game[];
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
}

export const AvailableGamesSection = ({
  availableGames,
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
}: AvailableGamesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const findViewMode = useShellNavStore((s) => s.findViewMode);
  const requestFindGoToCurrent = useShellNavStore((s) => s.requestFindGoToCurrent);
  const setIsAnimating = useShellNavStore((s) => s.setIsAnimating);
  const setFindViewMode = useShellNavStore((s) => s.setFindViewMode);
  const setRequestFindGoToCurrent = useShellNavStore((s) => s.setRequestFindGoToCurrent);
  const findSelectedDay = useShellNavStore((s) => s.findSelectedDay);
  const findListWeekStartDay = useShellNavStore((s) => s.findListWeekStartDay);
  const setFindSelectedDay = useShellNavStore((s) => s.setFindSelectedDay);
  const setFindListWeekStartDay = useShellNavStore((s) => s.setFindListWeekStartDay);
  const setCreateGameInitialDate = useHeaderStore((s) => s.setCreateGameInitialDate);
  const selectedDate = useMemo(() => {
    if (findSelectedDay) {
      const d = parse(findSelectedDay, 'yyyy-MM-dd', new Date());
      return isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
    }
    return startOfDay(new Date());
  }, [findSelectedDay]);
  const listViewStartDate = useMemo(() => {
    if (findListWeekStartDay) {
      const d = parse(findListWeekStartDay, 'yyyy-MM-dd', new Date());
      return isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d);
    }
    return startOfDay(new Date());
  }, [findListWeekStartDay]);
  const [userFilter, setUserFilter] = useState(false);
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
  const [filterTier, setFilterTier] = useState<'social' | 'match' | undefined>(undefined);
  const [filterNoRating, setFilterNoRating] = useState(false);
  const [showPrivateGames, setShowPrivateGames] = useState(false);

  const userFilterVal = externalFilters?.userFilter ?? userFilter;
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
  const filterTierVal = externalFilters?.filterTier ?? filterTier;
  const filterNoRatingVal = externalFilters?.filterNoRating ?? filterNoRating;
  const showPrivateGamesVal = externalFilters?.showPrivateGames ?? showPrivateGames;
  const findDiscoveryEnabled = useMemo(() => isFindDiscoveryEnabled(user), [user]);
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
      (findDiscoveryEnabled && filterTierVal != null) ||
      (findDiscoveryEnabled && filterNoRatingVal) ||
      (isAdmin && showPrivateGamesVal)
    );
  }, [
    filterClubIdsVal,
    filterTimeStartVal,
    filterTimeEndVal,
    filterLevelMinVal,
    filterLevelMaxVal,
    findDiscoveryEnabled,
    filterTierVal,
    filterNoRatingVal,
    isAdmin,
    showPrivateGamesVal,
  ]);

  const panelFiltersApplied = userFilterVal || panelCriteriaActive;

  const setUserFilterVal = (v: boolean) => (onFilterChange ? onFilterChange('userFilter', v) : setUserFilter(v));
  const setShowPrivateGamesVal = (v: boolean) =>
    onFilterChange ? onFilterChange('showPrivateGames', v) : setShowPrivateGames(v);

  const resetPanelFilters = () => {
    if (onFiltersChange) {
      onFiltersChange({
        userFilter: false,
        filterClubIds: [],
        filterTimeStart: '00:00',
        filterTimeEnd: '24:00',
        filterLevelMin: 1.0,
        filterLevelMax: 7.0,
        filterTier: undefined,
        filterNoRating: false,
        showPrivateGames: false,
      });
    } else {
      setUserFilter(false);
      setFilterClubIds([]);
      setFilterTimeStart('00:00');
      setFilterTimeEnd('24:00');
      setFilterLevelMin(1.0);
      setFilterLevelMax(7.0);
      setFilterTier(undefined);
      setFilterNoRating(false);
      setShowPrivateGames(false);
    }
    if (onFilterChange && !onFiltersChange) {
      onFilterChange('userFilter', false);
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
      if ('filterTier' in updates) setFilterTier(updates.filterTier);
      if (updates.filterNoRating !== undefined) setFilterNoRating(updates.filterNoRating);
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
  const lastDateRangeRef = useRef<{ start: string; end: string } | null>(null);
  const hydratedViewPeriodFromStorageRef = useRef(false);

  useEffect(() => {
    if (externalFilters) {
      setIsInitialized(true);
      return;
    }

    const loadFilters = async () => {
      const filters = await getGameFilters();
      if (!externalFilters) {
        setUserFilter(filters.userFilter);
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
        setFilterTier(filters.filterTier);
        setFilterNoRating(filters.filterNoRating ?? false);
        setShowPrivateGames(filters.showPrivateGames ?? false);
      }
      if (!hydratedViewPeriodFromStorageRef.current) {
        hydratedViewPeriodFromStorageRef.current = true;
        if (filters.activeTab) {
          setFindViewMode(filters.activeTab);
        }
        const nav = useShellNavStore.getState();
        if (filters.listViewStartDate && nav.findListWeekStartDay == null) {
          const restoredDate = new Date(filters.listViewStartDate);
          if (!isNaN(restoredDate.getTime())) {
            nav.setFindListWeekStartDay(format(startOfDay(restoredDate), 'yyyy-MM-dd'));
          }
        }
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
        userFilter: userFilterVal,
        gameFilter: gameFilterVal,
        trainingFilter: trainingFilterVal,
        tournamentFilter: tournamentFilterVal,
        leaguesFilter: leaguesFilterVal,
        activeTab: findViewMode,
        listViewStartDate: findViewMode === 'list' ? listViewStartDate.toISOString() : undefined,
        calendarSelectedDate: findViewMode === 'calendar' ? selectedDate.toISOString() : undefined,
        filtersPanelOpen: filtersPanelOpenVal,
        filterClubIds: filterClubIdsVal,
        filterTimeStart: filterTimeStartVal,
        filterTimeEnd: filterTimeEndVal,
        filterLevelMin: filterLevelMinVal,
        filterLevelMax: filterLevelMaxVal,
        filterSport: filterSportVal,
        filterTier: filterTierVal,
        filterNoRating: filterNoRatingVal,
        showPrivateGames: showPrivateGamesVal,
      });
    };
    saveFilters();
  }, [
    isInitialized,
    onFilterChange,
    userFilterVal,
    gameFilterVal,
    trainingFilterVal,
    tournamentFilterVal,
    leaguesFilterVal,
    findViewMode,
    listViewStartDate,
    selectedDate,
    filtersPanelOpenVal,
    filterClubIdsVal,
    filterTimeStartVal,
    filterTimeEndVal,
    filterLevelMinVal,
    filterLevelMaxVal,
    filterSportVal,
    filterTierVal,
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

  const handleListNavigation = (direction: 'left' | 'right') => {
    const next = direction === 'left' ? subDays(listViewStartDate, 7) : addDays(listViewStartDate, 7);
    setFindListWeekStartDay(format(startOfDay(next), 'yyyy-MM-dd'));
  };

  const getListDateRange = () => {
    const start = startOfDay(listViewStartDate);
    const end = startOfDay(addDays(listViewStartDate, 6));
    return { start, end };
  };

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
      const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
      const wk = startOfWeek(new Date(), { weekStartsOn: displaySettings.weekStart });
      setFindListWeekStartDay(format(startOfDay(wk), 'yyyy-MM-dd'));
    }
  }, [requestFindGoToCurrent, setRequestFindGoToCurrent, user, setFindSelectedDay, setFindListWeekStartDay]);

  useEffect(() => {
    if (!isInitialized || findViewMode !== 'list' || !onDateRangeChange) {
      if (findViewMode === 'calendar') {
        lastDateRangeRef.current = null;
      }
      return;
    }
    
    const start = startOfDay(listViewStartDate);
    const end = startOfDay(addDays(listViewStartDate, 6));
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    
    if (!lastDateRangeRef.current || 
        lastDateRangeRef.current.start !== startStr || 
        lastDateRangeRef.current.end !== endStr) {
      lastDateRangeRef.current = { start: startStr, end: endStr };
      onDateRangeChange(start, end);
    }
  }, [isInitialized, findViewMode, listViewStartDate, onDateRangeChange]);

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

  const applyCommonFilters = (game: Game) => {
    if (game.timeIsSet === false && game.entityType !== 'LEAGUE_SEASON') {
      return false;
    }

    if (!passesAvailableGamePanelFilters(game, panelFilterState)) {
      return false;
    }

    if (findDiscoveryEnabled) {
      if (!passesFindTierFilter(game, filterTierVal)) {
        return false;
      }
      if (!passesFindNoRatingFilter(game, filterNoRatingVal)) {
        return false;
      }
    }

    const organizer = game.entityType === 'TRAINING'
      ? (game.trainerId ? game.participants.find((p: any) => p.userId === game.trainerId) : null) || game.participants.find((p: any) => p.role === 'OWNER')
      : game.participants.find((p: any) => p.role === 'OWNER');
    if (organizer && user?.blockedUserIds?.includes(organizer.userId)) {
      return false;
    }

    const isPublic = game.isPublic;
    const isParticipant = user?.id && game.participants.some((p: any) => p.userId === user.id);
    const isLeagueGame = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';

    const showPrivateAsAdmin = isAdmin && showPrivateGamesVal;
    if (!isPublic && !isParticipant && !(leaguesFilterVal && isLeagueGame) && !showPrivateAsAdmin) {
      return false;
    }

    const genderTeams = game.genderTeams ?? 'ANY';
    if (genderTeams !== 'ANY' && user?.gender === 'PREFER_NOT_TO_SAY') {
      return false;
    }

    if (userFilterVal) {
      const slotCount = game.participants.filter((p: any) => p.status === 'PLAYING').length;
      if (slotCount >= game.maxParticipants) {
        return false;
      }

      if (user) {
        const gameSport = parseGameSport(game.sport);
        const userLevel = getDisplayLevelForSport(user, gameSport);
        const minLevel = game.minLevel || 0;
        const maxLevel = game.maxLevel || 10;

        if (userLevel < minLevel || userLevel > maxLevel) {
          return false;
        }
      }

      if (genderTeams !== 'ANY' && user?.gender) {
        if (user.gender === 'PREFER_NOT_TO_SAY') {
          return false;
        }
        if (genderTeams === 'MEN' && user.gender !== 'MALE') return false;
        if (genderTeams === 'WOMEN' && user.gender !== 'FEMALE') return false;
        if (genderTeams === 'MIX_PAIRS') {
          if (user.gender !== 'MALE' && user.gender !== 'FEMALE') return false;
          const playing = game.participants?.filter((p: any) => p.status === 'PLAYING') ?? [];
          const maxPerGender = Math.floor((game.maxParticipants || 0) / 2);
          const sameGenderCount = playing.filter((p: any) => p.user?.gender === user.gender).length;
          if (sameGenderCount >= maxPerGender) return false;
        }
      }
    }

    if (gameFilterVal && game.entityType !== 'GAME') {
      return false;
    }

    if (trainingFilterVal && game.entityType !== 'TRAINING') {
      return false;
    }

    if (trainingFilterVal && user?.favoriteTrainerId) {
      const trainer = game.trainerId === user.favoriteTrainerId ? game.participants.find((p: any) => p.userId === game.trainerId) : null;
      if (!trainer) return false;
    }

    if (tournamentFilterVal && game.entityType !== 'TOURNAMENT') {
      return false;
    }

    if (leaguesFilterVal && !isLeagueGame) {
      return false;
    }

    return true;
  };

  const getFilteredGames = () => {
    if (findViewMode === 'calendar') {
      return filterGamesForCalendarDay(availableGames, selectedDate).filter(applyCommonFilters);
    } else {
      const { start, end } = getListDateRange();
      return availableGames.filter((game) => {
        const gameDate = startOfDay(new Date(game.startTime));
        const gameDateStr = format(gameDate, 'yyyy-MM-dd');
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');

        if (gameDateStr < startStr || gameDateStr > endStr) {
          return false;
        }

        return applyCommonFilters(game);
      });
    }
  };

  const filteredGames = getFilteredGames();
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
    <div className="mb-4">
      <GenderPromptBanner />
      <CityPromptBanner />
      {findSportTabs.length > 0 && (
        <div className="mb-3 flex justify-center">
          <SegmentedSwitch
            tabs={findSportTabs}
            activeId={filterSportVal}
            onChange={(id) => patchPanelFields({ filterSport: id as FindSportFilterValue })}
            showOnlyActiveTabText={true}
            layoutId="find-sport-selector"
            ariaLabel={t('sport.sport', { defaultValue: 'Sport' })}
          />
        </div>
      )}
      <AnimatePresence initial={false}>
        {!filtersPanelOpenVal && panelFiltersApplied && (
          <motion.div
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="max-w-md mx-auto overflow-hidden mb-3"
          >
            <div className="pb-1">
              <FiltersPanel
                cityId={user?.currentCity?.id}
                userFilter={userFilterVal}
                onUserFilterChange={setUserFilterVal}
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
                filterTier={filterTierVal}
                onFilterTierChange={(value) => patchPanelFields({ filterTier: value })}
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
  );

  const emptyMessage = gameFilterVal
    ? t('games.noGamesFound', { defaultValue: 'No games found' })
    : trainingFilterVal
      ? t('games.noTrainingFound', { defaultValue: 'No training found' })
      : tournamentFilterVal
        ? t('games.noTournamentFound', { defaultValue: 'No tournament found' })
        : leaguesFilterVal
          ? t('games.noLeaguesFound', { defaultValue: 'No leagues found' })
          : t('games.noGamesFound');

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
                {filterBlock}
                <TrainersList show={trainingFilterVal} availableGames={availableGames} levelSport={findLevelSport} />
                <MonthCalendar
                  selectedDate={selectedDate}
                  onDateSelect={handleDateSelect}
                  availableGames={availableGames}
                  userFilter={userFilterVal}
                  gameFilter={gameFilterVal}
                  trainingFilter={trainingFilterVal}
                  tournamentFilter={tournamentFilterVal}
                  leaguesFilter={leaguesFilterVal}
                  favoriteTrainerId={user?.favoriteTrainerId}
                  onMonthChange={onMonthChange}
                  onDateRangeChange={onDateRangeChange}
                  panelFilters={panelFilterState}
                  showPrivateGames={showPrivateGamesVal}
                  isAdmin={isAdmin}
                  findDiscoveryEnabled={findDiscoveryEnabled}
                  filterTier={filterTierVal}
                  filterNoRating={filterNoRatingVal}
                />
                <SelectedDateHeading date={selectedDate} />
              </div>
            </div>
          }
          rightPanel={
            <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
              <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                {loading && availableGames.length === 0 ? (
                  <GamesLoadingSkeleton />
                ) : filteredGames.length === 0 ? (
                  <EmptyStateCard icon={SearchX} title={emptyMessage} />
                ) : (
                  gamesList
                )}
                <SubscriptionsNudgeButton onClick={handleSubscriptionsClick} />
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
    <div className="mt-2">
      {filterBlock}
      <TrainersList show={trainingFilterVal} availableGames={availableGames} levelSport={findLevelSport} />

      {loading && availableGames.length === 0 ? (
        <GamesLoadingSkeleton />
      ) : findViewMode === 'calendar' ? (
        <>
          <MonthCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            availableGames={availableGames}
            userFilter={userFilterVal}
            gameFilter={gameFilterVal}
            trainingFilter={trainingFilterVal}
            tournamentFilter={tournamentFilterVal}
            leaguesFilter={leaguesFilterVal}
            favoriteTrainerId={user?.favoriteTrainerId}
            onMonthChange={onMonthChange}
            onDateRangeChange={onDateRangeChange}
            panelFilters={panelFilterState}
            showPrivateGames={showPrivateGamesVal}
            isAdmin={isAdmin}
            findDiscoveryEnabled={findDiscoveryEnabled}
            filterTier={filterTierVal}
            filterNoRating={filterNoRatingVal}
          />
          <SelectedDateHeading date={selectedDate} />

          {filteredGames.length === 0 ? (
            <EmptyStateCard icon={SearchX} title={emptyMessage} />
          ) : (
            gamesList
          )}
        </>
      ) : (
        <>
          <WeekRangeNavigator
            start={getListDateRange().start}
            end={getListDateRange().end}
            onNavigate={handleListNavigation}
          />

          {filteredGames.length === 0 ? (
            <EmptyStateCard icon={SearchX} title={emptyMessage} />
          ) : (
            gamesList
          )}
        </>
      )}

      <SubscriptionsNudgeButton onClick={handleSubscriptionsClick} />
    </div>
    </SportLevelProvider>
  );
};
