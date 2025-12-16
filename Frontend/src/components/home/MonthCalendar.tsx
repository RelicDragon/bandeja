import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, getMonth, getYear } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';

interface MonthCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  availableGames: Game[];
  filterByLevel?: boolean;
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
  user,
  onMonthChange,
  onDateRangeChange,
}: MonthCalendarProps) => {
  const { i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const isNavigatingRef = useRef(false);

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

  const getGameCountForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return availableGames.filter(game => {
      const gameDate = format(new Date(game.startTime), 'yyyy-MM-dd');
      if (gameDate !== dateStr) {
        return false;
      }

      if (filterByLevel && user?.level) {
        const userLevel = user.level;
        const minLevel = game.minLevel || 0;
        const maxLevel = game.maxLevel || 10;
        
        if (userLevel < minLevel || userLevel > maxLevel) {
          return false;
        }
      }

      return true;
    }).length;
  };

  const hasLeagueTournamentOnDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return availableGames.some(game => {
      const gameDate = format(new Date(game.startTime), 'yyyy-MM-dd');
      if (gameDate !== dateStr) {
        return false;
      }

      if (filterByLevel && user?.level) {
        const userLevel = user.level;
        const minLevel = game.minLevel || 0;
        const maxLevel = game.maxLevel || 10;
        
        if (userLevel < minLevel || userLevel > maxLevel) {
          return false;
        }
      }

      return game.entityType === 'TOURNAMENT' || game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';
    });
  };

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

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const startDate = useMemo(() => startOfWeek(monthStart, { locale }), [monthStart, locale]);
  const endDate = useMemo(() => endOfWeek(monthEnd, { locale }), [monthEnd, locale]);

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
          const gameCount = getGameCountForDate(day);
          const hasGames = gameCount > 0;
          const hasLeagueTournament = hasLeagueTournamentOnDate(day);

          return (
            <button
              key={index}
              onClick={() => handleDateClick(day)}
              className={`
                relative aspect-square p-2 rounded-lg text-sm transition-all
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
            >
              <div className="flex items-center justify-center h-full w-full">
                <span>{format(day, 'd')}</span>
              </div>
              {gameCount > 0 && (
                <span className={`
                  absolute -top-1 -right-1 flex items-center justify-center
                  min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
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
