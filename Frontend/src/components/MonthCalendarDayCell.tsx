import { format } from 'date-fns';
import { StatusPulseDot } from '@/components/StatusPulseDot';
import { CalendarDayTypeDots } from '@/components/calendarDayTypeDots';
import type { FindDisplayEntityType } from '@/utils/findFilter';
import type { CalendarDayWeather } from '@/utils/calendarWeather.util';
import { formatWeatherTemperature } from '@/utils/weather';

export interface MonthCalendarDayCellProps {
  day: Date;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isTodayDate: boolean;
  gameCount: number;
  unreadCount: number;
  hasGames: boolean;
  showWeatherPill: boolean;
  showTypePill: boolean;
  showParticipantPill: boolean;
  typePillTypes: FindDisplayEntityType[];
  participantTypes: FindDisplayEntityType[];
  dayWeather: CalendarDayWeather | null;
  locale: string;
  onSelect: (day: Date) => void;
}

export function MonthCalendarDayCell({
  day,
  isCurrentMonth,
  isSelected,
  isTodayDate,
  gameCount,
  unreadCount,
  hasGames,
  showWeatherPill,
  showTypePill,
  showParticipantPill,
  typePillTypes,
  participantTypes,
  dayWeather,
  locale,
  onSelect,
}: MonthCalendarDayCellProps) {
  const markTypes = showTypePill ? typePillTypes : showParticipantPill ? participantTypes : [];
  const weatherLabel = showWeatherPill && dayWeather
    ? formatWeatherTemperature(dayWeather.point, { locale, compact: true })
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-selected={isSelected}
      aria-current={isTodayDate ? 'date' : undefined}
      className={`
        relative flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-md px-0.5 py-1
        transition-colors duration-300 ease-out
        ${isSelected
          ? 'z-10 bg-primary-500 font-semibold text-white'
          : !isCurrentMonth
          ? `text-gray-400 dark:text-gray-500 ${hasGames ? 'bg-gray-100/80 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`
          : isTodayDate
          ? `bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 ${
              hasGames ? 'ring-1 ring-inset ring-green-500 dark:ring-green-400' : ''
            }`
          : hasGames
          ? 'bg-green-200 text-gray-800 hover:bg-green-300 dark:bg-green-800/50 dark:text-gray-100 dark:hover:bg-green-800/70'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
        }
      `}
    >
      {unreadCount > 0 ? (
        <StatusPulseDot
          className={`absolute right-0.5 top-0.5 ${!isCurrentMonth ? 'opacity-60' : ''}`}
        />
      ) : null}
      <span className="text-[13px] font-semibold leading-none tabular-nums">
        {format(day, 'd')}
      </span>
      {gameCount > 0 || weatherLabel || markTypes.length > 0 ? (
        <span className="flex max-w-full items-center justify-center gap-0.5 leading-none">
          {gameCount > 0 ? (
            <span
              className={`text-[9px] font-bold tabular-nums ${
                isSelected
                  ? 'text-white/90'
                  : !isCurrentMonth
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-green-700 dark:text-green-300'
              }`}
            >
              {gameCount}
            </span>
          ) : null}
          {weatherLabel ? (
            <span
              className={`text-[9px] font-semibold tabular-nums ${
                isSelected ? 'text-white/90' : 'text-sky-700 dark:text-sky-300'
              }`}
            >
              {weatherLabel}
            </span>
          ) : null}
          {markTypes.length > 0 ? (
            <CalendarDayTypeDots
              types={markTypes}
              inverted={isSelected}
            />
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
