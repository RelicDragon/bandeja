import { useState, useMemo, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, List, Users, Swords, Dumbbell, Trophy, Beer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, getMonth, getYear, startOfDay } from 'date-fns';
import { enGB, ru, es, sr, cs } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatShortWeekday, formatCompactMonthHeader } from '@/utils/dateFormat';
import { passesAvailableGamePanelFilters,
  DEFAULT_AVAILABLE_GAME_PANEL_FILTERS,
  type AvailableGamePanelFilterState,
} from '@/utils/availableGamePanelFilters';
import { useUnreadStore } from '@/store/unreadStore';
import { gameUnreadCountsMap } from '@/utils/unreadCountsFromStore';
import { passesFindNoRatingFilter } from '@/utils/findDiscovery';
import {
  passesFindAvailableSlotsFilter,
  passesFindHideBarGamesFilter,
  passesFindSuitableRatingFilter,
} from '@/utils/findAvailabilityFilters';

type DisplayEntityType = 'GAME' | 'TOURNAMENT' | 'TRAINING' | 'LEAGUE' | 'BAR';

const ENTITY_ICONS: Record<DisplayEntityType, typeof Users> = {
  GAME: Users,
  TOURNAMENT: Swords,
  TRAINING: Dumbbell,
  LEAGUE: Trophy,
  BAR: Beer,
};

const PILL_ENTITY_ORDER: DisplayEntityType[] = ['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE', 'BAR'];

const ENTITY_ICON_CLASS: Record<DisplayEntityType, string> = {
  GAME: 'text-gray-900 dark:text-gray-200',
  TOURNAMENT: 'text-red-500 dark:text-red-400',
  TRAINING: 'text-green-500 dark:text-green-400',
  LEAGUE: 'text-blue-500 dark:text-blue-400',
  BAR: 'text-yellow-500 dark:text-yellow-400',
};

function toDisplayEntityType(entityType: Game['entityType']): DisplayEntityType {
  return entityType === 'LEAGUE_SEASON' ? 'LEAGUE' : entityType;
}

