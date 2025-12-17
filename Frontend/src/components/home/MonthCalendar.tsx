import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Star } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, getMonth, getYear, startOfDay } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';

interface MonthCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  availableGames: Game[];
  filterByLevel?: boolean;
  filterByAvailableSlots?: boolean;
  user?: any;
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
  filterByLevel = false,
  filterByAvailableSlots = true,
  user,
  onMonthChange,
  onDateRangeChange,
}: MonthCalendarProps) => {
  const { i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const isNavigatingRef = useRef(false);
  const [visibleDays, setVisibleDays] = useState<Set<number>>(new Set());
  const animationTriggerRef = useRef(0);

  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enUS, [i18n.language]);

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
  const startDate = useMemo(() => startOfWeek(monthStart, { locale }), [monthStart, locale]);
  const endDate = useMemo(() => endOfWeek(monthEnd, { locale }), [monthEnd, locale]);

  const dateCellData = useMemo(() => {
    const dataMap = new Map<string, { gameCount: number; hasLeagueTournament: boolean; isUserParticipant: boolean }>();
    
    availableGames.forEach(game => {
      const gameDate = format(startOfDay(new Date(game.startTime)), 'yyyy-MM-dd');
      const isPublic = game.isPublic;
      const isUserParticipantInGame = user?.id && game.participants.some((p: any) => p.userId === user.id);
      
      if (!isPublic && !isUserParticipantInGame) {
        return;
      }

      if (filterByAvailableSlots && game.participants.length >= game.maxParticipants) {
        return;
      }

      if (filterByLevel && user?.level) {
        const userLevel = user.level;
        const minLevel = game.minLevel || 0;
        const maxLevel = game.maxLevel || 10;
        
        if (userLevel < minLevel || userLevel > maxLevel) {
          return;
        }
      }

      const existing = dataMap.get(gameDate) || { gameCount: 0, hasLeagueTournament: false, isUserParticipant: false };
      
      existing.gameCount++;
      
      if (game.entityType === 'TOURNAMENT' || game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') {
        existing.hasLeagueTournament = true;
      }
      
      if (isUserParticipantInGame) {
        existing.isUserParticipant = true;
      }
      
      dataMap.set(gameDate, existing);
    });

    return dataMap;
  }, [availableGames, filterByLevel, filterByAvailableSlots, user?.id, user?.level]);

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

  useEffect(() => {
    setVisibleDays(new Set());
    animationTriggerRef.current++;
    const currentTrigger = animationTriggerRef.current;
    
    const calendarDays = [];
    let day = startDate;
    while (day <= endDate) {
      calendarDays.push(day);
      day = addDays(day, 1);
    }

    calendarDays.forEach((_, index) => {
      setTimeout(() => {
        if (currentTrigger === animationTriggerRef.current) {
          setVisibleDays(prev => new Set([...prev, index]));
        }
      }, index * 20);
    });

    return () => {
      animationTriggerRef.current++;
    };
  }, [startDate, endDate, dateCellData]);

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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 mb-4 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePreviousMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {format(currentMonth, 'MMMM yyyy', { locale })}
        </h3>
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
          const dayData = dateCellData.get(dateStr) || { gameCount: 0, hasLeagueTournament: false, isUserParticipant: false };
          const gameCount = dayData.gameCount;
          const hasGames = gameCount > 0;
          const hasLeagueTournament = dayData.hasLeagueTournament;
          const isParticipant = dayData.isUserParticipant;

          return (
            <button
              key={index}
              onClick={() => handleDateClick(day)}
              className={`
                relative w-full p-2 rounded-lg text-sm transition-all flex items-center justify-center
                ${!isCurrentMonth 
                  ? `text-gray-300 dark:text-gray-600 cursor-not-allowed ${hasGames ? 'border-2 border-gray-300/50 dark:border-gray-600/50' : ''}` 
                  : isSelected
                  ? 'bg-primary-500 text-white font-semibold scale-[1.1] z-10'
                  : isTodayDate
                  ? `bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold border-2 ${
                      hasGames 
                        ? 'border-green-500 dark:border-green-400' 
                        : 'border-primary-300 dark:border-primary-700'
                    }`
                  : hasGames
                  ? 'bg-green-200 dark:bg-green-800/40 text-gray-700 dark:text-gray-300 border-2 border-green-400 dark:border-green-500 hover:bg-green-300 dark:hover:bg-green-800/60'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
              style={{
                aspectRatio: '1 / 1',
                minHeight: 0,
              }}
            >
              {isParticipant && (
                <span className={`
                  absolute -top-1 -left-1 flex items-center justify-center
                  w-[18px] h-[18px] rounded-full
                  transition-all duration-300
                  ${visibleDays.has(index) ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                  ${!isCurrentMonth
                    ? 'bg-gray-400 dark:bg-gray-600'
                    : isSelected 
                    ? 'bg-white text-primary-500 border-2 border-primary-500' 
                    : 'bg-yellow-500 dark:bg-yellow-600 text-white'
                  }
                `}>
                  <Star 
                    size={12} 
                    className={`
                      ${!isCurrentMonth
                        ? 'text-gray-300 dark:text-gray-400'
                        : isSelected 
                        ? 'text-primary-500' 
                        : 'text-white'
                      }
                    `}
                    fill="currentColor"
                  />
                </span>
              )}
              <span>{format(day, 'd')}</span>
              {gameCount > 0 && (
                <span className={`
                  absolute -top-1 -right-1 flex items-center justify-center
                  min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
                  transition-all duration-300
                  ${visibleDays.has(index) ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                  ${!isCurrentMonth
                    ? 'bg-gray-400 dark:bg-gray-600 text-gray-300 dark:text-gray-400'
                    : isSelected 
                    ? 'bg-white text-primary-500 border-2 border-primary-500'
                    : 'bg-green-500 dark:bg-green-600 text-white'
                  }
                `}>
                  {gameCount}
                </span>
              )}
              {hasLeagueTournament && (
                <span className={`
                  absolute -bottom-1 -right-1 flex items-center justify-center
                  w-[18px] h-[18px] rounded-full
                  transition-all duration-300
                  ${visibleDays.has(index) ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                  ${!isCurrentMonth
                    ? 'bg-gray-400 dark:bg-gray-600'
                    : isSelected 
                    ? 'bg-white text-primary-500 border-2 border-primary-500' 
                    : 'bg-green-500 dark:bg-green-600 text-white'
                  }
                `}>
                  <Trophy 
                    size={12} 
                    className={`
                      ${!isCurrentMonth
                        ? 'text-gray-300 dark:text-gray-400'
                        : isSelected 
                        ? 'text-primary-500' 
                        : 'text-white'
                      }
                    `}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
