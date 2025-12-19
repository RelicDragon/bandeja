import { Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, RefObject } from 'react';
import { addDays, format } from 'date-fns';
import { DateSelector, ToggleSwitch } from '@/components';
import { CalendarComponent } from '@/components/Calendar';
import { EntityType, Club } from '@/types';
import { getTimezoneOffsetString, isTimezoneDifferent } from '@/hooks/useGameTimeDuration';

interface GameStartSectionProps {
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  showPastTimes: boolean;
  showDatePicker: boolean;
  selectedClub: string;
  club?: Club;
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
  getDurationLabel: (dur: number) => string;
  onDateSelect: (date: Date) => void;
  onCalendarClick: () => void;
  onToggleShowPastTimes: (checked: boolean) => void;
  onCloseDatePicker: () => void;
  onTimeSelect: (time: string) => void;
  onDurationChange: (duration: number) => void;
  entityType: EntityType;
  dateInputRef: RefObject<HTMLInputElement | null>;
  compact?: boolean;
}

export const GameStartSection = ({
  selectedDate,
  selectedTime,
  duration,
  showPastTimes,
  showDatePicker,
  selectedClub,
  club,
  generateTimeOptions,
  generateTimeOptionsForDate,
  canAccommodateDuration,
  getAdjustedStartTime,
  isSlotHighlighted,
  getDurationLabel,
  onDateSelect,
  onCalendarClick,
  onToggleShowPastTimes,
  onCloseDatePicker,
  onTimeSelect,
  onDurationChange,
  entityType,
  dateInputRef,
  compact = false,
}: GameStartSectionProps) => {
  const { t } = useTranslation();
  
  const showTimezone = club && isTimezoneDifferent(club);
  const timezoneString = showTimezone ? getTimezoneOffsetString(club) : '';

  // Check if selected date is within the fixed date range (same logic as DateSelector)
  const startDate = !showPastTimes && generateTimeOptionsForDate(new Date()).length === 0 ? addDays(new Date(), 1) : new Date();
  const fixedDates = Array.from({ length: 8 }, (_, i) => addDays(startDate, i));
  const isSelectedDateInFixedRange = fixedDates.some(date =>
    format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
  );

  useEffect(() => {
    if (showDatePicker && dateInputRef.current) {
      setTimeout(() => {
        dateInputRef.current?.showPicker?.();
      }, 100);
    }
  }, [showDatePicker, dateInputRef]);

  const content = (
    <div className={compact ? "space-y-4" : "space-y-4"}>
        {!selectedClub ? (
          <div className="px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm text-center">
            {t('createGame.selectClubFirst')}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('createGame.selectDate')}
              </label>
              <DateSelector
                selectedDate={selectedDate}
                onDateSelect={onDateSelect}
                onCalendarClick={onCalendarClick}
                showCalendarAsSelected={showDatePicker || !isSelectedDateInFixedRange}
                hideTodayIfNoSlots={!showPastTimes}
                hasTimeSlotsForToday={generateTimeOptionsForDate(new Date()).length > 0}
                hideCurrentDateIndicator={true}
              />
            </div>
            {showDatePicker && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseDatePicker} />
                <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    {t('createGame.selectDate')}
                  </h3>
                  <CalendarComponent
                    selectedDate={selectedDate}
                    onDateSelect={(date: Date) => {
                      onDateSelect(date);
                      onCloseDatePicker();
                    }}
                    minDate={showPastTimes ? undefined : startDate}
                  />
                </div>
              </div>
            )}
            {entityType !== 'BAR' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  {t('createGame.duration')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 1.5, 2].map((dur) => (
                    <button
                      key={dur}
                      onClick={() => onDurationChange(dur)}
                      className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                        duration === dur
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {getDurationLabel(dur)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                {t('createGame.showPastTimes')}
              </span>
              <div className="flex-shrink-0">
                <ToggleSwitch checked={showPastTimes} onChange={onToggleShowPastTimes} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('createGame.selectTime')}
                {showTimezone && timezoneString && (
                  <span className="ml-2 text-gray-500 dark:text-gray-500 font-normal">
                    ({t('createGame.clubTime')} {timezoneString})
                  </span>
                )}
              </label>
              <div className="grid grid-cols-6 gap-1.5 p-1">
                {generateTimeOptions().map((time) => {
                  const isSelected = selectedTime === time;
                  const isHighlighted = entityType !== 'BAR' ? isSlotHighlighted(time) : false;
                  const canAccommodate = entityType !== 'BAR' ? canAccommodateDuration(time, duration) : true;
                  
                  const handleTimeClick = () => {
                    if (entityType === 'BAR') {
                      onTimeSelect(time);
                    } else if (canAccommodate) {
                      onTimeSelect(time);
                    } else {
                      const adjustedStartTime = getAdjustedStartTime(time, duration);
                      if (adjustedStartTime) {
                        onTimeSelect(adjustedStartTime);
                      }
                    }
                  };
                  
                  return (
                    <button
                      key={time}
                      onClick={handleTimeClick}
                      className={`w-full h-10 flex items-center justify-center rounded-lg font-medium text-xs transition-all ${
                        isSelected
                          ? 'bg-primary-500 text-white'
                          : isHighlighted
                          ? 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200 border border-primary-400 dark:border-primary-600'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
  );

  if (compact) {
    return content;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarIcon size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {entityType === 'TOURNAMENT' ? t('createGame.gameStartTournament') :
           entityType === 'LEAGUE' ? t('createGame.gameStartLeague') :
           t('createGame.gameStart')}
        </h2>
      </div>
      {content}
    </div>
  );
};


