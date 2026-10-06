import type {
  ClubClosure,
  ClubDayHours,
  ClubHours,
  ClubWeeklyHoursDay,
  IsoWeekday,
  PutClubHoursBody,
} from '@bandeja/shared/clubAdmin/contract';
import {
  clubLocalDate,
  isClubDate,
  isClubTime,
  isoWeekdayOfDate,
  minutesToTime,
  openingWindowUtc,
  timeToMinutes,
} from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import { clubAdminValidation } from './clubAdminErrors';

/**
 * The club's day: weekly hours + dated closures, falling back to the legacy single
 * `Club.openingTime/closingTime` pair (and finally {@link DEFAULT_OPEN}–{@link DEFAULT_CLOSE}).
 * Every console surface (schedule, dashboard occupancy, reports) resolves opening windows here.
 */

export const DEFAULT_OPEN = '08:00';
export const DEFAULT_CLOSE = '23:00';
const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const MAX_CLOSURES = 366;

interface WeeklyRow {
  weekday: number;
  closed: boolean;
  openMinute: number;
  closeMinute: number;
}
interface ClosureRow {
  id: string;
  date: string;
  openMinute: number | null;
  closeMinute: number | null;
  note: string | null;
}

export interface ClubHoursSource {
  timezone: string;
  weekly: ClubWeeklyHoursDay[];
  configured: boolean;
  closuresByDate: Map<string, ClosureRow>;
}

function legacyDay(openingTime: string | null, closingTime: string | null): { open: string; close: string } {
  if (isClubTime(openingTime) && isClubTime(closingTime)) return { open: openingTime, close: closingTime };
  return { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
}

export function weeklyFromRows(
  rows: WeeklyRow[],
  legacy: { openingTime: string | null; closingTime: string | null }
): { weekly: ClubWeeklyHoursDay[]; configured: boolean } {
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  const fallback = legacyDay(legacy.openingTime, legacy.closingTime);
  return {
    configured: rows.length > 0,
    weekly: WEEKDAYS.map((weekday) => {
      const row = byDay.get(weekday);
      if (!row) return { weekday, closed: rows.length > 0, open: fallback.open, close: fallback.close };
      return { weekday, closed: row.closed, open: minutesToTime(row.openMinute), close: minutesToTime(row.closeMinute) };
    }),
  };
}

/** Hours for one club-local date, or null when closed. Pure. */
export function resolveDayHours(source: ClubHoursSource, date: string): ClubDayHours | null {
  const closure = source.closuresByDate.get(date);
  let open: string;
  let close: string;
  if (closure) {
    if (closure.openMinute == null || closure.closeMinute == null) return null;
    open = minutesToTime(closure.openMinute);
    close = minutesToTime(closure.closeMinute);
  } else {
    const day = source.weekly[isoWeekdayOfDate(date) - 1];
    if (!day || day.closed) return null;
    open = day.open;
    close = day.close;
  }
  const { start, end } = openingWindowUtc(date, open, close, source.timezone);
  return { open, close, openAt: start.toISOString(), closeAt: end.toISOString() };
}

/** Loads everything needed to resolve hours for dates in [fromDate, toDate]. */
export async function loadClubHoursSource(
  clubId: string,
  timezone: string,
  range?: { fromDate: string; toDate: string }
): Promise<ClubHoursSource> {
  const [club, rows, closures] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { openingTime: true, closingTime: true } }),
    prisma.clubWeeklyHours.findMany({ where: { clubId } }),
    prisma.clubClosure.findMany({
      where: { clubId, ...(range ? { date: { gte: range.fromDate, lte: range.toDate } } : {}) },
      select: { id: true, date: true, openMinute: true, closeMinute: true, note: true },
      orderBy: { date: 'asc' },
    }),
  ]);
  const { weekly, configured } = weeklyFromRows(rows, {
    openingTime: club?.openingTime ?? null,
    closingTime: club?.closingTime ?? null,
  });
  return { timezone, weekly, configured, closuresByDate: new Map(closures.map((c) => [c.date, c])) };
}

export async function getClubHours(clubId: string, timezone: string): Promise<ClubHours> {
  const today = clubLocalDate(new Date(), timezone);
  const [club, rows, closures] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { openingTime: true, closingTime: true } }),
    prisma.clubWeeklyHours.findMany({ where: { clubId } }),
    prisma.clubClosure.findMany({ where: { clubId, date: { gte: today } }, orderBy: { date: 'asc' } }),
  ]);
  const { weekly, configured } = weeklyFromRows(rows, {
    openingTime: club?.openingTime ?? null,
    closingTime: club?.closingTime ?? null,
  });
  return { weekly, configured, closures: closures.map(closureToContract) };
}

function closureToContract(c: ClosureRow): ClubClosure {
  return {
    id: c.id,
    date: c.date,
    open: c.openMinute == null ? null : minutesToTime(c.openMinute),
    close: c.closeMinute == null ? null : minutesToTime(c.closeMinute),
    note: c.note,
  };
}