export interface MonthCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  availableGames: Game[];
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
  upcomingsToggle,
}: MonthCalendarProps) => {
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const headerTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] as const };
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const [slideDirection, setSlideDirection] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const isNavigatingRef = useRef(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const displaySettings = useMemo(() => user ? resolveDisplaySettings(user) : resolveDisplaySettings(null), [user]);
  // Subscribe to a shallow-stable record of ONLY this calendar's game ids, not the
  // whole byContext map, so the calendar re-renders only when one of these games'
  // counts changes.
  const gamesUnreadCounts = useUnreadStore(
    useShallow((s) => gameUnreadCountsMap(availableGames.map((g) => g.id), s.byContext))
  );
  const locale = useMemo(() => {
    return localeMap[i18n.language as keyof typeof localeMap] || enGB;
  }, [i18n.language]);
  const weekStartsOn = useMemo(() => displaySettings.weekStart, [displaySettings.weekStart]);
  const monthHeaderLabel = useMemo(
    () => formatCompactMonthHeader(currentMonth, i18n.language),
    [currentMonth, i18n.language],
  );

  useEffect(() => {
    if (!isNavigatingRef.current && selectedDate) {
      const newMonth = startOfMonth(selectedDate);
      if (!isSameMonth(newMonth, currentMonth)) {
        setSlideDirection(newMonth > currentMonth ? 1 : -1);
        setIsSliding(true);
        setCurrentMonth(newMonth);
      }
    }
    isNavigatingRef.current = false;
  }, [selectedDate, currentMonth]);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const startDate = useMemo(() => startOfWeek(monthStart, { locale, weekStartsOn }), [monthStart, locale, weekStartsOn]);
  const endDate = useMemo(() => endOfWeek(monthEnd, { locale, weekStartsOn }), [monthEnd, locale, weekStartsOn]);

  const noEntityFilter = !gameFilter && !trainingFilter && !tournamentFilter && !leaguesFilter;

  const dateCellData = useMemo(() => {
    const dataMap = new Map<string, { gameCount: number; unreadCount: number; hasLeagueTournament: boolean; isUserParticipant: boolean; hasTraining: boolean; participantEntityTypes: Set<DisplayEntityType>; entityTypes: Set<DisplayEntityType> }>();

    availableGames.forEach(game => {
      if (game.timeIsSet === false) return;

      if (!passesAvailableGamePanelFilters(game, panelFilters)) return;

      if (findDiscoveryEnabled) {
        if (!passesFindNoRatingFilter(game, filterNoRating)) return;
      }

      if (!passesFindHideBarGamesFilter(game, hideBarGames)) return;

      const organizer = game.entityType === 'TRAINING'
        ? (game.trainerId ? game.participants?.find((p: any) => p.userId === game.trainerId) : null) || game.participants?.find((p: any) => p.role === 'OWNER')
        : game.participants?.find((p: any) => p.role === 'OWNER');
      if (organizer && user?.blockedUserIds?.includes(organizer.userId)) return;

      const gameDate = format(startOfDay(new Date(game.startTime)), 'yyyy-MM-dd');
      const isPublic = game.isPublic;
      const isUserParticipantInGame = user?.id && game.participants.some((p: any) => p.userId === user.id);
      const isLeagueGame = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';

      const showPrivateAsAdmin = isAdmin && showPrivateGames;
      if (!isPublic && !isUserParticipantInGame && !(leaguesFilter && isLeagueGame) && !showPrivateAsAdmin) {
        return;
      }

      if (isUserParticipantInGame) {
        const existing = dataMap.get(gameDate) || { gameCount: 0, unreadCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };
        existing.participantEntityTypes.add(toDisplayEntityType(game.entityType));
        dataMap.set(gameDate, existing);
      }

      if (filterAvailableSlots && !passesFindAvailableSlotsFilter(game, user)) {
        return;
      }

      if (filterSuitableRating && !passesFindSuitableRatingFilter(game, user)) {
        return;
      }

      if (gameFilter && game.entityType !== 'GAME') {
        return;
      }

      if (trainingFilter && game.entityType !== 'TRAINING') {
        return;
      }

      if (trainingFilter && favoriteTrainerId) {
        const trainer = game.trainerId === favoriteTrainerId ? game.participants?.find((p: any) => p.userId === favoriteTrainerId) : null;
        if (!trainer) return;
      }

      if (tournamentFilter && game.entityType !== 'TOURNAMENT') {
        return;
      }

      if (leaguesFilter && !isLeagueGame) {
        return;
      }

      const existing = dataMap.get(gameDate) || { gameCount: 0, unreadCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };

      existing.gameCount++;
      existing.unreadCount += gamesUnreadCounts[game.id] || 0;
      existing.entityTypes.add(toDisplayEntityType(game.entityType));

      if (game.entityType === 'TOURNAMENT' || game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') {
        existing.hasLeagueTournament = true;
      }

      if (game.entityType === 'TRAINING') {
        existing.hasTraining = true;
      }

      if (isUserParticipantInGame) {
        existing.isUserParticipant = true;
      }

      dataMap.set(gameDate, existing);
    });

    return dataMap;
  }, [availableGames, filterAvailableSlots, filterSuitableRating, hideBarGames, gameFilter, trainingFilter, tournamentFilter, leaguesFilter, favoriteTrainerId, user, panelFilters, showPrivateGames, isAdmin, gamesUnreadCounts, findDiscoveryEnabled, filterNoRating]);

  const handlePreviousMonth = () => {
    isNavigatingRef.current = true;
    const newMonth = subMonths(currentMonth, 1);
    setSlideDirection(-1);
    setIsSliding(true);
    setCurrentMonth(newMonth);
    if (onMonthChange) {
      onMonthChange(getMonth(newMonth) + 1, getYear(newMonth));
    }
  };

  const handleNextMonth = () => {
    isNavigatingRef.current = true;
    const newMonth = addMonths(currentMonth, 1);
    setSlideDirection(1);
    setIsSliding(true);
    setCurrentMonth(newMonth);
    if (onMonthChange) {
      onMonthChange(getMonth(newMonth) + 1, getYear(newMonth));
    }
  };

  const handleDateClick = (day: Date) => {
    const crossesMonth = !isSameMonth(day, currentMonth);
    if (crossesMonth) {
      isNavigatingRef.current = true;
    }

    onDateSelect(day);

    if (crossesMonth) {
      const newMonth = startOfMonth(day);
      setSlideDirection(newMonth > currentMonth ? 1 : -1);
      setIsSliding(true);
      setCurrentMonth(newMonth);
      if (onMonthChange) {
        onMonthChange(getMonth(newMonth) + 1, getYear(newMonth));
      }
    }

    if (calendarRef.current) {
      const rect = calendarRef.current.getBoundingClientRect();
      const header = document.querySelector('header');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const currentScrollY = window.scrollY || window.pageYOffset;
      const targetScrollY = currentScrollY + rect.top - headerHeight;

      window.scrollTo({
        top: Math.max(0, targetScrollY),
        behavior: 'smooth'
      });
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

  const calendarDays = [];
  let day = startDate;
  while (day <= endDate) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(formatShortWeekday(addDays(startDate, i), displaySettings.locale));
  }

  const isCompactUpcomings = collapsed && Boolean(upcomingsToggle);

  return (
    <motion.div
      layout={Boolean(upcomingsToggle)}
      transition={headerTransition}
      ref={calendarRef}
      data-calendar="true"
      className={`mx-auto max-w-md rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 transition-[padding,margin,box-shadow] duration-300 ease-in-out motion-reduce:transition-none ${
        isCompactUpcomings ? 'mb-4 px-2 py-0 shadow-sm' : 'mb-4 p-4 shadow-lg'
      }`}
    >
      <motion.div
        layout
        transition={headerTransition}
        className={`flex items-center transition-[margin,padding] duration-300 ease-in-out motion-reduce:transition-none ${
          upcomingsToggle
            ? collapsed
              ? 'justify-center'
              : 'mb-4 justify-between gap-3'
            : 'mb-4 justify-between'
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
                      key={format(currentMonth, 'yyyy-MM')}
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
                  key={format(currentMonth, 'yyyy-MM')}
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
            <button
              type="button"
              onClick={handleNextMonth}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRight size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
          </>
        )}
        {upcomingsToggle ? (
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
          <div className="grid grid-cols-7 gap-1 px-1.5">
            {weekDays.map((day, index) => (
              <div
                key={index}
                className="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className={`relative ${isSliding ? 'overflow-hidden' : 'overflow-visible'}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={format(currentMonth, 'yyyy-MM')}
                initial={{ x: slideDirection * 56, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: slideDirection * -56, opacity: 0 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                onAnimationComplete={() => setIsSliding(false)}
                className="grid grid-cols-7 gap-1 px-1.5 pt-1.5 pb-3"
              >
        {calendarDays.map((day, index) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate != null && isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);
          const dateStr = format(startOfDay(day), 'yyyy-MM-dd');
          const dayData = dateCellData.get(dateStr) || { gameCount: 0, unreadCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };
          const gameCount = dayData.gameCount;
          const unreadCount = dayData.unreadCount;
          const hasGames = gameCount > 0;
          const isParticipant = dayData.isUserParticipant;
          const participantTypes = PILL_ENTITY_ORDER.filter(t => dayData.participantEntityTypes.has(t));
          const showParticipantPill = noEntityFilter && isParticipant && participantTypes.length > 0;
          const typePillTypes = PILL_ENTITY_ORDER.filter(t => dayData.entityTypes.has(t));
          const showTypePill = hasGames && typePillTypes.length > 0;

          return (
            <button
              key={index}
              onClick={() => handleDateClick(day)}
              className={`
                relative w-full p-2 rounded-lg text-sm flex flex-col items-center justify-center gap-0.5
                transition-colors duration-300 ease-out
                ${isSelected
                  ? 'bg-primary-500 text-white font-semibold scale-[1.1] z-10'
                  : !isCurrentMonth
                  ? `text-gray-400 dark:text-gray-500 ${hasGames ? 'border border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100 dark:hover:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`
                  : isTodayDate
                  ? `bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold border ${
                      hasGames
                        ? 'border-green-500 dark:border-green-400'
                        : 'border-primary-300 dark:border-primary-700'
                    }`
                  : hasGames
                  ? 'bg-green-200 dark:bg-green-800/40 text-gray-700 dark:text-gray-300 border border-green-400 dark:border-green-500 hover:bg-green-300 dark:hover:bg-green-800/60'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
              style={{
                aspectRatio: '1 / 1',
                minHeight: 0,
              }}
            >
              <span>{format(day, 'd')}</span>
              {unreadCount > 0 && (
                <div
                  className={`
                    absolute -top-0 left-1/2 z-10 h-2 w-2 -translate-x-1/2 rounded-full
                    border border-white dark:border-gray-900 calendar-unread-dot
                    bg-red-500 dark:bg-red-400
                    ${!isCurrentMonth ? 'opacity-60' : ''}
                  `}
                  aria-hidden
                />
              )}
              {gameCount > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`
                  absolute -top-1 -right-1 flex items-center justify-center
                  min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
                  ${!isCurrentMonth
                    ? 'bg-gray-400 dark:bg-gray-600 text-gray-300 dark:text-gray-400'
                    : isSelected
                    ? 'bg-white text-primary-500 border border-primary-500'
                    : 'bg-green-500 dark:bg-green-600 text-white'
                  }
                `}>
                  {gameCount}
                </motion.span>
              )}
              {showTypePill && (
                <span className={`
                  absolute -bottom-1.5 left-1/2 -translate-x-1/2
                  inline-flex items-center justify-center
                  gap-0.5 px-1 py-0.5 rounded-full w-fit
                  border shadow-md
                  bg-amber-50 dark:bg-gray-800 border-amber-200/60 dark:border-gray-600
                `}>
                  {typePillTypes.map((t) => {
                    const Icon = ENTITY_ICONS[t];
                    const iconClass = ENTITY_ICON_CLASS[t];
                    return Icon ? <Icon key={t} size={10} className={`shrink-0 ${iconClass}`} /> : null;
                  })}
                </span>
              )}
              {showParticipantPill && !showTypePill && (
                <span className={`
                  absolute -bottom-1.5 left-1/2 -translate-x-1/2
                  inline-flex items-center justify-center
                  gap-0.5 px-0.5 py-0.5 rounded-full w-fit
                  border shadow-sm
                  ${!isCurrentMonth
                    ? 'bg-gray-400/80 dark:bg-gray-600/80 border-gray-500/50 dark:border-gray-500/50'
                    : isSelected
                    ? 'bg-white/95 text-primary-600 border-primary-200 dark:border-primary-700'
                    : 'bg-yellow-500/95 dark:bg-yellow-600/95 text-white border-yellow-600/50 dark:border-yellow-500/50'
                  }
                `}>
                  {participantTypes.map((t) => {
                    const Icon = ENTITY_ICONS[t];
                    return Icon ? <Icon key={t} size={10} className="shrink-0" /> : null;
                  })}
                </span>
              )}
            </button>
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
