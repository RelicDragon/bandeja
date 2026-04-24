import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, GameCard, Button, CityModal } from '@/components';
import { Game } from '@/types';
import { MapPin, Filter, ChevronLeft, ChevronRight, Bell, Dumbbell, Swords, Trophy, Users, RotateCcw } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { format, parse, startOfDay, addDays, subDays, startOfWeek } from 'date-fns';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { MonthCalendar } from '@/components/MonthCalendar';
import { TrainersList } from './TrainersList';
import { GenderPromptBanner } from './GenderPromptBanner';
import { CityPromptBanner } from './CityPromptBanner';
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { FiltersPanel } from './FiltersPanel';
import { passesAvailableGamePanelFilters } from '@/utils/availableGamePanelFilters';

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
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const { setCurrentPage, setIsAnimating, findViewMode, setFindViewMode, requestFindGoToCurrent, setRequestFindGoToCurrent } = useNavigationStore();
  const findSelectedDay = useNavigationStore((s) => s.findSelectedDay);
  const findListWeekStartDay = useNavigationStore((s) => s.findListWeekStartDay);
  const setFindSelectedDay = useNavigationStore((s) => s.setFindSelectedDay);
  const setFindListWeekStartDay = useNavigationStore((s) => s.setFindListWeekStartDay);
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
  const [showCityModal, setShowCityModal] = useState(false);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [filterClubIds, setFilterClubIds] = useState<string[]>([]);
  const [filterTimeStart, setFilterTimeStart] = useState('00:00');
  const [filterTimeEnd, setFilterTimeEnd] = useState('24:00');
  const [filterLevelMin, setFilterLevelMin] = useState(1.0);
  const [filterLevelMax, setFilterLevelMax] = useState(7.0);

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

  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const panelCriteriaActive = useMemo(() => {
    return (
      filterClubIdsVal.length > 0 ||
      filterTimeStartVal !== '00:00' ||
      filterTimeEndVal !== '24:00' ||
      filterLevelMinVal > 1.0 + 1e-6 ||
      filterLevelMaxVal < 7.0 - 1e-6
    );
  }, [
    filterClubIdsVal,
    filterTimeStartVal,
    filterTimeEndVal,
    filterLevelMinVal,
    filterLevelMaxVal,
  ]);

  const filtersControlActive = filtersPanelOpenVal || userFilterVal || panelCriteriaActive;
  const panelFiltersApplied = userFilterVal || panelCriteriaActive;

  const setUserFilterVal = (v: boolean) => (onFilterChange ? onFilterChange('userFilter', v) : setUserFilter(v));

  const resetPanelFilters = () => {
    if (onFiltersChange) {
      onFiltersChange({
        userFilter: false,
        filterClubIds: [],
        filterTimeStart: '00:00',
        filterTimeEnd: '24:00',
        filterLevelMin: 1.0,
        filterLevelMax: 7.0,
      });
    } else {
      setUserFilter(false);
      setFilterClubIds([]);
      setFilterTimeStart('00:00');
      setFilterTimeEnd('24:00');
      setFilterLevelMin(1.0);
      setFilterLevelMax(7.0);
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
      }
      if (!hydratedViewPeriodFromStorageRef.current) {
        hydratedViewPeriodFromStorageRef.current = true;
        if (filters.activeTab) {
          setFindViewMode(filters.activeTab);
        }
        const nav = useNavigationStore.getState();
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
  ]);

  const handleCityClick = () => {
    setShowCityModal(true);
  };

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

    const organizer = game.entityType === 'TRAINING'
      ? (game.trainerId ? game.participants.find((p: any) => p.userId === game.trainerId) : null) || game.participants.find((p: any) => p.role === 'OWNER')
      : game.participants.find((p: any) => p.role === 'OWNER');
    if (organizer && user?.blockedUserIds?.includes(organizer.userId)) {
      return false;
    }

    const isPublic = game.isPublic;
    const isParticipant = user?.id && game.participants.some((p: any) => p.userId === user.id);
    const isLeagueGame = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';

    if (!isPublic && !isParticipant && !(leaguesFilterVal && isLeagueGame)) {
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

      if (user?.level) {
        const userLevel = user.level;
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
      return availableGames.filter((game) => {
        const gameDate = startOfDay(new Date(game.startTime));
        const selectedDateStr = format(startOfDay(selectedDate), 'yyyy-MM-dd');
        const gameDateStr = format(gameDate, 'yyyy-MM-dd');

        if (gameDateStr !== selectedDateStr) {
          return false;
        }

        return applyCommonFilters(game);
      });
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

  const handleSubscriptionsClick = () => {
    setIsAnimating(true);
    setCurrentPage('gameSubscriptions');
    navigate('/game-subscriptions', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  const filterBlock = (
    <div className="mb-4">
      <GenderPromptBanner />
      <CityPromptBanner />
      <div className="flex items-center justify-between gap-2 mb-3 max-w-md mx-auto">
        <button
          onClick={handleCityClick}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 min-w-0"
        >
          <MapPin size={16} className="text-primary-600 dark:text-primary-400 shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {user?.currentCity ? translateCity(user.currentCity.id, user.currentCity.name, user.currentCity.country) : t('auth.selectCity')}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleFiltersPanel}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors shrink-0 ${
            filtersControlActive
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Filter
            size={16}
            className={filtersControlActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
            fill={filtersControlActive ? 'currentColor' : 'none'}
          />
          <span className="text-xs font-medium">{t('games.filters')}</span>
        </button>
      </div>
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
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-2 mb-3 max-w-md mx-auto">
        <button
          onClick={() => handleEntityFilterClick('game')}
          className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
            gameFilterVal
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Users size={18} className={gameFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={gameFilterVal ? 'currentColor' : 'none'} />
          <span className="text-sm font-medium">{t('games.entityTypes.GAME', { defaultValue: 'Games' })}</span>
        </button>
        <button
          onClick={() => handleEntityFilterClick('tournament')}
          className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
            tournamentFilterVal
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Swords size={18} className={tournamentFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={tournamentFilterVal ? 'currentColor' : 'none'} />
          <span className="text-sm font-medium">{t('games.entityTypes.TOURNAMENT', { defaultValue: 'Tournament' })}</span>
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3 max-w-md mx-auto">
        <button
          onClick={() => handleEntityFilterClick('training')}
          className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
            trainingFilterVal
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Dumbbell size={18} className={trainingFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={trainingFilterVal ? 'currentColor' : 'none'} />
          <span className="text-sm font-medium">{t('games.training', { defaultValue: 'Training' })}</span>
        </button>
        <button
          onClick={() => handleEntityFilterClick('leagues')}
          className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-colors ${
            leaguesFilterVal
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Trophy size={18} className={leaguesFilterVal ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'} fill={leaguesFilterVal ? 'currentColor' : 'none'} />
          <span className="text-sm font-medium">{t('games.entityTypes.LEAGUE', { defaultValue: 'Leagues' })}</span>
        </button>
      </div>
    </div>
  );

  const scrollBottomPadding = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  if (splitView && findViewMode === 'calendar') {
    return (
      <div className="fixed inset-x-0 bottom-0 overflow-hidden z-0" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <ResizableSplitter
          defaultLeftWidth={35}
          minLeftWidth={300}
          maxLeftWidth={500}
          leftPanel={
            <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
              <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                {filterBlock}
                <TrainersList show={trainingFilterVal} availableGames={availableGames} />
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
                />
              </div>
            </div>
          }
          rightPanel={
            <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
              <div className="p-4" style={{ paddingBottom: scrollBottomPadding }}>
                {loading && availableGames.length === 0 ? (
                  <Card className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400" />
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{t('common.loading', { defaultValue: 'Loading...' })}</p>
                    </div>
                  </Card>
                ) : filteredGames.length === 0 ? (
                  <Card className="text-center py-12">
                    <p className="text-gray-600 dark:text-gray-400">
                      {gameFilterVal ? t('games.noGamesFound', { defaultValue: 'No games found' }) : trainingFilterVal ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : tournamentFilterVal ? t('games.noTournamentFound', { defaultValue: 'No tournament found' }) : leaguesFilterVal ? t('games.noLeaguesFound', { defaultValue: 'No leagues found' }) : t('games.noGamesFound')}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filteredGames.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        user={user}
                        showChatIndicator={false}
                        showJoinButton={true}
                        onJoin={onJoin}
                        onNoteSaved={onNoteSaved}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSubscriptionsClick}
                    className="flex items-center gap-2"
                  >
                    <div className="relative inline-flex items-center justify-center w-4 h-4">
                      <Bell className="w-4 h-4 animate-bell-pulse relative z-10" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-1"></div>
                        <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-2"></div>
                      </div>
                    </div>
                    {t('gameSubscriptions.wantToBeNotified', { defaultValue: 'Want to be notified when new games are created?' })}
                  </Button>
                </div>
              </div>
            </div>
          }
        />
        <CityModal
          isOpen={showCityModal}
          onClose={() => setShowCityModal(false)}
          selectedId={user?.currentCity?.id}
        />
      </div>
    );
  }

  return (
    <div className="mt-2">
      {filterBlock}
      <TrainersList show={trainingFilterVal} availableGames={availableGames} />

      {loading && availableGames.length === 0 ? (
        <Card className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400" />
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{t('common.loading', { defaultValue: 'Loading...' })}</p>
          </div>
        </Card>
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
          />
          
          {filteredGames.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {gameFilterVal ? t('games.noGamesFound', { defaultValue: 'No games found' }) : trainingFilterVal ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : tournamentFilterVal ? t('games.noTournamentFound', { defaultValue: 'No tournament found' }) : leaguesFilterVal ? t('games.noLeaguesFound', { defaultValue: 'No leagues found' }) : t('games.noGamesFound')}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  user={user}
                  showChatIndicator={false}
                  showJoinButton={true}
                  onJoin={onJoin}
                  onNoteSaved={onNoteSaved}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => handleListNavigation('left')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {format(getListDateRange().start, 'dd.MM.yyyy')} - {format(getListDateRange().end, 'dd.MM.yyyy')}
            </div>
            <button
              onClick={() => handleListNavigation('right')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          
          {filteredGames.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {gameFilterVal ? t('games.noGamesFound', { defaultValue: 'No games found' }) : trainingFilterVal ? t('games.noTrainingFound', { defaultValue: 'No training found' }) : tournamentFilterVal ? t('games.noTournamentFound', { defaultValue: 'No tournament found' }) : leaguesFilterVal ? t('games.noLeaguesFound', { defaultValue: 'No leagues found' }) : t('games.noGamesFound')}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  user={user}
                  showChatIndicator={false}
                  showJoinButton={true}
                  onJoin={onJoin}
                  onNoteSaved={onNoteSaved}
                />
              ))}
            </div>
          )}
        </>
      )}
      
      <div className="mt-6 flex justify-center">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubscriptionsClick}
          className="flex items-center gap-2"
        >
          <div className="relative inline-flex items-center justify-center w-4 h-4">
            <Bell className="w-4 h-4 animate-bell-pulse relative z-10" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-1"></div>
              <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-2"></div>
            </div>
          </div>
          {t('gameSubscriptions.wantToBeNotified', { defaultValue: 'Want to be notified when new games are created?' })}
        </Button>
      </div>
      <CityModal
        isOpen={showCityModal}
        onClose={() => setShowCityModal(false)}
        selectedId={user?.currentCity?.id}
      />
    </div>
  );
};
