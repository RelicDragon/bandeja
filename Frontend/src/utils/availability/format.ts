import type { TFunction } from 'i18next';
import type { WeeklyAvailability, WeekdayKey } from '@/types';
import { WEEKDAYS, DAY_FULL } from './bitmask';

export interface HourRange {
  start: number;
  end: number;
}

export const maskToRanges = (mask: number): HourRange[] => {
  const ranges: HourRange[] = [];
  let start: number | null = null;
  for (let h = 0; h < 24; h++) {
    const on = ((mask >>> h) & 1) === 1;
    if (on && start === null) start = h;
    if (!on && start !== null) {
      ranges.push({ start, end: h });
      start = null;
    }
  }
  if (start !== null) ranges.push({ start, end: 24 });
  return ranges;
};

export const formatHour = (hour: number, timeFormat: 'auto' | '12h' | '24h' | undefined): string => {
  const h = hour === 24 ? 0 : hour;
  const effective = timeFormat ?? 'auto';
  const use12 =
    effective === '12h' ||
    (effective === 'auto' &&
      typeof navigator !== 'undefined' &&
      new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' })
        .resolvedOptions()
        .hour12 === true);
  if (use12) {
    const am = h < 12;
    const disp = h % 12 === 0 ? 12 : h % 12;
    return `${disp}${am ? 'am' : 'pm'}`;
  }
  return `${String(h).padStart(2, '0')}:00`;
};

export const formatRange = (
  r: HourRange,
  timeFormat: 'auto' | '12h' | '24h' | undefined
): string => `${formatHour(r.start, timeFormat)}–${formatHour(r.end, timeFormat)}`;

const shortDayKey: Record<WeekdayKey, string> = {
  mon: 'profile.availability.days.monShort',
  tue: 'profile.availability.days.tueShort',
  wed: 'profile.availability.days.wedShort',
  thu: 'profile.availability.days.thuShort',
  fri: 'profile.availability.days.friShort',
  sat: 'profile.availability.days.satShort',
  sun: 'profile.availability.days.sunShort',
};

export const getShortDayLabel = (t: TFunction, day: WeekdayKey): string =>
  t(shortDayKey[day]);

const orderFor = (weekStart: 'auto' | 'monday' | 'sunday' | undefined): WeekdayKey[] => {
  const s = weekStart ?? 'auto';
  if (s === 'sunday') return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
};

export interface WeeklySummaryLine {
  unavailable: boolean;
  /** Entire calendar day(s) in this row are available (24h each). */
  allDayAvailable: boolean;
  text: string;
}

export const summarizeWeek = (
  t: TFunction,
  wa: WeeklyAvailability | null | undefined,
  opts: {
    timeFormat?: 'auto' | '12h' | '24h';
    weekStart?: 'auto' | 'monday' | 'sunday';
  } = {}
): WeeklySummaryLine[] => {
  if (!wa)
    return [{ unavailable: false, allDayAvailable: true, text: t('profile.availability.alwaysAvailable') }];
  const allFull = WEEKDAYS.every((d) => wa[d] === DAY_FULL);
  if (allFull)
    return [{ unavailable: false, allDayAvailable: true, text: t('profile.availability.alwaysAvailable') }];
  const allEmpty = WEEKDAYS.every((d) => wa[d] === 0);
  if (allEmpty) return [{ unavailable: true, allDayAvailable: false, text: t('profile.availability.neverAvailable') }];

  const order = orderFor(opts.weekStart);
  const lines: WeeklySummaryLine[] = [];
  let i = 0;
  while (i < order.length) {
    const day = order[i];
    const mask = wa[day];
    let j = i;
    while (j + 1 < order.length && wa[order[j + 1]] === mask) j++;
    const daysLabel =
      i === j
        ? getShortDayLabel(t, day)
        : `${getShortDayLabel(t, order[i])}–${getShortDayLabel(t, order[j])}`;
    if (mask === 0) {
      lines.push({
        unavailable: true,
        allDayAvailable: false,
        text: t('profile.availability.summary.off', { days: daysLabel }),
      });
    } else if (mask === DAY_FULL) {
      lines.push({
        unavailable: false,
        allDayAvailable: true,
        text: t('profile.availability.summary.allDay', { days: daysLabel }),
      });
    } else {
      const ranges = maskToRanges(mask).map((r) => formatRange(r, opts.timeFormat)).join(', ');
      lines.push({
        unavailable: false,
        allDayAvailable: false,
        text: `${daysLabel} ${ranges}`,
      });
    }
    i = j + 1;
  }
  return lines;
};
