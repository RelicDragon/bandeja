import { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface DateSelectorProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onCalendarClick: () => void;
  showCalendarAsSelected?: boolean;
  hideTodayIfNoSlots?: boolean;
  hasTimeSlotsForToday?: boolean;
}

const localeMap = {
  en: enUS,
  ru: ru,
  es: es,
  sr: sr,
};

const dateFormatMap: Record<string, string> = {
  en: 'MM/dd/yyyy',
  ru: 'dd.MM.yyyy',
  es: 'dd/MM/yyyy',
  sr: 'dd.MM.yyyy',
};

export const DateSelector = ({ selectedDate, onDateSelect, onCalendarClick, showCalendarAsSelected, hideTodayIfNoSlots = false, hasTimeSlotsForToday = true }: DateSelectorProps) => {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enUS, [i18n.language]);
  const dateFormat = useMemo(() => dateFormatMap[i18n.language] || 'MM/dd/yyyy', [i18n.language]);
  
  // Generate fixed dates: today (if available), tomorrow, and 6 next days
  const startDate = hideTodayIfNoSlots && !hasTimeSlotsForToday ? addDays(new Date(), 1) : new Date();
  const fixedDates = Array.from({ length: 8 }, (_, i) => addDays(startDate, i));

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
    return format(date, 'EEE', { locale });
  };

  const isDateEmphasized = (date: Date) => {
    // Emphasize today if it's available, otherwise emphasize the first date
    if (isToday(date) && hasTimeSlotsForToday && !hideTodayIfNoSlots) {
      return true;
    }
    // If today is not available, emphasize the first date (tomorrow)
    return format(date, 'yyyy-MM-dd') === format(fixedDates[0], 'yyyy-MM-dd');
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={handlePrevious}
        className="absolute left-0 z-10 p-2 rounded-full bg-white dark:bg-gray-900 shadow-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
      </button>

      <div ref={scrollContainerRef} className="flex gap-2 overflow-x-auto flex-1 scrollbar-hide px-12">
        {fixedDates.map((date, index) => {
          const isSelected = format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
          const emphasized = isDateEmphasized(date);
          
          return (
            <button
              key={index}
              onClick={() => onDateSelect(date)}
              className={`flex-shrink-0 px-4 py-3 rounded-lg min-w-[80px] text-center transition-all ${
                isSelected
                  ? 'bg-primary-500 text-white'
                  : emphasized
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-300 dark:border-primary-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border-2 border-transparent'
              }`}
            >
              <div className={`text-xs font-medium uppercase ${emphasized && !isSelected ? 'font-bold' : ''}`}>
                {getDateLabel(date)}
              </div>
              <div className={`text-2xl font-bold my-1`}>
                {format(date, 'd', { locale })}
              </div>
              <div className="text-xs">{format(date, 'MMM', { locale })}</div>
            </button>
          );
        })}
        
        <button
          onClick={onCalendarClick}
          className={`flex-shrink-0 px-4 py-3 rounded-lg min-w-[80px] flex flex-col items-center justify-center transition-all ${
            showCalendarAsSelected
              ? 'bg-primary-500 text-white border-2 border-transparent'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600'
          }`}
        >
          <Calendar size={24} className="mb-1" />
          {showCalendarAsSelected ? (
            <div className="text-xs font-medium text-center leading-tight">{format(selectedDate, dateFormat, { locale })}</div>
          ) : (
            <div className="text-xs font-medium text-center leading-tight">{t('createGame.selectFromCalendar')}</div>
          )}
        </button>
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

