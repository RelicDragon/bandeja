import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Game } from '@/types';
import { CalendarComponent } from '@/components/Calendar';

interface DateSelectorWithCountProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onCalendarDateSelect: (date: Date) => void;
  onCalendarClick: () => void;
  showCalendarAsSelected?: boolean;
  availableGames: Game[];
  showDatePicker: boolean;
  onCloseDatePicker: () => void;
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

export const DateSelectorWithCount = ({
  selectedDate,
  onDateSelect,
  onCalendarDateSelect,
  onCalendarClick,
  showCalendarAsSelected,
  availableGames,
  showDatePicker,
  onCloseDatePicker,
}: DateSelectorWithCountProps) => {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtLeft, setIsAtLeft] = useState(true);

  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enUS, [i18n.language]);
  const dateFormat = useMemo(() => dateFormatMap[i18n.language] || 'MM/dd/yyyy', [i18n.language]);

  const fixedDates = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const isAtStart = scrollContainerRef.current.scrollLeft <= 10;
        setIsAtLeft(isAtStart);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll();
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

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

  const getGameCountForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return availableGames.filter(game => {
      const gameDate = format(new Date(game.startTime), 'yyyy-MM-dd');
      return gameDate === dateStr;
    }).length;
  };

  const isDateEmphasized = (date: Date) => {
    if (isToday(date)) return true;
    return format(date, 'yyyy-MM-dd') === format(fixedDates[0], 'yyyy-MM-dd');
  };

  return (
    <>
      <div className="relative flex items-center mb-4">
        {!isAtLeft && (
          <button
            onClick={handlePrevious}
            className="absolute left-0 z-10 p-2 rounded-full bg-white dark:bg-gray-900 shadow-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
        )}

        <div ref={scrollContainerRef} className={`flex gap-2 overflow-x-auto flex-1 scrollbar-hide pl-0`}>
          {fixedDates.map((date, index) => {
            const isSelected = format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
            const emphasized = isDateEmphasized(date);
            const gameCount = getGameCountForDate(date);

            return (
              <button
                key={index}
                onClick={() => onDateSelect(date)}
                className={`flex-shrink-0 px-4 py-3 rounded-lg min-w-[80px] text-center transition-all relative overflow-hidden ${
                  isSelected
                    ? 'bg-primary-500 text-white'
                    : emphasized
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-300 dark:border-primary-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border-2 border-transparent'
                }`}
              >
                {gameCount > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-red-500 dark:bg-red-600"></div>
                )}
                <div className={`relative text-xs font-medium uppercase ${emphasized && !isSelected ? 'font-bold' : ''}`}>
                  {getDateLabel(date)}
                </div>
                <div className={`relative text-2xl font-bold my-0.5`}>
                  {format(date, 'd', { locale })}
                </div>
                <div className="relative text-xs -my-2">{format(date, 'MMM', { locale })}</div>
                <div className="relative text-xs mt-4 font-semibold h-4 text-white">
                  {gameCount > 0 ? t('games.gamesCount', { count: gameCount }) : ''}
                </div>
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

      {showDatePicker && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseDatePicker} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('createGame.selectDate')}
            </h3>
            <CalendarComponent
              selectedDate={selectedDate}
              onDateSelect={(date) => {
                onCalendarDateSelect(date);
                onCloseDatePicker();
              }}
              minDate={new Date()}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
