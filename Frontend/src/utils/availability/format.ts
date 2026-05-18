import type { TFunction } from 'i18next';
import type { WeeklyAvailability, WeekdayKey } from '@/types';
import { WEEKDAYS, DAY_FULL } from './bitmask';
import { addDaysToYmd, localTodayYmd } from './rolling';

const WEEKDAY_OFFSET_MONDAY: Record<WeekdayKey, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

const WEEKDAY_OFFSET_SUNDAY: Record<WeekdayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

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

export const ymdForWeekdayInWeek = (
  weekStartYmd: string,
  day: WeekdayKey,
  weekStart: 'monday' | 'sunday'
): string => {
  const offset = weekStart === 'sunday' ? WEEKDAY_OFFSET_SUNDAY[day] : WEEKDAY_OFFSET_MONDAY[day];
  return addDaysToYmd(weekStartYmd, offset);
};

export const isWeekdayTodayInWeek = (
  day: WeekdayKey,
  weekStartYmd: string,
  weekStart: 'monday' | 'sunday',
  todayYmd: string = localTodayYmd()
): boolean => ymdForWeekdayInWeek(weekStartYmd, day, weekStart) === todayYmd;

export const isWeekdayPastInWeek = (
  day: WeekdayKey,
  weekStartYmd: string,
  weekStart: 'monday' | 'sunday',
  todayYmd: string = localTodayYmd()
): boolean => ymdForWeekdayInWeek(weekStartYmd, day, weekStart) < todayYmd;

export const getDayOfMonthInWeek = (
  weekStartYmd: string,
  day: WeekdayKey,
  weekStart: 'monday' | 'sunday'
): number => parseInt(ymdForWeekdayInWeek(weekStartYmd, day, weekStart).slice(8, 10), 10);

/** e.g. "Mon, 3" / "Пн, 3" using locale short day names from i18n. */
export const getShortDayLabelWithDate = (
  t: TFunction,
  day: WeekdayKey,
  weekStartYmd: string,
  weekStart: 'monday' | 'sunday'
): string => {
  const ymd = ymdForWeekdayInWeek(weekStartYmd, day, weekStart);
  const dayOfMonth = parseInt(ymd.slice(8, 10), 10);
  return `${getShortDayLabel(t, day)}, ${dayOfMonth}`;
};

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
