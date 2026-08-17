import type { TFunction } from 'i18next';
import type { SharedPlayIntent } from '@/api/playIntents';
import { formatPlayIntentHourRange } from '@/utils/playIntentWindow';

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function sharedIntentDays(
  intent: SharedPlayIntent,
  todayKey: string,
  t: TFunction,
): string {
  return intent.dateKeys
    .map((dateKey) => {
      if (dateKey === todayKey) return t('playIntent.today');
      if (dateKey === addDays(todayKey, 1)) return t('playIntent.tomorrow');
      if (dateKey === addDays(todayKey, 2)) return t('playIntent.dayAfter');
      return dateKey;
    })
    .join(', ');
}

export function sharedIntentTime(intent: SharedPlayIntent, t: TFunction): string {
  if (intent.timeOfDay === 'CUSTOM') {
    return formatPlayIntentHourRange(intent.startTime, intent.endTime) ?? '';
  }
  return t(`playIntent.${intent.timeOfDay.toLowerCase()}`);
}
