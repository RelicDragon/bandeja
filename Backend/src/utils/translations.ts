import { format, Locale } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';

const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru,
  sr: sr,
  es: es,
};

const translations: Record<string, Record<string, string>> = {
  en: {
    'createGame.today': 'Today',
    'createGame.tomorrow': 'Tomorrow',
    'createGame.yesterday': 'Yesterday',
    'common.h': 'h',
    'common.m': 'm',
  },
  ru: {
    'createGame.today': 'Сегодня',
    'createGame.tomorrow': 'Завтра',
    'createGame.yesterday': 'Вчера',
    'common.h': 'ч',
    'common.m': 'м',
  },
  sr: {
    'createGame.today': 'Данас',
    'createGame.tomorrow': 'Сутра',
    'createGame.yesterday': 'Јуче',
    'common.h': 'ч',
    'common.m': 'м',
  },
  es: {
    'createGame.today': 'Hoy',
    'createGame.tomorrow': 'Mañana',
    'createGame.yesterday': 'Ayer',
    'common.h': 'h',
    'common.m': 'm',
  },
};

export const t = (key: string, lang: string = 'en'): string => {
  return translations[lang]?.[key] || translations.en[key] || key;
};

export const formatDate = (date: Date | string, formatStr: string, lang: string = 'en'): string => {
  const locale = localeMap[lang] || enUS;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr, { locale });
};

export const getDateLabel = (date: Date | string, lang: string = 'en', includeComma: boolean = true): string => {
  const gameDate = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const gameDateOnly = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (gameDateOnly.getTime() === todayOnly.getTime()) {
    return t('createGame.today', lang);
  } else if (gameDateOnly.getTime() === tomorrowOnly.getTime()) {
    return t('createGame.tomorrow', lang);
  } else if (gameDateOnly.getTime() === yesterdayOnly.getTime()) {
    return t('createGame.yesterday', lang);
  } else {
    return formatDate(gameDate, 'MMM d', lang) + (includeComma ? ',' : '');
  }
};

