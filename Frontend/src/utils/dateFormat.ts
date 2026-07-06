import { format as dateFnsFormat, formatDistanceToNow, isToday, isTomorrow, isYesterday, differenceInHours, differenceInDays, getYear, isValid, Locale } from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';
import { cs } from 'date-fns/locale/cs';
import i18n from '@/i18n/config';
import { extractLanguageCode, resolveAppLocale } from '@/utils/displayPreferences';

const localeMap: Record<string, Locale> = {
  en: enGB,
  ru: ru,
  sr: sr,
  es: es,
  cs: cs,
};

export function getAppDateFnsLocale(lang?: string): Locale {
  const code = extractLanguageCode(lang ?? i18n.language);
  return localeMap[code] ?? enGB;
}

export const formatDate = (date: Date | string, formatStr: string): string => {
  const currentLocale = localeMap[extractLanguageCode(i18n.language)] || enGB;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formatStr, { locale: currentLocale });
};

/** Short month for calendar nav (e.g. "Jun", "Май"; adds year when not current). */
export function formatCompactMonthHeader(date: Date | string, languageOrLocale?: string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const locale = getAppDateFnsLocale(languageOrLocale);
  const pattern = getYear(dateObj) === getYear(new Date()) ? 'LLL' : 'LLL yy';
  return dateFnsFormat(dateObj, pattern, { locale });
}

/** Locale-aware short weekday (2–3 letters, e.g. ru "пн", en "Mon"). */
export function formatShortWeekday(date: Date | string, languageOrLocale?: string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const intlLocale = resolveAppLocale(languageOrLocale ?? i18n.language);
  return new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(dateObj);
}

/** Compact relative time for social feeds (e.g. 5m, 15h, 3d). */
export const formatShortRelativeTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - dateObj.getTime()) / 1000);
  if (seconds < 60) return i18n.t('common.now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${i18n.t('common.m')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${i18n.t('common.h')}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${i18n.t('common.d')}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}${i18n.t('common.w')}`;
  const years = Math.floor(days / 365);
  return years < 1 ? `52${i18n.t('common.w')}` : `${years}${i18n.t('common.y')}`;
};

export const formatRelativeTime = (date: Date | string): string => {
  const currentLocale = localeMap[extractLanguageCode(i18n.language)] || enGB;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return formatDistanceToNow(dateObj, { 
    addSuffix: true, 
    locale: currentLocale 
  });
};

/** Like formatRelativeTime but returns empty string for invalid dates (avoids render crashes). */
export function formatRelativeTimeSafe(date: Date | string | null | undefined): string {
  if (date == null) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(dateObj)) return '';
  return formatRelativeTime(dateObj);
}

/** Search result timestamps: today/yesterday/tomorrow labels, else short weekday + short date (like GameCard). */
export function formatSearchResultDate(date: Date | string, t: (key: string) => string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isToday(dateObj)) return t('createGame.today');
  if (isTomorrow(dateObj)) return t('createGame.tomorrow');
  if (isYesterday(dateObj)) return t('createGame.yesterday');
  const intlLocale = resolveAppLocale(i18n.language);
  const sameYear = getYear(dateObj) === getYear(new Date());
  return new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(dateObj);
}

export const formatSmartRelativeTime = (date: Date | string, t?: (key: string) => string): string => {
  const currentLocale = localeMap[extractLanguageCode(i18n.language)] || enGB;
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

export const formatChatTime = (
  date: Date | string,
  locale: string,
  hour12: boolean
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const daysDiff = differenceInDays(now, dateObj);
  
  if (isToday(dateObj)) {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: hour12,
    }).format(dateObj);
  }
  
  if (daysDiff < 7 && daysDiff > 0) {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
    }).format(dateObj);
  }
  
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dateObj);
};