export interface ParsedHours {
  weekly: WeeklyRow[];
  closures: Array<{ date: string; openMinute: number | null; closeMinute: number | null; note: string | null }>;
}

/** Validates `PUT /hours`. Pure. */
export function parseHoursBody(raw: unknown): ParsedHours {
  const body = (raw ?? {}) as Partial<PutClubHoursBody>;
  if (!Array.isArray(body.weekly) || body.weekly.length !== 7) {
    throw clubAdminValidation('weekly', 'must have 7 days');
  }
  const seen = new Set<number>();
  const weekly: WeeklyRow[] = body.weekly.map((day, i) => {
    const field = `weekly[${i}]`;
    if (!day || typeof day !== 'object') throw clubAdminValidation(field, 'must be an object');
    const weekday = (day as ClubWeeklyHoursDay).weekday;
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || seen.has(weekday)) {
      throw clubAdminValidation(`${field}.weekday`, 'must be a unique ISO weekday 1..7');
    }
    seen.add(weekday);
    const closed = (day as ClubWeeklyHoursDay).closed;
    if (typeof closed !== 'boolean') throw clubAdminValidation(`${field}.closed`, 'must be a boolean');
    const { open, close } = day as ClubWeeklyHoursDay;
    if (!isClubTime(open)) throw clubAdminValidation(`${field}.open`, 'must be HH:mm');
    if (!isClubTime(close)) throw clubAdminValidation(`${field}.close`, 'must be HH:mm');
    return { weekday, closed, openMinute: timeToMinutes(open), closeMinute: timeToMinutes(close) };
  });

  const closuresRaw = body.closures ?? [];
  if (!Array.isArray(closuresRaw) || closuresRaw.length > MAX_CLOSURES) {
    throw clubAdminValidation('closures', `must be a list of at most ${MAX_CLOSURES}`);
  }
  const dates = new Set<string>();
  const closures = closuresRaw.map((c, i) => {
    const field = `closures[${i}]`;
    if (!c || typeof c !== 'object') throw clubAdminValidation(field, 'must be an object');
    if (!isClubDate(c.date)) throw clubAdminValidation(`${field}.date`, 'must be yyyy-MM-dd');
    if (dates.has(c.date)) throw clubAdminValidation(`${field}.date`, 'duplicate date');
    dates.add(c.date);
    const open = c.open ?? null;
    const close = c.close ?? null;
    if ((open === null) !== (close === null)) throw clubAdminValidation(field, 'open and close go together');
    if (open !== null && !isClubTime(open)) throw clubAdminValidation(`${field}.open`, 'must be HH:mm');
    if (close !== null && !isClubTime(close)) throw clubAdminValidation(`${field}.close`, 'must be HH:mm');
    if (c.note != null && (typeof c.note !== 'string' || c.note.length > 200)) {
      throw clubAdminValidation(`${field}.note`, 'must be a short string');
    }
    return {
      date: c.date,
      openMinute: open === null ? null : timeToMinutes(open),
      closeMinute: close === null ? null : timeToMinutes(close),
      note: c.note?.trim() || null,
    };
  });
  return { weekly, closures };
}

/**
 * Replace weekly hours and upcoming closures (past closures are history and stay). Legacy
 * `openingTime/closingTime` mirror the first open weekday from Monday so shipped builds keep
 * showing sensible hours.
 */
export async function putClubHours(clubId: string, timezone: string, parsed: ParsedHours): Promise<ClubHours> {
  const today = clubLocalDate(new Date(), timezone);
  const upcoming = parsed.closures.filter((c) => c.date >= today);
  const mirror = [...parsed.weekly].sort((a, b) => a.weekday - b.weekday).find((d) => !d.closed);
  await prisma.$transaction(async (tx) => {
    for (const day of parsed.weekly) {
      await tx.clubWeeklyHours.upsert({
        where: { clubId_weekday: { clubId, weekday: day.weekday } },
        create: { clubId, ...day },
        update: { closed: day.closed, openMinute: day.openMinute, closeMinute: day.closeMinute },
      });
    }
    await tx.clubClosure.deleteMany({ where: { clubId, date: { gte: today, notIn: upcoming.map((c) => c.date) } } });
    for (const c of upcoming) {
      await tx.clubClosure.upsert({
        where: { clubId_date: { clubId, date: c.date } },
        create: { clubId, ...c },
        update: { openMinute: c.openMinute, closeMinute: c.closeMinute, note: c.note },
      });
    }
    await tx.club.update({
      where: { id: clubId },
      data: mirror
        ? { openingTime: minutesToTime(mirror.openMinute), closingTime: minutesToTime(mirror.closeMinute) }
        : { openingTime: null, closingTime: null },
    });
  });
  return getClubHours(clubId, timezone);
}
