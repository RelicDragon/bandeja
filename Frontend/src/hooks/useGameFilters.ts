import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parse, startOfDay } from 'date-fns';
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';
import { useShellNavStore } from '@/store/shellNavStore';

const DEFAULT_FILTERS: GameFilters = {
  userFilter: false,
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  activeTab: 'calendar',
  filtersPanelOpen: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
  filterSport: 'primary',
  filterTier: undefined,
  filterNoRating: false,
  showPrivateGames: false,
};

const dayKeyToIso = (day: string) => startOfDay(parse(day, 'yyyy-MM-dd', new Date())).toISOString();

export const useGameFilters = () => {
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_FILTERS);
  const [isHydrated, setIsHydrated] = useState(false);
  const hasLoadedRef = useRef(false);
  const findViewMode = useShellNavStore((s) => s.findViewMode);
  const findListWeekStartDay = useShellNavStore((s) => s.findListWeekStartDay);
  const findSelectedDay = useShellNavStore((s) => s.findSelectedDay);

  useEffect(() => {
    getGameFilters().then((f) => {
      const merged = { ...DEFAULT_FILTERS, ...f };
      const activeCount = [merged.trainingFilter, merged.tournamentFilter, merged.leaguesFilter].filter(Boolean).length;
      if (activeCount > 1) {
        if (merged.trainingFilter) merged.tournamentFilter = merged.leaguesFilter = false;
        else if (merged.tournamentFilter) merged.leaguesFilter = false;
      }
      setFilters(merged);
      hasLoadedRef.current = true;

      const nav = useShellNavStore.getState();
      if (merged.calendarSelectedDate && nav.findSelectedDay == null) {
        const restoredDate = new Date(merged.calendarSelectedDate);
        if (!isNaN(restoredDate.getTime())) {
          nav.setFindSelectedDay(format(startOfDay(restoredDate), 'yyyy-MM-dd'));
        }
      }
      if (merged.listViewStartDate && nav.findListWeekStartDay == null) {
        const restoredDate = new Date(merged.listViewStartDate);
        if (!isNaN(restoredDate.getTime())) {
          nav.setFindListWeekStartDay(format(startOfDay(restoredDate), 'yyyy-MM-dd'));
        }
      }
      setIsHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const listIso =
      findViewMode === 'list'
        ? findListWeekStartDay
          ? dayKeyToIso(findListWeekStartDay)
          : filters.listViewStartDate
        : undefined;
    const calIso =
      findViewMode === 'calendar'
        ? findSelectedDay
          ? dayKeyToIso(findSelectedDay)
          : filters.calendarSelectedDate
        : undefined;
    setGameFilters({
      ...filters,
      activeTab: findViewMode,
      listViewStartDate: listIso,
      calendarSelectedDate: calIso,
    });
  }, [filters, findViewMode, findListWeekStartDay, findSelectedDay]);

  const updateFilter = useCallback(<K extends keyof GameFilters>(key: K, value: GameFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateFilters = useCallback((updates: Partial<GameFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  return { filters, setFilters, updateFilter, updateFilters, isHydrated };
};
