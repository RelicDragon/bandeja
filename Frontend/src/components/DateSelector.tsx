import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { enGB, ru, es, sr, cs } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { formatShortWeekday } from '@/utils/dateFormat';

interface DateSelectorProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onCalendarClick: () => void;
  showCalendarAsSelected?: boolean;
  hideTodayIfNoSlots?: boolean;
  hasTimeSlotsForToday?: boolean;
  hideCurrentDateIndicator?: boolean;
  fixedDates?: Date[];
  hideCalendar?: boolean;
}

const localeMap = {
  en: enGB,
  ru: ru,
  es: es,
  sr: sr,
  cs: cs,
};

const dateFormatMap: Record<string, string> = {
  en: 'MM/dd/yyyy',
  ru: 'dd.MM.yyyy',
  es: 'dd/MM/yyyy',
  sr: 'dd.MM.yyyy',
  cs: 'dd.MM.yyyy',
};

export const DateSelector = ({
  selectedDate,
  onDateSelect,
  onCalendarClick,
  showCalendarAsSelected,
  hideTodayIfNoSlots = false,
  hasTimeSlotsForToday = true,
  hideCurrentDateIndicator = false,
  fixedDates: fixedDatesProp,
  hideCalendar = false,
}: DateSelectorProps) => {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtLeft, setIsAtLeft] = useState(true);

  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enGB, [i18n.language]);
  const dateFormat = useMemo(() => dateFormatMap[i18n.language] || 'MM/dd/yyyy', [i18n.language]);

  const updateScrollEdges = () => {
    if (scrollContainerRef.current) {
      setIsAtLeft(scrollContainerRef.current.scrollLeft <= 10);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const selected = container.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (selected) {
      const scrollLeft =
        selected.offsetLeft - (container.clientWidth - selected.offsetWidth) / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'instant' });
    }
    updateScrollEdges();
  }, [selectedDate]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateScrollEdges);
    updateScrollEdges();
    return () => container.removeEventListener('scroll', updateScrollEdges);
  }, []);

  const startDate = hideTodayIfNoSlots && !hasTimeSlotsForToday ? addDays(new Date(), 1) : new Date();
  const fixedDates =
    fixedDatesProp ?? Array.from({ length: 8 }, (_, i) => addDays(startDate, i));

  const handlePrevious = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: 0,
        behavior: 'smooth'
      });
    }
  };

  const handleNext = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: scrollContainerRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  };

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return t('createGame.today');
    if (isTomorrow(date)) return t('createGame.tomorrow');
    return formatShortWeekday(date, i18n.language);
  };

  const isDateEmphasized = (date: Date) => {
    if (hideCurrentDateIndicator) {
      return false;
    }
    // Emphasize today if it's available, otherwise emphasize the first date
    if (isToday(date) && hasTimeSlotsForToday && !hideTodayIfNoSlots) {
      return true;
    }
    // If today is not available, emphasize the first date (tomorrow)
    return format(date, 'yyyy-MM-dd') === format(fixedDates[0], 'yyyy-MM-dd');
  };

  return (
    <div className="relative flex items-center">
      {!isAtLeft && (
        <button
          onClick={handlePrevious}
          className="absolute left-0 z-10 p-2 rounded-full bg-white dark:bg-gray-900 shadow-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
      )}

      <div ref={scrollContainerRef} className={`flex gap-1.5 overflow-x-auto flex-1 scrollbar-hide py-0.5 pr-12 ${isAtLeft ? 'pl-0' : 'pl-12'}`}>
        {fixedDates.map((date, index) => {
          const isSelected = format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
          const emphasized = isDateEmphasized(date);

          return (
            <button
              key={index}
              data-selected={isSelected || undefined}
              onClick={() => onDateSelect(date)}
              className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-2.5 py-2 rounded-xl min-w-[64px] text-center border transition-all duration-150 active:scale-[0.96] ${
                isSelected
                  ? 'bg-primary-500 border-primary-500 text-white shadow-md shadow-primary-500/25'
                  : emphasized
                  ? 'bg-primary-50 dark:bg-primary-950/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-700'
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide leading-none ${
                  isSelected
                    ? 'text-white/85'
                    : emphasized
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {getDateLabel(date)}
              </span>
              <span className="text-xl font-bold leading-tight tabular-nums">
                {format(date, 'd', { locale })}
              </span>
              <span
                className={`text-[10px] font-medium leading-none ${
                  isSelected ? 'text-white/85' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {format(date, 'MMM', { locale })}
              </span>
            </button>
          );
        })}

        {!hideCalendar ? (
          <button
            data-selected={showCalendarAsSelected || undefined}
            onClick={onCalendarClick}
            className={`flex-shrink-0 flex flex-col items-center justify-center gap-1 px-2.5 py-2 rounded-xl min-w-[64px] border transition-all duration-150 active:scale-[0.96] ${
              showCalendarAsSelected
                ? 'bg-primary-500 border-primary-500 text-white shadow-md shadow-primary-500/25'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400'
            }`}
          >
            <Calendar size={20} />
            {showCalendarAsSelected ? (
              <span className="text-[10px] font-semibold text-center leading-tight">{format(selectedDate, dateFormat, { locale })}</span>
            ) : (
              <span className="text-[10px] font-medium text-center leading-tight">{t('createGame.selectFromCalendar')}</span>
            )}
          </button>
        ) : null}
      </div>

      <button
        onClick={handleNext}
        className="absolute right-0 z-10 p-2 rounded-full bg-white dark:bg-gray-900 shadow-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <ChevronRight size={20} className="text-gray-700 dark:text-gray-300" />
      </button>
    </div>
  );
};

