import { format as dateFnsFormat, formatDistanceToNow, Locale } from 'date-fns';
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

