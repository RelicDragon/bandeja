import { useState, useMemo, useEffect, useRef, useCallback, memo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, getMonth, getYear, startOfDay } from 'date-fns';
import { enGB, ru, es, sr, cs } from 'date-fns/locale';
import { calendarDayKey, selectedDayInMonth } from '@/utils/calendarSelectedDayFilter';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatShortWeekday, formatCompactMonthHeader } from '@/utils/dateFormat';
import {
  DEFAULT_AVAILABLE_GAME_PANEL_FILTERS,
  type AvailableGamePanelFilterState,
} from '@/utils/availableGamePanelFilters';
import { useUnreadStore } from '@/store/unreadStore';
import { gameUnreadCountsMap } from '@/utils/unreadCountsFromStore';
import {
  aggregateFindGamesByDay,
  resolveFindFilterViewer,
  type FindDisplayEntityType,
  type FindFilterState,
} from '@/utils/findFilter';
import {
  aggregateFindDayIndexByDay,
  mergeFindDayIndexIntoCardDays,
  type FindDayIndexRow,
} from '@/utils/findDayIndexCounts';
import { useMonthCalendarWeather } from '@/hooks/useMonthCalendarWeather';
import { useAdCalendarTags } from '@/hooks/useAdCalendarTags';
import { MonthCalendarDayCell } from '@/components/MonthCalendarDayCell';
import { MonthCalendarWeatherToggle } from '@/components/MonthCalendarWeatherToggle';
import { resolveCalendarDayPillVisibility } from '@/utils/calendarDayPillVisibility';
import { visibleCalendarDayMarkTypes } from '@/utils/visibleCalendarDayMarkTypes';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import {
  readCalendarWeatherMode,
  writeCalendarWeatherMode,
  type CalendarWeatherModeScope,
} from '@/utils/calendarWeatherModeStorage';

type DisplayEntityType = FindDisplayEntityType;

const PILL_ENTITY_ORDER: DisplayEntityType[] = ['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE', 'BAR', 'EVENT'];

export interface MonthCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  availableGames: Game[];
  /** Cheap structural day index for accurate busy-city badge counts. */
  dayIndex?: FindDayIndexRow[];
  filterAvailableSlots?: boolean;
  filterSuitableRating?: boolean;
  hideBarGames?: boolean;
  gameFilter?: boolean;
  trainingFilter?: boolean;
  tournamentFilter?: boolean;
  leaguesFilter?: boolean;
  eventsFilter?: boolean;
  favoriteTrainerId?: string | null;
  onMonthChange?: (month: number, year: number) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  panelFilters?: AvailableGamePanelFilterState;
  showPrivateGames?: boolean;
  isAdmin?: boolean;
  findDiscoveryEnabled?: boolean;
  filterNoRating?: boolean;
  collapsed?: boolean;
  weatherModeScope: CalendarWeatherModeScope;
  upcomingsToggle?: {
    active: boolean;
    onClick: () => void;
    label: string;
  };
  /**
   * PRD 358 — Find's day-and-time shortcut row. Rendered under the heading row
   * in both the expanded and the collapsed (list) state so it never moves.
   */
  quickShortcuts?: ReactNode;
}

const localeMap = {
  en: enGB,
  ru: ru,
  es: es,
  sr: sr,
  cs: cs,
};

// Finish the outgoing fade before mounting the incoming month. Both grids
// contain transparent cells, so simultaneous slides make their dates overlap.
// Built once per motion preference — a fresh `variants` object on every render
// makes framer re-resolve the whole variant tree for each animated node.
const buildMonthVariants = (reduceMotion: boolean) => ({
  enter: (direction: number) => ({ x: reduceMotion ? 0 : direction * 24, opacity: 0 }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      duration: reduceMotion ? 0 : 0.28,
      delay: reduceMotion ? 0 : 0.04,
      ease: 'easeOut' as const,
    },
  },
  exit: (direction: number) => ({
    x: reduceMotion ? 0 : direction * -16,
    opacity: 0,
    transition: { duration: reduceMotion ? 0 : 0.1, ease: 'easeIn' as const },
  }),
});

const MONTH_VARIANTS_MOTION = buildMonthVariants(false);
const MONTH_VARIANTS_REDUCED = buildMonthVariants(true);
const HEADER_TRANSITION_MOTION = { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };
const HEADER_TRANSITION_REDUCED = { duration: 0 };

