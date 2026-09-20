import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveIntlLocale } from '@/utils/intlLocale';

/**
 * PRD 353 — every user-facing number and date in the recap.
 *
 * The stored payload has no month name and no formatted percentage on purpose,
 * so all of it is produced here through `Intl` for the active i18next locale.
 * **Never hard-code a month name.**
 */

export type RecapFormatters = {
  /** "September 2026" — the cover and the profile card. */
  monthLong: (monthStart: string) => string;
  /** "Sep" — the rail bubble label and tight card headers. */
  monthShort: (monthStart: string) => string;
  /** The month *after* the recap month, for the outro's "see you in October". */
  nextMonthLong: (monthStart: string) => string;
  number: (value: number) => string;
  /** 0–100 → "64%" in the locale's own percent shape. */
  percent: (pct: number) => string;
  /** One decimal, e.g. "4.1" / "4,1". */
  level: (value: number) => string;
  /** "3.9 → 4.1", mirrored to "4.1 ← 3.9" in RTL. */
  levelRange: (before: number, after: number) => string;
};

function monthDate(monthStart: string): Date {
  return new Date(monthStart);
}

export function useRecapFormatters(): RecapFormatters {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const isRtl = i18n.dir(locale) === 'rtl';

  return useMemo(() => {
    // Month names are script-sensitive: a bare `sr` gives Cyrillic inside a
    // Latin UI. Numbers are not, but one resolver everywhere is cheaper to keep
    // right than two rules.
    const intlLocale = resolveIntlLocale(locale);
    const longMonth = new Intl.DateTimeFormat(intlLocale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const shortMonth = new Intl.DateTimeFormat(intlLocale, { month: 'short', timeZone: 'UTC' });
    const plainNumber = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
    const percentFormat = new Intl.NumberFormat(intlLocale, {
      style: 'percent',
      maximumFractionDigits: 0,
    });
    const levelFormat = new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

    return {
      monthLong: (monthStart) => longMonth.format(monthDate(monthStart)),
      monthShort: (monthStart) => shortMonth.format(monthDate(monthStart)),
      nextMonthLong: (monthStart) => {
        const start = monthDate(monthStart);
        return longMonth.format(
          new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
        );
      },
      number: (value) => plainNumber.format(value),
      percent: (pct) => percentFormat.format(pct / 100),
      level: (value) => levelFormat.format(value),
      levelRange: (before, after) =>
        isRtl
          ? `${levelFormat.format(after)} ← ${levelFormat.format(before)}`
          : `${levelFormat.format(before)} → ${levelFormat.format(after)}`,
    };
  }, [locale, isRtl]);
}

/**
 * The 7 × N dot calendar of the games slide.
 *
 * `weekdayOffset` is Monday-based and comes from the server so the client never
 * re-derives the month's geometry (and never disagrees with it across
 * timezones). Leading blanks pad the first week; trailing blanks complete the
 * last one so the grid is always a clean rectangle.
 */
export type RecapCalendarCell = { day: number | null; played: boolean };

export function buildRecapCalendar(options: {
  daysInMonth: number;
  weekdayOffset: number;
  playedDays: number[];
}): RecapCalendarCell[] {
  const played = new Set(options.playedDays);
  const offset = ((options.weekdayOffset % 7) + 7) % 7;
  const cells: RecapCalendarCell[] = [];

  for (let i = 0; i < offset; i += 1) cells.push({ day: null, played: false });
  for (let day = 1; day <= options.daysInMonth; day += 1) {
    cells.push({ day, played: played.has(day) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, played: false });

  return cells;
}

/**
 * Sparkline path for the level slide, normalised into a 0–1 box so the SVG can
 * be any size. A flat month still draws a line (through the middle) rather than
 * collapsing to nothing.
 */
export function buildRecapSparklinePath(
  points: number[],
  width: number,
  height: number,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M0 ${height / 2} L${width} ${height / 2}`;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const stepX = width / (points.length - 1);

  return points
    .map((value, index) => {
      const x = stepX * index;
      const normalized = span === 0 ? 0.5 : (value - min) / span;
      // SVG y grows downward; a higher level must sit higher on screen.
      const y = height - normalized * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Circumference maths for the win-rate ring. */
export function recapRingDash(pct: number, radius: number): { dash: number; gap: number } {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = (circumference * clamped) / 100;
  return { dash, gap: circumference - dash };
}
