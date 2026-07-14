import { format, addDays, startOfDay } from 'date-fns';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve Find calendar day from `date=YYYY-MM-DD` or `dayOffset=N` (0=today). */
export function resolveFindDayKey(
  params: { date?: string | null; dayOffset?: string | null },
  reference: Date = new Date(),
): string | null {
  const date = params.date?.trim();
  if (date && DATE_KEY_RE.test(date)) {
    return date;
  }
  const offsetRaw = params.dayOffset?.trim();
  if (offsetRaw == null || offsetRaw === '') {
    return null;
  }
  const offset = Number(offsetRaw);
  if (!Number.isFinite(offset)) {
    return null;
  }
  return format(addDays(startOfDay(reference), Math.trunc(offset)), 'yyyy-MM-dd');
}