const MonthCalendarView = ({
  selectedDate,
  onDateSelect,
  availableGames,
  dayIndex,
  filterAvailableSlots = false,
  filterSuitableRating = false,
  hideBarGames = false,
  gameFilter = false,
  trainingFilter = false,
  tournamentFilter = false,
  leaguesFilter = false,
  eventsFilter = false,
  favoriteTrainerId,
  onMonthChange,
  onDateRangeChange,
  panelFilters = DEFAULT_AVAILABLE_GAME_PANEL_FILTERS,
  showPrivateGames = false,
  isAdmin = false,
  findDiscoveryEnabled = false,
  filterNoRating = false,
  collapsed = false,
  weatherModeScope,
  upcomingsToggle,
  quickShortcuts,
}: MonthCalendarProps) => {
  const user = useAuthStore((state) => state.user);
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const headerTransition = reduceMotion ? HEADER_TRANSITION_REDUCED : HEADER_TRANSITION_MOTION;
  const monthVariants = reduceMotion ? MONTH_VARIANTS_REDUCED : MONTH_VARIANTS_MOTION;
  const [slideDirection, setSlideDirection] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const [weatherMode, setWeatherMode] = useState(() => readCalendarWeatherMode(weatherModeScope));
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedDate) return;
    const selectedMonth = startOfMonth(selectedDate);
    setViewMonth((prev) => (isSameMonth(prev, selectedMonth) ? prev : selectedMonth));
  }, [selectedDate]);

  const displayedMonth = viewMonth;
  const selectedDayKey = selectedDate ? calendarDayKey(selectedDate) : null;

  const displaySettings = useMemo(() => user ? resolveDisplaySettings(user) : resolveDisplaySettings(null), [user]);
  // Subscribe only to unread for games visible on this grid: month cards and/or dayIndex ids.
  const calendarUnreadGameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of availableGames) ids.add(g.id);
    if (dayIndex) {
      for (const row of dayIndex) ids.add(row.id);
    }
    return [...ids];
  }, [availableGames, dayIndex]);
  const gamesUnreadCounts = useUnreadStore(
    useShallow((s) => gameUnreadCountsMap(calendarUnreadGameIds, s.displayedByContext)),
  );
  const locale = useMemo(() => {
    return localeMap[i18n.language as keyof typeof localeMap] || enGB;
  }, [i18n.language]);
  const weekStartsOn = useMemo(() => displaySettings.weekStart, [displaySettings.weekStart]);
  const monthHeaderLabel = useMemo(
    () => formatCompactMonthHeader(displayedMonth, i18n.language),
    [displayedMonth, i18n.language],
  );

  const monthStart = useMemo(() => startOfMonth(displayedMonth), [displayedMonth]);
  const monthEnd = useMemo(() => endOfMonth(displayedMonth), [displayedMonth]);
  const startDate = useMemo(() => startOfWeek(monthStart, { locale, weekStartsOn }), [monthStart, locale, weekStartsOn]);
  const endDate = useMemo(() => endOfWeek(monthEnd, { locale, weekStartsOn }), [monthEnd, locale, weekStartsOn]);

  const noEntityFilter = !gameFilter && !trainingFilter && !tournamentFilter && !leaguesFilter && !eventsFilter;

  const findFilterState = useMemo<FindFilterState>(
    () => ({
      filterAvailableSlots,
      filterSuitableRating,
      hideBarGames,
      gameFilter,
      trainingFilter,
      tournamentFilter,
      leaguesFilter,
      eventsFilter,
      showPrivateGames,
      findDiscoveryEnabled,
      filterNoRating,
      panel: panelFilters,
      favoriteTrainerId,
    }),
    [
      filterAvailableSlots,
      filterSuitableRating,
      hideBarGames,
      gameFilter,
      trainingFilter,
      tournamentFilter,
      leaguesFilter,
      eventsFilter,
      showPrivateGames,
      findDiscoveryEnabled,
      filterNoRating,
      panelFilters,
      favoriteTrainerId,
    ],
  );

  const findFilterViewer = useMemo(
    () => resolveFindFilterViewer(user, isAdmin),
    [user, isAdmin],
  );

  const dateCellData = useMemo(() => {
    const cityTimezone = resolveViewerCityTimezone(user?.currentCity?.timezone);
    const fromCards = aggregateFindGamesByDay(
      availableGames,
      findFilterViewer,
      findFilterState,
      undefined,
      cityTimezone,
    );
    if (!dayIndex || dayIndex.length === 0) return fromCards;

    const indexByDay = aggregateFindDayIndexByDay(
      dayIndex,
      findFilterViewer,
      findFilterState,
      cityTimezone,
    );
    return mergeFindDayIndexIntoCardDays(fromCards, indexByDay);
  }, [availableGames, dayIndex, findFilterViewer, findFilterState, user?.currentCity?.timezone]);

  const notifyMonthChange = useCallback((month: Date) => {
    if (onMonthChange) {
      onMonthChange(getMonth(month) + 1, getYear(month));
    }
  }, [onMonthChange]);

  const handlePreviousMonth = () => {
    const anchor = selectedDate ?? new Date();
    const newMonth = startOfMonth(subMonths(viewMonth, 1));
    setSlideDirection(-1);
    setIsSliding(true);
    setViewMonth(newMonth);
    onDateSelect(selectedDayInMonth(anchor, newMonth));
    notifyMonthChange(newMonth);
  };

  const handleNextMonth = () => {
    const anchor = selectedDate ?? new Date();
    const newMonth = startOfMonth(addMonths(viewMonth, 1));
    setSlideDirection(1);
    setIsSliding(true);
    setViewMonth(newMonth);
    onDateSelect(selectedDayInMonth(anchor, newMonth));
    notifyMonthChange(newMonth);
  };

  const handleDateClick = useCallback((day: Date) => {
    const dayMonth = startOfMonth(day);
    if (!isSameMonth(dayMonth, viewMonth)) {
      setSlideDirection(dayMonth > viewMonth ? 1 : -1);
      setIsSliding(true);
      setViewMonth(dayMonth);
      notifyMonthChange(dayMonth);
    }

    onDateSelect(startOfDay(day));

    if (calendarRef.current) {
      const rect = calendarRef.current.getBoundingClientRect();
      const header = document.querySelector('header');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      if (rect.top < headerHeight - 4) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top - headerHeight),
          behavior: 'auto',
        });
      }
    }
  }, [viewMonth, onDateSelect, notifyMonthChange]);

  const lastRangeRef = useRef<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    if (onDateRangeChange && startDate && endDate) {
      const lastRange = lastRangeRef.current;
      if (!lastRange || !isSameDay(lastRange.start, startDate) || !isSameDay(lastRange.end, endDate)) {
        lastRangeRef.current = { start: startDate, end: endDate };
        onDateRangeChange(startDate, endDate);
      }
    }
  }, [startDate, endDate, onDateRangeChange]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [startDate, endDate]);

  const calendarDayKeys = useMemo(
    () => calendarDays.map((calendarDay) => format(startOfDay(calendarDay), 'yyyy-MM-dd')),
    [calendarDays],
  );
  const isCompactUpcomings = collapsed && Boolean(upcomingsToggle);
  const userCityId = user?.currentCity?.id || user?.currentCityId || null;
  const userCityTimezone = user?.currentCity?.timezone ?? null;
  const weatherToggleDisabled = !userCityId;
  const weatherFetchEnabled = weatherMode && !isCompactUpcomings;
  const { weatherByDay } = useMonthCalendarWeather(
    userCityId,
    calendarDayKeys,
    weatherFetchEnabled,
    userCityTimezone,
  );
  const { getTagsForDay } = useAdCalendarTags();

  // Recomputed only when a game's unread count actually changes, so an incoming
  // message repaints the one affected cell instead of rebuilding `dayCells`.
  const unreadByDay = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const [dateStr, dayData] of dateCellData) {
      let total = 0;
      for (const id of dayData.gameIds) total += gamesUnreadCounts[id] || 0;
      if (total > 0) byDay.set(dateStr, total);
    }
    return byDay;
  }, [dateCellData, gamesUnreadCounts]);

  // Recomputed per render but only once, versus 42 `isToday()` calls inline.
  const todayKey = format(startOfDay(new Date()), 'yyyy-MM-dd');

  // Selection and unread updates reuse these structural props, including arrays.
  const dayCells = useMemo(() => calendarDays.map((day) => {
    const isCurrentMonth = isSameMonth(day, displayedMonth);
    const dateStr = format(startOfDay(day), 'yyyy-MM-dd');
    const dayData = dateCellData.get(dateStr);
    const gameCount = dayData?.gameCount ?? 0;
    const hasGames = gameCount > 0;
    const isParticipant = dayData?.isUserParticipant ?? false;
    const showLeagueMarks = weatherModeScope === 'my' || leaguesFilter;
    const showEventMarks = weatherModeScope === 'my' || eventsFilter || noEntityFilter;
    const participantTypes = visibleCalendarDayMarkTypes(
      PILL_ENTITY_ORDER.filter(t => dayData?.participantEntityTypes.has(t)),
      showLeagueMarks,
      showEventMarks,
    );
    const typePillTypes = visibleCalendarDayMarkTypes(
      PILL_ENTITY_ORDER.filter(t => dayData?.entityTypes.has(t)),
      showLeagueMarks,
      showEventMarks,
    );
    const dayWeather = weatherByDay.get(dateStr) ?? null;
    const { showWeatherPill, showTypePill } = resolveCalendarDayPillVisibility({
      weatherMode,
      hasGames,
      typePillCount: typePillTypes.length,
      dayWeather,
    });
    const showParticipantPill =
      noEntityFilter && isParticipant && participantTypes.length > 0 && !showTypePill;
    const calendarTags = getTagsForDay(dateStr);

    return {
      dateStr,
      props: {
        day, isCurrentMonth, gameCount, hasGames, showWeatherPill, showTypePill,
        showParticipantPill, typePillTypes, participantTypes, dayWeather, calendarTags,
        isTodayDate: dateStr === todayKey,
      },
    };
  }), [calendarDays, displayedMonth, dateCellData, weatherModeScope, leaguesFilter,
    eventsFilter, noEntityFilter, weatherByDay, weatherMode, getTagsForDay, todayKey]);

  useEffect(() => {
    if (weatherToggleDisabled && weatherMode) {
      setWeatherMode(false);
      writeCalendarWeatherMode(weatherModeScope, false);
    }
  }, [weatherToggleDisabled, weatherMode, weatherModeScope]);

  const handleWeatherModeToggle = () => {
    setWeatherMode((prev) => {
      const next = !prev;
      writeCalendarWeatherMode(weatherModeScope, next);
      return next;
    });
  };

  // Seven Intl-backed formats; they only change with the grid start or locale.
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) =>
      formatShortWeekday(addDays(startDate, index), displaySettings.locale)),
    [startDate, displaySettings.locale],
  );

  return (
    // No `layout` on the root: the collapse/expand below already animates the
    // height that changes, and projecting the whole calendar made every height
    // change in the sections above it (banners, chips, rails) jitter the grid.
    <motion.div
      transition={headerTransition}
      ref={calendarRef}
      data-calendar="true"
      className={`mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 transition-[padding,margin,box-shadow] duration-300 ease-in-out motion-reduce:transition-none ${
        isCompactUpcomings ? 'mb-4 px-1 py-0 shadow-sm' : 'mb-4 px-1 py-2 shadow-lg'
      }`}
    >
      <motion.div
        layout
        transition={headerTransition}
        className={`flex items-center transition-[margin,padding] duration-300 ease-in-out motion-reduce:transition-none ${
          upcomingsToggle
            ? collapsed
              ? 'justify-between gap-2'
              : 'mb-4 justify-between gap-3'
            : 'mb-4 justify-between gap-2'
        }`}
      >
        {upcomingsToggle ? (
          <AnimatePresence initial={false} mode="popLayout">
            {!collapsed ? (
              <motion.div
                key="month-nav"
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={headerTransition}
                className="flex min-w-0 items-center gap-0.5"
              >
                <button
                  type="button"
                  onClick={handlePreviousMonth}
                  className="shrink-0 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
                </button>
                <div className="relative min-w-0 overflow-hidden">
                  <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
                    <motion.h3
                      key={format(displayedMonth, 'yyyy-MM')}
                      custom={slideDirection}
                      variants={monthVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className="truncate text-lg font-semibold capitalize text-gray-900 dark:text-white"
                    >
                      {monthHeaderLabel}
                    </motion.h3>
                  </AnimatePresence>
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="shrink-0 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Next month"
                >
                  <ChevronRight size={20} className="text-gray-700 dark:text-gray-300" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : (
          <>
            <button
              type="button"
              onClick={handlePreviousMonth}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
            <div className="relative overflow-hidden text-center">
              <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
                <motion.h3
                  key={format(displayedMonth, 'yyyy-MM')}
                  custom={slideDirection}
                  variants={monthVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="text-lg font-semibold capitalize text-gray-900 dark:text-white"
                >
                  {monthHeaderLabel}
                </motion.h3>
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-0.5">
              <MonthCalendarWeatherToggle
                active={weatherMode}
                disabled={weatherToggleDisabled}
                onClick={handleWeatherModeToggle}
              />
              <button
                type="button"
                onClick={handleNextMonth}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ChevronRight size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </>
        )}
        {upcomingsToggle ? (
          <>
            <div className="flex shrink-0 items-center gap-0.5">
              {!collapsed ? (
                <MonthCalendarWeatherToggle
                  active={weatherMode}
                  disabled={weatherToggleDisabled}
                  onClick={handleWeatherModeToggle}
                />
              ) : null}
              <motion.button
                layout
                type="button"
                onClick={upcomingsToggle.onClick}
                aria-label={
                  upcomingsToggle.active
                    ? t('games.calendar')
                    : upcomingsToggle.label
                }
                transition={headerTransition}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${
                  isCompactUpcomings ? 'px-3 py-1' : 'px-2.5 py-1.5'
                }`}
              >
                <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={upcomingsToggle.active ? 'calendar-icon' : 'list-icon'}
                      initial={{ opacity: 0, scale: 0.85, y: 3 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85, y: -3 }}
                      transition={headerTransition}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {upcomingsToggle.active ? (
                        <Calendar size={18} strokeWidth={2} aria-hidden />
                      ) : (
                        <List size={18} strokeWidth={2} aria-hidden />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="relative min-w-0 overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={upcomingsToggle.active ? 'calendar-label' : 'upcomings-label'}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={headerTransition}
                      className="flex items-center gap-1"
                    >
                      {upcomingsToggle.active
                        ? t('games.calendar')
                        : upcomingsToggle.label}
                      {upcomingsToggle.active ? (
                        <ChevronRight size={16} strokeWidth={2} aria-hidden />
                      ) : null}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </motion.button>
            </div>
          </>
        ) : null}
      </motion.div>

      {quickShortcuts ? (
        <motion.div
          layout
          transition={headerTransition}
          className={isCompactUpcomings ? 'px-0.5 pb-1.5' : '-mt-1 mb-3 px-0.5'}
        >
          {quickShortcuts}
        </motion.div>
      ) : null}

      <AnimatePresence initial={false}>
        {(!upcomingsToggle || !isCompactUpcomings) ? (
          <motion.div
            key="calendar-body"
            layout={Boolean(upcomingsToggle)}
            initial={upcomingsToggle ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={upcomingsToggle ? { height: 0, opacity: 0 } : undefined}
            transition={headerTransition}
            className={isCompactUpcomings ? 'overflow-hidden' : 'overflow-visible'}
          >
          <div className="grid grid-cols-7 gap-0.5">
            {weekDays.map((day, index) => (
              <div
                key={index}
                className="py-1 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className={`relative ${isSliding ? 'overflow-hidden' : 'overflow-visible'}`}>
            <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
              <motion.div
                key={format(displayedMonth, 'yyyy-MM')}
                custom={slideDirection}
                variants={monthVariants}
                initial="enter"
                animate="center"
                exit="exit"
                onAnimationComplete={(definition) => {
                  if (definition === 'center') setIsSliding(false);
                }}
                className="grid grid-cols-7 gap-0.5 pt-0.5 pb-1"
              >
        {dayCells.map(({ dateStr, props }) => (
          <MonthCalendarDayCell
            key={dateStr}
            {...props}
            isSelected={selectedDayKey === dateStr}
            unreadCount={unreadByDay.get(dateStr) ?? 0}
            locale={displaySettings.locale}
            onSelect={handleDateClick}
          />
        ))}
              </motion.div>
            </AnimatePresence>
          </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
};

/**
 * The grid aggregates games, resolves weather and renders 42 cells, while both
 * hosts (Find and My) re-render on unrelated stores. Callers pass a memoised
 * props object, so a plain shallow compare is enough to skip that work.
 */
export const MonthCalendar = memo(MonthCalendarView);
