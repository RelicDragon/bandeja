import { useState, useMemo, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, getMonth, getYear, startOfDay } from 'date-fns';
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

const PILL_ENTITY_ORDER: DisplayEntityType[] = ['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE', 'BAR'];

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
}

const localeMap = {
  en: enGB,
  ru: ru,
  es: es,
  sr: sr,
  cs: cs,
};

export const MonthCalendar = ({
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
}: MonthCalendarProps) => {
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const headerTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };
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

  const noEntityFilter = !gameFilter && !trainingFilter && !tournamentFilter && !leaguesFilter;

  const findFilterState = useMemo<FindFilterState>(
    () => ({
      filterAvailableSlots,
      filterSuitableRating,
      hideBarGames,
      gameFilter,
      trainingFilter,
      tournamentFilter,
      leaguesFilter,
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
      gamesUnreadCounts,
      cityTimezone,
    );
    if (!dayIndex || dayIndex.length === 0) return fromCards;

    const indexByDay = aggregateFindDayIndexByDay(
      dayIndex,
      findFilterViewer,
      findFilterState,
      cityTimezone,
    );
    return mergeFindDayIndexIntoCardDays(fromCards, indexByDay, gamesUnreadCounts);
  }, [availableGames, dayIndex, findFilterViewer, findFilterState, gamesUnreadCounts, user?.currentCity?.timezone]);

  const notifyMonthChange = (month: Date) => {
    if (onMonthChange) {
      onMonthChange(getMonth(month) + 1, getYear(month));
    }
  };

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

  const handleDateClick = (day: Date) => {
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
  };

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

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(formatShortWeekday(addDays(startDate, i), displaySettings.locale));
  }

  return (
    <motion.div
      layout={Boolean(upcomingsToggle)}
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
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.h3
                      key={format(displayedMonth, 'yyyy-MM')}
                      initial={{ x: slideDirection * 32, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: slideDirection * -32, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
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
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.h3
                  key={format(displayedMonth, 'yyyy-MM')}
                  initial={{ x: slideDirection * 32, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: slideDirection * -32, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
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
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={format(displayedMonth, 'yyyy-MM')}
                initial={{ x: slideDirection * 56 }}
                animate={{ x: 0 }}
                exit={{ x: slideDirection * -56 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                onAnimationComplete={() => setIsSliding(false)}
                className="grid grid-cols-7 gap-0.5 pt-0.5 pb-1"
              >
        {calendarDays.map((day) => {
          const isCurrentMonth = isSameMonth(day, displayedMonth);
          const dateStr = format(startOfDay(day), 'yyyy-MM-dd');
          const isSelected = selectedDayKey != null && dateStr === selectedDayKey;
          const isTodayDate = isToday(day);
          const dayData = dateCellData.get(dateStr) || { gameCount: 0, unreadCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };
          const gameCount = dayData.gameCount;
          const unreadCount = dayData.unreadCount;
          const hasGames = gameCount > 0;
          const isParticipant = dayData.isUserParticipant;
          const showLeagueMarks = weatherModeScope === 'my' || leaguesFilter;
          const participantTypes = visibleCalendarDayMarkTypes(
            PILL_ENTITY_ORDER.filter(t => dayData.participantEntityTypes.has(t)),
            showLeagueMarks,
          );
          const typePillTypes = visibleCalendarDayMarkTypes(
            PILL_ENTITY_ORDER.filter(t => dayData.entityTypes.has(t)),
            showLeagueMarks,
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

          return (
            <MonthCalendarDayCell
              key={dateStr}
              day={day}
              isCurrentMonth={isCurrentMonth}
              isSelected={isSelected}
              isTodayDate={isTodayDate}
              gameCount={gameCount}
              unreadCount={unreadCount}
              hasGames={hasGames}
              showWeatherPill={showWeatherPill}
              showTypePill={showTypePill}
              showParticipantPill={showParticipantPill}
              typePillTypes={typePillTypes}
              participantTypes={participantTypes}
              dayWeather={dayWeather}
              locale={displaySettings.locale}
              calendarTags={calendarTags}
              onSelect={handleDateClick}
            />
          );
        })}
              </motion.div>
            </AnimatePresence>
          </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
};
