import { clubLocalMinutes, isClubTime, timeToMinutes } from '@shared/clubAdmin/clubTime';

/**
 * Is the club open at `now`, judged on the **club** wall clock? `close <= open` runs past
 * midnight (08:00–01:00). `null` when hours are unknown.
 */
export function isClubOpenAt(
  open: string | null | undefined,
  close: string | null | undefined,
  timeZone: string,
  now: Date = new Date()
): boolean | null {
  if (!isClubTime(open) || !isClubTime(close)) return null;
  const o = timeToMinutes(open);
  const c = timeToMinutes(close);
  const m = clubLocalMinutes(now, timeZone);
  if (o === c) return true;
  if (c > o) return m >= o && m < c;
  return m >= o || m < c;
}
