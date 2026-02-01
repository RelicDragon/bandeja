import { format, Locale } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';
import prisma from '../config/database';
import { DEFAULT_TIMEZONE } from '../utils/constants';
import { getDateLabel as baseGetDateLabel } from '../utils/translations';
import { TtlCache } from '../utils/ttlCache';

const TIMEZONE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SHORT_DAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const timezoneCache = new TtlCache<string, string>(TIMEZONE_CACHE_TTL_MS);
const shortDayCache = new TtlCache<string, string>(SHORT_DAY_CACHE_TTL_MS);

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
  const key = cityId ?? '__null__';
  const cached = timezoneCache.get(key);
  if (cached !== undefined) return cached;

  if (!cityId) {
    timezoneCache.set(key, DEFAULT_TIMEZONE);
    return DEFAULT_TIMEZONE;
  }

  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: { timezone: true },
  });
  const timezone = city?.timezone || DEFAULT_TIMEZONE;
  timezoneCache.set(key, timezone);
  return timezone;
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

function getShortDayCacheKey(date: Date | string, timezone: string, lang: string): string {
  const zonedDate = convertToUserTimezone(date, timezone);
  const dateKey = format(zonedDate, 'yyyy-MM-dd');
  return `${timezone}:${lang}:${dateKey}`;
}

export async function getShortDayOfWeek(
  date: Date | string,
  timezone: string,
  lang: string = 'en'
): Promise<string> {
  const cacheKey = getShortDayCacheKey(date, timezone, lang);
  const cached = shortDayCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const formatted = await formatDateInTimezone(date, 'EE', timezone, lang);
  const value = formatted.slice(0, 2);
  shortDayCache.set(cacheKey, value);
  return value;
}

export async function getShortDayOfWeekForUser(
  date: Date | string,
  cityId: string | null,
  lang: string = 'en'
): Promise<string> {
  const timezone = await getUserTimezoneFromCityId(cityId);
  return getShortDayOfWeek(date, timezone, lang);
}

export async function getTimezonesByCityIds(cityIds: (string | null)[]): Promise<Map<string | null, string>> {
  const unique = [...new Set(cityIds)];
  const map = new Map<string | null, string>();
  map.set(null, DEFAULT_TIMEZONE);
  const toFetch: string[] = [];
  for (const id of unique) {
    if (id == null) continue;
    const cached = timezoneCache.get(id);
    if (cached !== undefined) map.set(id, cached);
    else toFetch.push(id);
  }
  if (toFetch.length > 0) {
    const cities = await prisma.city.findMany({
      where: { id: { in: toFetch } },
      select: { id: true, timezone: true },
    });
    for (const c of cities) {
      const tz = c.timezone || DEFAULT_TIMEZONE;
      map.set(c.id, tz);
      timezoneCache.set(c.id, tz);
    }
    for (const id of toFetch) {
      if (!map.has(id)) {
        map.set(id, DEFAULT_TIMEZONE);
        timezoneCache.set(id, DEFAULT_TIMEZONE);
      }
    }
  }
  return map;
}

