import { useMemo } from 'react';
import { format, getYear, isToday, isTomorrow, isYesterday } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getAppDateFnsLocale } from '@/utils/dateFormat';

/** Eyebrow = Today/Tomorrow/Yesterday OR weekday (never both). Title = day + month. */
export function useSelectedDateLabels(date: Date | null) {
  const { t, i18n } = useTranslation();
  const locale = useMemo(() => getAppDateFnsLocale(i18n.language), [i18n.language]);

  return useMemo(() => {
    if (!date) {
      return { weekday: null as string | null, dayMonth: null as string | null, relative: null as string | null };
    }

    const weekdayRaw = format(date, 'EEEE', { locale });
    const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);
    const dayMonthPattern = getYear(date) === getYear(new Date()) ? 'd MMMM' : 'd MMMM yyyy';
    const dayMonth = format(date, dayMonthPattern, { locale });

    let relative: string | null = null;
    if (isToday(date)) relative = t('createGame.today', { defaultValue: 'Today' });
    else if (isTomorrow(date)) relative = t('createGame.tomorrow', { defaultValue: 'Tomorrow' });
    else if (isYesterday(date)) relative = t('createGame.yesterday', { defaultValue: 'Yesterday' });

    return { weekday, dayMonth, relative };
  }, [date, locale, t]);
}
