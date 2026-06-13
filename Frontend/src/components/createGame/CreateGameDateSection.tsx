import { addDays, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { DateSelector } from '@/components';
import { CalendarComponent } from '@/components/Calendar';

type CreateGameDateSectionProps = {
  selectedDate: Date;
  showDatePicker: boolean;
  onDateSelect: (date: Date) => void;
  onCalendarClick: () => void;
  onCloseDatePicker: () => void;
  generateTimeOptionsForDate: (date: Date) => string[];
  dateFixedDates?: Date[];
  hideCalendar?: boolean;
  bookableDaysHint?: number | null;
};

export function CreateGameDateSection({
  selectedDate,
  showDatePicker,
  onDateSelect,
  onCalendarClick,
  onCloseDatePicker,
  generateTimeOptionsForDate,
  dateFixedDates,
  hideCalendar = false,
  bookableDaysHint,
}: CreateGameDateSectionProps) {
  const { t } = useTranslation();

  const startDate =
    generateTimeOptionsForDate(new Date()).length === 0 ? addDays(new Date(), 1) : new Date();
  const defaultFixedDates = Array.from({ length: 8 }, (_, i) => addDays(startDate, i));
  const fixedDates = dateFixedDates ?? defaultFixedDates;
  const isSelectedDateInFixedRange = fixedDates.some(
    (date) => format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'),
  );

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          {t('createGame.selectDate')}
        </label>
        <DateSelector
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          onCalendarClick={onCalendarClick}
          showCalendarAsSelected={!hideCalendar && (showDatePicker || !isSelectedDateInFixedRange)}
          hideTodayIfNoSlots={!dateFixedDates}
          hasTimeSlotsForToday={generateTimeOptionsForDate(new Date()).length > 0}
          hideCurrentDateIndicator={true}
          fixedDates={dateFixedDates}
          hideCalendar={hideCalendar}
        />
        {bookableDaysHint != null && bookableDaysHint > 0 ? (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t('createGame.booktime.dateHint', { days: bookableDaysHint })}
          </p>
        ) : null}
      </div>
      {showDatePicker && !hideCalendar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseDatePicker} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
            <h3 className="section-title mb-4">{t('createGame.selectDate')}</h3>
            <CalendarComponent
              selectedDate={selectedDate}
              onDateSelect={(date: Date) => {
                onDateSelect(date);
                onCloseDatePicker();
              }}
              minDate={startDate}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
