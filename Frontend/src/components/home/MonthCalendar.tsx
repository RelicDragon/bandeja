import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Users, Swords, Dumbbell, Trophy, Beer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, getMonth, getYear, startOfDay } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';

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

interface MonthCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  availableGames: Game[];
  userFilter?: boolean;
  gameFilter?: boolean;
  trainingFilter?: boolean;
  tournamentFilter?: boolean;
  leaguesFilter?: boolean;
  favoriteTrainerId?: string | null;
  onMonthChange?: (month: number, year: number) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
}

const localeMap = {
  en: enUS,
  ru: ru,
  es: es,
  sr: sr,
};

export const MonthCalendar = ({
  selectedDate,
  onDateSelect,
  availableGames,
  userFilter = false,
  gameFilter = false,
  trainingFilter = false,
  tournamentFilter = false,
  leaguesFilter = false,
  favoriteTrainerId,
  onMonthChange,
  onDateRangeChange,
}: MonthCalendarProps) => {
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const isNavigatingRef = useRef(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const displaySettings = useMemo(() => user ? resolveDisplaySettings(user) : resolveDisplaySettings(null), [user]);
  const locale = useMemo(() => {
    return localeMap[i18n.language as keyof typeof localeMap] || enUS;
  }, [i18n.language]);
  const weekStartsOn = useMemo(() => displaySettings.weekStart, [displaySettings.weekStart]);

  useEffect(() => {
    if (!isNavigatingRef.current) {
      const newMonth = startOfMonth(selectedDate);
      if (!isSameMonth(newMonth, currentMonth)) {
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
    const dataMap = new Map<string, { gameCount: number; hasLeagueTournament: boolean; isUserParticipant: boolean; hasTraining: boolean; participantEntityTypes: Set<DisplayEntityType>; entityTypes: Set<DisplayEntityType> }>();
    
    availableGames.forEach(game => {
      if (game.timeIsSet === false) return;

      const organizer = game.entityType === 'TRAINING'
        ? (game.trainerId ? game.participants?.find((p: any) => p.userId === game.trainerId) : null) || game.participants?.find((p: any) => p.role === 'OWNER')
        : game.participants?.find((p: any) => p.role === 'OWNER');
      if (organizer && user?.blockedUserIds?.includes(organizer.userId)) return;

      const gameDate = format(startOfDay(new Date(game.startTime)), 'yyyy-MM-dd');
      const isPublic = game.isPublic;
      const isUserParticipantInGame = user?.id && game.participants.some((p: any) => p.userId === user.id);
      const isLeagueGame = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';

      if (!isPublic && !isUserParticipantInGame && !(leaguesFilter && isLeagueGame)) {
        return;
      }

      if (isUserParticipantInGame) {
        const existing = dataMap.get(gameDate) || { gameCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };
        existing.participantEntityTypes.add(toDisplayEntityType(game.entityType));
        dataMap.set(gameDate, existing);
      }

      if (userFilter) {
        const slotCount = game.participants?.filter((p: any) => p.status === 'PLAYING').length ?? 0;
        if (slotCount >= game.maxParticipants) {
          return;
        }

        if (user?.level) {
          const userLevel = user.level;
          const minLevel = game.minLevel || 0;
          const maxLevel = game.maxLevel || 10;
          
          if (userLevel < minLevel || userLevel > maxLevel) {
            return;
          }
        }
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

      const existing = dataMap.get(gameDate) || { gameCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };
      
      existing.gameCount++;
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
  }, [availableGames, userFilter, gameFilter, trainingFilter, tournamentFilter, leaguesFilter, favoriteTrainerId, user?.id, user?.level, user?.blockedUserIds]);

  const handlePreviousMonth = () => {
    isNavigatingRef.current = true;
    const newMonth = subMonths(currentMonth, 1);
    setCurrentMonth(newMonth);
    if (onMonthChange) {
      onMonthChange(getMonth(newMonth) + 1, getYear(newMonth));
    }
  };

  const handleNextMonth = () => {
    isNavigatingRef.current = true;
    const newMonth = addMonths(currentMonth, 1);
    setCurrentMonth(newMonth);
    if (onMonthChange) {
      onMonthChange(getMonth(newMonth) + 1, getYear(newMonth));
    }
  };

  const handleDateClick = (day: Date) => {
    onDateSelect(day);
    
    if (!isSameMonth(day, currentMonth)) {
      isNavigatingRef.current = true;
      const newMonth = startOfMonth(day);
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
    weekDays.push(format(addDays(startDate, i), 'EEE', { locale }));
  }

  return (
    <div ref={calendarRef} data-calendar="true" className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 mb-4 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePreviousMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
          {format(currentMonth, 'LLLL yyyy', { locale })}
        </h3>
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronRight size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, index) => (
          <div
            key={index}
            className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);
          const dateStr = format(startOfDay(day), 'yyyy-MM-dd');
          const dayData = dateCellData.get(dateStr) || { gameCount: 0, hasLeagueTournament: false, isUserParticipant: false, hasTraining: false, participantEntityTypes: new Set<DisplayEntityType>(), entityTypes: new Set<DisplayEntityType>() };
          const gameCount = dayData.gameCount;
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
                ${!isCurrentMonth 
                  ? `text-gray-300 dark:text-gray-600 cursor-not-allowed ${hasGames ? 'border border-gray-300/50 dark:border-gray-600/50' : ''}` 
                  : isSelected
                  ? 'bg-primary-500 text-white font-semibold scale-[1.1] z-10'
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
              {gameCount > 0 && (
                <span className={`
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
                </span>
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
      </div>
    </div>
  );
};
