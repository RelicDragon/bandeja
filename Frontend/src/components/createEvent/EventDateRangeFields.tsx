import { CalendarRange } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/utils/createEventPayload';

const inputClass =
  'w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

type EventDateRangeFieldsProps = {
  startTime: Date;
  endTime: Date;
  onStartTimeChange: (date: Date) => void;
  onEndTimeChange: (date: Date) => void;
};

export function EventDateRangeFields({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: EventDateRangeFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarRange size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">{t('createEvent.dateRange')}</h2>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          {t('createEvent.start')}
        </label>
        <input
          type="datetime-local"
          value={toDatetimeLocalValue(startTime)}
          onChange={(e) => {
            const next = fromDatetimeLocalValue(e.target.value);
            if (next) onStartTimeChange(next);
          }}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          {t('createEvent.end')}
        </label>
        <input
          type="datetime-local"
          value={toDatetimeLocalValue(endTime)}
          onChange={(e) => {
            const next = fromDatetimeLocalValue(e.target.value);
            if (next) onEndTimeChange(next);
          }}
          className={inputClass}
        />
      </div>
    </div>
  );
}
