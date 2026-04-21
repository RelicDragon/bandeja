import type { BasicUser, WeeklyAvailability, WeekdayKey } from '@/types';

export type GameAvailabilityMatch = 'full' | 'partial' | 'none';

export type GameSlots = Partial<Record<WeekdayKey, number>>;

const WEEKDAY_BY_INTL: Record<string, WeekdayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

interface GameTimingParts {
  weekday: WeekdayKey;
  hour: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getPartsFormatter = (timeZone?: string): Intl.DateTimeFormat => {
  const key = timeZone ?? 'local';
  const cached = partsFormatterCache.get(key);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });
  partsFormatterCache.set(key, fmt);
  return fmt;
};

const toParts = (date: Date, timeZone?: string): GameTimingParts | null => {
  const fmt = getPartsFormatter(timeZone);
  const parts = fmt.formatToParts(date);
  let weekday: WeekdayKey | null = null;
  let hour = -1;
  for (const p of parts) {
    if (p.type === 'weekday') {
      const mapped = WEEKDAY_BY_INTL[p.value];
      if (mapped) weekday = mapped;
    } else if (p.type === 'hour') {
      const h = parseInt(p.value, 10);
      if (Number.isFinite(h)) hour = h === 24 ? 0 : h;
    }
  }
  if (!weekday || hour < 0) return null;
  return { weekday, hour };
};

/** Builds the weekly bitmask of hours covered by a game's interval, in the given timezone. */
export const buildGameSlots = (
  startISO: string | Date | null | undefined,
  endISO: string | Date | null | undefined,
  timeZone?: string | null,
): GameSlots | null => {
  if (!startISO || !endISO) return null;
  const start = typeof startISO === 'string' ? new Date(startISO) : startISO;
  const end = typeof endISO === 'string' ? new Date(endISO) : endISO;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return null;

  const slots: GameSlots = {};
  const tz = timeZone || undefined;
  const MS_HOUR = 60 * 60 * 1000;

  const startHourFloor = new Date(Math.floor(start.getTime() / MS_HOUR) * MS_HOUR);
  const endHourCeil = new Date(Math.ceil(end.getTime() / MS_HOUR) * MS_HOUR);
  const maxIters = 48;

  let cursor = startHourFloor.getTime();
  const endMs = endHourCeil.getTime();
  let iters = 0;
  while (cursor < endMs && iters < maxIters) {
    const parts = toParts(new Date(cursor), tz);
    if (parts) {
      const prev = slots[parts.weekday] ?? 0;
      slots[parts.weekday] = (prev | (1 << parts.hour)) >>> 0;
    }
    cursor += MS_HOUR;
    iters++;
  }

  const hasAny = (Object.keys(slots) as WeekdayKey[]).some((k) => (slots[k] ?? 0) !== 0);
  return hasAny ? slots : null;
};

const countBits = (mask: number): number => {
  let n = 0;
  let m = mask >>> 0;
  while (m) {
    n += m & 1;
    m >>>= 1;
  }
  return n;
};

/** How well a user's weekly availability matches the needed game slots. */
export const matchUserToSlots = (
  wa: WeeklyAvailability | null | undefined,
  slots: GameSlots | null,
): GameAvailabilityMatch => {
  if (!slots) return 'full';
  if (!wa) return 'full';

  let needed = 0;
  let covered = 0;
  const days = Object.keys(slots) as WeekdayKey[];
  for (const d of days) {
    const need = (slots[d] ?? 0) >>> 0;
    if (need === 0) continue;
    const have = (wa[d] ?? 0) >>> 0;
    const overlap = (need & have) >>> 0;
    needed += countBits(need);
    covered += countBits(overlap);
  }
  if (needed === 0) return 'full';
  if (covered === 0) return 'none';
  if (covered >= needed) return 'full';
  return 'partial';
};

/** Worst-member rule: a team's match is the weakest of its accepted members. */
export const matchTeamToSlots = (
  members: BasicUser[],
  slots: GameSlots | null,
): GameAvailabilityMatch => {
  if (!slots) return 'full';
  if (!members || members.length === 0) return 'full';
  let worst: GameAvailabilityMatch = 'full';
  for (const m of members) {
    const r = matchUserToSlots(m.weeklyAvailability, slots);
    if (r === 'none') return 'none';
    if (r === 'partial') worst = 'partial';
  }
  return worst;
};
