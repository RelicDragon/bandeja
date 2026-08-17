import type { FitCheck, PlayIntentTimeOfDay, PoolMember } from '@/api/playIntents';
import { formatPlayIntentHourRange } from '@/utils/playIntentWindow';

export type Mismatch = NonNullable<PoolMember['mismatch']>;

const NAMED_PERIOD_I18N_KEY: Record<
  Exclude<PlayIntentTimeOfDay, 'ANYTIME' | 'CUSTOM'>,
  string
> = {
  MORNING: 'playIntent.morning',
  AFTERNOON: 'playIntent.afternoon',
  EVENING: 'playIntent.evening',
};

const REASON_I18N_KEY: Record<Mismatch['reason'], string> = {
  time: 'playIntent.mismatchTime',
  level: 'playIntent.mismatchLevel',
  clubs: 'playIntent.mismatchClubs',
  dates: 'playIntent.mismatchDates',
  gender: 'playIntent.mismatchGender',
};

type TimePhraseInput = {
  period?: PlayIntentTimeOfDay;
  startTime?: string | null;
  endTime?: string | null;
};

function timeMismatchLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  input: TimePhraseInput,
): string {
  if (input.period === 'ANYTIME' || !input.period) {
    return t('playIntent.mismatchTimeAnytime', { defaultValue: 'Flexible timing' });
  }
  if (input.period === 'CUSTOM') {
    return (
      formatPlayIntentHourRange(input.startTime, input.endTime) ??
      t('playIntent.mismatchTimeCustom', { defaultValue: 'Custom hours' })
    );
  }
  const periodLabel = t(NAMED_PERIOD_I18N_KEY[input.period], {
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
