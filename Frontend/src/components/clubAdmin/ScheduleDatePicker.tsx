import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, isToday, isTomorrow, isYesterday, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { scheduleDateToClubDate } from '@/utils/clubAdmin/scheduleTime';
import { formatDate } from '@/utils/dateFormat';

const dateFormatMap: Record<string, string> = {
  en: 'MM/dd/yyyy',
  ru: 'dd.MM.yyyy',
  es: 'dd/MM/yyyy',
  sr: 'dd.MM.yyyy',
  cs: 'dd.MM.yyyy',
};

interface ScheduleDatePickerProps {
  date: string;
  onDateChange: (date: string) => void;
}

export function ScheduleDatePicker({ date, onDateChange }: ScheduleDatePickerProps) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedDate = useMemo(() => scheduleDateToClubDate(date), [date]);

  const formattedDate = useMemo(() => {
    const fmt = dateFormatMap[i18n.language] || 'MM/dd/yyyy';
    return formatDate(selectedDate, fmt);
  }, [selectedDate, i18n.language]);

  const displayLabel = useMemo(() => {
    if (isToday(selectedDate)) return `${t('createGame.today')} (${formattedDate})`;
    if (isYesterday(selectedDate)) return `${t('createGame.yesterday')} (${formattedDate})`;
    if (isTomorrow(selectedDate)) return `${t('createGame.tomorrow')} (${formattedDate})`;
    return formattedDate;
  }, [selectedDate, formattedDate, t]);

  const goToDate = (next: Date) => {
    onDateChange(format(next, 'yyyy-MM-dd'));
  };

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <div className="flex flex-1 items-stretch gap-1">
      <button
        type="button"
        className="rounded-lg border border-border px-2 py-2 hover:bg-muted"
        onClick={() => goToDate(subDays(selectedDate, 1))}
        aria-label={t('common.previous')}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="relative flex-1 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-medium"
        onClick={openPicker}
      >
        {displayLabel}
        <input
          ref={inputRef}
          type="date"
          className="sr-only"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          tabIndex={-1}
        />
      </button>
      <button
        type="button"
        className="rounded-lg border border-border px-2 py-2 hover:bg-muted"
        onClick={() => goToDate(addDays(selectedDate, 1))}
        aria-label={t('common.next')}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
