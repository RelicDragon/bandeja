import type { WeeklyAvailability, WeekdayKey } from '@/types';

export const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAYS_ISO_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAYS_SUNDAY_FIRST: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEKEND_DAYS: WeekdayKey[] = ['sat', 'sun'];
export const WORKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const DAY_FULL = 0xffffff;
export const DAY_EMPTY = 0;

export const getHour = (mask: number, hour: number): boolean =>
  ((mask >>> hour) & 1) === 1;

export const setHour = (mask: number, hour: number, on: boolean): number =>
  on ? (mask | (1 << hour)) >>> 0 : (mask & ~(1 << hour)) >>> 0;

export const rangeMask = (startHour: number, endHourExclusive: number): number => {
  let m = 0;
  const start = Math.max(0, Math.min(24, startHour));
  const end = Math.max(0, Math.min(24, endHourExclusive));
  for (let h = start; h < end; h++) m = (m | (1 << h)) >>> 0;
  return m;
};

export const countHours = (mask: number): number => {
  let n = 0;
  let m = mask >>> 0;
  while (m) {
    n += m & 1;
    m >>>= 1;
  }
  return n;
};

export const dayIsFull = (mask: number): boolean => mask === DAY_FULL;
export const dayIsEmpty = (mask: number): boolean => mask === DAY_EMPTY;

export const fullWeek = (): WeeklyAvailability => ({
  mon: DAY_FULL, tue: DAY_FULL, wed: DAY_FULL, thu: DAY_FULL,
  fri: DAY_FULL, sat: DAY_FULL, sun: DAY_FULL, v: 1,
});

export const emptyWeek = (): WeeklyAvailability => ({
  mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0, v: 1,
});

export const isFullWeek = (wa: WeeklyAvailability | null | undefined): boolean => {
  if (!wa) return true;
  return WEEKDAYS.every((d) => wa[d] === DAY_FULL);
};

export const isEmptyWeek = (wa: WeeklyAvailability | null | undefined): boolean => {
  if (!wa) return false;
  return WEEKDAYS.every((d) => wa[d] === 0);
};

export const ensureWeek = (wa: WeeklyAvailability | null | undefined): WeeklyAvailability =>
  wa ? { ...wa, v: 1 } : fullWeek();

export const setDay = (
  wa: WeeklyAvailability,
  day: WeekdayKey,
  mask: number
): WeeklyAvailability => ({ ...wa, [day]: mask >>> 0 });

export const toggleHourInWeek = (
  wa: WeeklyAvailability,
  day: WeekdayKey,
  hour: number
): WeeklyAvailability => setDay(wa, day, setHour(wa[day], hour, !getHour(wa[day], hour)));

export const setHourInWeek = (
  wa: WeeklyAvailability,
  day: WeekdayKey,
  hour: number,
  on: boolean
): WeeklyAvailability => setDay(wa, day, setHour(wa[day], hour, on));

export const setDayFull = (wa: WeeklyAvailability, day: WeekdayKey, on: boolean): WeeklyAvailability =>
  setDay(wa, day, on ? DAY_FULL : DAY_EMPTY);

export const toggleDayColumn = (wa: WeeklyAvailability, day: WeekdayKey): WeeklyAvailability => {
  const current = wa[day];
  if (current === DAY_FULL) return setDay(wa, day, DAY_EMPTY);
  return setDay(wa, day, DAY_FULL);
};

export const toggleHourRow = (wa: WeeklyAvailability, hour: number): WeeklyAvailability => {
  const allOn = WEEKDAYS.every((d) => getHour(wa[d], hour));
  const next: WeeklyAvailability = { ...wa };
  for (const d of WEEKDAYS) next[d] = setHour(next[d], hour, !allOn);
  return next;
};

export const copyDay = (
  wa: WeeklyAvailability,
  from: WeekdayKey,
  to: WeekdayKey[]
): WeeklyAvailability => {
  const src = wa[from];
  const next: WeeklyAvailability = { ...wa };
  for (const d of to) if (d !== from) next[d] = src;
  return next;
};

export const areEqual = (
  a: WeeklyAvailability | null | undefined,
  b: WeeklyAvailability | null | undefined
): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return WEEKDAYS.every((d) => a[d] === b[d]);
};
