import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parse, startOfDay } from 'date-fns';
import {
  getGameFilters,
  peekGameFiltersMemory,
  setGameFilters,
  GameFilters,
} from '@/utils/gameFiltersStorage';
import { hasFindPanelFiltersApplied } from '@/utils/findPanelFiltersApplied';
import { useShellNavStore } from '@/store/shellNavStore';

const DEFAULT_FILTERS: GameFilters = {
  filterAvailableSlots: false,
  filterSuitableRating: false,
  hideBarGames: false,
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
  filterNoRating: false,
  showPrivateGames: false,
};

const dayKeyToIso = (day: string) => startOfDay(parse(day, 'yyyy-MM-dd', new Date())).toISOString();

function sanitizeLoadedFilters(f: GameFilters): GameFilters {
  const merged = { ...DEFAULT_FILTERS, ...f };
  const activeCount = [merged.trainingFilter, merged.tournamentFilter, merged.leaguesFilter].filter(Boolean).length;
  if (activeCount > 1) {
    if (merged.trainingFilter) merged.tournamentFilter = merged.leaguesFilter = false;
    else if (merged.tournamentFilter) merged.leaguesFilter = false;
  }
  if (!hasFindPanelFiltersApplied(merged)) {
    merged.filtersPanelOpen = false;
  }
  return merged;
}

function buildFiltersToPersist(
  filters: GameFilters,
  findViewMode: 'calendar' | 'list',
  findListWeekStartDay: string | null,
  findSelectedDay: string | null,
): GameFilters {
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
  return {
    ...filters,
    activeTab: findViewMode,
    listViewStartDate: listIso,
    calendarSelectedDate: calIso,
  };
}

export const useGameFilters = () => {
  const memory = peekGameFiltersMemory();
  const [filters, setFilters] = useState<GameFilters>(() =>
    memory ? sanitizeLoadedFilters(memory) : DEFAULT_FILTERS,
  );
  const [isHydrated, setIsHydrated] = useState(() => memory != null);
  const findViewMode = useShellNavStore((s) => s.findViewMode);
  const findListWeekStartDay = useShellNavStore((s) => s.findListWeekStartDay);
  const findSelectedDay = useShellNavStore((s) => s.findSelectedDay);
  const restoredViewPeriodRef = useRef(false);
  const filtersRef = useRef(filters);
  const findViewModeRef = useRef(findViewMode);
  const findListWeekStartDayRef = useRef(findListWeekStartDay);
  const findSelectedDayRef = useRef(findSelectedDay);
  const isHydratedRef = useRef(isHydrated);

  filtersRef.current = filters;
  findViewModeRef.current = findViewMode;
  findListWeekStartDayRef.current = findListWeekStartDay;
  findSelectedDayRef.current = findSelectedDay;
  isHydratedRef.current = isHydrated;

  const persistFilters = useCallback((next: GameFilters) => {
    void setGameFilters(
      buildFiltersToPersist(
        next,
        findViewModeRef.current,
        findListWeekStartDayRef.current,
        findSelectedDayRef.current,
      ),
    );
  }, []);

  useEffect(() => {
    if (isHydratedRef.current && peekGameFiltersMemory()) {
      return;
    }
    let cancelled = false;
    getGameFilters().then((f) => {
      if (cancelled) return;
      const merged = sanitizeLoadedFilters(f);
      setFilters(merged);
      filtersRef.current = merged;
      setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || restoredViewPeriodRef.current) return;
    restoredViewPeriodRef.current = true;
    const nav = useShellNavStore.getState();
    const current = filtersRef.current;
    if (current.calendarSelectedDate && nav.findSelectedDay == null) {
      const restoredDate = new Date(current.calendarSelectedDate);
      if (!isNaN(restoredDate.getTime())) {
        nav.setFindSelectedDay(format(startOfDay(restoredDate), 'yyyy-MM-dd'));
      }
    }
    if (current.listViewStartDate && nav.findListWeekStartDay == null) {
      const restoredDate = new Date(current.listViewStartDate);
      if (!isNaN(restoredDate.getTime())) {
        nav.setFindListWeekStartDay(format(startOfDay(restoredDate), 'yyyy-MM-dd'));
      }
    }
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    persistFilters(filters);
  }, [filters, findViewMode, findListWeekStartDay, findSelectedDay, isHydrated, persistFilters]);

  useEffect(() => {
    return () => {
      if (!isHydratedRef.current) return;
      void setGameFilters(
        buildFiltersToPersist(
          filtersRef.current,
          findViewModeRef.current,
          findListWeekStartDayRef.current,
          findSelectedDayRef.current,
        ),
      );
    };
  }, []);

  const updateFilter = useCallback(
    <K extends keyof GameFilters>(key: K, value: GameFilters[K]) => {
      const next = { ...filtersRef.current, [key]: value };
      filtersRef.current = next;
      setFilters(next);
      if (isHydratedRef.current) persistFilters(next);
    },
    [persistFilters],
  );

  const updateFilters = useCallback(
    (updates: Partial<GameFilters>) => {
      const next = { ...filtersRef.current, ...updates };
      filtersRef.current = next;
      setFilters(next);
      if (isHydratedRef.current) persistFilters(next);
    },
    [persistFilters],
  );

  return { filters, setFilters, updateFilter, updateFilters, isHydrated };
};
