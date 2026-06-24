import type { TFunction } from 'i18next';

export function formatGameDurationLabel(dur: number, t: TFunction): string {
  const whole = Math.floor(dur);
  const fraction = dur - whole;

  if (fraction === 0) {
    return t('createGame.durationHours', { count: whole });
  }

  if (fraction === 0.5) {
    return t('createGame.durationHoursAndHalf', { hours: whole });
  }

  const minutes = Math.round(fraction * 60);
  return t('createGame.durationHoursMinutes', { hours: whole, minutes });
}
