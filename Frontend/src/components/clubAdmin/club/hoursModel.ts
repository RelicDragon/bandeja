/**
 * Opening hours editor model (pure). Mirrors the server rules of `PUT /hours`: 7 weekday rows,
 * `HH:mm` times, `close <= open` runs past midnight (`00:00` close = midnight), closures one per
 * date with either no hours (closed all day) or both open and close.
 */
import type { ClubClosure, ClubWeeklyHoursDay, IsoWeekday, PutClubHoursBody } from '@shared/clubAdmin/contract';
import { isClubDate, isClubTime, timeToMinutes } from '@shared/clubAdmin/clubTime';

export const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
export const CLOSURE_NOTE_MAX = 200;

export interface ClosureDraft {
  /** Server id, or a local key for a new row. */
  key: string;
  id?: string;
  date: string;
  allDay: boolean;
  open: string;
  close: string;
  note: string;
}

export type HoursErrorCode = 'time' | 'date' | 'duplicateDate' | 'pastDate' | 'noteTooLong';

export interface HoursErrors {
  weekly: Partial<Record<IsoWeekday, HoursErrorCode>>;
  closures: Record<string, HoursErrorCode>;
}

/** The day runs past midnight: closing at or before opening (`08:00–01:00`, `08:00–00:00`, `08:00–08:00`). */
export function closesNextDay(open: string, close: string): boolean {
  if (!isClubTime(open) || !isClubTime(close)) return false;
  return timeToMinutes(close) <= timeToMinutes(open);
}

/** Always 7 rows Monday..Sunday, whatever order or gaps the server sent. */
export function normalizeWeekly(weekly: readonly ClubWeeklyHoursDay[]): ClubWeeklyHoursDay[] {
  const byDay = new Map(weekly.map((d) => [d.weekday, d]));
  return WEEKDAYS.map((weekday) => {
    const d = byDay.get(weekday);
    return d ? { ...d } : { weekday, closed: false, open: '08:00', close: '23:00' };
  });
}

export function copyMondayToAll(weekly: readonly ClubWeeklyHoursDay[]): ClubWeeklyHoursDay[] {
  const monday = weekly.find((d) => d.weekday === 1);
  if (!monday) return weekly.map((d) => ({ ...d }));
  return weekly.map((d) => ({ ...d, closed: monday.closed, open: monday.open, close: monday.close }));
}

export function closureToDraft(c: ClubClosure): ClosureDraft {
  return {
    key: c.id,
    id: c.id,
    date: c.date,
    allDay: c.open === null || c.close === null,
    open: c.open ?? '10:00',
    close: c.close ?? '18:00',
    note: c.note ?? '',
  };
}

export function validateHours(weekly: readonly ClubWeeklyHoursDay[], closures: readonly ClosureDraft[], today: string): HoursErrors {
  const errors: HoursErrors = { weekly: {}, closures: {} };
  for (const d of weekly) {
    if (!d.closed && (!isClubTime(d.open) || !isClubTime(d.close))) errors.weekly[d.weekday] = 'time';
  }
  const seen = new Set<string>();
  for (const c of closures) {
    if (!isClubDate(c.date)) errors.closures[c.key] = 'date';
    else if (c.date < today) errors.closures[c.key] = 'pastDate';
    else if (seen.has(c.date)) errors.closures[c.key] = 'duplicateDate';
    else if (!c.allDay && (!isClubTime(c.open) || !isClubTime(c.close))) errors.closures[c.key] = 'time';
    else if (c.note.length > CLOSURE_NOTE_MAX) errors.closures[c.key] = 'noteTooLong';
    if (isClubDate(c.date)) seen.add(c.date);
  }
  return errors;
}

export function hasHoursErrors(e: HoursErrors): boolean {
  return Object.keys(e.weekly).length > 0 || Object.keys(e.closures).length > 0;
}

export function buildHoursBody(weekly: readonly ClubWeeklyHoursDay[], closures: readonly ClosureDraft[]): PutClubHoursBody {
  return {
    weekly: weekly.map((d) => ({ weekday: d.weekday, closed: d.closed, open: d.open, close: d.close })),
    closures: [...closures]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        date: c.date,
        open: c.allDay ? null : c.open,
        close: c.allDay ? null : c.close,
        note: c.note.trim() || null,
      })),
  };
}
