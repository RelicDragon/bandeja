import { useState, useEffect, useRef } from 'react';
import { parse, startOfDay } from 'date-fns';
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';
import { useNavigationStore } from '@/store/navigationStore';

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
};

const dayKeyToIso = (day: string) => startOfDay(parse(day, 'yyyy-MM-dd', new Date())).toISOString();

export const useGameFilters = () => {
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_FILTERS);
  const hasLoadedRef = useRef(false);
  const findViewMode = useNavigationStore((s) => s.findViewMode);
  const findListWeekStartDay = useNavigationStore((s) => s.findListWeekStartDay);
  const findSelectedDay = useNavigationStore((s) => s.findSelectedDay);

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

  const updateFilter = <K extends keyof GameFilters>(key: K, value: GameFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateFilters = (updates: Partial<GameFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  return { filters, setFilters, updateFilter, updateFilters };
};
