import { useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './Calendar.css';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface CalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  minDate?: Date;
}

const localeMap = {
  en: enUS,
  ru: ru,
  es: es,
  sr: sr,
};

export const CalendarComponent = ({ selectedDate, onDateSelect, minDate }: CalendarProps) => {
  const { i18n } = useTranslation();

  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enUS, [i18n.language]);

  const handleDateChange = (value: any) => {
    if (value instanceof Date) {
      onDateSelect(value);
    }
  };

  return (
    <div>
      <Calendar
        value={selectedDate}
        onChange={handleDateChange}
        minDate={minDate}
        locale={locale.code}
      />
    </div>
  );
};
