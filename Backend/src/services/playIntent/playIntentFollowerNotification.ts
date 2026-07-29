import { PlayIntentTimeOfDay, Sport } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { getSportConfig } from '../../sport/sportRegistry';
import { t } from '../../utils/translations';

type PlayIntentFollowerNotificationInput = {
  creatorFirstName: string | null;
  sport: Sport;
  cityName: string;
  timezone: string;
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  startTime: string | null;
  endTime: string | null;
};

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function dateLabel(dateKey: string, todayKey: string, lang: string): string {
  if (dateKey === todayKey) return t('playIntent.today', lang);
  if (dateKey === addDays(todayKey, 1)) return t('playIntent.tomorrow', lang);
  if (dateKey === addDays(todayKey, 2)) return t('playIntent.dayAfter', lang);
  return dateKey;
}

function timeLabel(
  timeOfDay: PlayIntentTimeOfDay,
  startTime: string | null,
  endTime: string | null,
  lang: string,
): string {
  if (timeOfDay === PlayIntentTimeOfDay.CUSTOM) {
    return [startTime, endTime].filter(Boolean).join('–');
  }
  return t(`playIntent.${timeOfDay.toLowerCase()}`, lang);
}

export function buildPlayIntentFollowerNotification(
  input: PlayIntentFollowerNotificationInput,
  lang: string,
  now = new Date(),
): { title: string; body: string } {
  const todayKey = formatInTimeZone(now, input.timezone, 'yyyy-MM-dd');
  const days = input.dateKeys.map((key) => dateLabel(key, todayKey, lang)).join(', ');
  const when = [days, timeLabel(input.timeOfDay, input.startTime, input.endTime, lang)]
    .filter(Boolean)
    .join(' · ');
  const titleKey = input.creatorFirstName
    ? 'playIntent.followerTitle'
    : 'playIntent.followerFallbackTitle';
  const title = interpolate(t(titleKey, lang), {
    name: input.creatorFirstName ?? '',
  });
  const body = interpolate(t('playIntent.followerBody', lang), {
    sport: t(getSportConfig(input.sport).labelKey, lang),
    when,
    city: input.cityName,
  });

  return { title, body };
}
