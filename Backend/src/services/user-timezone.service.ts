import { format, Locale } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';
import prisma from '../config/database';
import { DEFAULT_TIMEZONE } from '../utils/constants';
import { getDateLabel as baseGetDateLabel } from '../utils/translations';

const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru,
  sr: sr,
  es: es,
};

export async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentCity: {
        select: {
          timezone: true,
        },
      },
    },
  });

  return user?.currentCity?.timezone || DEFAULT_TIMEZONE;
}

export async function getUserTimezoneFromCityId(cityId: string | null): Promise<string> {
  if (!cityId) {
    return DEFAULT_TIMEZONE;
  }

  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: {
      timezone: true,
    },
  });

  return city?.timezone || DEFAULT_TIMEZONE;
}

export function convertToUserTimezone(date: Date | string, timezone: string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, timezone);
}

export async function formatDateInUserTimezone(
  date: Date | string,
  formatStr: string,
  userId: string,
  lang: string = 'en'
): Promise<string> {
  const timezone = await getUserTimezone(userId);
  const zonedDate = convertToUserTimezone(date, timezone);
  const locale = localeMap[lang] || enUS;
  return format(zonedDate, formatStr, { locale });
}

export async function formatDateInTimezone(
  date: Date | string,
  formatStr: string,
  timezone: string,
  lang: string = 'en'
): Promise<string> {
  const zonedDate = convertToUserTimezone(date, timezone);
  const locale = localeMap[lang] || enUS;
  return format(zonedDate, formatStr, { locale });
}

export async function getDateLabelInUserTimezone(
  date: Date | string,
  userId: string,
  lang: string = 'en',
  includeComma: boolean = true
): Promise<string> {
  const timezone = await getUserTimezone(userId);
  const zonedDate = convertToUserTimezone(date, timezone);
  return baseGetDateLabel(zonedDate, lang, includeComma);
}

export async function getDateLabelInTimezone(
  date: Date | string,
  timezone: string,
  lang: string = 'en',
  includeComma: boolean = true
): Promise<string> {
  const zonedDate = convertToUserTimezone(date, timezone);
  return baseGetDateLabel(zonedDate, lang, includeComma);
}

