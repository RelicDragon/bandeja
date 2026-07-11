import { addDays, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { DateSelector } from '@/components';
import { CalendarComponent } from '@/components/Calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { formatSearchResultDate } from '@/utils/dateFormat';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';

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
        <LocationTimeStepHeader
          icon={CalendarDays}
          title={t('createGame.locationSteps.date')}
          done
          trailing={formatSearchResultDate(selectedDate, t)}
        />
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
      {!hideCalendar ? (
        <Dialog
          open={showDatePicker}
          onClose={onCloseDatePicker}
          modalId="create-game-date-calendar"
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createGame.selectDate')}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto px-4 py-4">
              <CalendarComponent
                selectedDate={selectedDate}
                onDateSelect={(date: Date) => {
                  onDateSelect(date);
                  onCloseDatePicker();
                }}
                minDate={startDate}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
