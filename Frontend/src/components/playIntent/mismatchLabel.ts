import type { FitCheck, PlayIntentTimeOfDay, PoolMember } from '@/api/playIntents';

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

export type TimePhraseInput = {
  period?: PlayIntentTimeOfDay;
  startTime?: string | null;
  endTime?: string | null;
};

export function formatCustomHourRange(
  startTime?: string | null,
  endTime?: string | null,
): string | null {
  const range = [startTime, endTime].filter(Boolean).join('–');
  return range || null;
}

/**
 * Phrases a player's time window for the court-lobby mismatch bubble and fit
 * card. Named periods read naturally ("Plays mornings"); CUSTOM uses the
 * chosen hour range ("11:00–13:00").
 */
export function timeMismatchLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  input: TimePhraseInput,
): string {
  if (input.period === 'ANYTIME' || !input.period) {
    return t('playIntent.mismatchTimeAnytime', { defaultValue: 'Flexible timing' });
  }
  if (input.period === 'CUSTOM') {
    return (
      formatCustomHourRange(input.startTime, input.endTime) ??
      t('playIntent.mismatchTimeCustom', { defaultValue: 'Custom hours' })
    );
  }
  const periodLabel = t(PERIOD_I18N_KEY[input.period], {
    defaultValue: input.period.toLowerCase(),
  });
  return t(REASON_I18N_KEY.time, {
    period: periodLabel,
    defaultValue: `Plays ${periodLabel}`,
  });
}

export function mismatchLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  mismatch: Mismatch,
): string {
  if (mismatch.reason === 'time') {
    return timeMismatchLabel(t, mismatch);
  }
  return t(REASON_I18N_KEY[mismatch.reason]);
}

export function fitTimeSubtitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  check: FitCheck,
): string | null {
  if (check.dimension !== 'time') return null;
  return timeMismatchLabel(t, check);
}
