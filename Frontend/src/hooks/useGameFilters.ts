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
  eventsFilter: false,
  activeTab: 'calendar',
  filtersPanelOpen: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
  filterSport: 'primary',
  filterNoRating: false,
  filterNoviceFriendly: false,
  showPrivateGames: false,
};

const dayKeyToIso = (day: string) => startOfDay(parse(day, 'yyyy-MM-dd', new Date())).toISOString();

function sanitizeLoadedFilters(f: GameFilters): GameFilters {
  const merged = { ...DEFAULT_FILTERS, ...f };
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

  // `updateFilter`/`updateFilters` persist eagerly (so a tap survives an
  // immediate unmount) and the effect below persists on nav-derived changes.
  // Without this guard every chip tap wrote the same payload twice: once
  // imperatively, once from the effect that the resulting state change fires.
  const lastPersistedRef = useRef<string | null>(null);

  const persistFilters = useCallback((next: GameFilters) => {
    const payload = buildFiltersToPersist(
      next,
      findViewModeRef.current,
      findListWeekStartDayRef.current,
      findSelectedDayRef.current,
    );
    const signature = JSON.stringify(payload);
    if (lastPersistedRef.current === signature) return;
    lastPersistedRef.current = signature;
    void setGameFilters(payload).catch(() => {
      // A rejected IndexedDB write must not stay recorded as persisted, or the
      // dedup above would suppress the retry the next call would have made.
      if (lastPersistedRef.current === signature) lastPersistedRef.current = null;
    });
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
    // An explicit `?view=` wins; otherwise restore the last view mode. Read from
    // the location rather than the store because `useUrlStoreSync` writes a
    // default `calendar` when the param is absent, which would otherwise look
    // identical to the user having chosen the calendar.
    if (current.activeTab && !new URLSearchParams(window.location.search).get('view')) {
      nav.setFindViewMode(current.activeTab);
    }
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
      persistFilters(filtersRef.current);
    };
  }, [persistFilters]);

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
