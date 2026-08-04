import type { PlayIntentTimeOfDay, PoolMember } from '@/api/playIntents';

export type Mismatch = NonNullable<PoolMember['mismatch']>;

const PERIOD_I18N_KEY: Record<PlayIntentTimeOfDay, string> = {
  MORNING: 'playIntent.morning',
  AFTERNOON: 'playIntent.afternoon',
  EVENING: 'playIntent.evening',
  ANYTIME: 'playIntent.anytime',
  CUSTOM: 'playIntent.customTime',
};

const REASON_I18N_KEY: Record<Mismatch['reason'], string> = {
  time: 'playIntent.mismatchTime',
  level: 'playIntent.mismatchLevel',
  clubs: 'playIntent.mismatchClubs',
  dates: 'playIntent.mismatchDates',
  gender: 'playIntent.mismatchGender',
};

/**
 * Phrases *why* a far-field player doesn't fit the viewer's play intent, for the
 * court-lobby mismatch bubble. Time reasons is period-aware so the copy reads
 * naturally ("Plays mornings", "Custom hours", "Flexible timing"); other
 * reasons map to their own short label.
 */
export function mismatchLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  mismatch: Mismatch,
): string {
  if (mismatch.reason === 'time') {
    if (mismatch.period === 'ANYTIME' || !mismatch.period) {
      return t('playIntent.mismatchTimeAnytime', { defaultValue: 'Flexible timing' });
    }
    if (mismatch.period === 'CUSTOM') {
      return t('playIntent.mismatchTimeCustom', { defaultValue: 'Custom hours' });
    }
    const periodLabel = t(PERIOD_I18N_KEY[mismatch.period], {
      defaultValue: mismatch.period.toLowerCase(),
    });
    return t(REASON_I18N_KEY.time, {
      period: periodLabel,
      defaultValue: `Plays ${periodLabel}`,
    });
  }
  return t(REASON_I18N_KEY[mismatch.reason]);
}
