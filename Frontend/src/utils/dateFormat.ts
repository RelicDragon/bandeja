import { format as dateFnsFormat, formatDistanceToNow, isToday, isYesterday, differenceInHours, differenceInDays, Locale } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';
import i18n from '@/i18n/config';

const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru,
  sr: sr,
  es: es,
};

export const formatDate = (date: Date | string, formatStr: string): string => {
  const currentLocale = localeMap[i18n.language] || enUS;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formatStr, { locale: currentLocale });
};

export const formatRelativeTime = (date: Date | string): string => {
  const currentLocale = localeMap[i18n.language] || enUS;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return formatDistanceToNow(dateObj, { 
    addSuffix: true, 
    locale: currentLocale 
  });
};

export const formatSmartRelativeTime = (date: Date | string, t?: (key: string) => string): string => {
  const currentLocale = localeMap[i18n.language] || enUS;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  
  const hoursDiff = differenceInHours(now, dateObj);
  const daysDiff = differenceInDays(now, dateObj);
  
  // For very recent times (less than 24 hours), use relative format
  if (hoursDiff < 24 && hoursDiff >= 0) {
    return formatDistanceToNow(dateObj, { 
      addSuffix: true, 
      locale: currentLocale 
    });
  }
  
  // For yesterday, show "yesterday at HH:mm"
  if (isYesterday(dateObj)) {
    const timeStr = dateFnsFormat(dateObj, 'HH:mm', { locale: currentLocale });
    const yesterdayText = t ? t('createGame.yesterday') : 'Yesterday';
    return `${yesterdayText} at ${timeStr}`;
  }
  
  // For today (but more than 24 hours ago somehow), just show time
  if (isToday(dateObj)) {
    return dateFnsFormat(dateObj, 'HH:mm', { locale: currentLocale });
  }
  
  // For dates within a week, show day and time
  if (daysDiff < 7 && daysDiff > 0) {
    return dateFnsFormat(dateObj, 'EEEE, HH:mm', { locale: currentLocale });
  }
  
  // For older dates, show date and time
  return dateFnsFormat(dateObj, 'PPp', { locale: currentLocale });
};

